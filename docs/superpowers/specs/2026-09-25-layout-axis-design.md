# Layout Axis + Mobile-First Shells — Design (2026-09-25)

## Context

The notebook currently has one shell (`v2/skeleton/shell.html`): a fixed left
sidebar TOC, one `section.block` visible at a time (sidebar-driven tabs),
centered paper "sheet", scroll-spy in the no-JS path, mobile drawer. Visual
identity comes from four token packs (`parchment`, `opal`, `studio`, `ledger`)
selected per lesson from the subject matter.

Students read these notebooks mostly on **phones and tablets, portrait**. The
current shell is desktop-first; its sidebar collapses to a drawer on mobile and
its reading column and controls are not thumb-friendly.

Brainstorming decisions (visual companion, 2026-09-25):

- Add a new **`layout` axis** for structure/navigation, orthogonal to `theme`
  (colours/type/texture). Any layout works with any theme.
- Ship **four** layouts: keep today's shell as `desk`, add `app`, `feed`, `sheet`.
- The **main session picks the layout automatically** from lesson shape, exactly
  as it already picks the theme; `build.json` can still pin one.
- Mobile/portrait is the starting point; tablet and desktop get responsive
  adaptations.

## 1. Dimension model

| Axis | Values | Source of truth | Picked by |
|---|---|---|---|
| `theme` (exists) | `parchment`, `opal`, `studio`, `ledger` | `build.json > theme` | main session, from subject |
| `layout` (new) | `desk`, `app`, `feed`, `sheet` | `build.json > layout` | main session, from lesson shape |

`layout` is optional. **Absent means `desk`**, so every existing workdir, sample
(`sample/lesson-demo`, `sample/demo-*`) and test fixture keeps building with no
change in output.

`build.json` schema gains one key:

```json
{
  "title": "Week 4 — Feasibility Analysis",
  "theme": "opal",
  "layout": "sheet",
  "components": ["break-even-lab", "true-false", "assignment"],
  "output": "Week4-Notebook.html"
}
```

Allowed `build.json` keys become:
`title, theme, layout, components, output, extra_css, extra_js, week, subject,
assignment, dag, window`.

## 2. Auto-selection rule (documented in SKILL.md §1.2b)

The main session records the pick and one-line reason in the opening message.
Signals are checked in order:

| Signal in the lesson | Layout | Why |
|---|---|---|
| A lab/calculator is mounted and its numbers must stay in view while reading | `sheet` | Text scrolls; the lab lives in a bottom sheet that stays reachable |
| Many sections (>= 8) or assignment/overview emphasis, or revision material | `feed` | A section hub is faster to navigate and resume |
| Text-dense / essay / history / law / long print-heavy, few or no activities | `desk` | Sidebar + wide sheet suits long-form reading and printing |
| Otherwise (standard concept lesson with small activities) | `app` | One section at a time, thumb controls, swipe |

Tie-break: if both a lab and many sections apply, prefer `sheet` (the lab is the
centrepiece). The rule is guidance; `build.json > layout` overrides it.

## 3. Architecture — one runtime, pluggable layouts

Chosen approach: **transform `shell.html` into a shared runtime plus per-layout
plugins** (rejected: four full shell templates — they duplicate the runtime,
print CSS and error handling four times and would drift).

### 3.1 File layout

```
skeleton/shell.html              shared: <head> CSS markers, body skeleton,
                                 runtime, print block, error banner, noscript
skeleton/layouts/desk/layout.css   layout chrome CSS (token-only)
skeleton/layouts/desk/layout.js    layout nav (registers LN.nav)
skeleton/layouts/desk/chrome.html  layout chrome DOM fragment
skeleton/layouts/app/...
skeleton/layouts/feed/...
skeleton/layouts/sheet/...
```

`build.py` resolves `layout` (default `desk`), reads the three files, injects
them into the shell markers, and unsubstituted-marker/hex/external/grid checks
run on them exactly as they do for component CSS/JS.

### 3.2 New shell markers

Added to `MARKERS` in `build.py` (each must occur exactly once in `shell.html`):

| Marker | Injected with |
|---|---|
| `/*__LAYOUT_CSS__*/` | `<layout>/layout.css`, placed after base CSS and **before** the `@media print` block so print can override chrome |
| `<!--__LAYOUT_CHROME__-->` | `<layout>/chrome.html`, placed **inside `.app` before `<main class="stage">`** |
| `/*__LAYOUT_JS__*/` | `<layout>/layout.js`, placed after the runtime IIFE and before `/*__DATA__*/` |
| `__LAYOUT__` | the layout name, into `<body data-layout="__LAYOUT__">` (debug/QA hook) |

