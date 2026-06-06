// Autofill engine. Runs in the student's own logged-in session.
// Core guarantees:
//  - Fills ONLY values present in the backend payload (real, approved data).
//  - Highlights every field it touched so the student can verify.
//  - BLOCKS the portal's submit button until the student explicitly confirms
//    they reviewed the form. We NEVER auto-submit.

(() => {
  const HIGHLIGHT = "2px solid #5b8cff";
  let submitGateInstalled = false;

  function get(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function setNativeValue(el, value) {
    // React tracks values via a setter; bypass it so onChange fires.
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function markFilled(el, confirm) {
    el.style.outline = HIGHLIGHT;
    el.style.outlineOffset = "1px";
    if (confirm) el.style.outline = "2px solid #ffb454"; // needs explicit check
  }

  function findEl(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function fillField(mapping, value, root = document) {
    if (value === null || value === undefined || value === "") return null;
    const el = findEl(mapping.selectors, root);
    if (!el) return { source: mapping.source, status: "field-not-found" };

    let v = value;
    if (mapping.valueMap && mapping.valueMap[String(value)] !== undefined) {
      v = mapping.valueMap[String(value)];
    }

    switch (mapping.kind) {
      case "checkbox":
        el.checked = Boolean(v);
        el.dispatchEvent(new Event("change", { bubbles: true }));
        break;
      case "select": {
        const opt = Array.from(el.options || []).find(
          (o) => o.value === String(v) || o.textContent.trim() === String(v)
        );
        if (opt) {
          el.value = opt.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          return { source: mapping.source, status: "no-matching-option", value: v };
        }
        break;
      }
      case "date": {
        const d = new Date(v);
        const iso = isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
        setNativeValue(el, iso);
        break;
      }
      default:
        setNativeValue(el, String(v));
    }

    markFilled(el, mapping.requiresConfirm);
    return {
      source: mapping.source,
      status: mapping.requiresConfirm ? "filled-confirm" : "filled",
    };
  }

  function applyPage(pageMap, payload) {
    const report = [];

    for (const m of pageMap.fields || []) {
      report.push(fillField(m, get(payload, m.source)) || { source: m.source, status: "empty" });
    }

    for (const section of pageMap.repeating || []) {
      const rows = get(payload, section.source);
      if (!Array.isArray(rows)) continue;
      const containers = document.querySelectorAll(section.rowSelector);
      rows.forEach((rowData, i) => {
        const container = containers[i];
        if (!container) {
          report.push({
            source: `${section.source}[${i}]`,
            status: "row-missing-add-manually",
          });
          return;
        }
        for (const m of section.fields) {
          report.push(
            fillField(m, get(rowData, m.source), container) || {
              source: `${section.source}[${i}].${m.source}`,
              status: "empty",
            }
          );
        }
      });
    }
    return report;
  }

  function matchPage(template) {
    const href = location.href;
    return template.pages.find((p) => {
      const re = new RegExp(
        "^" + p.urlPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
      );
      return re.test(href);
    });
  }

  // --- The submit gate ---
  function installSubmitGate() {
    if (submitGateInstalled) return;
    submitGateInstalled = true;
    // Intercept clicks on likely submit buttons during the capture phase and
    // stop them until the student confirms in our banner.
    document.addEventListener(
      "click",
      (e) => {
        if (window.__unitedReviewConfirmed) return;
        const t = e.target.closest("button, input[type='submit']");
        if (!t) return;
        const label = (t.textContent || t.value || "").toLowerCase();
        if (label.includes("submit") || label.includes("pay") || label.includes("confirm")) {
          e.preventDefault();
          e.stopPropagation();
          flashBanner("Review every highlighted field, then click ‘I reviewed — enable submit’.");
        }
      },
      true
    );
  }

  function flashBanner(text) {
    const el = document.getElementById("united-banner-text");
    if (el) el.textContent = text;
  }

  function showBanner(report) {
    document.getElementById("united-banner")?.remove();
    const filled = report.filter((r) => r.status.startsWith("filled")).length;
    const issues = report.filter(
      (r) => !r.status.startsWith("filled") && r.status !== "empty"
    );

    const bar = document.createElement("div");
    bar.id = "united-banner";
    bar.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#151922;color:#e8ebf0;" +
      "font:14px system-ui;padding:12px 16px;border-top:2px solid #5b8cff;display:flex;gap:12px;align-items:center;flex-wrap:wrap";
    bar.innerHTML =
      `<strong>Common AI</strong>` +
      `<span id="united-banner-text">Filled ${filled} field(s). ` +
      `${issues.length} need your attention. Orange = please double-check.</span>` +
      `<button id="united-confirm" style="margin-left:auto;background:#3ecf8e;border:0;color:#06210f;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:600">I reviewed — enable submit</button>` +
      `<button id="united-dismiss" style="background:transparent;border:1px solid #3a4252;color:#9aa3b2;padding:8px 12px;border-radius:8px;cursor:pointer">Hide</button>`;
    document.body.appendChild(bar);

    document.getElementById("united-confirm").onclick = () => {
      window.__unitedReviewConfirmed = true;
      flashBanner("Submit unlocked. You are submitting your own application.");
      document.getElementById("united-confirm").disabled = true;
    };
    document.getElementById("united-dismiss").onclick = () => bar.remove();

    if (issues.length) console.table(issues);
  }

  // Triggered from the popup.
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type !== "RUN_AUTOFILL") return;
    chrome.runtime.sendMessage({ type: "GET_AUTOFILL_BUNDLE" }, (resp) => {
      if (!resp || !resp.ok) {
        const why =
          resp && resp.status === 402
            ? "This application is locked. Pay $5 to unlock autofill."
            : (resp && resp.error) || "Could not load your data.";
        alert(`Common AI: ${why}`);
        sendResponse({ ok: false });
        return;
      }
      const { payload, template } = resp.data;
      const page = matchPage(template);
      if (!page) {
        alert("Common AI: no field map for this page yet.");
        sendResponse({ ok: false });
        return;
      }
      installSubmitGate();
      const report = applyPage(page, payload);
      showBanner(report);
      sendResponse({ ok: true, report });
    });
    return true;
  });
})();
