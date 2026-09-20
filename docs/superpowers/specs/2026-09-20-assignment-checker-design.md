# Assignment Checker — companion grader app (design spec)

Date: 2026-09-20 · Status: draft for review · Preview: `checker/preview.html` (mockup)

## 1. Context

The `interactive-lesson-notebook` skill (v2.5, `v2/`) ships collect-only
assignments: 20 items (10 mc · 4 tf · 4 id · 2 sa), answers stripped from the
student HTML, teacher key derived to `<run>/build/key/<stem>-key.json` with
`keys.pem`, submissions encrypted RSA-OAEP-256 + AES-GCM and decrypted with
`v2/tools/decrypt.py`. There is no teacher-side grader. This spec designs it:
a local-first web companion ("checker") plus a thin Cloudflare Worker proxy
to OpenCode Go for AI-assisted short-answer grading.

## 2. Goals / non-goals

Goals: (a) teacher works entirely in the browser, hosted static on Firebase
Hosting (Spark), with roster/key/submission data never leaving the machine;
(b) deterministic local auto-check for MC/TF/Identification (strict);
(c) rubric-based AI assist for short answers (SA) in batches of 10, always
teacher-reviewed; (d) multi-assignment loop accumulating into one new `.xlsx`
export; (e) scale to 50 students × 30–70 sections per assignment run.
Non-goals: no server-side persistence, no login, no writing back into the
uploaded `.xlsm`, no AI for non-SA types, no offline SA grading.

## 3. Architecture (approved: Worker + Go, key in browser)

- **Frontend — static SPA on Firebase Hosting (Spark plan, no card).**
  Single page, no framework (or bundled deps only so it stays openable
  offline). Parses roster `.xlsm` (SheetJS, client-side), reads `keys.pem` +
  `*-key.json` as text, decrypts submissions with WebCrypto (same envelope as
  `decrypt.py`: `RSA-OAEP-256+A256GCM`, base64 `wk`/`iv`/`ct`), scores
  locally, holds state in memory + IndexedDB. No fetch except to the Worker.
- **Worker — Cloudflare Workers (free tier).** One endpoint `POST /grade`
  plus `GET /models`. Holds NO secret. The teacher's Go API key is entered
  in the browser (memory by default, opt-in persist + Clear button) and
  forwarded per-request as `Authorization: Bearer …`. The Worker translates
  one normalized grading body to the correct Go upstream, adds CORS headers,
  queues (concurrency 2–3) with 429/backoff retry. Free tier covers the load
  (100k req/day vs ≤ ~700 calls per full 70-section assignment run).
- **LLM — OpenCode Go (`https://opencode.ai/zen/go/v1`), model changer.**
  Default `muse-spark-1.3-contributor` → `POST …/go/v1/responses`
  (Responses API). Switchable: `glm-5.3-flash` and `deepseek-v4.1-flash` →
  `POST …/go/v1/chat/completions`; `qwen3.8-flash` →
  `POST …/go/v1/messages` (Anthropic Messages). Catalog via
  `GET …/go/v1/models`. Cost reference (Go): Muse Spark 1.3 Contributor
  ≈ $0.10/$0.20 per 1M, GLM 5.3 Flash $0.15/$0.50 — cheapest per run.

## 4. Pipeline change (notebook skill, required)

`assignment` SA items gain per-item `rubric` (scoring criteria text) and
`max_points` in `data.js`, authored alongside `key_points`. Build strips all
three from the student HTML exactly like `ans`/`aliases`/`key_points` and
ships them into the teacher key file. **SA count is variable (2 or more per
assignment, not fixed at 2)** — key, Worker batching, review UI, and export
must all iterate `sa_items[]`, never hardcode two columns. `assignment_smoke.js`
and Part 5 QA gain a rubric-presence check.

## 5. App flow (approved)

