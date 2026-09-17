# Design — Interactive Lesson Notebook v2.5: labeled Activities + fullscreen encrypted Assignment

Date: 2026-09-17
Status: approved for planning
Owner: lesson-notebook-pipeline (v2 skill)

## Problem

Today the notebook ships one consolidated "Self-Check" section (7–12 true/false items)
whose behavior is live calibration: answers revealed item by item. The teacher needs:

1. An explicit **Activity** after each content section — a class-discussion check,
   distinct from assessment.
2. A graded **Assignment** that collects answers without ever showing correct ones,
   submits them as a file the teacher alone can read, and resists casual copying.

## Requirement summary (decisions made with the user)

- R1  Rename Self-Check → **Assignment**: 20 situational items — 10 multiple choice,
  4 true/false, 4 identification, 2 objective short answer (short question asking for a
  specific fact/reason from the lesson; no opinion essays).
- R2  Correct answers are never shown, never scored, never hinted in the student HTML.
- R3  Each content section's existing interactive component is labeled as an
  **Activity** ("class discussion"); no behavior change to those components.
- R4  One question per slide; `Next` disabled until the current question is answered;
  `Back` always allowed for review; progress readout + dots.
- R5  Assignment section hidden until the student presses the button that opens it
  **in fullscreen** (real Fullscreen API on Windows/Android; simulated fullscreen
  overlay on iOS — every iOS browser is WebKit and cannot element-fullscreen).
  Exit always available; re-entry resumes.
- R6  Anti-leak, best-effort and documented as such: selection/copy disabled inside
  the assignment (inputs remain typeable); diagonal watermark of `ID — Name` filled
  live; screenshot deterrence (PrintScreen blanking, blur/visibility triggers).
  Phone photos capture at most one question at a time (R4 helps here). No
  window-switch logging.
- R7  Submit requires the form fields (name as `Lastname, Firstname`; student ID of
  exactly 8 digits) and every question answered; missing items listed inline.
- R8  Submission downloads an **encrypted** `.json` file. Hybrid envelope: random
  AES-GCM session key encrypts the answers payload; the key+IV are wrapped with an
  RSA-OAEP public key. Decryption key(s) live only in the teacher's key file.
- R9  Filename: `Lastname, Firstname - Week N - Subject.json` (single space around the
  hyphens; characters sanitized for the filesystem).
- R10 Week number and Subject are baked into the HTML at build time as
  `<meta>` tags, sourced from `build.json` fields `week` and `subject`.
