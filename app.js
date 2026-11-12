/* Sri Dasam Granth reader. Plain JS, no libraries, works offline and from file://.
   The bani text is shown exactly as it is in the data (textContent only); search uses a separate,
   normalised copy and highlights whole lines, never parts of a word. */
(function () {
  "use strict";

  /* ---------- data loading (script tags, so it works without a server) ---------- */
  var cache = {}, waiting = {};
  window.DG = { put: function (key, value) { cache[key] = value; (waiting[key] || []).forEach(function (f) { f(value); }); delete waiting[key]; } };

  function load(key, src) {
    if (cache[key]) return Promise.resolve(cache[key]);
    return new Promise(function (resolve, reject) {
      (waiting[key] = waiting[key] || []).push(resolve);
      if (waiting[key].length > 1) return;
      var s = document.createElement("script");
      s.src = src;
      s.onerror = function () { delete waiting[key]; reject(new Error("could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  var loadIndex = function () { return load("index", "data/index.js"); };
  var loadSection = function (id, n) { return load(id + "/" + n, "data/" + id + "/" + n + ".js"); };
  var loadSources = function () { return load("sources", "data/sources.js").catch(function () { return { pdf: [], scan: [] }; }); };

  /* ---------- settings ---------- */
  function store(k, v) { try { if (v === undefined) return localStorage.getItem("dg." + k); localStorage.setItem("dg." + k, v); } catch (e) { return null; } }
  var prefs = { gu: store("gu") !== "0", ro: store("ro") === "1", en: store("en") === "1", size: +store("size") || 22, theme: store("theme") || "auto" };

  function applyPrefs() {
    document.body.classList.toggle("no-gu", !prefs.gu);
    document.body.classList.toggle("no-ro", !prefs.ro);
    document.body.classList.toggle("no-en", !prefs.en);
    document.documentElement.style.setProperty("--gsize", prefs.size + "px");
    if (prefs.theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = prefs.theme;
    $("showGu").checked = prefs.gu; $("showRo").checked = prefs.ro; $("showEn").checked = prefs.en;
    $("size").value = prefs.size;
    document.querySelectorAll("input[name=theme]").forEach(function (r) { r.checked = r.value === prefs.theme; });
    var note = document.getElementById("noMeanings");
    if (note) note.hidden = !prefs.en;
  }

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var GU_DIGITS = "੦੧੨੩੪੫੬੭੮੯";
  function guNum(n) { return String(n).replace(/\d/g, function (d) { return GU_DIGITS[+d]; }); }
  function view() { return $("view"); }

  /* ---------- original page link ---------- */
  var cfg = window.DG_CONFIG || {};
  function pageInfo(bani, item, sources) {
    var wrap = el("span", "page");
    var isScan = bani.text_source === "banidb";
    var p = item.page != null ? item.page : (item.page_range ? item.page_range[0] : null);
    if (p == null) return wrap;
    var label = isScan ? ("scan p." + (item.page != null ? p : item.page_range.join("–"))) : ("p." + p);
    var folder = isScan ? cfg.scanFolder : cfg.pdfFolder;
    var chunk = folder && (isScan ? sources.scan : sources.pdf).filter(function (c) { return c.from_page <= p && p <= c.to_page; })[0];
    if (chunk) {
      var a = el("a", null, label + " ↗");
      a.href = folder + encodeURIComponent(chunk.file) + "#page=" + (p - chunk.from_page + 1);
      a.target = "_blank"; a.rel = "noopener";
      a.title = isScan ? "Open your scanned copy at this page" : "Open the original page";
      wrap.appendChild(a);
    } else wrap.textContent = label;
    if (isScan && item.std_page != null) wrap.appendChild(document.createTextNode(" · std p." + item.std_page));
    return wrap;
  }

  function flagBox(flags, extra) {
    var reasons = (flags || []).map(function (f) { return f.reason || f.code; });
    if (extra) reasons = reasons.concat(extra);
    if (!reasons.length) return null;
    var d = el("details", "flag");
    d.appendChild(el("summary", null, "⚑ check"));
    reasons.forEach(function (r) { d.appendChild(el("div", null, r)); });
    return d;
  }

  /* one text line: Gurmukhi, Roman, draft meaning and its note */
  function lineEl(ln, cls) {
    var d = el("div", "ln" + (cls ? " " + cls : ""));
    d.appendChild(el("div", "gu gu-line", ln.gurmukhi));
    d.appendChild(el("div", "ro", ln.roman));
    if (ln.meaning_en) {
      var en = el("div", "en");
      en.appendChild(el("span", "draft", "draft meaning"));
      en.appendChild(document.createTextNode(ln.meaning_en));
      if (ln.note) en.appendChild(el("span", "note", "Note: " + ln.note));
      d.appendChild(en);
    }
    if (ln.printed) d.appendChild(el("div", "meta", "Printed in the source as: " + ln.printed));
    var f = flagBox(ln.flags);
    if (f) d.appendChild(f);
    return d;
  }

  /* ---------- home ---------- */
  function renderHome(index) {
    setBar(null);
    var v = view(); v.textContent = "";
    var last = readResume();
    if (last) {
      var b = index.banis.filter(function (x) { return x.id === last.id; })[0];
      if (b) {
        var r = el("a", "resume");
        r.href = "#/b/" + last.id + "/" + last.n + (last.blk != null ? "/" + last.blk : "");
        r.appendChild(el("b", null, "Continue where you stopped"));
        r.appendChild(el("div", "gu", b.title));
        r.appendChild(el("div", "small muted", (b.section_list.length > 1 ? "Section " + last.n + " · " : "") + (last.label || "")));
        v.appendChild(r);
      }
    }
    var f = el("input", "filter"); f.type = "search"; f.placeholder = "Find a bani (ਜਾਪੁ, jaap, chaupai...)";
    v.appendChild(f);
    var ul = el("ul", "list");
    index.banis.forEach(function (b) {
      var li = el("li"); li.dataset.key = norm(b.title) + " " + normRo(b.title_roman) + " " + normRo(b.id);
      var a = el("a"); a.href = "#/b/" + b.id;
      a.appendChild(el("span", "num", String(b.order)));
      var t = el("span", "t");
      t.appendChild(el("span", "title-gu", b.title));
      var sub = el("span", "sub", b.title_roman + " · " + b.verse_count + " verses · " + (b.text_source === "banidb" ? "std pp. " + b.std_pages.join("–") : "pp. " + b.pages.join("–")));
      t.appendChild(sub);
      if (b.meaning_lines) t.appendChild(el("span", "tag draft", "draft meanings"));
      if (b.text_source === "banidb") t.appendChild(el("span", "tag", "BaniDB text"));
      a.appendChild(t); li.appendChild(a); ul.appendChild(li);
    });
    v.appendChild(ul);
    if (index.shortcuts && index.shortcuts.length) {
      v.appendChild(el("h2", "small muted", "Also inside the banis above"));
      var ul2 = el("ul", "list");
      index.shortcuts.forEach(function (sc) {
        var li = el("li"); li.dataset.key = norm(sc.title) + " " + normRo(sc.title_roman);
        var a = el("a"); a.href = "#/b/" + sc.within + "/" + sc.section + "/" + sc.block;
        a.appendChild(el("span", "num", "·"));
        var t = el("span", "t");
        t.appendChild(el("span", "title-gu", sc.title));
        t.appendChild(el("span", "sub", sc.title_roman + " · verses " + sc.verse + "–" + sc.last + " of " + sc.within_title));
        a.appendChild(t); li.appendChild(a); ul2.appendChild(li);
      });
      v.appendChild(ul2);
    }
    f.addEventListener("input", function () {
      var q = norm(f.value), qr = normRo(f.value);
      v.querySelectorAll(".list li").forEach(function (li) { li.hidden = !!f.value.trim() && li.dataset.key.indexOf(q) < 0 && (!qr || li.dataset.key.indexOf(qr) < 0); });
    });
    v.appendChild(el("p", "small muted", "Only the bani is included. English meanings are drafts and are marked as such. Lines marked ⚑ need checking against the original."));
  }

  /* ---------- bani: list of sections ---------- */
  function renderBani(index, id) {
    var b = byId(index, id);
    if (!b) return notFound();
    if (b.section_list.length === 1) { location.replace("#/b/" + id + "/" + b.section_list[0].n); return; }
    setBar(b);
    var v = view(); v.textContent = "";
    v.appendChild(el("h1", "title-gu", b.title));
    v.appendChild(el("p", "title-ro", b.title_roman));
    provenance(v, b);
    var ul = el("ul", "list");
    b.section_list.forEach(function (s) {
      var li = el("li"), a = el("a"); a.href = "#/b/" + id + "/" + s.n;
      a.appendChild(el("span", "num", String(s.n)));
      var t = el("span", "t");
      t.appendChild(el("span", "title-gu", s.title || (b.title + " · " + guNum(s.n))));
      t.appendChild(el("span", "sub", sectionSub(b, s)));
      a.appendChild(t); li.appendChild(a); ul.appendChild(li);
    });
    v.appendChild(ul);
  }

  function sectionSub(b, s) {
    var parts = [];
    if (s.verses) parts.push("verses " + s.verses[0] + (s.verses[1] !== s.verses[0] ? "–" + s.verses[1] : ""));
    parts.push(b.text_source === "banidb" ? "std p." + s.std_page : "p." + s.page);
    if (s.title_roman) parts.unshift(s.title_roman);
    return parts.join(" · ");
  }

  function provenance(v, b) {
    if (b.text_source === "banidb") {
      v.appendChild(el("div", "note-box", "Ram Avtar is not in the main PDF. Its text is from BaniDB (Dasam Granth standard pages " +
        b.std_pages.join("–") + "), checked against your scanned copy. Page numbers are scan pages; “std p.” is the standard page."));
    }
  }

  /* ---------- reading a section ---------- */
  var current = null; // {bani, n, blocks:[elements]}

  function renderSection(index, id, n, blk) {
    var b = byId(index, id);
    if (!b) return notFound();
    var si = b.section_list.findIndex(function (s) { return s.n === n; });
    if (si < 0) return notFound();
    setBar(b);
    var v = view(); v.textContent = "";
    v.appendChild(el("p", "muted small", "Loading…"));
    Promise.all([loadSection(id, n), loadSources()]).then(function (r) {
      var sec = r[0], sources = r[1];
      v.textContent = "";
      v.appendChild(el("h1", "title-gu", b.title));
      v.appendChild(el("p", "title-ro", b.title_roman));
      if (b.section_list.length > 1) v.appendChild(sectionPicker(b, n));
      provenance(v, b);
      var nm = el("div", "note-box", "No English meanings have been written for this " + (b.meaning_lines ? "part" : "bani") + " yet.");
      nm.id = "noMeanings"; nm.hidden = !prefs.en;
      if (!sectionHasMeaning(sec, si === 0 ? b : null)) v.appendChild(nm);
      if (si === 0 && b.invocations.length) {
        b.invocations.forEach(function (ln) { var d = el("div", "blk invocation"); d.appendChild(lineEl(ln)); d.appendChild(metaRow(b, ln, sources)); v.appendChild(d); });
      }
      // the section title is shown on its own only when no heading in the section already prints it
      var titleKey = norm(sec.title);
      if (sec.title && !sec.blocks.some(function (bl) { return bl.type !== "verse" && norm(bl.gurmukhi) === titleKey; })) {
        var st = el("div", "sec-title");
        st.appendChild(el("div", "gu", sec.title));
        if (sec.title_roman) st.appendChild(el("div", "ro", sec.title_roman));
        v.appendChild(st);
      }
      var blocks = [];
      sec.blocks.forEach(function (bl, i) {
        var d = blockEl(b, bl, sources);
        d.id = "b" + i; d.dataset.i = i;
        blocks.push(d); v.appendChild(d);
      });
      if (sec.ending) {
        var e = el("div", "blk ending");
        sec.ending.lines.forEach(function (ln) { e.appendChild(lineEl(ln)); });
        e.appendChild(metaRow(b, sec.ending.lines[0] || sec.ending, sources));
        v.appendChild(e);
      }
      v.appendChild(pager(b, si));
      current = { bani: b, n: n, blocks: blocks, sec: sec };
      if (blk != null && blocks[blk]) {
        blocks[blk].scrollIntoView();
        if (highlightLine != null) {
          var lines = blocks[blk].querySelectorAll(".ln");
          if (lines[highlightLine]) lines[highlightLine].classList.add("hit");
          highlightLine = null;
        }
      } else window.scrollTo(0, 0);
      saveResume();
    }).catch(function (e) { v.textContent = ""; v.appendChild(el("p", null, "Could not load this section: " + e.message)); });
  }

  function sectionHasMeaning(sec, baniForInvocations) {
    if (baniForInvocations && baniForInvocations.invocations.some(function (l) { return l.meaning_en; })) return true;
    return sec.blocks.some(function (b) { return (b.lines || [b]).some(function (l) { return l.meaning_en; }); });
  }

  function blockEl(b, bl, sources) {
    if (bl.type === "verse") {
      var d = el("div", "blk verse");
      bl.lines.forEach(function (ln) { d.appendChild(lineEl(ln)); });
      var m = metaRow(b, bl, sources);
      if (bl.rahao) m.insertBefore(el("span", "rahao", "ਰਹਾਉ"), m.firstChild);
      d.appendChild(m);
      return d;
    }
    var h = el("div", "blk " + (bl.type === "invocation" ? "invocation" : "heading " + (bl.kind || "")));
    h.appendChild(lineEl(bl));
    var mh = metaRow(b, bl, sources, true);
    if (mh.childNodes.length) h.appendChild(mh);
    return h;
  }

  function metaRow(b, item, sources, quiet) {
    var m = el("div", "meta");
    if (!quiet) m.appendChild(pageInfo(b, item, sources));
    var extra = [];
    if (item.page_note) extra.push(item.page_note);
    if (b.text_source === "banidb" && item.scan_match != null && typeof item.scan_match !== "object") extra.push("scan match: " + item.scan_match);
    var f = flagBox(item.flags, extra);
    if (f) m.appendChild(f);
    return m;
  }

  function sectionPicker(b, n) {
    var nav = el("div", "sec-nav");
    var sel = el("select"); sel.setAttribute("aria-label", "Jump to section");
    b.section_list.forEach(function (s) {
      var o = el("option", null, s.n + ". " + (s.title || "Section " + s.n) + (s.verses ? "  (" + s.verses[0] + "–" + s.verses[1] + ")" : ""));
      o.value = s.n; o.selected = s.n === n; sel.appendChild(o);
    });
    sel.addEventListener("change", function () { location.hash = "#/b/" + b.id + "/" + sel.value; });
    nav.appendChild(sel);
    return nav;
  }

  function pager(b, si) {
    var p = el("div", "pager");
    if (si > 0) { var a = el("a", null, "← " + (b.section_list[si - 1].title || "Section " + b.section_list[si - 1].n)); a.href = "#/b/" + b.id + "/" + b.section_list[si - 1].n; p.appendChild(a); }
    if (si < b.section_list.length - 1) { var c = el("a", null, (b.section_list[si + 1].title || "Section " + b.section_list[si + 1].n) + " →"); c.href = "#/b/" + b.id + "/" + b.section_list[si + 1].n; p.appendChild(c); }
    return p;
  }

  /* ---------- continue where I stopped ---------- */
  function readResume() { try { return JSON.parse(store("resume")); } catch (e) { return null; } }
  function topBlock() {
    if (!current) return null;
    var bs = current.blocks;
    for (var i = 0; i < bs.length; i++) { if (bs[i].getBoundingClientRect().bottom > 70) return i; }
    return bs.length ? bs.length - 1 : null;
  }
  function saveResume() {
    if (!current) return;
    var i = topBlock(), label = "";
    if (i != null) {
      // label: nearest verse number at or after the top block
      for (var j = i; j < current.sec.blocks.length; j++) { var bl = current.sec.blocks[j]; if (bl.type === "verse" && bl.number) { label = "verse " + bl.number[bl.number.length - 1]; break; } }
    }
    store("resume", JSON.stringify({ id: current.bani.id, n: current.n, blk: i, label: label }));
    var h = "#/b/" + current.bani.id + "/" + current.n + (i ? "/" + i : "");
    if (location.hash !== h) history.replaceState(null, "", h);
  }
  var scrollTimer = null;
  window.addEventListener("scroll", function () { clearTimeout(scrollTimer); scrollTimer = setTimeout(saveResume, 400); }, { passive: true });

  /* ---------- search within a bani ---------- */
  // search keys only; the displayed text is never changed
  function norm(s) { return (s || "").replace(/[।॥|੦-੯0-9.,;:!?'"()\-‌‍]/g, " ").replace(/\s+/g, " ").trim(); }
  function normRo(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim(); }
  var highlightLine = null, searchToken = 0;

  function runSearch() {
    var b = current && current.bani; if (!b) return;
    var raw = $("q").value, q = norm(raw), qr = normRo(raw), isGu = /[਀-੿]/.test(raw);
    var out = $("results"); out.textContent = "";
    if ((isGu ? q : qr).length < 2) { $("qStatus").textContent = ""; return; }
    var token = ++searchToken, found = 0, done = 0, total = b.section_list.length;
    $("qStatus").textContent = "Searching…";
    function scan(n, sec) {
      sec.blocks.forEach(function (bl, i) {
        (bl.lines || [bl]).forEach(function (ln, li) {
          var hit = isGu ? norm(ln.gurmukhi).indexOf(q) >= 0 : normRo(ln.roman).indexOf(qr) >= 0;
          if (!hit || found >= 300) return;
          found++;
          var a = el("a"); a.href = "#/b/" + b.id + "/" + n + "/" + i;
          a.dataset.line = bl.type === "verse" ? li : 0;
          a.appendChild(el("div", "gu", ln.gurmukhi));
          a.appendChild(el("div", "small muted", (total > 1 ? "Section " + n + " · " : "") + (bl.number ? "verse " + bl.number[bl.number.length - 1] : bl.type)));
          var item = el("li"); item.appendChild(a); out.appendChild(item);
        });
      });
    }
    // load sections one after another so a big bani does not freeze the phone
    var i = 0;
    (function next() {
      if (token !== searchToken) return;
      if (i >= total) { $("qStatus").textContent = found ? found + (found >= 300 ? "+ (first 300 shown)" : "") + " line" + (found === 1 ? "" : "s") + " found" : "Nothing found"; return; }
      var n = b.section_list[i++].n;
      loadSection(b.id, n).then(function (sec) { if (token === searchToken) { scan(n, sec); done++; $("qStatus").textContent = "Searching… " + done + "/" + total; setTimeout(next, 0); } });
    })();
  }
  $("results").addEventListener("click", function (e) {
    var a = e.target.closest("a"); if (!a) return;
    highlightLine = +a.dataset.line;
    togglePanel("searchPanel", false);
    if (location.hash === a.getAttribute("href")) { e.preventDefault(); route(); }
  });

  /* ---------- top bar, panels, routing ---------- */
  function setBar(b) {
    $("where").textContent = b ? b.title : "";
    $("where").classList.toggle("gu", !!b);
    $("back").hidden = !b;
    $("searchBtn").hidden = !b;
    if (!b) togglePanel("searchPanel", false);
  }
  function togglePanel(id, show) {
    var p = $(id); if (show === undefined) show = p.hidden;
    p.hidden = !show;
    $(id === "settings" ? "settingsBtn" : "searchBtn").setAttribute("aria-pressed", show ? "true" : "false");
    if (show) { togglePanel(id === "settings" ? "searchPanel" : "settings", false); if (id === "searchPanel") $("q").focus(); }
  }
  function byId(index, id) { return index.banis.filter(function (x) { return x.id === id; })[0]; }
  function notFound() { setBar(null); view().textContent = ""; view().appendChild(el("p", null, "Not found. ")).appendChild(el("a", null, "Back to the list")).href = "#/"; }

  var lastBani = null;
  function route() {
    loadIndex().then(function (index) {
      var m = location.hash.match(/^#\/b\/([\w-]+)(?:\/(\d+))?(?:\/(\d+))?/);
      current = null;
      if (!m) { lastBani = null; return renderHome(index); }
      if (lastBani !== m[1]) { $("q").value = ""; $("results").textContent = ""; $("qStatus").textContent = ""; }
      lastBani = m[1];
      if (m[2] == null) return renderBani(index, m[1]);
      renderSection(index, m[1], +m[2], m[3] != null ? +m[3] : null);
    }).catch(function (e) { view().textContent = "Could not load the data (" + e.message + "). Run extract/build_app.py first."; });
  }

  $("settingsBtn").addEventListener("click", function () { togglePanel("settings"); });
  $("searchBtn").addEventListener("click", function () { togglePanel("searchPanel"); });
  $("back").addEventListener("click", function () {
    var m = location.hash.match(/^#\/b\/([\w-]+)\/\d+/);
    var b = m && cache.index && byId(cache.index, m[1]);
    location.hash = m && b && b.section_list.length > 1 ? "#/b/" + m[1] : "#/";
  });
  var qTimer = null;
  $("q").addEventListener("input", function () { clearTimeout(qTimer); qTimer = setTimeout(runSearch, 250); });
  [["showGu", "gu"], ["showRo", "ro"], ["showEn", "en"]].forEach(function (p) {
    $(p[0]).addEventListener("change", function (e) {
      prefs[p[1]] = e.target.checked;
      if (!prefs.gu && !prefs.ro && !prefs.en) { prefs.gu = true; }  // never hide everything
      store(p[1], prefs[p[1]] ? "1" : "0"); store("gu", prefs.gu ? "1" : "0");
      applyPrefs();
    });
  });
  $("size").addEventListener("input", function (e) { prefs.size = +e.target.value; store("size", prefs.size); applyPrefs(); });
  document.querySelectorAll("input[name=theme]").forEach(function (r) {
    r.addEventListener("change", function () { prefs.theme = r.value; store("theme", r.value); applyPrefs(); });
  });

  window.addEventListener("hashchange", function () {
    // the scroll handler rewrites the hash with replaceState; only real navigation reaches here
    route();
  });
  /* ---------- installable web app (only when served over http/https) ---------- */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
      // look for a new build (e.g. an approved correction) every time the app is opened or brought back
      reg.update().catch(function () {});
      document.addEventListener("visibilitychange", function () { if (!document.hidden) reg.update().catch(function () {}); });
    }).catch(function () {});
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      // a new version took over: its cache is fresh, so redraw the current page from it
      if (hadController) { cache = {}; store("savedAll", ""); route(); }
      hadController = true;
    });
    $("offlineBox").hidden = false;
    var installEvt = null;
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; $("installBtn").hidden = false; });
    $("installBtn").addEventListener("click", function () {
      if (!installEvt) return;
      installEvt.prompt();
      installEvt.userChoice.then(function () { installEvt = null; $("installBtn").hidden = true; });
    });
    var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    $("iosHint").hidden = standalone || !/iPhone|iPad|iPod/.test(navigator.userAgent);
    if (store("savedAll")) $("offlineStatus").textContent = "All banis were saved on this device.";
    $("saveAllBtn").addEventListener("click", function () {
      var btn = $("saveAllBtn"), st = $("offlineStatus");
      btn.disabled = true;
      loadIndex().then(function (index) {
        var urls = [];
        index.banis.forEach(function (b) { b.section_list.forEach(function (s) { urls.push("data/" + b.id + "/" + s.n + ".js"); }); });
        var done = 0, failed = 0, i = 0;
        function worker() {  // fetching through the service worker stores each file
          if (i >= urls.length) return Promise.resolve();
          var u = urls[i++];
          return fetch(u).then(function (r) { if (!r.ok) failed++; }, function () { failed++; })
            .then(function () { done++; st.textContent = "Saving… " + done + " / " + urls.length; return worker(); });
        }
        return Promise.all([worker(), worker(), worker(), worker()]).then(function () {
          if (failed) { st.textContent = failed + " files could not be saved. Check the connection and try again."; }
          else { store("savedAll", "1"); st.textContent = "All banis are saved on this device (" + urls.length + " files)."; }
          btn.disabled = false;
        });
      });
    });
  }

  applyPrefs();
  route();
})();
