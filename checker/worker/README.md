# checker-grade worker

Stateless CORS + protocol proxy: browser `POST /grade` → OpenCode Go. The
teacher's Go key is forwarded per request and never logged. It holds exactly
ONE secret — `UNLOCK_KEY` — and releases it only via `POST /unlock`, only to
an allowed `APP_ORIGIN` and only inside the unlock window (server clock;
default Wednesday `Asia/Manila`, overridable via `UNLOCK_DAY`/`UNLOCK_TZ`).
Every failure is fail-closed (403 / 500 / 423) and carries no key.

Deploy once per key: `npx wrangler secret put UNLOCK_KEY` with the base64
value from the local `build/key/unlock.key` (see v2/SKILL.md v2.9 note).
Losing/rotating it orphans every lesson built against the old key.

- `npm test` — unit tests (no network, no wrangler needed).
- `npm run dev` — `wrangler dev` local loop (needs `npx wrangler login` once).
- `npm run deploy` — publish to `<account>.workers.dev/checker-grade`.

Manual live smoke (needs a teacher Go key, never committed):

curl -X POST https://checker-grade.<account>.workers.dev/grade \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $GO_KEY" \
  -d '{"model":"glm-5.3-flash","question":"Q","rubric":"1 pt: answers Q","maxPoints":1,"answers":[{"ref":"s1","text":"A"}]}'
