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
    ["Name", "ID", "W4 MC", "W4 TF", "W4 ID", "W4 SA19", "W4 SA20", "W4 Total",
     "Time Submitted", "GrandTotal", "Status"]);
  assert.deepEqual(grades.rows[1], ["N1", "1", 9, 4, 3, 2, 1, 19, "", 19, "matched"]);
});

test("Time Submitted shows the timestamp when present", () => {
  const input = sample();
  input.assignments[0].results.get("1").submittedAt = "2026-09-23T02:00:00Z";
  const grades = buildWorkbookData(input).sheets.find((s) => s.name === "Grades");
  assert.equal(grades.rows[1][8], "2026-09-23T02:00:00Z");
});

test("Time Submitted is blank when the submission has none", () => {
  const grades = buildWorkbookData(sample()).sheets.find((s) => s.name === "Grades");
  assert.equal(grades.rows[1][8], "");
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

test("student missing from one assignment gets blank block, grand stays correct", () => {
  const wb = buildWorkbookData({
    roster: [],
    assignments: [
      {
        tag: "W4", saNs: [19],
        results: new Map([["1", {
          name: "N1", id: "1", mc: 9, tf: 4, idScore: 3,
          saScores: new Map([[19, 2]]), total: 18,
        }]]),
        unmatched: [], missing: [],
      },
      {
        tag: "W5", saNs: [19],
        results: new Map(),
        unmatched: [], missing: [{ name: "N1", id: "1" }],
      },
    ],
  });
  const grades = wb.sheets.find((s) => s.name === "Grades");
  assert.deepEqual(grades.rows[0],
    ["Name", "ID", "W4 MC", "W4 TF", "W4 ID", "W4 SA19", "W4 Total",
     "W5 MC", "W5 TF", "W5 ID", "W5 SA19", "W5 Total",
     "Time Submitted", "GrandTotal", "Status"]);
  assert.deepEqual(grades.rows[1],
    ["N1", "1", 9, 4, 3, 2, 18, "", "", "", "", "", "", 18, "matched"]);
});

test("dag assignment exports DAG Score/Max/% columns and skips SA", () => {
  const wb = buildWorkbookData({
    roster: [],
    assignments: [{
      tag: "W9", mode: "dag", saNs: [],
      results: new Map([["1", {
        name: "N1", id: "1",
        dagScore: 17, dagMax: 18, dagPct: 17 / 18, total: 17,
      }]]),
      unmatched: [], missing: [], reviews: [],
    }],
  });
  const grades = wb.sheets.find((s) => s.name === "Grades");
  assert.deepEqual(grades.rows[0],
    ["Name", "ID", "W9 DAG Score", "W9 DAG Max", "W9 DAG %", "W9 Total",
     "Time Submitted", "GrandTotal", "Status"]);
  assert.equal(grades.rows[1][2], 17);
  assert.equal(grades.rows[1][4], 17 / 18);
  assert.equal(grades.rows[1][5], 17);
  assert.equal(grades.rows[1][7], 17);
});

test("mixed flat + dag assignments side by side", () => {
  const wb = buildWorkbookData({
    roster: [],
    assignments: [
      { tag: "A", mode: "flat", saNs: [],
        results: new Map([["1", {
          name: "N1", id: "1", mc: 5, tf: 2, idScore: 1,
          saScores: new Map(), total: 8,
        }]]),
        unmatched: [], missing: [], reviews: [] },
      { tag: "B", mode: "dag", saNs: [],
        results: new Map([["1", {
          name: "N1", id: "1", dagScore: 10, dagMax: 18, dagPct: 10 / 18,
          total: 10,
        }]]),
        unmatched: [], missing: [], reviews: [] },
    ],
  });
  const head = wb.sheets.find((s) => s.name === "Grades").rows[0];
  assert.deepEqual(head, [
    "Name", "ID", "A MC", "A TF", "A ID", "A Total",
    "B DAG Score", "B DAG Max", "B DAG %", "B Total",
    "Time Submitted", "GrandTotal", "Status",
  ]);
});

test("path divergence lands in ReviewLog", () => {
  const wb = buildWorkbookData({
    roster: [],
    assignments: [{
      tag: "W9", mode: "dag", saNs: [],
      results: new Map(),
      unmatched: [], missing: [],
      reviews: [{ saN: "path", ref: "N1", ai: "", reason: "diverged at step 1", final: "" }],
    }],
  });
  const rl = wb.sheets.find((s) => s.name === "ReviewLog");
  assert.equal(rl.rows[1][1], "path");
  assert.match(rl.rows[1][4], /diverged/);
});
