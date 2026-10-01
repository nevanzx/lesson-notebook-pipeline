# Always-Open Unlock — opt-in Worker flag to release the assignment key any day

Date: 2026-10-01 · Status: draft for review

## 1. Context

The assignment ships as ciphertext at rest (v2.9, `docs/superpowers/specs/2026-09-24-assignment-encryption-design.md`). The only copy of the decryption key lives as the Cloudflare Worker secret `UNLOCK_KEY`. The Worker's `POST /unlock` (`checker/worker/src/unlock.js`) releases that key only when **both** hold:

1. the request `Origin` is in `APP_ORIGIN` (`https://assignz.web.app`, `…firebaseapp.com`); and
2. the Worker's **server clock** says the configured weekday (`UNLOCK_DAY`, default `wednesday`) in `UNLOCK_TZ` (default `Asia/Manila`).

The student-facing viewer (`checker/app/viewer.html`) is a pure relay: it forwards the lesson iframe's `ln-unlock-request` to the Worker and posts the reply back. It holds no key and enforces nothing itself. Once the Worker returns a key, the component decrypts and calls `render(root, plain, {gateBypass:true})`, skipping the in-page trusted-time gate (which only legacy/plaintext builds still use).

Request: **let the assignment open on any day** while **keeping the app-origin-only lock** (only `assignz.web.app` may obtain the key). The day check is the thing to relax; the origin check is not.

Because the gate is Worker-side, a viewer-only bypass is impossible without shipping the key into a served file, which would break the app-only guarantee. The change belongs in the Worker, driven by an opt-in env flag so the Wednesday default is untouched until the operator chooses otherwise.

### 1.1 Accepted limitation (unchanged)

The §1.1 limitation of the time-lock and encryption designs still applies: a client-delivered file cannot be tamper-proof, and a student can capture the key on any day the Worker hands it out. Opening every day widens the window in which the key is handed out (from Wednesdays to all days), so the encryption's "questions are ciphertext at rest" guarantee still holds, but the "only obtainable on Wednesday" deterrent is deliberately dropped for deployments that opt in. This is the user's explicit choice.

## 2. Goals / non-goals

Goals:

- (a) A Worker env flag (`UNLOCK_DAY=any`) makes `POST /unlock` release the key on **any** day, **origin still required**.
- (b) With the flag unset, behavior is **byte-for-byte unchanged** (Wednesday default, fail-closed).
- (c) The Worker reports its effective unlock window via a non-secret `GET /unlock` so other components (the checker) can observe the mode.
- (d) The checker's `ReviewLog` "submitted outside window" note is **suppressed** when the Worker reports `any`, so everyday submissions are not flagged as anomalies.
- (e) The student viewer (`viewer.html`) and the lesson component require **no change**.
- (f) Fail-closed behavior is preserved: wrong/missing origin → `403`, missing/short key → `500`.

Non-goals:

- No change to the student viewer, the lesson component, the submission envelope, `decrypt.py`, `make_keys.py`, or the teacher-key flow.
- No change to the per-lesson `build.json > window` config (it still governs legacy/plaintext in-page gates and message text).
- No change to the legacy/plaintext in-page trusted-time gate: new assignment builds are always encrypted, so only old files use that path, and they can already be opened directly in a browser (they carry no app-origin restriction).
- No new key material, no rotation, no scoring change.
- No UI to flip the mode at runtime; it is an operator-level Worker env var.

## 3. The sentinel

`UNLOCK_DAY` keeps its existing vocabulary (`monday … sunday`, default `wednesday`) and gains exactly one sentinel: **`any`** (case-insensitive). When the resolved day is `any`, the weekday comparison is skipped. No other sentinel (`all`, `*`, `always`) is recognized — an unrecognized value simply never matches a real weekday and therefore locks, exactly as today (safe default, no new validation surface).

An operator enables always-open by setting the Worker var and redeploying:

```
# checker/worker/wrangler.toml
[vars]
UNLOCK_DAY = "any"
```

or via the Cloudflare dashboard / `npx wrangler secret put UNLOCK_DAY` (it is not secret; a plain var is preferred). Leaving it unset keeps Wednesday.

## 4. Worker changes

### 4.1 `checker/worker/src/unlock.js`

