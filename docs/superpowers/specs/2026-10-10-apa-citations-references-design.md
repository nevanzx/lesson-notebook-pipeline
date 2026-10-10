# APA 7th-edition citations + References in every notebook — design

Date: 2026-10-10
Status: approved (design); implementation plan pending
Owner: interactive-lesson-notebook skill (`v2/`)
Target skill version: v2.22

## Problem

Every notebook the skill produces must be academically sourced: it must carry
**in-text citations** at each attributed fact, definition, or number, and a
**References** list at the end, both formatted in **APA 7th edition**. Today the
skill has no such requirement. It only has a `CITATIONS` block in `src/full.txt`
for `specification` (authored, no-source) builds, and that block never reaches
the student HTML. `teaching` builds carry no citations at all.

The rule the user set is universal: **whenever we create the HTML, it must have
both citations and references in APA 7th edition.**

## Scope

Applies to **every build**, both source types:

- `teaching` — the facts come from the handout; cite the external works the
  lesson itself draws on (a textbook, statute, circular, article). When the
  lesson names no external work for a fact, cite the lesson source document
  once (institution, year/n.d., title, "Course handout").
- `specification` — the content was authored against named standards; those
  standards (and any other real document used) are the cited works. This
  generalizes the existing `CITATIONS` block requirement: its references must
  now also appear in the shipped HTML as APA-7 entries.

A number or definition may not ship without a citation.

## What ships in the HTML

### 1. In-text citations

APA 7 in-text form in section prose, at the point of the attributed fact:

- Parenthetical: `(Bangko Sentral ng Pilipinas [BSP], 2019)`; short form
  `(BSP, 2019)` after first mention.
- Narrative: `BSP (2019) requires …`.
- Direct quote: add a page/paragraph locator `(BSP, 2019, p. 12)`.
- Two authors: `(Reyes & Cruz, 2020)`. Three or more: `(Reyes et al., 2020)`.
- `&` inside parentheses; `and` in narrative.
- Same author + year: `(BSP, 2019a)`, `(BSP, 2019b)`; the suffix matches the
  References entry.

In-text citations are ordinary student-facing prose. They are permitted subject
matter — the same class as the already-allowed "Under BSP Circular 808 …" — and
are not provenance narration (Part 9.1 self-reference ban is unaffected: the
notebook still never narrates how it was built).

### 2. The References section

A new **mandatory** `references` section, shipped **last** (after Recap), with
its own `<h2>` (conventionally `9&nbsp; References`):

```html
<section class="block" id="references">
  <h2>9 &nbsp;References</h2>
  <ul class="refs">
    <li>Bangko Sentral ng Pilipinas. (2019). <em>…title…</em>. https://…</li>
  </ul>
</section>
```

APA-7 reference list rules:

- Alphabetical by first author surname (then year).
- **Hanging indent** (via a new `.refs` list class).
- Sentence case for article/chapter titles; italic title/volume for the
  book/journal.
- Year in parentheses after the author; `(n.d.)` when unknown; `2020a`/`2020b`
  disambiguation.
- Entry types: book, journal article, edited chapter, report/standard,
  statute/regulation, circular, webpage.
- Every entry is cited in text at least once; every in-text citation resolves
  to an entry.

### 3. DOI/URL handling (offline preserved)

APA-7 references for web sources carry a `https://doi.org/…` or URL **as plain
text**. This is allowed **only inside the generated References block**. The URL
is never fetched, linked, or loaded — it is visible text, so offline behavior is
unchanged. The external-asset ban keeps full force everywhere else (no `src`,
no `href`, no `url()`, no `@import`).

## How it is produced in the pipeline

### Per-section references sidecar

Each content section agent (Part 4 step C) writes a third file beside its two
existing files:

```
parts/NN-<id>.sections.html   (inline APA in-text citations in the prose)
parts/NN-<id>.data.js
parts/NN-<id>.refs.json       (NEW)
```

`parts/NN-<id>.refs.json`:

```json
{
  "refs": [
    {"key": "bsp781", "text": "Bangko Sentral ng Pilipinas. (2019). …"},
    {"key": "ifrs9",  "text": "International Accounting Standards Board. (2014). …"}
  ]
}
```

