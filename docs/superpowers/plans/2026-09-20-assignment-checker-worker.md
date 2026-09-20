# Assignment Checker — Plan 2: Cloudflare Worker Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a stateless Cloudflare Worker that exposes one normalized `POST /grade` endpoint and fans out to the three OpenCode Go wire protocols, with the teacher's key forwarded per-request and never stored.

**Architecture:** Plain JS (no build step): `validate.js` guards the contract, `upstream.js` builds/parses per-model-protocol payloads, `index.js` routes, adds CORS, forwards auth, retries. Unit tests run on stock Node (`node:test`, mocked `fetch`); Wrangler only for `dev`/`deploy`.

**Tech Stack:** Cloudflare Workers (free tier), Node 18+ (`node:test`, `node:assert/strict`) for tests, Wrangler (devDependency) for deploy. No runtime npm dependencies.

## Global Constraints

- Worker holds NO secret: teacher Go key arrives per-request as `Authorization: Bearer …` and is forwarded verbatim; never persisted, never logged (log only model id, batch size, status class).
- Only 4 models served (exact ids): `muse-spark-1.3-contributor`, `glm-5.3-flash`, `deepseek-v4.1-flash`, `qwen3.8-flash`. Anything else → 400.
- Batch size 1–10 answers per call; anything else → 400.
- Prompt-based strict JSON everywhere (no provider JSON-mode dependency): the model must return EXACTLY a JSON array; anything else → 502 `{error:"bad-model-json"}`, never silent zeros.
- CORS: `OPTIONS` preflight + `Access-Control-Allow-Origin: *` on all responses; allowed methods `GET, POST, OPTIONS`; allowed headers `Content-Type, Authorization`.
- Go timeout 60 s per attempt; retry 429/5xx up to 3 attempts total with backoff honoring `Retry-After`.
- Score accepted only if finite number within `0..maxPoints`; `ref` must be one of the request refs; `reason` a non-empty string.

---

### Task 1: Contract validation (`validate.js`)

**Files:**
- Create: `checker/worker/src/validate.js`
- Create: `checker/worker/test/validate.test.js`
- Create: `checker/worker/package.json` (below)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `MODELS` (id → `{path, kind}`), `validateGradeRequest(body)` → `{model, question, rubric, maxPoints, answers}` or throws `HttpError(status, message)` with `status` 400. Later tasks import both. `HttpError` is defined in `validate.js` and exported.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "checker-grade-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/*.test.js",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write the failing test `test/validate.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { MODELS, validateGradeRequest, HttpError } from "../src/validate.js";

const good = () => ({
  model: "glm-5.3-flash",
  question: "Why did break-even rise?",
  rubric: "2 pts: direction (1) + cause (1)",
  maxPoints: 2,
  answers: [{ ref: "s1", text: "Fixed cost rose." }],
});

test("accepts a valid request", () => {
  const out = validateGradeRequest(good());
  assert.equal(out.model, "glm-5.3-flash");
  assert.equal(out.answers.length, 1);
});

test("rejects unknown model", () => {
  assert.throws(() => validateGradeRequest({ ...good(), model: "gpt-99" }),
    (e) => e instanceof HttpError && e.status === 400);
});

test("rejects empty answers and >10 answers", () => {
  assert.throws(() => validateGradeRequest({ ...good(), answers: [] }),
    (e) => e instanceof HttpError && e.status === 400);
  const many = Array.from({ length: 11 }, (_, i) => ({ ref: "s" + i, text: "x" }));
  assert.throws(() => validateGradeRequest({ ...good(), answers: many }),
    (e) => e instanceof HttpError && e.status === 400);
});

test("rejects bad maxPoints and empty strings", () => {
  for (const mp of [0, -1, 2.5, "2", true, undefined]) {
    assert.throws(() => validateGradeRequest({ ...good(), maxPoints: mp }),
      (e) => e instanceof HttpError && e.status === 400, String(mp));
  }
  for (const k of ["question", "rubric"]) {
    assert.throws(() => validateGradeRequest({ ...good(), [k]: "  " }),
      (e) => e instanceof HttpError && e.status === 400, k);
  }
});

test("MODELS covers exactly the 4 allowlisted ids", () => {
  assert.deepEqual(Object.keys(MODELS).sort(), [
    "deepseek-v4.1-flash",
    "glm-5.3-flash",
    "muse-spark-1.3-contributor",
    "qwen3.8-flash",
  ]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test` (from `checker/worker`; run `npm install` first only if wrangler is needed — it is NOT needed for tests; plain `node --test` works without install)
