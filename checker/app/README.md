# checker app (landing + viewer + teacher)

Landing page at `/` offers two choices:

- **HTML Viewer** (`viewer.html`) — for students. Opens lesson `.html`
  files on Android/iOS where HTML files can't be opened directly.
  Pick/drop a file (or paste a link); it renders in-page. Files never
  leave the device. It relays the assignment unlock request from the staged
  lesson iframe to the Worker (`lib/unlock.js` → `POST /unlock`); the lesson
  decrypts only inside this page. The Worker releases the key on Wednesday
  (Asia/Manila) by default, or every day when the deployment sets
  `UNLOCK_DAY=any`. The grader reads `GET /unlock` and skips its "submitted
  outside window" ReviewLog note while the deployment is always-open.
- **Teacher** (`teacher.html`) — the assignment checker grader.
  Gated by a password-only prompt on the landing page (no username).
- **Teacher Preview** (`teacher-viewer.html`) — grading-side lesson viewer,
  gated by the same `sessionStorage.teacherAuth` flag. Opens any built lesson
  any day **without the Worker**: legacy/plaintext builds get an injected
  trusted-time stub (in-memory copy only — the file on disk is never modified),
  encrypted builds unlock via `build/key/unlock.key` dropped in or pasted, kept
  in memory only (never localStorage, never a served file).   Submissions made
  from the preview are ordinary rows — the teacher just ignores them.

Unlock requests are handed over only to same-origin frames: the preview and
the student viewer give the key only when the staged lesson frame is
same-origin — picked files render as blob URLs (same-origin so it unlocks),
remote links render cross-origin and stay locked, and a cross-origin frame's
unlock request is answered `no-key`.

Local-first static site. Open via Firebase Hosting or any static server;
all roster/key/submission data stays in this browser.

- Local run: `npx serve checker/app` (or `python -m http.server` in `checker/app`), open the printed URL.
- Deploy: `firebase deploy --only hosting` (project must use the Spark plan; no functions/database).
- Worker: set the Worker URL on the Setup step (see `checker/worker/README.md`).
- Deps at runtime: SheetJS 0.18.5 vendored at `vendor/xlsx.full.min.js` (Apache-2.0, same version as fallback CDN); everything else is dependency-free.
