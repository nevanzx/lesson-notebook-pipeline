import test from "node:test";
import assert from "node:assert/strict";
import handler from "../src/index.js";

function req(method, path, body, headers = {}) {
  return new Request(`https://grade.example${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const gradeBody = () => ({
  model: "glm-5.3-flash",
  question: "Q",
  rubric: "1 pt",
  maxPoints: 1,
  answers: [{ ref: "s1", text: "A" }],
});

function mockFetchOnce(payload, { status = 200 } = {}) {
  globalThis.fetch = async () => new Response(JSON.stringify(payload), { status });
}
function mockFetchSeq(seq) {
  let i = 0;
  globalThis.fetch = async () => {
    const s = seq[Math.min(i++, seq.length - 1)];
    return new Response(JSON.stringify(s.body), {
      status: s.status,
      headers: s.retryAfter ? { "retry-after": s.retryAfter } : {},
    });
  };
}
const realFetch = globalThis.fetch;

test("OPTIONS preflight returns CORS headers", async () => {
  const res = await handler.fetch(req("OPTIONS", "/grade"), {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("GET /models lists the 4 ids", async () => {
  const res = await handler.fetch(req("GET", "/models"), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.models.sort(), [
    "deepseek-v4.1-flash",
    "glm-5.3-flash",
    "muse-spark-1.3-contributor",
    "qwen3.8-flash",
  ]);
});

test("happy path forwards auth + returns scores", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  let seenUrl = "";
  let seenAuth = "";
  globalThis.fetch = async (url, init) => {
    seenUrl = String(url);
    seenAuth = init.headers.authorization;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify([{ ref: "s1", score: 1, reason: "ok" }]) } }],
    }), { status: 200 });
  };
  const res = await handler.fetch(
    req("POST", "/grade", gradeBody(), { authorization: "Bearer go-test-key" }), {});
  assert.equal(res.status, 200);
  assert.equal(seenUrl, "https://opencode.ai/zen/go/v1/chat/completions");
  assert.equal(seenAuth, "Bearer go-test-key");
  assert.deepEqual(await res.json(), [{ ref: "s1", score: 1, reason: "ok" }]);
});

test("missing auth → 401 without calling Go", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("must not call"); };
  const res = await handler.fetch(req("POST", "/grade", gradeBody()), {});
  assert.equal(res.status, 401);
  assert.equal(called, false);
});

test("bad body → 400", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  const res = await handler.fetch(
    req("POST", "/grade", { ...gradeBody(), model: "nope" }, { authorization: "Bearer k" }), {});
  assert.equal(res.status, 400);
});

test("unparseable model output → 502", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockFetchOnce({ choices: [{ message: { content: "in prose we trust" } }] });
  const res = await handler.fetch(
    req("POST", "/grade", gradeBody(), { authorization: "Bearer k" }), {});
  assert.equal(res.status, 502);
});

test("429 then success retries once", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockFetchSeq([
    { status: 429, body: { error: "slow" }, retryAfter: "0" },
    { status: 200, body: { choices: [{ message: { content: JSON.stringify([{ ref: "s1", score: 1, reason: "ok" }]) } }] } },
  ]);
  const res = await handler.fetch(
    req("POST", "/grade", gradeBody(), { authorization: "Bearer k" }), {});
  assert.equal(res.status, 200);
});

test("unknown path → 404", async () => {
  const res = await handler.fetch(req("GET", "/nope"), {});
  assert.equal(res.status, 404);
});
