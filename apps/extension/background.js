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

// Every Common App section page we know (from the user's captures). The deep
// scraper walks all of them; pages that 404/redirect simply yield no fields.
const COMMONAPP_PAGES = [
  "2/2", "2/3", "2/236", "2/10", "2/37",
  "3/11", "3/12", "3/13", "3/14", "3/16", "3/17", "3/53",
  "4/18", "4/19", "4/21", "4/22", "4/23", "4/24", "4/25", "4/197",
  "5/26", "5/27", "5/28", "5/30",
  "6/33", "6/35",
  "7/232", "7/250",
  "13/54", "13/55", "13/56", "13/57", "13/58", "13/59",
].map((p) => `https://apply.commonapp.org/common/${p}`);

async function messageTabWithInject(tabId, message) {
  try {
    return await sendToTab(tabId, message);
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    } catch {}
    await sleep(600);
    try {
      return await sendToTab(tabId, message);
    } catch {
      return { ok: false, error: "content script unavailable" };
    }
  }
}

// -- Trusted-event bridge (chrome.debugger / CDP) -----------------------------
// Common App's Testing page uses ng-select wrapped in its own CA-CONTROL-WRAPPER
// component that ignores synthetic mouse events (event.isTrusted === false).
// The chrome.debugger API can dispatch REAL (trusted) input events via CDP —
// Chrome shows a banner ("Common AI has started debugging this browser") while
// attached, but only for the duration of the autofill run.
const attachedTabs = new Set();

async function attachDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;
  await new Promise((res, rej) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
      attachedTabs.add(tabId);
      res();
    });
  });
}

async function detachDebugger(tabId) {
  if (!attachedTabs.has(tabId)) return;
  await new Promise((res) => {
    chrome.debugger.detach({ tabId }, () => {
      attachedTabs.delete(tabId);
      res();
    });
  });
}

function cdp(tabId, method, params) {
  return new Promise((res, rej) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
      res(result);
    });
  });
}

// Real "user click" at viewport-relative (x, y) — trusted by any Angular check.
async function trustedClickAt(tabId, x, y) {
  await attachDebugger(tabId);
  const base = { x, y, button: "left", buttons: 1, clickCount: 1 };
  // Move so hover-state components (like ng-option marked) register the pointer.
  await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", ...base });
  await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
}

// Real keypress (Enter / ArrowDown / Escape / any single-char key).
async function trustedKey(tabId, key) {
  await attachDebugger(tabId);
  const map = {
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 },
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
    Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
  };
  const info = map[key] || { key, code: key.length === 1 ? "Key" + key.toUpperCase() : key };
  await cdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", ...info });
  await cdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...info });
}

// Real text insertion at the currently-focused element (works for ng-select's
// internal search input). Uses Input.insertText for reliable Unicode support.
async function trustedType(tabId, text) {
  await attachDebugger(tabId);
  await cdp(tabId, "Input.insertText", { text });
}

