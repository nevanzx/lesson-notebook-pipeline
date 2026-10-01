#!/usr/bin/env node
/* Deck layout gate — runs tools/layout_smoke.js over the REAL assignment deck.
 *
 * layout_smoke.js only measures what a built notebook actually shows, and the
 * assignment deck is hidden twice over: `.lna-deck{display:none}` until it
 * opens, and the shipped sample ships the assignment ENCRYPTED, so the deck DOM
 * is never built at all. A layout regression in the deck therefore walks past
 * the gate silently. This tool closes that hole — it renders the real
 * skeleton/components/assignment/component.js against a real theme pack in a
 * PLAINTEXT harness (no envelope, no unlock, no fullscreen), forces the deck
 * visible, and runs layout_smoke.js over it at desktop, tablet and phone
 * widths, for the flat deck and the DAG deck.
 *
 * Everything is inlined, so the harness is one self-contained temp file. The
 * mount is wrapped in `<section class="block">` because that is the scope
 * layout_smoke.js's probe walks, and `.lna-deck` is forced visible because the
 * probe un-hides `[hidden]` children but cannot open a `display:none` deck.
 * The probe then un-hides every slide at once, which is what we want: one long
 * prompt, every choice row, every nav bar and the rail all get measured in a
 * single pass.
 *
 * Both datasets are plaintext (no `ans`/`aliases`/`key_points`) and include the
 * awkward shapes a layout gate exists for: a prompt past 120 characters, long
 * choice text, a full-width textarea, and a filled DAG trail in the rail.
 *
 * A SKIP (no Chrome/Edge) is reported as a failure, never as a pass: set
 * LN_CHROME to the executable and re-run.
 *
 * Usage: node v2/tools/deck_layout_smoke.js
 * Exit 0 = every run printed LAYOUT OK; exit 1 = a run failed or SKIPped.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const SKEL = path.join(__dirname, "..", "skeleton");
const THEME = path.join(SKEL, "themes", "parchment.css");
const COMP_CSS = path.join(SKEL, "components", "assignment", "component.css");
const COMP_JS = path.join(SKEL, "components", "assignment", "component.js");
const LAYOUT_SMOKE = path.join(__dirname, "layout_smoke.js");

[THEME, COMP_CSS, COMP_JS, LAYOUT_SMOKE].forEach(function (f) {
  if (!fs.existsSync(f)) { console.log("FAIL — no such file: " + f); process.exit(2); }
});

const theme = fs.readFileSync(THEME, "utf8");
const compCss = fs.readFileSync(COMP_CSS, "utf8");
const compJs = fs.readFileSync(COMP_JS, "utf8");

/* ---------- plaintext datasets (10 mc + 4 tf + 4 id + 2 sa) ---------- */
const FLAT = {
  intro: "harness",
  items: [
    { type: "mc", prompt: "Which statement about a positive correlation is correct?",
      choices: ["Both variables rise together",
        "One variable causes the other",
        "The relationship is always linear",
        "The correlation coefficient is always 1"] },
    { type: "mc", prompt: "What does a scatterplot with a tight downward cloud show?",
      choices: ["A strong negative association",
        "A strong positive association",
        "No association at all",
        "A sampling error only"] },
    { type: "mc", prompt: "A correlation of 0.82 is best described as…",
      choices: ["Strong", "Moderate", "Weak", "Perfectly random"] },
    { type: "mc", prompt: "Why is a scatterplot drawn before computing a correlation?",
      choices: ["To show the shape and any outliers",
        "To prove causation",
        "To convert values to percentages",
        "To remove the axis labels"] },
    { type: "mc", prompt: "Pick the odd one out.",
      choices: ["Outlier", "Cluster", "Trend", "Average"] },
    { type: "mc", prompt: "An outlier in one series can…",
      choices: ["Pull the correlation toward zero",
        "Raise the mean of the other series",
        "Delete a data point",
        "Change the axis units"] },
    { type: "mc",
      prompt: "A researcher reports that taller plants grew faster, then writes that height caused the growth. Which single error is that?",
      choices: ["Confusing association with causation",
        "Using the wrong unit of measure",
        "Ignoring the title of the chart",
        "Choosing too few tick marks"] },
    { type: "mc", prompt: "Two series that move together over time are…",
      choices: ["Correlated", "Independent", "Random", "Constant"] },
    { type: "mc", prompt: "The horizontal axis of a scatterplot carries the…",
      choices: ["Independent variable", "Dependent variable",
        "Residual error", "Sample size"] },
    { type: "mc", prompt: "Choose the tool that matches the question.",
      choices: ["Bar chart for counts", "Pie chart for every dataset",
        "Line chart for unordered categories", "Histogram for one value"] },
    { type: "tf", prompt: "A correlation of zero proves there is no relationship." },
    { type: "tf", prompt: "Outliers should always be deleted before analysis." },
    { type: "tf", prompt: "A scatterplot can reveal clusters that a single average hides." },
    { type: "tf", prompt: "A trend line through a scatterplot proves causation." },
    { type: "id", prompt: "Name the statistical term for two variables measured together." },
    { type: "id", prompt: "What is the symbol r called?" },
    { type: "id", prompt: "Name a point far from the rest of the data." },
    { type: "id", prompt: "What is the horizontal axis of a scatterplot called?" },
    { type: "sa",
      prompt: "In one or two sentences, explain why a scatterplot is drawn before a correlation coefficient is reported, and name one shape the plot reveals that the coefficient alone would hide." },
    { type: "sa",
      prompt: "Explain, briefly, how an outlier can change a correlation coefficient, and say whether removing it is always justified." }
  ]
};

