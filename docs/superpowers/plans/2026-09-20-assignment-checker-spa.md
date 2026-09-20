# Assignment Checker — Plan 3: Checker SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local-first static grading app: roster ingest, in-browser decrypt, deterministic non-AI scoring, manual SA batch review via the Plan 2 Worker, and one-click `.xlsx` export — no build step, no backend, no student data leaving the browser.

**Architecture:** Pure-logic ES modules in `checker/app/lib/` (fully unit-tested in Node, zero DOM imports) plus a thin DOM shell (`index.html` + `app.js`, syntax-checked + manually walked). SheetJS loads from a pinned CDN script tag; all parsing/generation logic consumes plain arrays so tests never need the network. Crypto uses WebCrypto (available in both browser and Node 18+).

**Tech Stack:** Static HTML + ES modules, SheetJS 0.20.3 via CDN (`https://unpkg.com/xlsx@0.20.3/dist/xlsx.full.min.js`), WebCrypto, `node:test` + `node:assert/strict`, Firebase Hosting config (`firebase.json` at repo root).

## Global Constraints

- No build step: `checker/app/` ships raw `.html`/`.js`; `checker/app/package.json` exists ONLY as `{"type":"module"}` so Node treats `lib/*.js` as ESM (no dependencies).
- `lib/` modules import nothing DOM- or network-specific (pure functions + WebCrypto); SheetJS is touched ONLY in `lib/sheets-io.js` behind array-based seams.
- Key file field is snake_case `max_points` (Plan 1); Worker payload field is camelCase `maxPoints` (Plan 2) — map at the batch boundary, never rename elsewhere.
- Identification matching is strict: `normalize()` then exact equality vs `aliases` (no plural/typo forgiveness).
- Roster join order: student-ID exact → normalized full-name fallback → Unmatched; Missing = roster − submissions.
- SA gate unlocks only after every loaded assignment's non-AI scoring is done; nothing auto-locks without teacher action.
- Teacher Go key lives in memory by default (opt-in `localStorage`, Clear button); sent as `Authorization: Bearer` per Worker call.

---

### Task 1: Grading primitives (`lib/format.js`)

**Files:**
- Create: `checker/app/package.json` (`{"type":"module"}` — exact, nothing else)
- Create: `checker/app/lib/format.js`
- Create: `checker/app/test/format.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalize(s)`, `idMatch(answer, aliases)`, `tfCorrect(answer, key)`, `mcCorrect(answer, ans)` for Tasks 4–5.

- [ ] **Step 1: Write `package.json`**

```json
{
  "type": "module"
}
```

- [ ] **Step 2: Write the failing test `test/format.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { normalize, idMatch, tfCorrect, mcCorrect } from "../lib/format.js";

test("normalize folds case, diacritics, punctuation, spacing", () => {
  assert.equal(normalize("  Break-EVEN  Point! "), "break even point");
  assert.equal(normalize("José–María …"), "jose maria");
  assert.equal(normalize("ALBARACIN,  JOZEL ANN N."), "albaracin jozel ann n");
});

test("idMatch is strict exact-after-normalize", () => {
  assert.equal(idMatch("Variable Cost", ["variable cost"]), true);
  assert.equal(idMatch("variable  costs", ["variable cost"]), false);
  assert.equal(idMatch("varible cost", ["variable cost"]), false);
  assert.equal(idMatch("x", ["a", "X "]), true);
});

test("tfCorrect compares true/false strings", () => {
  assert.equal(tfCorrect("true", true), true);
  assert.equal(tfCorrect("false", false), true);
  assert.equal(tfCorrect("true", false), false);
  assert.equal(tfCorrect(" True ", true), true);
});

test("mcCorrect compares index", () => {
  assert.equal(mcCorrect(2, 2), true);
  assert.equal(mcCorrect(1, 2), false);
});
```

- [ ] **Step 3: Run to verify failure**

Run from `checker/app`: `node --test test/format.test.js`
Expected: FAIL with `Cannot find module '../lib/format.js'`.

- [ ] **Step 4: Write `lib/format.js`**

```js
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function idMatch(answer, aliases) {
  const n = normalize(answer);
  return (aliases || []).some((a) => normalize(a) === n);
}

export function tfCorrect(answer, key) {
  return String(answer).trim().toLowerCase() === String(key).toLowerCase();
}

export function mcCorrect(answer, ans) {
  return answer === ans;
}
```

(NOTE: the diacritics class is the literal range U+0300–U+036F.)

- [ ] **Step 5: Run to verify pass**