- R11 Where the CLI is run (e.g. `G:\...\FM102\Lessons and Question\`), the built
  `.html` lands in that root (existing v2.4 behavior) and the keys live in
  `build\key\` **inside that run directory**: a persistent teacher keypair
  `keys.pem` (generated once, reused) plus one `<name>-key.json` per build.
- R12 Mobile friendly throughout: touch-sized controls, keyboard/visualViewport
  handling, portrait and landscape.
- R13 No browser alerts; problems are reported in inline message boxes.

## Architecture

### 1. New component: `assignment`

Location: `v2/skeleton/components/assignment/` — `component.css`, `component.js`,
`README.md`, plus a registry row in `v2/skeleton/components/registry.md`.

Data schema (content only; no answer fields here):

```js
LN.data.assign7 = {
  intro: "",                      // optional one-line instruction
  items: [
    { type: "mc", prompt: "…", choices: ["a. …", "b. …", "c. …", "d. …"] },
    { type: "tf", prompt: "…" },
    { type: "id", prompt: "…" },   // one-line text input
    { type: "sa", prompt: "…" }    // 3–5 line textarea
  ]  // exactly 20; pattern 10 mc, 4 tf, 4 id, 2 sa, order shuffled by author
};
```

Behavior:

- Mount renders a section header card with the **"Begin Assignment"** button
  (`assignment` is in `build.json > components` like any other component).
- On open: fullscreen (R5). iOS fallback = fixed-position overlay covering the
  viewport with scroll lock; `visualViewport` listeners keep text inputs visible
  above the on-screen keyboard (R12).
- Slide engine: one `<fieldset>` per item; `Next` disabled until answered; `Back`;
  "Question n of 20" + dots; state survives exit/re-entry (in-memory).
- Watermark: repeated diagonal text of `ID — Name` under the slide content,
  `user-select: none`, pointer-events none.
- Deterrence hooks (R6): on PrintScreen keyup the deck blanks briefly; content
  hides while the window loses focus/visibility. Documented as non guarantees.
- Submit: validates name pattern (`,<space>` present), 8-digit ID, all answered;
  lists missing items inline; on success builds the plaintext payload, encrypts (§2),
  downloads the file (R9). Afterward the button reads "Submitted — download again".
- Print: hidden like other interactive components.
- Never renders: scoring, feedback, correct answers. Component JS stays content-free.

### 2. Encryption envelope (WebCrypto, no dependencies)

```
payload   = answers JSON (see §3)
aesKey    = random 256-bit, IV random 96-bit, AES-GCM
envelope  = { v: 1, enc: "RSA-OAEP-256+A256GCM",
              iv, ciphertext, wrappedKey: AES key encrypted with RSA-OAEP(teacherPub) }
file body = { title, subject, week, student, submitted_at, enc: envelope }
```

Constants versioned in the file body so `tools/decrypt.py` can evolve safely.

### 3. Answers payload (plaintext inside the envelope only)

```json
{
  "student": { "name": "Dela Cruz, Juan", "id": "20190001" },
  "answers": [
    { "q": 1,  "type": "mc", "prompt": "…", "choice": "b. …" },
    { "q": 11, "type": "tf", "prompt": "…", "answer": "true" },
    { "q": 15, "type": "id", "prompt": "…", "answer": "variable cost" },
    { "q": 19, "type": "sa", "prompt": "…", "answer": "…" }
  ]
}
```

Prompts ship inside the payload only (the teacher needs them there; a student
inspecting the HTML learns nothing beyond what the slides show while running).

### 4. Keys in the run directory (R11)

build.py, run from the CLI folder, manages `build/key/` next to the emitted `.html`:

- `build/key/keys.pem` — persistent RSA keypair; generated on first use, reused,
  so cross-week grading uses one key with one file layout.
- `build/key/<output-name>-key.json` — per build: item prompts in order, correct
  answers (`answers` for mc/tf), alias bank for `id` matching, `key_points` for
  `sa`, public-key id, instructions pointing at `tools/decrypt.py`.
- The RSA public key ships in the HTML (only the public half ever does).

### 5. build.py changes

- `__META__` marker in `v2/skeleton/shell.html`; build.py replaces it with
  `<meta name="week">` + `<meta name="subject">` from
  `build.json`. **New mechanical check:** `week` and `subject` present in build.json;
  build fails otherwise.
- Key generation/reuse under `build/key/`; public key embedded; private key never
  touched by components.
- Answer extraction: scan `parts/*.data.js` (or monolith) for the assignment key
  object; require `ans`/`aliases`/`key_points`; write `<output>-key.json` into
  `build/key/` (folder created as needed).
- Contract checks: when an `assignment` mount exists, exactly 20 items with the
  10/4/4/2 mix; unique keys; envelope constants present in the final HTML.

### 6. Skill contract changes (SKILL.md v2.5)

- Part 2: every content section's interactive element is labeled *Activity — class
  discussion* in the shipped section (shell wrapper renders the tag from
  `data-activity` on the mount or a `.tag` box convention); §7 becomes
  **Assignment** (20 situational items, 10/4/4/2, no reveal, submission behavior).
- Brief template: gains the rule "correct answers live only in data
  (`ans`/`aliases`/`key_points`); never in sections.html; no feedback strings";
  objective short-answer prompts name a specific fact/reason from the slice.
- QA (Part 5): adds "no answer material student-visible; 20 items present; mix
  correct; submission path unchanged since build".
- Part 6 principle 7 reworded: the assignment collects; it does not teach answers.

### 7. shell.html

- `__META__` marker in `<head>`.
- Fullscreen overlay + slide layout styles (theme tokens only, no hex).
- The `assignment` section wrapper hides its questions outside fullscreen.

## Sample

`v2/sample/lesson-demo/` gains an `assignment` part (20 items on break-even,
week/subject in build.json, 10/4/4/2) so `python build.py sample/lesson-demo`
continues to pass and exercises every new check end-to-end.

## Error handling

- build.py: week/subject missing → fail with fix hint; assignment data missing
  answers → fail listing the item numbers; keys.pem unreadable/corrupt → regenerate
  warning stops the build (never silently ship without encryption).
- Component: invalid ID/name → inline message; missing answers → item list;
  Fullscreen API rejection → simulated overlay (no dead button); download failure →
  inline retry note; crypto unavailable (ancient browser) → inline "update your
  browser" message, no plaintext export.
- decrypt.py: wrong key → clear error; unknown version → refuse with guidance.

## Testing

build.py unit tests (existing fixture style in `tests/`):
- meta injection present/absent; week/subject missing refuses build.
- keys.pem generate-then-reuse; `<name>-key.json` written into `build/key/`.
- Answer extraction incl. missing `ans` → fail.
- 20-item + mix contract; envelope constants present in assembled HTML;
  filename sanitization.

Round-trip: encrypt the sample payload with the same WebCrypto operations as the
component (via a headless run of the assembled sample or a Node/WebCrypto harness),
decrypt with `tools/decrypt.py`, assert equality.

Component QA on the built sample: nav lock, dots, exit/resume, watermark live fill,
copy block (selection disabled, inputs typeable), blanking pairs with blur, PDF
print hides the deck, inline errors replace alerts.

## Non-goals

- No window-switch/focus logging (dropped by request).
- No server/LMS integration; the file the student downloads is the submission.
- No guarantee against deliberate exfiltration (documented deterrence ceiling).
- No behavior change to activity components beyond the visible label.
