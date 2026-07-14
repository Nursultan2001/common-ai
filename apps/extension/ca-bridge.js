// Common AI — page bridge (runs in the MAIN world at document_start).
//
// Why this exists: the Common App "Testing" section is built from ng-select /
// radio components that ONLY persist a change made by a genuine trusted user
// gesture. Simulated clicks show a value on screen but never fire the save, so
// it silently vanishes. Fighting that with fake events proved unreliable.
//
// Instead we replicate Common App's OWN save call. Every answer is saved by a
// POST to https://api25.commonapp.org/answer/v2 with body
//   {"Answers":[{"questionId":N,"response":<value-or-codes>,"memberQuestionTemplateId":null}]}
// authenticated by the app's `authorization` + `x-api-key` headers.
//
// This script, injected before the app boots, hooks fetch/XHR to:
//   1. capture those auth headers from the app's own requests (never exposed to
//      the isolated content script or logged),
//   2. capture the question DEFINITIONS the app loads, so we can translate a
//      human value ("IELTS", "7.5", "Yes") into the coded `response` the API
//      expects (some answers are raw values, some are arbitrary option codes),
//   3. expose a postMessage API the content script calls to save an answer.
//
// It touches nothing on screen and only ever talks to api25.commonapp.org.
(function () {
  if (window.__caBridgeReady) return;
  window.__caBridgeReady = true;

  var API = "https://api25.commonapp.org";
  var AUTH = null; // captured header map (opaque; used only to authorize saves)
  var CODES = {}; // questionId -> { normalizedLabel: code }
  var DEFCOUNT = 0;
  var RAWLOG = []; // diagnostic: every api25 request seen (url + small response sample)

  function logRaw(url, resp) {
    try {
      if (url.indexOf("api25.commonapp.org") === -1 || url.indexOf("logr") > -1) return;
      var short = url.split("commonapp.org")[1] || url;
      RAWLOG.push({ u: short.slice(0, 70), s: (resp == null ? "" : String(resp)).slice(0, 220) });
      if (RAWLOG.length > 120) RAWLOG.shift();
    } catch (e) {}
  }

  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase(); }

  function captureAuth(headers) {
    try {
      var m = {};
      if (headers instanceof Headers) headers.forEach(function (v, k) { m[k.toLowerCase()] = v; });
      else if (Array.isArray(headers)) headers.forEach(function (p) { m[String(p[0]).toLowerCase()] = p[1]; });
      else if (headers && typeof headers === "object") Object.keys(headers).forEach(function (k) { m[k.toLowerCase()] = headers[k]; });
      if (m.authorization || m["x-api-key"]) AUTH = Object.assign(AUTH || {}, m);
    } catch (e) {}
  }

  // Recursively walk any api25 JSON payload and record every question's option
  // list as label->code. Generic on purpose: Common App's schema nests question
  // definitions differently across endpoints, so we match on shape, not a path.
  function harvest(node) {
    try {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) harvest(node[i]); return; }
      var qid = node.questionId != null ? node.questionId
              : node.QuestionId != null ? node.QuestionId
              : node.question_id != null ? node.question_id : null;
      var opts = node.options || node.Options || node.answerOptions || node.AnswerOptions ||
                 node.choices || node.Choices || node.possibleAnswers || node.values;
      if (qid != null && Array.isArray(opts)) {
        var map = CODES[qid] || (CODES[qid] = {});
        for (var j = 0; j < opts.length; j++) {
          var o = opts[j];
          if (o && typeof o === "object") {
            var label = o.label != null ? o.label : o.text != null ? o.text : o.displayText != null ? o.displayText
                      : o.name != null ? o.name : o.description != null ? o.description : o.value;
            var code = o.value != null ? o.value : o.code != null ? o.code : o.id != null ? o.id
                     : o.key != null ? o.key : o.answerId;
            if (label != null && code != null && !(norm(label) in map)) { map[norm(label)] = String(code); DEFCOUNT++; }
          }
        }
      }
      for (var k in node) { if (k !== "__proto__" && Object.prototype.hasOwnProperty.call(node, k)) harvest(node[k]); }
    } catch (e) {}
  }

  function isDataUrl(u) {
    return u.indexOf("api25.commonapp.org") > -1 && u.indexOf("/answer") === -1 && u.indexOf("logr") === -1;
  }

  // ---- fetch hook ----
  var _fetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var url = String((args[0] && args[0].url) || args[0] || "");
    try { if (url.indexOf("api25.commonapp.org") > -1 && args[1]) captureAuth(args[1].headers); } catch (e) {}
    var p = _fetch.apply(this, args);
    try {
      if (url.indexOf("api25.commonapp.org") > -1 && url.indexOf("logr") === -1) {
        p.then(function (res) {
          try { res.clone().text().then(function (t) { logRaw(url, t); if (isDataUrl(url)) { try { harvest(JSON.parse(t)); } catch (e) {} } }).catch(function () {}); } catch (e) {}
        });
      }
    } catch (e) {}
    return p;
  };

  // ---- XHR hook ----
  var _open = XMLHttpRequest.prototype.open,
      _send = XMLHttpRequest.prototype.send,
      _setH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__h = {}; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (String(this.__u).indexOf("api25") > -1) this.__h[String(k).toLowerCase()] = v; } catch (e) {}
    return _setH.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this, u = String(xhr.__u || "");
    try { if (u.indexOf("api25") > -1) captureAuth(xhr.__h); } catch (e) {}
    if (u.indexOf("api25.commonapp.org") > -1 && u.indexOf("logr") === -1) {
      xhr.addEventListener("load", function () {
        try { logRaw(u, xhr.responseText); } catch (e) {}
        if (isDataUrl(u)) { try { harvest(JSON.parse(xhr.responseText)); } catch (e) {} }
      });
    }
    return _send.apply(this, arguments);
  };

  // ---- dynamic code resolution --------------------------------------------
  // Common App stores dropdown/radio/multi-select answers as option CODES, not
  // labels. The code for a value comes from the question's choice group:
  //   GET /datacatalog/choicegroups/{choiceGroupId}/choicevalues
  //     -> [{ choiceLabel, value }]  (label -> code)
  // For many groups value==label (raw), but some (e.g. IELTS bands: 7.5 -> "16")
  // are arbitrary — so we always resolve through the group when one exists.
  var Q2CG = {};      // questionId -> choiceGroupId (0 = none/raw)
  var SEC_DONE = {};  // sectionId -> loaded questionId->cgid
  var CG_MAP = {};    // choiceGroupId -> { normLabel: code }

  function authedJson(path) {
    if (!AUTH) return Promise.resolve(null);
    return _fetch.call(window, API + path, { headers: AUTH })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function sectionOfCurrentPage() {
    var m = String(location.pathname).match(/\/common\/\d+\/(\d+)/);
    return m ? m[1] : null;
  }

  function ensureQuestionCg(questionId) {
    if (Q2CG[questionId] !== undefined) return Promise.resolve(Q2CG[questionId]);
    var sec = sectionOfCurrentPage();
    if (!sec || SEC_DONE[sec]) return Promise.resolve(Q2CG[questionId]);
    return authedJson("/datacatalog/sections/" + sec + "/questions").then(function (j) {
      (j && j.questions || []).forEach(function (q) { if (q && q.questionId != null) Q2CG[q.questionId] = q.choiceGroupId || 0; });
      SEC_DONE[sec] = true;
      return Q2CG[questionId];
    });
  }

  function ensureChoiceMap(cgid) {
    if (CG_MAP[cgid]) return Promise.resolve(CG_MAP[cgid]);
    return authedJson("/datacatalog/choicegroups/" + cgid + "/choicevalues").then(function (arr) {
      var map = {};
      (arr || []).forEach(function (o) {
        var l = o && (o.choiceLabel != null ? o.choiceLabel : o.text);
        var v = o && (o.value != null ? o.value : o.choiceValue);
        if (l != null && v != null && !(norm(l) in map)) map[norm(l)] = String(v);
      });
      CG_MAP[cgid] = map;
      DEFCOUNT += Object.keys(map).length;
      return map;
    });
  }

  // Look up a value in a label->code map, tolerant of numeric formatting
  // ("8" vs "8.0", "7.5" vs "7.50"). Returns null if truly not found.
  function lookup(map, v) {
    var key = norm(v);
    if (map[key] != null) return map[key];
    var n = parseFloat(v);
    if (!isNaN(n)) {
      for (var k in map) { if (parseFloat(k) === n) return map[k]; }
    }
    return null;
  }

  // Resolve a human value to its coded response (async — may fetch the group).
  function resolveAnswer(questionId, value, isMulti, isRaw) {
    if (isRaw) return Promise.resolve(value);
    return ensureQuestionCg(questionId).then(function (cgid) {
      if (!cgid) { // no choice group -> raw value (dates, free numbers)
        if (!isMulti) return String(value);
        return (Array.isArray(value) ? value : String(value).split(/[;,]/)).map(function (x) { return String(x).trim(); }).filter(Boolean);
      }
      return ensureChoiceMap(cgid).then(function (map) {
        function code(v) { var c = lookup(map, v); return c != null ? c : String(v && v.trim ? v.trim() : v); }
        if (!isMulti) return code(value);
        return (Array.isArray(value) ? value : String(value).split(/[;,]/)).map(function (x) { return code(String(x).trim()); }).filter(Boolean);
      });
    });
  }

  function save(questionId, resp) {
    if (!AUTH) return Promise.resolve({ ok: false, error: "no-auth-captured" });
    return _fetch.call(window, API + "/answer/v2", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ Answers: [{ questionId: questionId, response: resp, memberQuestionTemplateId: null }] }),
    }).then(function (r) { return { ok: r.ok, status: r.status }; })
      .catch(function (e) { return { ok: false, error: String((e && e.message) || e) }; });
  }

  // ---- Courses & Grades transcript direct-save ------------------------------
  // The ENTIRE transcript (school, year, scale, schedule + every course) saves
  // as ONE /answer/v2 POST with a nested response — far more reliable than
  // driving the slow modal grid. Dynamic maps (year/scale/schedule/highSchools)
  // come from GET /answer/CoursesAndGrades; subject/level/grade codes are static
  // Common App reference data.
  var CAG = null;
  function getCag() {
    if (CAG) return Promise.resolve(CAG);
    return authedJson("/answer/CoursesAndGrades").then(function (j) { CAG = j || {}; return CAG; });
  }
  function cagMap(arr) { var m = {}; (arr || []).forEach(function (o) { if (o && o.choiceLabel != null) m[norm(o.choiceLabel)] = String(o.value); }); return m; }
  var TX_SUBJECTS = {
    "foreign/world language": 6, "english": 0, "algebra": 11, "geometry": 12,
    "computer science": 8, "earth/environmental science": 19, "biology": 16,
    "physics": 18, "chemistry": 17, "history/social science": 3,
    "art (visual or performing)": 4, "physical education/health": 5, "other/elective": 7
  };
  var TX_LEVELS = { "regular/standard": 1 };
  // schedule code -> ordered grade/credit columns
  var TX_COLS = { "0": ["1", "2", "F"], "1": ["1", "2", "3", "F"], "2": ["1", "2", "3", "4", "F"], "3": ["F"], "4": ["F"] };
  // 0.0-5.0 grading scale: the grade dropdown runs 5.0 (code 188) down to 0.0 in
  // 0.1 steps, sequential — verified live (188=5.0, 198=4.0, 208=3.0, 218=2.0).
  // So grade G -> code 188 + round((5 - G) * 10), covering the entire range.
  function txGrade(v) {
    if (v == null || v === "") return null;
    var s = String(v).trim();
    var n = parseFloat(s);
    if (!isNaN(n) && n >= 0 && n <= 5) {
      var code = 188 + Math.round((5 - n) * 10);
      if (code >= 188 && code <= 238) return String(code);
    }
    return s; // other scales: pass the raw value through (server validates)
  }

  function saveTranscript(spec) {
    return getCag().then(function (cag) {
      var years = cagMap(cag.academicYears), scales = cagMap(cag.gradingScale),
          scheds = cagMap(cag.schedules), schools = cagMap(cag.highSchools);
      // School: match the stored name, else fall back to the only/first school
      // (the transcript dropdown is limited to the Education-section schools —
      // works for registry AND manually-entered schools).
      var hs = schools[norm(spec.schoolName)];
      if (hs == null) { var v = cag.highSchools || []; hs = v.length ? String(v[0].value) : null; }
      var Y = years[norm(spec.schoolYear)], Gs = scales[norm(spec.gradingScale)], Sc = scheds[norm(spec.schedule)];
      if (hs == null || Y == null || Gs == null || Sc == null) {
        return { ok: false, error: "unresolved-header", detail: { hs: hs, Y: Y, Gs: Gs, Sc: Sc } };
      }
      var cols = TX_COLS[String(Sc)] || ["F"];
      var gField = { "1": "grade1", "2": "grade2", "3": "grade3", "4": "grade4", "F": "gradeFinal" };
      var gKey = { "1": "G1", "2": "G2", "3": "G3", "4": "G4", "F": "FG" };
      var cField = { "1": "credit1", "2": "credit2", "3": "credit3", "4": "credit4", "F": "creditFinal" };
      var cKey = { "1": "C1", "2": "C2", "3": "C3", "4": "C4", "F": "FC" };
      var unmapped = [];
      var Cs = (spec.courses || []).map(function (c) {
        var su = TX_SUBJECTS[norm(c.subject)];
        if (su == null) { unmapped.push(c.subject); return null; }
        var row = { Su: su, CN: c.courseName || "", CL: TX_LEVELS[norm(c.courseLevel)] != null ? TX_LEVELS[norm(c.courseLevel)] : 1,
          G1: null, G2: null, G3: null, G4: null, FG: null, C1: null, C2: null, C3: null, C4: null, FC: null, CNA: !!c.creditNA };
        cols.forEach(function (col) { row[gKey[col]] = txGrade(c[gField[col]]); });
        if (!c.creditNA) cols.forEach(function (col) { var cv = c[cField[col]]; if (cv != null && cv !== "") row[cKey[col]] = String(cv); });
        return row;
      }).filter(Boolean);
      if (!Cs.length) return { ok: false, error: "no-courses-mapped", unmapped: unmapped };
      var resp = { HSc: [{ Hs: String(hs), Y: Number(Y), Gs: Number(Gs), Sc: Number(Sc), OSN: null, Cs: Cs }] };
      // grade 12 gates the whole section behind a Yes/No question — answer Yes first.
      var pre = spec.gatingQid ? save(spec.gatingQid, "0") : Promise.resolve();
      return pre.then(function () { return save(spec.questionId, resp); }).then(function (r) {
        if (spec.reportedAllQid) return save(spec.reportedAllQid, "1").then(function () { return r; });
        return r;
      }).then(function (r) { return { ok: r.ok, status: r.status, courses: Cs.length, unmapped: unmapped.length ? unmapped : undefined }; });
    }).catch(function (e) { return { ok: false, error: String((e && e.message) || e) }; });
  }

  // ---- content-script API (postMessage) ----
  window.addEventListener("message", function (ev) {
    if (ev.source !== window || !ev.data || ev.data.__caReq !== true) return;
    var d = ev.data;
    if (d.op === "status") {
      window.postMessage({ __caRes: true, id: d.id, result: { hasAuth: !!AUTH, groups: Object.keys(CG_MAP).length, defs: DEFCOUNT } }, "*");
      return;
    }
    if (d.op === "transcript") {
      saveTranscript(d.spec || {}).then(function (r) {
        window.postMessage({ __caRes: true, id: d.id, result: r }, "*");
      }).catch(function (e) {
        window.postMessage({ __caRes: true, id: d.id, result: { ok: false, error: String((e && e.message) || e) } }, "*");
      });
      return;
    }
    resolveAnswer(d.questionId, d.value, d.isMulti, d.raw).then(function (resp) {
      return save(d.questionId, resp).then(function (r) {
        window.postMessage({ __caRes: true, id: d.id, result: r, hadAuth: !!AUTH, sentResponse: resp }, "*");
      });
    }).catch(function (e) {
      window.postMessage({ __caRes: true, id: d.id, result: { ok: false, error: String((e && e.message) || e) } }, "*");
    });
  });

  // Diagnostic hook (non-sensitive: option maps + booleans only, never the token)
  // so we can confirm the bridge captured auth + codes on a real page load.
  window.__caPeek = function () {
    return { hasAuth: !!AUTH, groupsCached: Object.keys(CG_MAP).length, questionsMapped: Object.keys(Q2CG).length };
  };
  // Test resolution without saving: returns what code(s) a value would map to.
  window.__caResolve = function (questionId, value, isMulti) { return resolveAnswer(questionId, value, !!isMulti, false); };
  window.__caTranscript = function (spec) { return saveTranscript(spec); };
  window.__caRawLog = function () { return RAWLOG; };
  // Compact per-question metadata for a section (type/min/max/choiceGroupId) —
  // small enough to never hit a response cap, for decoding the code system.
  window.__caQuestions = function (sectionId) {
    if (!AUTH) return Promise.resolve({ error: "no-auth" });
    return _fetch.call(window, API + "/datacatalog/sections/" + sectionId + "/questions", { headers: AUTH })
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j.questions || []).map(function (q) { return { qid: q.questionId, label: (q.label || "").slice(0, 24), type: q.questionType, min: q.min, max: q.max, cgid: q.choiceGroupId, cvl: (q.choiceValueList || []).length, subtype: q.questionSubtype }; }); })
      .catch(function (e) { return { error: String((e && e.message) || e) }; });
  };
  // Diagnostic: authenticated GET/POST against api25 using the captured headers,
  // so we can inspect the choice/section endpoints with a token that actually
  // works. Returns { status, body } (body capped).
  window.__caFetch = function (path, method, body) {
    if (!AUTH) return Promise.resolve({ error: "no-auth" });
    var init = { method: method || "GET", headers: AUTH };
    if (body != null) init.body = typeof body === "string" ? body : JSON.stringify(body);
    return _fetch.call(window, API + path, init)
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, body: t.slice(0, 90000) }; }); })
      .catch(function (e) { return { error: String((e && e.message) || e) }; });
  };
})();