The shared body skeleton keeps `.app > .stage > .sheet > .decor/.content` with
`<!--__SECTIONS__-->` inside `.content`. Layout chrome fragments supply any extra
DOM (sidebar, hub, bottom bar, sheet) around that canvas; layout CSS may restyle
`.app`, `.stage`, `.content`.

### 3.3 Navigation contract

The runtime keeps ownership of mounts, data, number/close/format helpers, the
error banner, `LN.resetAll`, and `LN.boot`. Layout JS registers one object:

```js
LN.nav = {
  init: function () {},          // build chrome, wire events, show initial hash
  go:   function (i, pushHash) {} // display section index i
};
```

- `LN._showSection(i, pushHash)` stays as the canonical entry point used by
  `hashchange`; it delegates to `LN.nav.go` when present, otherwise runs the
  default straight-scroll behaviour.
- `LN.boot()` calls `LN.nav.init()` after mounts when a nav is registered, else
  the default init.
- Existing helpers referenced by tests and components (`LN.boot`, `LN.resetAll`,
  `LN.banner`, `LN.data`, `LN.components`) keep their names.
- The generic gate class stays `js-tabs`; base CSS keeps
  `body.js-tabs section.block[hidden]{display:none}` and the print rule that
  reveals all sections. Layouts that show one section at a time add `js-tabs`.

## 4. Layout specifications

Every layout: sections remain `section.block[id]` with exactly one `<h2>`; the
source of truth for order is DOM order; assignment, activity tags, reset and
error banner still work; token colours only.

### 4.1 `desk` (current behaviour, extracted)

- Chrome: sidebar (`#lnSidebar`, `#lnToc`, `#lnProg`, `#lnReset`), fixed
  `#lnMenu` + `#lnScrim` for the mobile drawer.
- Nav: one section at a time; scroll-spy in the continuous path; hash
  deep-link; progress = section position.
- Responsive: sidebar always visible >= 1024px; drawer below.
- This is a pure move of today's markup/CSS/JS out of `shell.html`; **no visual
  or behavioural change.**

### 4.2 `app` — bottom-nav

- Android/iOS-style: slim top header (title + segmented progress), one section
  at a time.
- Phone: a fixed **bottom bar** in thumb reach with `Prev`, `Contents` (opens
  the TOC as a bottom sheet), `Next`, and `Reset`; horizontal **swipe** moves
  between sections; `Next` is a raised primary action.
