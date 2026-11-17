#!/usr/bin/env node
/* Equation-stack smoke — a run of equations must have vertical room, and two
 * equations must never share a line.
 *
 * Why this gate exists: only `math[display="block"]` receives the shell's
 * vertical rhythm (`margin:1.15em 0`, measured 18.4px between blocks). An
 * equation authored as bare inline `<math>` — the shape the old "split chains
 * onto <br>-separated lines" guidance produced — gets no vertical margin at
 * all. Measured on Week 13 before the fix: 2-10px between consecutive
 * equations (fractions touching the next line), and in one worked example two
 * equations laid out side by side on a single line because nothing separated
 * them. Week 14 still ships that defect.
 *
 * This is the sibling-collision check layout_smoke.js cannot do: that tool
 * compares each box against itself, so equations sitting 2px apart, or two
 * equations overlapping on one line, are invisible to it. Here every
 * line-leading equation is measured against the one before it.
 *
 * What counts as an equation: a MathML element whose own text carries "=" —
 * a `Where:` symbol gloss (`<math><mi>DFL</mi></math> = degree of …`) keeps its
 * equals in the prose, so it is not an equation and is left alone. Equations
 * that sit inside a sentence (prose before them on the same line) are correct
 * markup and are skipped too.
 *
 * Usage: node tools/math_stack.js <built.html> [--chrome <path>] [--width <px>]
 *        node tools/math_stack.js Week13-Notebook.html --verbose
 * Exit 0 = MATH STACK OK; exit 1 = defect found (details printed); exit 2 = the
 * probe could not run (no Chrome, no Node 22, page did not load).
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const { pathToFileURL } = require("url");

/* Rendering noise: a shared line is judged at 1.5px, a gap below 15px is a
   defect (display blocks measure 18.4px, so this leaves headroom for a theme
   that tunes the rhythm slightly tighter). */
const SAME_LINE_PX = 1.5;
const MIN_GAP_PX = 15;

const argv = process.argv.slice(2);
let chromeArg = process.env.LN_CHROME || process.env.CHROME_PATH || "";
let htmlPath = "";
let wantWidth = 1280;
let verbose = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--chrome") { chromeArg = argv[++i]; }
  else if (argv[i] === "--width") { wantWidth = parseInt(argv[++i], 10) || 1280; }
  else if (argv[i] === "--verbose") { verbose = true; }
  else if (!htmlPath) { htmlPath = argv[i]; }
}
if (!htmlPath) {
  console.log("usage: node tools/math_stack.js <built.html> [--chrome <path>] [--width <px>] [--verbose]");
  process.exit(2);
}
if (!fs.existsSync(htmlPath)) { console.log("FAIL — no such file: " + htmlPath); process.exit(2); }

