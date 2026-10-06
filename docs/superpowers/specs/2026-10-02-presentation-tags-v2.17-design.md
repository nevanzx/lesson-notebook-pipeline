# Present Mode v2.17 — pinned section titles, tagged calculations, fixed host bar

Date: 2026-10-02 · Status: draft for review
Note (superseded): the pinned-title mechanism was removed — present mode now keeps
the section `<h2>` in normal flow, identical to reading mode (it no longer pins,
sticks, or reserves an offset). The calculation-tagging and fixed-host-bar parts
below remain in force.
Supersedes the marker section of `2026-10-02-presentation-mode-design.md` (v2.16).

## 1. Context

v2.16 shipped presentation mode: the shell's `LN.present` engine keeps every
`[data-present]` subtree and strips the rest into a nested bullet outline, invoked
from the `app` bottom bar or the HTML Viewer via `postMessage`. Three gaps surfaced
in use:

1. **The section title disappears.** The `<h2>` is untagged, so present mode hides
   it. A projected lesson then has no on-screen heading naming the current section.
2. **Calculations can be dropped.** The v2.16 rules tagged definitions and key
   points, but did not require formulas or worked examples to carry a marker. A
   projected arithmetic lesson can hide exactly the arithmetic it exists to teach.
3. **The nav bar drifts in the Viewer.** Present mode leaves the Viewer's
   `<footer>` visible and does not pin `#stageWrap`, so the host page scrolls a
   little; the iframe (and the lesson's own bar inside it) is dragged with it.

Standalone files are unaffected: the `app` bar is `position:sticky;top:0` at
desktop and `position:fixed;bottom:0` on phones, verified stable under scroll.

## 2. Goals / non-goals

Goals:

- (a) Every teaching section shows a **pinned title** in present mode.
- (b) Every **calculation** (formula block and worked example) survives present
  mode, kept whole, MathML intact.
- (c) In the HTML Viewer, the lesson's nav bar stays put; the host page does not
  scroll around the iframe.
- (d) The marker stays a single lightweight attribute authored per section; no
  second artifact, no auto-detection by class.

Non-goals:

- No slideshow, no per-node reveal, no new layout. One section at a time as today.
- No change to reading mode, the assignment, the unlock flow, or the checker.
- No change to exempt sections (`overview`, `glossary`, `selfcheck`/`self-check`,
  `assignment`/`assign`, `recap`): they still carry no tags and drop out.

## 3. Marker contract

### 3.1 `data-present="0"` — the pinned section title

A teaching section's **`<h2>`** carries `data-present="0"`.

- `0` is a reserved depth meaning **section heading**: shown pinned above the
  outline, **not** a bullet, excluded from depth numbering.
- `0` is legal **only** on an `<h2>`. Exactly one `0` per teaching section, and it
  must be the section's title heading.
- Positive values `1..N` keep v2.16 semantics: a tagged element is kept whole
  (its entire subtree), and its `N` is its bullet depth.

### 3.2 Calculations

- Every **formula block** (`.def`/`.card` carrying a formula and its `Where:`
  list) is tagged at its natural positive depth and kept whole.
- Every **worked-example block** (the `Worked — <topic>` `.def` with numbered
  steps, and any tabular computation) is tagged at its natural positive depth and
  kept whole.
- Depth assignment is unchanged from v2.16 §4.1: `1` = the section's core
  concept/formula, `2` = its key explanations/examples, `3+` = deeper support.
  A calculated result that is the section's anchor gets `1` (or `2` when a
  definition precedes it).
- Markers never nest; depth never skips a level; the section root is never tagged.

### 3.3 Mandatory set

For every non-exempt (`teaching`) section:

- exactly one `data-present="0"` on the `<h2>`, and
- at least one positive-depth `[data-present]` in the body.

A section whose h2 is the only marker is a build error (the title is not content).

## 4. Engine — `LN.present` (shell)

### 4.1 Collect headings separately

Add a `headings()` collector for `section.block[id] h2[data-present="0"]`.
`tagged()` is unchanged (it already ignores non-positive values), so headings
never enter the outline or the depth bookkeeping.

### 4.2 Apply

In `apply()`:

- For each heading element, add `ln-pres-title` (and `ln-pres-keep` via the
  existing section pass). Do **not** add `ln-pres` / `ln-pres-dN`; do not update
  `lastByDepth`.
- The tagged-section pass already keeps a heading's section; `hideTextNodes`
  leaves the heading whole because it carries the attribute.

### 4.3 Sticky placement

The `app` chrome occupies the top of the viewport in two places: `.ln-app-top`
(sticky, mobile only) and `.ln-app-bar` (sticky top:0 at ≥1024px, fixed bottom
below that). The engine measures the top-most visible chrome once on `on()` and
on `resize`, writing a pixel value into `--ln-pres-top`; the title pins below it:

