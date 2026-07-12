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
      case "MM/YYYY":
        return `${mm}/${yyyy}`;
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

  // Trusted-event bridge to the service worker. Common App's ng-select CA-
  // CONTROL-WRAPPER ignores synthetic (isTrusted=false) events for the model
  // updates that Continue actually saves. These helpers ask the background SW
  // to fire REAL events via chrome.debugger / CDP. Returns {ok:true} on
  // success — content scripts can fall back to synthetic if !ok (e.g. user
  // cancelled the debugger banner).
  const trustedSend = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          // Swallow lastError (background may be transitioning); treat as failure.
          const _err = chrome.runtime.lastError;
          resolve(r && r.ok ? r : { ok: false, error: (_err && _err.message) || (r && r.error) || "no-response" });
        });
      } catch (_e) {
        resolve({ ok: false, error: "sendMessage-threw" });
      }
    });
  // Click at the CENTER of a given element via a trusted CDP mouse event.
  // Scrolls the element into view first so the coordinates are inside the
  // viewport (CDP coords are viewport-relative).
  async function trustedClickEl(el) {
    if (!el) return { ok: false, error: "no-el" };
    try { el.scrollIntoView({ block: "center", inline: "center" }); } catch (_e) {}
    // CRITICAL: wait for the element's on-screen position to STABILIZE before
    // measuring. scrollIntoView + Angular's dropdown-repositioning animate over
    // several frames; measuring too early gave a stale y and the click landed on
    // the NEXT option down (the "picked Duolingo instead of IELTS" bug). Poll the
    // rect until it holds steady for 3 consecutive frames.
    let lastKey = null, stable = 0;
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const rr = el.getBoundingClientRect();
      const key = Math.round(rr.top) + "," + Math.round(rr.left);
      if (key === lastKey) { if (++stable >= 3) break; } else { stable = 0; lastKey = key; }
    }
    await sleep(40);
    // Verify it's actually in the viewport now; if not, one more scroll+settle.
    let r = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.top < 0 || r.bottom > vh) {
      try { el.scrollIntoView({ block: "center" }); } catch (_e) {}
      await sleep(120);
      r = el.getBoundingClientRect();
    }
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    if (r.width === 0 || r.height === 0 || x < 0 || y < 0 || x > vw || y > vh) {
      return { ok: false, error: `off-screen (${x},${y} vs ${vw}x${vh})` };
    }
    // Guard against a mis-hit: confirm the element the browser would click at
    // (x,y) is our target (or a descendant). If not, don't fire a wrong click.
    try {
      const top = document.elementFromPoint(x, y);
      if (top && !(el === top || el.contains(top) || top.contains(el))) {
        return { ok: false, error: "occluded", occludedBy: (top.className || top.tagName || "").toString().slice(0, 40) };
      }
    } catch (_e) {}
    const res = await trustedSend({ type: "TRUSTED_CLICK", x, y });
    if (!res.ok) console.warn("[CommonAI] trusted click failed:", res.error, "at", x, y);
    return res;
  }
  const trustedKey = (key) => trustedSend({ type: "TRUSTED_KEY", key });
  const trustedType = (text) => trustedSend({ type: "TRUSTED_TYPE", text });
  const trustedRelease = () => trustedSend({ type: "TRUSTED_RELEASE" });

  // Bridge to the MAIN-world ca-bridge.js (Common App direct-save API). We post a
  // request and await the matching response by id. The bridge holds the auth +
  // option-code maps; the isolated content script never sees the token.
  let __caSeq = 0;
  function caCall(payload, timeoutMs) {
    return new Promise((resolve) => {
      const id = "ca_" + Date.now() + "_" + ++__caSeq;
      const timer = setTimeout(() => { window.removeEventListener("message", onMsg); resolve(null); }, timeoutMs || 8000);
      function onMsg(ev) {
        if (ev.source !== window || !ev.data || ev.data.__caRes !== true || ev.data.id !== id) return;
        clearTimeout(timer); window.removeEventListener("message", onMsg);
        resolve(ev.data);
      }
      window.addEventListener("message", onMsg);
      window.postMessage(Object.assign({ __caReq: true, id }, payload), "*");
    });
  }
  async function caSave({ questionId, value, isMulti, raw }) {
    // The bridge captures auth from the app's own requests on page load; if the
    // extension runs before that happens, the first save reports no auth. Retry
    // a few times (waiting for auth) before giving up.
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = await caCall({ op: "save", questionId, value, isMulti: !!isMulti, raw: !!raw });
      const res = r ? (r.result || {}) : { ok: false, error: "bridge-unavailable" };
      if (res.ok) return res;
      const e = String(res.error || "");
      if (r === null || e === "no-auth-captured" || e === "bridge-unavailable") {
        await sleep(700);
        continue;
      }
      return res; // a real (non-auth) error — surface it
    }
    return { ok: false, error: "no-auth-after-retries" };
  }
  async function caStatus() {
    const r = await caCall({ op: "status" }, 3000);
    return r ? r.result : null;
  }

  // Common App shows a full-screen ".backdrop.full-screen" loading overlay while
  // a section loads. In automated/slow-network conditions it can get STUCK, and
  // because it sits above everything it swallows real (coordinate) clicks and can
  // steal keyboard focus. Remove any that are covering the page before we drive a
  // control. (Harmless when none is present.)
  function removeLoadingBackdrops() {
    try {
      document.querySelectorAll(".backdrop.full-screen, .backdrop").forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.width > 400 && r.height > 400) b.remove();
      });
    } catch (_e) {}
  }

  // Drive an ng-select (Common App "Testing" fields: the tests multi-select AND
  // every SAT/ACT/IELTS score dropdown) the way a REAL user does, over the
  // chrome.debugger bridge. Required because Common App's ng-select only PERSISTS
  // a change from a genuine trusted gesture — synthetic events show the chip but
  // never fire the /answer save, so the value vanishes on the next load.
  //
  // Recipe per value (exactly what a person does — "open, find it, click it"):
  //   1. open the panel (trusted click on the ng-select-container)
  //   2. type to FILTER so only the wanted option remains — this collapses the
  //      list to a single row in a stable, on-screen position, so the click can
  //      NEVER land on a neighbouring option (the old bug), and no scrolling of a
  //      long list is needed.
  //   3. trusted CLICK the option. (A click persists; a keyboard Enter after a
  //      filter serialized a MALFORMED value on Common App and did NOT save — so
  //      we click, never Enter.)
  //   4. verify the chip; then blur (trusted Tab) which flushes the save.
  // Returns { ok, picked, missed }. ok=false (debugger attach refused / occluded)
  // lets the caller fall back to a synthetic, visual-only pick.
  async function fillNgSelectTrusted(el, values) {
    const ng = el.closest(".ng-select, ng-select");
    if (!ng) return { ok: false, error: "not-ng-select", picked: [] };
    const input = ng.querySelector("input") || el;
    const container = ng.querySelector(".ng-select-container") || ng;
    const isVis = (x) => { try { return getComputedStyle(x).display !== "none"; } catch (_e) { return false; } };
    const openPanel = () =>
      [...document.querySelectorAll(".ng-dropdown-panel, [role='listbox']")].filter(isVis).pop() || null;
    const chipText = () => [...ng.querySelectorAll(".ng-value-label")].map((c) => normText(c.textContent));
    const setFilter = (t) => { try { setNativeValue(input, t); input.dispatchEvent(new Event("input", { bubbles: true })); } catch (_e) {} };
    const closePanel = async () => {
      try { input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape", code: "Escape" })); } catch (_e) {}
      await waitFor(() => !openPanel(), 600);
    };

    removeLoadingBackdrops();
    try { input.focus(); } catch (_e) {}
    // A trusted ArrowDown attaches the debugger (and opens the panel). If the
    // bridge is unavailable, bail so the caller can try a synthetic pick.
    const attach = await trustedKey("ArrowDown");
    if (!(attach && attach.ok)) return { ok: false, error: (attach && attach.error) || "no-bridge", picked: [] };
    await sleep(200);
    await closePanel();

    const picked = [];
    for (const raw of values) {
      const want = String(raw).trim();
      if (!want) continue;
      if (chipText().includes(normText(want))) { picked.push(want); continue; } // already selected
      let landed = false;
      for (let attemptN = 0; attemptN < 2 && !landed; attemptN++) {
        removeLoadingBackdrops();
        // 1. open
        try { input.focus(); } catch (_e) {}
        let panel = openPanel();
        if (!panel) { await trustedClickEl(container); panel = await waitFor(openPanel, 1200); }
        if (!panel) { await closePanel(); continue; }
        // 2. filter to the wanted option (synthetic input is enough to filter;
        //    only the SELECTION needs to be trusted).
        setFilter(want);
        const opt = await waitFor(() => {
          const p = openPanel();
          if (!p) return null;
          return bestOption([...p.querySelectorAll(".ng-option:not(.ng-option-disabled)")], want);
        }, 1600);
        if (!opt) { setFilter(""); await closePanel(); continue; }
        // 3. trusted click on the (now isolated, on-screen) option.
        const cr = await trustedClickEl(opt);
        await sleep(320);
        landed = chipText().includes(normText(want));
        if (!landed && cr && !cr.ok) {
          // Trusted click blocked (occluded/off-screen). Synthetic as last resort
          // so it at least shows; won't persist, but no worse.
          ["mousedown", "mouseup", "click"].forEach((t) =>
            opt.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
          );
          await sleep(200);
          landed = chipText().includes(normText(want));
        }
        setFilter("");
        // Single-selects close on pick; multi-selects stay open. Reset either way.
        await closePanel();
      }
      if (landed) picked.push(want);
    }
    // Blur commits the save.
    await trustedKey("Tab");
    await sleep(500);
    return { ok: picked.length > 0, picked, missed: values.map((v) => String(v).trim()).filter((v) => v && !picked.includes(v)) };
  }

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

  // Some Common App mat-selects (notably inside the Courses & Grades modal) do
  // NOT auto-close on selection. Left open, they stack and — worse — a global
  // option lookup would then read options from EVERY open panel, so a later
  // field resolves to the wrong option. So: scope to the NEWEST open panel, and
  // hide each panel after use so it neither stacks nor pollutes later lookups.
  function newestPanel() {
    const panels = [...document.querySelectorAll(".mat-mdc-select-panel, .mat-select-panel, .cdk-overlay-pane [role='listbox']")]
      .filter((p) => p.offsetParent !== null);
    return panels[panels.length - 1] || null;
  }
  function hidePanel(panel) {
    try { (panel.closest(".cdk-overlay-pane") || panel).style.display = "none"; } catch (_e) {}
  }
  // CRITICAL for the Courses & Grades modal (and any mat-select rendered inside a
  // mat-dialog): these selects do NOT auto-close on selection. Each one leaves a
  // full-screen `.cdk-overlay-transparent-backdrop` (pointer-events:auto) stacked
  // ABOVE the dialog. After the first select or two those backdrops swallow every
  // subsequent click — schedule won't change, "Add another course" does nothing,
  // and "Continue" never fires, so the whole transcript is discarded (nothing
  // saves). Neutralize them (and any orphaned select pane) so the modal surface
  // stays clickable. The dialog's own dark backdrop is left untouched.
  function purgeSelectOverlays() {
    try {
      // Fully REMOVE the zombie overlays rather than just hiding them. Over an
      // 18-course grade (18 × ~7 selects) hidden nodes would otherwise pile up
      // into ~120+ detached-but-present backdrops/panes, bloating the DOM and
      // slowing every later course to a crawl. Removal is safe: CDK's own
      // disposal calls `.remove()` too, which is a no-op on an already-detached
      // node, and the dialog's own pane/backdrop are never matched here.
      document.querySelectorAll(".cdk-overlay-transparent-backdrop").forEach((b) => b.remove());
      document.querySelectorAll(".cdk-overlay-pane").forEach((p) => {
        if (!p.querySelector("mat-dialog-container") &&
            p.querySelector(".mat-mdc-select-panel, .mat-select-panel, [role='listbox']")) {
          p.remove();
        }
      });
    } catch (_e) {}
  }
  async function fillMatSelect(el, value) {
    const trigger = el.closest("mat-select") || el.querySelector("mat-select, [role='combobox']") || el;
    // Clear any leftover select overlay first so this trigger.click() actually
    // reaches the trigger instead of a stray backdrop.
    purgeSelectOverlays();
    trigger.click();
    let panel = await waitFor(() => newestPanel(), 1200);
    // A select left "open" in Angular's state (its panel was hidden, not closed)
    // toggles CLOSED on the next click. If nothing opened, click once more.
    if (!panel) { trigger.click(); panel = await waitFor(() => newestPanel(), 1200); }
    if (!panel) { purgeSelectOverlays(); return "dropdown-did-not-open"; }
    const opt = await waitFor(
      () => pickOption(panel.querySelectorAll(".mat-mdc-option, mat-option, [role='option']"), value),
      1500
    );
    if (!opt) {
      hidePanel(panel);
      purgeSelectOverlays();
      return "no-matching-option";
    }
    opt.click();
    hidePanel(panel);
    purgeSelectOverlays();
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

    // ca-answer: save directly through Common App's own /answer API (via the
    // MAIN-world bridge), instead of driving the ng-select UI. Used for the
    // "Testing" section, whose components refuse to persist simulated events.
    // mapping: { source, questionId, isMulti?, raw?, format? }
    if (mapping.kind === "ca-answer") {
      let out = value;
      if (mapping.format) out = formatDate(value, mapping.format); // date → API string
      const r = await caSave({ questionId: mapping.questionId, value: out, isMulti: !!mapping.isMulti, raw: !!mapping.raw });
      if (r && r.ok) return { source: mapping.source, status: "filled-api", questionId: mapping.questionId };
      return { source: mapping.source, status: "api-failed", questionId: mapping.questionId, note: (r && (r.error || r.status)) || "no-response" };
    }

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
        // A combobox accepting several selections — Common App "Tests Taken" →
        // "Indicate all tests". This is an ng-select, which only PERSISTS a change
        // that comes from a genuine trusted gesture (see fillNgSelectTrusted).
        // Drive it over the chrome.debugger keyboard bridge, coordinate-free.
        const wants = String(value).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
        const r = await fillNgSelectTrusted(el, wants);
        markFilled(el, mapping.requiresConfirm);
        if (!r.ok) {
          // Debugger unavailable (attach refused / DevTools open). Fall back to a
          // synthetic pick so the chips at least show — they won't persist, but
          // nothing is worse off, and pages without the wrapper still save.
          const wrap = el.closest(".ng-select, ng-select") || el.parentElement;
          const input = (wrap && wrap.querySelector("input")) || el;
          const isVis = (x) => { try { return getComputedStyle(x).display !== "none"; } catch (_e) { return false; } };
          const panel = () => [...document.querySelectorAll(".ng-dropdown-panel, [role='listbox']")].filter(isVis).pop() || null;
          const chips = () => [...wrap.querySelectorAll(".ng-value-label")].map((c) => normText(c.textContent));
          for (const w of wants) {
            if (chips().includes(normText(w))) continue;
            (wrap.querySelector(".ng-select-container") || input).dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            input.focus();
            setNativeValue(input, w); input.dispatchEvent(new Event("input", { bubbles: true }));
            const opt = await waitFor(() => { const p = panel(); return p ? bestOption([...p.querySelectorAll(".ng-option")], w) : null; }, 1200);
            if (opt) ["mousedown", "mouseup", "click"].forEach((t) => opt.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })));
            setNativeValue(input, ""); input.dispatchEvent(new Event("input", { bubbles: true }));
            await sleep(150);
          }
          document.body.click();
          return { source: mapping.source, status: "filled-synthetic-unverified", note: r.error };
        }
        return {
          source: mapping.source,
          status: mapping.requiresConfirm ? "filled-confirm" : "filled",
          missed: r.missed && r.missed.length ? r.missed : undefined,
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
        // input, so type-then-pick leaves the default.
        //
        // Two flavours coexist on Common App:
        //   A) mat-select — synthetic mousedown+click works, model updates via
        //      Angular Material's own change handling. This is the ORIGINAL v0.2.4
        //      behavior — DO NOT engage chrome.debugger here (attaching for every
        //      field would spam the banner and break if the user has DevTools open).
        //   B) ng-select wrapped in CA-CONTROL-WRAPPER — the wrapper filters
        //      synthetic events, so the picked value visually appears but never
        //      persists on Continue. Use a trusted CDP click just for this case.
        const inNgSelect = !!el.closest(".ng-select, ng-select");
        const isOpen = (x) => {
          try { return getComputedStyle(x).display !== "none"; } catch (_e) { return false; }
        };

        // ng-select (Common App Testing score dropdowns): only a trusted gesture
        // persists. Use the coordinate-free keyboard helper; fall through to the
        // synthetic path only if the debugger bridge is unavailable.
        if (inNgSelect) {
          const r = await fillNgSelectTrusted(el, [v]);
          if (r.ok) {
            markFilled(el, mapping.requiresConfirm);
            return { source: mapping.source, status: mapping.requiresConfirm ? "filled-confirm" : "filled" };
          }
          // else: fall through to synthetic (visual-only) below.
        }

        // -- Open the dropdown (synthetic; works for mat-select, and the
        //    visual-only fallback for ng-select when the debugger is unavailable).
        el.focus();
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el.click();
        el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
        const owns = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
        const lb = await waitFor(
          () => {
            const byId = owns && document.getElementById(owns);
            if (byId && isOpen(byId)) return byId;
            const c = [...document.querySelectorAll("[role='listbox'], .ng-dropdown-panel")].filter(isOpen);
            return c[c.length - 1] || null;
          },
          1500
        );
        if (!lb) return { source: mapping.source, status: "dropdown-did-not-open" };
        const nodes = [...lb.querySelectorAll("[role='option'], li, mat-option, .ng-option")];
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
        return {
          source: mapping.source,
          status: inNgSelect ? "filled-synthetic-unverified" : (mapping.requiresConfirm ? "filled-confirm" : "filled"),
        };
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

    const sub = [];

    // 0. gating question. The 12th-grade page (and any grade the app treats as
    // "in progress") hides the transcript behind a REQUIRED "Do you have Nth
    // grade courses on your transcript with official grades?" Yes/No. If it's
    // left unanswered, Common App silently DISCARDS the whole transcript on save
    // (the grid opens and fills, Continue closes it, but nothing persists). We
    // only reach here when there ARE courses to report, so answer Yes first.
    try {
      if (/do you have[\s\S]*?courses[\s\S]*?official grades/i.test(document.body.innerText)) {
        const g = document.querySelector("mat-radio-group, [role='radiogroup']");
        const yes = g && Array.from(g.querySelectorAll("mat-radio-button, [role='radio'], label"))
          .find((r) => /^\s*yes\s*$/i.test((r.textContent || "").trim()));
        const inp = yes && (yes.querySelector("input") || yes);
        if (inp && !inp.checked) {
          inp.click();
          sub.push({ source: "gating-has-official-grades", status: "answered-yes" });
          await sleep(400);
        }
      }
    } catch (_e) {}

    // 1. open the modal.
    const trigger = findEl([mapping.trigger || "#addCG"]);
    if (!trigger) return { source: mapping.source, status: "add-grade-button-not-found" };
    trigger.click();
    const ready = await waitFor(() => document.getElementById("schoolNameControl1"), 3500);
    if (!ready) return { source: mapping.source, status: "grid-modal-not-open" };
    const matById = async (id, val) => {
      if (!val) return;
      const el = document.getElementById(id);
      if (!el) { sub.push({ source: id, status: "field-not-found" }); return; }
      const r = await fillMatSelect(el, val);
      sub.push({ source: id, status: r === "filled" ? "filled" : r, value: val });
      await sleep(150);
    };

    // 2. transcript header.
    // School Name is a REQUIRED mat-select limited to the schools from the
    // Common App Education section, so our stored free-text name usually won't
    // match. Open the dropdown ONCE and pick the stored name if present, else the
    // first real option. (Do NOT call fillMatSelect first: on a no-match it hides
    // the panel and desyncs the mat-select, so a later re-open just toggles it
    // shut — leaving School Name blank, which blocks Continue and discards the
    // whole transcript.)
    {
      const snEl = document.getElementById("schoolNameControl1");
      if (snEl) {
        purgeSelectOverlays();
        (snEl.closest("mat-select") || snEl).click();
        let panel = await waitFor(() => newestPanel(), 2500);
        if (!panel) { (snEl.closest("mat-select") || snEl).click(); panel = await waitFor(() => newestPanel(), 2000); }
        const opts = panel
          ? [...panel.querySelectorAll(".mat-mdc-option, mat-option, [role='option']")].filter(
              (o) => o.textContent && !/clear selection/i.test(o.textContent) && o.textContent.trim()
            )
          : [];
        const want = normText(data.schoolName);
        const pick =
          (want && opts.find((o) => normText(o.textContent) === want)) ||
          (want && opts.find((o) => normText(o.textContent).includes(want))) ||
          opts[0];
        if (pick) { pick.click(); sub.push({ source: "schoolNameControl1", status: "filled-school" }); }
        else sub.push({ source: "schoolNameControl1", status: "no-school-option" });
        if (panel) hidePanel(panel);
        purgeSelectOverlays();
        await sleep(250);
      }
    }
    await matById("schoolYearControl1", data.schoolYear);
    await matById("gradingScaleControl1", data.gradingScale);
    await matById("scheduleControl1", data.schedule);

    // 3. courses — one per row (T1C1, T1C2, …), adding rows as needed.
    for (let i = 0; i < courses.length; i++) {
      const n = i + 1;
      let subjEl = document.getElementById(`subjectControl_T1C${n}`);
      if (!subjEl) {
        // A stray transparent backdrop from the previous course's mat-selects
        // would swallow this click and stop new rows from ever being added
        // (the "only one course saved" bug). Clear it first.
        purgeSelectOverlays();
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
        purgeSelectOverlays();
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
    purgeSelectOverlays();
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

    // 5. Continue saves the grid and closes the modal. Purge first — a leftover
    // backdrop here silently eats the click and nothing is ever saved.
    purgeSelectOverlays();
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
    // Fallback: the LAST page of a section has no "Continue" — its save+advance
    // control is a "Go to <next section> tab" link (e.g. "Go to My Colleges tab"
    // on the Courses & Grades "Other Courses" page 13/59). It's a plain <a>, so
    // the query above misses it. Clicking it persists the page and navigates,
    // exactly like Continue. Verified live: it saves the Other-Courses answer.
    if (!btn) {
      for (const a of document.querySelectorAll("a, button, [role='button']")) {
        const t = (a.textContent || "").trim().toLowerCase();
        if (/^go to .+\btab\b/.test(t) && !/submit|pay|confirm/.test(t)) {
          const r = a.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && !a.disabled) {
            btn = a;
            break;
          }
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

    // Release the chrome.debugger attach (if any) so the "Common AI has started
    // debugging this browser" banner disappears as soon as the fill completes.
    // No-op if we never needed a trusted event on this page.
    try { await trustedRelease(); } catch (_e) {}

    return { ok: true, matched: true, filled, pageName: page.name, report };
  }
})();
