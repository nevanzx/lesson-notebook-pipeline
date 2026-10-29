# Mixed craft — the default graded assignment

Governs Section 7 **by default** (`build.json` omits `"assignment"`, or sets
`"assignment": "mixed"`). The deck is **10 multiple-choice items (`mc`) + 8
true-or-false items (`tf`) + 2 multi-select items (`multi`)**, 20 in all, with
**no short-answer items**. Opt-in decks: the error-check deck is
`"assignment": "error"` (`error-craft.md`), the flat deck is `"assignment":
"flat"` (`question-craft.md`), the branching DAG is `"assignment": "dag"`
(`dag-craft.md`), and the graph deck is `"assignment": "graph"`
(`graph-craft.md`). The invention ban in SKILL.md §9.1 is a **lesson-body
rule**: assignment situations may invent actors, numbers, and twists freely —
*a new situation is allowed, a hidden dependency is not.*

## The data object

    LN.data.assign7 = {
      mode: "mixed",
      intro: "…optional…",
      items: [
        { type: "mc", prompt: "…", choices: ["…", "…", "…", "…"], ans: 0 },
        { type: "tf", prompt: "…", ans: true },
        { type: "multi", prompt: "…", choices: ["…", "…", "…", "…"], ans: [0, 2] }
      ]
    };

`ans` is answer material. It lives only in the author's data object: `build.py`
strips it from the student HTML and writes it into `build/key/<name>-key.json`.
The student file never carries an answer, and item order plus option order carry
no answer signal. Author the deck grouped — ten `mc`, then eight `tf`, then two
`multi` — because that is how a student reads it; the validator counts types and
does not care about order.

## The three types

| Type | Count | Difficulty | Craft rules |
|---|---|---|---|
| `mc` | 10 | easy | one taught concept, fresh situation; distractors are believable student slips (right formula wrong input, direction flip, unit confusion), not obscure trivia; exactly **four** choices, all within ±1 word of each other (enforced); choices distinct after normalization (case and punctuation ignored); `ans` an integer 0–3; no answer position used more than **3** times across the ten; never "all of the above" / "none of the above" |
| `tf` | 8 | hard | single-flip near-misses: the statement reads true until exactly one mutated element breaks it; `ans` is a boolean; at least **3 true and 3 false** (enforced) so the verdict cannot be guessed |
| `multi` | 2 | analysis | the prompt **names the target** ("Select every statement that is true of…"); 4–8 distinct options; `ans` lists **2 to n−1** correct indices, never all of them; the correct set must not carry the largest mean option length (enforced) |

## Fair, and the copy test

- Every stem places the student in a scene: someone proposes, misreads, decides,
  or asks "what happens if." An item answerable by lifting one sentence from the
  notebook prose fails the **copy test** — rejected. "Define X" is never an item.
- Every concept needed to solve an item was taught somewhere (prose, activity
  explanation, or glossary); every fact or number needed sits **inside the
  stem** — ≤60 words, no "refer back to Section 3."
- Exactly one defensible answer per item — no `mc` distractor a careful student
  could argue for, and no `multi` option that is true under a defensible reading
  without being in `ans`.
- Every invented answer is **recomputed independently in QA** (assignment
  extension of §9.2): a wrong key, unlike wrong prose, is invisible to students.

## The blueprint (before any item)

List the MILOs and map each to the items covering it. Author only then.
QA rejects: any MILO with fewer than 2 items, or any single MILO holding more
than 30% of the deck (more than 6 of the 20). Record the mapping in your build
notes — it is authoring scaffolding, never shipped student data.

## Worked shape

    { type: "mc", prompt: "A store sells 20 packs a day at ₱10 each, with a ₱6
      cost per pack, and earns ₱80 profit. At 50 packs a day, what happens to
      profit?", choices: ["Profit rises by ₱120", "Profit rises by ₱150",
      "Profit falls by ₱120", "Profit stays the same"], ans: 0 }
    { type: "tf", prompt: "A firm that earns zero economic profit still covers
      every explicit cost.", ans: true }
    { type: "multi", prompt: "Select every statement that is true of fixed costs
      in the short run.", choices: ["They do not change with output", "They are
      zero when output is zero", "They still exist at zero output", "They are
      always paid in cash"], ans: [0, 2] }
