#!/usr/bin/env node
/* Assignment deck walkthrough — regression guard for the "Next stays off"
 * bug class (id/sa inputs updating state without refreshing the nav).
 *
 * Loads the REAL skeleton/components/assignment/component.js in a minimal
 * DOM stub, drives one question of EVERY type (mc, tf, id, sa) through
 * typing/clicking, and asserts the Next button enables after each answer.
 *
 * Usage: node tools/assignment_smoke.js [--component path/to/component.js]
 * Exit 0 = all four types let the student advance; exit 1 = bug present.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const compPath = process.argv[2] ||
  path.join(__dirname, "..", "skeleton", "components", "assignment", "component.js");

/* ---------- minimal DOM stub (just enough for the assignment deck) ---------- */
function El(tag) {
  this.tag = tag;
  this.children = [];
  this.listeners = {};
  this.attrs = {};
  this.className = "";
  this.textContent = "";
  this.value = "";
  this.hidden = false;
  this.disabled = false;
  this.style = {};
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
El.prototype.click = function () { this.fire("click"); };
Object.defineProperty(El.prototype, "innerHTML", {
  set: function () { this.children = []; },
  get: function () { return ""; }
});
Object.defineProperty(El.prototype, "childNodes", {
  get: function () { return this.children; }
});
function walk(el, pred, out) {
  out = out || [];
  if (pred(el)) out.push(el);
  el.children.forEach(function (c) { walk(c, pred, out); });
  return out;
}

const docListeners = {};
const sandboxDocument = {
  title: "Smoke Test",
  documentElement: { style: {} },
  fullscreenElement: null,
  hidden: false,
  createElement: function (t) { return new El(t); },
  querySelector: function () { return null; }, /* no ln:week/subject meta */
  addEventListener: function (t, f) {
    (docListeners[t] = docListeners[t] || []).push(f);
  },
  body: new El("body")
};
const sandboxWindow = {
  addEventListener: function (t, f) {
    (docListeners["win:" + t] = docListeners["win:" + t] || []).push(f);
  }
};
const sandboxLN = {
  components: {},
  h: function (tag, attrs, kids) {
    var e = new El(tag), k;
    if (attrs) for (k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (kids) kids.forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
};
sandboxWindow.LN = sandboxLN;
let clockReply = { ok: true, day: "Wednesday" };
const sandboxFetch = function () {
  return new Promise(function (resolve, reject) {
    if (clockReply.ok) {
      resolve({ ok: true, json: function () {
        return Promise.resolve({
          datetime: "2026-09-23T10:00:00+08:00",
          day_of_week: clockReply.day, unixtime: 1758602400
        });
      } });
    } else {
      reject(new Error("offline"));
    }
  });
};
const sandbox = {
  window: sandboxWindow,
  document: sandboxDocument,
  LN: sandboxLN,
  fetch: sandboxFetch,
  AbortController: function () { this.signal = null; this.abort = function () {}; },
  console: console
};
sandbox.window.document = sandboxDocument;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(compPath, "utf8"), sandbox,
  { filename: "assignment-component.js" });

/* ---------- drive the deck: one item per type ---------- */
const data = {
  intro: "smoke",
  items: [
    { type: "mc", prompt: "Pick A", choices: ["A", "B", "C", "D"] },
    { type: "tf", prompt: "True?" },
    { type: "id", prompt: "Name it" },
    { type: "sa", prompt: "Explain" }
  ]
};
const root = new El("div");
sandboxLN.components["assignment"]._setClock(function (tz, cb) {
  cb({ ok: true, dow: "wednesday", iso: "2026-09-23T10:00:00+08:00" });
});
sandboxLN.components["assignment"].init(root, data);

const btns = walk(root, function (e) { return e.tag === "button"; });
const begin = btns.filter(function (b) {
  return (b.className || "").indexOf("lna-begin") >= 0;
})[0];
const nextBtn = btns.filter(function (b) {
  return (b.className || "").indexOf("lna-next") >= 0 &&
    (b.textContent || "").indexOf("Next") === 0;
})[0];
if (!begin || !nextBtn) {
  console.log("FAIL — could not find Begin/Next buttons in the deck");
  process.exit(1);
}
begin.click();

/* Identity gate: Begin must open verification first, quiz only after it */
let failures = 0;
function check(name, cond, extra) {
  if (cond) { console.log("ok   " + name); }
  else { console.log("FAIL " + name + (extra ? " — " + extra : "")); failures++; }
}

/* ---------- Wednesday gate: in-window card opens, Begin enabled ---------- */
const openNote = walk(root, function (e) {
  return (e.className || "").indexOf("lna-lock-open") >= 0;
})[0];
check("gate: in-window card shows the open status", !!openNote);
check("gate: in-window Begin is enabled", begin.disabled === false,
  "disabled=" + begin.disabled);

/* ---------- clock module ---------- */
const assignmentComp = sandboxLN.components["assignment"];
const goodClock = assignmentComp._parseNow({
  datetime: "2026-09-23T10:00:00+08:00",
  day_of_week: "Wednesday", unixtime: 1758602400
});
check("clock: Wednesday API reply maps to lowercase weekday + iso",
  goodClock.ok === true && goodClock.dow === "wednesday" &&
    goodClock.iso === "2026-09-23T10:00:00+08:00" &&
    goodClock.unixtime === 1758602400, JSON.stringify(goodClock));
const badClock = assignmentComp._parseNow({ day_of_week: "Wednesday" });
check("clock: malformed reply (missing datetime) fails closed",
  badClock.ok === false && badClock.reason === "malformed-time",
  JSON.stringify(badClock));
check("clock: meta defaults to wednesday/Asia/Manila when absent",
  JSON.stringify(assignmentComp._windowMeta()) ===
    JSON.stringify({ day: "wednesday", tz: "Asia/Manila" }),
  JSON.stringify(assignmentComp._windowMeta()));
(function () {
  let netResult = null;
  const savedFetch = sandbox.fetch;
  sandbox.fetch = undefined;
  try {
    assignmentComp._trustedNow("Asia/Manila", function (r) { netResult = r; });
  } finally {
    sandbox.fetch = savedFetch;
  }
  check("clock: network failure reports ok:false (fail closed)",
    netResult && netResult.ok === false, JSON.stringify(netResult));
})();

const nameInputs = walk(root, function (e) {
  return e.tag === "input" && (e.className || "").indexOf("lna-name") >= 0;
});
const idInputs0 = walk(root, function (e) {
  return e.tag === "input" && (e.className || "").indexOf("lna-id") >= 0;
});
check("identity gate present (name + ID fields)", nameInputs.length === 1 && idInputs0.length === 1,
  "name=" + nameInputs.length + " id=" + idInputs0.length);
const startBtn = btns.filter(function (b) {
  return (b.className || "").indexOf("lna-start") >= 0;
})[0];
check("identity gate has a Start button", !!startBtn);
if (!startBtn) {
  console.log("SMOKE FAIL — no identity Start button; quiz must not open first.");
  process.exit(1);
}
function hasClass(e, c) {
  return ((" " + (e.className || "") + " ").indexOf(" " + c + " ") >= 0);
}
const quizWrap = walk(root, function (e) { return hasClass(e, "lna-quiz"); })[0];
const identWrap = walk(root, function (e) { return hasClass(e, "lna-ident"); })[0];
check("Begin opens identity first (quiz hidden)", quizWrap && quizWrap.hidden === true &&
  identWrap && identWrap.hidden === false,
  "quiz.hidden=" + (quizWrap && quizWrap.hidden) +
  " ident.hidden=" + (identWrap && identWrap.hidden));
nameInputs[0].value = "Dela Cruz, Juan";
nameInputs[0].fire("input");
idInputs0[0].value = "20240012";
idInputs0[0].fire("input");
startBtn.click();
check("identity verified → quiz opens at Q1 (Next still locked until answered)",
  nextBtn.disabled === true, "Next.disabled=" + nextBtn.disabled);

/* No-exit lock: no visible Exit/Close before submit */
const exits = walk(root, function (e) {
  return e.tag === "button" && (e.className || "").indexOf("lna-exit") >= 0;
});
const visibleExits = exits.filter(function (b) { return !b.hidden; });
check("no Exit while quiz runs (Close only after submit)",
  visibleExits.length === 0, "visible exits=" + visibleExits.length);

/* Q1 mc */
let radios = walk(root, function (e) {
  return e.tag === "input" && e.attrs.type === "radio";
});
radios[0].click();
check("mc answers → Next enables", nextBtn.disabled === false,
  "Next.disabled=" + nextBtn.disabled);
nextBtn.click();

/* Q2 tf */
radios = walk(root, function (e) {
  return e.tag === "input" && e.attrs.type === "radio" &&
    e.attrs.name === "a1";
});
radios[0].click();
check("tf answers → Next enables", nextBtn.disabled === false,
  "Next.disabled=" + nextBtn.disabled);
nextBtn.click();

/* Q3 id — type, then Next must enable WITHOUT any other click */
const idInputs = walk(root, function (e) {
  return e.tag === "input" && (e.className || "").indexOf("lna-txt") >= 0;
});
idInputs[0].value = "BSP";
idInputs[0].fire("input");
check("id typing → Next enables", nextBtn.disabled === false,
  "Next.disabled=" + nextBtn.disabled + " (typed answer stuck: student cannot advance)");

/* clearing the typed answer must switch Next back off, re-typing restores it */
idInputs[0].value = "";
idInputs[0].fire("input");
check("id cleared → Next disables again", nextBtn.disabled === true,
  "Next.disabled=" + nextBtn.disabled);
idInputs[0].value = "BSP";
idInputs[0].fire("input");
check("id re-typed → Next enables", nextBtn.disabled === false,
  "Next.disabled=" + nextBtn.disabled);

if (nextBtn.disabled === false) nextBtn.click();
else { console.log("FAIL id advance — Next click would be swallowed (disabled)"); failures++; }

/* Q4 sa — last slide shows Submit; drive it via nav state + dots */
const areas = walk(root, function (e) { return e.tag === "textarea"; });
areas[0].value = "Because margins compress.";
areas[0].fire("input");
const dots = walk(root, function (e) {
  return e.tag === "span" && (e.className || "").indexOf("lna-dot") >= 0;
});
const allDone = dots.every(function (d) {
  return (d.className || "").indexOf("done") >= 0;
});
check("sa typing → slide marked done (submit gate sees it)", allDone,
  "dots=" + JSON.stringify(dots.map(function (d) { return d.className; })));

if (failures) {
  console.log("SMOKE FAIL — " + failures + " flat check(s) failed.");
  process.exit(1);
}
console.log("ok   flat deck — mc/tf/id/sa all advance");

/* ---------- DAG mode walk ---------- */
const dagData = {
  intro: "smoke", mode: "dag", title: "T", scenario: "S",
  nodes: [
    { id: "n0", level: 0, isLeaf: false, question: "Q " + "word ".repeat(16),
      outcome: null,
      choices: [
        { label: "A", text: "take the upper road now", nextNodeId: "n1" },
        { label: "B", text: "take the lower road now", nextNodeId: "n2" }
      ] },
    { id: "n1", level: 1, isLeaf: false, question: "Q " + "word ".repeat(16),
      outcome: "You went upper.",
      choices: [
        { label: "A", text: "meet at the junction", nextNodeId: "n3" },
        { label: "B", text: "miss the junction way", nextNodeId: "n3" }
      ] },
    { id: "n2", level: 1, isLeaf: false, question: "Q " + "word ".repeat(16),
      outcome: "You went lower.",
      choices: [
        { label: "A", text: "meet at the junction", nextNodeId: "n3" },
        { label: "B", text: "miss the junction way", nextNodeId: "n3" }
      ] },
    { id: "n3", level: 2, isLeaf: true, question: "End of the line",
      outcome: "Paths met.", choices: [], finalOutcome: "Scenario closed." }
  ]
};
const root2 = new El("div");
sandboxLN.components["assignment"].init(root2, dagData);

/* ---------- Wednesday gate: out-of-window + offline stay shut ---------- */
sandboxLN.components["assignment"]._setClock(function (tz, cb) {
  cb({ ok: true, dow: "tuesday", iso: "2026-09-22T10:00:00+08:00" });
});
const root3 = new El("div");
sandboxLN.components["assignment"].init(root3, data);
const begin3 = walk(root3, function (e) {
  return e.tag === "button" && (e.className || "").indexOf("lna-begin") >= 0;
})[0];
check("gate: out-of-window Begin stays disabled", begin3.disabled === true,
  "disabled=" + begin3.disabled);
const shut = walk(root3, function (e) {
  return (e.className || "").indexOf("lna-lock-shut") >= 0;
})[0];
check("gate: out-of-window card shows the window notice", !!shut);

sandboxLN.components["assignment"]._setClock(function (tz, cb) {
  cb({ ok: false, reason: "network" });
});
const root4 = new El("div");
sandboxLN.components["assignment"].init(root4, data);
const begin4 = walk(root4, function (e) {
  return e.tag === "button" && (e.className || "").indexOf("lna-begin") >= 0;
})[0];
check("gate: offline Begin stays disabled", begin4.disabled === true,
  "disabled=" + begin4.disabled);
const offline = walk(root4, function (e) {
  return (e.className || "").indexOf("lna-lock-shut") >= 0 &&
    (e.textContent || "").indexOf("Cannot verify the time") >= 0;
})[0];
check("gate: offline shows the connectivity notice", !!offline);

const btns2 = walk(root2, function (e) { return e.tag === "button"; });
const begin2 = btns2.filter(function (b) {
  return (b.className || "").indexOf("lna-begin") >= 0;
})[0];
const next2 = btns2.filter(function (b) {
  return (b.className || "").indexOf("lna-next") >= 0 &&
    (b.textContent || "").indexOf("Next") === 0;
})[0];
const back2 = btns2.filter(function (b) {
  return (b.className || "").indexOf("lna-back") >= 0;
})[0];
const submit2 = btns2.filter(function (b) {
  return (b.textContent || "") === "Submit";
})[0];
check("dag: Begin + Next present", !!begin2 && !!next2);
check("dag: no Back button anywhere", !back2, "back found");
begin2.click();

const name2 = walk(root2, function (e) {
  return e.tag === "input" && (e.className || "").indexOf("lna-name") >= 0;
});
const id2 = walk(root2, function (e) {
  return e.tag === "input" && (e.className || "").indexOf("lna-id") >= 0;
});
const start2 = btns2.filter(function (b) {
  return (b.className || "").indexOf("lna-start") >= 0;
})[0];
name2[0].value = "Dela Cruz, Juan";
name2[0].fire("input");
id2[0].value = "20240012";
id2[0].fire("input");
start2.click();
check("dag: Next locked before pick", next2.disabled === true);

let radios2 = walk(root2, function (e) {
  return e.tag === "input" && e.attrs.type === "radio" &&
    e.attrs.name === "a_n0";
});
check("dag: root shows 2 choices", radios2.length === 2, "n=" + radios2.length);
radios2[0].click();
check("dag: pick enables Next", next2.disabled === false);
next2.click();

/* at n1: layer meter + still no back; filter by node radio name (hidden
 * slides keep their radios in the DOM — same trick the flat walk uses) */
const prog2 = walk(root2, function (e) {
  return e.tag === "span" && (e.className || "").indexOf("lna-prog") >= 0;
})[0];
check("dag: layer meter advances", (prog2.textContent || "").indexOf("Layer 2") === 0,
  prog2.textContent);
radios2 = walk(root2, function (e) {
  return e.tag === "input" && e.attrs.type === "radio" &&
    e.attrs.name === "a_n1";
});
check("dag: mid node shows 2 choices", radios2.length === 2, "n=" + radios2.length);
radios2[0].click();
next2.click();

/* leaf: component toggles submit/next .hidden in showDag */
check("dag: leaf unhides Submit", !!submit2 && submit2.hidden === false);
check("dag: leaf hides Next", !!next2 && next2.hidden === true);
check("dag: walk reached leaf without Back", !back2);

/* Submit shape: stub _export to record the body instead of encrypting */
let submittedBody = null;
sandboxLN.components["assignment"]._export = function (body, ui) {
  submittedBody = body;
  if (ui && typeof ui.onDone === "function") ui.onDone();
};
submit2.click();
check("dag: submit captured export body", !!submittedBody);
if (submittedBody) {
  check("dag: submit body mode is dag", submittedBody.mode === "dag",
    "mode=" + submittedBody.mode);
  check("dag: submit path is length-2 array",
    Array.isArray(submittedBody.path) && submittedBody.path.length === 2,
    "path=" + JSON.stringify(submittedBody.path));
  check("dag: submit final_outcome non-empty",
    !!(submittedBody.final_outcome && String(submittedBody.final_outcome).trim()),
    "final_outcome=" + JSON.stringify(submittedBody.final_outcome));
  check("dag: submit student name+id present",
    !!(submittedBody.student && submittedBody.student.name && submittedBody.student.id),
    "student=" + JSON.stringify(submittedBody.student));
}

if (failures) {
  console.log("SMOKE FAIL — " + failures + " check(s) failed.");
  process.exit(1);
}
console.log("SMOKE OK — flat deck + dag walk both let the student advance.");
