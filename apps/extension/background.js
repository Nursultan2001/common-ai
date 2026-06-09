// Service worker: the extension's only channel to the backend.
// All authenticated calls go through here. The content script never holds the
// token; it asks the background worker, which attaches the bearer token.

const DEFAULTS = { backendUrl: "http://localhost:3000" };

async function getConfig() {
  const cfg = await chrome.storage.local.get(["backendUrl", "token", "applicationId"]);
  return { ...DEFAULTS, ...cfg };
}

async function api(path, { method = "GET", body } = {}) {
  const { backendUrl, token } = await getConfig();
  if (!token) throw new Error("Not signed in. Set your token in the popup.");
  const res = await fetch(`${backendUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Fetch the autofill payload + field-map template for the configured application.
async function buildBundle() {
  const { applicationId } = await getConfig();
  if (!applicationId) return { ok: false, error: "No applicationId set." };
  const profile = await api(`/api/extension/profile?applicationId=${applicationId}`);
  if (!profile.ok) return profile;
  const key = profile.data.fieldMapKey;
  if (!key) return { ok: false, error: "No field map for this university." };
  const template = await api(`/api/extension/fieldmap?key=${encodeURIComponent(key)}`);
  if (!template.ok) return template;
  return { ok: true, data: { payload: profile.data, template: template.data } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve once the tab finishes loading (or after a safety timeout).
function waitComplete(tabId) {
  return new Promise((resolve) => {
    const done = () => {
      try {
        chrome.tabs.onUpdated.removeListener(listener);
      } catch {}
      resolve();
    };
    function listener(id, info) {
      if (id === tabId && info.status === "complete") done();
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(done, 15000);
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (r) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(r);
    });
  });
}

// Fill the current page; if the content script isn't there (fresh navigation),
// inject it and retry.
async function fillTabPage(tabId) {
  try {
    return await sendToTab(tabId, { type: "FILL_CURRENT_PAGE" });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    } catch {}
    await sleep(600);
    try {
      return await sendToTab(tabId, { type: "FILL_CURRENT_PAGE" });
    } catch {
      return { ok: false, error: "content script unavailable" };
    }
  }
}

// Message router for popup + content script.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "CHECK_UNLOCK") {
        const { applicationId } = await getConfig();
        if (!applicationId) return sendResponse({ ok: false, error: "No applicationId set." });
        const r = await api(`/api/entitlements/check?applicationId=${applicationId}`);
        return sendResponse(r);
      }

      if (msg.type === "GET_AUTOFILL_BUNDLE") {
        return sendResponse(await buildBundle());
      }

      // Drive autofill across EVERY mapped page: navigate the tab to each page in
      // the field map, wait for it to render, and fill it. Never submits.
      if (msg.type === "RUN_ALL_PAGES") {
        const tabId = msg.tabId;
        const bundle = await buildBundle();
        if (!bundle.ok) return sendResponse(bundle);
        const pages = bundle.data.template.pages || [];
        const results = [];
        for (const p of pages) {
          await chrome.tabs.update(tabId, { url: p.urlPattern.replace(/\*+$/, "") });
          await waitComplete(tabId);
          await sleep(1800); // give the Angular app time to render
          const r = await fillTabPage(tabId);
          results.push({
            name: p.name,
            filled: (r && r.filled) || 0,
            matched: !!(r && r.matched),
          });
        }
        return sendResponse({ ok: true, results });
      }

      sendResponse({ ok: false, error: `Unknown message: ${msg.type}` });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // keep the channel open for async sendResponse
});
