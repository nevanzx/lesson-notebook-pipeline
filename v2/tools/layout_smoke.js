#!/usr/bin/env node
/* Layout containment smoke — text must not escape its box.
 *
 * Renders a built notebook in headless Chrome, forces every section
 * visible, and flags any element whose content visibly spills its box
 * (scrollHeight/scrollWidth exceed clientWidth/Height while overflow is
 * visible) or is silently clipped (overflow hidden with text content).
 *
 * Guards the Week 9 flip-card class: two faces stacked with
 * `position:absolute;inset:0` inside a fixed `min-height` container, so a
 * long answer overflows the tile. Content-sized stacking (grid `grid-area:1/1`)
 * is the fix; this tool is the regression gate.
 *
 * Phone widths need the CDP path: `--dump-dom` cannot render below ~500 CSS
 * px (headless floors the window), so the Week 8 class — desktop theme
 * margins squeezing the text column at 390px — was invisible to the default
 * run. Always gate both: `layout_smoke.js <built.html>` (desktop) and
 * `layout_smoke.js <built.html> --width 390` (phone).
 *
 * MathML is measured differently, on purpose. A MathML box is sized to the math
 * font's em box, so `scrollHeight > clientHeight` fires on every element of
 * every formula (measured: 920 elements across Weeks 7-8, dy 3-10px, dx 0,
 * zero clipped) and on any block whose line box a formula raises. Treating
 * that as overflow made every MathML notebook fail while showing nothing wrong
 * on screen. So for MathML the tool instead checks the two real defects — the
 * formula is wider than its column, or an `overflow:hidden` ancestor clips it
 * — and ignores self-overflow. Verified: Week 7 and Week 8 pass, while a
 * deliberately clipped formula and an over-wide one still fail.
 *
 * Known limit: this tool compares each box against itself, so it cannot see
 * *sibling collision* — two display equations overlapping was invisible here
 * and was fixed in CSS. Catching that needs a geometry check between siblings.
 *
 * --present measures the presentation (outline) view instead of the reading
 * view: after load it calls LN.present.on() and forces every kept section
 * (section.block.ln-pres-keep) visible, so the kept outline is measured at the
 * target viewport. Untagged content hidden by the transform stays hidden.
 *
 * Usage: node tools/layout_smoke.js <built.html> [--chrome <path>] [--verbose] [--present]
 *        node tools/layout_smoke.js <built.html> --width 390 [--height 844]
 * Exit 0 = LAYOUT OK; exit 1 = overflow found (details printed).
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const { pathToFileURL } = require("url");

const argv = process.argv.slice(2);
let htmlPath = null, chromeArg = null, verbose = false, wantWidth = 0, wantHeight = 844, present = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--chrome") { chromeArg = argv[++i]; }
  else if (argv[i] === "--verbose") { verbose = true; }
  else if (argv[i] === "--present") { present = true; }
  else if (argv[i] === "--width") { wantWidth = parseInt(argv[++i], 10) || 0; }
  else if (argv[i] === "--height") { wantHeight = parseInt(argv[++i], 10) || 844; }
  else if (!htmlPath) { htmlPath = argv[i]; }
}
if (!htmlPath) {
  console.log("usage: node tools/layout_smoke.js <built.html> [--chrome <path>] [--verbose] [--present] [--width <px>] [--height <px>]");
  process.exit(2);
}
htmlPath = path.resolve(htmlPath);
if (!fs.existsSync(htmlPath)) { console.log("FAIL — no such file: " + htmlPath); process.exit(2); }

function findChrome() {
  const cands = [];
  if (chromeArg) cands.push(chromeArg);
  if (process.env.LN_CHROME) cands.push(process.env.LN_CHROME);
  if (process.env.CHROME_PATH) cands.push(process.env.CHROME_PATH);
  if (process.platform === "win32") {
    cands.push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    cands.push("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");
    cands.push("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
    cands.push("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe");
  } else if (process.platform === "darwin") {
    cands.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    cands.push("/Applications/Chromium.app/Contents/MacOS/Chromium");
  }
  for (const c of cands) { if (c && fs.existsSync(c)) return c; }
  for (const c of ["google-chrome", "chromium", "chromium-browser", "chrome"]) {
    try { cp.execFileSync(c, ["--version"], { stdio: "ignore" }); return c; } catch (e) {}
  }
  return null;
}
const chrome = findChrome();
if (!chrome) {
  console.log("LAYOUT SKIP — no Chrome/Edge found; set LN_CHROME to the executable.");
  process.exit(0);
}

/* In present mode only the kept sections are forced visible; untagged sections
   stay hidden by body.ln-present and untagged descendants stay hidden by the
   transform, so the outline -- not the reading view -- is what gets measured. */