- New pure helper:

  ```js
  export function windowConfig(env) {
    const day = String(env.UNLOCK_DAY || "wednesday").trim().toLowerCase();
    const tz = String(env.UNLOCK_TZ || DEFAULT_TZ).trim() || DEFAULT_TZ;
    return { day, tz };
  }
  ```

  Used by both the POST decision and the GET info so the two can never disagree.

- `handleUnlock(request, env)`:
  1. Origin check (unchanged) → `403 {ok:false, reason:"forbidden"}`.
  2. Body must be `{v:1}` (unchanged) → `400 {ok:false, reason:"bad-request"}`.
  3. `UNLOCK_KEY` present and 32 bytes (unchanged) → `500 {ok:false, reason:"unconfigured"}`.
  4. **New:** resolve `{day, tz} = windowConfig(env)`. If `day === "any"`, skip the weekday check; otherwise compute `weekdayInTz(now, tz)` and compare to `day`, returning the existing `423 {ok:false, reason:"out-of-window", day, tz}` on mismatch.
  5. Else `200 {ok:true, key}` (unchanged).

  The `NOW` test override and the malformed-date `500` path are unchanged. Note: when `day === "any"`, a bad `UNLOCK_TZ` no longer matters for the decision (no formatting happens), but the key/body checks still fail closed first.

