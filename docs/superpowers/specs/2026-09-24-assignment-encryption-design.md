# Assignment Encryption — ciphertext at rest + app-only unlock via the Worker

Date: 2026-09-24 · Status: draft for review

## 1. Context

The `interactive-lesson-notebook` skill (v2, `v2/`) ships a collect-only
assignment inside one self-contained lesson `.html`: the questions live in
`LN.data.<key>` (answers already stripped), the deck is gated by an in-page
Wednesday window (`worldtimeapi.org`), and submissions are RSA-encrypted to the
teacher (v2.8, `docs/superpowers/specs/2026-09-24-assignment-time-lock-design.md`).

That gate only *hides* the questions behind JS an AI can ignore; the prompt text
sits in the file in plain sight. Request: **the assignment questions must be
ciphertext in the shipped file**, and **only the official HTML Viewer app may
decrypt them, and only on Wednesdays (Asia/Manila)** — so a student who opens the
lesson in a browser, another viewer app, or feeds the file to an AI gets nothing,
before or after Wednesday.

The HTML Viewer (`checker/app/viewer.html`, public on Firebase) and the
Cloudflare Worker (`checker/worker`, `checker-grade.aclc-obero.workers.dev`) are
the app pieces. The Worker is where the key can live off the client.

## 2. Goals / non-goals

Goals:

- (a) The assignment questions are **AES-256-GCM ciphertext** in the built
  lesson; no question text, choices, prompt, scenario, outcome, or answer is
  recoverable from the file alone.
- (b) The universal key is **never present in any file the student can fetch**
  (not the lesson, not `viewer.html`); it lives only as a Worker secret.
- (c) The Worker releases the key **only when its own server clock says
  Wednesday** in the configured timezone (default `Asia/Manila`) **and** the
  request `Origin` is the app — both conditions.
- (d) The lesson decrypts and renders **only** inside the viewer's iframe
  channel; a top-level/new-tab/other-viewer open shows the locked card.
- (e) The locked card tells the student to open the assignment in the HTML
  Viewer, with the link.
- (f) Everything is automatic for any build that mounts the assignment; one
  universal key for all lessons.
- (g) Failure is fail-closed: no key → no decryption → no questions.

Non-goals:

- No tamper-proofing of the HTML and no guarantee against copying once shown.
  See §3.
- No change to the submission envelope, `decrypt.py`, `make_keys.py`, or the
  teacher-key flow.
- No gating of the lesson body — the notebook reads fully anywhere; only the
  assignment is affected.
- No per-lesson keys, no key rotation workflow, no scoring change.

## 3. Threat model & accepted limitations

- **Blocked:** reading the questions from the file (at rest or by an AI);
  opening the assignment in a plain browser, a competing viewer, a new tab, or
  any page not served from the app origin; obtaining the key before Wednesday
  through the app.
- **Accepted (explicit):** a determined student can, *on Wednesday while the app
  hands the key to their browser*, capture the key and reuse it on later days
  and for every lesson. This is inherent to delivering content a browser must
  display — equivalent to copying the questions once shown. It is a deterrent
  with a real barrier for the file/AI and off-Wednesday cases, not a wall.
- The `Origin` header is not a cryptographic auth: a student can forge it with
  `curl` on a Wednesday. This is the same class as the accepted limitation.
- The Worker previously held no secret by design; this feature adds exactly one
  (`UNLOCK_KEY`). Documented as an intentional invariant change.

## 4. Build-time encryption

`v2/build.py`, in `assemble()`, after `sanitize_assignment_data` produces the
student-safe object:

- Encrypt the **sanitized** object (never the answer-bearing original):

  ```python
  # stdlib + the cryptography package already required for assignment builds
  from cryptography.hazmat.primitives.ciphers.aead import AESGCM
  import os, base64, json
  iv = os.urandom(12)
  pt = json.dumps(safe_obj, ensure_ascii=False).encode("utf-8")
  ct = AESGCM(key_bytes).encrypt(iv, pt, None)   # ciphertext || GCM tag
  envelope = {"lnenc": 1, "v": 1,
              "iv": base64.b64encode(iv).decode("ascii"),
              "ct": base64.b64encode(ct).decode("ascii")}
  ```