const forceCss = present
  ? "section.block.ln-pres-keep{display:block !important;}"
  : "section.block{display:block !important;}";
const measureSelector = present ? "section.block.ln-pres-keep *" : "section.block *";
const revealScript = present
  ? `
  if (window.LN && LN.present && LN.present.on) PRESENT_ACTIVE = LN.present.on();
  Array.prototype.forEach.call(document.querySelectorAll("section.block.ln-pres-keep"), function (s) {
    s.hidden = false; s.removeAttribute("hidden");
    if (s.style) s.style.display = "";
  });`
  : `
  document.querySelectorAll("section.block").forEach(function (s) {
    s.hidden = false; s.removeAttribute("hidden");
    s.querySelectorAll("[hidden]").forEach(function (c) {
      if (c.classList && c.classList.contains("lna-lock")) return;
      c.hidden = false;
    });
  });`;

const PROBE = `
<style>
  ${forceCss}
  .ln-app-toc,.ln-app-scrim{display:none !important;}
  *,*::before,*::after{animation:none !important;transition:none !important;}
</style>
<script>
window.addEventListener("load", function () {
  var PRESENT = ${present ? "true" : "false"};
  var PRESENT_ACTIVE = null;
  ${revealScript}
  var SKIP = {INPUT:1,TEXTAREA:1,SELECT:1,OPTION:1,SVG:1,IMG:1,VIDEO:1,CANVAS:1,IFRAME:1,STYLE:1,SCRIPT:1};
  function directText(el) {
    var t = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) t += n.nodeValue;
    }
    return t.trim();
  }
  function desc(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    if (el.className && typeof el.className === "string") {
      s += "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".");
    }
    return s;
  }
  var spills = [];
  spills.push({ sel: "viewport iw=" + window.innerWidth, dx: 0, dy: 0, clipped: false, _meta: true,
    _doc: document.documentElement.scrollWidth });
  if (PRESENT && !PRESENT_ACTIVE) {
    spills.push({ sel: "present mode did not activate (LN.present.on() returned false; no [data-present] markers?)",
                  dx: 0, dy: 0, clipped: false });
  }
  var MATHNS = "http://www.w3.org/1998/Math/MathML";
  document.querySelectorAll("${measureSelector}").forEach(function (el) {
    if (SKIP[el.tagName]) return;
    if (el.closest && el.closest("svg")) return;
    var cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    if (!el.clientHeight && !el.clientWidth) return;
    /* MathML: self-overflow is not a meaningful test. A MathML box is sized to
       the math font's em box, whose ascent/descent exceed the content box at
       EVERY level of the tree, so scrollHeight > clientHeight fires uniformly
       on tokens, rows, fractions and the <math> itself -- measured across
       Weeks 7-8: 920 elements, dy 3-10px, dx 0, zero clipped. A taller inline
       math also raises the line box of any block that contains it. All of that
       is font-metric artifact, not overflow.
       What CAN actually be wrong with a formula, and is still measured:
         (a) horizontal escape -- the formula is wider than its column
         (b) clipping          -- an overflow:hidden ancestor cuts it off
       NB MathML reports a LOWERCASE tagName (like SVG) and lives in its own
       namespace, so match namespaceURI/localName and never "MATH". */
    if (el.namespaceURI === MATHNS) {
      if (el.localName !== "math") return;           // token / row / fraction
      var pp = el.parentElement;
      if (pp && pp.namespaceURI === MATHNS) return;  // not the outermost <math>
      if (!pp) return;
      /* An INLINE host (e.g. <span class="hl">) reports clientWidth 0 -- it has
         no box to measure against. Walk up to the nearest ancestor with one. */
      var box = pp, g = 0;
      while (box && !box.clientWidth && g++ < 8) box = box.parentElement;
      var clipper = null, q = pp, g2 = 0;            // nearest clipping ancestor
      while (q && g2++ < 24) {
        var qcs = window.getComputedStyle(q);
        if (qcs.overflowX === "hidden" || qcs.overflowY === "hidden") { clipper = q; break; }
        q = q.parentElement;
      }
      var escX = box ? Math.round(el.getBoundingClientRect().width - box.clientWidth) : 0;
      if (escX > 6) spills.push({ sel: desc(el) + " escapes " + box.tagName,
                                  dx: escX, dy: 0, clipped: false });
      else if (clipper) spills.push({ sel: desc(el) + " clipped by " + clipper.tagName,
                                      dx: 0, dy: 0, clipped: true });
      return;
    }
    var dx = el.scrollWidth - el.clientWidth;
    /* A block containing math has its line box raised by the math font, so its
       vertical figure is artifact too. Horizontal and clipping still apply. */
    var hasMath = !!(el.querySelector && el.querySelector("math"));
    var dy = hasMath ? 0 : (el.scrollHeight - el.clientHeight);
    /* sub-pixel / font-fallback slack: vertical overflow beyond 2px, or
       horizontal beyond 6px, is real; below that it is rendering noise. */
    if (dx <= 6 && dy <= 2) return;
    var ox = cs.overflowX, oy = cs.overflowY;
    var scrollable = ox === "auto" || ox === "scroll" || oy === "auto" || oy === "scroll";
    if (scrollable) return;
    var clipped = ox === "hidden" || oy === "hidden";
    if (clipped && directText(el).length < 2) return;
    spills.push({ sel: desc(el), dx: dx, dy: dy, clipped: clipped });
  });
  var pre = document.createElement("pre");
  pre.id = "ln-layout-report";
  pre.textContent = JSON.stringify({ count: spills.length, spills: spills.slice(0, 25) });
  document.body.appendChild(pre);
});
</script>
</body>`;

