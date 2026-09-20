# Question Harness (v2.6) — Design (2026-09-20)

## Context

The skill (v2.5) says "situational" six times but never defines it. The only
question-craft guidance anywhere is one Part 5 line ("T/F items are situational
near-misses, not trivia") and the Week 4 demo items. The assignment-agent brief
(Part 4-C) carries zero craft rules, so item quality depends on the agent's
mood. User goal: the graded assignment becomes **situational, challenging, and
fair** by construction.

Decisions captured in brainstorming:

- Harness scope: the graded Section 7 assignment ONLY. In-section activities
  are easy→medium and get one new obligation (see Doctrine).
- Invention: §9.1's source-only ban is a **lesson-body rule**; the assignment
  may invent scenarios, actors, and numbers freely.
- Distractors: plausible-by-construction (believable student slips), NOT
  taught-trap-mapped. All 4 MC choices within ±1 word of each other.
- No `why_wrong`/difficulty metadata in the teacher key — key schema unchanged.
- Type-difficulty profile: mc easy · tf hard · id medium · sa analysis.
- Blueprint required: MILO→items mapping authored first; every MILO ≥2 items,
  no MILO >30% of the deck.
- Enforcement split: spec file + thin build.py checks; judgment stays in QA.

## Doctrine (the three words, defined)

**Situational** — every item puts the student in a scene: an actor proposes,
misreads, decides, or asks "what happens if." A stem that can be answered by
lifting one sentence from the notebook prose fails the copy test and is
rejected. "Define X" is never an item.

**Challenging** — by type, not by trickiness: mc is a one-concept application
in fresh clothes; tf is the hard tier (a single mutated element in an otherwise
true statement — the flip gives no choice-list to hide behind); id names the
term a scenario calls for; sa demands analysis (defend/combine/explain a
verdict), scaling easy↔hard with the lesson.

**Fair** — *a situation may be new; a hidden dependency may not.* Every
concept needed to solve an invented item was taught somewhere (prose,
activity explanation, or glossary); every fact/number needed sits INSIDE the
stem (≤60 words, no "refer back to Section 3"); exactly one defensible answer
per item. Wrong invented ANSWERS are the failure mode invention introduces —
QA recomputes every mc/tf/id answer independently, because a wrong key, unlike
wrong prose, is invisible to students.

## Craft table (the content of `question-craft.md`)

| Type | Count | Difficulty | Rules |
|---|---|---|---|
| mc | 10 | easy | one taught concept, fresh situation; distractors = plausible slips (right formula wrong input, direction flip, unit confusion); all choices within ±1 word of each other; no answer position used >4×; no "all of the above" |
| tf | 4 | hard | single-flip near-misses: true until exactly one element breaks it; never all-true / all-false across the four; balance follows the traps, not a quota |
| id | 4 | medium | the stem IS a mini-scenario; student names the term it calls for; alias list generous enough that a correct student can't be stranded |
| sa | 2+ | analysis | cite/defend/combine; `key_points` are facts the notebook teaches; `rubric` sums exactly to `max_points` |

Global: stems ≤60 words and self-contained; zero items pass the copy test;
invented actors/numbers welcome, invented dependencies are not; every answer
survives independent recomputation.

## Blueprint rule

Before authoring any item, the assignment agent writes the MILO→items mapping
(which items cover which outcome). QA rejects the build if any MILO has <2
items or any single MILO holds >30% of the deck. The mapping is authoring
scaffolding recorded in the brief/response, not shipped student data.

## Activities (in-section, easy→medium)

Not governed by the harness, with one addition: every activity item carries
student-facing wrong-answer reasoning + an `easy`/`medium` marker — extending
`true-false`'s existing `e` field pattern to the other self-revealing activity
types (`case-match`, `sort-statement`, `ranked-statements`). QA checks
activities never exceed medium. The tf README's "explanations name the trap"
line remains the model for the wording of the reasoning.

## Approach considered

- **A (chosen): spec file + thin build checks.** `skeleton/question-craft.md`
  holds the doctrine + craft table; the assignment-agent brief points at it the
  way section agents point at the registry. build.py enforces only the countable
  subset. Judgment rules live in Part 5 QA where they're checkable by reading.
- **B (rejected): all inline in SKILL.md.** Brief bloat; rules shared only by
  one agent type dilute the whole file.
- **C (rejected): heavy mechanical enforcement.** Stems parsed for "scenario
  markers," answers auto-recomputed by heuristics — brittle, false-positive
  prone; the copy test is a judgment call, not a regex.

## Enforcement split

**build.py (new mechanical checks, itemized fail like existing rules):**
assignment present with mix 10/4/4/2+; every mc has exactly 4 choices and a
valid `ans` index; choice word-count uniformity (±1); every id has non-empty
`aliases`; every sa has `rubric` (string) + `max_points` (positive int); tf
answer set not uniform (not 4×true / 4×false).

**Part 5 QA (judgment):** situational-ness + copy test per item; tf flip
quality (exactly one mutated element); blueprint coverage (<2 per MILO or
>30% = reject); answer recomputation of every invented item; alias
sufficiency; stem ≤60 words.

**§9.1 carve-out:** the source-only rule gains one explicit line — it governs
the lesson body; assignment items are governed by `question-craft.md`
(answerability, not source-traceability, is their constraint; SA `key_points`
remain lesson facts).

## Files touched

- NEW `v2/skeleton/question-craft.md` (doctrine + craft table + blueprint rule)
- `v2/SKILL.md` — version bump 2.6 + v2.6 change note; §2 Section-7 row
  references the spec; Part 4-C assignment-agent brief gains "read
  question-craft.md" (like the registry line); §9.1 carve-out line; Part 5
  adds the judgment checks; §"Inputs required" Assessment row updated
- `v2/build.py` — mechanical checks above (assignment data validation block)
- Activity component READMEs (`true-false` wording already fits; `case-match`,
  `sort-statement`, `ranked-statements` gain the reasoning+marker note) +
  registry rows where schema changes (optional `d`/`why` fields if needed —
  decided at implementation; prefer existing explanation fields over new keys)
- Tests: new pytest cases for the build.py checks; `assignment_smoke.js`
  untouched (no component change); `sample/lesson-demo` must still build OK

## Out of scope

- No change to encryption, teacher-key file schema, checker app, or deck UI.
- No `why_wrong`/difficulty metadata in assignment data or the key.
- No per-lesson opt-out of the craft rules.
- In-section activities keep easy→medium authoring; no blueprint requirement
  for them.

## Testing

- pytest: each new build.py check gets a pass + a fail fixture (mix wrong,
  3/5 choices, off-by-2 word uniformity, empty aliases, missing rubric,
  uniform tf).
- `python build.py sample/lesson-demo` still OK after the checks land (demo
  items were written to this spirit — verify, adjust demo data only if a
  countable rule actually fails it).
- `node tools/assignment_smoke.js` still SMOKE OK (component untouched).
- One real build (or Week 5 parts replayed): assignment agent brief now
  includes the question-craft line; eyeball items against the copy test.

## Spec self-review

- No TBD/TODO. One soft spot — activity READMEs' exact field names — is
  flagged as an implementation-time choice bounded by "prefer existing
  fields," so it cannot drift scope.
- Consistent: §9.1 carve-out and the answerability anchor are the same
  decision stated in two places; key schema unchanged everywhere.
- Scope: one spec file + validator block + brief edits — single plan.
