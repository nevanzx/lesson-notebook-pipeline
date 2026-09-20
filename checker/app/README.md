# assignment checker app

Local-first static grader. Open via Firebase Hosting or any static server;
all roster/key/submission data stays in this browser.

- Local run: `npx serve checker/app` (or `python -m http.server` in `checker/app`), open the printed URL.
- Deploy: `firebase deploy --only hosting` (project must use the Spark plan; no functions/database).
- Worker: set the Worker URL on the Setup step (see `checker/worker/README.md`).
- Deps at runtime: SheetJS 0.20.3 via pinned CDN in `index.html`; everything else is dependency-free.