const html = fs.readFileSync(htmlPath, "utf8");
if (!html.includes("</body>")) { console.log("FAIL — no </body> in " + htmlPath); process.exit(2); }
const tmp = path.join(os.tmpdir(), "ln-layout-" + Date.now() + ".html");
fs.writeFileSync(tmp, html.replace("</body>", PROBE), "utf8");
const tmpUrl = pathToFileURL(tmp).href;

function cleanup() { try { fs.unlinkSync(tmp); } catch (x) {} }

function finish(reportText) {
  cleanup();
  let report;
  try {
    report = JSON.parse(reportText.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
  } catch (e) { console.log("FAIL — unreadable layout report: " + e.message); process.exit(1); }
  const meta = (report.spills.length && report.spills[0]._meta) ? report.spills.shift() : null;
  const real = report.count - (meta ? 1 : 0);
  const scope = meta ? ("iw=" + meta.sel.replace("viewport iw=", "") + " doc=" + meta._doc + (present ? " mode=present" : "")) : "";
  if (real === 0) {
    console.log("ok   every text box contains its content (no spill, no clip)" + (scope ? " [" + scope + "]" : ""));
    console.log("LAYOUT OK — " + path.basename(htmlPath));
    process.exit(0);
  }
  console.log("FAIL — " + real + " element(s) spill or clip their content" + (scope ? " [" + scope + "]" : "") + ":");
  report.spills.forEach(function (s) {
    if (s._meta) return;
    console.log("  " + (s.clipped ? "clip " : "spill") + "  " + s.sel +
      "  dx=" + s.dx + " dy=" + s.dy);
  });
  if (verbose && report.count > report.spills.length) {
    console.log("  (showing first " + report.spills.length + " of " + report.count + ")");
  }
  console.log("LAYOUT FAIL — text must fit its box; size containers to content (grid-stack a fixed set of faces, never absolute faces in a fixed min-height).");
  process.exit(1);
}

/* ---------- default path: desktop-width render via --dump-dom ---------- */
if (!wantWidth) {
  let dom = "";
  try {
    dom = cp.execFileSync(chrome, [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files",
      "--window-size=1280,1200", "--virtual-time-budget=5000", "--dump-dom",
      tmpUrl
    ], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    console.log("FAIL — Chrome could not render the file: " + e.message);
    cleanup();
    process.exit(1);
  }
  const m = dom.match(/<pre id="ln-layout-report">([\s\S]*?)<\/pre>/);
  if (!m) {
    console.log("FAIL — the layout probe did not run (page did not finish loading).");
    cleanup();
    process.exit(1);
  }
  finish(m[1]);
  return;
}

/* ---------- narrow path: true CSS viewport via CDP emulation ----------
 * --dump-dom floors the window near 500px, so phone widths need DevTools
 * device emulation. Requires Node 22+ (global WebSocket). */
if (typeof WebSocket === "undefined" || typeof fetch === "undefined") {
  console.log("FAIL — --width needs Node 22+ (WebSocket/fetch); omit --width or upgrade Node.");
  cleanup();
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpRun() {
  let port = 0, child = null;
  for (let p = 19333; p < 19343; p++) {
    try {
      child = cp.spawn(chrome,
        ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=" + p, "about:blank"],
        { stdio: "ignore" });
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        try {
          const v = await (await fetch("http://127.0.0.1:" + p + "/json/version")).json();
          if (v && v.webSocketDebuggerUrl) { port = p; break; }
        } catch (e) { /* not up yet */ }
      }
      if (port) break;
      try { child.kill(); } catch (e) {}
      child = null;
    } catch (e) { /* try next port */ }
  }
  if (!port) throw new Error("could not start Chrome remote debugging (ports 19333-19342)");

  const kill = () => { try { child.kill(); } catch (e) {} };
  process.on("exit", kill);

  const open = await (await fetch("http://127.0.0.1:" + port + "/json/new?" + encodeURIComponent(tmpUrl), { method: "PUT" })).json();
  const wsUrl = open.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error("DevTools returned no tab");

  const ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
  let id = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("DevTools socket timeout")), 15000);
    ws.addEventListener("open", () => { clearTimeout(t); res(); }, { once: true });
  });
  ws.addEventListener("message", (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(JSON.stringify(m.error)));
      else p.res(m.result);
    }
  });

  try {
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: wantWidth, height: wantHeight, deviceScaleFactor: 1, mobile: wantWidth < 700,
    });
    /* The tab may have loaded before emulation applied; drop any stale
       report and reload so the probe measures the emulated viewport. */
    await send("Runtime.evaluate", {
      expression: "var e=document.getElementById('ln-layout-report');if(e)e.remove();'ok'",
    });
    await send("Page.reload");
    /* Poll for the probe report. */
    let text = null;
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const r = await send("Runtime.evaluate", {
        expression: "JSON.stringify({state:document.readyState,pre:(function(){var e=document.getElementById('ln-layout-report');return e?e.textContent:null})()})",
        returnByValue: true,
      });
      let v;
      try { v = JSON.parse(r.result.value); } catch (e) { continue; }
      if (v.pre) { text = v.pre; break; }
    }
    try { await fetch("http://127.0.0.1:" + port + "/json/close/" + open.id); } catch (e) {}
    try { ws.close(); } catch (e) {}
    kill();
    if (!text) throw new Error("the layout probe did not run (page did not finish loading)");
    return text;
  } catch (e) {
    try { ws.close(); } catch (x) {}
    kill();
    throw e;
  }
}

cdpRun().then(finish, (e) => {
  console.log("FAIL — narrow render failed: " + e.message);
  cleanup();
  process.exit(1);
});
