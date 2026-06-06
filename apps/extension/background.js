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
        const { applicationId } = await getConfig();
        if (!applicationId) return sendResponse({ ok: false, error: "No applicationId set." });

        const profile = await api(`/api/extension/profile?applicationId=${applicationId}`);
        if (!profile.ok) return sendResponse(profile); // 402 if locked, etc.

        const key = profile.data.fieldMapKey;
        if (!key) return sendResponse({ ok: false, error: "No field map for this university." });

        const template = await api(`/api/extension/fieldmap?key=${encodeURIComponent(key)}`);
        if (!template.ok) return sendResponse(template);

        return sendResponse({ ok: true, data: { payload: profile.data, template: template.data } });
      }

      sendResponse({ ok: false, error: `Unknown message: ${msg.type}` });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // keep the channel open for async sendResponse
});
