# No build-provenance narration in the notebook HTML (v2.21)

Date: 2026-10-09 · Status: draft for review

## 1. Context

The Week 9 and Week 10 notebooks (both `specification` sources — the FM102 syllabus
that names coverage but carries no teaching body) shipped student-visible content
that narrates how the notebook was built:

- `Week10-Notebook.html` carries a `<div class="note y">` box led by
  **"Sourcing."**: "The course syllabus named what this week must cover and carried
  no teaching body, so this week's text is written against the standards its own
  outcomes name…" (source: `build/week10-operations/parts/01-overview.sections.html`).
- The authored source specs for Weeks 9 and 10 begin with an internal
  `SOURCE: specification … AUTHORED teaching text, not extracted` header
  (`build/*/src/full.txt` and the per-section `src/*.txt` slices).

The `src/*.txt` header is correct and must stay: it is the build-time declaration
that drives the opening message (§Source types rule 4, Part 8). The defect is that
the header's content was **copied into a shipped part**. Provenance narration is
content about the notebook itself, not about the subject, and it must never reach
the student-facing HTML — for either source type.

Note: Week 9's other self-referential box ("What this week is rehearsing for…",
graded-deliverable/LE-2 framing) is **out of scope** and stays, by explicit user
decision. This spec bans build-provenance/sourcing narration only.

## 2. Goals / non-goals

Goals:

- (a) A hard skill rule forbidding build-provenance narration in any part, for both
  `teaching` and `specification` sources.
- (b) A mechanical guard in `build.py` that fails the build when a provenance marker
  appears in the merged `sections.html` or `data.js`.
- (c) Remove the leaked `Sourcing.` box from the existing Week 10 notebook and
  rebuild it, without rotating keys or changing the encrypted assignment.

Non-goals:

