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

if (failures) { console.log("SMOKE FAIL — " + failures + " check(s) failed."); process.exit(1); }
console.log("SMOKE OK — present mode engine and markers present.");