Run from `checker/app`: `node --test test/*.test.js`
Expected: PASS (4/4).

- [ ] **Step 6: Commit**

```bash
git add checker/app/package.json checker/app/lib/format.js checker/app/test/format.test.js
git commit -m "feat(checker): strict grading primitives"
```

### Task 2: Submission decrypt (`lib/decrypt.js`)

**Files:**
- Create: `checker/app/lib/decrypt.js`
- Create: `checker/app/test/decrypt.test.js`

**Interfaces:**
- Consumes: Task 1 (nothing imported; standalone).
- Produces: `decryptSubmission(pemText, fileJson)` → payload object with bool answers normalized to `"true"`/`"false"`; throws `Error("unknown-envelope")` / `Error("decrypt-failed")`. Task 4 imports it.

- [ ] **Step 1: Write the failing test `test/decrypt.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { decryptSubmission, __testOnly } from "../lib/decrypt.js";

function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function makeKeys() {
  const kp = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["encrypt", "decrypt"]);
  const pubDer = await crypto.subtle.exportKey("spki", kp.publicKey);
  const privDer = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const pubB64 = b64(new Uint8Array(pubDer));
  const privPem = "-----BEGIN PRIVATE KEY-----\n" +
    b64(new Uint8Array(privDer)).match(/.{1,64}/g).join("\n") +
    "\n-----END PRIVATE KEY-----\n";
  return { kp, pubB64, privPem };
}

async function encLikeBrowser(pubB64, payloadBytes) {
  const pubDer = Uint8Array.from(Buffer.from(pubB64, "base64"));
  const pub = await crypto.subtle.importKey("spki", pubDer,
    { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, payloadBytes));
  const wk = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, raw));
  return { enc: { k: "RSA-OAEP-256+A256GCM", iv: b64(iv), ct: b64(ct), wk: b64(wk) } };
}

test("roundtrip decrypts and normalizes tf booleans", async () => {
  const { pubB64, privPem } = await makeKeys();
  const payload = Buffer.from(JSON.stringify({
    answers: [{ q: 1, type: "tf", prompt: "p", answer: true },
              { q: 2, type: "mc", prompt: "q", answer: 2 }],
  }));
  const file = await encLikeBrowser(pubB64, payload);
  const out = await decryptSubmission(privPem, file);
  assert.equal(out.answers[0].answer, "true");
  assert.equal(out.answers[1].answer, 2);
});

test("unknown envelope and wrong key throw", async () => {
  const { pubB64, privPem } = await makeKeys();
  await assert.rejects(decryptSubmission(privPem, { enc: { k: "nope" } }), /unknown-envelope/);
  const file = await encLikeBrowser(pubB64, Buffer.from("{}"));
  const other = await makeKeys();
  await assert.rejects(decryptSubmission(other.privPem, file), /decrypt-failed/);
});

test("pem block extractor finds private block", () => {
  const pem = "junk\n-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----\nmore";
  assert.equal(__testOnly.extractBlock(pem, "PRIVATE KEY"), "QUJD");
});
```

- [ ] **Step 2: Run to verify failure**

Run from `checker/app`: `node --test test/decrypt.test.js`
Expected: FAIL with `Cannot find module '../lib/decrypt.js'`.

- [ ] **Step 3: Write `lib/decrypt.js`**

```js
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function extractBlock(pemText, label) {
  const m = pemText.match(
    new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`));
  if (!m) throw new Error("missing-pem-block");
  return m[1].replace(/\s+/g, "");
}

async function importPrivateKey(pemText) {
  const der = b64ToBytes(extractBlock(pemText, "PRIVATE KEY"));
  return crypto.subtle.importKey("pkcs8", der,
    { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
}

export async function decryptSubmission(pemText, fileJson) {
  const enc = (fileJson && fileJson.enc) || {};
  if (enc.k !== "RSA-OAEP-256+A256GCM") {
    throw new Error("unknown-envelope");
  }
  try {
    const priv = await importPrivateKey(pemText);
    const raw = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" }, priv, b64ToBytes(enc.wk));
    const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(enc.iv) }, aes, b64ToBytes(enc.ct));
    const out = JSON.parse(new TextDecoder().decode(plain));
    for (const a of out.answers || []) {
      if (typeof a.answer === "boolean") a.answer = a.answer ? "true" : "false";
    }
    return out;
  } catch (e) {
    if (e && (e.message === "unknown-envelope" || e.message === "missing-pem-block")) throw e;
    throw new Error("decrypt-failed");
  }
}

