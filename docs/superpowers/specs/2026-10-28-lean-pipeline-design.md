# Lean Pipeline — v2.32 design

**Status:** proposed
**Date:** 2026-10-28
**Supersedes:** nothing; amends `interactive-lesson-notebook` v2.31 and the
`average-student-checker` pipeline role.

## 1. Problem

A lesson build is wall-clock-slow, and machine time is not the cause. Measured on
this machine:

| Step | Time |
|---|---|
| `python v2/build.py v2/sample/lesson-demo` | 1.2 s |
| `paragraphs.py` on the built file | 0.28 s |
| `layout_smoke.js` (desktop) | 3.5 s |
| `layout_smoke.js --width 390` | 2.9 s |
| `assignment_smoke.js` | 0.8 s |
| `deck_layout_smoke.js` | 20.3 s |

The cost is the agent orchestration. For an 11-section lesson the documented
workflow dispatches roughly:

- 11 section authors (`v2/SKILL.md:1046`) in batches of 3–4 (`:1047`);
- 11 clarity reviewers, one per section (`:1170-1190`);
- 11 numeric-freshness reviewers (`:1335`);
- 5 DAG authors + 5 DAG reviewers, serial by level (`:1205-1212`);
- 1 duplicate Section 7 author (the section brief writes `nodes[]` at
  `:1110-1113`, then D2 re-authors the same graph at `:1197-1213`).

That is ~38 agent invocations, plus unbounded author↔reviewer retries. Two
further defects make it worse:

1. The clarity reviewer is told to run "in the same batch as the section
   agents" (`:1173`), but it depends on their output — the batch promise cannot
   hold.
2. The final sweep re-runs the **Unclear** lens over the whole assembled file
   (`:1317-1323`) even though C2 already ran it per section. Only **Dense** was
   de-duplicated in v2.29.

Author-side waste compounds it: every author independently web-searches and
verifies citations (`:1139-1151`), and `merge_refs` dedupes only by `key`
(`v2/build.py:544-564`), so the same work can ship twice. Authors also re-read
the full `registry.md` for one or two components.

## 2. Goals and non-goals

**Goals**

- Cut agent invocations roughly in half without dropping the quality floor.
- Make the prose-clarity floor deterministic and testable.
- Fix the Section 7 duplicate authoring and the reviewer dispatch race.
- Make interactive lab components opt-in (off by default).
- Keep numeric verification of prose worked examples.

**Non-goals**

- Redesigning the DAG authoring model, the assignment encryption, the time
  gate, themes, or layouts.
- Deleting lab components from the library.
- Changing the student-facing notebook format or the teacher key format.

## 3. Design

### 3.1 Labs off by default

`build.json` gains a boolean `"labs"` key, default **false** when absent.

- `v2/build.py:1968` allowed-key set gains `"labs"`.
- A non-boolean `labs` is a build error.
- When `labs` is false, any component whose name ends in `-lab` (e.g.
  `break-even-lab`, `tvm-lab`, `port-lab`) is rejected. The `components` array
  is checked, which also covers mounts because a mount must already be listed
  in `components` (`v2/build.py:322`).
- Error text: `"<name> is a lab; set \"labs\": true in build.json or mount a
  practice set/activity instead"`.
- Sections use non-lab interactions instead: `step-solver` practice sets,
  `mcq`, `true-false`, `sort-statement`, `case-match`, `comparison-table`,
  `ranked-statements`, `flipcards`, `glossary`, `milo-list`.
- Section 3's "centrepiece" becomes prose + worked practice (`step-solver`) +
  one activity. The prose still carries every formula and worked calculation.
- With labs off, the merged reviewer no longer checks widget presets; it checks
  prose worked examples only.

**Migration:** every sample that mounts `break-even-lab` gets `"labs": true`:
`v2/sample/{lesson-demo,demo-app,demo-feed,demo-opal,demo-parchment,demo-sheet,demo-studio}/build.json`.

**Registry:** lab rows are marked opt-in; a short "default activity set" list
sits above them.

### 3.2 `v2/tools/prose_lint.py`

A stdlib tool that imports `paragraphs.py` helpers so the parser and the lint
never diverge.

```
python tools/prose_lint.py <built.html | part.sections.html>
    [--glossary <built.html>] [--json]
    [--max-words 40] [--max-sentence-words 30]
```

Two severities:

- **fail** — blocks the build.
- **review** — feeds the LLM shortlist; does not block.

