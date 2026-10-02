#!/usr/bin/env node
/* present_smoke — verifies the present-mode marker contract survives a build
 * and that the shell exposes the LN.present engine. Exit 0 = contract holds. */
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const root = path.join(__dirname, "..");
const sample = path.join(root, "sample", "lesson-demo");
const outName = JSON.parse(fs.readFileSync(path.join(sample, "build.json"), "utf8")).output;
const built = path.join(process.cwd(), outName);

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("ok   " + name);
  else { console.log("FAIL " + name + (extra ? " — " + extra : "")); failures++; }
}

const r = cp.spawnSync("python", [path.join(root, "build.py"), sample],
  { encoding: "utf8", cwd: process.cwd() });
check("build succeeds", r.status === 0, (r.stdout || "") + (r.stderr || ""));
if (r.status !== 0) { console.log("SMOKE FAIL"); process.exit(1); }
const html = fs.readFileSync(built, "utf8");

check("shell exposes LN.present", /LN\.present\s*=/.test(html));
check("present CSS class present", /body\.ln-present/.test(html));
check("present message constants", /ln-present-state/.test(html));
check("at least one marker exists", /data-present="[1-9]/.test(html));
check("no marker on a section root",
  !/<section\b[^>]*data-present=/.test(html));
check("present button exists", /id="lnAppPresent"/.test(html));
check("present button wired", /lnAppPresent[\s\S]{0,400}LN\.present/.test(html));
check("present button state sync helper", /function syncPresentBtn\s*\(/.test(html));
check("Escape exits present before closing menu",
  /Escape[\s\S]{0,240}LN\.present\.off\(\)/.test(html));
check("present engine notifies a hosting viewer",
  /function notifyParent\s*\(\)[\s\S]{0,300}window\.parent[\s\S]{0,120}postMessage/.test(html));
check("on() notifies the hosting viewer by default",
  /function on\(notify\)[\s\S]{0,400}document\.body\.classList\.add\("ln-present"\)\s*;\s*apply\(\)\s*;\s*if\s*\(notify !== false\)\s*notifyParent\(\)/.test(html));
check("off() notifies the hosting viewer by default",
  /function off\(notify\)[\s\S]{0,700}if\s*\(notify !== false\)\s*notifyParent\(\)/.test(html));
// Regression: refresh() must not broadcast a transient on:false. Suppress the
// intermediate off()/on(), then emit exactly one converged notifyParent().
check("refresh() suppresses the transient off()",
  /function refresh\s*\(\)[\s\S]{0,200}off\(false\)/.test(html));
check("refresh() suppresses the transient on()",
  /function refresh\s*\(\)[\s\S]{0,200}on\(false\)/.test(html));
check("refresh() emits one converged notifyParent()",
  /on\(false\)\s*;\s*if\s*\(LN\.nav[\s\S]{0,400}notifyParent\(\)/.test(html));
check("resetAll re-applies present", /resetAll[\s\S]{0,200}LN\.present\.refresh\(\)/.test(html));
check("section title marker on h2", /<h2[^>]*data-present="0"/.test(html));
check("engine collects title headings", /h2\[data-present="0"\]/.test(html));
check("present title CSS present", /body\.ln-present \.ln-pres-title/.test(html));
check("title offset var measured", /--ln-pres-top/.test(html));
check("present relaxes ancestor overflow", /body\.ln-present \.app \.sheet/.test(html));

if (failures) { console.log("SMOKE FAIL — " + failures + " check(s) failed."); process.exit(1); }
console.log("SMOKE OK — present mode engine and markers present.");
