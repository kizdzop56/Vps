// Prelude: environment shims for sandboxed iframe. Runs before the app bundle.
(function () {
  "use strict";

  // --- localStorage guard (sandboxed iframes may block storage access) ---
  var storageOk = false;
  try {
    window.localStorage.setItem("__t", "1");
    window.localStorage.removeItem("__t");
    storageOk = true;
  } catch (e) {}
  if (!storageOk) {
    var mem = {};
    var shim = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
      key: function (i) { return Object.keys(mem)[i] || null; },
      get length() { return Object.keys(mem).length; },
    };
    try { Object.defineProperty(window, "localStorage", { value: shim, configurable: true }); } catch (e2) {}
    try { Object.defineProperty(window, "sessionStorage", { value: shim, configurable: true }); } catch (e3) {}
  }

  // --- history guard + route reset ---
  // The artifact is served from a deep path; expo-router must see "/" as the
  // initial route. replaceState is same-origin-safe.
  try {
    history.replaceState(null, "", "/");
  } catch (e) {
    // If history is blocked, patch it to no-ops so the router doesn't crash.
    try {
      var fake = { pushState: function () {}, replaceState: function () {}, back: function () {}, forward: function () {}, go: function () {}, state: null, length: 1 };
      Object.defineProperty(window, "history", { value: fake, configurable: true });
    } catch (e2) {}
  }

  // --- global error surface (instead of a silent white screen) ---
  window.addEventListener("error", function (ev) {
    var el = document.getElementById("_splash-txt");
    if (el && document.getElementById("_splash-screen")) {
      el.textContent = "Ошибка: " + (ev.message || "unknown");
    }
  });

  // --- per-tab one-time mascot onboarding -------------------------------
  // The app tracks tab guides per user+tab (keys "tab_first_visit_v2_<uid>_<tab>")
  // in localStorage, which is unreliable on some mobile setups. Mirror those
  // flags into the demo DB (via the mock's bridge) so "seen" state survives
  // exactly as long as the rest of the demo data: each tab shows its own guide
  // once per user, then never again.
  try {
    var lsRef = window.localStorage; // real Storage or the in-memory shim above
    var lsGet = lsRef.getItem.bind(lsRef);
    var lsSet = lsRef.setItem.bind(lsRef);
    var wrapped = {
      getItem: function (k) {
        if (String(k).indexOf("tab_first_visit_") === 0) {
          try { if (window.__elmockGuides && window.__elmockGuides.has(k)) return "1"; } catch (e) {}
        }
        return lsGet(k);
      },
      setItem: function (k, v) {
        if (String(k).indexOf("tab_first_visit_") === 0) {
          try { if (window.__elmockGuides) window.__elmockGuides.add(k); } catch (e) {}
        }
        // NOTE: the old timer_session_start shift hack is gone — the app now
        // computes "Сегодня" natively from /api/students/:id/time (which
        // includes the open session), so no localStorage trickery is needed.
        return lsSet(k, v);
      },
      removeItem: lsRef.removeItem.bind(lsRef),
      clear: lsRef.clear.bind(lsRef),
      key: lsRef.key.bind(lsRef),
      get length() { return lsRef.length; },
    };
    Object.defineProperty(window, "localStorage", { value: wrapped, configurable: true });
  } catch (e) {}

  // --- media src fixer -------------------------------------------------
  // The app's player normalizes any non-http URL as `https://${url}`, which
  // mangles blob:/data: URLs produced by the demo storage into
  // "https://blob:..." / "https://data:...". This hook repairs the src at
  // the DOM level (covers <video>, <audio>, <source>) without touching app code.
  function fixMediaUrl(v) {
    if (typeof v !== "string") return v;
    var m = v.match(/^https?:\/\/(blob:.*)$/i) || v.match(/^https?:\/\/(data:.*)$/i);
    if (m) v = m[1];
    // "https:///api/storage/objects/x" (empty host) or relative storage path:
    // resolve through the demo media store when available.
    var sm = v.match(/\/api\/storage\/objects\/([^/?#]+)/);
    if (sm && v.indexOf("blob:") !== 0 && v.indexOf("data:") !== 0 && typeof window.__elmockMediaUrl === "function") {
      var mapped = window.__elmockMediaUrl(sm[1]);
      if (mapped) v = mapped;
    }
    // WebKit (iOS Safari) fails to resolve blob:/data: media sources that carry
    // a #fragment. The fragment is only a media-kind marker for the app's JS,
    // so strip it from the actual element src.
    if (v.indexOf("blob:") === 0 || v.indexOf("data:") === 0) {
      var h = v.indexOf("#");
      if (h !== -1) v = v.slice(0, h);
    }
    return v;
  }
  try {
    var mediaDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    if (mediaDesc && mediaDesc.set) {
      Object.defineProperty(HTMLMediaElement.prototype, "src", {
        get: function () { return mediaDesc.get.call(this); },
        set: function (v) { mediaDesc.set.call(this, fixMediaUrl(v)); },
        configurable: true,
      });
    }
    var srcElDesc = typeof HTMLSourceElement !== "undefined" ? Object.getOwnPropertyDescriptor(HTMLSourceElement.prototype, "src") : null;
    if (srcElDesc && srcElDesc.set) {
      Object.defineProperty(HTMLSourceElement.prototype, "src", {
        get: function () { return srcElDesc.get.call(this); },
        set: function (v) { srcElDesc.set.call(this, fixMediaUrl(v)); },
        configurable: true,
      });
    }
    var origSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (String(name).toLowerCase() === "src") {
        var tag = this.tagName;
        if (tag === "VIDEO" || tag === "AUDIO" || tag === "SOURCE") value = fixMediaUrl(value);
      }
      return origSetAttr.call(this, name, value);
    };
  } catch (e) {}
})();