| Rule | Signal | Severity |
|---|---|---|
| `dense_over_budget` | paragraph > `max-words`, or any sentence > `max-sentence-words` | fail |
| `unformatted_term` | glossary term's first use in a content section is not bold | fail |
| `symbol_no_gloss` | a box/paragraph containing MathML has no `Where:` gloss | fail |
| `term_before_definition` | glossary term used before its `.def`/`.mini` definition | review |
| `vague_referent` | sentence opens with This/These/That/It/The above | review |
| `dense_signals` | 3+ comma list or first/then/next sequencing, under budget | review |

Exemptions:

- Assignment and references sections are always skipped.
- The glossary section is skipped for `unformatted_term` (its terms are rendered
  bold by the component).
- Paragraphs that carry a `Where:` list or a MathML formula gloss are exempt
  from `dense_over_budget`, matching the Week 10 build note ("0 except formula
  glosses").
- `unformatted_term` and `term_before_definition` require a glossary. On a part
  file they run only when `--glossary` points at an assembled file or a glossary
  terms file; `build.py` always supplies it.

Output contract:

```json
{
  "fails": [
    {"rule": "dense_over_budget", "section": "costs", "paragraph": 3,
     "head": "Feasibility starts with", "tail": "every later number is wrong.",
     "detail": "48 words; sentence 2 is 34 words",
     "fix": "split into two paragraphs; render the list as a bullet hierarchy"}
  ],
  "review": [
    {"rule": "vague_referent", "section": "costs", "paragraph": 4,
     "head": "This split is", "tail": "cost-accounting starting point.",
     "context": {"before": "…", "after": "…"},
     "fix": "name the noun this refers to"}
  ],
  "sections": {"costs": {"has_math": true, "paragraphs": 6}}
}
```

Exit code 1 when `fails` is non-empty, else 0. `build.py` imports the same
functions and appends `Err` entries, so the CLI and the build never disagree.
`build.py` resolves the import by adding its own `tools/` directory to
`sys.path` (the script already lives beside `build.py`).

### 3.3 One merged reviewer per section, shortlist-driven

The separate clarity reviewer (C2) and numeric-freshness reviewer (v2.18)
become **one** independent section reviewer.

Dispatch rule — a reviewer runs only when at least one is true:

- the section has a non-empty `review` shortlist; or
- `sections[<id>].has_math` is true (prose worked examples need numeric
  verification).

A clean, non-arithmetic section gets **zero** reviewer calls.

Inputs to the reviewer:

1. The `review` items with one paragraph of context (never the whole section).
2. The section's MathML/`.def` worked-example blocks for numeric checking.
3. The `average-student-checker` contract (inlined in the brief, so the agent
   does not re-read the 207-line skill).
4. The numeric checklist (recompute each worked example; rounding; no reuse of
   the lesson's example numbers in activities).

It returns `SECTION PASS` or `SECTION FIX` with clarity and numeric findings.
It reports; it never edits.

**Retry loop:** findings go to the section's own author, the section is
re-linted, and a reviewer runs again only if the shortlist is still non-empty or
the numeric findings remain. **Max 2 retries**, then the build asks the user.
This replaces the unbounded loop at `v2/SKILL.md:1189-1190`.

### 3.4 Final sweep removed

`build.py` runs the full lint (with glossary) at assembly. There is no LLM
clarity sweep over the assembled file.

Part 5 keeps the checks build.py cannot mechanize: formulas, figures,
citation propriety, meld/MILO honesty, assignment integrity.

The standalone `average-student-checker` is unchanged and still runs both
lenses when a human asks for a review.

### 3.5 Dispatch order

- **Wave 0 (main session):** extract → outline → tune → select components →
  build the shared refs pool → slice → `00-head`.
- **Wave 1:** content authors + the assignment-mount author, batches of 6–8
  (all at once when the harness supports it).
- **Wave 1b (parallel track):** the DAG author/reviewer per level, serial
  internally, starts once the outline and MILO blueprint exist.
- **Wave 2:** run the lint; dispatch reviewers for qualifying sections in
  parallel.
- **Wave 2b:** flagged sections only → author fix → re-lint (≤2).
- **Wave 3:** `build.py` + smoke gates.

Reviewers never share a batch with authors. This fixes the race at
`v2/SKILL.md:1173`.

### 3.6 Shared references pool

- Wave 0 writes `build/<slug>/refs.json`: one research pass for the lesson's
  key works (5–10 entries, APA-7, real, 2021+ with the documented exceptions).
- The author brief says: cite from `refs.json` when a work fits; add a new work
  to `parts/<NN>-<id>.refs.json` only when the pool has no match. Never invent.
- `merge_refs` (`v2/build.py:544-564`) additionally dedupes by `ref_signature`
  (normalized author + year). Same signature with identical text is collapsed
  to one entry; same signature with different text is a build error. Same key
  with different text stays an error.
- If no pool exists, the current per-part behaviour is unchanged (graceful
  degradation).

### 3.7 Section 7 duplication fixed

The author brief for the assignment section is overridden:

- It writes `parts/<NN>-assignment.sections.html` and
  `parts/<NN>-assignment.refs.json` only. It does **not** write `data.js` and
  does **not** author `nodes[]`.
- The DAG track owns `parts/<NN>-assignment.data.js` and writes the stitched
  `nodes[]`.
- If `"assignment": "flat"` or `"graph"`, the section author owns the data file
  as today (no level fan-out exists for those modes).

### 3.8 Prompt slimming

- The main session selects components in Wave 0 and pastes only those schema
  rows from `registry.md` into each author brief.
- The clarity contract is inlined once in the reviewer brief instead of asking
  the agent to read the full checker skill.
- Derived sections still receive the full source; content sections receive only
  their slice (unchanged).

## 4. Files changed

| File | Change |
|---|---|
| `v2/SKILL.md` | version 2.32; Part 2 activity set; Part 4 C/C2/D2 rewrite; Part 5 sweep removal; author brief; tools list; manifest note |
| `v2/build.py` | `labs` key + `-lab` gate; refs signature dedupe; import/run `prose_lint` |
| `v2/tools/prose_lint.py` | new |
| `v2/tools/paragraphs.py` | expose reusable helpers; optional `--lint` passthrough |
| `average-student-checker/SKILL.md` | pipeline role: shortlist mode, Dense is mechanical upstream, reviewer dispatch rule |
| `v2/skeleton/components/registry.md` | labs marked opt-in; default activity set |
| `v2/sample/*/build.json` | `"labs": true` (7 files) |
| `README.md` | pipeline description, labs default, component count wording |
| `tests/test_prose_lint.py` | new |
| `tests/test_build_labs.py` | new |
| `tests/test_references.py` | signature dedupe cases |
| `tests/test_skill_*.py` | update assertions that reference the old final sweep / C2 flow |

## 5. Test plan

**Unit — `prose_lint`**

- `dense_over_budget` on a long paragraph and on a long sentence, with the
  formula-gloss exemption.
- `unformatted_term`: first use unbolded fails; first use bolded passes; later
  use unbolded passes; glossary section exempt.
- `symbol_no_gloss`: MathML without `Where:` fails; with `Where:` passes.
- `term_before_definition`, `vague_referent`, `dense_signals` produce `review`,
  not `fail`.
- JSON schema and exit codes.

**Unit — `build.py`**

- Absent `labs` means false; a `*-lab` component is rejected with the fix text.
- `"labs": true` allows labs.
- Non-boolean `labs` is rejected; unknown keys still rejected.
- `merge_refs`: same signature/different key fails; same key/different text
  fails; identical duplicate passes once.
- Lint failures appear in the build error report with section, ¶, and fix.

**Integration**

- `v2/sample/lesson-demo` (labs true) still builds `OK`.
- A no-labs fixture builds `OK`.
- Full `python -m pytest tests -q` is green.
- `layout_smoke.js` (desktop + 390) and `assignment_smoke.js` pass on a sample.

**Manual A/B**

- Count agent dispatches for one real lesson before and after; expected drop
  from ~38 to ~16–20.
- Record wall-clock for the same lesson.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Lint false positives on formula glosses | `Where:`/MathML exemption; thresholds are flags |
| A clean section skips a real semantic issue | arithmetic sections still reviewed; Part 5 spot checks; standalone checker available |
| Merged reviewer overload | capped retries; deterministic gates carry the mechanical load |
| Labs off reduces interactivity | opt-in `"labs": true`; non-lab activities mandated per section |
| Pool work does not fit a section | author may add a part-level real ref; build validates |
| Existing lessons suddenly fail | `"labs": true` is a one-line fix; error message states it |

## 7. Rollout

1. Land `prose_lint.py` + tests.
2. Land `build.py` gates (`labs`, refs, lint) + tests.
3. Rewrite `v2/SKILL.md` Part 4/Part 5 and the briefs.
4. Update the checker skill, registry, samples, README.
5. Run the full suite and one sample build end to end.
6. Run one real lesson and record the dispatch count / wall-clock.

## 8. Open decisions

None blocking. Thresholds (`40` words, `30` sentence words) match the existing
§2.1e prose budget; they stay configurable.