const DAG = {
  mode: "dag", title: "Harness", scenario: "s",
  nodes: [
    { id: "n0", level: 0, isLeaf: false, question: "Root?", outcome: null,
      choices: [
        { label: "A", text: "take the upper road now", nextNodeId: "n1" },
        { label: "B", text: "take the lower road now", nextNodeId: "n2" }] },
    { id: "n1", level: 1, isLeaf: true, question: "End upper", outcome: "u",
      choices: [], finalOutcome: "closed" },
    { id: "n2", level: 1, isLeaf: true, question: "End lower", outcome: "l",
      choices: [], finalOutcome: "closed" }
  ]
};

/* The dataset switch is a template line so the DAG harness can be produced from
 * the SAME document: layout_smoke.js copies the file it is given into its own
 * temp file and opens that, so a `#dag` fragment on the path we pass would be
 * dropped (and its own existsSync check would reject it outright). */
const DATA_LINE = 'var data = (location.hash === "#dag") ? dag : flat;';
const DATA_LINE_DAG = "var data = dag; /* harness opened at #dag */";

function harnessHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
/* the three facts of the real page this measurement depends on, verbatim from
   skeleton/shell.html — without them the numbers are wrong, not the deck:
     the viewport meta (shell.html:5), or CDP mobile emulation lays out at the
     980px default and the "phone 390" run silently measures a tablet;
     box-sizing:border-box (shell.html:23), or every width:100% control
     overflows its cell by its own padding and half the deck reads as broken;
     body{margin:0} (shell.html:25), or the UA 8px margin makes the deck column
     narrower than the full-bleed overlay a student actually sees. */
*,*::before,*::after{box-sizing:border-box}
body{margin:0}
${theme}
${compCss}
.lna-deck{display:block !important}     /* force the deck visible for measurement */
</style></head><body>
<section class="block" id="assign"><div id="host"></div></section>
<script>
var LN = { components:{}, pub:undefined, keyId:undefined,
  h:function(tag,attrs,kids){
    var e=document.createElement(tag); var k;
    if(attrs) for(k in attrs){ if(k==="class") e.className=attrs[k];
      else if(k==="text") e.textContent=attrs[k];
      else if(k==="style") e.setAttribute("style",attrs[k]);
      else e.setAttribute(k,attrs[k]); }
    if(kids) kids.forEach(function(c){ if(c) e.appendChild(c); });
    return e; } };
window.LN = LN;
</script>
<script>
${compJs}
</script>
<script>
var flat = ${JSON.stringify(FLAT)};
var dag = ${JSON.stringify(DAG)};
${DATA_LINE}
LN.components.assignment.init(document.getElementById("host"), data);
/* exercise the filled DAG rail list (DAG deck only) */
var ul = document.querySelector(".lna-path");
if(ul){ ["A. take the upper road now","B. take the lower road now"].forEach(function(t){
  var li=document.createElement("li"); li.textContent=t; ul.appendChild(li); }); }
</script>
</body></html>
`;
}

const stamp = Date.now() + "-" + process.pid;
const tmpFlat = path.join(os.tmpdir(), "ln-deck-layout-" + stamp + ".html");
const tmpDag = path.join(os.tmpdir(), "ln-deck-layout-dag-" + stamp + ".html");
const written = [];
function cleanup() { written.forEach(function (f) { try { fs.unlinkSync(f); } catch (x) {} }); }

const html = harnessHtml();
fs.writeFileSync(tmpFlat, html, "utf8");
written.push(tmpFlat);
fs.writeFileSync(tmpDag, html.replace(DATA_LINE, DATA_LINE_DAG), "utf8");
written.push(tmpDag);

const RUNS = [
  { label: "flat deck, desktop 1280", file: tmpFlat, args: [] },
  { label: "flat deck, tablet 768", file: tmpFlat, args: ["--width", "768"] },
  { label: "flat deck, phone 390", file: tmpFlat, args: ["--width", "390"] },
  { label: "dag deck, desktop 1280", file: tmpDag, args: [] }
];

let passed = 0, failed = 0, skipped = 0;
RUNS.forEach(function (run) {
  console.log("=== " + run.label + " ===");
  const res = cp.spawnSync(process.execPath, [LAYOUT_SMOKE, run.file].concat(run.args),
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (res.error) {
    console.log("FAIL — could not run layout_smoke.js: " + res.error.message);
    failed++;
    return;
  }
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  const out = res.stdout || "";
  if (out.indexOf("LAYOUT SKIP") >= 0) {
    console.log("NOTE — SKIP is not a pass: set LN_CHROME to a Chrome/Edge executable.");
    skipped++;
  } else if (res.status !== 0 || out.indexOf("LAYOUT OK") < 0) {
    console.log("NOTE — run exited " + res.status + " without a LAYOUT OK line.");
    failed++;
  } else {
    passed++;
  }
});

cleanup();
if (failed || skipped) {
  console.log("DECK LAYOUT FAIL — " + passed + "/" + RUNS.length + " run(s) printed LAYOUT OK" +
    (skipped ? "; " + skipped + " skipped" : "") +
    (failed ? "; " + failed + " failed" : "") + ".");
  process.exit(1);
}
console.log("DECK LAYOUT OK — " + passed + "/" + RUNS.length +
  " run(s) contain their content (flat + dag, desktop/tablet/phone).");
