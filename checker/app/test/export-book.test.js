import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkbookData } from "../lib/export-book.js";

function sample() {
  return {
    roster: [{ name: "N1", id: "1", source: "f" }],
    assignments: [{
      tag: "W4",
      saNs: [19, 20],
      results: new Map([["1", {
        name: "N1", id: "1", mc: 9, tf: 4, idScore: 3,
        saScores: new Map([[19, 2], [20, 1]]), total: 19,
      }]]),
      unmatched: ["mystery.json"],
      missing: [{ name: "GHOST", id: "999" }],
    }],
  };
}

test("grades sheet has dynamic SA columns + grand total", () => {
  const wb = buildWorkbookData(sample());
  const grades = wb.sheets.find((s) => s.name === "Grades");
  assert.deepEqual(grades.rows[0],
    ["Name", "ID", "W4 MC", "W4 TF", "W4 ID", "W4 SA19", "W4 SA20", "W4 Total", "GrandTotal", "Status"]);
  assert.deepEqual(grades.rows[1], ["N1", "1", 9, 4, 3, 2, 1, 19, 19, "matched"]);
});

test("unmatched + missing sheets list files and names", () => {
  const wb = buildWorkbookData(sample());
  const un = wb.sheets.find((s) => s.name === "Unmatched");
  assert.deepEqual(un.rows[1], ["W4", "mystery.json"]);
  const mi = wb.sheets.find((s) => s.name === "Missing");
  assert.deepEqual(mi.rows[1], ["W4", "GHOST", "999"]);
});

test("review log records overrides", () => {
  const input = sample();
  input.assignments[0].reviews = [{ tag: "W4", saN: 19, ref: "1", ai: 1, reason: "r", final: 2 }];
  const wb = buildWorkbookData(input);
  const rl = wb.sheets.find((s) => s.name === "ReviewLog");
  assert.deepEqual(rl.rows[1], ["W4", 19, "1", 1, "r", 2]);
});
