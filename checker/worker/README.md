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
