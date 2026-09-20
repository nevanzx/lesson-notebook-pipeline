#!/usr/bin/env node
/* Activity reasoning smoke — an optional per-item `e` must surface in the
 * wrong-pick feedback of sort-statement and case-match. Absent `e` must not
 * change behaviour. Exit 0 = both contracts hold. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function El(tag) {
  this.tag = tag; this.children = []; this.listeners = {}; this.attrs = {};
  this.className = ""; this.textContent = ""; this.value = "";
  this.hidden = false; this.disabled = false; this.style = {}; this.offsetWidth = 1;
  var self = this;
  this.classList = {
    add: function (c) { var s = self.className.split(/\s+/).filter(Boolean);
      if (s.indexOf(c) < 0) s.push(c); self.className = s.join(" "); },
    remove: function (c) { self.className = self.className.split(/\s+/)
      .filter(function (x) { return x && x !== c; }).join(" "); },
    contains: function (c) { return self.className.split(/\s+/).indexOf(c) >= 0; }
  };
}
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) {
  return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
};
El.prototype.addEventListener = function (t, f) {
  (this.listeners[t] = this.listeners[t] || []).push(f);
};
El.prototype.fire = function (t) {
  (this.listeners[t] || []).forEach(function (f) { f({ preventDefault: function () {} }); });
};
El.prototype.click = function () { this.fire("click"); if (this.onclickFn) this.onclickFn(); };
Object.defineProperty(El.prototype, "innerHTML", {
  set: function () { this.children = []; },
  get: function () { return ""; }
});
function walk(el, pred, out) {
  out = out || [];
  if (pred(el)) out.push(el);
  el.children.forEach(function (c) { walk(c, pred, out); });
  return out;
}
function h(tag, attrs, kids) {
  var e = new El(tag), k;
  if (attrs) for (k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "text") e.textContent = attrs[k];
    else if (k === "onclick") e.onclickFn = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (kids) kids.forEach(function (c) { if (c) e.appendChild(c); });
  return e;
}
function load(name) {
  const sb = { console: console, LN: { components: {}, h: h } };
  vm.createContext(sb);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "skeleton", "components", name, "component.js"), "utf8"),
    sb, { filename: name + ".js" });
  return sb;
}
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("ok   " + name);
  else { console.log("FAIL " + name + (extra ? " — " + extra : "")); failures++; }
}

/* sort-statement: wrong pick must append it.e */
{
  const sb = load("sort-statement");
  const root = new El("div");
  sb.LN.components["sort-statement"].init(root, {
    left: "Fixed", right: "Variable",
    items: [{ t: "Rent for the shop", a: "left", e: "Rent never moves with volume." },
            { t: "Gas for deliveries", a: "right" }]
  });
  const wrong = walk(root, function (e) {
    return e.tag === "button" && e.textContent === "Variable";
  })[0];
  check("sort: wrong-bucket button found", !!wrong);
  if (wrong) {
    wrong.click();
    const fbs = walk(root, function (e) {
      return (e.className || "").indexOf("fb") >= 0 && e.textContent.length > 0;
    });
    const hit = fbs.some(function (f) {
      return f.textContent.indexOf("Rent never moves with volume.") >= 0;
    });
    check("sort: wrong pick shows the e reason", hit,
      "fb texts=" + JSON.stringify(fbs.map(function (f) { return f.textContent; })));
  }
}
/* case-match: wrong pick must append s.e */
{
  const sb = load("case-match");
  const root = new El("div");
  sb.LN.components["case-match"].init(root, {
    concepts: ["Moral hazard", "Adverse selection"],
    scenarios: [{ text: "A driver parks less carefully after insuring.",
                  answer: "Moral hazard", e: "Behaviour changes only after the deal closes." }]
  });
  const sel = walk(root, function (e) { return e.tag === "select"; })[0];
  check("case: select found", !!sel);
  if (sel) {
    sel.value = "Adverse selection";
    sel.fire("change");
    const fb = walk(root, function (e) {
      return (e.className || "").indexOf("mt-fb") >= 0;
    })[0];
    check("case: wrong pick shows the e reason",
      !!fb && fb.textContent.indexOf("after the deal closes") >= 0,
      "fb=" + (fb && fb.textContent));
    sel.value = "Moral hazard";
    sel.fire("change");
    check("case: correct pick still locks",
      !!fb && fb.textContent === "Correct" && sel.disabled === true);
  }
}
if (failures) { console.log("SMOKE FAIL — " + failures + " check(s) failed."); process.exit(1); }
console.log("SMOKE OK — wrong-pick reasoning surfaces in both components.");
