import test from "node:test";
import assert from "node:assert/strict";
import { parseRosterSheet, mergeRosters, joinSubmissions } from "../lib/roster.js";

const sheet = [
  ["No.", "Student's Name", "ID no."],
  ["1", "ALBARACIN, JOZEL ANN N.", "20262417"],
  ["2", "BUNSO, RAYMOND E.", "20261577"],
  ["3", "", ""],
];

test("parses Informations-style sheet, skips blanks", () => {
  const out = parseRosterSheet(sheet, "f.xlsm");
  assert.deepEqual(out, [
    { name: "ALBARACIN, JOZEL ANN N.", id: "20262417", source: "f.xlsm" },
    { name: "BUNSO, RAYMOND E.", id: "20261577", source: "f.xlsm" },
  ]);
});

test("finds header even with title rows above", () => {
  const rows = [["ST. JOHN PAUL"], [], ["No.", "Student's Name", "ID no."],
    ["1", "CUPAT, MARY JOSH E.", 20262373]];
  const out = parseRosterSheet(rows, "g.xlsm");
  assert.equal(out[0].id, "20262373");
});

test("mergeRosters dedupes by id then name", () => {
  const a = [{ name: "N1", id: "1", source: "a" }];
  const b = [{ name: "N1", id: "1", source: "b" }, { name: "N2", id: "2", source: "b" }];
  assert.equal(mergeRosters([a, b]).length, 2);
});

test("join prefers id, falls back to name, else unmatched", () => {
  const roster = [
    { name: "ALBARACIN, JOZEL ANN N.", id: "20262417", source: "f" },
    { name: "BUNSO, RAYMOND E.", id: "20261577", source: "f" },
    { name: "GHOST, GARY G.", id: "999", source: "f" },
  ];
  const subs = [
    { file: "a.json", student: { name: "Albaracin, Jozel Ann N.", id: "20262417" }, answers: [] },
    { file: "b.json", student: { name: "BUNSO, RAYMOND E.", id: "WRONG" }, answers: [] },
    { file: "c.json", student: { name: "Nobody Here", id: "000" }, answers: [] },
  ];
  const { matched, unmatched, missing } = joinSubmissions(roster, subs);
  assert.equal(matched.length, 2);
  assert.equal(matched[1].roster.id, "20261577");
  assert.deepEqual(unmatched.map((s) => s.file), ["c.json"]);
  assert.deepEqual(missing.map((r) => r.id), ["999"]);
});