- Not removing assessment/graded-deliverable framing ("what this week is rehearsing
  for") — kept by decision.
- Not changing the `src/full.txt` `SOURCE:` header, the opening message, or the
  citation model.
- Not banning factual attributions to real external documents (a law, circular,
  textbook, or clause named *as the source of a taught fact*) — those are subject
  matter.
- Not touching the `_backup-…` folders.

## 3. Rule contract

Forbidden in `parts/*.sections.html` and `parts/*.data.js`, for **both** source
types:

1. **Source-type declarations** — `source: specification`, `source: teaching`,
   "this is a specification source".
2. **Authored-vs-extracted statements** — "authored", "not extracted", "carried no
   teaching body", "sections 1–N of this file are authored teaching text",
   "written against the standards the outcomes name".
3. **A `Sourcing.` / provenance note box** that explains where the week's text came
   from or how it was produced.

The declaration lives in exactly two places and nowhere else: the `SOURCE:` header
of `src/full.txt` (build input) and the **opening message** (§Source types rule 4;
Part 8).

**Permitted** (not provenance): naming a real law, circular, standard clause,
textbook, or regulation *as the source of a fact being taught* — e.g. "Under BSP
Circular 808, a bank must…". That is subject matter and is exactly what a
`specification` build is supposed to cite.

## 4. SKILL.md changes

- **§9.1 (invention class).** Add a bullet: *No build-provenance narration
  (self-reference class)* — the notebook teaches the subject and never narrates its
  own construction; lists the three forbidden categories above; states that the
  declaration lives only in the `src/full.txt` header and the opening message; and
  states the factual-attribution exemption.
- **§Source types, rule 4 (currently ~line 251–253).** Append "— **in the opening
  message, never inside the notebook**: no part may contain a statement about how or
  from what the content was authored."
- **Section-agent brief (Part 1.1.C, hard rules).** Add a bullet: no self-reference;
  never state where this notebook's text came from or how it was authored (no
  `source: specification`, "authored/not extracted", "Sourcing…", "the syllabus
  carried no teaching body"); name a real law/circular/textbook only as the source
  of a fact.
- **Version.** Header `v2.20 → v2.21`; add a "What v2.21 adds" paragraph.

## 5. build.py validation

Add `check_provenance(sections_text, data_text, errors)`, built on the existing
`scan()` helper (rule id `provenance`). Case-insensitive marker alternation:

```
(?<![\w-])authored\s+teaching\s+text
|\b(?:is|are|was|were)\s+authored\b(?=[^.\n]{0,40}\b(?:for\s+the\s+(?:course|class)|teaching\s+text|not\s+extracted)\b)
|authored[^.\n]{0,60}?not\s+extracted
|carried\s+no\s+teaching\s+body
|\b(?:is|was)\s+(?:a\s+|the\s+)?specification\s+source\b
|\bsource\s*:\s*(?:specification|teaching)\b
|written\s+against\s+the\s+standards
|this\s+week'?s\s+text\s+is\s+written
|authored\s+against\s+the\s+standards
|<(?:strong|b)(?:\s[^>]*)?>\s*Sourcing\.
```

- Scan both `parts["sections"]` and `parts["data"]` (provenance can leak into prose,
  a note box, a glossary line, or feedback).
- Message names the rule and the offending line; hint: *"remove build-provenance
  narration — the source-type declaration belongs in the opening message and
  `src/full.txt`, never in a part."*
- Each alternative is context-bounded: `carried no teaching body` requires the word
  "teaching"; bare-passive `authored` requires an in-clause provenance cue (`for the
  course`/`class`, `teaching text`, or `not extracted` in the same sentence); `not
  extracted` requires a preceding `authored` in the same sentence; `specification
  source` requires a declarative `is`/`was`; the `Sourcing.` lead requires a bold tag;
  `source:` requires a word boundary. This fixes over-matching on ordinary subject
  prose (I2 and the fresh `specification source` false positive) and adds bounded
  alternatives for bare passive "authored", "specification source", and the bold
  `Sourcing.` box (I1).
- Wire into `assemble()` immediately after `check_present(...)` (currently ~line
  1656): `check_provenance(parts["sections"], parts["data"], errors)`.
- `src/*.txt` inputs are not scanned — the `SOURCE:` header there is required.

## 6. Remediation of the existing Week 10 notebook

1. Delete the `<div class="note y"> … Sourcing. … </div>` block (lines 37–39) from
   `build/week10-operations/parts/01-overview.sections.html`.
2. Rebuild from the workspace root (`…\FM102\Lessons and Question`):
   `python "D:\Python\lesson-notebook-pipeline\v2\build.py" build/week10-operations`.
   Keys are stable — `build/key/Week10-Notebook-key.json` and `build/key/unlock.key`
   exist and are reused, so the encrypted assignment and unlock key are unchanged.
3. Run the mandatory layout gate: `node "...\v2\tools\layout_smoke.js"
   Week10-Notebook.html`, then again with `--width 390`, until `LAYOUT OK`.
4. Confirm `Week10-Notebook.html` no longer contains "Sourcing." and that the build
   printed `OK`.

## 7. Tests / QA

- `tests/test_provenance_build.py` (same subprocess pattern as
  `tests/test_present_build.py`):
  - a clean workdir builds (`returncode == 0`);
  - a `sections.html` containing "carried no teaching body" fails and prints
    `provenance`;
  - a `data.js` containing `source: specification` fails and prints `provenance`;
  - a `sections.html` containing a genuine "Source: BSP Circular 808" fact citation
    builds successfully (no false positive).
- Rebuild verification for Week 10 (§6) plus the `layout_smoke.js` gate.
- Spot-check that Weeks 5/7/8/9 shipped HTML is unaffected (they contain no
  provenance box).

## 8. Files touched

- `v2/SKILL.md` — new rule, rule-4 tightening, brief bullet, version bump.
- `v2/build.py` — `check_provenance()`, wiring in `assemble()`.
- `tests/test_provenance_build.py` — new.
- `docs/` — this spec + implementation plan.
- Workspace (outside the repo): `build/week10-operations/parts/01-overview.sections.html`
  edited; `Week10-Notebook.html` regenerated.

## 9. Open questions

None. Decisions: ban build-provenance/sourcing narration only (assessment framing
stays); enforce with both skill prose (the primary contract) and a mechanical
`provenance` check; cite real external documents as facts is permitted; the
`src/full.txt` declaration and opening message are unchanged. The ten marker
alternatives are context-bounded so ordinary subject prose does not over-match (I2)
while bare passive "authored", "specification source", and the bold `Sourcing.` box
are still caught (I1).