- `key` — unique slug (dedup handle).
- `text` — a complete APA-7 reference entry, plain text.

Sidecars are isolated per section, so no agent ever sees another section's
files; the merge happens in the assembler. Monolith builds (no `parts/`) supply
a workdir-root `refs.json` with the same schema.

### Assembler (build.py)

- **Merge.** Read `workdir/refs.json` (optional) and every
  `parts/*.refs.json` in filename order; concatenate `refs`; dedup by `key`
  (two entries with the same key and different `text` → error). Result:
  `merged_refs`.
- **Generate the block.** Render the `references` section from `merged_refs`
  (sorted by the entry's leading surname + year), and place it **after the last
  outlined section**. The `<h2>` text is taken verbatim from the mandatory
  `outline.json` entry whose id is `references`.
- **Contract.** `outline.json` must declare exactly one section with
  `"id": "references"` (`from: []`), exactly as `glossary` does. Missing →
  error. The generated block satisfies the outline/coverage/drift checks.
- **Exemptions.** `references` is added to `PRESENT_EXEMPT` (build.py:595) so it
  needs no `data-present` markers, and to the activity-number skip list in
  `tools/activity_numbers.py`.
- **External-asset scan.** The generated block is kept separate from
  `parts["sections"]`, which is what the HEX/EXTERNAL/provenance scans read.
  The block is validated on its own (non-empty, well-formed) and concatenated
  only when the shell is filled. So a DOI in References never trips
  `EXTERNAL_RE`, and a URL anywhere else still fails the build.

### New build.py rule — `references`

A build fails (exit 1, itemized report) when:

- `outline.json` has no `references` section; or
- no reference entry is merged (no `refs.json` / empty `refs`); or
- no in-text citation is present in the hand-authored sections; or
- an in-text `(Surname, Year)` / `Surname (Year)` citation does not resolve to a
  merged reference (normalized surname + year match); or
- a merged reference is never cited (orphan entry).

The citation↔reference match is deliberately lenient (normalized surname and
year), because APA in-text text is not a stable key. The strict part is that the
sets must agree in both directions.

## Shell change

Add to `skeleton/shell.html` vocabulary CSS (no hex, tokens only):

```css
.refs{margin:0;padding-left:0;list-style:none}
.refs li{margin:.35em 0;padding-left:1.6em;text-indent:-1.6em}
```

## SKILL.md changes (v2.22)

- Changelog line for v2.22 (citations + References, every build).
- New §2.7 "Citations and References (APA 7th edition)": the rules above.
- §2.0b and the `PRESENT_EXEMPT` list: add `references`.
- Section-architecture table: add row `9 References` (mandatory, last).
- Part 4 file table: add `parts/NN-<id>.refs.json`; brief template gains the
  sidecar + inline-citation instructions.
- Part 5 QA: a citations↔references consistency check (APA-7 form per type, no
  invented works).
- Part 8 opening message: a line reporting the number of works cited.
- Source types: extend the `specification` `CITATIONS` block to state its
  references reach the HTML; add the `teaching` citation default.

## Impact

| File | Change |
|---|---|
| `v2/SKILL.md` | v2.22 changelog, §2.7, table/§2.0b/Part 4/5/8 edits |
| `v2/build.py` | refs merge, block generation, `references` rule, `PRESENT_EXEMPT`, scan split |
| `v2/skeleton/shell.html` | `.refs` list CSS |
| `v2/tools/activity_numbers.py` | `references` in `skip_sections` |
| `v2/sample/*` | add `references` to every `outline.json`; add `refs.json` |
| `tests/` | refs merge, block generation, missing/unmatched/orphan failures, DOI-in-refs allowed, URL-elsewhere fails |
| `README.md` | one line in the build-gates list |

## Non-goals

- No bibliography-management of `src/full.txt` beyond what already exists.
- No live lookup of DOIs or metadata; agents author the entries.
- No requirement that `teaching` sources cite their own handout when the
  handout already names its external sources.
