# Assignment UI Redesign — "Split Panel" (Concept 3)

Date: 2026-10-01 · Status: draft for review
Visual reference: `assignment-ui-mockups.html`, concept 3 ("Split panel")

## 1. Context

The graded assignment ships today as the in-lesson `assignment` shell component
(`v2/skeleton/components/assignment/component.css` + `component.js`). Section 7 mounts it;
the Begin card sits inline in the section, and Begin opens a fullscreen overlay (`.lna-over`)
holding the identity gate and the one-question-per-screen deck (flat or DAG). Submit
downloads the RSA-OAEP-256 + AES-GCM encrypted JSON. None of the flow is changing.

The problem is purely visual. The current deck is flat: a plain bordered card, a 9 px dot
row that wraps into noise at 20 items, faint bordered option rows with no selected state,
a cramped two-button footer, and a boxed identity form. There is no hierarchy and little
sense of "where am I" during a graded assessment.

This design restyles the existing component to **concept 3 — Split panel**: a meta rail
beside the question on wide screens that collapses to a slim strip on phone and tablet.
It keeps every screen, class hook, and guard; it changes presentation, spacing, states,
and responsiveness only.

## 2. Goals / non-goals

Goals:

- (a) A clean, modern, utility look that reads the same quality as the rest of the lesson.
- (b) A **meta rail** (assignment title, position/layer, progress, and — in DAG — the path
  taken) beside the question on desktop; a slim horizontal strip on phone and tablet.
- (c) Clear selected / focus / locked states for every control.
- (d) True responsiveness at **phone (≤600 px)**, **tablet (601–1023 px)**, and
  **desktop (≥1024 px)**.
- (e) Theme-agnostic: colours come only from existing theme tokens, so parchment, opal,
  studio, and ledger all look deliberate.

Non-goals:

- No change to the flow, screens, gating, encryption, DAG/flat semantics, watermark, or
  guards.
- No new components or registry entries; `assignment` stays one component.
- No new theme tokens unless a later step proves one is unavoidable.
- No timer/countdown is added (the mockup's clock is decorative and is intentionally
  omitted).
- No change to `build.py`, the shell, the checker, or the submission envelope.

## 3. Design

### 3.1 Visual system (tokens only)

| Purpose | Token(s) |
|---|---|
| Fullscreen backdrop / cards | `--surface`, `--surface-2` |
| Borders, hairlines | `--grid`, `--grid-strong` |
| Body ink / secondary / meta | `--ink`, `--ink-soft`, `--ink-faint` |
| Primary action, selected option, rail edge | `--accent`, `--accent-deep` |
| Selected-option fill, rail tint | `--highlight` |
| Open gate | `--green`, `--green-bg` |
| Locked / checking gate | `--amber`, `--amber-bg` |
| Error | `--red`, `--red-bg` |
| Shape | `--radius` (cards), `10px` (controls) |
| Depth | `--shadow` (cards), always paired with a border — studio's `--shadow-sm` is none |
| Type | `--sans` body, `--mono` labels/counters, `--display` for the Begin-card title |

No hex, no `url()`, no `<style>`, no inline CSS — the same rules build.py already enforces
on component CSS.

### 3.2 Screens