Expected: FAIL with `Cannot find module '../src/validate.js'`.

- [ ] **Step 4: Write minimal implementation `src/validate.js`**

```js
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const GO = "https://opencode.ai/zen/go/v1";

export const MODELS = {
  "muse-spark-1.3-contributor": { path: `${GO}/responses`, kind: "responses" },
  "glm-5.3-flash": { path: `${GO}/chat/completions`, kind: "chat" },
  "deepseek-v4.1-flash": { path: `${GO}/chat/completions`, kind: "chat" },
  "qwen3.8-flash": { path: `${GO}/messages`, kind: "messages" },
};

function nonEmptyString(v, name) {
  if (typeof v !== "string" || !v.trim()) {
    throw new HttpError(400, `${name} must be a non-empty string`);
  }
  return v;
}

export function validateGradeRequest(body) {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "body must be a JSON object");
  }
  const { model, question, rubric, maxPoints, answers } = body;
  if (!Object.hasOwn(MODELS, model)) {
    throw new HttpError(400, `unknown model ${JSON.stringify(model)}`);
  }
  nonEmptyString(question, "question");
  nonEmptyString(rubric, "rubric");
  if (typeof maxPoints !== "number" || !Number.isInteger(maxPoints) || maxPoints <= 0) {
    throw new HttpError(400, "maxPoints must be a positive integer");
  }
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > 10) {
    throw new HttpError(400, "answers must be an array of 1..10 items");
  }
  for (const [i, a] of answers.entries()) {
    if (!a || typeof a !== "object") {
      throw new HttpError(400, `answers[${i}] must be an object`);
    }
    nonEmptyString(a.ref, `answers[${i}].ref`);
    if (typeof a.text !== "string" || !a.text.trim()) {
      throw new HttpError(400, `answers[${i}].text must be a non-empty string`);
    }
  }
  return { model, question, rubric, maxPoints, answers };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (5/5).

- [ ] **Step 6: Commit**

```bash
git add checker/worker/package.json checker/worker/src/validate.js checker/worker/test/validate.test.js
git commit -m "feat(worker): grade contract validation + model allowlist"
```

### Task 2: Upstream builders + strict parsers (`upstream.js`)

**Files:**
- Create: `checker/worker/src/upstream.js`
- Create: `checker/worker/test/upstream.test.js`

**Interfaces:**
- Consumes: Task 1's shape `{model, question, rubric, maxPoints, answers}` (plain object, no import needed).
- Produces: `buildSystemPrompt(maxPoints)`, `buildUserPrompt({question, rubric, maxPoints, answers})`, `buildGoBody(kind, model, system, user)`, `parseGoResult(kind, json, {refs, maxPoints})` → `[{ref, score, reason}]` or throws `HttpError(502, "bad-model-json" | "bad-model-shape")`. Task 3 imports all four.

- [ ] **Step 1: Write the failing test `test/upstream.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSystemPrompt, buildUserPrompt, buildGoBody, parseGoResult, HttpError,
} from "../src/upstream.js";

const req = {
  model: "glm-5.3-flash",
  question: "Why did break-even rise?",
  rubric: "2 pts: direction (1) + cause (1)",
  maxPoints: 2,
  answers: [
    { ref: "s1", text: "Fixed cost rose." },
    { ref: "s2", text: "It went up." },
  ],
};

test("prompts embed rubric, ceiling, refs", () => {
  const sys = buildSystemPrompt(2);
  assert.match(sys, /JSON array/);
  const user = buildUserPrompt(req);
  assert.match(user, /break-even/);
  assert.match(user, /\[s1\]/);
  assert.match(user, /\[s2\]/);
});

test("chat body shape", () => {
  const b = buildGoBody("chat", "glm-5.3-flash", "SYS", "USER");
  assert.equal(b.model, "glm-5.3-flash");
  assert.equal(b.messages[0].role, "system");
  assert.equal(b.messages[1].role, "user");
});

test("messages body shape", () => {
  const b = buildGoBody("messages", "qwen3.8-flash", "SYS", "USER");
  assert.equal(b.model, "qwen3.8-flash");
  assert.equal(b.messages[0].role, "user");
  assert.ok(b.max_tokens >= 256);
});

