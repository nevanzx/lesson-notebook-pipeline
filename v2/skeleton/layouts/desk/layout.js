"use strict";
LN.nav = (function () {
  var tabIndex = 0;
  function secs() { return document.querySelectorAll("section.block[id]"); }
  function buildToc() {
    var toc = document.getElementById("lnToc");
    if (!toc) return;
    toc.innerHTML = "";
    Array.prototype.forEach.call(secs(), function (s, i) {
      var hd = s.querySelector("h2,h1");
      toc.appendChild(LN.h("a", { href: "#" + s.id }, [
        LN.h("span", { class: "n", text: ("0" + (i + 1)).slice(-2) }),
        LN.h("span", { text: hd ? hd.textContent : s.id })
      ]));
    });
  }
  function show(idx, pushHash) {
    var list = secs(), toc = document.getElementById("lnToc");
    var prog = document.getElementById("lnProg"), n = list.length;
    if (!n) return;
    if (idx < 0) idx = 0;
    if (idx >= n) idx = n - 1;
    tabIndex = idx;
    Array.prototype.forEach.call(list, function (s, i) {
      var on = i === idx;
      if (on) s.removeAttribute("hidden"); else s.setAttribute("hidden", "");
      s.classList.toggle("active", on);
    });
    var links = toc ? toc.querySelectorAll("a") : [];
    Array.prototype.forEach.call(links, function (a, i) {
      var on = i === idx;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    if (prog) prog.style.width = ((idx + 1) / n * 100) + "%";
    if (pushHash !== false) {
      try { history.replaceState(null, "", "#" + list[idx].id); } catch (e) {}
    }
    var sheet = document.querySelector(".sheet");
    if (sheet && typeof sheet.scrollIntoView === "function") sheet.scrollIntoView();
  }
  function wire() {
    var sb = document.getElementById("lnSidebar");
    var menu = document.getElementById("lnMenu");
    var scrim = document.getElementById("lnScrim");
    var reset = document.getElementById("lnReset");
    var toc = document.getElementById("lnToc");
    function drawer(open) {
      if (!sb) return;
      sb.classList.toggle("open", open);
      if (menu) menu.setAttribute("aria-expanded", open ? "true" : "false");
      if (scrim) scrim.classList.toggle("show", open);
    }
    if (menu) menu.addEventListener("click", function () { drawer(true); });
    if (scrim) scrim.addEventListener("click", function () { drawer(false); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") drawer(false);
    });
    if (toc) toc.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var href = a.getAttribute("href"), list = secs(), found = -1;
      Array.prototype.forEach.call(list, function (s, i) {
        if ("#" + s.id === href) found = i;
      });
      if (found >= 0) { ev.preventDefault(); drawer(false); show(found, true); }
    });
    window.addEventListener("hashchange", function () {
      var h = window.location.hash;
      if (!h) return;
      Array.prototype.forEach.call(secs(), function (s, i) {
        if ("#" + s.id === h) show(i, false);
      });
    });
    if (reset) reset.addEventListener("click", function () { LN.resetAll(); });
  }
  function init() {
    document.body.classList.add("js-tabs");
    buildToc();
    var start = 0, h = window.location.hash;
    if (h) {
      Array.prototype.forEach.call(secs(), function (s, i) {
        if ("#" + s.id === h) start = i;
      });
    }
    show(start, false);
    wire();
  }
  return { init: init, go: show };
})();
