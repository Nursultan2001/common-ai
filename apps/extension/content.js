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
      case "MMMM YYYY":
        return `${MONTHS[d.getUTCMonth()]} ${yyyy}`;
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
  // Collapse runs of whitespace so "F-1  Student" (Common App uses double spaces)
  // matches the stored "F-1 Student".
  const normText = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase();

  // Pick the best option for `want`, whitespace-insensitive. Priority:
  //   1. exact  2. option starts with want  3. SHORTEST option that contains want
  //   4. longest option that IS contained in want.
  // The "shortest contains" rule stops "F-1 Student" resolving to the longer
  // "F-2  Dependent of F-1 Student" (which also contains the phrase).
  function bestOption(nodes, want) {
    const w = normText(want);
    if (!w) return null;
    let prefix = null, contains = null, contained = null;
    for (const o of nodes) {
      const t = normText(o.textContent);
      if (!t) continue;
      if (t === w) return o;
      if (!prefix && t.startsWith(w)) prefix = o;
      if (t.includes(w)) {
        if (!contains || normText(contains.textContent).length > t.length) contains = o;
      } else if (w.includes(t) && t.length > 1) {
        if (!contained || normText(contained.textContent).length < t.length) contained = o;
      }
    }
    return prefix || contains || contained;
  }

  function pickOption(options, want) {
    return bestOption([...options], want);
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
      // Selecting a radio can reveal a dependent field; let it render.
      await sleep(250);
      return { source: mapping.source, status: mapping.requiresConfirm ? "filled-confirm" : "filled" };
    }

    // checkbox-map: check one or more boxes by exact selector from valueMap.
    // Value may be a list ("Male" or "Female; Male"). Used for gender/pronouns.
    // Optional `anchor`: a stable selector; checkboxes are matched only WITHIN
    // the anchor's block (so repeating groups like per-language proficiency,
    // which share option codes, resolve to the correct block).
    if (mapping.kind === "checkbox-map") {
      // Default split on , or ; — but some option labels contain commas, so a
      // field can pass an explicit `delimiter` (e.g. "||") instead.
      const delim = mapping.delimiter ? mapping.delimiter : /[;,]/;
      const wants = String(value).split(delim).map((s) => s.trim()).filter(Boolean);
      let scope = document;
      if (mapping.anchor) {
        const a = document.querySelector(mapping.anchor);
        if (!a) return { source: mapping.source, status: "anchor-not-found" };
        let cur = a;
        for (let i = 0; i < 10 && cur; i++) {
          cur = cur.parentElement;
          if (cur && cur.querySelector("input[type='checkbox'], mat-checkbox, [role='checkbox']")) {
            scope = cur;
            break;
          }
        }
      }
      let any = false;
      const missed = [];
      // Apostrophe-tolerant valueMap lookup: Common App labels use a curly
      // apostrophe (’); stored values may use a straight one ('). Match either.
      const norm = (s) => String(s).replace(/[‘’′]/g, "'").trim();
      const vmap = mapping.valueMap || {};
      const normMap = {};
      for (const k of Object.keys(vmap)) normMap[norm(k)] = vmap[k];
      for (const w of wants) {
        const sel = vmap[w] || normMap[norm(w)];
        if (!sel) { missed.push(w); continue; }
        const cb = scope.querySelector(sel);
        if (!cb) { missed.push(w); continue; }
        const checked = cb.checked || cb.getAttribute("aria-checked") === "true";
        if (!checked) (cb.closest("label") || cb).click();
        markFilled(cb.closest("label") || cb, mapping.requiresConfirm);
        any = true;
      }
      if (!any) return { source: mapping.source, status: "no-matching-option", value };
      return {
        source: mapping.source,
        status: mapping.requiresConfirm ? "filled-confirm" : "filled",
        missed: missed.length ? missed : undefined,
      };
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
      case "multi-combobox": {
        // A combobox that accepts several selections (Common App "Tests Taken"
        // → "Indicate all tests"; per-course "schedule"). CLICK to open and use
        // THIS field's own listbox (via aria-controls) — a global overlay lookup
        // mis-resolves across repeated fields, so only the first one filled.
        const wants = String(value).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
        if (el.focus) el.focus();
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el.click();
        el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
        const owns = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
        const lb = await waitFor(
          () =>
            (owns && document.getElementById(owns)) ||
            [...document.querySelectorAll("[role='listbox']")].filter((x) => x.offsetParent !== null).pop(),
          1500
        );
        let any = false;
        const missed = [];
        if (lb) {
          for (const w of wants) {
            const nodes = [...lb.querySelectorAll("[role='option'], li, mat-option")];
            const opt = bestOption(nodes, w);
            if (opt) {
              ["mousedown", "mouseup", "click"].forEach((t) =>
                opt.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
              );
              any = true;
              await sleep(200);
            } else missed.push(w);
          }
        }
        document.body.click();
        await sleep(150);
        markFilled(el, mapping.requiresConfirm);
        if (!any) return { source: mapping.source, status: "no-matching-option", value };
        return {
          source: mapping.source,
          status: mapping.requiresConfirm ? "filled-confirm" : "filled",
          missed: missed.length ? missed : undefined,
        };
      }
      case "click-times": {
        // Click a button N times to reveal repeating blocks (e.g. Common App
        // "Add another honors"). N comes from the value (a count string).
        const n = parseInt(String(v), 10);
        if (!Number.isFinite(n) || n <= 0) return { source: mapping.source, status: "skip-empty" };
        for (let i = 0; i < n; i++) {
          if (!el || el.offsetParent === null) break;
          el.click();
          await sleep(450);
        }
        return { source: mapping.source, status: "filled" };
      }
      case "combo-pick": {
        // Open a combobox and CLICK the matching option — no typing. Some Common
        // App comboboxes (e.g. phone country code) don't filter on synthetic
        // input, so type-then-pick leaves the default. Options live in a listbox
        // referenced by aria-controls (fallback: any visible listbox).
        el.focus();
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el.click();
        el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
        const owns = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
        const lb = await waitFor(
          () =>
            (owns && document.getElementById(owns)) ||
            [...document.querySelectorAll("[role='listbox']")].filter((x) => x.offsetParent !== null).pop(),
          1500
        );
        if (!lb) return { source: mapping.source, status: "dropdown-did-not-open" };
        const nodes = [...lb.querySelectorAll("[role='option'], li, mat-option")];
        const opt = bestOption(nodes, v);
        if (!opt) {
          document.body.click();
          return { source: mapping.source, status: "no-matching-option", value: v };
        }
        ["mousedown", "mouseup", "click"].forEach((t) =>
          opt.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
        );
        markFilled(el, mapping.requiresConfirm);
        await sleep(150);
        return { source: mapping.source, status: mapping.requiresConfirm ? "filled-confirm" : "filled" };
      }
      case "richtext": {
        // CKEditor 5 (Common App "why you left" box). Prefer the editor's own
        // API (the DOM is reconstructed from the model, so writing innerHTML
        // alone won't stick); fall back to contenteditable for plain editors.
        const esc = (s) =>
          String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const html = String(v)
          .split(/\n{2,}/)
          .map((para) => "<p>" + para.split(/\n/).map(esc).join("<br>") + "</p>")
          .join("");
        if (el.ckeditorInstance && typeof el.ckeditorInstance.setData === "function") {
          el.ckeditorInstance.setData(html);
        } else {
          if (el.focus) el.focus();
          el.innerHTML = html;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          if (el.blur) el.blur();
        }
        markFilled(el, true);
        return { source: mapping.source, status: "filled-confirm" };
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

  // school-lookup: a multi-step modal macro for the Secondary/High School page.
  // Most non-US schools aren't in Common App's registry, so we drive the
  // "I don't see my high school in this list" manual-entry path:
  //   1. open the Find-school dialog, 2. type the name to surface the list,
  //   3. select the "not listed" option (Material list items need a full
  //      mousedown/mouseup/click to register), 4. Continue to School
  //      Information, 5. fill name/country/type/address/city/state/zip,
  //   6. Continue (which is what actually saves the school).
  // Skips itself when highSchoolNotListed == "No" (student picks from the list
  // themselves) or when no school name is stored. Never invents a value.
  async function fillSchoolLookup(mapping, payload) {
    const notListed = get(payload, mapping.source);
    const name = get(payload, mapping.nameSource || "profile.highSchoolName");
    if (!name) return { source: mapping.source, status: "empty" };
    if (String(notListed).trim().toLowerCase() === "no") {
      return { source: mapping.source, status: "skipped-school-in-list" };
    }

    const fullClick = (el) =>
      ["mousedown", "mouseup", "click"].forEach((t) =>
        el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
      );

    // 1. open the Find-school dialog.
    const trigger = findEl([mapping.trigger]);
    if (!trigger) return { source: mapping.source, status: "find-button-not-found" };
    trigger.click();

    // 2. wait for the search box, type the school name to surface the list.
    const search = await waitFor(() => findEl([mapping.search]), 3000);
    if (!search) return { source: mapping.source, status: "lookup-modal-not-open" };
    search.focus();
    setNativeValue(search, String(name));
    search.dispatchEvent(new Event("keyup", { bubbles: true }));

    // 3. select the "I don't see my high school in this list" option.
    const wantTxt = (mapping.notListedText || "see my high school in this list").toLowerCase();
    const opt = await waitFor(() => {
      const opts = document.querySelectorAll(
        "ca-single-selection-list-option, [id='selectionListResult'], .ca-list-item, [role='option']"
      );
      for (const o of opts) {
        if ((o.textContent || "").trim().toLowerCase().includes(wantTxt)) return o;
      }
      return null;
    }, 4000);
    if (!opt) return { source: mapping.source, status: "not-listed-option-missing" };
    fullClick(opt);
    await sleep(300);

    // 4. Continue → advances to the School Information form.
    const cont1 = findEl([mapping.lookupContinue]);
    if (!cont1) return { source: mapping.source, status: "lookup-continue-not-found" };
    fullClick(cont1);

    // 5. wait for the manual-entry form, then fill each field. Country / school
    // type / state are comboboxes — smartFillText (via fillField default) types
    // and clicks the matching overlay option.
    const firstField = (mapping.modalFields || [])[0];
    const ready = await waitFor(() => firstField && findEl(firstField.selectors), 3000);
    if (!ready) return { source: mapping.source, status: "school-info-modal-not-open" };

    const sub = [];
    for (const f of mapping.modalFields || []) {
      sub.push((await fillField(f, get(payload, f.source))) || { source: f.source, status: "empty" });
      await sleep(120);
    }

    // 6. Continue saves the manually-entered school and closes the modal.
    const cont2 = findEl([mapping.modalContinue || mapping.lookupContinue]);
    if (cont2) {
      fullClick(cont2);
      await sleep(300);
    }

    const filled = sub.filter((r) => r.status && String(r.status).startsWith("filled")).length;
    return {
      source: mapping.source,
      status: "filled-confirm",
      detail: `school manual-entry: ${filled}/${(mapping.modalFields || []).length} fields`,
      sub,
    };
  }

  // courses-grid: the Courses & Grades transcript modal (pages 13/55–13/58).
  //   1. open the grade's grid (#addCG), 2. fill the transcript header
  //      (school/year/scale/schedule mat-selects), 3. fill each course into a
  //      row (Subject mat-select, Course Name text, Course Level mat-select),
  //      adding rows when needed, 4. remove leftover empty rows (with their
  //      confirm dialog), 5. Continue to save the grid.
  // Skips when the grade has no courses (the student instead ticks "I have
  // reported all" on the page, handled as a separate checkbox field).
  async function fillCoursesGrid(mapping, payload) {
    const data = get(payload, mapping.source);
    const courses = (data && Array.isArray(data.courses)) ? data.courses.filter(
      (c) => c && (c.subject || c.courseName || c.courseLevel)
    ) : [];
    if (!data || courses.length === 0) {
      return { source: mapping.source, status: "skip-no-courses" };
    }

    const fullClick = (el) =>
      ["mousedown", "mouseup", "click"].forEach((t) =>
        el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
      );
    const dlg = () => document.querySelector("mat-dialog-container, [role='dialog']");
    const dlgBtn = (re) => {
      const d = dlg();
      if (!d) return null;
      return Array.from(d.querySelectorAll("button")).find((b) => re.test((b.textContent || "").trim()));
    };
    const setText = (el, v) => {
      setNativeValue(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    };

    // 1. open the modal.
    const trigger = findEl([mapping.trigger || "#addCG"]);
    if (!trigger) return { source: mapping.source, status: "add-grade-button-not-found" };
    trigger.click();
    const ready = await waitFor(() => document.getElementById("schoolNameControl1"), 3500);
    if (!ready) return { source: mapping.source, status: "grid-modal-not-open" };

    const sub = [];
    const matById = async (id, val) => {
      if (!val) return;
      const el = document.getElementById(id);
      if (!el) { sub.push({ source: id, status: "field-not-found" }); return; }
      const r = await fillMatSelect(el, val);
      sub.push({ source: id, status: r === "filled" ? "filled" : r, value: val });
      await sleep(150);
    };

    // 2. transcript header.
    await matById("schoolNameControl1", data.schoolName);
    await matById("schoolYearControl1", data.schoolYear);
    await matById("gradingScaleControl1", data.gradingScale);
    await matById("scheduleControl1", data.schedule);

    // 3. courses — one per row (T1C1, T1C2, …), adding rows as needed.
    for (let i = 0; i < courses.length; i++) {
      const n = i + 1;
      let subjEl = document.getElementById(`subjectControl_T1C${n}`);
      if (!subjEl) {
        const add = dlgBtn(/add another course/i);
        if (add) fullClick(add);
        subjEl = await waitFor(() => document.getElementById(`subjectControl_T1C${n}`), 2500);
      }
      if (!subjEl) { sub.push({ source: `course ${n}`, status: "row-not-created" }); continue; }
      const c = courses[i];
      if (c.subject) { await fillMatSelect(subjEl, c.subject); await sleep(120); }
      const nameEl = document.getElementById(`courseNameControl_T1C${n}`);
      if (nameEl && c.courseName) setText(nameEl, c.courseName);
      const lvlEl = document.getElementById(`levelControl_T1C${n}`);
      if (lvlEl && c.courseLevel) { await fillMatSelect(lvlEl, c.courseLevel); await sleep(120); }

      // Per-term grades (mat-select) + credits (text). Which term columns render
      // depends on the schedule chosen above; the cell ids are stable:
      //   grade{key}Control_T1C{n} / credit{key}Control_T1C{n}, key ∈ 1..4|Final.
      const TERM_KEYS = {
        Yearly: ["Final"], Semesters: ["1", "2", "Final"],
        Trimesters: ["1", "2", "3", "Final"], Quarters: ["1", "2", "3", "4", "Final"],
        Other: ["Final"],
      };
      const keys = TERM_KEYS[data.schedule] || ["Final"];
      // "N/A" (course carries no credit) — tick it before touching credit inputs.
      if (c.creditNA) {
        const na = document.getElementById(`creditNA_T1C${n}-input`);
        if (na && !na.checked) fullClick(na.closest("label") || na);
        await sleep(120);
      }
      for (const k of keys) {
        const g = c[`grade${k}`];
        if (g) {
          const ge = document.getElementById(`grade${k}Control_T1C${n}`);
          if (ge && ge.offsetParent !== null) { await fillMatSelect(ge, g); await sleep(100); }
        }
        if (!c.creditNA) {
          const cr = c[`credit${k}`];
          const ce = document.getElementById(`credit${k}Control_T1C${n}`);
          if (cr && ce && ce.offsetParent !== null) setText(ce, cr);
        }
      }
      sub.push({ source: `course ${n}`, status: "filled" });
    }

    // 4. remove leftover empty rows (fresh grid starts with 2; confirm dialog).
    for (let guard = 0; guard < 6; guard++) {
      const rows = document.querySelectorAll('[id^="subjectControl_T1C"]').length;
      if (rows <= courses.length) break;
      const dels = dlg() ? dlg().querySelectorAll(".course__delete, button[aria-label^='Remove transcript']") : [];
      const del = dels[dels.length - 1];
      if (!del) break;
      fullClick(del);
      await sleep(400);
      // a confirm dialog may open — click its confirm button.
      const confirm = await waitFor(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        return btns.find((b) => /^(remove|delete|yes|confirm)\b/i.test((b.textContent || "").trim()));
      }, 1200);
      if (confirm) { fullClick(confirm); await sleep(400); }
    }

    // 5. Continue saves the grid and closes the modal.
    const cont = dlgBtn(/continue/i);
    if (cont) { fullClick(cont); await sleep(500); }

    const filled = sub.filter((r) => r.status === "filled").length;
    return {
      source: mapping.source,
      status: "filled-confirm",
      detail: `${data.schoolName || "transcript"}: ${courses.length} course(s), ${filled} fields ok`,
      sub,
    };
  }

  async function applyPage(pageMap, payload) {
    const report = [];

    for (const m of pageMap.fields || []) {
      if (m.kind === "school-lookup") {
        report.push(await fillSchoolLookup(m, payload));
        continue;
      }
      if (m.kind === "courses-grid") {
        report.push(await fillCoursesGrid(m, payload));
        continue;
      }
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
    // Save the page by clicking its "Continue" button. Common App does NOT
    // autosave on field change — Continue is the only thing that persists a page.
    // Returns whether it saved (advanced) or was blocked by validation errors.
    if (msg.type === "CLICK_CONTINUE") {
      clickContinue().then(sendResponse);
      return true;
    }
    // Clear every answer the autofill (or the student) entered on THIS page.
    if (msg.type === "CLEAR_CURRENT_PAGE") {
      clearPage().then(sendResponse);
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

  // Click the page's "Continue" button to SAVE it (Common App only persists a
  // page on Continue, not on field change). Returns whether it saved (advanced)
  // or was blocked by validation. Never clicks Submit/Pay (those are gated).
  async function clickContinue() {
    const before = location.href;
    let btn = null;
    for (const b of document.querySelectorAll(
      "button, input[type='submit'], a[role='button']"
    )) {
      const t = (b.textContent || b.value || "").trim().toLowerCase();
      // Match Continue / "Continue to next section". Never submit/pay/confirm.
      if (/\bcontinue\b/.test(t) && !/submit|pay|confirm/.test(t)) {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && !b.disabled) {
          btn = b;
          break;
        }
      }
    }
    if (!btn) return { ok: true, clicked: false, saved: false, reason: "no-continue-button" };
    btn.click();
    // Saved+advanced => the SPA route (URL) changes. Blocked => stays + shows errors.
    const advanced = await waitFor(() => location.href !== before, 4500, 150);
    await sleep(300);
    const errors = document.querySelectorAll(
      "mat-error, [role='alert'], .mat-mdc-form-field-error, .ca-error, .error-message"
    ).length;
    return { ok: true, clicked: true, saved: !!advanced, advanced: !!advanced, errors };
  }

  // Clear every answer entered on THIS page (best-effort). Common App has no
  // single "reset" — we click each "Clear answer"/"Clear selection" control,
  // empty text/combobox inputs, uncheck boxes, and blank rich-text editors.
  // NOTE: Common App won't SAVE an empty required field, so required pages clear
  // visually but revert on reload unless re-answered. Never touches Submit/Pay.
  async function clearPage() {
    let cleared = 0;
    const isCky = (el) => /cky|consent/i.test(el.id || "") || el.closest("#cookieConsent, .cky-consent-container");

    // 1) "Clear answer" / "Clear selection" buttons (radios + checkbox lists).
    //    Re-query across a few passes since clearing can re-render the page.
    for (let pass = 0; pass < 4; pass++) {
      const btns = [...document.querySelectorAll("button")].filter((b) => {
        const t = (b.textContent || "").trim().toLowerCase();
        return (t === "clear answer" || t === "clear selection") && b.offsetParent !== null && !b.disabled;
      });
      if (!btns.length) break;
      for (const b of btns) { try { b.click(); cleared++; await sleep(90); } catch {} }
      await sleep(220);
    }

    // 2) Combobox/select clear (×) controls scoped to a field.
    for (const x of document.querySelectorAll(
      "[aria-label='Clear'], [aria-label='Clear selection'], [aria-label^='Clear ' i], button.mat-mdc-select-clear"
    )) {
      if (x.offsetParent !== null && !isCky(x)) { try { x.click(); cleared++; await sleep(60); } catch {} }
    }

    // 3) Empty remaining text inputs / textareas / comboboxes (Common App ques_*).
    for (const el of document.querySelectorAll(
      "input[id*='ques_'], textarea[id*='ques_'], input[role='combobox']"
    )) {
      if (el.type === "radio" || el.type === "checkbox" || isCky(el)) continue;
      if (el.value) {
        setNativeValue(el, "");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (el.blur) el.blur();
        cleared++;
      }
    }

    // 4) Uncheck anything still checked (skip cookie-consent toggles).
    for (const el of document.querySelectorAll("input[type='checkbox'], input[type='radio']")) {
      if (el.checked && !isCky(el)) { (el.closest("label") || el).click(); cleared++; await sleep(40); }
    }

    // 5) Rich-text editors (CKEditor).
    for (const ck of document.querySelectorAll(".ck-content[contenteditable='true']")) {
      try {
        if (ck.ckeditorInstance && typeof ck.ckeditorInstance.setData === "function") {
          ck.ckeditorInstance.setData("");
        } else { ck.innerHTML = "<p><br></p>"; ck.dispatchEvent(new Event("input", { bubbles: true })); }
        cleared++;
      } catch {}
    }

    return { ok: true, cleared };
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

    // Fire-and-forget fill telemetry (drift detection). The background worker
    // holds the token and posts it; never blocks or errors the fill.
    try {
      chrome.runtime.sendMessage({
        type: "REPORT_TELEMETRY",
        data: {
          fieldMapKey: payload.fieldMapKey,
          pageName: page.name,
          pageUrl: location.href,
          fields: report.map((r) => ({ source: r.source, status: r.status })),
        },
      });
    } catch (_e) {}

    return { ok: true, matched: true, filled, pageName: page.name, report };
  }
})();
