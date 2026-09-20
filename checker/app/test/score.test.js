import test from "node:test";
import assert from "node:assert/strict";
import { scoreNonAI } from "../lib/score.js";

const key = [
  { n: 1, type: "mc", prompt: "p", choices: ["a", "b"], ans: 1 },
  { n: 2, type: "tf", prompt: "p", ans: true },
  { n: 3, type: "id", prompt: "p", aliases: ["variable cost"] },
  { n: 4, type: "sa", prompt: "p", key_points: ["k"],
    rubric: "1 pt", max_points: 1 },
  { n: 5, type: "sa", prompt: "p2", key_points: ["k2"],
    rubric: "2 pts", max_points: 2 },
];

test("scores mc/tf/id, collects sa", () => {
  const answers = [
    { q: 1, type: "mc", prompt: "p", answer: 1 },
    { q: 2, type: "tf", prompt: "p", answer: "true" },
    { q: 3, type: "id", prompt: "p", answer: "Variable  Cost!" },
    { q: 4, type: "sa", prompt: "p", answer: "essay one" },
    { q: 5, type: "sa", prompt: "p", answer: "essay two" },
  ];
  const r = scoreNonAI(key, answers);
  assert.equal(r.mc, 1);
  assert.equal(r.tf, 1);
  assert.equal(r.id, 1);
  assert.equal(r.totalNonAI, 3);
  assert.equal(r.saItems.length, 2);
  assert.equal(r.saItems[1].maxPoints, 2);
  assert.equal(r.saItems[0].answer, "essay one");
});

test("wrong and missing answers score zero", () => {
  const r = scoreNonAI(key, [{ q: 1, type: "mc", prompt: "p", answer: 0 }]);
  assert.equal(r.mc, 0);
  assert.equal(r.totalNonAI, 0);
  assert.equal(r.saItems.length, 2);
  assert.equal(r.saItems[0].answer, "");
});