// Chrome auto-detaches on tab close / navigation-with-crash / user "Cancel"
// on the debugger banner — keep our attached-set in sync so we don't retry a
// stale attach.
chrome.debugger.onDetach.addListener((source) => {
  if (source && source.tabId != null) attachedTabs.delete(source.tabId);
});

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

      // Trusted-event bridge — content script asks the SW to fire a REAL click
      // or key via chrome.debugger (CDP). Used only where synthetic events are
      // rejected (Common App's ng-select CA-CONTROL-WRAPPER).
      if (msg.type === "TRUSTED_CLICK") {
        try {
          const tabId = _sender.tab && _sender.tab.id;
          if (!tabId) return sendResponse({ ok: false, error: "no-tab" });
          await trustedClickAt(tabId, msg.x, msg.y);
          return sendResponse({ ok: true });
        } catch (e) {
          return sendResponse({ ok: false, error: e.message || String(e) });
        }
      }
      if (msg.type === "TRUSTED_KEY") {
        try {
          const tabId = _sender.tab && _sender.tab.id;
          if (!tabId) return sendResponse({ ok: false, error: "no-tab" });
          await trustedKey(tabId, msg.key);
          return sendResponse({ ok: true });
        } catch (e) {
          return sendResponse({ ok: false, error: e.message || String(e) });
        }
      }
      if (msg.type === "TRUSTED_TYPE") {
        try {
          const tabId = _sender.tab && _sender.tab.id;
          if (!tabId) return sendResponse({ ok: false, error: "no-tab" });
          await trustedType(tabId, msg.text);
          return sendResponse({ ok: true });
        } catch (e) {
          return sendResponse({ ok: false, error: e.message || String(e) });
        }
      }
      // Explicit detach — content script signals end of a fill run so we drop
      // the debugger banner as soon as possible.
      if (msg.type === "TRUSTED_RELEASE") {
        try {
          const tabId = _sender.tab && _sender.tab.id;
          if (tabId) await detachDebugger(tabId);
          return sendResponse({ ok: true });
        } catch (e) {
          return sendResponse({ ok: false, error: e.message || String(e) });
        }
      }

      // Fire-and-forget fill telemetry from the content script (drift detection).
      // The content script never holds the token; we attach it here and post.
      if (msg.type === "REPORT_TELEMETRY") {
        const { applicationId } = await getConfig();
        const d = msg.data || {};
        api("/api/extension/fill-telemetry", {
          method: "POST",
          body: {
            applicationId,
            fieldMapKey: d.fieldMapKey,
            pageName: d.pageName,
            pageUrl: d.pageUrl,
            fields: Array.isArray(d.fields) ? d.fields : [],
          },
        }).catch(() => {});
        return sendResponse({ ok: true });
      }

      // Drive autofill across EVERY mapped page: navigate the tab to each page in
      // the field map, wait for it to render, and fill it. Never submits.
      if (msg.type === "RUN_ALL_PAGES") {
        const tabId = msg.tabId;
        const save = !!msg.save; // when true, click Continue to persist each page
        const bundle = await buildBundle();
        if (!bundle.ok) return sendResponse(bundle);
        const pages = bundle.data.template.pages || [];
        const results = [];
        for (const p of pages) {
          await chrome.tabs.update(tabId, { url: p.urlPattern.replace(/\*+$/, "") });
          await waitComplete(tabId);
          await sleep(1800); // give the Angular app time to render
          const r = await fillTabPage(tabId);
          let saved = null;
          let errors = null;
          if (save && r && r.matched) {
            // Common App only persists a page on Continue. Click it; advanced =>
            // saved, validation errors => blocked (page needs manual completion).
            await sleep(700); // let field values settle before saving
            const c = await messageTabWithInject(tabId, { type: "CLICK_CONTINUE" });
            saved = !!(c && c.saved);
            errors = (c && c.errors) || 0;
          }
          results.push({
            name: p.name,
            filled: (r && r.filled) || 0,
            matched: !!(r && r.matched),
            saved,
            errors,
          });
        }
        // Whether or not any trusted events were needed, tear down the debugger
        // banner as soon as the run ends.
        try { await detachDebugger(tabId); } catch (_e) {}
        return sendResponse({ ok: true, results });
      }

      // Clear EVERY mapped page: navigate to each, clear all answers, then click
      // Continue to persist the cleared state. Common App blocks saving an empty
      // REQUIRED field, so those pages clear but report saved:false.
      if (msg.type === "CLEAR_ALL_PAGES") {
        const tabId = msg.tabId;
        const bundle = await buildBundle();
        if (!bundle.ok) return sendResponse(bundle);
        const pages = bundle.data.template.pages || [];
        const results = [];
        for (const p of pages) {
          await chrome.tabs.update(tabId, { url: p.urlPattern.replace(/\*+$/, "") });
          await waitComplete(tabId);
          await sleep(1800);
          const r = await messageTabWithInject(tabId, { type: "CLEAR_CURRENT_PAGE" });
          await sleep(500);
          const c = await messageTabWithInject(tabId, { type: "CLICK_CONTINUE" });
          results.push({
            name: p.name,
            cleared: (r && r.cleared) || 0,
            saved: !!(c && c.saved),
            errors: (c && c.errors) || 0,
          });
        }
        return sendResponse({ ok: true, results });
      }

      // Walk every known Common App page, deep-scrape each (read-only), then
      // export one combined JSON file from the final page.
      if (msg.type === "DEEP_SCRAPE_ALL") {
        const tabId = msg.tabId;
        const results = [];
        for (const url of COMMONAPP_PAGES) {
          await chrome.tabs.update(tabId, { url });
          await waitComplete(tabId);
          await sleep(1500);
          const r = await messageTabWithInject(tabId, { type: "DEEP_SCRAPE_PAGE" });
          results.push({
            url,
            ok: !!(r && r.ok),
            counts: (r && r.counts) || null,
          });
        }
        await messageTabWithInject(tabId, { type: "EXPORT_SCRAPE" });
        return sendResponse({ ok: true, results });
      }

      sendResponse({ ok: false, error: `Unknown message: ${msg.type}` });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // keep the channel open for async sendResponse
});