- New exported handler for the config read:

  ```js
  export function unlockInfo(env) {
    const { day, tz } = windowConfig(env);
    return unlockJson(200, { v: 1, ok: true, day, tz }, "*");
  }
  ```

  It never reads `UNLOCK_KEY` and never returns a `key`. It is non-secret (the POST's own `423` body already reveals `day`/`tz` to allowed origins), so it is answered with wildcard CORS and no origin gate.

### 4.2 `checker/worker/src/index.js`

In the `/unlock` branch, before the existing method checks:

```js
if (url.pathname === "/unlock") {
  if (request.method === "OPTIONS") return unlockPreflight(request, env);
  if (request.method === "GET") return unlockInfo(env);
  if (request.method === "POST") return await handleUnlock(request, env);
  return json(404, { error: "not found" });
}
```

`/grade`, `/models`, and the wildcard-CORS defaults are untouched.

## 5. Checker changes

The `ReviewLog` note is raised in `checker/app/app.js` during `addAssignment`:

```js
const windowDay = win.day || "wednesday";
const windowTz  = win.tz  || "Asia/Manila";
const flagOutOfWindow = (ref, sub) => {
  const dow = weekdayInTz(sub && sub.submitted_at, windowTz);
  if (dow && dow !== windowDay) assignment.reviews.push({ … });
};
```

It keys off the lesson's `build.json > window` copied into the teacher key, so it cannot see the Worker's sentinel. The checker already knows the Worker URL (`state.setup.workerUrl`), so it can read the mode from `GET /unlock`.

### 5.1 Pure rule — `checker/app/lib/format.js`

Extract the decision so it is unit-testable and `app.js` stays thin:

```js
export function outsideWindowReason(windowDay, tz, submittedAt) {
  const day = String(windowDay || "").trim().toLowerCase();
  if (day === "any") return null;            // always-open → never a note
  const dow = weekdayInTz(submittedAt, tz);
  if (!dow || dow === day) return null;      // unknown time or in-window
  return `submitted outside window (getting ${dow})`;
}
```

### 5.2 `checker/app/app.js`

- State: add `unlockDay` to `state.setup` (default `null`).
- Init/boot: read the cached `localStorage.getItem("checker.unlockDay")` into `state.setup.unlockDay`, then call a new `loadUnlockWindow()`.
- `loadUnlockWindow()`: `GET ${workerUrl}/unlock`; on `{ok:true, day}`, store `state.setup.unlockDay = day` and persist it (`localStorage.setItem("checker.unlockDay", day)`; remove on a non-`any` day to keep it tidy). On any failure, keep the cached/`null` value. Best-effort, no user-facing error — the same posture as `loadModels()`'s builtin fallback.
- `flagOutOfWindow` becomes:

  ```js
  const flagOutOfWindow = (ref, sub) => {
    const day = state.setup.unlockDay === "any" ? "any" : windowDay;
    const reason = outsideWindowReason(day, windowTz, sub && sub.submitted_at);
    if (reason) assignment.reviews.push({ saN: "time", ref, ai: "", reason, final: "" });
  };
  ```

  With the Worker unreachable on first run, `unlockDay` is `null` → the lesson's own `windowDay` is used → existing behavior. Once a Worker fetch confirms `any`, the note is off. A stored `any` keeps it off offline.

- Call `loadUnlockWindow()` beside the existing `loadModels()` calls (initial boot and after saving setup).

## 6. Config reference

| Where | Name | Default | Meaning |
|---|---|---|---|
| Worker var | `UNLOCK_DAY` | `wednesday` | Weekday to release the key, or `any` to release every day |
| Worker var | `UNLOCK_TZ` | `Asia/Manila` | Window timezone (unused when `UNLOCK_DAY=any`) |
| Worker var | `APP_ORIGIN` | `https://assignz.web.app,https://assignz.firebaseapp.com` | Allowed request origins (always enforced) |
| Worker secret | `UNLOCK_KEY` | — | Universal AES key; unchanged |
| Checker local | `localStorage:"checker.unlockDay"` | absent | Cached effective day from `GET /unlock`; `"any"` suppresses the note |

## 7. Files touched

- `checker/worker/src/unlock.js` — `windowConfig`, `unlockInfo`, `any` skip in `handleUnlock`.
- `checker/worker/src/index.js` — route `GET /unlock`.
- `checker/worker/test/unlock.test.js` — `any` cases, `GET /unlock` config, update the old `GET /unlock → 404` assertion.
- `checker/worker/wrangler.toml` — commented `[vars] UNLOCK_DAY = "any"` example.
- `checker/worker/README.md` — sentinel, `GET /unlock`, enable step.
- `checker/app/lib/format.js` — `outsideWindowReason`.
- `checker/app/app.js` — `state.setup.unlockDay`, `loadUnlockWindow()`, `flagOutOfWindow` via the helper.
- `checker/app/test/format.test.js` — NEW (or extend an existing format test): in-window / out-of-window / `any` / unknown.
- `checker/app/README.md` — note suppression when the Worker is always-open.
- `v2/SKILL.md` — v2.9 note and config line: `UNLOCK_DAY=any` opens every day (origin still enforced).
- `v2/skeleton/components/assignment/README.md` — one line noting the deployment can be always-open.
- `README.md` — short version note.

No changes: `checker/app/viewer.html`, `checker/app/lib/unlock.js`, `v2/skeleton/components/assignment/component.js`, `decrypt.py`, `make_keys.py`, the submission envelope, the lesson body, and the legacy in-page gate.

## 8. Testing

- **Worker (`checker/worker/test/unlock.test.js`, `node --test`):**
  - `UNLOCK_DAY=any` + `NOW` on a Tuesday (allowed origin) → `200 {ok:true, key}`;
  - `UNLOCK_DAY=any` still `403` for a bad origin and still `500` for a missing/short key;
  - `GET /unlock` → `200 {v:1, ok:true, day, tz}` with the default and with `any`; the response contains **no** `key` field;
  - `GET /unlock` ignores `UNLOCK_KEY` validity (config is readable even when the key is unconfigured);
  - existing cases (Wednesday 200, non-Wednesday 423, custom day, malformed `NOW`, preflight) stay green; the previous "GET `/unlock` → 404" assertion is replaced.
- **Checker (`checker/app/test/*.js`, `node --test`):** `outsideWindowReason` returns `null` for `any`, for an in-window day, and for an unparseable/empty timestamp; returns the reason string for a real mismatch (case-insensitive day names).
- **Manual:** with `UNLOCK_DAY=any` deployed, open a lesson in `viewer.html` on a non-Wednesday → it unlocks; open it top-level/new-tab → still the viewer-link card (`403` origin path untouched); grade a submission submitted off-Wednesday → no `ReviewLog` time row; unset `UNLOCK_DAY` (or set `wednesday`) → Wednesday behaves as before and off-Wednesday shows the notice.

## 9. Rollout

1. `unlock.js` + `index.js` + worker tests (+ `wrangler.toml` example).
2. `lib/format.js` + `app.js` + checker test.
3. Docs sweep (worker README, app README, SKILL.md, component README, top-level README).
4. Operator step: set `UNLOCK_DAY=any` and `npx wrangler deploy` in `checker/worker`. Until then the default Wednesday gate is unchanged.

Each step lands green before the next.

## 10. Open questions

None. Decisions: an opt-in `UNLOCK_DAY=any` sentinel (default Wednesday); the origin and key checks remain authoritative and fail-closed; a non-secret `GET /unlock` reports the window so the checker can suppress its "outside window" note; the student viewer and the lesson component are untouched; the legacy in-page gate is out of scope.
