# assignment

Collect-only assessment. Mount: `<div data-component="assignment" data-key="…">`.
The **default is error** — 12 error-check items (`err`) + 8 multi-select items
(`multi`), no SA — see "Error mode" below. Flat
`{intro?, items:[18 fixed + 2+ sa]}` — 10 mc (4 choices), 4 tf, 4 id, 2+ sa, all
situational — is the explicit opt-in `build.json` `"assignment": "flat"`; DAG
and graph are likewise opt-in.
The component never reveals answers and never scores: those live only in the
build's teacher key file (`build/key/`) written by build.py.

Flow: hidden Begin card → fullscreen identity gate (separate first-name and
last-name fields + 8-digit ID, verified before anything else) → quiz deck, one
question per slide,
locked Next → submit validates completeness and downloads an
AES-GCM/RSA-OAEP-encrypted `<name> - Week N - Subject.json`. Submission carries
`student:{first,last,name,id}` where `name` is the reconstructed
`Lastname, Firstname` used for roster matching and the filename. No Exit while the
quiz runs: Esc/fullscreen-exit re-locks fullscreen with answers kept; Close
appears only after a successful submit.

## Layout (split panel)

Begin opens a fullscreen deck whose body is `.lna-shell` — a `.lna-rail` beside a
`.lna-main`. On desktop (≥1024 px) the rail is a left column carrying the title,
position (`Question k of M` / `Layer k of L`), an "Encrypted submit" note, and —
in DAG mode — the path taken (`.lna-path`). On phone (≤600 px) and tablet
(601–1023 px) the rail collapses to a slim horizontal strip and the nav pins to
the bottom. Progress is the existing `.lna-dots` / `.lna-dot` row rendered as a
segmented bar; `.lna-prog` is kept in the DOM (visually hidden) as the counter
hook, while `.lna-rail-count` is the visible counter at all widths. Selected
options use `.lna-opt:has(input:checked)` (accent edge + fill; the native radio
stays as the non-colour indicator). All colours are theme tokens; restyling never
touches flow, gating, or the submission envelope.

Guards (best effort, not absolute): selection disabled inside the deck
(inputs stay typeable), context menu off while open, cover on
blur/visibilitychange/PrintScreen, diagonal `ID — Name` watermark filled live.

Maintainer invariant: `show()` is the SOLE recompute point for the Next
button's `disabled` state and the progress dots. Every listener that writes
`state.answers[i]` (radio clicks AND text/textarea input) must call `bump()`
afterwards, or typed answers strand the student with Next permanently off.
`show()` refuses to render the quiz until `state.identified` is true.
Verify with `node tools/assignment_smoke.js` (from the skill folder) after
any edit to this component.

## Error mode (default)

No `"assignment"` key (or `"assignment": "error"`) ships a 12 `err` + 8 `multi`
deck:

```js
LN.data.assign7 = {
  mode: "error",
  intro: "…optional…",
  items: [
    { type: "err", statement: "Fixed costs rise, so the break-even point falls.",
      choices: ["Fixed costs rise", "break-even point", "falls", "so the"],
      ans: 2 },
    { type: "multi", prompt: "Select all the types of market structure.",
      choices: ["Perfect competition", "Monopoly", "Monopolistic competition",
                "Oligopoly", "Sole proprietorship", "Cartel behaviour"],
      ans: [0, 1, 2, 3] }
  ]
};
```

Each `err` slide shows the statement, then "Which part of the statement makes it
false?", then four radio options. Every choice is copied **verbatim** from the
statement as a whole-word span that occurs exactly once; the correct span may be
a word, phrase, clause, fragment, or full sentence, and at least 3 of the 12
items have a correct span of 4+ words. The correct span is the unique longest
choice in at most 4 of 12 items.

Each `multi` slide shows the prompt, then 4–8 checkboxes. The prompt names the
target (true statements, false statements, a process, a category, types, …); at
least 2 choices are correct and never all of them. Answers are compared as a
set.

`ans` never ships in the student data. The teacher key (`build/key/`) carries
`mode: "error"` and, per item, `n`, `type`, `prompt`, `choices`, and `ans`, plus
`statement` on `err` rows. Export rows carry `q`, `type`, `prompt`, `answer`
(the chosen span text for `err`, an array of chosen texts for `multi`), plus
`statement` for `err`. Authoring law: `../../error-craft.md`.
Validate with `node tools/assignment_smoke.js`.

