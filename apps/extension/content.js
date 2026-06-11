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
    const MONTHS = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    switch (fmt) {
      case "DD/MM/YYYY":
        return `${dd}/${mm}/${yyyy}`;
      case "YYYY-MM-DD":
        return `${yyyy}-${mm}-${dd}`;
      case "MM/DD/YYYY":
        return `${mm}/${dd}/${yyyy}`;
      case "MMMM D, YYYY":
        return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${yyyy}`;
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
        // nth:<css>@<i> — the i-th element matching <css>. Survives Angular's
        // auto-indexed name attributes (mat-radio-group-NNN changes per render).
        case "nth": {
          const at = val.lastIndexOf("@");
          if (at < 0) return scope.querySelector(val);
          const css = val.slice(0, at);
          const idx = Number(val.slice(at + 1)) || 0;
          const all = scope.querySelectorAll(css);
          return all[idx] || null;
        }
        // within:<anchor css> — resolve the anchor (a stable element like
        // #text_ques_936), then ascend to the nearest ancestor block that
        // contains checkbox/radio options. Lets us reach unstable checkbox
        // groups via a stable sibling field in the same card.
        case "within": {
          const anchor = scope.querySelector(val);
          if (!anchor) return null;
          let cur = anchor;
          for (let i = 0; i < 8 && cur; i++) {
            cur = cur.parentElement;
            if (
              cur &&
              cur.querySelector(
                "input[type='checkbox'], input[type='radio'], mat-checkbox, mat-radio-button, [role='checkbox'], [role='radio']"
              )
            ) {
              return cur;
            }
          }
          return null;
        }
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

  // Many Common App "text" fields are really combobox widgets (course subject/
  // level, activity type, score dropdowns...). Typing alone never commits a
  // selection in Angular — the value vanishes on save. Detect those and click
  // the matching overlay option after typing.
  function isCombobox(el) {
    return (
      el.getAttribute &&
      (el.getAttribute("role") === "combobox" ||
        el.hasAttribute("aria-autocomplete") ||
        el.hasAttribute("aria-owns") ||
        el.hasAttribute("aria-controls") ||
        el.hasAttribute("aria-expanded"))
    );
  }

  async function smartFillText(el, text) {
    if (el.focus) el.focus();
    setNativeValue(el, String(text));
    if (isCombobox(el)) {
      const opt = await waitFor(() => pickOption(overlayOptions(), text), 1400);
      if (opt) {
        opt.click();
        await sleep(80);
        if (el.blur) el.blur();
        return "filled";
      }
      // No matching option — keep the typed text but flag it for review, and
      // close any stray overlay so it can't swallow the next click.
      el.dispatchEvent(new Event("change", { bubbles: true }));
      if (el.blur) el.blur();
      document.body.click();
      return "typed-confirm";
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (el.blur) el.blur();
    return "filled";
  }

  async function fillField(mapping, value, root = document) {
    if (value === null || value === undefined || value === "") return null;

    // radio-map: pick the exact radio option by selector from valueMap.
    if (mapping.kind === "radio-map") {
      const sel = mapping.valueMap && mapping.valueMap[String(value)];
      if (!sel) return { source: mapping.source, status: "no-option-mapping", value };
      const target = document.querySelector(sel);
      if (!target) return { source: mapping.source, status: "field-not-found" };
      (target.closest("label") || target).click();
      if (target.tagName === "INPUT") {
        target.checked = true;
        target.dispatchEvent(new Event("change", { bubbles: true }));
      }
      markFilled(target.closest("label") || target, mapping.requiresConfirm);
      return { source: mapping.source, status: mapping.requiresConfirm ? "filled-confirm" : "filled" };
    }

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
      case "checkbox-multi": {
        const wants = String(v)
          .split(/[;,]/)
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean);
        if (!wants.length) return null;

        // Normalize to a container: a name:/within: selector may hand us a
        // single <input>; ascend until the scope actually holds the checkboxes.
        const CB = "input[type='checkbox'], mat-checkbox, [role='checkbox']";
        let scope = el;
        if (!scope.querySelector || !scope.querySelector(CB)) {
          let cur = el;
          for (let i = 0; i < 8 && cur; i++) {
            cur = cur.parentElement;
            if (cur && cur.querySelectorAll(CB).length >= 1) {
              scope = cur;
              break;
            }
          }
        }

        const boxes = Array.from(scope.querySelectorAll(CB));
        const labelOfBox = (cb) =>
          ((cb.closest("label") || cb.parentElement || cb).textContent ||
            cb.getAttribute("aria-label") ||
            "")
            .trim()
            .toLowerCase();
        let any = false;
        for (const w of wants) {
          // exact label match first; loose match only as fallback
          let target = boxes.find((cb) => labelOfBox(cb) === w);
          if (!target) {
            target = boxes.find((cb) => {
              const lab = labelOfBox(cb);
              return lab.includes(w) && lab.length - w.length < 4;
            });
          }
          if (target) {
            const checked =
              target.checked || target.getAttribute("aria-checked") === "true";
            if (!checked) (target.closest("label") || target).click();
            any = true;
          }
        }
        if (!any) return { source: mapping.source, status: "no-matching-option", value: v };
        break;
      }
      case "date": {
        const r = await smartFillText(el, formatDate(v, mapping.format));
        if (r === "typed-confirm") {
          markFilled(el, true);
          return { source: mapping.source, status: "filled-confirm" };
        }
        break;
      }
      default: {
        const r = await smartFillText(el, String(v));
        if (r === "typed-confirm") {
          markFilled(el, true);
          return { source: mapping.source, status: "filled-confirm" };
        }
      }
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

  function showBanner(report, pageName) {
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
      `<button id="united-report" style="background:transparent;border:1px solid #3a4252;color:#9aa3b2;padding:8px 12px;border-radius:8px;cursor:pointer">Copy report</button>` +
      `<button id="united-dismiss" style="background:transparent;border:1px solid #3a4252;color:#9aa3b2;padding:8px 12px;border-radius:8px;cursor:pointer">Hide</button>`;
    document.body.appendChild(bar);

    document.getElementById("united-confirm").onclick = () => {
      window.__unitedReviewConfirmed = true;
      flashBanner("Submit unlocked. You are submitting your own application.");
      document.getElementById("united-confirm").disabled = true;
    };
    // Diagnostic report the user can paste back to support/dev: which fields
    // filled and which failed, per page. Contains field names + statuses only.
    document.getElementById("united-report").onclick = () => {
      const payload = JSON.stringify(
        { url: location.href, page: pageName || document.title, when: new Date().toISOString(), report },
        null,
        2
      );
      const done = () => flashBanner("Report copied — paste it to support.");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).then(done, () => window.prompt("Copy the report:", payload));
      } else {
        window.prompt("Copy the report:", payload);
      }
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

  // ===========================================================================
  // DEEP SCRAPE — read-only inventory of EVERY fillable control on the page:
  // text/date inputs, textareas, native selects (with options), combobox
  // dropdowns (overlay opened just to read options, closed with Escape),
  // mat-radio groups and checkbox lists (labels + option ids, never clicked).
  // Records structure only — never the user's entered values. Results
  // accumulate in localStorage so multiple pages build one export file.
  // ===========================================================================

  function nearestStableAnchor(el) {
    // Closest ancestor block that contains a stable question id — lets us build
    // `within:#text_ques_NNN` selectors offline for unstable widgets.
    let cur = el;
    for (let i = 0; i < 10 && cur; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      const q = cur.querySelector("[id^='text_ques_'], [id^='option_ques_']");
      if (q) return q.id;
    }
    return null;
  }

  function dateHintNear(el) {
    const ff = el.closest("mat-form-field") || el.parentElement;
    const scopeText = ff ? ff.parentElement?.textContent || "" : "";
    const m = scopeText.match(/Date uses [^.]+format[^.]*\./i);
    return m ? m[0].trim() : null;
  }

  function escapeOverlay(input) {
    try {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      input.blur && input.blur();
      document.body.click();
    } catch {}
  }

  async function harvestComboOptions(input) {
    // Open the dropdown WITHOUT typing or selecting; read options; close.
    try {
      input.focus && input.focus();
      input.click && input.click();
    } catch {}
    const found = await waitFor(() => {
      const opts = overlayOptions();
      return opts.length ? opts : null;
    }, 1200);
    let options = null;
    if (found) {
      options = Array.from(found)
        .map((o) => (o.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 250);
    }
    escapeOverlay(input);
    await sleep(120);
    return options; // null => opens only after typing (server-driven search)
  }

  async function deepScrapePage() {
    const out = {
      url: location.origin + location.pathname,
      title: (document.querySelector("h1, h2") || {}).textContent?.trim() || document.title,
      scrapedAt: new Date().toISOString(),
      textFields: [],
      selects: [],
      comboboxes: [],
      radioGroups: [],
      checkboxGroups: [],
      unanchored: [],
    };

    const seenRadioGroups = new Set();
    const seenCheckboxNames = new Set();

    // --- plain inputs / textareas / native selects / comboboxes ---
    const els = Array.from(document.querySelectorAll("input, textarea, select")).filter(
      (el) =>
        isVisible(el) &&
        !["hidden", "submit", "button", "reset"].includes((el.type || "").toLowerCase())
    );

    for (const el of els) {
      const tag = el.tagName.toLowerCase();
      const type = (el.type || "").toLowerCase();
      if (type === "radio" || type === "checkbox") continue; // grouped below
      const id = el.id && !looksRandomId(el.id) ? el.id : null;
      const entry = {
        label: labelOf(el) || widgetLabel(el) || null,
        id,
        selector: id ? `#${CSS.escape(el.id)}` : bestSelector(el),
        anchor: id ? null : nearestStableAnchor(el),
        kind: kindOf(el),
        required: !!(el.required || el.getAttribute("aria-required") === "true"),
        hasValue: !!(el.value && String(el.value).trim()),
      };
      const hint = dateHintNear(el);
      if (hint) entry.dateFormatHint = hint;

      if (tag === "select") {
        entry.options = Array.from(el.options || []).map((o) => o.textContent.trim());
        out.selects.push(entry);
      } else if (isCombobox(el)) {
        entry.options = await harvestComboOptions(el);
        if (entry.options === null) entry.optionsNote = "type-ahead (server-driven)";
        out.comboboxes.push(entry);
      } else {
        out.textFields.push(entry);
      }
      if (!entry.selector && !entry.anchor) out.unanchored.push(entry.label || tag);
    }

    // --- mat-radio groups (never clicked) ---
    for (const g of document.querySelectorAll("mat-radio-group, [role='radiogroup']")) {
      if (!isVisible(g) && !g.querySelector("input")) continue;
      const key = g.id || g.getAttribute("name") || Math.random().toString(36);
      if (seenRadioGroups.has(key)) continue;
      seenRadioGroups.add(key);
      const options = Array.from(
        g.querySelectorAll("mat-radio-button, [role='radio']")
      ).map((b) => ({
        label: (b.textContent || "").trim().slice(0, 160),
        inputId: (b.querySelector("input") || {}).id || null,
      }));
      out.radioGroups.push({
        question: widgetLabel(g) || null,
        groupId: g.id && !looksRandomId(g.id) ? g.id : null,
        nthOnPage: out.radioGroups.length,
        anchor: nearestStableAnchor(g),
        options,
      });
    }

    // --- checkbox groups (grouped by name; never clicked) ---
    const cbByName = {};
    for (const cb of document.querySelectorAll("input[type='checkbox']")) {
      const name = cb.getAttribute("name") || "__solo__" + (cb.id || "");
      (cbByName[name] = cbByName[name] || []).push(cb);
    }
    for (const [name, boxes] of Object.entries(cbByName)) {
      if (seenCheckboxNames.has(name)) continue;
      seenCheckboxNames.add(name);
      if (!boxes.some((b) => isVisible(b))) continue;
      out.checkboxGroups.push({
        runtimeName: name, // unstable across sessions — for human reference only
        nthOnPage: out.checkboxGroups.length,
        anchor: nearestStableAnchor(boxes[0]),
        options: boxes.map((b) => ({
          label:
            ((b.closest("label") || b.parentElement || b).textContent || "")
              .trim()
              .slice(0, 120),
          inputId: b.id && !looksRandomId(b.id) ? b.id : null,
        })),
      });
    }

    // Accumulate across pages in localStorage for one combined export.
    try {
      const store = JSON.parse(localStorage.getItem("ca_deep_scrape") || "{}");
      store[location.pathname] = out;
      localStorage.setItem("ca_deep_scrape", JSON.stringify(store));
    } catch {}

    return out;
  }

  function exportDeepScrape() {
    let store = {};
    try {
      store = JSON.parse(localStorage.getItem("ca_deep_scrape") || "{}");
    } catch {}
    const json = JSON.stringify(store, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "commonapp-deep-scrape.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return Object.keys(store);
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
    // Read-only structural inventory of the current page (accumulates).
    if (msg.type === "DEEP_SCRAPE_PAGE") {
      (async () => {
        // Let the Angular page finish rendering before inventorying.
        await waitFor(
          () => document.querySelector("input, textarea, select, mat-radio-group"),
          10000,
          250
        );
        await sleep(400);
        const out = await deepScrapePage();
        console.log("[Common AI] Deep scrape:", out);
        sendResponse({
          ok: true,
          page: out.url,
          counts: {
            text: out.textFields.length,
            selects: out.selects.length,
            comboboxes: out.comboboxes.length,
            radioGroups: out.radioGroups.length,
            checkboxGroups: out.checkboxGroups.length,
          },
          data: out,
        });
      })();
      return true;
    }
    if (msg.type === "EXPORT_SCRAPE") {
      const pages = exportDeepScrape();
      sendResponse({ ok: true, pages });
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

    // Common App is an Angular SPA — fields render well after page "load".
    // Wait until at least one mapped field actually exists before filling.
    await waitFor(() => {
      for (const m of page.fields || []) {
        if (m.selectors && m.selectors.length && findEl(m.selectors)) return true;
      }
      for (const s of page.repeating || []) {
        if (document.querySelector(s.rowSelector)) return true;
      }
      return false;
    }, 10000, 250);
    await sleep(400);

    const report = await applyPage(page, payload);
    showBanner(report, page.name);
    const filled = report.filter((r) => String(r.status).startsWith("filled")).length;
    return { ok: true, matched: true, filled, pageName: page.name, report };
  }
})();
