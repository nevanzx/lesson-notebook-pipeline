export const WORKER_URL = "https://checker-grade.aclc-obero.workers.dev";
const REQ = "ln-unlock-request";
const RESP = "ln-unlock-response";

export async function relayUnlock(workerUrl, fetchImpl, reply) {
  try {
    const res = await fetchImpl(`${String(workerUrl).replace(/\/$/, "")}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ v: 1 }),
    });
    const j = await res.json().catch(() => null);
    if (j && j.ok === true && typeof j.key === "string") {
      reply({ type: RESP, v: 1, ok: true, key: j.key });
    } else if (j && j.ok === false && typeof j.reason === "string") {
      reply({ type: RESP, v: 1, ok: false, reason: j.reason });
    } else {
      reply({ type: RESP, v: 1, ok: false, reason: "network" });
    }
  } catch {
    reply({ type: RESP, v: 1, ok: false, reason: "network" });
  }
}

export function unlockMessageHandler({ stage, workerUrl = WORKER_URL,
  fetchImpl = (u, init) => globalThis.fetch(u, init) }) {
  return function (ev) {
    if (!stage || !stage.contentWindow || ev.source !== stage.contentWindow) return;
    const m = ev.data;
    if (!m || m.type !== REQ || m.v !== 1) return;
    let sameOrigin = false;
    try {
      void stage.contentWindow.location.href;
      sameOrigin = true;
    } catch { /* cross-origin frame */ }
    if (!sameOrigin) {
      try {
        ev.source.postMessage({ type: RESP, v: 1, ok: false, reason: "no-key" },
          "*");
      } catch { /* frame is gone */ }
      return Promise.resolve();
    }
    return relayUnlock(workerUrl, fetchImpl, (resp) => {
      try {
        ev.source.postMessage(resp, "*");
      } catch { /* frame is gone */ }
    });
  };
}