- The new `LN.data.<key>` value replaces the sanitized object: an opaque
  `{lnenc, v, iv, ct}`. No other data.js keys are touched.
- New helper `encrypt_assignment_data(data_text, key, key_bytes)` (`key_bytes`
  being the 32 raw bytes from `ensure_unlock_key`, §5) locates
  `LN.data.<key> = {...}` with the existing balanced-brace scan, re-parses the
  sanitized object, encrypts it, and rewrites the span as `json.dumps(envelope)`.
  (Reusing the already-sanitized text keeps `sanitize_assignment_data`'s
  signature and its direct-call tests unchanged.)
- Trigger: present whenever the assignment is mounted — no `build.json` key.
- A fresh random IV per build means two builds of the same lesson differ; this
  is expected and harmless (the file is not diff-reviewed for byte equality).
- The `hex`, `external`, `markers`, `wellformed`, and `check_js` scans are
  unaffected: base64 carries no `#`, `http`, `@import`, `<`, or marker tokens.

## 5. Universal key management

- One 32-byte key. `ensure_unlock_key(key_dir)` in `build.py`:
  - `LN_UNLOCK_KEY` env (base64) wins if set;
  - else `build/key/unlock.key` (gitignored — `build/` is already ignored) if
    present;
  - else generate `os.urandom(32)`, write the base64 to `build/key/unlock.key`,
    and print a loud warning: *set this same value as the Worker secret
    `UNLOCK_KEY`; losing it orphans existing lessons.*
  - Validate the decoded length is exactly 32 bytes; a damaged file is a hard
    `Err` (mirroring `ensure_teacher_keys`).
- Returns `(key_bytes, key_b64)` so the caller encrypts with the raw bytes and
  can report the base64 for the Worker secret.
- Called in `assemble()` inside the existing `if "assignment" in cfg["components"]`
  block, alongside `ensure_teacher_keys`.
- Deployment: the same base64 value is set once via
  `npx wrangler secret put UNLOCK_KEY` in `checker/worker`. This is the only
  copy of the key and it never ships to a client.

## 6. Worker `/unlock`

`checker/worker/src/unlock.js` (new, pure helpers) wired into `src/index.js`:

- `POST /unlock`, JSON body `{"v":1}`.
- Env: `UNLOCK_KEY` (base64, required), `APP_ORIGIN` (default
  `https://assignz.web.app,https://assignz.firebaseapp.com`; comma-separated),
  `UNLOCK_TZ` (default `Asia/Manila`), `UNLOCK_DAY` (default `wednesday`).
- Checks, in order:
  1. **Origin allowed** — request `Origin` is in `APP_ORIGIN`; else `403`
     `{ok:false, reason:"forbidden"}`.
  2. **Secret configured** — `UNLOCK_KEY` present and 32 bytes; else `500`
     `{ok:false, reason:"unconfigured"}` (fail closed).
  3. **Wednesday now** — server clock, not any client value:
     `new Intl.DateTimeFormat("en-US",{timeZone:UNLOCK_TZ,weekday:"long"})
     .format(now).toLowerCase() === UNLOCK_DAY`; else `423`
     `{ok:false, reason:"out-of-window", day, tz}`.
  4. Else `200` `{ok:true, key:"<base64>"}`.
- CORS: `/unlock` echoes the caller origin (`access-control-allow-origin`) only
  when allowed, and its `OPTIONS` preflight returns the same; `/grade` and
  `/models` keep `*`.
- Testability: an env `NOW` (ISO string) overrides `new Date()` for tests; all
  logic lives in pure functions (`isAllowedOrigin`, `weekdayInTz`,
  `handleUnlock`) unit-tested directly.
- The handler comment "no secrets from env by design" is updated to note the
  single unlock secret.

