"use strict";
LN.nav = (function () {
  var idx = 0, toc = null, sx = 0, sy = 0;

  function list() { return document.querySelectorAll("section.block[id]"); }

  function drawToc() {
    toc = document.getElementById("lnAppToc");
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
      if (found >= 0) { ev.preventDefault(); menu(false); go(found, true); }
    });
  }

  function menu(open) {
    if (toc) toc.hidden = !open;
    var scrim = document.getElementById("lnAppScrim");
    if (scrim) scrim.hidden = !open;
    var btn = document.getElementById("lnAppMenu");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function go(i, pushHash) {
    var l = list(), n = l.length;
    if (!n) return;
    if (i < 0) i = 0;
    if (i >= n) i = n - 1;
    idx = i;
    Array.prototype.forEach.call(l, function (s, k) {
      var on = k === i;
      if (on) s.removeAttribute("hidden"); else s.setAttribute("hidden", "");
      s.classList.toggle("active", on);
    });
    var prog = document.getElementById("lnAppProg");
    if (prog && prog.firstElementChild)
      prog.firstElementChild.style.width = ((i + 1) / n * 100) + "%";
    var prev = document.getElementById("lnAppPrev");
    var next = document.getElementById("lnAppNext");
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === n - 1;
    var links = toc ? toc.querySelectorAll("a") : [];
    Array.prototype.forEach.call(links, function (a, k) {
      a.classList.toggle("active", k === i);
      if (k === i) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    if (pushHash !== false) {
      try { history.replaceState(null, "", "#" + l[i].id); } catch (e) {}
    }
    var sheet = document.querySelector(".sheet");
    if (sheet && sheet.scrollIntoView) sheet.scrollIntoView();
  }

  function init() {
    document.body.classList.add("js-tabs");
    drawToc();
    var start = 0, h = window.location.hash;
    if (h) {
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === h) start = i;
      });
    }
    go(start, false);

    var prev = document.getElementById("lnAppPrev");
    var next = document.getElementById("lnAppNext");
    var menuBtn = document.getElementById("lnAppMenu");
    var reset = document.getElementById("lnAppReset");
    var scrim = document.getElementById("lnAppScrim");
    if (prev) prev.addEventListener("click", function () { go(idx - 1, true); });
    if (next) next.addEventListener("click", function () { go(idx + 1, true); });
    if (menuBtn) menuBtn.addEventListener("click", function () { menu(toc && toc.hidden); });
    if (scrim) scrim.addEventListener("click", function () { menu(false); });
    if (reset) reset.addEventListener("click", function () { LN.resetAll(); });

    var stage = document.querySelector(".stage");
    if (stage && stage.addEventListener) {
      stage.addEventListener("touchstart", function (ev) {
        var t = ev.touches[0]; sx = t.clientX; sy = t.clientY;
      }, { passive: true });
      stage.addEventListener("touchend", function (ev) {
        var t = ev.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
          go(idx + (dx < 0 ? 1 : -1), true);
      }, { passive: true });
    }
    window.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowRight") go(idx + 1, true);
      else if (ev.key === "ArrowLeft") go(idx - 1, true);
      else if (ev.key === "Escape") menu(false);
    });
    window.addEventListener("hashchange", function () {
      var hh = window.location.hash;
      if (!hh) return;
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === hh) go(i, false);
      });
    });
  }

  return { init: init, go: go };
})();
