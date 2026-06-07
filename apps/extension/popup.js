const $ = (id) => document.getElementById(id);
const status = (t) => ($("status").textContent = t);

async function load() {
  const cfg = await chrome.storage.local.get(["backendUrl", "token", "applicationId"]);
  $("backendUrl").value = cfg.backendUrl || "http://localhost:3000";
  $("token").value = cfg.token || "";
  $("applicationId").value = cfg.applicationId || "";
}

$("save").onclick = async () => {
  await chrome.storage.local.set({
    backendUrl: $("backendUrl").value.trim().replace(/\/$/, ""),
    token: $("token").value.trim(),
    applicationId: $("applicationId").value.trim(),
  });
  status("Saved.");
};

$("check").onclick = () => {
  status("Checking…");
  chrome.runtime.sendMessage({ type: "CHECK_UNLOCK" }, (r) => {
    if (!r) return status("No response.");
    if (!r.ok) return status(`Error: ${r.error || r.status}`);
    status(r.data.unlocked ? "✓ Unlocked — ready to autofill." : "Locked. Pay $5 to unlock.");
  });
};

$("run").onclick = async () => {
  status("Preparing…");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: "RUN_AUTOFILL" }, (r) => {
    if (chrome.runtime.lastError) {
      return status("Open a supported application page first.");
    }
    status(r && r.ok ? "Filled. Review the highlighted fields on the page." : "Could not autofill.");
  });
};

$("capture").onclick = async () => {
  status("Capturing fields on this page…");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_FIELDS" }, (r) => {
    if (chrome.runtime.lastError) {
      return status("Open the application page first (content script not loaded).");
    }
    status(
      r && r.ok
        ? `Captured ${r.count} fields → downloaded commonapp-capture.json (also in DevTools console).`
        : "Capture failed."
    );
  });
};

load();
