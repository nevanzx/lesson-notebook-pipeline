import test from "node:test";
import assert from "node:assert/strict";
import { scoreNonAI, scoreDag } from "../lib/score.js";

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

const dagKey = {
  levels: 3, max_nodes: 8,
  nodes: [
    { id: "n0", level: 0, isLeaf: false, question: "Q0", outcome: null,
      choices: [
        { label: "A", text: "gold", points: 10, nextNodeId: "n1" },
        { label: "B", text: "miss", points: 4, nextNodeId: "n2" },
      ] },
    { id: "n1", level: 1, isLeaf: false, question: "Q1", outcome: "o",
      choices: [
        { label: "A", text: "gold2", points: 8, nextNodeId: "n3" },
        { label: "B", text: "miss2", points: 3, nextNodeId: "n3" },
      ] },
    { id: "n2", level: 1, isLeaf: false, question: "Q2", outcome: "o",
      choices: [
        { label: "A", text: "ok", points: 5, nextNodeId: "n3" },
        { label: "B", text: "no", points: 1, nextNodeId: "n3" },
      ] },
    { id: "n3", level: 2, isLeaf: true, question: "End", outcome: "o",
      choices: [], finalOutcome: "Done." },
  ],
  optimal: {
    path: [
      { node: "n0", label: "A", points: 10 },
      { node: "n1", label: "A", points: 8 },
    ],
    max_score: 18,
  },
};

test("scoreDag sums path points and matches gold", () => {
  const r = scoreDag(dagKey, [
    { node: "n0", label: "A" },
    { node: "n1", label: "A" },
  ]);
  assert.equal(r.mismatch, "");
  assert.equal(r.score, 18);
  assert.equal(r.maxScore, 18);
  assert.equal(r.pct, 1);
  assert.equal(r.pathMatch, true);
  assert.equal(r.divergeAt, -1);
  assert.equal(r.ribbon, "A→A");
  assert.equal(r.steps.length, 2);
  assert.equal(r.steps[0].points, 10);
});

test("scoreDag partial path scores lower and reports divergence", () => {
  const r = scoreDag(dagKey, [
    { node: "n0", label: "A" },
    { node: "n1", label: "B" },
  ]);
  assert.equal(r.score, 13);
  assert.equal(r.pathMatch, false);
  assert.equal(r.divergeAt, 1);
});

test("scoreDag flags unknown node/label as mismatch, not silent zero", () => {
  const r = scoreDag(dagKey, [{ node: "n0", label: "Z" }]);
  assert.notEqual(r.mismatch, "");
  const r2 = scoreDag(dagKey, [{ node: "nX", label: "A" }]);
  assert.notEqual(r2.mismatch, "");
});

test("scoreDag rejects forged repeat-step path", () => {
  const r = scoreDag(dagKey, [
    { node: "n0", label: "A" },
    { node: "n0", label: "A" },
  ]);
  assert.match(r.mismatch, /not a walk/);
  assert.equal(r.score, 0);
  assert.equal(r.pathMatch, false);
  assert.equal(r.pct, 0);
  assert.equal(r.ribbon, "");
});

test("scoreDag rejects skip-edge path (nextNodeId != next step)", () => {
  const r = scoreDag(dagKey, [
    { node: "n0", label: "A" },
    { node: "n2", label: "A" },
  ]);
  assert.match(r.mismatch, /not a walk/);
  assert.equal(r.score, 0);
});

test("scoreDag rejects path that does not end at a leaf", () => {
  const r = scoreDag(dagKey, [{ node: "n0", label: "B" }]);
  assert.match(r.mismatch, /not a walk: does not end at a leaf/);
  assert.equal(r.score, 0);
  const r2 = scoreDag(dagKey, [
    { node: "n0", label: "A" },
    { node: "n1", label: "A" },
    { node: "n3", label: "A" },
  ]);
  assert.notEqual(r2.mismatch, "");
});

test("scoreDag rejects empty path", () => {
  const r = scoreDag(dagKey, []);
  assert.match(r.mismatch, /not a walk/);
  const r2 = scoreDag(dagKey, null);
  assert.match(r2.mismatch, /not a walk/);
});

test("scoreDag valid walk that reaches a leaf through one edge still scores", () => {
  const key = {
    nodes: [
      { id: "n0", level: 0, isLeaf: false, question: "Q", outcome: null,
        choices: [
          { label: "A", text: "go", points: 5, nextNodeId: "n1" },
          { label: "B", text: "stop", points: 1, nextNodeId: "n1" },
        ] },
      { id: "n1", level: 1, isLeaf: true, question: "End", outcome: "o",
        choices: [], finalOutcome: "Done." },
    ],
    optimal: { path: [{ node: "n0", label: "A", points: 5 }], max_score: 5 },
  };
  const r = scoreDag(key, [{ node: "n0", label: "A" }]);
  assert.equal(r.mismatch, "");
  assert.equal(r.score, 5);
  assert.equal(r.pathMatch, true);
});
