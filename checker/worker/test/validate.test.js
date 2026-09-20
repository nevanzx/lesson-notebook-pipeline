import test from "node:test";
import assert from "node:assert/strict";
import { MODELS, validateGradeRequest, HttpError } from "../src/validate.js";

const good = () => ({
  model: "glm-5.3-flash",
  question: "Why did break-even rise?",
  rubric: "2 pts: direction (1) + cause (1)",
  maxPoints: 2,
  answers: [{ ref: "s1", text: "Fixed cost rose." }],
});

test("accepts a valid request", () => {
  const out = validateGradeRequest(good());
  assert.equal(out.model, "glm-5.3-flash");
  assert.equal(out.answers.length, 1);
});

test("rejects unknown model", () => {
  assert.throws(() => validateGradeRequest({ ...good(), model: "gpt-99" }),
    (e) => e instanceof HttpError && e.status === 400);
});

test("rejects empty answers and >10 answers", () => {
  assert.throws(() => validateGradeRequest({ ...good(), answers: [] }),
    (e) => e instanceof HttpError && e.status === 400);
  const many = Array.from({ length: 11 }, (_, i) => ({ ref: "s" + i, text: "x" }));
  assert.throws(() => validateGradeRequest({ ...good(), answers: many }),
    (e) => e instanceof HttpError && e.status === 400);
});

test("rejects bad maxPoints and empty strings", () => {
  for (const mp of [0, -1, 2.5, "2", true, undefined]) {
    assert.throws(() => validateGradeRequest({ ...good(), maxPoints: mp }),
      (e) => e instanceof HttpError && e.status === 400, String(mp));
  }
  for (const k of ["question", "rubric"]) {
    assert.throws(() => validateGradeRequest({ ...good(), [k]: "  " }),
      (e) => e instanceof HttpError && e.status === 400, k);
  }
});

test("MODELS covers exactly the 4 allowlisted ids", () => {
  assert.deepEqual(Object.keys(MODELS).sort(), [
    "deepseek-v4.1-flash",
    "glm-5.3-flash",
    "muse-spark-1.3-contributor",
    "qwen3.8-flash",
  ]);
});
