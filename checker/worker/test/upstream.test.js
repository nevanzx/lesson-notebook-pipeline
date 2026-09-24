import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSystemPrompt, buildUserPrompt, buildGoBody, parseGoResult, extractUsage, HttpError,
} from "../src/upstream.js";

const req = {
  model: "glm-5.3-flash",
  question: "Why did break-even rise?",
  rubric: "2 pts: direction (1) + cause (1)",
  maxPoints: 2,
  answers: [
    { ref: "s1", text: "Fixed cost rose." },
    { ref: "s2", text: "It went up." },
  ],
};

test("prompts embed rubric, ceiling, refs", () => {
  const sys = buildSystemPrompt(2);
  assert.match(sys, /JSON array/);
  const user = buildUserPrompt(req);
  assert.match(user, /break-even/);
  assert.match(user, /\[s1\]/);
  assert.match(user, /\[s2\]/);
});

test("chat body shape", () => {
  const b = buildGoBody("chat", "glm-5.3-flash", "SYS", "USER");
  assert.equal(b.model, "glm-5.3-flash");
  assert.equal(b.messages[0].role, "system");
  assert.equal(b.messages[1].role, "user");
});

test("messages body shape", () => {
  const b = buildGoBody("messages", "qwen3.8-flash", "SYS", "USER");
  assert.equal(b.model, "qwen3.8-flash");
  assert.equal(b.messages[0].role, "user");
  assert.ok(b.max_tokens >= 2048);
});

test("responses body shape", () => {
  const b = buildGoBody("responses", "muse-spark-1.3-contributor", "SYS", "USER");
  assert.equal(b.model, "muse-spark-1.3-contributor");
  assert.ok(Array.isArray(b.input));
});

test("chat parser accepts good payload", () => {
  const json = { choices: [{ message: { content: JSON.stringify([
    { ref: "s1", score: 2, reason: "names both" },
    { ref: "s2", score: 1, reason: "direction only" },
  ]) } }] };
  const out = parseGoResult("chat", json, { refs: ["s1", "s2"], maxPoints: 2 });
  assert.deepEqual(out.map((r) => r.score), [2, 1]);
});

test("parsers accept fenced JSON", () => {
  const fenced = "```json\n" + JSON.stringify([{ ref: "s1", score: 2, reason: "ok" }]) + "\n```";
  const chat = { choices: [{ message: { content: fenced } }] };
  assert.equal(parseGoResult("chat", chat, { refs: ["s1"], maxPoints: 2 })[0].ref, "s1");
  const msgs = { content: [{ type: "text", text: fenced }] };
  assert.equal(parseGoResult("messages", msgs, { refs: ["s1"], maxPoints: 2 })[0].ref, "s1");
  const resp = { output: [{ type: "message", content: [{ type: "output_text", text: fenced }] }] };
  assert.equal(parseGoResult("responses", resp, { refs: ["s1"], maxPoints: 2 })[0].ref, "s1");
});

test("parsers reject unknown ref, out-of-range score, prose", () => {
  const mk = (rows) => ({ choices: [{ message: { content: JSON.stringify(rows) } }] });
  const ctx = { refs: ["s1"], maxPoints: 2 };
  assert.throws(() => parseGoResult("chat", mk([{ ref: "sx", score: 1, reason: "x" }]), ctx),
    (e) => e instanceof HttpError && e.status === 502);
  assert.throws(() => parseGoResult("chat", mk([{ ref: "s1", score: 5, reason: "x" }]), ctx),
    (e) => e instanceof HttpError && e.status === 502);
  assert.throws(() => parseGoResult("chat", mk("just prose"), ctx),
    (e) => e instanceof HttpError && e.status === 502);
  assert.throws(() => parseGoResult("chat", {}, ctx),
    (e) => e instanceof HttpError && e.status === 502);
});

test("extractUsage normalizes all three kinds", () => {
  assert.deepEqual(
    extractUsage("chat", { usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } }),
    { input: 10, output: 3, total: 13 });
  assert.deepEqual(
    extractUsage("messages", { usage: { input_tokens: 10, output_tokens: 3 } }),
    { input: 10, output: 3, total: 13 });
  assert.deepEqual(
    extractUsage("responses", { usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 } }),
    { input: 10, output: 3, total: 13 });
  assert.deepEqual(extractUsage("chat", {}), { input: 0, output: 0, total: 0 });
  assert.deepEqual(extractUsage("chat", null), { input: 0, output: 0, total: 0 });
});

test("parsers reject missing and duplicate rows", () => {
  const mk = (rows) => ({ choices: [{ message: { content: JSON.stringify(rows) } }] });
  const ctx = { refs: ["s1", "s2"], maxPoints: 2 };
  const one = [{ ref: "s1", score: 1, reason: "x" }];
  assert.throws(() => parseGoResult("chat", mk(one), ctx),
    (e) => e instanceof HttpError && e.status === 502);
  const dup = [...one, { ref: "s1", score: 1, reason: "y" }];
  assert.throws(() => parseGoResult("chat", mk(dup), ctx),
    (e) => e instanceof HttpError && e.status === 502);
});
