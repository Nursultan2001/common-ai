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

  // Format a date value for a text field. Uses UTC so a date stored at midnight
  // UTC doesn't shift a day in the user's timezone.
  function formatDate(v, fmt) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    switch (fmt) {
      case "DD/MM/YYYY":
        return `${dd}/${mm}/${yyyy}`;
      case "YYYY-MM-DD":
        return `${yyyy}-${mm}-${dd}`;
      case "MM/DD/YYYY":
        return `${mm}/${dd}/${yyyy}`;
      default:
        return `${yyyy}-${mm}-${dd}`;
    }
  }

  function markFilled(el, confirm) {
    el.style.outline = HIGHLIGHT;
    el.style.outlineOffset = "1px";
    if (confirm) el.style.outline = "2px solid #ffb454"; // needs explicit check
  }

  // Resolve a control for a <label> (via for=, or a wrapped/inner control).
  function controlForLabel(l) {
    if (l.htmlFor) {
      const el = document.getElementById(l.htmlFor);
      if (el) return el;
    }
    return l.querySelector("input, select, textarea");
  }

  function byLabelText(text, root) {
    const needle = text.trim().toLowerCase();
    const scope = root && root.querySelectorAll ? root : document;
    for (const l of scope.querySelectorAll("label")) {
      if ((l.textContent || "").trim().toLowerCase().includes(needle)) {
        const el = controlForLabel(l);
        if (el) return el;
      }
    }
    return null;
  }

  // A selector entry may be plain CSS, or a strategy: "label:First name",
  // "name:firstName", "aria:Date of birth", "placeholder:you@…", "css:#id".
  // Strategies survive Common App's auto-generated class names far better than CSS.
  function resolveOne(sel, root) {
    const scope = root || document;
    const i = sel.indexOf(":");
    const prefix = i > 0 ? sel.slice(0, i) : "";
    const val = i > 0 ? sel.slice(i + 1) : sel;
    try {
      switch (prefix) {
        case "label":
          return byLabelText(val, scope);
        case "name":
          return scope.querySelector(`[name="${CSS.escape(val)}"]`);
        case "aria":
          return scope.querySelector(`[aria-label*="${val.replace(/"/g, "")}" i]`);
        case "placeholder":
          return scope.querySelector(`[placeholder*="${val.replace(/"/g, "")}" i]`);
        case "css":
          return scope.querySelector(val);
        default:
          return scope.querySelector(sel);
      }
    } catch {
      return null;
    }
  }

  function findEl(selectors, root = document) {
    for (const sel of selectors) {
      const el = resolveOne(sel, root);
      if (el) return el;
    }
    return null;
  }

  // --- async helpers for Angular Material custom widgets (Common App) ---
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout = 2000, step = 60) {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 > timeout) return null;
      await sleep(step);
    }
  }

  // Material renders dropdown options in an overlay appended to <body>.
  function overlayOptions() {
    return document.querySelectorAll(
      ".mat-mdc-option, mat-option, .cdk-overlay-pane [role='option'], [role='option']"
    );
  }
  function pickOption(options, want) {
    const w = String(want).trim().toLowerCase();
    let partial = null;
    for (const o of options) {
      const txt = (o.textContent || "").trim().toLowerCase();
      if (!txt) continue;
      if (txt === w) return o;
      if (!partial && (txt.includes(w) || w.includes(txt))) partial = o;
    }
    return partial;
  }

  async function fillMatSelect(el, value) {
    const trigger = el.closest("mat-select") || el.querySelector("mat-select, [role='combobox']") || el;
    trigger.click();
    const panel = await waitFor(() =>
      document.querySelector(".mat-mdc-select-panel, .mat-select-panel, .cdk-overlay-pane [role='listbox']")
    );
    if (!panel) return "dropdown-did-not-open";
    const opt = await waitFor(() => pickOption(overlayOptions(), value), 1500);
    if (!opt) {
      document.body.click();
      return "no-matching-option";
    }
    opt.click();
    return "filled";
  }

  function fillMatRadio(el, value) {
    const group = el.closest("mat-radio-group") || el.closest("[role='radiogroup']") || el;
    const want = String(value).trim().toLowerCase();
    const btns = Array.from(group.querySelectorAll("mat-radio-button, [role='radio'], label"));
    const txt = (b) => (b.textContent || "").trim().toLowerCase();
    // Exact match first (so "Male" never matches "Female"); then a guarded
    // contains; then a loose contains as last resort.
    const target =
      btns.find((b) => txt(b) === want) ||
      btns.find((b) => txt(b).includes(want) && txt(b).length - want.length < 6) ||
      btns.find((b) => txt(b).includes(want));
    if (target) {
      (target.querySelector("input") || target).click();
      return "filled";
    }
    return "no-matching-option";
  }

  async function fillAutocomplete(el, value) {
    const input = el.matches("input") ? el : el.querySelector("input") || el;
    setNativeValue(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const opt = await waitFor(() => pickOption(overlayOptions(), value), 1500);
    if (opt) {
      opt.click();
      return "filled";
    }
    return "typed-no-match";
  }

  async function fillField(mapping, value, root = document) {
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
      case "mat-select": {
        const r = await fillMatSelect(el, v);
        if (r !== "filled") return { source: mapping.source, status: r, value: v };
        break;
      }
      case "mat-radio": {
        const r = fillMatRadio(el, v);
        if (r !== "filled") return { source: mapping.source, status: r, value: v };
        break;
      }
      case "mat-autocomplete": {
        const r = await fillAutocomplete(el, v);
        if (r !== "filled") {
          markFilled(el, true);
          return { source: mapping.source, status: r, value: v };
        }
        break;
      }
      case "date":
        setNativeValue(el, formatDate(v, mapping.format));
        break;
      default:
        setNativeValue(el, String(v));
    }

    markFilled(el, mapping.requiresConfirm);
    return {
      source: mapping.source,
      status: mapping.requiresConfirm ? "filled-confirm" : "filled",
    };
  }

  async function applyPage(pageMap, payload) {
    const report = [];

    for (const m of pageMap.fields || []) {
      report.push((await fillField(m, get(payload, m.source))) || { source: m.source, status: "empty" });
    }

    for (const section of pageMap.repeating || []) {
      const rows = get(payload, section.source);
      if (!Array.isArray(rows)) continue;
      const containers = document.querySelectorAll(section.rowSelector);
      for (let i = 0; i < rows.length; i++) {
        const container = containers[i];
        if (!container) {
          report.push({ source: `${section.source}[${i}]`, status: "row-missing-add-manually" });
          continue;
        }
        for (const m of section.fields) {
          report.push(
            (await fillField(m, get(rows[i], m.source), container)) || {
              source: `${section.source}[${i}].${m.source}`,
              status: "empty",
            }
          );
        }
      }
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

  // --- Capture mode: generate a field-map for the current live page ---
  function isVisible(el) {
    if (el.type === "hidden") return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // Heuristic: avoid auto-generated ids (React useId, hashes, long digit runs).
  function looksRandomId(id) {
    if (!id) return true;
    if (/^:r/i.test(id)) return true;
    if (/[0-9a-f]{6,}/i.test(id)) return true;
    if (/\d{4,}/.test(id)) return true;
    return id.length > 40;
  }

  function labelOf(el) {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && l.textContent.trim()) return l.textContent.trim();
    }
    const wrap = el.closest("label");
    if (wrap && wrap.textContent.trim()) return wrap.textContent.trim();
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const n = document.getElementById(lb);
      if (n && n.textContent.trim()) return n.textContent.trim();
    }
    if (el.placeholder) return el.placeholder.trim();
    return el.name || "";
  }

  function bestSelector(el) {
    // Angular reactive-form name — the most stable selector when present.
    const fcn = el.getAttribute && el.getAttribute("formcontrolname");
    if (fcn) return `[formcontrolname="${fcn}"]`;
    if (el.id && !looksRandomId(el.id)) return `#${CSS.escape(el.id)}`;
    if (el.name) return `name:${el.name}`;
    const lab = labelOf(el);
    if (lab) return `label:${lab.slice(0, 48)}`;
    if (el.getAttribute && el.getAttribute("aria-label")) return `aria:${el.getAttribute("aria-label")}`;
    if (el.placeholder) return `placeholder:${el.placeholder}`;
    return null;
  }

  // Label for a custom widget (mat-select / mat-radio-group): use the enclosing
  // mat-form-field's label, aria-label, or aria-labelledby target.
  function widgetLabel(el) {
    const ff = el.closest("mat-form-field");
    if (ff) {
      const lab = ff.querySelector("mat-label, label");
      if (lab && lab.textContent.trim()) return lab.textContent.trim();
    }
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    const lb = el.getAttribute("aria-labelledby");
    if (lb) {
      const n = document.getElementById(lb);
      if (n && n.textContent.trim()) return n.textContent.trim();
    }
    return "";
  }

  const SOURCE_HINTS = [
    [/first name|given name/i, "profile.legalFirstName"],
    [/last name|surname|family name/i, "profile.legalLastName"],
    [/preferred|nickname/i, "profile.preferredName"],
    [/birth|dob/i, "profile.dateOfBirth"],
    [/e-?mail/i, "profile.email"],
    [/phone|mobile|cell/i, "profile.phone"],
    [/address line 1|street|address 1/i, "profile.addressLine1"],
    [/address line 2|apt|suite|unit/i, "profile.addressLine2"],
    [/city|town/i, "profile.city"],
    [/state|province|region/i, "profile.state"],
    [/zip|postal/i, "profile.postalCode"],
    [/country/i, "profile.country"],
    [/citizenship|citizen/i, "profile.citizenship"],
    [/high school|current school|school name/i, "profile.highSchoolName"],
    [/graduat/i, "profile.graduationYear"],
    [/\bgpa\b/i, "profile.gpa"],
    [/intended major|major|field of study/i, "profile.intendedMajor"],
  ];

  function guessSource(label) {
    for (const [re, src] of SOURCE_HINTS) if (re.test(label)) return src;
    return "";
  }

  function kindOf(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "select") return "select";
    if (tag === "textarea") return "textarea";
    const t = (el.type || "text").toLowerCase();
    if (["checkbox", "radio", "date", "email", "tel", "file"].includes(t)) return t;
    if (t === "number") return "number";
    return "text";
  }

  function captureFields() {
    const els = Array.from(
      document.querySelectorAll("input, select, textarea")
    ).filter(
      (el) =>
        isVisible(el) &&
        !["hidden", "submit", "button", "reset"].includes((el.type || "").toLowerCase())
    );

    const fields = [];
    for (const el of els) {
      const sel = bestSelector(el);
      if (!sel) continue;
      const label = labelOf(el);
      fields.push({
        // _label is a human note for review; remove or keep, it's ignored at runtime.
        _label: label,
        source: guessSource(label),
        selectors: [sel],
        kind: kindOf(el),
      });
    }

    // Angular Material custom widgets (not real input/select) — dropdowns & radios.
    function widgetSelector(el) {
      const fcn = el.getAttribute("formcontrolname");
      if (fcn) return `[formcontrolname="${fcn}"]`;
      if (el.id && !looksRandomId(el.id)) return `#${CSS.escape(el.id)}`;
      if (el.getAttribute("name")) return `name:${el.getAttribute("name")}`;
      return null;
    }
    for (const el of document.querySelectorAll("mat-select")) {
      if (!isVisible(el)) continue;
      const sel = widgetSelector(el);
      if (!sel) continue;
      const label = widgetLabel(el);
      fields.push({ _label: label, source: guessSource(label), selectors: [sel], kind: "mat-select" });
    }
    for (const el of document.querySelectorAll("mat-radio-group, [role='radiogroup']")) {
      if (!isVisible(el)) continue;
      const sel = widgetSelector(el);
      if (!sel) continue;
      const label = widgetLabel(el);
      fields.push({ _label: label, source: guessSource(label), selectors: [sel], kind: "mat-radio" });
    }

    return {
      urlPattern: location.origin + location.pathname.replace(/\/$/, "") + "*",
      name: document.title || "Captured page",
      fields,
    };
  }

  // Triggered from the popup.
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === "CAPTURE_FIELDS") {
      const map = captureFields();
      const json = JSON.stringify(map, null, 2);
      console.log("[Common AI] Captured field map for this page:\n" + json);
      console.table(
        map.fields.map((f) => ({
          label: f._label,
          source: f.source || "(set this)",
          selector: f.selectors[0],
          kind: f.kind,
        }))
      );
      try {
        const blob = new Blob([json], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "commonapp-capture.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {}
      sendResponse({ ok: true, count: map.fields.length });
      return true;
    }

    if (msg.type === "RUN_AUTOFILL") {
      runAutofill({ quiet: false }).then(sendResponse);
      return true;
    }
    // Quiet variant used by the "fill all pages" driver in the background worker.
    if (msg.type === "FILL_CURRENT_PAGE") {
      runAutofill({ quiet: true }).then(sendResponse);
      return true;
    }
  });

  function getBundle() {
    return new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: "GET_AUTOFILL_BUNDLE" }, resolve)
    );
  }

  async function runAutofill({ quiet } = {}) {
    const resp = await getBundle();
    if (!resp || !resp.ok) {
      const why =
        resp && resp.status === 402
          ? "This application is locked. Pay $5 to unlock autofill."
          : (resp && resp.error) || "Could not load your data.";
      if (!quiet) alert(`Common AI: ${why}`);
      return { ok: false, matched: false, error: why };
    }
    const { payload, template } = resp.data;
    const page = matchPage(template);
    if (!page) {
      if (!quiet) alert("Common AI: no field map for this page yet.");
      return { ok: true, matched: false, filled: 0 };
    }
    installSubmitGate();
    const report = await applyPage(page, payload);
    showBanner(report);
    const filled = report.filter((r) => String(r.status).startsWith("filled")).length;
    return { ok: true, matched: true, filled, pageName: page.name, report };
  }
})();
