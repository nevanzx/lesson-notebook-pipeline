# Assignment Time Lock — Wednesday-window gate on the notebook + trusted submit timestamp

Date: 2026-09-24 · Status: draft for review

## 1. Context

The `interactive-lesson-notebook` skill (v2, `v2/`) ships a collect-only
assignment: 20 items (10 mc · 4 tf · 4 id · 2+ sa) in a fullscreen deck, or a
DAG scenario (v2.7). Answers are stripped from the student HTML, the teacher key
lives in `build/key/<stem>-key.json`, submissions are encrypted
RSA-OAEP-256 + AES-GCM, and the teacher decrypts with `v2/tools/decrypt.py` or
the local-first checker app (`checker/app`, hosted on Firebase at
`assignz.web.app`).

Request: **only allow the assignment to open during a Wednesday window**
(default `Asia/Manila`), using a **trusted internet clock rather than the
device clock**, so a student cannot open it by changing their system date. The
encrypted submission must carry the time it was generated, and the checker's
export must show a time column.

### 1.1 Accepted limitation (explicit non-goal)

A client-delivered HTML file cannot be made tamper-proof: its JS and any
embedded key are local text, and a student with DevTools and an AI can delete
the gate. This was discussed and accepted. The time lock is therefore a
**deterrent for the honest majority plus convenience**, not a security boundary.
The **trustworthy record** is the server-fetched timestamp baked into the
encrypted submission, which the student cannot forge without deliberately
removing the code.

## 2. Goals / non-goals

Goals:

- (a) The assignment **mount** refuses to open when the trusted current day is
  not the configured window day (`Wednesday` by default).
- (b) The decision uses a **trusted internet clock**, never `Date.now()`.
- (c) The gate **fails closed**: if trusted time cannot be obtained, the
  assignment stays locked with a clear message.
- (d) The window (day + timezone) is **settable during generation** in
  `build.json`, defaulting to Wednesday / `Asia/Manila` when omitted.
- (e) A student outside the window sees the window text and a live status line.
- (f) On submit, `submitted_at` is the **server-fetched time**, recorded with a
  source marker inside the encrypted payload.
- (g) The checker's Grades export gains a **`Time Submitted`** column; blank
  when the submission carries no timestamp.

Non-goals:

- No tamper-proofing of the HTML (see §1.1) — no obfuscation, no encrypted
  page, no key splitting.
- No server-side submission window / upload flow. The file stays
  browser-downloaded (local-first); the checker still joins files locally.
- No change to the crypto envelope, `decrypt.py`, `make_keys.py`, or the Worker.
- No gating of the lesson body — only the assignment.
- No score effect: window complicity is a review note, never an automatic 0.

## 3. Config (`build.json`)

New optional key `window`, allowed anywhere; meaningful when the `assignment`
component is mounted.

```json
{
  "title": "…", "theme": "…", "components": ["…", "assignment"],
  "output": "…", "week": 4, "subject": "…",
  "window": { "day": "wednesday", "tz": "Asia/Manila" }
}
```

- Absent → `{"day": "wednesday", "tz": "Asia/Manila"}` is used; the build emits
  the default meta tags, so existing lessons get Wednesday Manila with no
  `build.json` change.
- `day`: one of `monday tuesday wednesday thursday friday saturday sunday`
  (lowercase). `tz`: non-empty string; an IANA zone the time API accepts
  (`Asia/Manila` default, matching "wednesday manila/davao").
- `day` may be a single day only. (Multi-day windows are out of scope; rejected
  rather than silently mis-read.)
- Validation (`validate_window_cfg` in `build.py`), errors as `Err(...)` with
  fix hints, mirroring the `dag` config checks:
  - `window` present but not an object → error.
  - unknown keys in `window` (anything other than `day`, `tz`) → error.
  - `day` not one of the seven names → error.
  - `tz` not a non-empty string → error.
  - `window` present while `assignment` is not in `components` → error (never
    silently ignored).
- Injected into the HTML as meta tags beside `ln:week`/`ln:subject`:
  `<meta name="ln:window-day" content="wednesday">` and
  `<meta name="ln:window-tz" content="Asia/Manila">`, HTML-escaped.

