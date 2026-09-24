#!/usr/bin/env node
/* Activity reasoning smoke — an optional per-item `e` must surface in the
 * wrong-pick feedback of sort-statement and case-match: items with `e` show
 * the reason on wrong picks (per-answer and last-item/Done); items without
 * `e` keep the legacy strings. Exit 0 = both contracts hold. */
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
const caseCss = fs.readFileSync(path.join(__dirname, "..", "skeleton", "components", "case-match", "component.css"), "utf8");
check("case: long feedback stays bounded",
  /min-width\s*:\s*0/.test(caseCss) && /overflow-wrap\s*:\s*anywhere/.test(caseCss));

/* sort-statement: wrong pick must append it.e — per-answer, absent-e legacy,
 * and the last-item Done branch */
{
  const sb = load("sort-statement");
  const root = new El("div");
  sb.LN.components["sort-statement"].init(root, {
    left: "Fixed", right: "Variable",
    items: [{ t: "Rent for the shop", a: "left", e: "Rent never moves with volume." },
            { t: "Gas for deliveries", a: "right" },
            { t: "Insurance deposit amortised", a: "left",
              e: "A deposit is paid once, not per trip." }]
  });
  const rows = walk(root, function (e) {
    return (e.className || "").indexOf("sg-item") >= 0;
  });
  check("sort: three item rows found", rows.length === 3, "rows=" + rows.length);
  const fb = walk(root, function (e) {
    return (e.className || "").indexOf("fb") >= 0 && e.textContent.length > 0;
  })[0];
  function pick(row, label) {
    return walk(row, function (e) {
      return e.tag === "button" && e.textContent === label;
    })[0];
  }
  const b1 = rows[0] && pick(rows[0], "Variable");
  check("sort: wrong-bucket button found", !!b1 && !!fb);
  if (b1 && fb) {
    b1.click();
    check("sort: per-answer wrong pick shows the e reason",
      fb.textContent.indexOf("Rent never moves with volume.") >= 0,
      "fb=" + fb.textContent);
    const b2 = rows[1] && pick(rows[1], "Fixed");
    check("sort: absent-e wrong-bucket button found", !!b2);
    if (b2) {
      b2.click();
      check("sort: absent-e per-answer keeps legacy strings",
        fb.textContent.indexOf("Not quite") >= 0 &&
        fb.textContent.indexOf("undefined") < 0,
        "fb=" + fb.textContent);
      const b3 = rows[2] && pick(rows[2], "Variable");
      check("sort: last-item wrong-bucket button found", !!b3);
      if (b3) {
        b3.click();
        check("sort: Done summary starts with the last e reason",
          fb.textContent.indexOf("A deposit is paid once, not per trip.") === 0 &&
          fb.textContent.indexOf("Done") >= 0,
          "fb=" + fb.textContent);
      }
    }
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
  const row = walk(root, function (e) {
    return (e.className || "").indexOf("mt-row") >= 0;
  })[0];
  const fb = walk(root, function (e) {
    return (e.className || "").indexOf("mt-fb") >= 0;
  })[0];
  check("case: select found", !!sel);
  check("case: feedback is below question and choices",
    !!row && !!fb && row.children[row.children.length - 1] === fb);
  if (sel) {
    sel.value = "Adverse selection";
    sel.fire("change");
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
