"use strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "..", "viewer.html"), "utf8");
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("ok   " + name);
  else { console.log("FAIL " + name + (extra ? " — " + extra : "")); failures++; }
}

// --- Static markup / style checks ---
check("present button markup", /id="presentBtn"/.test(html));
check("floating exit markup", /id="presentExit"/.test(html));
check("posts ln-present on", /type:\s*["']ln-present["'][^}]*on:\s*true/.test(html));
check("posts ln-present off", /on:\s*false/.test(html));
check("iframe expands in present", /present[\s\S]{0,200}position:\s*fixed|body\.ln-viewer-present/.test(html));

// --- Behavioural checks: run the viewer's main IIFE against a tiny DOM stub ---
function makeEl(id) {
  const handlers = {};
  return {
    id: id,
    hidden: false, textContent: "", disabled: false, value: "",
    src: "", type: "", className: "", style: {}, children: [],
    addEventListener: function (t, fn) { (handlers[t] = handlers[t] || []).push(fn); },
    appendChild: function (c) { this.children.push(c); },
    fire: function (t, ev) { (handlers[t] || []).forEach(function (fn) { fn(ev || {}); }); },
    set innerHTML(v) {}, get innerHTML() { return ""; },
  };
}

function boot() {
  const ids = ["filePick", "drop", "fileList", "fileStatus", "stage", "empty",
    "openNewTab", "urlInput", "presentBtn", "presentExit", "loadUrl"];
  const byId = {};
  ids.forEach(function (id) { byId[id] = makeEl(id); });
  const posts = [];
  byId.stage.contentWindow = { postMessage: function (m) { posts.push(m); } };

  const bodyClasses = new Set();
  const docHandlers = {};
  const winHandlers = {};
  const documentStub = {
    getElementById: function (id) { return byId[id]; },
    createElement: function () { return makeEl(""); },
    addEventListener: function (t, fn) { (docHandlers[t] = docHandlers[t] || []).push(fn); },
    body: {
      classList: {
        add: function (c) { bodyClasses.add(c); },
        remove: function (c) { bodyClasses.delete(c); },
        contains: function (c) { return bodyClasses.has(c); },
      },
    },
  };

  const script = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!script) throw new Error("viewer main script not found");
  vm.runInNewContext(script[1], {
    document: documentStub,
    window: {
      open: function () {},
      addEventListener: function (t, fn) {
        (winHandlers[t] = winHandlers[t] || []).push(fn);
      },
    },
    URL: { createObjectURL: function () { return "blob:test"; } },
    console: console,
  });

  byId.urlInput.value = "https://example.com/first.html";
  byId.loadUrl.fire("click");

  return { byId: byId, posts: posts, bodyClasses: bodyClasses,
    docHandlers: docHandlers, winHandlers: winHandlers };
}

try {
  const h = boot();
  h.byId.presentBtn.fire("click");
  check("enter posts {type:'ln-present', v:1, on:true}",
    h.posts.length === 1 && h.posts[0].type === "ln-present" &&
    h.posts[0].v === 1 && h.posts[0].on === true,
    JSON.stringify(h.posts));
  check("enter adds body.ln-viewer-present", h.bodyClasses.has("ln-viewer-present"));
  check("enter reveals floating exit", h.byId.presentExit.hidden === false);

  h.byId.presentExit.fire("click");
  check("exit posts on:false", h.posts.length === 2 && h.posts[1].on === false,
    JSON.stringify(h.posts));
  check("exit removes body.ln-viewer-present", !h.bodyClasses.has("ln-viewer-present"));
  check("exit hides floating exit", h.byId.presentExit.hidden === true);

  h.byId.presentBtn.fire("click");
  (h.docHandlers.keydown || []).forEach(function (fn) { fn({ key: "Escape" }); });
  check("Escape exits present", h.posts[h.posts.length - 1].on === false &&
    !h.bodyClasses.has("ln-viewer-present"));

  h.byId.presentBtn.fire("click");
  const before = h.posts.length;
  h.byId.urlInput.value = "https://example.com/second.html";
  h.byId.loadUrl.fire("click");
  check("switching files exits present (off posted)",
    h.posts.length === before + 1 && h.posts[h.posts.length - 1].on === false &&
    !h.bodyClasses.has("ln-viewer-present"),
    JSON.stringify(h.posts));

  h.byId.presentBtn.fire("click");
  const n = h.posts.length;
  h.byId.presentBtn.fire("click");
  check("toggle off via present button", h.posts.length === n + 1 &&
    h.posts[h.posts.length - 1].on === false);

  // Fix 3: the lesson shell can end present itself (Esc inside the iframe);
  // the viewer must consume ln-present-state and mirror the exit.
  h.byId.presentBtn.fire("click");
  const beforeState = h.posts.length;
  (h.winHandlers.message || []).forEach(function (fn) {
    fn({ source: h.byId.stage.contentWindow,
         data: { type: "ln-present-state", v: 1, on: false } });
  });
  check("iframe ln-present-state on:false exits viewer present",
    h.posts.length === beforeState + 1 &&
    h.posts[h.posts.length - 1].on === false &&
    !h.bodyClasses.has("ln-viewer-present") && h.byId.presentExit.hidden === true,
    JSON.stringify(h.posts));

  h.byId.presentBtn.fire("click");
  const beforeForeign = h.posts.length;
  (h.winHandlers.message || []).forEach(function (fn) {
    fn({ source: { postMessage: function () {} },
         data: { type: "ln-present-state", v: 1, on: false } });
  });
  check("state from a foreign source is ignored",
    h.posts.length === beforeForeign && h.bodyClasses.has("ln-viewer-present"));

  h.byId.presentBtn.fire("click");

  // The lesson shell can also start present itself (e.g. a lesson-driven
  // toggle) and now broadcasts on:true. The viewer must adopt the state
  // without re-posting (re-posting would loop).
  const beforeAdopt = h.posts.length;
  (h.winHandlers.message || []).forEach(function (fn) {
    fn({ source: h.byId.stage.contentWindow,
         data: { type: "ln-present-state", v: 1, on: true } });
  });
  check("iframe ln-present-state on:true is adopted without re-posting",
    h.posts.length === beforeAdopt &&
    h.bodyClasses.has("ln-viewer-present") &&
    h.byId.presentExit.hidden === false &&
    h.byId.presentBtn.textContent === "Exit presentation",
    JSON.stringify(h.posts));
} catch (e) {
  check("behavioural run", false, e && e.stack ? e.stack : String(e));
}

if (failures) { console.log("FAIL — " + failures); process.exit(1); }
console.log("VIEWER PRESENT OK");