## 4. Trusted time module (client)

A private helper inside the assignment component (`component.js`), not a
separate shipped library.

- `fetchTrustedNow(tz, cb)` → `GET https://worldtimeapi.org/api/timezone/<tz>`:
  - parses `{ datetime, day_of_week, unixtime }`;
  - returns `{ ok:true, iso, dow, unixtime }` where `dow` is the lowercase
    English weekday name;
  - returns `{ ok:false, reason }` on network error, non-2xx, malformed body, or
    missing `datetime`/`day_of_week`.
- Protocol: a runtime `fetch` from component JS. This is **not** a build-time
  external asset: `build.py` applies `EXTERNAL_RE` to component **CSS** and the
  shell/sections/data/theme/tune, but component JS is only checked for literal
  closing tags (`check_js`), so the API URL in `component.js` passes — the same
  path the checker's existing Worker usage takes.
  - `AbortController` timeout ~8 s; **one** retry on a network failure; no retry
    on 4xx/5xx.
- **Fails closed:** every failure path yields `ok:false`; the caller treats
  `ok:false` as "locked", never as "open".
- The device clock is **never** used for the gate decision or the submit
  timestamp. It may drive cosmetic animation only (not used in this design).
- If the URL scheme must also support `file://` browsing by the student: the
  fetch is same-origin-agnostic; `worldtimeapi.org` sends
  `Access-Control-Allow-Origin: *`, so `file://` works in current browsers. If a
  browser blocks it, the gate fails closed (locked) with the connectivity
  message — no silent unlock.

## 5. The gate (Begin card)

All of this lives in the assignment mount; the deck's slide logic is unchanged.

1. `init()` renders the Begin card in a **"Checking the time…"** state, Begin
   disabled.
2. `fetchTrustedNow(tz)` runs; `inWindow = (res.dow === windowDay)`.
3. **In window:** Begin enabled; the card shows
   "Open today ✓ — this assignment closes at 11:59 PM (Asia/Manila)."
4. **Out of window:** Begin stays disabled; the card shows a locked notice:
   - "This assignment opens **Wednesday, 12:00 AM – 11:59 PM** (Asia/Manila)."
   - live status: "Today is Tuesday, 10:42 PM — come back on Wednesday."
   - the status refreshes every 60 s (re-fetch).
5. **Cannot reach trusted time:** Begin disabled; the card shows
   "Cannot verify the time — connect to the internet, then reload this page."
6. **Watchdog:** while the deck is open, re-check every 60 s. If the window has
   ended (trusted day no longer the window day), force-close the deck through
   the existing Close/Esc path and show the out-of-window card. Answers already
   entered remain in memory so the student can resume next Wednesday.
7. **Click-time re-verify:** the Begin handler re-runs `fetchTrustedNow` before
   opening; a stale unlock (tab slept past midnight) cannot open the deck.
8. If `ln:window-day`/`ln:window-tz` meta are somehow absent (hand-edited file),
   the component falls back to `wednesday` / `Asia/Manila`, i.e. the safe
   default, and never to "open".

## 6. Authoritative submit timestamp

- In the Submit handler (flat **and** dag paths), before assembling the body,
  call `fetchTrustedNow(tz)`.
- Success → the body carries `submitted_at` = trusted ISO string and
  `submitted_time_source` = `"worldtimeapi.org"`.
- Failure → block the submit with the same "cannot verify the time" error;
  nothing is exported. **No device-clock fallback** (consistent fail-closed).
- The existing envelope (`_export`: `title/subject/week/student/submitted_at/
  key_id/enc`) is unchanged; the two fields ride inside the encrypted
  plaintext, so only the teacher (holder of the private key) can read them.
- `decrypt.py` needs no change: it prints the whole decrypted object, so
  `submitted_time_source` appears automatically.

## 7. Checker (`checker/app`)

- `decrypt.js`: no crypto change; the decrypted body already flows through.
- `app.js`: on each matched / unmatched submission, carry
  `sub.submitted_at` (and `sub.submitted_time_source`) onto the row object
  (`assignment.scored` / `assignment.unmatchedScored`).
