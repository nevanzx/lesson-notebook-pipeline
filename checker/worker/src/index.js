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
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60_000);
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: auth },
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
        "go-upstream-error");
    }
    return res.json();
  }
  throw new HttpError(502, "go-upstream-error");
}

export default {
  // NOTE: no secrets from env by design — teacher key arrives per request.
  async fetch(request, _env) {
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
