# checker app (landing + viewer + teacher)

Landing page at `/` offers two choices:

- **HTML Viewer** (`viewer.html`) — for students. Opens lesson `.html`
  files on Android/iOS where HTML files can't be opened directly.
  Pick/drop a file (or paste a link); it renders in-page. Files never
  leave the device.
- **Teacher** (`teacher.html`) — the assignment checker grader.
  Gated by a password-only prompt on the landing page (no username).

Local-first static site. Open via Firebase Hosting or any static server;
all roster/key/submission data stays in this browser.

- Local run: `npx serve checker/app` (or `python -m http.server` in `checker/app`), open the printed URL.
- Deploy: `firebase deploy --only hosting` (project must use the Spark plan; no functions/database).
- Worker: set the Worker URL on the Setup step (see `checker/worker/README.md`).
- Deps at runtime: SheetJS 0.18.5 vendored at `vendor/xlsx.full.min.js` (Apache-2.0, same version as fallback CDN); everything else is dependency-free.
