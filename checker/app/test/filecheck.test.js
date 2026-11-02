import test from "node:test";
import assert from "node:assert/strict";
import {
  claimedNameFromFile, checkFileName, flaggedStudents, fileCheckNoteHtml,
} from "../lib/filecheck.js";

test("claimedNameFromFile reads the name before ' - Week '", () => {
  assert.equal(
    claimedNameFromFile("Dela Cruz, Juan - Week 4 - Management Science.json"),
    "Dela Cruz, Juan");
});

test("claimedNameFromFile ignores a browser duplicate suffix", () => {
  assert.equal(
    claimedNameFromFile("Dela Cruz, Juan - Week 4 - Management Science (1).json"),
    "Dela Cruz, Juan");
});

test("claimedNameFromFile strips a directory and is case-insensitive on .json", () => {
  assert.equal(
    claimedNameFromFile("C:\\Users\\t\\Downloads\\Dela Cruz, Juan - Week 4 - S.JSON"),
    "Dela Cruz, Juan");
});

test("claimedNameFromFile returns empty when the name is missing", () => {
  assert.equal(claimedNameFromFile("submission.json"), "");
  assert.equal(claimedNameFromFile(""), "");
});

test("checkFileName matches the encrypted student name", () => {
  const r = checkFileName(
    "Dela Cruz, Juan - Week 4 - Management Science.json",
    { name: "Dela Cruz, Juan", id: "20190001" });
  assert.equal(r.status, "match");
  assert.equal(r.claimed, "Dela Cruz, Juan");
  assert.equal(r.actual, "Dela Cruz, Juan");
  assert.equal(r.id, "20190001");
});

test("checkFileName matches across case, punctuation, and accents", () => {
  const r = checkFileName(
    "DELA CRUZ, JUAN - Week 4 - S.json",
    { name: "Dela Cruz, Juan", id: "1" });
  assert.equal(r.status, "match");
});

test("checkFileName flags a renamed file as a mismatch", () => {
  const r = checkFileName(
    "Santos, Ana - Week 4 - Management Science.json",
    { name: "Dela Cruz, Juan", id: "20190001" });
  assert.equal(r.status, "mismatch");
  assert.equal(r.claimed, "Santos, Ana");
  assert.equal(r.actual, "Dela Cruz, Juan");
});

test("checkFileName falls back to first + last when name is absent", () => {
  const r = checkFileName(
    "Dela Cruz, Juan - Week 4 - S.json",
    { first: "Juan", last: "Dela Cruz" });
  assert.equal(r.status, "match");
  assert.equal(r.actual, "Dela Cruz, Juan");
});

test("checkFileName marks a file with no readable name as unverified", () => {
  const r = checkFileName("submission.json", { name: "Dela Cruz, Juan" });
  assert.equal(r.status, "unverified");
  assert.equal(r.claimed, "");
});

test("flaggedStudents returns only non-matching checks", () => {
  const results = new Map([
    ["1", { fileCheck: { status: "match", file: "a.json" } }],
    ["2", { fileCheck: { status: "mismatch", file: "b.json" } }],
  ]);
  const unmatched = new Map([
    ["u", { fileCheck: { status: "unverified", file: "c.json" } }],
  ]);
  assert.deepEqual(
    flaggedStudents(results, unmatched).map((f) => f.file),
    ["b.json", "c.json"]);
});

test("fileCheckNoteHtml names the claim and the encrypted identity", () => {
  const html = fileCheckNoteHtml([{
    status: "mismatch", file: "Santos, Ana - Week 4 - S.json",
    claimed: "Santos, Ana", actual: "Dela Cruz, Juan", id: "20190001",
  }]);
  assert.match(html, /File check:/);
  assert.match(html, /Santos, Ana - Week 4 - S\.json/);
  assert.match(html, /claims Santos, Ana/);
  assert.match(html, /Dela Cruz, Juan \(20190001\)/);
});

test("fileCheckNoteHtml explains an unverified name", () => {
  const html = fileCheckNoteHtml([{
    status: "unverified", file: "submission.json",
    claimed: "", actual: "Dela Cruz, Juan", id: "20190001",
  }]);
  assert.match(html, /has no readable name/);
  assert.match(html, /Dela Cruz, Juan \(20190001\)/);
});

test("fileCheckNoteHtml is empty when nothing is flagged", () => {
  assert.equal(fileCheckNoteHtml([]), "");
  assert.equal(fileCheckNoteHtml(null), "");
});

test("fileCheckNoteHtml escapes HTML in names and files", () => {
  const html = fileCheckNoteHtml([{
    status: "mismatch", file: "<b>x</b>.json", claimed: "A < B",
    actual: "C & D", id: "1<2",
  }]);
  assert.ok(!html.includes("<b>x</b>"));
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /A &lt; B/);
  assert.match(html, /C &amp; D/);
});