1. **Setup:** paste Go key, pick model (default Muse Spark 1.3 Contributor).
2. **Roster:** upload one or more class `.xlsm` files → parse
   `Informations!B11:C…` (Student's Name + ID no., skip blanks), merge,
   tag by source file, report count/duplicates. (Verified against
   `Example for impementations/1. 2519C FM100.xlsm`: 15 names + IDs.)
3. **Per assignment:** upload `keys.pem` + `*-key.json` → upload that
   assignment's student `.json` files (multi-select / drag-drop / `.zip`) →
   decrypt in-browser (failures quarantined with reason) → join to roster:
   student-ID exact first, then firstname+lastname both-match fallback, else
   **Unmatched** list; roster-minus-submissions = **Missing**.
4. **Non-AI check:** MC = index exact; TF = normalized (`"true"/"false"`);
   Identification = strict normalized-exact vs `aliases` (lowercase →
   strip diacritics → drop punctuation → collapse whitespace; no
   plural/singular or typo forgiveness). Results table per student.
5. **Loop:** "Add another assignment?" → yes repeats step 3–4 with a new key.
   The SA gate stays locked until every loaded assignment finishes non-AI.
6. **SA gate (manual):** per assignment per SA question, answers grouped 10
   per Worker→Go call → suggested `{score, reason}` per student vs rubric →
   teacher edits scores → locks.
7. **Export:** one new `.xlsx` (SheetJS, client-side).

## 6. Worker API contract

- `POST /grade` req: `{model, question, rubric, maxPoints, answers:
  [{ref, text} × ≤10]}` + `Authorization: Bearer <teacher Go key>`.
  Res: `200 [{ref, score, reason}]`. `GET /models` → the 4 allowlisted IDs
  with their upstream paths. `OPTIONS` preflight handled; no key/answer
  logging; teacher key forwarded verbatim, never persisted worker-side.
- Client queue: concurrency 2–3, Go timeout ~60s + 1 retry, 429 honors
  `Retry-After` with jittered backoff, malformed AI JSON marks the batch as
  errored (teacher retries; never silent zeros).

## 7. Matching, export, scale, errors

- **Join:** student-ID exact → firstname+lastname fallback → Unmatched
  review list. Missing = roster − submissions. Both lists exportable.
- **Export sheets:** `Grades` (Name | ID | Section/File | per assignment:
  MC | TF | ID | SA1…SAn (dynamic) | Total | GrandTotal | Status) +
  `Unmatched` + `Missing` + `ReviewLog` (AI score → override per SA).
- **Scale math:** max 50 × 70 = 3,500 submissions/assignment; per SA
  question 350 batch calls max, so a 2-SA assignment peaks at ~700 Worker→Go
  calls — 140× under the Workers free daily cap. Prompt per call ≈ rubric +
  10 answers; prefer GLM/Qwen Flash for cheapest bulk runs.
- **Errors:** wrong-key decrypts, corrupt JSON, empty answers, over-size
  batches, Go 4xx/5xx, and timeout all surface per-row/per-batch with retry;
  nothing auto-locks without teacher action.
- **Privacy:** Firebase sees only static-asset fetches; Worker sees SA text
  in transit (required to grade) but stores nothing; Go-side retention
  follows the teacher's own Go plan. Prefer paid Go models over free-tier
  endpoints whose terms permit training on prompts.

## 8. Testing

Golden decrypt vector vs `decrypt.py`; strict-ID + join unit tests
(incl. fallback and unmatched); Worker translation tests for all three
upstream shapes; 10-batch e2e against mocked Go (incl. malformed JSON);
roster/export round-trip on the example `.xlsm`; preview click-through.

## 9. Folder layout (approved: two apps, minimal churn)

- `v2/` unchanged = App 1 (notebook skill; `opencode.json` skill path intact).
- `checker/` = App 2: `preview.html` (this mockup), `app/` (SPA),
  `worker/` (proxy), `tests/`, short README. Root demos untouched.

## 10. Rollout

Preview → spec review → `writing-plans` implementation plan → pipeline
rubric change first (unblocks real keys) → Worker → SPA → pilot on one
section → full 30–70-section runs.