```css
body.ln-present .ln-pres-title{
  position:sticky; top:var(--ln-pres-top,0px); z-index:30;
  background:var(--bg); padding:10px 0; margin:0 0 12px;
  border-bottom:1px solid var(--grid);
}
```

`z-index:30` keeps the title under `.ln-app-bar` (`z-index:40`). A solid
`var(--bg)` backing prevents outline text bleeding through while scrolling.

### 4.4 Ancestor overflow

Sticky fails inside an `overflow:hidden` ancestor (the nearest scroll container
never scrolls). Parchment sets it on `.app .sheet` and `.app section.block`.
Present mode overrides it:

```css
body.ln-present .app .sheet,
body.ln-present section.block.ln-pres-keep{overflow:visible}
```

Decorative clip is sacrificed only while presenting.

### 4.5 Exit

`off()` removes `ln-pres-title` via `clearClasses()`, restores hidden nodes as
today, and clears `--ln-pres-top`. Reading mode is untouched.

## 5. Viewer host fix

Root cause: present mode hides `header` and `main > .card` but leaves `<footer>`
and does not take `#stageWrap` out of flow. The host document is ~48px taller
than the viewport, so it scrolls and drags the iframe (and the lesson's bar).

Fix, in `body.ln-viewer-present`:

```css
body.ln-viewer-present{overflow:hidden}
body.ln-viewer-present footer{display:none}
body.ln-viewer-present #stageWrap{position:fixed;inset:0;margin:0}
body.ln-viewer-present #stage{width:100%;height:100%;min-height:0;border:0;border-radius:0}
```

The iframe now exactly fills the viewport; the host cannot scroll; the lesson's
own sticky/fixed bar stays where it belongs. The floating `#presentExit` remains
above everything (`z-index:100`).

## 6. build.py validation

`check_present()` gains:

- Parse values; a value may be `0`. Non-integer / negative strings still fail.
- `0` is allowed **only** when the marker sits on an `<h2>` (find the owning tag
  via the preceding `<tag`); otherwise error: "`data-present=\"0\"` is only valid
  on the section title `<h2>`".
- At most one `0` per section; a second is error "section %r has more than one
  title marker".
- Non-exempt section must have exactly one `0` (message names the title) **and**
  at least one value `>=1`.
- Depth-skip and nesting checks run over the positive values only; `0` is ignored.
- Section-root rule unchanged (a `0` on the root still fails).

Existing error text/`fix` hints updated to name `data-present="0"`.

## 7. Tests / QA

- `tests/test_present_build.py`
  - valid: `0` on h2 + a `1` body marker builds.
  - fail: `0` on a non-h2 element.
  - fail: two `0` markers in one section.
  - fail: title marker only (no positive body marker).
  - existing positive/int/depth/nesting cases still pass.
- `v2/tools/present_smoke.js`
  - built sample contains `h2 ... data-present="0"`.
  - present CSS exposes `.ln-pres-title`.
  - engine exposes a headings collector / `--ln-pres-top`.
- `checker/app/test/viewer_present.test.js`
  - present CSS hides `footer`, fixes `#stageWrap`, sets host `overflow:hidden`.
- `node v2/tools/layout_smoke.js <built> --present` and `--present --width 390`:
  `LAYOUT OK` (pinned title and outline must not spill at either width).
- Manual: project the sample, scroll a long section, confirm the title stays under
  the bar and the outline scrolls beneath it; open through the Viewer, present,
  scroll, confirm the lesson bar does not move.

## 8. Generation rules (SKILL.md)

- §2.0b: add `data-present="0"` (title) and the calculation-tagging rule.
- Part 4 brief template: instruct the agent to put `data-present="0"` on the
  `<h2>`, tag every formula and worked example at its natural depth, and keep the
  existing positive-depth rules.
- Version `2.16 → 2.17`; add a "What v2.17 adds" paragraph.

## 9. Files touched

- `v2/skeleton/shell.html` — `headings()`, title class, `--ln-pres-top`
  measurement, present CSS (sticky title, overflow override).
- `v2/build.py` — `check_present()` title rules.
- `v2/SKILL.md` — marker + calculation rules, brief template, version.
- `v2/sample/lesson-demo/sections.html` — title tags; rebuild output.
- `v2/tools/present_smoke.js`, `tests/test_present_build.py`,
  `checker/app/test/viewer_present.test.js` — assertions.
- `checker/app/viewer.html` — host present-mode CSS.
- `docs/` — this spec + implementation plan.

## 10. Open questions

None. Decisions: `data-present="0"` reserved for the section `<h2>` and mandatory
on teaching sections; calculations tagged at natural positive depth and kept
whole; sticky title measured under the top chrome; host pinned to inset:0 with
footer hidden so the lesson bar cannot drift.
