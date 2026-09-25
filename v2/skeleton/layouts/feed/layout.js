"use strict";
LN.nav = (function () {
  var idx = 0;

  function list() { return document.querySelectorAll("section.block[id]"); }

  function build() {
    var grid = document.getElementById("lnFeedGrid");
    if (!grid) return;
    grid.innerHTML = "";
    Array.prototype.forEach.call(list(), function (s, i) {
      var hd = s.querySelector("h2,h1");
      var card = LN.h("button", { class: "ln-feed-card", type: "button" }, [
        LN.h("span", { class: "ln-feed-num", text: ("0" + (i + 1)).slice(-2) }),
        LN.h("span", { class: "ln-feed-txt", text: hd ? hd.textContent : s.id }),
        LN.h("span", { class: "ln-feed-ring" })
      ]);
      card.addEventListener("click", function () { open(i); });
      grid.appendChild(card);
    });
    var sub = document.getElementById("lnFeedSub");
    if (sub) sub.textContent = list().length + " sections";
  }

  function marks(i) {
    var grid = document.getElementById("lnFeedGrid");
    if (!grid) return;
    Array.prototype.forEach.call(grid.children, function (c, k) {
      c.classList.toggle("active", k === i);
    });
  }

  function show(i, pushHash) {
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
    marks(i);
    if (pushHash !== false) {
      try { history.replaceState(null, "", "#" + l[i].id); } catch (e) {}
    }
    var stage = document.querySelector(".stage");
    if (stage && stage.scrollIntoView) stage.scrollIntoView();
  }

  function open(i) {
    document.body.classList.add("ln-feed-open");
    var back = document.getElementById("lnFeedBack");
    if (back) back.hidden = false;
    show(i, true);
  }

  function close() {
    document.body.classList.remove("ln-feed-open");
    var back = document.getElementById("lnFeedBack");
    if (back) back.hidden = true;
  }

  function init() {
    document.body.classList.add("js-tabs");
    build();
    var back = document.getElementById("lnFeedBack");
    if (back) back.addEventListener("click", function () { close(); });
    var h = window.location.hash, found = -1;
    Array.prototype.forEach.call(list(), function (s, i) {
      if ("#" + s.id === h) found = i;
    });
    if (found >= 0) open(found); else close();
    window.addEventListener("hashchange", function () {
      var hh = window.location.hash;
      if (!hh) return;
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === hh) open(i);
      });
    });
  }

  return { init: init, go: show };
})();
