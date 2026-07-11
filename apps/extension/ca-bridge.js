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

  // Translate a human value to the coded `response` the API wants. Falls back to
  // the raw value when there's no code map (scores like "780" are saved raw).
  function resolve(questionId, value, isMulti) {
    var map = CODES[questionId];
    function one(v) {
      v = v && v.trim ? v.trim() : v;
      if (map) { var c = map[norm(v)]; if (c != null) return c; }
      return String(v);
    }
    if (isMulti) {
      var arr = Array.isArray(value) ? value : String(value).split(/[;,]/);
      return arr.map(one).filter(function (x) { return x !== ""; });
    }
    return one(value);
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

  // ---- content-script API (postMessage) ----
  window.addEventListener("message", function (ev) {
    if (ev.source !== window || !ev.data || ev.data.__caReq !== true) return;
    var d = ev.data;
    if (d.op === "status") {
      window.postMessage({ __caRes: true, id: d.id, result: { hasAuth: !!AUTH, questions: Object.keys(CODES).length, defs: DEFCOUNT } }, "*");
      return;
    }
    var resp = d.raw ? d.value : resolve(d.questionId, d.value, d.isMulti);
    save(d.questionId, resp).then(function (r) {
      window.postMessage({ __caRes: true, id: d.id, result: r, hadAuth: !!AUTH, hadCodeMap: !!CODES[d.questionId], sentResponse: resp }, "*");
    });
  });

  // Diagnostic hook (non-sensitive: option maps + booleans only, never the token)
  // so we can confirm the bridge captured auth + codes on a real page load.
  window.__caPeek = function (qid) {
    if (qid != null) return CODES[qid] || null;
    return { hasAuth: !!AUTH, questions: Object.keys(CODES).length, defs: DEFCOUNT, questionIds: Object.keys(CODES).slice(0, 60) };
  };
  window.__caRawLog = function () { return RAWLOG; };
})();
