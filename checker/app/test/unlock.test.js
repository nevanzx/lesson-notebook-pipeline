import test from "node:test";
import assert from "node:assert/strict";
import { WORKER_URL, relayUnlock, unlockMessageHandler } from "../lib/unlock.js";

function frame() {
  return { posts: [], postMessage(m) { this.posts.push(m); } };
}

test("WORKER_URL is the deployed checker worker", () => {
  assert.equal(WORKER_URL, "https://checker-grade.aclc-obero.workers.dev");
});

test("request from the staged iframe is forwarded and the key relays back", async () => {
  const f = frame();
  const calls = [];
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async (url, init) => {
      calls.push([url, init.method, init.body]);
      return { ok: true, status: 200, json: async () => ({ ok: true, key: "a2tleQ==" }) };
    },
  });
  await handler({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.equal(calls[0][0], "https://w.test/unlock");
  assert.equal(calls[0][1], "POST");
  assert.deepEqual(JSON.parse(calls[0][2]), { v: 1 });
  assert.deepEqual(f.posts,
    [{ type: "ln-unlock-response", v: 1, ok: true, key: "a2tleQ==" }]);
});

test("out-of-window reply is relayed with its reason", async () => {
  const f = frame();
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async () => ({ ok: false, status: 423,
      json: async () => ({ ok: false, reason: "out-of-window", day: "tuesday" }) }),
  });
  await handler({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: false,
    reason: "out-of-window" }]);
});

test("fetch failure relays {ok:false, reason:'network'}", async () => {
  const f = frame();
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async () => { throw new TypeError("offline"); },
  });
  await handler({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: false,
    reason: "network" }]);
});

test("a message from another source is ignored", async () => {
  const f = frame();
  let called = false;
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
  });
  await handler({ source: { }, data: { type: "ln-unlock-request", v: 1 } });
  assert.equal(called, false);
  assert.deepEqual(f.posts, []);
});

test("cross-origin frame gets no-key without calling the Worker", async () => {
  const f = frame();
  Object.defineProperty(f, "location", {
    get() { throw new Error("blocked"); },
  });
  let called = false;
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
  });
  await handler({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.equal(called, false);
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: false,
    reason: "no-key" }]);
});

test("foreign message types are ignored", async () => {
  const f = frame();
  let called = false;
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
  });
  await handler({ source: f, data: { type: "something-else", v: 1 } });
  await handler({ source: f, data: { type: "ln-unlock-request", v: 2 } });
  assert.equal(called, false);
});

test("relayUnlock survives a non-JSON body", async () => {
  const replies = [];
  await relayUnlock("https://w.test",
    async () => ({ ok: true, status: 200, json: async () => { throw new Error("nope"); } }),
    (r) => replies.push(r));
  assert.deepEqual(replies, [{ type: "ln-unlock-response", v: 1, ok: false,
    reason: "network" }]);
});
