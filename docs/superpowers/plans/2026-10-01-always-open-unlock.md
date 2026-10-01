# Always-Open Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Worker release the assignment key on any day when an operator sets `UNLOCK_DAY=any`, while keeping the app-origin-only lock, and stop the checker flagging everyday submissions as outside the window.

**Architecture:** The gate lives in the Cloudflare Worker (`checker/worker/src/unlock.js`); the student viewer is only a relay and needs no change. `UNLOCK_DAY` gains one sentinel, `any`, that skips the weekday comparison. A new non-secret `GET /unlock` reports the effective window so the checker can suppress its `ReviewLog` "submitted outside window" note when the deployment is always-open.

**Tech Stack:** Cloudflare Worker (vanilla ES modules, `node --test`); checker app (browser ES modules, `node --test`); Markdown docs. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-always-open-unlock-design.md`

## Global Constraints

- Sentinel is exactly `any` (case-insensitive). No other sentinels (`all`, `*`, `always`).
- Default `UNLOCK_DAY` stays `wednesday`; behavior with the flag unset is unchanged.
- Fail-closed invariants preserved: wrong/missing `Origin` → `403`; missing/invalid `UNLOCK_KEY` → `500`.
- The origin check is **always** enforced, including when `UNLOCK_DAY=any`.
- `GET /unlock` returns window config only — it must **never** include a `key` field.
- No changes to `checker/app/viewer.html`, `checker/app/lib/unlock.js`, `v2/skeleton/components/assignment/component.js`, `decrypt.py`, `make_keys.py`, or the submission envelope.
- No new dependencies; no external assets.
- Worker tests: run from `checker/worker` with `npm test` (plain `node --test test/*.test.js`; no `npm install` required).
- Checker tests: run from `checker/app` with `node --test test/*.test.js`.

---

### Task 1: Worker — `UNLOCK_DAY=any` skips the weekday check

**Files:**
- Modify: `checker/worker/src/unlock.js`
- Modify: `checker/worker/test/unlock.test.js`
- Modify: `checker/worker/wrangler.toml`
- Modify: `checker/worker/README.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `windowConfig(env) → { day: string, tz: string }` where `day` is lowercased `UNLOCK_DAY || "wednesday"` and `tz` is `UNLOCK_TZ || "Asia/Manila"`. Task 2 imports it.

- [ ] **Step 1: Write the failing tests**

Append these tests to `checker/worker/test/unlock.test.js` (after the existing `custom UNLOCK_TZ/UNLOCK_DAY are honored` test):

```js
test("UNLOCK_DAY=any releases the key on a non-Wednesday (origin still required)", async () => {
  const ok = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }),
    unlockEnv({ NOW: TUE, UNLOCK_DAY: "any" }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, key: KEY });
  const bad = await handler.fetch(post("/unlock", { v: 1 },
    { origin: "https://evil.test" }), unlockEnv({ NOW: TUE, UNLOCK_DAY: "any" }));
  assert.equal(bad.status, 403);
});

test("UNLOCK_DAY=any still fails closed without a valid key", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }),
    { NOW: TUE, UNLOCK_DAY: "any" });
  assert.equal(res.status, 500);
  assert.equal(await (await res.json()).reason, "unconfigured");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `checker/worker`): `node --test test/unlock.test.js`
Expected: the first new test FAILS — the Tuesday call returns `423` instead of `200`, because `any` is compared against `weekdayInTz`. (The second is a guard test: the missing-key `500` fires before the day check, so it stays green before and after.)

- [ ] **Step 3: Add `windowConfig` and skip the day check**

In `checker/worker/src/unlock.js`, add the constant and helper below `DEFAULT_TZ`:

```js
const UNLOCK_ANY = "any";

export function windowConfig(env) {
  const e = env || {};
  const day = String(e.UNLOCK_DAY || "wednesday").trim().toLowerCase();
  const tz = String(e.UNLOCK_TZ || DEFAULT_TZ).trim() || DEFAULT_TZ;
  return { day, tz };
}
```

Then replace this block inside `handleUnlock`:

```js
  const tz = env.UNLOCK_TZ || DEFAULT_TZ;
  const want = (env.UNLOCK_DAY || "wednesday").toLowerCase();
  try {
    const now = env.NOW ? new Date(env.NOW) : new Date();
    const day = weekdayInTz(now, tz);
    if (day !== want) {
      return unlockJson(423, { ok: false, reason: "out-of-window", day, tz }, echo);
    }
  } catch {
    return unlockJson(500, { ok: false, reason: "unconfigured" }, echo);
  }
```

with:

```js
  const { day: want, tz } = windowConfig(env);
  if (want !== UNLOCK_ANY) {
    try {
      const now = env.NOW ? new Date(env.NOW) : new Date();
      const day = weekdayInTz(now, tz);
      if (day !== want) {
        return unlockJson(423, { ok: false, reason: "out-of-window", day, tz }, echo);
      }
    } catch {
      return unlockJson(500, { ok: false, reason: "unconfigured" }, echo);
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `checker/worker`): `node --test test/unlock.test.js`
Expected: PASS (all existing tests plus the two new ones).

- [ ] **Step 5: Document the flag**

In `checker/worker/wrangler.toml`, append:

```toml
# Optional: release the unlock key every day (origin check still enforced).
# [vars]
# UNLOCK_DAY = "any"
```

In `checker/worker/README.md`, change the opening paragraph's window sentence from

```
only inside the unlock window (server clock;
default Wednesday `Asia/Manila`, overridable via `UNLOCK_DAY`/`UNLOCK_TZ`).
```

to

```
only inside the unlock window (server clock;
default Wednesday `Asia/Manila`, overridable via `UNLOCK_DAY`/`UNLOCK_TZ`).
Set `UNLOCK_DAY = "any"` (a plain Worker var) to release it every day; the
`APP_ORIGIN` check is always enforced.
```

- [ ] **Step 6: Commit**

```bash
git add checker/worker/src/unlock.js checker/worker/test/unlock.test.js checker/worker/wrangler.toml checker/worker/README.md
git commit -m "feat(worker): UNLOCK_DAY=any releases the assignment key every day"
```

---

### Task 2: Worker — `GET /unlock` reports the window config

**Files:**
- Modify: `checker/worker/src/unlock.js`
- Modify: `checker/worker/src/index.js`
- Modify: `checker/worker/test/unlock.test.js`
- Modify: `checker/worker/README.md`

**Interfaces:**
- Consumes: `windowConfig(env)` from Task 1.
- Produces: `GET /unlock` → `200 {"v":1,"ok":true,"day":<string>,"tz":<string>}` with wildcard CORS and no `key`. Task 4's `loadUnlockWindow()` reads `day`.

- [ ] **Step 1: Write the failing tests**

In `checker/worker/test/unlock.test.js`, replace the existing test named `"GET /unlock → 404; /grade and /models keep wildcard CORS"` (currently lines 115-124) with:

```js
test("GET /unlock returns the window config; /grade and /models keep wildcard CORS", async () => {
  const info = await handler.fetch(new Request("https://w.test/unlock"), unlockEnv());
  assert.equal(info.status, 200);
  assert.equal(info.headers.get("access-control-allow-origin"), "*");
  const cfg = await info.json();
  assert.deepEqual(cfg, { v: 1, ok: true, day: "wednesday", tz: "Asia/Manila" });
  assert.equal(Object.prototype.hasOwnProperty.call(cfg, "key"), false);
  const models = await handler.fetch(new Request("https://w.test/models"), {});
  assert.equal(models.headers.get("access-control-allow-origin"), "*");
  const unauth = await handler.fetch(post("/grade", {}), {});
  assert.equal(unauth.status, 401);
  assert.equal(unauth.headers.get("access-control-allow-origin"), "*");
});

test("GET /unlock reports day=any when configured and never a key", async () => {
  const res = await handler.fetch(new Request("https://w.test/unlock"),
    { UNLOCK_DAY: "any", UNLOCK_TZ: "Asia/Manila" });
  assert.equal(res.status, 200);
  const cfg = await res.json();
  assert.deepEqual(cfg, { v: 1, ok: true, day: "any", tz: "Asia/Manila" });
  assert.equal(Object.prototype.hasOwnProperty.call(cfg, "key"), false);
});

test("GET /unlock reads config even when UNLOCK_KEY is unconfigured", async () => {
  const res = await handler.fetch(new Request("https://w.test/unlock"), {});
  assert.equal(res.status, 200);
  assert.equal((await res.json()).day, "wednesday");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `checker/worker`): `node --test test/unlock.test.js`
Expected: FAIL — `GET /unlock` still returns `404`.

- [ ] **Step 3: Add `unlockInfo` and route the GET**

In `checker/worker/src/unlock.js`, add below `unlockJson`:

```js
export function unlockInfo(env) {
  const { day, tz } = windowConfig(env);
  return unlockJson(200, { v: 1, ok: true, day, tz }, "*");
}
```

In `checker/worker/src/index.js`, change the import:

```js
import { handleUnlock, unlockPreflight } from "./unlock.js";
```

to

```js
import { handleUnlock, unlockPreflight, unlockInfo } from "./unlock.js";
```

Then change the `/unlock` branch:

```js
    if (url.pathname === "/unlock") {
      if (request.method === "OPTIONS") return unlockPreflight(request, env);
      if (request.method === "POST") return await handleUnlock(request, env);
      return json(404, { error: "not found" });
    }
```

to

```js
    if (url.pathname === "/unlock") {
      if (request.method === "OPTIONS") return unlockPreflight(request, env);
      if (request.method === "GET") return unlockInfo(env);
      if (request.method === "POST") return await handleUnlock(request, env);
      return json(404, { error: "not found" });
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `checker/worker`): `node --test test/unlock.test.js`
Expected: PASS.

- [ ] **Step 5: Document the endpoint**

In `checker/worker/README.md`, add a bullet under the intro paragraph:

```
- `GET /unlock` — non-secret window config `{v,ok,day,tz}` (never the key),
  so clients can observe whether the deployment is always-open.
```

- [ ] **Step 6: Commit**

```bash
git add checker/worker/src/unlock.js checker/worker/src/index.js checker/worker/test/unlock.test.js checker/worker/README.md
git commit -m "feat(worker): GET /unlock reports the window config"
```

---

### Task 3: Checker — `outsideWindowReason` pure helper

**Files:**
- Modify: `checker/app/lib/format.js`
- Modify: `checker/app/test/format.test.js`

**Interfaces:**
- Consumes: `weekdayInTz(iso, tz)` already in `checker/app/lib/format.js`.
- Produces: `outsideWindowReason(windowDay, tz, submittedAt) → string | null`; `null` when `windowDay` is `"any"` (case-insensitive), when the weekday can't be resolved, or when it matches; otherwise the reason string `submitted outside window (getting <day>)`. Task 4 imports it.

- [ ] **Step 1: Write the failing tests**

In `checker/app/test/format.test.js`, change the import on line 3 to add `outsideWindowReason`:

```js
import { normalize, idMatch, tfCorrect, mcCorrect, weekdayInTz,
  outsideWindowReason } from "../lib/format.js";
```

Append:

```js
test("outsideWindowReason: always-open (any) never flags", () => {
  assert.equal(outsideWindowReason("any", "Asia/Manila", "2026-09-22T10:00:00Z"), null);
  assert.equal(outsideWindowReason("ANY", "Asia/Manila", "2026-09-22T10:00:00Z"), null);
});

test("outsideWindowReason: in-window and unknown times are not flagged", () => {
  assert.equal(outsideWindowReason("wednesday", "Asia/Manila", "2026-09-23T10:00:00Z"), null);
  assert.equal(outsideWindowReason("wednesday", "Asia/Manila", ""), null);
  assert.equal(outsideWindowReason("wednesday", "Asia/Manila", "not-a-date"), null);
});

test("outsideWindowReason: a real mismatch returns the note", () => {
  assert.equal(outsideWindowReason("wednesday", "Asia/Manila", "2026-09-22T10:00:00Z"),
    "submitted outside window (getting tuesday)");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `checker/app`): `node --test test/format.test.js`
Expected: FAIL — `outsideWindowReason` is not exported (SyntaxError/undefined).

- [ ] **Step 3: Implement the helper**

In `checker/app/lib/format.js`, append after `weekdayInTz`:

```js
export function outsideWindowReason(windowDay, tz, submittedAt) {
  const day = String(windowDay || "").trim().toLowerCase();
  if (day === "any") return null;
  const dow = weekdayInTz(submittedAt, tz);
  if (!dow || dow === day) return null;
  return `submitted outside window (getting ${dow})`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `checker/app`): `node --test test/format.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add checker/app/lib/format.js checker/app/test/format.test.js
git commit -m "feat(checker): outsideWindowReason helper with always-open support"
```

---

### Task 4: Checker — suppress the note when the Worker is always-open

**Files:**
- Modify: `checker/app/app.js`
- Modify: `checker/app/README.md`

**Interfaces:**
- Consumes: `outsideWindowReason` from Task 3; `GET /unlock` from Task 2.
- Produces: `state.setup.unlockDay` (`"any"` or a weekday name or `null`) and `loadUnlockWindow()`; both local to `app.js`.

- [ ] **Step 1: Add the state field and the config loader**

In `checker/app/app.js`, change the import on line 7:

```js
import { weekdayInTz } from "./lib/format.js";
```

to

```js
import { outsideWindowReason } from "./lib/format.js";
```

Add `unlockDay` to the setup state (line 18):

```js
  setup: { workerUrl: WORKER_URL, apiKey: "", model: MODELS_BUILTIN[0], unlockDay: null },
```

Add this function immediately after `loadModels()` (which ends around line 109):

```js
async function loadUnlockWindow() {
  try {
    const res = await fetch(`${state.setup.workerUrl.replace(/\/$/, "")}/unlock`);
    if (!res.ok) throw new Error(`unlock config failed: ${res.status}`);
    const cfg = await res.json();
    const day = cfg && typeof cfg.day === "string" ? cfg.day.toLowerCase() : null;
    state.setup.unlockDay = day;
    if (day === "any") localStorage.setItem("checker.unlockDay", "any");
    else localStorage.removeItem("checker.unlockDay");
  } catch {
    /* keep the cached/unknown value; the note falls back to the lesson window */
  }
}
```

- [ ] **Step 2: Load it at boot and on setup save**

In `initSetup()` (line 128), immediately after the `savedModel` block (lines 135-136), add:

```js
  const savedUnlockDay = localStorage.getItem("checker.unlockDay");
  if (savedUnlockDay) state.setup.unlockDay = savedUnlockDay;
