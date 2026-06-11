// Standalone deep scraper — same logic as content.js deepScrapePage(), packaged
// to run directly in a page context (Claude-in-Chrome javascript_tool, or pasted
// into DevTools Console on apply.commonapp.org). READ-ONLY: never sets values,
// never clicks radios/checkboxes/submit; only opens dropdown overlays to read
// their options and closes them with Escape. Records structure, not user data.
//
// Returns (and resolves to) the page inventory JSON. Also accumulates into
// localStorage["ca_deep_scrape"] keyed by pathname, like the extension does.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout = 1500, step = 60) {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 > timeout) return null;
      await sleep(step);
    }
  }
  const overlayOptions = () =>
    document.querySelectorAll(
      ".mat-mdc-option, mat-option, .cdk-overlay-pane [role='option'], [role='option']"
    );
  function isVisible(el) {
    if (el.type === "hidden") return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function looksRandomId(id) {
    if (!id) return true;
    if (/^:r/i.test(id)) return true;
    if (/[0-9a-f]{6,}/i.test(id)) return true;
    if (/mat-(input|select|radio|checkbox|form-field)-\d+/.test(id)) return true;
    return id.length > 40;
  }
  function labelOf(el) {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && l.textContent.trim()) return l.textContent.trim();
    }
    const wrap = el.closest("label");
    if (wrap && wrap.textContent.trim()) return wrap.textContent.trim();
    const al = el.getAttribute && el.getAttribute("aria-label");
    if (al) return al.trim();
    const lb = el.getAttribute && el.getAttribute("aria-labelledby");
    if (lb) {
      const n = document.getElementById(lb.split(/\s+/)[0]);
      if (n && n.textContent.trim()) return n.textContent.trim();
    }
    const ff = el.closest && el.closest("mat-form-field");
    if (ff) {
      const ml = ff.querySelector("mat-label, label");
      if (ml && ml.textContent.trim()) return ml.textContent.trim();
    }
    if (el.placeholder) return el.placeholder.trim();
    return el.name || "";
  }
  function widgetLabel(el) {
    const ff = el.closest && el.closest("mat-form-field");
    if (ff) {
      const lab = ff.querySelector("mat-label, label");
      if (lab && lab.textContent.trim()) return lab.textContent.trim();
    }
    const al = el.getAttribute && el.getAttribute("aria-label");
    if (al) return al.trim();
    const lb = el.getAttribute && el.getAttribute("aria-labelledby");
    if (lb) {
      const n = document.getElementById(lb.split(/\s+/)[0]);
      if (n && n.textContent.trim()) return n.textContent.trim();
    }
    // fall back to preceding question text block
    let cur = el;
    for (let i = 0; i < 6 && cur; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      const q = cur.querySelector(":scope > label, :scope > legend, :scope > p, :scope > div > label");
      if (q && q.textContent.trim()) return q.textContent.trim().slice(0, 160);
    }
    return "";
  }
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
  function kindOf(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "select") return "select";
    if (tag === "textarea") return "textarea";
    const t = (el.type || "text").toLowerCase();
    if (["checkbox", "radio", "date", "email", "tel", "file", "number"].includes(t)) return t;
    return "text";
  }
  function nearestStableAnchor(el) {
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
    const scopeText = ff ? (ff.parentElement && ff.parentElement.textContent) || "" : "";
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
    try {
      input.focus && input.focus();
      input.click && input.click();
    } catch {}
    const found = await waitFor(() => {
      const o = overlayOptions();
      return o.length ? o : null;
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
    return options;
  }

  await waitFor(() => document.querySelector("input, textarea, select, mat-radio-group"), 10000, 250);
  await sleep(400);

  const out = {
    url: location.origin + location.pathname,
    title:
      ((document.querySelector("h1, h2") || {}).textContent || "").trim() || document.title,
    scrapedAt: new Date().toISOString(),
    textFields: [],
    selects: [],
    comboboxes: [],
    radioGroups: [],
    checkboxGroups: [],
  };

  const els = Array.from(document.querySelectorAll("input, textarea, select")).filter(
    (el) =>
      isVisible(el) &&
      !["hidden", "submit", "button", "reset"].includes((el.type || "").toLowerCase())
  );
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    const type = (el.type || "").toLowerCase();
    if (type === "radio" || type === "checkbox") continue;
    const id = el.id && !looksRandomId(el.id) ? el.id : null;
    const entry = {
      label: labelOf(el) || widgetLabel(el) || null,
      id,
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
  }

  for (const g of document.querySelectorAll("mat-radio-group, [role='radiogroup']")) {
    const options = Array.from(g.querySelectorAll("mat-radio-button, [role='radio']")).map(
      (b) => ({
        label: (b.textContent || "").trim().slice(0, 160),
        inputId: (b.querySelector("input") || {}).id || null,
      })
    );
    if (!options.length) continue;
    out.radioGroups.push({
      question: widgetLabel(g) || null,
      groupId: g.id && !looksRandomId(g.id) ? g.id : null,
      nthOnPage: out.radioGroups.length,
      anchor: nearestStableAnchor(g),
      options,
    });
  }

  const cbByName = {};
  for (const cb of document.querySelectorAll("input[type='checkbox']")) {
    const name = cb.getAttribute("name") || "__solo__" + (cb.id || "");
    (cbByName[name] = cbByName[name] || []).push(cb);
  }
  for (const [name, boxes] of Object.entries(cbByName)) {
    if (!boxes.some((b) => isVisible(b))) continue;
    out.checkboxGroups.push({
      runtimeName: name,
      nthOnPage: out.checkboxGroups.length,
      anchor: nearestStableAnchor(boxes[0]),
      options: boxes.map((b) => ({
        label: ((b.closest("label") || b.parentElement || b).textContent || "")
          .trim()
          .slice(0, 120),
        inputId: b.id && !looksRandomId(b.id) ? b.id : null,
      })),
    });
  }

  try {
    const store = JSON.parse(localStorage.getItem("ca_deep_scrape") || "{}");
    store[location.pathname] = out;
    localStorage.setItem("ca_deep_scrape", JSON.stringify(store));
  } catch {}

  return out;
})();
