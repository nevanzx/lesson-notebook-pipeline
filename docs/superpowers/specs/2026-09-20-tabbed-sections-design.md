# Tabbed Sections — Design (2026-09-20)

## Context
Current notebook (`v2/skeleton/shell.html`) is a straight lesson: all
`section.block` stacked in one scroll, sidebar TOC with scroll-spy,
document-scroll progress bar.

User request: each section should be tabbed.
Decisions captured in brainstorming:
- Top tab bar, one section visible at a time.
- Extras: Prev/Next + progress + keep sidebar (synced, secondary).
- Scope: all future notebooks — change `skeleton/shell.html`, no per-lesson patch, no opt-in flag.

## Approach considered
- **A (chosen): shell-level tabs.** Tab bar generated from `section.block[id]`,
  toggle visibility, hash deep-link, Prev/Next footer, progress = position.
  No `build.py` marker change. Print + no-JS fall back to straight lesson.
- **B (rejected): per-section tab component.** Breaks outline contract
  (one `<h2>` per block), TOC, assignment fullscreen, print.
- **C (rejected): `tabs:true` flag in build.json.** Dual-layout maintenance;
  user explicitly wants tabs everywhere (YAGNI against optionality).

## Architecture
Change only `v2/skeleton/shell.html` (CSS + one nav container + footer nav + JS).
No changes to `build.py`, markers, components, themes, `outline.json` contract.
Shell-owned chrome list grows by: tab bar, tab Prev/Next footer. Sidebar TOC,
reset button, error banner, print stylesheet stay.

DOM additions (inside `.content`, above `<!--__SECTIONS__-->`):
- `<div class="tabs no-print" role="tablist" aria-label="Lesson sections">`
  with `<div id="lnTabs">` filled by JS (buttons `role=tab`).
- `<div class="tab-nav no-print">` with `#lnPrev`, `#lnCounter`, `#lnNext`.
- Sections keep `section.block[id]`; active panel gets `.active`,
  inactive get `[hidden]`. `body.js-tabs` class added at boot gates tab CSS
  so no-JS renders straight lesson.

## Components / behavior
- `LN._buildToc()` extended (or new `LN._buildTabs()` called from `LN.boot()`):
  iterate `section.block[id]` in document order, create tab button per section
  (`aria-controls=id`, `aria-selected`), reuse heading text (same source as TOC).
- `LN._showSection(i, pushHash)`: toggle hidden/active, set tab `aria-selected`
  + `.active`, sync sidebar link `.active`/`aria-current`, set
  `progress.width = (i+1)/n*100%`, update `#lnCounter` (`Section i+1 of n`),
  disable Prev at 0 / Next at n-1, `history.replaceState('#'+id)`,
  scroll `.sheet` top into view (respect `prefers-reduced-motion`).
- Events: tab click, sidebar link click (intercept → `_showSection` instead of
  default anchor scroll), Prev/Next click, `hashchange` (deep link),
  keydown on tablist (ArrowLeft/Right/Home/End).
- Progress semantic change: was document-scroll %; becomes tab-position %.
  Element `#lnProg` retained so existing tests pass.

## Data flow
No new data. Source of truth is DOM order of `section.block`.
Hash `#<id>` → initial index on boot; invalid hash → index 0.
No `LN.data` keys, no component registry change, no `build.json` change.

## Error handling
- Zero sections: tab bar empty, counter hidden, no throw.
- Unknown hash: fall back to first tab.
- Component mount failure: unchanged `LN.banner` path.
- Assignment (fullscreen deck) mounts inside its section panel; entering
  fullscreen from a hidden panel is impossible since panel must be active
  to click Begin — no extra handling.

## Styling / constraints
- Token colors only (`var(--*)`), no hex, no external URLs, no `@import`.
- Tab bar horizontal scroll on narrow screens (`overflow-x:auto`);
  grid `fr` clamp rule unaffected (no new grids, or use `minmax(0,1fr)`).
- Print (`@media print`): hide `.tabs`, `.tab-nav`, sidebar; force
  `section.block{display:block !important}` so all sections print in order.
- Contrast: active tab uses `--highlight` + `--ink` (same pair as sidebar
  active, already ≥ 4.5:1); focus-visible outline retained.
- Reduced motion: `html{scroll-behavior:auto}`, no tween on tab switch.

## Testing
- Existing pytest must stay green: `test_shell_smoke` (markers gone, print
  present, `LN.boot()`, Reset, lnErrors), `test_build`, themes/components matrix.
- Manual QA per built notebook: click every tab; reload with `#<section-id>`;
  Prev/Next + counter; progress advances; sidebar syncs both directions;
  mobile drawer open/close; assignment Begin → fullscreen → close returns to
  same tab; print preview shows all sections in outline order; JS disabled
  shows straight lesson.
- Rebuild demos (`opal-demo`, `parchment-demo`, `studio-demo`,
  `Component-Zoo-Demo`, `Week5-Notebook`) and eyeball one.

## Out of scope
- No per-lesson opt-out flag.
- No sub-tabs inside sections.
- No change to grading key, encryption, `assignment_smoke.js`.
- No promotion to new component library entry (shell change, not component).

## Spec self-review
- No TBD/TODO; scope is one shell file.
- Consistent: progress redefined once (position, not scroll); sidebar kept as
  secondary nav, not removed — matches user vote.
- No ambiguity: active = exactly one `section.block` unhidden; print = all.