```

Change the first `loadModels();` call (line 139) to:

```js
  loadModels();
  loadUnlockWindow();
```

Change the `loadModels();` call inside the `saveSetup` handler (line 158) to:

```js
    loadModels();
    loadUnlockWindow();
```

- [ ] **Step 3: Use the helper in `flagOutOfWindow`**

Replace (around lines 270-279):

```js
  const win = keyJson.window && typeof keyJson.window === "object" ? keyJson.window : {};
  const windowDay = win.day || "wednesday";
  const windowTz = win.tz || "Asia/Manila";
  const flagOutOfWindow = (ref, sub) => {
    const dow = weekdayInTz(sub && sub.submitted_at, windowTz);
    if (dow && dow !== windowDay) {
      assignment.reviews.push({ saN: "time", ref, ai: "",
        reason: `submitted outside window (getting ${dow})`, final: "" });
    }
  };
```

with:

```js
  const win = keyJson.window && typeof keyJson.window === "object" ? keyJson.window : {};
  const windowDay = win.day || "wednesday";
  const windowTz = win.tz || "Asia/Manila";
  const flagOutOfWindow = (ref, sub) => {
    const day = state.setup.unlockDay === "any" ? "any" : windowDay;
    const reason = outsideWindowReason(day, windowTz, sub && sub.submitted_at);
    if (reason) {
      assignment.reviews.push({ saN: "time", ref, ai: "", reason, final: "" });
    }
  };
