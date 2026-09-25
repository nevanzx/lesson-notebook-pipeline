const DEFAULT_APP_ORIGIN =
  "https://assignz.web.app,https://assignz.firebaseapp.com";
const DEFAULT_TZ = "Asia/Manila";

export function isAllowedOrigin(origin, appOriginList) {
  if (!origin) return false;
  return (appOriginList || DEFAULT_APP_ORIGIN)
    .split(",").map((s) => s.trim()).filter(Boolean).includes(origin);
}

export function weekdayInTz(now, tz) {
  return new Intl.DateTimeFormat("en-US",
    { timeZone: tz || DEFAULT_TZ, weekday: "long" })
    .format(now).toLowerCase();
}

function b64Is32(v) {
  let bin;
  try {
    bin = atob(String(v).trim());
  } catch {
    return false;
  }
  return bin.length === 32;
}

function unlockJson(status, obj, echo) {
  const headers = { "content-type": "application/json" };
  if (echo) headers["access-control-allow-origin"] = echo;
  return new Response(JSON.stringify(obj), { status, headers });
}

export async function handleUnlock(request, env) {
  const origin = request.headers.get("origin");
  const echo = isAllowedOrigin(origin, env.APP_ORIGIN) ? origin : null;
  if (!echo) return unlockJson(403, { ok: false, reason: "forbidden" }, null);
  const body = await request.json().catch(() => null);
  if (!body || body.v !== 1) {
    return unlockJson(400, { ok: false, reason: "bad-request" }, echo);
  }
  const key = env.UNLOCK_KEY ? String(env.UNLOCK_KEY).trim() : "";
  if (!key || !b64Is32(key)) {
    return unlockJson(500, { ok: false, reason: "unconfigured" }, echo);
  }
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
  return unlockJson(200, { ok: true, key }, echo);
}

export function unlockPreflight(request, env) {
  const origin = request.headers.get("origin");
  const headers = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
  };
  if (isAllowedOrigin(origin, env.APP_ORIGIN)) {
    headers["access-control-allow-origin"] = origin;
  }
  return new Response(null, { status: 204, headers });
}