test("responses body shape", () => {
  const b = buildGoBody("responses", "muse-spark-1.3-contributor", "SYS", "USER");
  assert.equal(b.model, "muse-spark-1.3-contributor");
  assert.ok(Array.isArray(b.input));
});

test("chat parser accepts good payload", () => {
  const json = { choices: [{ message: { content: JSON.stringify([
    { ref: "s1", score: 2, reason: "names both" },
    { ref: "s2", score: 1, reason: "direction only" },
  ]) } }] };
  const out = parseGoResult("chat", json, { refs: ["s1", "s2"], maxPoints: 2 });
  assert.deepEqual(out.map((r) => r.score), [2, 1]);
});

test("parsers accept fenced JSON", () => {
  const fenced = "```json\n" + JSON.stringify([{ ref: "s1", score: 2, reason: "ok" }]) + "\n```";
  const chat = { choices: [{ message: { content: fenced } }] };
  assert.equal(parseGoResult("chat", chat, { refs: ["s1"], maxPoints: 2 })[0].ref, "s1");
  const msgs = { content: [{ type: "text", text: fenced }] };
  assert.equal(parseGoResult("messages", msgs, { refs: ["s1"], maxPoints: 2 })[0].ref, "s1");
  const resp = { output: [{ type: "message", content: [{ type: "output_text", text: fenced }] }] };
  assert.equal(parseGoResult("responses", resp, { refs: ["s1"], maxPoints: 2 })[0].ref, "s1");
});

