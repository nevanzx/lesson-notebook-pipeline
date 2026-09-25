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
 * Usage: node tools/layout_smoke.js <built.html> [--chrome <path>] [--verbose]
 * Exit 0 = LAYOUT OK; exit 1 = overflow found (details printed).
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const { pathToFileURL } = require("url");

const argv = process.argv.slice(2);
let htmlPath = null, chromeArg = null, verbose = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--chrome") { chromeArg = argv[++i]; }
  else if (argv[i] === "--verbose") { verbose = true; }
  else if (!htmlPath) { htmlPath = argv[i]; }
}
if (!htmlPath) {
  console.log("usage: node tools/layout_smoke.js <built.html> [--chrome <path>] [--verbose]");
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

const PROBE = `
<style>
  section.block{display:block !important;}
  .ln-app-toc,.ln-app-scrim{display:none !important;}
  *,*::before,*::after{animation:none !important;transition:none !important;}
</style>
<script>
window.addEventListener("load", function () {
  document.querySelectorAll("section.block").forEach(function (s) {
    s.hidden = false; s.removeAttribute("hidden");
    s.querySelectorAll("[hidden]").forEach(function (c) {
      if (c.classList && c.classList.contains("lna-lock")) return;
      c.hidden = false;
    });
  });
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
  document.querySelectorAll("section.block *").forEach(function (el) {
    if (SKIP[el.tagName]) return;
    if (el.closest && el.closest("svg")) return;
    var cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    if (!el.clientHeight && !el.clientWidth) return;
    var dx = el.scrollWidth - el.clientWidth;
    var dy = el.scrollHeight - el.clientHeight;
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

let dom = "";
try {
  dom = cp.execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files",
    "--window-size=1280,1200", "--virtual-time-budget=5000", "--dump-dom",
    pathToFileURL(tmp).href
  ], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
  console.log("FAIL — Chrome could not render the file: " + e.message);
  try { fs.unlinkSync(tmp); } catch (x) {}
  process.exit(1);
}
try { fs.unlinkSync(tmp); } catch (x) {}

const m = dom.match(/<pre id="ln-layout-report">([\s\S]*?)<\/pre>/);
if (!m) {
  console.log("FAIL — the layout probe did not run (page did not finish loading).");
  process.exit(1);
}
let report;
try { report = JSON.parse(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')); }
catch (e) { console.log("FAIL — unreadable layout report: " + e.message); process.exit(1); }

if (report.count === 0) {
  console.log("ok   every text box contains its content (no spill, no clip)");
  console.log("LAYOUT OK — " + path.basename(htmlPath));
  process.exit(0);
}
console.log("FAIL — " + report.count + " element(s) spill or clip their content:");
report.spills.forEach(function (s) {
  console.log("  " + (s.clipped ? "clip " : "spill") + "  " + s.sel +
    "  dx=" + s.dx + " dy=" + s.dy);
});
if (verbose && report.count > report.spills.length) {
  console.log("  (showing first " + report.spills.length + " of " + report.count + ")");
}
console.log("LAYOUT FAIL — text must fit its box; size containers to content (grid-stack a fixed set of faces, never absolute faces in a fixed min-height).");
process.exit(1);