export const __testOnly = { extractBlock };
```

- [ ] **Step 4: Run to verify pass**

Run from `checker/app`: `node --test test/*.test.js`
Expected: PASS (4 + 3 = 7).

- [ ] **Step 5: Commit**

```bash
git add checker/app/lib/decrypt.js checker/app/test/decrypt.test.js
git commit -m "feat(checker): WebCrypto submission decrypt"
```

### Task 3: Roster parse + join (`lib/roster.js`)

**Files:**
- Create: `checker/app/lib/roster.js`
- Create: `checker/app/test/roster.test.js`

**Interfaces:**
- Consumes: Task 1 `normalize`.
- Produces: `parseRosterSheet(rows, source)` → `[{name, id, source}]`; `mergeRosters(lists)` → deduped array; `joinSubmissions(roster, submissions)` → `{matched: [{roster, sub}], unmatched: [sub], missing: [roster]}`. Task 4 imports all three. `submissions` items look like `{file, student: {name, id}, answers}`.

- [ ] **Step 1: Write the failing test `test/roster.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseRosterSheet, mergeRosters, joinSubmissions } from "../lib/roster.js";

const sheet = [
  ["No.", "Student's Name", "ID no."],
  ["1", "ALBARACIN, JOZEL ANN N.", "20262417"],
  ["2", "BUNSO, RAYMOND E.", "20261577"],
  ["3", "", ""],
];

test("parses Informations-style sheet, skips blanks", () => {
  const out = parseRosterSheet(sheet, "f.xlsm");
  assert.deepEqual(out, [
    { name: "ALBARACIN, JOZEL ANN N.", id: "20262417", source: "f.xlsm" },
    { name: "BUNSO, RAYMOND E.", id: "20261577", source: "f.xlsm" },
  ]);
});

test("finds header even with title rows above", () => {
  const rows = [["ST. JOHN PAUL"], [], ["No.", "Student's Name", "ID no."],
    ["1", "CUPAT, MARY JOSH E.", 20262373]];
  const out = parseRosterSheet(rows, "g.xlsm");
  assert.equal(out[0].id, "20262373");
});

test("mergeRosters dedupes by id then name", () => {
  const a = [{ name: "N1", id: "1", source: "a" }];
  const b = [{ name: "N1", id: "1", source: "b" }, { name: "N2", id: "2", source: "b" }];
  assert.equal(mergeRosters([a, b]).length, 2);
});

test("join prefers id, falls back to name, else unmatched", () => {
  const roster = [
    { name: "ALBARACIN, JOZEL ANN N.", id: "20262417", source: "f" },
    { name: "BUNSO, RAYMOND E.", id: "20261577", source: "f" },
    { name: "GHOST, GARY G.", id: "999", source: "f" },
  ];
  const subs = [
    { file: "a.json", student: { name: "Albaracin, Jozel Ann N.", id: "20262417" }, answers: [] },
    { file: "b.json", student: { name: "BUNSO, RAYMOND E.", id: "WRONG" }, answers: [] },
    { file: "c.json", student: { name: "Nobody Here", id: "000" }, answers: [] },
  ];
  const { matched, unmatched, missing } = joinSubmissions(roster, subs);
  assert.equal(matched.length, 2);
  assert.equal(matched[1].roster.id, "20261577");
  assert.deepEqual(unmatched.map((s) => s.file), ["c.json"]);
  assert.deepEqual(missing.map((r) => r.id), ["999"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run from `checker/app`: `node --test test/roster.test.js`
Expected: FAIL with `Cannot find module '../lib/roster.js'`.

- [ ] **Step 3: Write `lib/roster.js`**

```js
import { normalize } from "./format.js";

function headerRowIndex(rows) {
  return rows.findIndex((r) =>
    r.some((c) => /student'?s name/i.test(String(c ?? ""))) &&
    r.some((c) => /id\s*no\.?/i.test(String(c ?? ""))));
}

function colIndex(header, re) {
  return header.findIndex((c) => re.test(String(c ?? "")));
}

export function parseRosterSheet(rows, source) {
  const hi = headerRowIndex(rows);
  if (hi < 0) return [];
  const header = rows[hi];
  const ni = colIndex(header, /student'?s name/i);
  const ii = colIndex(header, /id\s*no\.?/i);
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const name = String(r[ni] ?? "").trim();
    const id = String(r[ii] ?? "").trim();
    if (!name) continue;
    out.push({ name, id, source });
  }
  return out;
}

export function mergeRosters(lists) {
  const seen = new Set();
  const out = [];
  for (const row of lists.flat()) {
    const key = row.id ? `id:${normalize(row.id)}` : `nm:${normalize(row.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function joinSubmissions(roster, submissions) {
  const byId = new Map(roster.filter((r) => r.id).map((r) => [normalize(r.id), r]));
  const byName = new Map(roster.map((r) => [normalize(r.name), r]));
  const used = new Set();
  const matched = [];
  const unmatched = [];
  for (const sub of submissions) {
    const st = sub.student || {};
    const hit = (st.id && byId.get(normalize(st.id))) ||
      (st.name && byName.get(normalize(st.name))) || null;
    if (hit && !used.has(hit)) {
      used.add(hit);
      matched.push({ roster: hit, sub });
    } else {
      unmatched.push(sub);
    }
  }
  return { matched, unmatched, missing: roster.filter((r) => !used.has(r)) };
}
```

- [ ] **Step 4: Run to verify pass**

Run from `checker/app`: `node --test test/*.test.js`
Expected: PASS (7 + 4 = 11).

- [ ] **Step 5: Commit**

```bash
git add checker/app/lib/roster.js checker/app/test/roster.test.js
git commit -m "feat(checker): roster parse, merge, submission join"
```

### Task 4: Non-AI scoring (`lib/score.js`)

**Files:**
- Create: `checker/app/lib/score.js`
- Create: `checker/app/test/score.test.js`

**Interfaces:**
- Consumes: Task 1 (`idMatch`, `tfCorrect`, `mcCorrect`).
- Produces: `scoreNonAI(keyItems, answers)` → `{perQ: [{n, type, correct, points}], mc, tf, id, totalNonAI, saItems: [{n, prompt, answer, rubric, maxPoints, keyPoints}]}`. Task 7 consumes it. `keyItems` are key-file rows (`{n, type, prompt, ans?, aliases?, key_points?, rubric?, max_points?}`); `answers` are submission rows (`{q, type, prompt, answer}`).

- [ ] **Step 1: Write the failing test `test/score.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { scoreNonAI } from "../lib/score.js";

const key = [
  { n: 1, type: "mc", prompt: "p", choices: ["a", "b"], ans: 1 },
  { n: 2, type: "tf", prompt: "p", ans: true },
  { n: 3, type: "id", prompt: "p", aliases: ["variable cost"] },
  { n: 4, type: "sa", prompt: "p", key_points: ["k"],
    rubric: "1 pt", max_points: 1 },
  { n: 5, type: "sa", prompt: "p2", key_points: ["k2"],
    rubric: "2 pts", max_points: 2 },
];

test("scores mc/tf/id, collects sa", () => {
  const answers = [
    { q: 1, type: "mc", prompt: "p", answer: 1 },
    { q: 2, type: "tf", prompt: "p", answer: "true" },
    { q: 3, type: "id", prompt: "p", answer: "Variable  Cost!" },
    { q: 4, type: "sa", prompt: "p", answer: "essay one" },
    { q: 5, type: "sa", prompt: "p", answer: "essay two" },
  ];
  const r = scoreNonAI(key, answers);
  assert.equal(r.mc, 1);
  assert.equal(r.tf, 1);
  assert.equal(r.id, 1);
  assert.equal(r.totalNonAI, 3);
  assert.equal(r.saItems.length, 2);
  assert.equal(r.saItems[1].maxPoints, 2);
  assert.equal(r.saItems[0].answer, "essay one");
});

test("wrong and missing answers score zero", () => {
  const r = scoreNonAI(key, [{ q: 1, type: "mc", prompt: "p", answer: 0 }]);
  assert.equal(r.mc, 0);
  assert.equal(r.totalNonAI, 0);
  assert.equal(r.saItems.length, 2);
  assert.equal(r.saItems[0].answer, "");
});
```

- [ ] **Step 2: Run to verify failure**

Run from `checker/app`: `node --test test/score.test.js`
Expected: FAIL with `Cannot find module '../lib/score.js'`.

- [ ] **Step 3: Write `lib/score.js`**

```js
import { idMatch, tfCorrect, mcCorrect } from "./format.js";

export function scoreNonAI(keyItems, answers) {
  const byQ = new Map((answers || []).map((a) => [a.q, a]));
  const perQ = [];
  let mc = 0;
  let tf = 0;
  let id = 0;
  const saItems = [];
  for (const k of keyItems) {
    const a = byQ.get(k.n);
    const given = a ? a.answer : undefined;
    if (k.type === "mc") {
      const ok = given !== undefined && mcCorrect(given, k.ans);
      if (ok) mc++;
      perQ.push({ n: k.n, type: "mc", correct: ok, points: ok ? 1 : 0 });
    } else if (k.type === "tf") {
      const ok = given !== undefined && tfCorrect(given, k.ans);
      if (ok) tf++;
      perQ.push({ n: k.n, type: "tf", correct: ok, points: ok ? 1 : 0 });
    } else if (k.type === "id") {
      const ok = given !== undefined && idMatch(given, k.aliases);
      if (ok) id++;
      perQ.push({ n: k.n, type: "id", correct: ok, points: ok ? 1 : 0 });
    } else {
      saItems.push({
        n: k.n,
        prompt: k.prompt,
        answer: typeof given === "string" ? given : "",
        rubric: k.rubric,
        maxPoints: k.max_points,
        keyPoints: k.key_points,
      });
    }
  }
  return { perQ, mc, tf, id, totalNonAI: mc + tf + id, saItems };
}
```

- [ ] **Step 4: Run to verify pass**

Run from `checker/app`: `node --test test/*.test.js`
Expected: PASS (11 + 2 = 13).

- [ ] **Step 5: Commit**

```bash
git add checker/app/lib/score.js checker/app/test/score.test.js
git commit -m "feat(checker): deterministic non-AI scoring"
```

### Task 5: SA batching + Worker client (`lib/sa.js`)

**Files:**
- Create: `checker/app/lib/sa.js`
- Create: `checker/app/test/sa.test.js`

**Interfaces:**
- Consumes: Task 4 `saItems` shape (`{n, prompt, answer, rubric, maxPoints, ...}`).
- Produces: `chunk10(arr)`, `gradeBatch(workerUrl, apiKey, payload)` → rows array (throws `Error` with `status` on non-200), `gradeAll(workerUrl, apiKey, model, saMeta, answersByStudent, onProgress)` → `Map(ref → {score, reason})` with max 2 concurrent batches. Task 7 consumes them. `saMeta` = `{question, rubric, maxPoints}`; `answersByStudent` = `[{ref, text}]`.

- [ ] **Step 1: Write the failing test `test/sa.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { chunk10, gradeBatch, gradeAll } from "../lib/sa.js";

test("chunk10 splits into tens", () => {
  const arr = Array.from({ length: 23 }, (_, i) => i);
  assert.deepEqual(chunk10(arr).map((c) => c.length), [10, 10, 3]);
  assert.deepEqual(chunk10([]), []);
});

test("gradeBatch posts contract + returns rows", async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  let seen = {};
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) };
    return new Response(JSON.stringify([{ ref: "s1", score: 1, reason: "ok" }]), { status: 200 });
  };
  const rows = await gradeBatch("https://w.example", "k", {
    model: "glm-5.3-flash", question: "Q", rubric: "R", maxPoints: 1,
    answers: [{ ref: "s1", text: "A" }],
  });
  assert.equal(seen.url, "https://w.example/grade");
  assert.equal(seen.auth, "Bearer k");
  assert.equal(seen.body.model, "glm-5.3-flash");
  assert.deepEqual(rows, [{ ref: "s1", score: 1, reason: "ok" }]);
});

test("gradeBatch throws with status on error", async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "x" }), { status: 502 });
  await assert.rejects(gradeBatch("https://w.example", "k", {
    model: "m", question: "Q", rubric: "R", maxPoints: 1, answers: [{ ref: "s1", text: "A" }],
  }), (e) => e.status === 502);
});

test("gradeAll batches tens with concurrency 2", async (t) => {
  const real = globalThis.fetch;
  t.after(() => { globalThis.fetch = real; });
  let live = 0;
  let peak = 0;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    live++;
    peak = Math.max(peak, live);
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    const body = JSON.parse(init.body);
    live--;
    return new Response(JSON.stringify(
      body.answers.map((a) => ({ ref: a.ref, score: 1, reason: "ok" }))), { status: 200 });
  };
  const answers = Array.from({ length: 25 }, (_, i) => ({ ref: "r" + i, text: "t" }));
  const seen = [];
  const out = await gradeAll("https://w.example", "k", "glm-5.3-flash",
    { question: "Q", rubric: "R", maxPoints: 1 }, answers,
    (done, total) => seen.push([done, total]));
  assert.equal(out.size, 25);
  assert.equal(calls, 3);
  assert.ok(peak <= 2);
  assert.deepEqual(seen[seen.length - 1], [25, 25]);
});
```

- [ ] **Step 2: Run to verify failure**

Run from `checker/app`: `node --test test/sa.test.js`
Expected: FAIL with `Cannot find module '../lib/sa.js'`.

- [ ] **Step 3: Write `lib/sa.js`**

```js
export function chunk10(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += 10) out.push(arr.slice(i, i + 10));
  return out;
}

export async function gradeBatch(workerUrl, apiKey, payload) {
  const res = await fetch(`${workerUrl.replace(/\/$/, "")}/grade`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = new Error(`grade failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function gradeAll(workerUrl, apiKey, model, saMeta, answersByStudent, onProgress) {
  const batches = chunk10(answersByStudent);
  const out = new Map();
  let done = 0;
  const total = answersByStudent.length;
  async function worker() {
    while (batches.length > 0) {
      const batch = batches.shift();
      const rows = await gradeBatch(workerUrl, apiKey, {
        model,
        question: saMeta.question,
        rubric: saMeta.rubric,
        maxPoints: saMeta.maxPoints,
        answers: batch,
      });
      for (const r of rows) out.set(r.ref, { score: r.score, reason: r.reason });
      done += batch.length;
      if (onProgress) onProgress(done, total);
    }
  }
  const runners = [];
  const n = Math.min(2, batches.length);
  for (let i = 0; i < n; i++) runners.push(worker());
  await Promise.all(runners);
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run from `checker/app`: `node --test test/*.test.js`
Expected: PASS (13 + 4 = 17).

- [ ] **Step 5: Commit**

```bash
git add checker/app/lib/sa.js checker/app/test/sa.test.js
git commit -m "feat(checker): SA batching + Worker client"
```

### Task 6: Export workbook builder (`lib/export-book.js` + `lib/sheets-io.js`)

**Files:**
- Create: `checker/app/lib/export-book.js` (pure data shaping, fully tested)
- Create: `checker/app/lib/sheets-io.js` (thin SheetJS seam, NOT unit-tested — exercised manually in Task 7)
- Create: `checker/app/test/export-book.test.js`

**Interfaces:**
- Consumes: Task 3 join output + Task 4 scores + Task 5 SA results (plain data, assembled by Task 7).
- Produces: `buildWorkbookData(assignments)` → `{sheets: [{name, rows}]}` where each row is an array; `sheets-io.js` exports `parseRosterFile(XLSX, arrayBuffer)` → array-of-{name, rows} and `downloadWorkbook(XLSX, data, filename)`.

Input shape for `buildWorkbookData`: `assignments` = array of
`{tag, keyItems, results: Map(studentKey → {name, id, mc, tf, idScore, saScores: Map(saN → score), total}), unmatched: [file], missing: [{name, id}]}`,
plus `roster` array. `studentKey` = roster id or normalized name.

- [ ] **Step 1: Write the failing test `test/export-book.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkbookData } from "../lib/export-book.js";

function sample() {
  return {
    roster: [{ name: "N1", id: "1", source: "f" }],
    assignments: [{
      tag: "W4",
      saNs: [19, 20],
      results: new Map([["1", {
        name: "N1", id: "1", mc: 9, tf: 4, idScore: 3,
        saScores: new Map([[19, 2], [20, 1]]), total: 19,
      }]]),
      unmatched: ["mystery.json"],
      missing: [{ name: "GHOST", id: "999" }],
    }],
  };
}

test("grades sheet has dynamic SA columns + grand total", () => {
  const wb = buildWorkbookData(sample());
  const grades = wb.sheets.find((s) => s.name === "Grades");
  assert.deepEqual(grades.rows[0],
    ["Name", "ID", "W4 MC", "W4 TF", "W4 ID", "W4 SA19", "W4 SA20", "W4 Total", "GrandTotal", "Status"]);
  assert.deepEqual(grades.rows[1], ["N1", "1", 9, 4, 3, 2, 1, 19, 19, "matched"]);
});

test("unmatched + missing sheets list files and names", () => {
  const wb = buildWorkbookData(sample());
  const un = wb.sheets.find((s) => s.name === "Unmatched");
  assert.deepEqual(un.rows[1], ["W4", "mystery.json"]);
  const mi = wb.sheets.find((s) => s.name === "Missing");
  assert.deepEqual(mi.rows[1], ["W4", "GHOST", "999"]);
});

test("review log records overrides", () => {
  const input = sample();
  input.assignments[0].reviews = [{ tag: "W4", saN: 19, ref: "1", ai: 1, reason: "r", final: 2 }];
  const wb = buildWorkbookData(input);
  const rl = wb.sheets.find((s) => s.name === "ReviewLog");
  assert.deepEqual(rl.rows[1], ["W4", 19, "1", 1, "r", 2]);
});
```

- [ ] **Step 2: Run to verify failure**

Run from `checker/app`: `node --test test/export-book.test.js`
Expected: FAIL with `Cannot find module '../lib/export-book.js'`.

- [ ] **Step 3: Write `lib/export-book.js`**

```js
export function buildWorkbookData({ roster, assignments }) {
  const perAssign = [];
  for (const a of assignments) {
    perAssign.push({ tag: a.tag, saNs: a.saNs });
  }
  const head = ["Name", "ID"];
  for (const p of perAssign) {
    head.push(`${p.tag} MC`, `${p.tag} TF`, `${p.tag} ID`);
    for (const n of p.saNs) head.push(`${p.tag} SA${n}`);
    head.push(`${p.tag} Total`);
  }
  head.push("GrandTotal", "Status");
  const grades = [head];
  const byKey = new Map();
  for (const a of assignments) {
    for (const [k, r] of a.results) {
      if (!byKey.has(k)) byKey.set(k, { name: r.name, id: r.id, cells: [], grand: 0 });
      const row = byKey.get(k);
      row.cells.push(r.mc, r.tf, r.idScore);
      for (const n of a.saNs) row.cells.push(r.saScores.get(n) ?? "");
      row.cells.push(r.total);
      row.grand += r.total;
    }
  }
  for (const row of byKey.values()) {
    grades.push([row.name, row.id, ...row.cells, row.grand, "matched"]);
  }
  const unmatched = [["Assignment", "File"]];
  const missing = [["Assignment", "Name", "ID"]];
  for (const a of assignments) {
    for (const f of a.unmatched || []) unmatched.push([a.tag, f]);
    for (const m of a.missing || []) missing.push([a.tag, m.name, m.id]);
  }
  const review = [["Assignment", "SA", "Ref", "AI score", "AI reason", "Final"]];
  for (const a of assignments) {
    for (const r of a.reviews || []) {
      review.push([a.tag, r.saN, r.ref, r.ai, r.reason, r.final]);
    }
  }
  return { sheets: [
    { name: "Grades", rows: grades },
    { name: "Unmatched", rows: unmatched },
    { name: "Missing", rows: missing },
    { name: "ReviewLog", rows: review },
  ] };
}
```

- [ ] **Step 4: Write `lib/sheets-io.js` (thin seam, no unit test)**

```js
export function parseRosterFile(XLSX, arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true }),
  }));
}

export function downloadWorkbook(XLSX, data, filename) {
  const wb = XLSX.utils.book_new();
  for (const s of data.sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  }
  XLSX.writeFile(wb, filename);
}
```

- [ ] **Step 5: Run to verify pass**

Run from `checker/app`: `node --test test/*.test.js`
Expected: PASS (17 + 3 = 20).

- [ ] **Step 6: Commit**

```bash
git add checker/app/lib/export-book.js checker/app/lib/sheets-io.js checker/app/test/export-book.test.js
git commit -m "feat(checker): export workbook builder + SheetJS seam"
```

### Task 7: DOM shell (`index.html` + `app.js`)

**Files:**
- Create: `checker/app/index.html`
- Create: `checker/app/app.js`
- Modify: `checker/preview.html` — prepend one line under `<body>` noting it is superseded by `checker/app/index.html` once built (single-line edit, no other changes)

**Interfaces:**
- Consumes: all `lib/` modules + Plan 2 Worker URL + SheetJS CDN global `XLSX`.
- Produces: working 6-step UI. No unit tests (DOM shell) — verification is `node --check` on `app.js` + scripted click-through below.

- [ ] **Step 1: Write `index.html` (6 step sections, ids wired below)**

Structure (ids in brackets): header; stepper; section#s1 setup (`#goKey` password, `#rememberKey` checkbox, `#clearKey` button, `#modelSel` select with the 4 exact model ids as values, `#workerUrl` text default `https://checker-grade.<account>.workers.dev`, `#saveSetup`); section#s2 roster (`#rosterFiles` multiple `.xlsm,.xlsx`, `#rosterCount`); section#s3 assignment loop (`#pemFile`, `#keyFile`, `#subFiles` multiple `.json` + `#subZip` `.zip` optional — implement zip via `DecompressionStream('deflate-raw')`? NO — out of scope: accept only multi-select `.json` files in this task, note zip as follow-up); `#runNonAI`, `#addAssignment`; section#s4 results (`#resultsTable`); section#s5 SA (`#saQueue`, `#saTable`, `#lockSA`); section#s6 export (`#downloadXlsx`). Load order: SheetJS CDN script tag first, then `<script type="module" src="./app.js">`. Include the exact CDN tag:

```html
<script src="https://unpkg.com/xlsx@0.20.3/dist/xlsx.full.min.js"></script>
```

Keep styling minimal (reuse `checker/preview.html` classes by copying its `<style>` block verbatim).

- [ ] **Step 2: Write `app.js` (wire the six steps)**

Required behaviors (no more, no less):
1. Setup: read `#goKey` into memory (plus `localStorage "checker.goKey"` iff `#rememberKey` checked); `#clearKey` wipes both; `#modelSel` change persists to `localStorage`; populate `#modelSel` options from `GET ${workerUrl}/models` with fallback to the 4 baked-in ids on failure.
2. Roster: on files, `arrayBuffer()` each → `parseRosterFile(XLSX, buf)` → `parseRosterSheet(rows, file.name)` per sheet → `mergeRosters` → render count + duplicates skipped.
3. Assignment: read pem + key JSON as text; read each `.json` submission; `decryptSubmission(pem, parsed)` per file (collect failures into quarantine list, continue); `joinSubmissions(roster, subs)`; store per-assignment `{tag (from key `output` stem), keyItems, matched, unmatched, missing}`. Both file inputs (`#rosterFiles`, `#subFiles`) AND drag-drop zones (`#rosterDrop`, `#subDrop` with `dragover`/`drop` handlers feeding the same file lists) are required. `.zip` upload is explicitly out of scope for this plan (multi-select covers the volume; recorded as follow-up).
4. Non-AI: for each matched submission run `scoreNonAI(keyItems, sub.answers)`; render per-student MC/TF/ID/Total table; enable "add another assignment" (repeats step 3); SA section stays disabled until every loaded assignment is scored.
5. SA: for each assignment × each SA question number, build `answersByStudent` refs `${tag}:Q${n}:${studentKey}`; `gradeAll(workerUrl, apiKey, model, {question, rubric, maxPoints}, answers, onProgress)`; render score+reason rows with editable number inputs; teacher edits write `reviews[]` + `final`; `#lockSA` freezes.
6. Export: assemble `buildWorkbookData` input from stored state (map `max_points`→already `maxPoints` in saItems; totals = totalNonAI + SA finals; missing SA finals count as blank and excluded from total); `downloadWorkbook(XLSX, data, "grades.xlsx")`.
State object shape: `{setup: {workerUrl, apiKey, model}, roster: [...], assignments: [{tag, keyItems, saNs, scored: Map, reviews: []}], unmatchedAll, missingAll}`.

- [ ] **Step 3: Verify**

Run: `node --check checker/app/app.js` (from repo root)
Expected: no output (syntax OK).
Manual click-through (record in commit body): open `checker/app/index.html` via a static server, walk Setup→Roster (example xlsm) → Assignment (decrypt fails cleanly without real key files — quarantine path exercised), confirm SA section stays locked.

- [ ] **Step 4: Commit (include click-through notes in body)**

```bash
git add checker/app/index.html checker/app/app.js checker/preview.html
git commit -m "feat(checker): six-step DOM shell wired to lib modules"
```

### Task 8: Firebase Hosting config + app README

**Files:**
- Create: `firebase.json` (repo root)
- Create: `checker/app/README.md`

**Interfaces:**
- Consumes: Task 7 (`checker/app/index.html` entry).
- Produces: deployable static hosting; README documents local run + deploy + SheetJS CDN pin.

- [ ] **Step 1: Write `firebase.json`**

```json
{
  "hosting": {
    "public": "checker/app",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [
      {
        "source": "**/*.js",
        "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
      }
    ]
  }
}
```

- [ ] **Step 2: Write `checker/app/README.md`**

```md
# assignment checker app

Local-first static grader. Open via Firebase Hosting or any static server;
all roster/key/submission data stays in this browser.

- Local run: `npx serve checker/app` (or `python -m http.server` in `checker/app`), open the printed URL.
- Deploy: `firebase deploy --only hosting` (project must use the Spark plan; no functions/database).
- Worker: set the Worker URL on the Setup step (see `checker/worker/README.md`).
- Deps at runtime: SheetJS 0.20.3 via pinned CDN in `index.html`; everything else is dependency-free.
```

- [ ] **Step 3: Validate JSON + tests still green**

Run: `node -e "JSON.parse(require('fs').readFileSync('firebase.json','utf8')); console.log('firebase.json OK')"` (from repo root)
Run from `checker/app`: `node --test test/*.test.js`
Expected: PASS (20 tests).

- [ ] **Step 4: Commit**

```bash
git add firebase.json checker/app/README.md
git commit -m "chore(checker): Firebase Hosting config + app README"
```