**Begin card (`.lna-entry`, inline in Section 7).** Left `--accent` edge. A top row pairs a
mono eyebrow ("Assignment · to be submitted") with a state pill — `Open today`
(`--green-bg`/`--green`), `Checking…` or `Locked` (`--amber-bg`/`--amber`). Title in
`--display`. Intro paragraph in `--ink-soft`. A meta chip row (mode + length, "Encrypted
submit", the window day) derived from the data + `windowMeta()`. Full-width primary
`Begin assignment` (`.lna-begin`). The existing `.lna-gate` status line and fine print sit
beneath the button; `.lna-lock-open` / `.lna-lock-shut` / `.lna-lock-link` are restyled as
tinted notice boxes rather than bare text.

**Identity gate (`.lna-ident`).** Centered card, left `--accent` edge, `--shadow`. Title,
subtitle, then the existing `.lna-form`: two name fields side by side, the 8-digit ID full
width. Fields get a `--accent` focus ring (`box-shadow: 0 0 0 3px --highlight`); invalid
fields use `--red`. Primary `Verify identity & start quiz` (`.lna-start`), full width.

**Deck (`.lna-deck.open.lna-over`).** A new `.lna-shell` splits the view:

- **Rail (`.lna-rail`).** Eyebrow "Assignment", the assignment title, a large position
  counter, and an "Encrypted submit" meta line. In DAG mode it also lists the path taken
  (`.lna-path`, from `state.path` labels) with the current layer marked; flat mode omits
  the list. Desktop: a left column on `--surface-2` with a `--accent` right edge. Phone and
  tablet: a slim horizontal strip (title + counter inline) above the question.
- **Main (`.lna-main`).** The existing `.lna-head` (`.lna-prog` text + `.lna-dots`), the
  question slides, the error box, and the nav.

**Progress.** The existing `.lna-dots` / `.lna-dot` row is kept in the DOM (a smoke-test
hook) and restyled into a **segmented bar**: `.lna-dots` is a flex row of equal-width
segments, `.lna-dot` a 6 px rounded segment, `.done` filled `--accent-deep`, `.on` filled
`--accent`. This turns the current 20-dot wrap into a clean progress meter without changing
the progress logic. `.lna-prog` keeps its exact text format (`Question k of M` /
`Layer k of L`); it is hidden on desktop (the rail carries the counter) and shown on phone
and tablet. Because it is hidden with CSS only, its `textContent` — which `assignment_smoke`
reads — is unchanged.

**Question typography.** `.lna-q` becomes a larger, tighter semibold prompt. `.lna-opt`
becomes a selectable row: `--grid-strong` border, `.lna-opt-badge` letter/number, and a
selected state via `.lna-opt:has(input:checked)` — `--accent` border, `--highlight` fill,
`--accent` edge, and a check mark. `tf` renders True/False rows the same way; `id` uses
`.lna-txt`; `sa` uses `.lna-area`. All inputs get the accent focus ring.

**Nav.** `.lna-nav` is a footer with a top hairline; on phone and tablet it is sticky to the
bottom of the overlay with full-width buttons (`Back` ghost, `Next` primary). DAG keeps
Next-only then Submit at the leaf; the Submit button text stays exactly `Submit`.

**After submit.** A centered success card (`--green-bg` badge) naming the downloaded file;
`Close` (`.lna-close`) as a ghost button.

### 3.3 Responsive breakpoints

| | Phone ≤600 px | Tablet 601–1023 px | Desktop ≥1024 px |
|---|---|---|---|
| Rail | slim strip (title + counter) | slim strip | left column, 240 px |
| Sheet width | 100% | 760 px | 1040 px |
| Identity fields | one column | two columns | two columns |
| Nav | sticky, full-width buttons | sticky, full-width buttons | inline, right-aligned |
| Padding | 12–16 px | 20–24 px | 28–40 px |

Breakpoints are **viewport** media queries on the fullscreen deck (the overlay is
viewport-sized), not container queries. The inline Begin card simply inherits the section
column, so it needs no extra breakpoint beyond stacking its chips.

## 4. Implementation

### 4.1 `component.js` (small, additive)

- Wrap the quiz body: `.lna-quiz` → `.lna-shell` → [`.lna-rail`, `.lna-main`]; move the
  existing `head`, `errB`, slides, and `navA/B/C` under `.lna-main`. `.lna-quiz` stays the
  single hidden wrapper, so `show()`/`showIdent()` and the `lna-quiz` hook are untouched.
- Build `.lna-rail` once with: eyebrow, `d.title` (fallback document title), a `.lna-rail-count`
  span, and (DAG only) a `.lna-path` list. `show()`/`showDag()` continue to update
  `.lna-prog` and `.lna-dots`; they additionally update `.lna-rail-count` and append the
  latest DAG choice label to `.lna-path`.
- Begin card: add the meta chip row and the state-pill element next to the existing
  `.lna-gate`; the gate renderer sets the pill class alongside `.lna-lock-*`.
- No behavior, event, or state changes. The invariant holds: `show()` remains the sole
  recompute point for the Next-disabled state and the progress markers (now the segments).

### 4.2 `component.css` (rewrite)

Replace the current 85-line stylesheet with the concept-3 system. All existing `.lna-*`
selectors kept; new: `.lna-shell`, `.lna-rail`, `.lna-rail-count`, `.lna-path`, `.lna-main`,
`.lna-meta`, `.lna-pill`. Every grid track clamped (`minmax(0, 1fr)`), every child
`min-width: 0`, and boxes sized to content (no fixed `min-height`) per §1.5.

### 4.3 Theme compatibility

Only tokens listed in §3.1 are used, all of which every pack already defines (`--highlight`,
`--accent-2`, `--green-bg`, `--amber-bg`, `--red-bg`, `--display` present in all four,
verified). `tune.css` overrides keep working because the component reads tokens, not
literals. No theme file changes are proposed.

### 4.4 Preserved hooks / invariants

Class hooks that tests and code rely on and MUST remain: `.lna-begin`, `.lna-start`,
`.lna-first`, `.lna-last`, `.lna-id`, `.lna-name`, `.lna-quiz`, `.lna-ident`, `.lna-deck`
(`.open`), `.lna-lock-open`, `.lna-lock-shut`, `.lna-lock-link`, `.lna-prog`, `.lna-dots`,
`.lna-dot` (`.done`, `.on`), `.lna-q`, `.lna-opt`, `.lna-txt`, `.lna-area`, `.lna-back`,
`.lna-next`, `.lna-exit`, radio `name` patterns, and the `textarea`. Button labels `Next →`,
`← Back`, and `Submit` keep their exact text. `show()` is the sole recompute point.

## 5. Accessibility & states

- Options are real `<label><input type="radio">` pairs — keyboard and screen-reader operable;
  the selected state adds a check mark, so it is never colour-only.
- Visible `:focus-visible` ring (`--accent` + `--highlight` halo) on every control.
- Contrast stays within the existing WCAG floors build.py checks.
- Locked/gate notices use semantic tints plus text, never tint alone.

## 6. Testing

- **`node v2/tools/assignment_smoke.js`** — must stay `SMOKE OK` (flat + DAG). It is the
  guard for the Next-disabled class and reads the preserved hooks. It should pass with **no
  test change**; if the progress-marking assertions must move (dots → segments), change only
  those assertions, never the Next-enables checks.
- **`node v2/tools/layout_smoke.js <built.html>`** — require `LAYOUT OK` at desktop **and**
  `--width 390`: the rail, the sheet grid, and the option rows must not spill or clip.
- **`node v2/tools/activity_smoke.js`** — unaffected; re-run to confirm.
- **Manual visual QA** — open a built lesson at phone / tablet / desktop widths in all four
  themes; confirm the rail collapse, selected/focus/locked states, DAG path trail, and the
  after-submit card.

## 7. Files touched

- `v2/skeleton/components/assignment/component.css` — rewritten (concept 3).
- `v2/skeleton/components/assignment/component.js` — rail/shell/begin-chips DOM additions.
- `v2/skeleton/components/assignment/README.md` — note the new layout and hooks.
- `v2/tools/assignment_smoke.js` — only if a progress assertion must retarget (prefer none).
- Built lessons/samples — regenerated on next build; existing shipped `.html` files keep the
  old inlined UI until rebuilt.

## 8. Rollout

1. `component.css` + `component.js` in place; `assignment_smoke.js` green.
2. `layout_smoke.js` green at desktop and 390 px.
3. Manual QA across four themes and three widths; rebuild the sample lesson to eyeball it
   end to end.

## 9. Open questions

- None. Decisions: redesign the existing in-lesson `assignment` component in place; concept 3
  (Split panel); viewport media queries (`≤600 / 601–1023 / ≥1024`); reuse `.lna-dots` as a
  segmented progress bar; colours from existing tokens only; no timer; no flow change.
