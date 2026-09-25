import test from "node:test";
import assert from "node:assert/strict";
import { normalize, idMatch, tfCorrect, mcCorrect, weekdayInTz } from "../lib/format.js";

test("normalize folds case, diacritics, punctuation, spacing", () => {
  assert.equal(normalize("  Break-EVEN  Point! "), "break even point");
  assert.equal(normalize("José–María …"), "jose maria");
  assert.equal(normalize("ALBARACIN,  JOZEL ANN N."), "albaracin jozel ann n");
});

test("idMatch is strict exact-after-normalize", () => {
  assert.equal(idMatch("Variable Cost", ["variable cost"]), true);
  assert.equal(idMatch("variable  costs", ["variable cost"]), false);
  assert.equal(idMatch("varible cost", ["variable cost"]), false);
  assert.equal(idMatch("x", ["a", "X "]), true);
});

test("tfCorrect compares true/false strings", () => {
  assert.equal(tfCorrect("true", true), true);
  assert.equal(tfCorrect("false", false), true);
  assert.equal(tfCorrect("true", false), false);
  assert.equal(tfCorrect(" True ", true), true);
});

test("mcCorrect compares index", () => {
  assert.equal(mcCorrect(2, 2), true);
  assert.equal(mcCorrect(1, 2), false);
});

test("mcCorrect accepts notebook text form (choice text vs choices[ans])", () => {
  const choices = ["Weak, since licences block entrants", "Strong, since apps removed barriers"];
  assert.equal(mcCorrect("Strong, since apps removed barriers", 1, choices), true);
  assert.equal(mcCorrect("strong, since APPS removed barriers!", 1, choices), true);
  assert.equal(mcCorrect("Weak, since licences block entrants", 1, choices), false);
  assert.equal(mcCorrect("1", 1, choices), true);
});

test("weekdayInTz resolves the weekday in the target zone", () => {
  assert.equal(weekdayInTz("2026-09-23T10:00:00Z", "Asia/Manila"), "wednesday");
  assert.equal(weekdayInTz("2026-09-23T18:00:00Z", "Asia/Manila"), "thursday");
  assert.equal(weekdayInTz("2026-09-24T10:00:00Z", "Asia/Manila"), "thursday");
});

test("weekdayInTz is blank-tolerant", () => {
  assert.equal(weekdayInTz("", "Asia/Manila"), "");
  assert.equal(weekdayInTz(undefined, "Asia/Manila"), "");
  assert.equal(weekdayInTz("not-a-date", "Asia/Manila"), "");
  assert.equal(weekdayInTz("2026-09-23T10:00:00Z", "Not/AZone"), "");
});
