"use strict";
LN.nav = (function () {
  var idx = 0, toc = null;
  var MIN_MATH_PX = 10.5;
  var fitTimer = null;

  function list() { return document.querySelectorAll("section.block[id]"); }

  function round2(n) { return Math.round(n * 100) / 100; }

  /* Shrink an over-wide display equation until it fits its column. MathML is
     an unbreakable horizontal box, so a five-term formula is wider than a
     phone; leaving it in a scroll box makes it look cut off. Fitting keeps the
     whole formula visible. The floor is 10.5px, or 65% of the formula's own
     size for larger text, so browser text zoom is not silently undone. A
     formula still too wide at that floor is left at its natural width and
     marked .ln-math-scroll; the paragraph pans it (see layout.css). Called on
     load, on every section change, on resize, and after present mode reflows
     the content. */
  function fitMath(scope) {
    var root = scope || document;
    if (!root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll("math"), function (m) {
      var p = m.closest ? m.closest("p") : null;
      if (p) p.classList.add("ln-math-host");
    });
    Array.prototype.forEach.call(root.querySelectorAll('math[display="block"]'), function (m) {
      var host = m.parentElement;
      while (host && !host.clientWidth && host.parentElement) host = host.parentElement;
      if (!host || !host.clientWidth) return;
      var base = parseFloat(m.getAttribute("data-ln-math-size"));
      if (!base || isNaN(base)) {
        base = parseFloat(getComputedStyle(m).fontSize) || 16;
        m.setAttribute("data-ln-math-size", String(base));
      }
      m.style.fontSize = base + "px";
      var hcs = getComputedStyle(host);
      var avail = host.clientWidth - (parseFloat(hcs.paddingLeft) || 0) -
        (parseFloat(hcs.paddingRight) || 0);
      if (avail < 1) return;
      var floor = Math.min(base, Math.max(MIN_MATH_PX, base * 0.65));
      var size = base;
      if (m.scrollWidth > avail) {
        size = Math.max(floor, Math.min(base, base * (avail - 0.5) / m.scrollWidth));
        m.style.fontSize = round2(size) + "px";
        var guard = 0;
        while (m.scrollWidth > avail && size > floor && guard++ < 60) {
          size = Math.max(floor, size - 0.25);
          m.style.fontSize = round2(size) + "px";
        }
      }
      var panned = m.scrollWidth > avail;
      m.classList.toggle("ln-math-shrunk", size < base - 0.01);
      if (host.classList) {
        host.classList.toggle("ln-math-scroll", panned);
        if (panned) host.setAttribute("title", "Scroll sideways to read the whole formula");
        else host.removeAttribute("title");
      }
    });
  }

  function scheduleFit() {
    if (fitTimer) clearTimeout(fitTimer);
    fitTimer = setTimeout(function () { fitTimer = null; fitMath(); }, 120);
  }

  function isForm(t) {
    if (!t || !t.tagName) return false;
    var n = t.tagName;
    return n === "INPUT" || n === "TEXTAREA" || n === "SELECT" || t.isContentEditable === true;
  }

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
    fitMath(l[i]);
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

    var present = document.getElementById("lnAppPresent");
    function syncPresentBtn() {
      if (!present) return;
      var on = LN.present && LN.present.isOn ? LN.present.isOn() : false;
      present.setAttribute("aria-pressed", on ? "true" : "false");
      present.textContent = on ? "Exit" : "Present";
    }
    if (present) present.addEventListener("click", function () {
      if (LN.present) LN.present.toggle();
      syncPresentBtn();
      scheduleFit();
    });
    window.addEventListener("resize", scheduleFit);
    window.addEventListener("orientationchange", scheduleFit);

    // Swipe navigation is disabled: the horizontal gesture conflicted with
    // scrolling wide tables. Section changes come from the bottom bar, the
    // contents menu, and the arrow keys only.
    window.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && LN.present && LN.present.isOn && LN.present.isOn()) {
        // The shell engine now broadcasts present-state changes to a hosting
        // viewer from LN.present.on()/off(), so no manual postMessage here.
        LN.present.off();
        syncPresentBtn();
        scheduleFit();
        return;
      }
      if (ev.key === "Escape") { menu(false); return; }
      if (isForm(ev.target)) return;
      if (ev.key === "ArrowRight") { ev.preventDefault(); go(idx + 1, true); }
      else if (ev.key === "ArrowLeft") { ev.preventDefault(); go(idx - 1, true); }
    });
    window.addEventListener("hashchange", function () {
      var hh = window.location.hash;
      if (!hh) return;
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === hh) go(i, false);
      });
    });
  }

  return { init: init, go: go, fitMath: fitMath };
})();
