import test from "node:test";
import assert from "node:assert/strict";
import { chunk10, gradeBatch, gradeAll } from "../lib/sa.js";

test("chunk10 splits into tens", () => {
  const arr = Array.from({ length: 23 }, (_, i) => i);
  assert.deepEqual(chunk10(arr).map((c) => c.length), [10, 10, 3]);
  assert.deepEqual(chunk10([]), []);
});

test("gradeBatch posts contract + returns rows", async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  let seen = {};
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) };
    return new Response(JSON.stringify([{ ref: "s1", score: 1, reason: "ok" }]), { status: 200 });
  };
  const rows = await gradeBatch("https://w.example", "k", {
    model: "glm-5.3-flash", question: "Q", rubric: "R", maxPoints: 1,
    answers: [{ ref: "s1", text: "A" }],
  });
  assert.equal(seen.url, "https://w.example/grade");
  assert.equal(seen.auth, "Bearer k");
  assert.equal(seen.body.model, "glm-5.3-flash");
  assert.deepEqual(rows, [{ ref: "s1", score: 1, reason: "ok" }]);
});

test("gradeBatch throws with status on error", async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "x" }), { status: 502 });
  await assert.rejects(gradeBatch("https://w.example", "k", {
    model: "m", question: "Q", rubric: "R", maxPoints: 1, answers: [{ ref: "s1", text: "A" }],
  }), (e) => e.status === 502);
});

test("gradeAll batches tens with concurrency 2", async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  let live = 0;
  let peak = 0;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    live++;
    peak = Math.max(peak, live);
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    const body = JSON.parse(init.body);
    live--;
    return new Response(JSON.stringify(
      body.answers.map((a) => ({ ref: a.ref, score: 1, reason: "ok" }))), { status: 200 });
  };
  const answers = Array.from({ length: 25 }, (_, i) => ({ ref: "r" + i, text: "t" }));
  const seen = [];
  const out = await gradeAll("https://w.example", "k", "glm-5.3-flash",
    { question: "Q", rubric: "R", maxPoints: 1 }, answers,
    (done, total) => seen.push([done, total]));
  assert.equal(out.size, 25);
  assert.equal(calls, 3);
  assert.ok(peak <= 2);
  assert.deepEqual(seen[seen.length - 1], [25, 25]);
});