const CANDIDATES = [
  chromeArg,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const chrome = CANDIDATES.find((c) => c && fs.existsSync(c));
if (!chrome) {
  console.log("SKIP — no Chrome/Edge found; set LN_CHROME to the executable.");
  process.exit(2);
}
if (typeof WebSocket === "undefined") {
  console.log("FAIL — this gate needs Node 22+ (global WebSocket).");
  process.exit(2);
}

const targetUrl = pathToFileURL(path.resolve(htmlPath)).href;
const profDir = fs.mkdtempSync(path.join(os.tmpdir(), "ln-mathstack-prof-"));
const port = 9200 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `
(() => {
  const visible = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
    }
    return true;
  };
  /* line-leading: the equation starts its own line, so nothing but inline
     content may precede it. A <br> or a block-level sibling ends the previous
     line and makes the equation line-leading; prose text before it on the same
     line means the equation sits inside a sentence (correct as plain <math>). */
  const BLOCKY = /^(block|list-item|table|flex|grid|flow-root)/;
  const lineLeading = (m) => {
    for (let s = m.previousSibling; s; s = s.previousSibling) {
      if (s.nodeType === 3) { if (s.textContent.trim()) return false; continue; }
      if (s.nodeType !== 1) continue;
      if (s.tagName === "BR") return true;
      if (BLOCKY.test(getComputedStyle(s).display)) return true;
      /* otherwise inline: same line, keep walking */
    }
    return true;   /* first thing in its container */
  };
  const out = [];
  let checked = 0;
  for (const sec of document.querySelectorAll("section.block")) {
    let prev = null;
    for (const m of sec.querySelectorAll("math")) {
      if (!m.textContent.includes("=")) continue;      /* symbol gloss, not an equation */
      if (!visible(m)) continue;
      if (!lineLeading(m)) continue;                   /* equation inside a sentence */
      const box = m.getBoundingClientRect();
      if (!box.height) continue;
      checked++;
      const display = getComputedStyle(m).display;
      const label = m.textContent.replace(/\\s+/g, " ").trim().slice(0, 46);
      if (!/^block/.test(display)) {
        out.push({ kind: "inline", sec: sec.id, label: label, display: display });
      }
      if (prev) {
        const gap = +(box.top - prev.box.bottom).toFixed(1);
        /* Same line = the boxes overlap vertically. Comparing tops alone misses
           a fraction (tall) sitting beside a short expression, which is exactly
           how a merged pair presents. */
        const overlap = Math.min(box.bottom, prev.box.bottom) - Math.max(box.top, prev.box.top);
        const sameLine = overlap > 0.5 * Math.min(box.height, prev.box.height);
        if (sameLine) {
          out.push({ kind: "baseline", sec: sec.id, label: label, gap: gap,
                     prev: prev.label });
        } else if (gap < ${MIN_GAP_PX}) {
          out.push({ kind: "gap", sec: sec.id, label: label, gap: gap, prev: prev.label });
        }
      }
      prev = { box: box, label: label };
    }
  }
  return JSON.stringify({ checked: checked, defects: out });
})()`;

function cleanup() {
  try { fs.rmSync(profDir, { recursive: true, force: true }); } catch (x) {}
}

(async () => {
  const proc = cp.spawn(chrome, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars",
    "--user-data-dir=" + profDir,
    "--remote-debugging-port=" + port,
    "--window-size=" + wantWidth + ",1200",
    "about:blank",
  ], { stdio: "ignore" });

  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
      target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    } catch (x) { /* chrome not listening yet */ }
  }
  if (!target) {
    console.log("FAIL — Chrome did not start on the debug port.");
    proc.kill(); cleanup(); process.exit(2);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  let msgId = 0;
  const waiting = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  };
  const send = (method, params) => new Promise((res) => {
    const id = ++msgId;
    waiting.set(id, res);
    ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  await send("Page.enable", {});
  await send("Runtime.enable", {});
  await send("Emulation.setDeviceMetricsOverride", {
    width: wantWidth, height: 1200, deviceScaleFactor: 1, mobile: wantWidth < 700,
  });
  await send("Page.navigate", { url: targetUrl });

  /* The shell shows one section at a time, so "not rendered" is the normal
     state for most of the page. Wait for the REAL document first: about:blank
     is already "complete", so polling readyState alone measures a blank page
     and reports zero equations. Require the file URL and a rendered section. */
  let loaded = false;
  let lastState = "";
  for (let i = 0; i < 80 && !loaded; i++) {
    await sleep(250);
    const r = await send("Runtime.evaluate", {
      expression: "JSON.stringify({href:location.href,ready:document.readyState," +
        "sections:document.querySelectorAll('section.block').length})",
      returnByValue: true,
    });
    lastState = (r.result && r.result.result && r.result.result.value) || "(no answer)";
    loaded = /"ready":"complete"/.test(lastState) && /"sections":[1-9]/.test(lastState) &&
      /"href":"file:/.test(lastState);
  }
  if (!loaded) {
    console.log("FAIL — the page did not finish loading. Last state: " + lastState +
      " target=" + targetUrl);
    ws.close(); proc.kill(); cleanup(); process.exit(2);
  }

  await send("Runtime.evaluate", {
    expression: "(() => { const s = document.createElement('style');" +
      "s.textContent = 'section.block{display:block !important}';" +
      "document.head.appendChild(s); return 1; })()",
  });
  await sleep(400);

  const res = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  ws.close();
  proc.kill();
  cleanup();

  let report;
  try { report = JSON.parse(res.result.result.value); }
  catch (e) { console.log("FAIL — unreadable math report: " + e.message); process.exit(2); }

  const defects = report.defects || [];
  const name = path.basename(htmlPath);
  if (!defects.length) {
    console.log("ok   every equation line is a display block with " + MIN_GAP_PX +
      "px+ of room (" + report.checked + " checked at " + wantWidth + "px)");
    console.log("MATH STACK OK — " + name);
    process.exit(0);
  }

  const byKind = { inline: 0, baseline: 0, gap: 0 };
  defects.forEach((d) => { byKind[d.kind] = (byKind[d.kind] || 0) + 1; });
  console.log("FAIL — " + defects.length + " equation-spacing defect(s) at " + wantWidth + "px (" +
    byKind.inline + " not a display block, " + byKind.baseline + " sharing a line, " +
    byKind.gap + " too tight):");
  defects.forEach((d) => {
    if (d.kind === "inline") {
      console.log("  inline  #" + d.sec + "  computed display=" + d.display + "  << " + d.label);
    } else if (d.kind === "baseline") {
      console.log("  same line  #" + d.sec + "  gap=" + d.gap + "px  << " + d.label +
        "   (previous: " + d.prev + ")");
    } else {
      console.log("  gap " + d.gap + "px  #" + d.sec + "  << " + d.label +
        "   (previous: " + d.prev + ")");
    }
  });
  if (verbose) console.log("  equations measured: " + report.checked);
  console.log("MATH STACK FAIL — give every equation its own line: <math display=\"block\">, " +
    "never <br>-joined or bare inline <math>; unit words go inside the math as " +
    "<mtext>&#160;…</mtext>.");
  process.exit(1);
})().catch((e) => {
  console.log("FAIL — math stack probe crashed: " + e.message);
  cleanup();
  process.exit(2);
});
