"use strict";
LN.nav = (function () {
  var LABS = ["break-even-lab", "ratio-lab", "tvm-lab", "port-lab", "step-solver"];

  function list() { return document.querySelectorAll("section.block[id]"); }

  function moveLab() {
    var panel = document.getElementById("lnSheetPanel");
    if (!panel) return;
    var found = null;
    Array.prototype.forEach.call(document.querySelectorAll("[data-component]"), function (el) {
      if (found) return;
      if (LABS.indexOf(el.getAttribute("data-component")) >= 0) found = el;
    });
    if (!found) return;
    var wrap = found.closest ? found.closest(".ln-act-wrap") : null;
    panel.appendChild(wrap || found);
    panel.hidden = false;
  }

  function drawToc() {
    var toc = document.getElementById("lnSheetToc");
    if (!toc) return;
    toc.innerHTML = "";
    Array.prototype.forEach.call(list(), function (s, i) {
      var hd = s.querySelector("h2,h1");
      toc.appendChild(LN.h("a", { href: "#" + s.id }, [
        LN.h("span", { class: "n", text: ("0" + (i + 1)).slice(-2) }),
        LN.h("span", { text: hd ? hd.textContent : s.id })
      ]));
    });
    toc.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var href = a.getAttribute("href"), found = -1;
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === href) found = i;
      });
      if (found >= 0) { ev.preventDefault(); toc.hidden = true; go(found, true); }
    });
  }

  function go(i, pushHash) {
    var l = list();
    if (!l.length) return;
    if (i < 0) i = 0;
    if (i >= l.length) i = l.length - 1;
    if (pushHash !== false) {
      try { history.replaceState(null, "", "#" + l[i].id); } catch (e) {}
    }
    if (l[i].scrollIntoView) l[i].scrollIntoView();
  }

  function init() {
    moveLab();
    drawToc();
    var menu = document.getElementById("lnSheetMenu");
    var reset = document.getElementById("lnSheetReset");
    var toc = document.getElementById("lnSheetToc");
    var panel = document.getElementById("lnSheetPanel");
    var grab = document.getElementById("lnSheetGrab");
    if (menu && toc) menu.addEventListener("click", function () {
      toc.hidden = !toc.hidden;
      menu.setAttribute("aria-expanded", toc.hidden ? "false" : "true");
    });
    if (reset) reset.addEventListener("click", function () { LN.resetAll(); });
    if (grab && panel) grab.addEventListener("click", function () {
      panel.classList.toggle("open");
    });
    window.addEventListener("hashchange", function () {
      var h = window.location.hash;
      if (!h) return;
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === h) go(i, false);
      });
    });
  }

  return { init: init, go: go };
})();
