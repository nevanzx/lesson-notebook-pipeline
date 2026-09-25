import test from "node:test";
import assert from "node:assert/strict";
import { windowDayFromHtml, timeStubScript, injectTimeStub,
  decodeUnlockKey, previewUnlockHandler, isEncryptedHtml } from "../lib/preview.js";

const LESSON = '<!DOCTYPE html><html><head>' +
  '<meta name="ln:window-day" content="friday">' +
  '<script>window.LN={data:{}};</' + 'script></head><body></body></html>';
const PLAIN = '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>';

function stubOf(html) {
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, "stub script present");
  return m[1];
}

function runStub(html) {
  const win = { fetch: (input) => ({ viaOrig: String(input.url || input) }) };
  new Function("window", stubOf(html))(win);
  return win;
}

test("injectTimeStub lands right after <head>, before the lesson's own scripts", () => {
  const out = injectTimeStub(LESSON);
  const headEnd = out.indexOf("<head>") + "<head>".length;
  const stub = out.indexOf("<script>", headEnd);
  assert.ok(stub >= headEnd, "after <head>");
  assert.ok(stub < out.indexOf("window.LN"), "before the lesson script");
});

test("stub answers only the four trusted-time hosts", async () => {
  const win = runStub(injectTimeStub(LESSON));
  for (const host of ["https://worldtimeapi.org/api/timezone/Asia/Manila",
    "https://utctime.app/api/now/Asia/Manila",
    "https://time.now/developer/api/timezone/Asia/Manila",
    "https://sunrise.am/developer/api/timezone/Asia/Manila"]) {
    const resp = await win.fetch({ url: host });
    assert.equal(resp.ok, true, host);
    const j = await resp.json();
    assert.equal(j.day_of_week, "friday", host);
    assert.ok(!isNaN(Date.parse(j.datetime)), host);
    assert.equal(typeof j.unixtime, "number", host);
  }
});

test("every other URL passes through to the original fetch", () => {
  const win = runStub(injectTimeStub(LESSON));
  const p = win.fetch({ url: "https://example.com/api" });
  assert.equal(p.viaOrig, "https://example.com/api");
});

test("window day comes from ln:window-day, defaults to wednesday", () => {
  assert.equal(windowDayFromHtml(LESSON), "friday");
  assert.equal(windowDayFromHtml(PLAIN), "wednesday");
  assert.equal(windowDayFromHtml(
    '<meta name="ln:window-day" content="somnday">'), "wednesday");
  assert.ok(timeStubScript("bogus").includes('"wednesday"'));
  assert.ok(timeStubScript("Friday").includes('"friday"'));
});

test("decodeUnlockKey accepts 32-byte base64, rejects the rest", () => {
  const good = Buffer.from(new Uint8Array(32).fill(5)).toString("base64");
  assert.equal(decodeUnlockKey(good).length, 32);
  assert.equal(decodeUnlockKey("  " + good + "\n").length, 32);
  assert.throws(() => decodeUnlockKey(
    Buffer.from(new Uint8Array(31)).toString("base64")), /not-32-bytes/);
  assert.throws(() => decodeUnlockKey("not base64 !!"), /not-base64/);
  assert.throws(() => decodeUnlockKey(""), /empty-key/);
  assert.throws(() => decodeUnlockKey(null), /empty-key/);
});

test("isEncryptedHtml detects the lnenc envelope, ignores plaintext", () => {
  const enc = 'LN.data.a7={"lnenc":1,"v":1,"iv":"QUJDRA==","ct":"REVGRA=="}';
  assert.equal(isEncryptedHtml(enc), true);
  assert.equal(isEncryptedHtml('LN.data.a7={"items":[]}'), false);
  assert.equal(isEncryptedHtml(""), false);
  assert.equal(isEncryptedHtml("a stray lnenc mention"), false);
});

test("handler answers the frame's unlock request from the local key", async () => {
  const f = { posts: [], postMessage(m) { this.posts.push(m); },
    location: { href: "blob:https://origin/x" } };
  let key = "a2V5";
  const h = previewUnlockHandler({ stage: { contentWindow: f },
    getKey: () => key });
  await h({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: true,
    key: "a2V5" }]);
  f.posts.length = 0;
  key = null;
  await h({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: false,
    reason: "no-key" }]);
  f.posts.length = 0;
  await h({ source: { }, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, []);
  await h({ source: f, data: { type: "other", v: 1 } });
  assert.deepEqual(f.posts, []);
});

test("cross-origin frame (blocked location.href) gets no-key even when a key is loaded", async () => {
  const f = { posts: [], postMessage(m) { this.posts.push(m); } };
  Object.defineProperty(f, "location", {
    value: { get href() { throw new Error("SecurityError"); } },
  });
  const h = previewUnlockHandler({ stage: { contentWindow: f },
    getKey: () => "a2V5" });
  await h({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: false,
    reason: "no-key" }]);
});

test("same-origin frame (readable location) still gets the key", async () => {
  const f = { posts: [], postMessage(m) { this.posts.push(m); },
    location: { href: "blob:https://origin/x" } };
  const h = previewUnlockHandler({ stage: { contentWindow: f },
    getKey: () => "a2V5" });
  await h({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: true,
    key: "a2V5" }]);
});