- `export-book.js`: add a **`Time Submitted`** column to the **Grades** sheet,
  placed after the per-assignment score groups and before `Status`.
  - Value = the submission's `submitted_at` (ISO string, as recorded).
  - A submission without a timestamp (older builds) leaves the cell **blank** —
    never guessed or filled from any other clock.
  - `Unmatched`/`Missing` sheets are unchanged; if an unmatched submission has a
    time, it flows into its Grades row like the matched rows.
- `app.js` — optional `ReviewLog` note: when `submitted_at`'s weekday (parsed
  from the ISO string in `tz`) is not the configured window day, push a review
  row `{saN: "time", reason: "submitted outside window (…)"}`. Display-only; it
  changes no score. If parsing fails, no row is added (blank-tolerant).

## 8. Files touched

- `v2/build.py` — `validate_window_cfg`; `window` added to allowed build.json
  keys; meta injection (`ln:window-day`, `ln:window-tz`) with the default when
  `assignment` is mounted.
- `v2/skeleton/components/assignment/component.js` — time module, gate on the
  Begin card, watchdog, click-time re-verify, trusted submit timestamp (flat +
  dag).
- `v2/skeleton/components/assignment/component.css` — `.lna-lock*` styles
  (locked card, status line), tokens only.
- `v2/skeleton/components/assignment/README.md` — gate + timestamp docs and the
  fail-closed invariant.
- `v2/skeleton/components/registry.md` — assignment row notes the optional
  `window` config.
- `v2/SKILL.md` — short v2.8 note + the `window` config line in the inputs
  table.
- `v2/tools/assignment_smoke.js` — stub `fetch`; assert in-window unlock,
  out-of-window lock, API-failure lock, submit timestamp shape; keep flat/dag
  walks green.
- `checker/app/app.js`, `checker/app/lib/export-book.js`,
  `checker/app/test/export-book.test.js` — timestamp column + review note.
- `tests/test_assignment_window.py` — NEW: `window` config validation + meta
  injection.
- `README.md` — version note.

No changes: `decrypt.py`, `make_keys.py`, the Worker, the DAG/scoring logic,
`sample/lesson-demo` (gains no `window`, exercising the default).

## 9. Testing

- **pytest (`tests/test_assignment_window.py`):**
  - absent `window` + `assignment` → build OK, default meta tags present;
  - valid custom `window` → meta tags carry the custom day/tz;
  - `window` with bad `day`, empty `tz`, non-object, unknown key → FAIL with a
    clear message;
  - `window` present without the `assignment` component → FAIL;
  - all pre-existing tests stay green (default is backward compatible).
- **Smoke (`node tools/assignment_smoke.js`):** a sandboxed `fetch` stub returns
  a controllable `day_of_week`.
  - in-window → Begin enabled, quiz opens;
  - out-of-window → Begin disabled, locked card text present;
  - fetch rejects → Begin disabled, connectivity message present;
  - submit captures `submitted_at` + `submitted_time_source`;
  - the existing flat and dag walks still print SMOKE OK.
- **Checker unit (`checker/app/test/export-book.test.js`):** `Time Submitted`
  header present at the expected index; a row with a timestamp shows it, a row
  without shows blank.
- **Manual:** build `sample/lesson-demo`, open offline → locked with the
  connectivity message; open online on a non-Wednesday → locked with the status
  line; overriding the device clock to Wednesday does not unlock.

## 10. Rollout

1. `build.py` config validation + meta injection + pytest.
2. `component.js` time module + gate + submit timestamp + smoke (+ CSS).
3. Checker timestamp column + ReviewLog note + unit test.
4. README / SKILL.md / registry / component README doc sweep.

Each step lands green before the next.

## 11. Open questions

None. Reviewed through design sections 1–6; decisions: gate on the Begin card,
fail closed, `window` configurable per build defaulting to Wednesday Manila,
trusted submit timestamp in the encrypted payload, `Time Submitted` column
blank when unknown.