```

- [ ] **Step 4: Verify syntax and existing tests**

Run (from `checker/app`): `node --check app.js`
Expected: no output (parses cleanly).

Run (from `checker/app`): `node --test test/*.test.js`
Expected: PASS (all existing checker tests still green).

- [ ] **Step 5: Update the README**

In `checker/app/README.md`, replace the student-viewer bullet's Wednesday sentence:

```
  leave the device. On Wednesday (Asia/Manila) it also relays the
  assignment unlock request from the staged lesson iframe to the Worker
  (`lib/unlock.js` → `POST /unlock`); the lesson decrypts only inside
  this page.
```

with:

```
  leave the device. It relays the assignment unlock request from the staged
  lesson iframe to the Worker (`lib/unlock.js` → `POST /unlock`); the lesson
  decrypts only inside this page. The Worker releases the key on Wednesday
  (Asia/Manila) by default, or every day when the deployment sets
  `UNLOCK_DAY=any`. The grader reads `GET /unlock` and skips its "submitted
  outside window" ReviewLog note while the deployment is always-open.
```

- [ ] **Step 6: Commit**

```bash
git add checker/app/app.js checker/app/README.md
git commit -m "feat(checker): skip outside-window note when the Worker is always-open"
```

---

### Task 5: Docs sweep

**Files:**
- Modify: `v2/SKILL.md`
- Modify: `v2/skeleton/components/assignment/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (documentation of Tasks 1-4).
- Produces: no code.

- [ ] **Step 1: Update the skill manifest**

In `v2/SKILL.md`, find the v2.9 paragraph (around line 111-114):

```
`build/key/unlock.key` (gitignored; `LN_UNLOCK_KEY` env overrides) and as the
Worker secret `UNLOCK_KEY`; the Worker releases it only on Wednesday
(Asia/Manila, server clock) to the app origin.
```

Replace with:

```
`build/key/unlock.key` (gitignored; `LN_UNLOCK_KEY` env overrides) and as the
Worker secret `UNLOCK_KEY`; the Worker releases it only on Wednesday
(Asia/Manila, server clock) to the app origin, unless the deployment sets the
Worker var `UNLOCK_DAY=any` to release it every day (origin still enforced).
```

- [ ] **Step 2: Update the component README**

In `v2/skeleton/components/assignment/README.md`, in the "Ciphertext at rest + unlock (v2.9)" section, change:

```
Worker, which releases it only on Wednesday (Asia/Manila) to the app origin;
```

to:

```
Worker, which releases it only on Wednesday (Asia/Manila) to the app origin
(or every day when the Worker var `UNLOCK_DAY=any` is set);
```

- [ ] **Step 3: Update the top-level README**

In `README.md`, after the v2.10 paragraph (ends at line 62), add:

```
v2.13 deployments may set the Worker var `UNLOCK_DAY=any` to release the
assignment key every day (the app-origin-only check is unchanged); the checker
then skips its outside-window ReviewLog note. See
docs/superpowers/specs/2026-10-01-always-open-unlock-design.md.
```

- [ ] **Step 4: Commit**

```bash
git add v2/SKILL.md v2/skeleton/components/assignment/README.md README.md
git commit -m "docs: always-open unlock flag"
```

---

## Self-Review

**Spec coverage:**
- §2(a) any-day release, origin kept → Task 1.
- §2(b) unchanged default → Task 1 (existing tests stay green).
- §2(c) `GET /unlock` config → Task 2.
- §2(d) checker note suppressed → Tasks 3-4.
- §2(e) viewer/component untouched → no task edits them (Global Constraints).
- §2(f) fail-closed → Task 1 tests cover 403/500 with `any`.
- §4 worker changes → Tasks 1-2. §5 checker → Tasks 3-4. §7 files → mapped across tasks. §8 testing → embedded per task. §9 rollout order → task order.

**Placeholder scan:** none — every step carries exact code, commands, and expected results.

**Type consistency:** `windowConfig(env) → {day, tz}` (Task 1) is consumed unchanged in Task 2. `outsideWindowReason(windowDay, tz, submittedAt) → string|null` (Task 3) is consumed unchanged in Task 4. `state.setup.unlockDay` is written in both `loadUnlockWindow` and `initSetup` and read in `flagOutOfWindow` (Task 4).

**Known non-goal restated:** the hardcoded "opens Wednesday" text in the component's unreachable out-of-window branch is intentionally left alone (spec §2 non-goals).
