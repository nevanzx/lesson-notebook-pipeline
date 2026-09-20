import test from "node:test";
import assert from "node:assert/strict";
import { normalize, idMatch, tfCorrect, mcCorrect } from "../lib/format.js";

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