test("parsers reject unknown ref, out-of-range score, prose", () => {
  const mk = (rows) => ({ choices: [{ message: { content: JSON.stringify(rows) } }] });
  const ctx = { refs: ["s1"], maxPoints: 2 };
  assert.throws(() => parseGoResult("chat", mk([{ ref: "sx", score: 1, reason: "x" }]), ctx),
    (e) => e instanceof HttpError && e.status === 502);
  assert.throws(() => parseGoResult("chat", mk([{ ref: "s1", score: 5, reason: "x" }]), ctx),
    (e) => e instanceof HttpError && e.status === 502);
  assert.throws(() => parseGoResult("chat", mk("just prose"), ctx),
    (e) => e instanceof HttpError && e.status === 502);
  assert.throws(() => parseGoResult("chat", {}, ctx),
    (e) => e instanceof HttpError && e.status === 502);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="prompts embed"`
Expected: FAIL with `Cannot find module '../src/upstream.js'`.

- [ ] **Step 3: Write minimal implementation `src/upstream.js`**

```js
import { HttpError } from "./validate.js";

export { HttpError };

export function buildSystemPrompt(maxPoints) {
  return (
    "You are grading short answers. Score each answer 0.." +
    `${maxPoints} using ONLY the rubric. Return EXACTLY a JSON array, ` +
    `one object per answer, no other text: ` +
    `[{"ref":"<id>","score":<number>,"reason":"<one sentence>"}]`
  );
}

export function buildUserPrompt({ question, rubric, maxPoints, answers }) {
  const lines = answers.map((a) => `[${a.ref}] ${a.text}`);
  return (
    `Question: ${question}\nRubric: ${rubric}\n` +
    `Max points: ${maxPoints}\nAnswers:\n${lines.join("\n")}`
  );
}

export function buildGoBody(kind, model, system, user) {
  if (kind === "chat") {
    return {
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
  }
  if (kind === "messages") {
    return {
      model,
      max_tokens: 1024,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    };
  }
  if (kind === "responses") {
    return {
      model,
      temperature: 0,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
  }
  throw new HttpError(400, `unknown kind ${JSON.stringify(kind)}`);
}

function extractText(kind, json) {
  try {
    if (kind === "chat") {
      return json.choices[0].message.content;
    }
    if (kind === "messages") {
      return json.content.find((b) => b.type === "text").text;
    }
    const msg = json.output.find((o) => o.type === "message");
    return msg.content.find((c) => c.type === "output_text").text;
  } catch {
    throw new HttpError(502, "bad-model-shape");
  }
}

function unfence(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1] : text;
}

export function parseGoResult(kind, json, { refs, maxPoints }) {
  const raw = extractText(kind, json);
  if (typeof raw !== "string") {
    throw new HttpError(502, "bad-model-shape");
  }
  let rows;
  try {
    rows = JSON.parse(unfence(raw));
  } catch {
    throw new HttpError(502, "bad-model-json");
  }
  if (!Array.isArray(rows)) {
    throw new HttpError(502, "bad-model-json");
  }
  const want = new Set(refs);
  return rows.map((r, i) => {
    if (!r || typeof r !== "object" || !want.has(r.ref)) {
      throw new HttpError(502, `bad-model-json (row ${i})`);
    }
    if (typeof r.score !== "number" || !Number.isFinite(r.score) ||
        r.score < 0 || r.score > maxPoints) {
      throw new HttpError(502, `bad-model-json (row ${i})`);
    }
    if (typeof r.reason !== "string" || !r.reason.trim()) {
      throw new HttpError(502, `bad-model-json (row ${i})`);
    }
    return { ref: r.ref, score: r.score, reason: r.reason };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (5 + 7 = 12 tests).

- [ ] **Step 5: Commit**

```bash
git add checker/worker/src/upstream.js checker/worker/test/upstream.test.js
git commit -m "feat(worker): Go payload builders + strict result parsers"
```

### Task 3: Handler — routing, CORS, auth forward, retry (`index.js`)

**Files:**
- Create: `checker/worker/src/index.js`
- Create: `checker/worker/test/index.test.js`

**Interfaces:**
- Consumes: Task 1 (`MODELS`, `validateGradeRequest`, `HttpError`), Task 2 (all four functions).
- Produces: default-exported `{ fetch(request, env) }` Worker entrypoint. No env secrets used.

- [ ] **Step 1: Write the failing test `test/index.test.js`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../src/index.js";

function req(method, path, body, headers = {}) {
  return new Request(`https://grade.example${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const gradeBody = () => ({
  model: "glm-5.3-flash",
  question: "Q",
  rubric: "1 pt",
  maxPoints: 1,
  answers: [{ ref: "s1", text: "A" }],
});

function mockFetchOnce(payload, { status = 200 } = {}) {
  globalThis.fetch = async () => new Response(JSON.stringify(payload), { status });
}
function mockFetchSeq(seq) {
  let i = 0;
  globalThis.fetch = async () => {
    const s = seq[Math.min(i++, seq.length - 1)];
    return new Response(JSON.stringify(s.body), {
      status: s.status,
      headers: s.retryAfter ? { "retry-after": s.retryAfter } : {},
    });
  };
}
const realFetch = globalThis.fetch;

test("OPTIONS preflight returns CORS headers", async () => {
  const res = await handler.fetch(req("OPTIONS", "/grade"), {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("GET /models lists the 4 ids", async () => {
  const res = await handler.fetch(req("GET", "/models"), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.models.sort(), [
    "deepseek-v4.1-flash",
    "glm-5.3-flash",
    "muse-spark-1.3-contributor",
    "qwen3.8-flash",
  ]);
});

test("happy path forwards auth + returns scores", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  let seenUrl = "";
  let seenAuth = "";
  globalThis.fetch = async (url, init) => {
    seenUrl = String(url);
    seenAuth = init.headers.authorization;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify([{ ref: "s1", score: 1, reason: "ok" }]) } }],
    }), { status: 200 });
  };
  const res = await handler.fetch(
    req("POST", "/grade", gradeBody(), { authorization: "Bearer go-test-key" }), {});
  assert.equal(res.status, 200);
  assert.equal(seenUrl, "https://opencode.ai/zen/go/v1/chat/completions");
  assert.equal(seenAuth, "Bearer go-test-key");
  assert.deepEqual(await res.json(), [{ ref: "s1", score: 1, reason: "ok" }]);
});

test("missing auth → 401 without calling Go", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("must not call"); };
  const res = await handler.fetch(req("POST", "/grade", gradeBody()), {});
  assert.equal(res.status, 401);
  assert.equal(called, false);
});

test("bad body → 400", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  const res = await handler.fetch(
    req("POST", "/grade", { ...gradeBody(), model: "nope" }, { authorization: "Bearer k" }), {});
  assert.equal(res.status, 400);
});

test("unparseable model output → 502", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockFetchOnce({ choices: [{ message: { content: "in prose we trust" } }] });
  const res = await handler.fetch(
    req("POST", "/grade", gradeBody(), { authorization: "Bearer k" }), {});
  assert.equal(res.status, 502);
});

test("429 then success retries once", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockFetchSeq([
    { status: 429, body: { error: "slow" }, retryAfter: "0" },
    { status: 200, body: { choices: [{ message: { content: JSON.stringify([{ ref: "s1", score: 1, reason: "ok" }]) } }] } },
  ]);
  const res = await handler.fetch(
    req("POST", "/grade", gradeBody(), { authorization: "Bearer k" }), {});
  assert.equal(res.status, 200);
});

test("unknown path → 404", async () => {
  const res = await handler.fetch(req("GET", "/nope"), {});
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="OPTIONS preflight"`
Expected: FAIL with `Cannot find module '../src/index.js'`.

- [ ] **Step 3: Write minimal implementation `src/index.js`**

```js
import { MODELS, validateGradeRequest, HttpError } from "./validate.js";
import {
  buildSystemPrompt, buildUserPrompt, buildGoBody, parseGoResult,
} from "./upstream.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
  "access-control-max-age": "86400",
};

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callGo(url, auth, body) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 60_000);
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: auth },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(t);
    } catch {
      lastStatus = 0;
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastStatus = res.status;
      const wait = Number(res.headers.get("retry-after")) * 1000;
      await sleep(Number.isFinite(wait) && wait > 0 ? Math.min(wait, 8000)
        : Math.min(1000 * 2 ** attempt, 8000));
      continue;
    }
    if (!res.ok) {
      throw new HttpError(res.status === 401 || res.status === 403 ? 401 : 502,
        "go-upstream-error");
    }
    return res.json();
  }
  throw new HttpError(502, "go-upstream-error");
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method === "GET" && url.pathname === "/models") {
      return json(200, { models: Object.keys(MODELS) });
    }
    if (request.method === "POST" && url.pathname === "/grade") {
      try {
        const auth = request.headers.get("authorization");
        if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
          return json(401, { error: "missing Authorization Bearer key" });
        }
        const body = await request.json().catch(() => null);
        const { model, question, rubric, maxPoints, answers } =
          validateGradeRequest(body);
        const { path, kind } = MODELS[model];
        const system = buildSystemPrompt(maxPoints);
        const user = buildUserPrompt({ question, rubric, maxPoints, answers });
        const goJson = await callGo(path, auth, buildGoBody(kind, model, system, user));
        const rows = parseGoResult(kind, goJson, {
          refs: answers.map((a) => a.ref), maxPoints,
        });
        return json(200, rows);
      } catch (e) {
        if (e instanceof HttpError) {
          return json(e.status, { error: e.message });
        }
        return json(502, { error: "worker-error" });
      }
    }
    return json(404, { error: "not found" });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (12 + 8 = 20 tests).

- [ ] **Step 5: Commit**

```bash
git add checker/worker/src/index.js checker/worker/test/index.test.js
git commit -m "feat(worker): grade handler with CORS, auth forward, retry"
```

### Task 4: Wrangler config + deploy notes

**Files:**
- Create: `checker/worker/wrangler.toml`
- Create: `checker/worker/README.md`

**Interfaces:**
- Consumes: Tasks 1–3 (all behavior already tested).
- Produces: deployable Worker; README documents `npm run dev`, teacher-key-in-browser model, and the manual live smoke below.

- [ ] **Step 1: Write `wrangler.toml`**

```toml
name = "checker-grade"
main = "src/index.js"
compatibility_date = "2026-09-01"
workers_dev = true
```

- [ ] **Step 2: Write `README.md`**

```md
# checker-grade worker

Stateless CORS + protocol proxy: browser `POST /grade` → OpenCode Go.
Holds NO secret — the teacher's Go key is forwarded per request and never logged.

- `npm test` — unit tests (no network, no wrangler needed).
- `npm run dev` — `wrangler dev` local loop (needs `npx wrangler login` once).
- `npm run deploy` — publish to `<account>.workers.dev/checker-grade`.

Manual live smoke (needs a teacher Go key, never committed):

curl -X POST https://checker-grade.<account>.workers.dev/grade \
 -H 'Content-Type: application/json' \
 -H "Authorization: Bearer $GO_KEY" \
 -d '{"model":"glm-5.3-flash","question":"Q","rubric":"1 pt: answers Q","maxPoints":1,"answers":[{"ref":"s1","text":"A"}]}'
```

- [ ] **Step 3: Validate config + tests**

Run: `npm test`
Expected: PASS (20 tests).
Run: `npx --no-install wrangler --version` only if `node_modules` exists; otherwise record "wrangler install deferred to deploy time (`npm install`)" in the commit message body — do NOT run `npm install` in this task (keeps the diff dependency-free).

- [ ] **Step 4: Commit**

```bash
git add checker/worker/wrangler.toml checker/worker/README.md
git commit -m "chore(worker): wrangler config + deploy notes"
```
