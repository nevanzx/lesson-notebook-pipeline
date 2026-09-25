import { MODELS, validateGradeRequest, HttpError } from "./validate.js";
import {
  buildSystemPrompt, buildUserPrompt, buildGoBody, parseGoResult, extractUsage,
} from "./upstream.js";
import { handleUnlock, unlockPreflight } from "./unlock.js";

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

async function sessionId({ model, question, rubric, maxPoints }) {
  const bytes = new TextEncoder().encode(
    [model, question, rubric, String(maxPoints)].join("\u0000"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callGo(url, auth, body, session) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60_000);
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: auth,
          // Required by OpenCode Go (400 MissingSessionID without it);
          // stable per SA question so routing + prompt caching hold
          // across the batch calls of one question.
          "x-opencode-session": session,
          "user-agent": "assignment-checker/1.0",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch {
      clearTimeout(t);
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      continue;
    }
    clearTimeout(t);
    if (res.status === 429 || res.status >= 500) {
      lastStatus = res.status;
      const ra = res.headers.get("retry-after");
      const wait = ra !== null ? Number(ra) * 1000 : NaN;
      await sleep(Number.isFinite(wait) && wait > 0 ? Math.min(wait, 8000)
        : Math.min(1000 * 2 ** attempt, 8000));
      continue;
    }
    if (!res.ok) {
      throw new HttpError(res.status === 401 || res.status === 403 ? 401 : 502,
        `go-upstream-error (upstream ${res.status})`);
    }
    return res.json();
  }
  throw new HttpError(502, `go-upstream-error (upstream ${lastStatus || "unreachable"})`);
}

export default {
  // NOTE: one env secret by design — UNLOCK_KEY (assignment unlock, released
  // Wednesday + app-origin only). /grade still holds no key: the teacher's
  // Go key arrives per request.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/unlock") {
      if (request.method === "OPTIONS") return unlockPreflight(request, env);
      if (request.method === "POST") return await handleUnlock(request, env);
      return json(404, { error: "not found" });
    }
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
        const session = await sessionId({ model, question, rubric, maxPoints });
        const goJson = await callGo(path, auth, buildGoBody(kind, model, system, user), session);
        const rows = parseGoResult(kind, goJson, {
          refs: answers.map((a) => a.ref), maxPoints,
        });
        return json(200, { rows, usage: extractUsage(kind, goJson) });
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