## Flat mode (opt-in)

`build.json` `"assignment": "flat"` ships the 20-item flat deck — 10 mc (4
choices), 4 tf, 4 id, 2+ sa. Student data carries `type`, `prompt`, and choices
but never `ans` / `aliases` / `key_points`; the teacher key carries the grading
material. Authoring law: `../../question-craft.md`.

## Dag mode (opt-in)

With `"assignment": "dag"`, the mount renders a forward-only graph walk instead
of flat slides: identity gate and guards are identical; there is no Back; the
layer meter shows `Layer k of L`; Submit is only enabled at a leaf and exports
`{mode:"dag", path:[{node,label}], final_outcome}`. Student data carries
`nextNodeId` but never `points`. Validate with
`node tools/assignment_smoke.js` (walks flat, dag, graph, and error).
Authoring law: `../../dag-craft.md`.

## Graph mode (opt-in, v2.30)

`build.json` `"assignment": "graph"` ships a **graph-reading deck**: ten
multiple-choice items, each pairing a written situation with the drawing it asks
about. The data carries a `figures` bank (`{name: "<svg …>"}`) and each item
names its figure, so one drawing is defined once and read by several items:

```js
{ mode: "graph", intro: "…",
  figures: { "monopolist": { svg: "<svg …>",
                             legend: [{ label: "Demand", token: "chart-rev" },
                                      { label: "Deadweight loss — shaded",
                                        token: "chart-loss", mark: "block" }] } },
  items: [{ type: "mc", situation: "…", figure: "monopolist",
            prompt: "…", choices: ["…","…","…","…"], ans: 1 }] }
```

The slide renders the situation (`.lna-sit`), then the figure (`.lna-fig`, with
`data-figure` naming the bank entry), then the **legend** (`.lna-legend`, one row
per bank entry: a swatch in a chart token plus its label), then the question and
its choices. The legend is HTML rather than SVG text on purpose: a drawing scaled
to the column would shrink its own text out of legibility on a phone, while
`.lna-legend` wraps. The figure is sized to the column
(`width:100%; height:auto`) and the wrapper grows with it, so a scaled drawing
neither spills nor clips — `deck_layout_smoke.js` measures exactly this at
desktop, tablet and phone widths. Exported rows carry `situation` + `figure`;
`ans` never leaves the teacher key. Authoring law: `../../graph-craft.md`.

## Time lock (v2.8)

The Begin card fetches trusted time from `worldtimeapi.org/api/timezone/<tz>`
with three fallback hosts (meta `ln:window-tz`, default `Asia/Manila`; day
`ln:window-day`, default `wednesday`). Outside the window Begin is disabled and
the card shows the window + a live status; a 60 s watchdog closes an open deck
when the window ends. Every failure to reach the API at the gate fails closed
(locked). Submit re-fetches trusted time and records it as `submitted_at` with
`submitted_time_source` = the answering host; if **no** trusted host answers,
Submit no longer blocks — it falls back to the device clock and marks
`submitted_time_source:"device"` so the teacher can tell a local timestamp from
a trusted one (needed for always-open deployments where the Worker releases the
key every day). The gate is a deterrent, not tamper-proof.

## Ciphertext at rest + unlock (v2.9)

For assignment builds, `build.py` ships `LN.data.<key>` as an AES-256-GCM
envelope `{lnenc:1, v:1, iv, ct}` of the sanitized object — no question text
exists in the file. `init` dispatches: envelope → `unlockThenInit` (Begin
disabled, status line), plaintext/legacy → the normal gated deck. The key is
requested from the embedding page over `postMessage`
(`ln-unlock-request` → `ln-unlock-response`): the HTML Viewer relays it to the
Worker, which releases it only on Wednesday (Asia/Manila) to the app origin
(or every day when the Worker var `UNLOCK_DAY=any` is set);
`teacher-viewer.html` answers it locally with a runtime-loaded key. Outcomes,
all fail-closed: valid key → deck renders with the in-page clock gate bypassed
(the Worker already gated the open; the submit timestamp uses trusted time, or
the device clock marked `"device"` if no host answers) · out-of-window →
`.lna-lock-shut` Wednesday notice · top-level/new-tab
open, wrong key, denial, or 10 s silence → `.lna-lock-link` card pointing at
`VIEWER_URL`. Invariant: the universal key must never appear in any file the
student can fetch; only the Worker secret and the teacher's local
`build/key/unlock.key` hold it.
