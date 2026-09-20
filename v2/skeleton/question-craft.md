# Question craft — the graded assignment

Governs the Section 7 `assignment` items only. In-section activities have their
own (lighter) rules at the bottom. The invention ban in SKILL.md §9.1 is a
**lesson-body rule**: assignment situations may invent actors, numbers, and
twists freely — *a new situation is allowed, a hidden dependency is not.*

## The three words

**Situational.** Every stem places the student in a scene: someone proposes,
misreads, decides, or asks "what happens if." An item answerable by lifting one
sentence from the notebook prose fails the **copy test** — rejected. "Define X"
is never an item.

**Challenging** — by type, never by trickery:

| Type | Count | Difficulty | Craft rules |
|---|---|---|---|
| mc | 10 | easy | one taught concept, fresh situation; distractors are believable student slips (right formula wrong input, direction flip, unit confusion), not obscure trivia; **all four choices within ±1 word of each other** (enforced); no answer position used more than 4× across the ten; never "all of the above" |
| tf | 4 | hard | single-flip near-misses: the statement reads true until exactly one mutated element breaks it; never all-true or all-false across the four (enforced); balance follows the traps, not a quota |
| id | 4 | medium | the stem IS a mini-scenario; the student names the term the situation calls for; `aliases` generous enough that a correct student cannot be stranded |
| sa | 2+ | analysis | defend / combine / explain-a-verdict; `key_points` are facts the notebook teaches; `rubric` sums exactly to `max_points` |

**Fair.**

- Every concept needed to solve an item was taught somewhere (prose, activity
  explanation, or glossary); every fact or number needed sits **inside the
  stem** — ≤60 words, no "refer back to Section 3."
- Exactly one defensible answer per item — no MC distractor a careful student
  could argue for.
- Every invented mc/tf/id answer is **recomputed independently in QA**
  (assignment extension of §9.2): a wrong key, unlike wrong prose, is invisible
  to students.

## The blueprint (before any item)

List the MILOs and map each to the items covering it. Author only then.
QA rejects: any MILO with <2 items, or any single MILO holding >30% of the deck.
Record the mapping in your build notes — it is authoring scaffolding, never
shipped student data.

## Activities (in-section, not graded)

Activities stay **easy→medium** — the hard tier is the assignment's job.
Where a component renders reasoning, the wrong-pick feedback must name the
slip: `true-false`'s `e` field is the model; `sort-statement` and `case-match`
accept an optional per-item `e` shown on a wrong pick. Authoring may mark
item difficulty with an optional `d: "easy" | "medium"` field; components
ignore it, QA reads it — an activity item never exceeds medium. Registry rows
list `d?` so agents may write it on these four components.
