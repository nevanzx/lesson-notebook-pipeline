import test from "node:test";
import assert from "node:assert/strict";
import handler from "../src/index.js";
import { isAllowedOrigin, weekdayInTz } from "../src/unlock.js";

const KEY = Buffer.from(new Uint8Array(32).fill(3)).toString("base64");
const APP = "https://assignz.web.app";
const WED = "2026-09-23T04:00:00Z"; // 12:00 Manila — Wednesday
const TUE = "2026-09-22T04:00:00Z";

const unlockEnv = (over = {}) =>
  ({ UNLOCK_KEY: KEY, NOW: WED, ...over });

function post(path, body, headers = {}) {
  return new Request(`https://w.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("unit: isAllowedOrigin honors the comma list and default", () => {
  assert.equal(isAllowedOrigin(APP, undefined), true);
  assert.equal(isAllowedOrigin("https://assignz.firebaseapp.com", undefined), true);
  assert.equal(isAllowedOrigin("https://evil.test", undefined), false);
  assert.equal(isAllowedOrigin(null, undefined), false);
  assert.equal(isAllowedOrigin("https://a.test", "https://a.test , https://b.test"), true);
});

test("unit: weekdayInTz reads the server-side zone", () => {
  assert.equal(weekdayInTz(new Date(WED), "Asia/Manila"), "wednesday");
  assert.equal(weekdayInTz(new Date(TUE), "Asia/Manila"), "tuesday");
});

test("allowed origin + Wednesday → 200 with the key + echoed CORS", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }), unlockEnv());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), APP);
  assert.deepEqual(await res.json(), { ok: true, key: KEY });
});

test("non-Wednesday → 423 out-of-window with day+tz", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }),
    unlockEnv({ NOW: TUE }));
  assert.equal(res.status, 423);
  assert.equal(res.headers.get("access-control-allow-origin"), APP);
  const body = await res.json();
  assert.deepEqual(body, { ok: false, reason: "out-of-window", day: "tuesday",
    tz: "Asia/Manila" });
});

test("wrong origin → 403 with no CORS echo", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 },
    { origin: "https://evil.test" }), unlockEnv());
  assert.equal(res.status, 403);
  assert.equal(await (await res.json()).reason, "forbidden");
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("missing origin → 403", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }), unlockEnv());
  assert.equal(res.status, 403);
});

test("missing UNLOCK_KEY → 500 unconfigured (fail closed)", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }),
    { NOW: WED });
  assert.equal(res.status, 500);
  assert.equal(await (await res.json()).reason, "unconfigured");
});

test("short/long key → 500 unconfigured", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }),
    unlockEnv({ UNLOCK_KEY: Buffer.from(new Uint8Array(31)).toString("base64") }));
  assert.equal(res.status, 500);
});

test("custom UNLOCK_TZ/UNLOCK_DAY are honored", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }),
    unlockEnv({ NOW: TUE, UNLOCK_TZ: "Pacific/Kiritimati", UNLOCK_DAY: "tuesday" }));
  assert.equal(res.status, 200);
});

test("body without v:1 → 400", async () => {
  const res = await handler.fetch(post("/unlock", {}, { origin: APP }), unlockEnv());
  assert.equal(res.status, 400);
});

test("OPTIONS preflight echoes the allowed origin only", async () => {
  const ok = await handler.fetch(new Request("https://w.test/unlock", {
    method: "OPTIONS", headers: { origin: APP } }), unlockEnv());
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), APP);
  const bad = await handler.fetch(new Request("https://w.test/unlock", {
    method: "OPTIONS", headers: { origin: "https://evil.test" } }), unlockEnv());
  assert.equal(bad.status, 204);
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
});

test("GET /unlock → 404; /grade and /models keep wildcard CORS", async () => {
  const gone = await handler.fetch(new Request("https://w.test/unlock"),
    unlockEnv());
  assert.equal(gone.status, 404);
  const models = await handler.fetch(new Request("https://w.test/models"), {});
  assert.equal(models.headers.get("access-control-allow-origin"), "*");
  const unauth = await handler.fetch(post("/grade", {}), {});
  assert.equal(unauth.status, 401);
  assert.equal(unauth.headers.get("access-control-allow-origin"), "*");
});