- Tablet (>= 768px): bottom bar centred under a wider reading column.
- Desktop (>= 1024px): the bar lifts to the top; TOC renders as a left rail
  (reusing desk's sidebar markup/behaviour is acceptable).
- Assignment fullscreen: the native `requestFullscreen` on the deck already
  hides all layout chrome; verify on iOS Safari (no arbitrary-element
  fullscreen) that the bottom bar does not cover the Begin card — add a
  `body.ln-assign` suppression rule if needed.

### 4.3 `feed` — section hub

- Phone: a **card per section** with number badge, title, one-line preview and a
  progress ring; tap a card to open that section full-screen; a back control
  returns to the hub; a persistent "Continue" primary action resumes the last
  opened section.
- Tablet (>= 768px): 2-column card grid.
- Desktop (>= 1024px): master–detail — card grid left, reading pane right;
  selecting a card renders the section beside it.
- Hub DOM is injected by `chrome.html` before `.stage`; layout CSS turns `.app`
  into the grid. Sections stay in `.content`; `feed` adds `js-tabs` and toggles
  the active section.
- Progress ring uses the same position semantics as desk (`i+1 / n`).

### 4.4 `sheet` — reader + bottom sheet

- Continuous scroll of all sections (no `js-tabs`); the TOC is a compact header
  or a top sheet, not a sidebar.
- Phone: a **draggable bottom sheet** (peek <-> expanded) holds the lesson's lab
  component; the sheet is pinned to the viewport and can be pulled up while
  reading. Only chosen for lessons that mount a lab.
- Tablet / desktop (>= 768px): two columns — reading column + **sticky lab
  panel** pinned beside it (the desktop form of the same idea).
- The lab is still mounted exactly once from its `data-component` block; the
  sheet/panel is a presentational wrapper the layout positions. If no lab is
  present the sheet is omitted and the lesson degrades to a plain reader.
- Print: chrome and sheet hidden; all sections print in order (shared print
  rule already handles the chrome via `.no-print`).

## 5. Invariants (all layouts)

- Sections stay `section.block[id]`, one `<h2>` each — the outline contract
  (`check_outline`) is untouched. Layout selection must not alter
  `sections.html` / `data.js` or any agent brief.
- `@media print`: chrome and layout nav hidden; every section visible in outline
  order. `body.js-tabs section.block[hidden]` is forced visible.
- No-JS: chrome hidden, all sections stacked and readable.
- Focus-visible outlines, WCAG contrast floors, semantic hue lock, reduced
  motion (`html{scroll-behavior:auto}`, no tween on section change), token-only
  colours, no external assets — all unchanged and still enforced by `build.py`.
- Assignment fullscreen gate reachable from every layout.
- `lnErrors` banner and `noscript` note stay in the shared shell.

## 6. build.py changes

- `MARKERS` += `/*__LAYOUT_CSS__*/`, `<!--__LAYOUT_CHROME__-->`,
  `/*__LAYOUT_JS__*/`, `__LAYOUT__`.
- Allow `layout` in `build.json`; validate `cfg["layout"]` (default `desk`)
  against `sorted(p.name for p in (skeleton/"layouts").iterdir() if
  (p/"layout.css").exists() and (p/"layout.js").exists() and
  (p/"chrome.html").exists())`; unknown layout -> itemized error listing
  available layouts.
- Read the three layout files; run `HEX_RE`, `EXTERNAL_RE`, `check_grid` on
  `layout.css` and `check_js` on `layout.js`; append to the CSS/JS slots so the
  existing external-asset scan covers them.
- Inject layout files + `__LAYOUT__` name during assembly.
- No change to outline, mount, assignment, window, or key logic.

## 7. SKILL.md → v2.9

- Add the layout axis to §1.2 (reneame/extend: "Pick + tune the theme **and pick
  the layout**"), the four-pack table, and the auto-selection rule (§2 above).
- `build.json` schema example gains `"layout"`.
- Shell marker reference (§1.4) gains the four new markers.
- Part 2 architecture note: all four layouts render the same section list; the
  layout only changes chrome/nav.
- Part 8 opening message gains a line:
  `Layout: <name> — <why>`.
- Note that `desk` is the default and the fallback when no layout is chosen.

## 8. Testing

New `tests/test_shell_layouts.py`:

- For each layout in `desk, app, feed, sheet`: build a minimal workdir with
  `layout` set and assert `errs == []`; output contains `data-layout="<name>"`;
  the layout's chrome markers are substituted; `@media print` and the
  reveal-all print rule are present; section count in output equals the fixture.
- Unknown `layout` value -> error naming available layouts.
- Missing `layout` -> builds as `desk`.
- Hex / external asset in a layout CSS/JS fails with the same messages as
  component CSS/JS.

Fixture updates (phase 1):

- `tests/test_build.py`: `MINI_SHELL` gains the four new markers and a
  `data-layout` body attribute; `make_skel` creates
  `layouts/desk/{layout.css,layout.js,chrome.html}` minimal stubs.
- `tests/test_shell_tabs.py`: assertions that currently read `shell.html` for
  desk chrome (`id="lnToc"`, `js-tabs`, `LN._showSection`, `aria-current`) are
  retargeted to `skeleton/layouts/desk/` + the assembled output.
- `tests/test_shell_smoke.py`: copy `skeleton/layouts/` into the temp skeleton;
  keep asserting `Reset all activities` and `LN.boot();` in the assembled desk
  output.

Regression: `test_shell_smoke`, `test_shell_tabs`, `test_build`,
`test_themes_matrix`, `test_components_matrix`, `test_assignment_*` must stay
green. Manual QA per layout on a 390px-wide phone viewport, a 820px tablet, and
desktop: read a section, run an activity, open/close the assignment, print
preview, and disable JS.

## 9. Phasing (each phase independently buildable and testable)

1. **Refactor + `desk` extraction.** Add markers, move desk chrome/CSS/JS into
   `skeleton/layouts/desk/`, add the nav contract, update fixtures/tests.
   Zero visual change; all tests green.
2. **`app` layout** + `test_shell_layouts.py`.
3. **`feed` layout.**
4. **`sheet` layout.**
5. **`build.py` validation wiring, SKILL v2.9, sample demos for all four
   layouts, docs, and a full regression run.**

## 10. Out of scope

- No per-lesson custom layout authoring; only the four shipped layouts.
- No sub-navigation inside a section; no changes to the assignment deck,
  encryption, time lock, grading key, or `assignment_smoke.js`.
- No new component library entries (layouts are shell-level, not components).
- No change to section agents, `outline.json`, or the source-only rules.

## Spec self-review

- **Placeholders:** none; all four layouts, markers, files and tests are named.
- **Consistency:** the `layout` axis is introduced once and used consistently;
  `desk` is both a layout value and the missing-key default; the nav contract is
  defined once in §3.3 and referenced by §4.
- **Scope:** one coherent feature (layout axis + three new shells). Phase 1 is a
  prerequisite refactor that ships no user-visible change, which keeps the
  larger feature reviewable in pieces.
- **Ambiguity:** the selection rule has an explicit tie-break and an override
  (`build.json > layout`); "one section at a time" layouts are those that add
  `js-tabs`, stated in §3.3 and §4.