## 7. Viewer unlock relay

`checker/app/viewer.html` gains the unlock channel; `checker/app/lib/unlock.js`
(new, testable) holds the logic.

- `WORKER_URL` constant (same value as `app.js`: `https://checker-grade.aclc-
  obero.workers.dev`).
- On `message` from `stage.contentWindow` (verified by source) with
  `{type:"ln-unlock-request", v:1}`: `POST ${WORKER_URL}/unlock`; relay
  `{type:"ln-unlock-response", v:1, ok:true, key}` or
  `{type:"ln-unlock-response", v:1, ok:false, reason}` back to the iframe.
- Network/HTTP failure → `{ok:false, reason:"network"}`.
- No visible UI change; the existing "Open in new tab ↗" stays and a lesson
  opened that way has no parent channel, so it shows the locked card — which is
  intended (the card carries the viewer link).
- Viewer served from Firebase (`checker/app`), origin matches `APP_ORIGIN`.

## 8. Assignment component unlock path

`v2/skeleton/components/assignment/component.js`:

- `init(root, d)` becomes a dispatcher: if `d && d.lnenc === 1` →
  `unlockThenInit(root, d)`, else the current body (renamed `render(root, d,
  opts)` with `opts` defaulting to today's behavior). Legacy/plaintext builds
  keep working unchanged.
- `render` gains one option, `opts.gateBypass`: when true it seeds the gate as
  already satisfied (Begin enabled) and **skips** the in-page `checkGate` and
  the 60 s worldtimeapi watchdog. This is required: the Worker already gated the
  open, so a worldtimeapi outage must not re-lock a Worker-unlocked deck. The
  submit path still calls `withTrustedTime` for `submitted_at`, unchanged.
- `unlockThenInit`:
  1. Build the same Begin card with a status line, Begin disabled.
  2. If `window.parent === window` (top-level/new-tab/no embed) → render the
     locked card (`.lna-lock-link`): *"This assignment opens only in the HTML
     Viewer — `https://assignz.web.app/viewer.html`."* Stop.
  3. Else post `{type:"ln-unlock-request", v:1}` to `window.parent`; arm a 10 s
     timeout.
  4. On `{type:"ln-unlock-response", v:1}`:
     - `ok:true` → import the returned key (`crypto.subtle.importKey("raw", …,
       "AES-GCM", false, ["decrypt"])`), decrypt `d.ct` with `d.iv`, parse the
       JSON, then `render(root, plaintext, {gateBypass: true})`.
     - `ok:false, reason:"out-of-window"` → a locked card (`.lna-lock-shut`)
       with the same wording as the in-page Wednesday notice: *"This assignment
       opens Wednesday, 12:00 AM – 11:59 PM (Asia/Manila)."*
     - anything else / timeout / no reply → the viewer-link locked card.
- `VIEWER_URL` is a constant in the component (app-wide, not per-lesson).

## 9. Config reference

| Where | Name | Default | Meaning |
|---|---|---|---|
| local build | `build/key/unlock.key` | auto-generated | universal key (base64) |
| local build | `LN_UNLOCK_KEY` env | — | overrides the key file |
| Worker secret | `UNLOCK_KEY` | — | must equal the build key; required |
| Worker env | `APP_ORIGIN` | `https://assignz.web.app,https://assignz.firebaseapp.com` | allowed request origins |
| Worker env | `UNLOCK_TZ` | `Asia/Manila` | window timezone |
| Worker env | `UNLOCK_DAY` | `wednesday` | window day |

The per-lesson `window` in `build.json` (v2.8) still governs the lesson's own
standalone gate and message text; the Worker is the authority for key release
and uses its own universal Wednesday/Manila, so a lesson built for another day
still only unlocks on Wednesday inside the app.

## 10. Files touched

- `v2/build.py` — `ensure_unlock_key`, `encrypt_assignment_data`; call site in
  `assemble()`; version note.
- `v2/skeleton/components/assignment/component.js` — `init` dispatcher,
  `unlockThenInit`, viewer-link card, `VIEWER_URL`.
- `v2/skeleton/components/assignment/component.css` — `.lna-lock-link` viewer-link
  card styles (tokens only; `.lna-lock-shut` already exists).
- `v2/skeleton/components/assignment/README.md` — the unlock path + fail-closed
  invariant.
- `v2/skeleton/components/registry.md`, `v2/SKILL.md` (v2.9 note), `README.md`.
- `checker/worker/src/unlock.js` (new), `checker/worker/src/index.js`,
  `checker/worker/README.md`.
- `checker/worker/test/unlock.test.js` (new).
- `checker/app/lib/unlock.js` (new), `checker/app/viewer.html`,
  `checker/app/README.md`.
- `checker/app/test/unlock.test.js` (new).
- `v2/tools/assignment_smoke.js` — encrypted-path checks.
- `tests/test_assignment_encryption.py` (new); audit tests that mount the
  assignment through `build.assemble` and update any that assert plaintext
  items survive (e.g. `test_assignment_deck.py`, e2e builds).

No changes: `decrypt.py`, `make_keys.py`, submission envelope, DAG/scoring,
teacher app.

## 11. Testing

- **pytest (`tests/test_assignment_encryption.py`):**
  - a built assignment lesson's `LN.data.<key>` is an `{lnenc:1, iv, ct}`
    envelope and contains **none** of the prompts, choices, scenario, outcome,
    or any `ans`/`aliases`/`key_points` text;
  - decrypting the envelope with the build key reproduces the sanitized object;
  - a missing key file is created once and reused on the next build;
  - `LN_UNLOCK_KEY` env is honoured; a damaged key file fails the build.
  - Existing suite stays green after the audit; `sanitize_assignment_data`
    direct-call tests (`test_assignment_contract.py`, `test_assignment_dag.py`)
    are unchanged.
- **Worker (`checker/worker/test/unlock.test.js`):** allowed origin + Wednesday
  → 200 key; allowed origin + non-Wednesday (via `NOW`) → 423 out-of-window;
  wrong/missing origin → 403; missing `UNLOCK_KEY` → 500; preflight echoes the
  allowed origin; `/grade` and `/models` CORS unchanged.
- **Viewer (`checker/app/test/unlock.test.js`):** a request from the iframe is
  forwarded to `/unlock` and the reply relayed; a message from another source is
  ignored; a fetch failure relays `{ok:false, reason:"network"}`.
- **Smoke (`node v2/tools/assignment_smoke.js`):** a stubbed `window.parent`
  answers the unlock request with a key →
  the deck renders and the existing flat/dag walks still pass; no parent →
  viewer-link card; parent replies out-of-window → Wednesday notice; bad key /
  no reply → locked card. The legacy plaintext walk stays green.
- **Manual:** build a lesson, open the file in a desktop browser → lesson reads,
  assignment shows the viewer-link card; open it in `viewer.html` on a
  Wednesday → assignment decrypts and works; on a non-Wednesday → Wednesday
  notice; save the file and feed it to an AI → no question text present.

## 12. Rollout

1. `build.py` key + encryption + pytest.
2. Component unlock path + CSS + smoke.
3. Worker `/unlock` + secret + tests.
4. Viewer relay + tests.
5. Docs sweep (SKILL/README/registry/worker README/viewer README) and version
   bump to v2.9.

Each step lands green before the next. Step 3 requires the operator to run
`wrangler secret put UNLOCK_KEY` with the value from `build/key/unlock.key`
before the app can unlock (until then the Worker fails closed).

## 13. Open questions

None. Decisions: ciphertext at rest; one universal key as a Worker secret; the
Worker releases the key on Wednesday Asia/Manila to the app origin only (both
conditions); the lesson decrypts only via the viewer's iframe channel;
out-of-app opens show the viewer-link card; automatic for every assignment
build; copying-while-shown is an accepted limitation.
