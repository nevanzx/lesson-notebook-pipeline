# Error craft — the error-check + multi-select assignment

Governs Section 7 **by default** (`build.json` omits `"assignment"`, or sets
`"assignment": "error"`). The deck is **12 error-check items (`err`) + 8
multi-select items (`multi`)**, 20 in all, with **no short-answer items**. The
flat deck is the explicit opt-in `"assignment": "flat"` (`question-craft.md`);
the branching DAG is `"assignment": "dag"` (`dag-craft.md`); the graph deck is
`"assignment": "graph"` (`graph-craft.md`). §9.1's source-only ban stays a
**lesson-body rule** — assignment situations may invent actors, numbers, and
twists freely; a hidden dependency may not.

## The data object

    LN.data.assign7 = {
      mode: "error",
      intro: "…optional…",
      items: [
        { type: "err", statement: "…", choices: ["…", "…", "…", "…"], ans: 0 },
        { type: "multi", prompt: "…", choices: ["…", "…", "…", "…"], ans: [0, 2] }
      ]
    };

`ans` is answer material. It lives only in the author's data object: `build.py`
strips it from the student HTML and writes it into
`build/key/<name>-key.json`. The student file never carries an answer, and item
order plus option order carry no answer signal.

## Error-check item (`err`)

The student reads one statement and picks **the word, phrase, clause, fragment,
or full sentence that makes it false**.

| Field | Rule |
|---|---|
| `statement` | non-empty; 1–3 sentences; at most 80 words |
| `choices` | exactly 4 distinct non-empty strings, each copied **verbatim** from `statement` |
| `ans` | integer index 0–3 of the false span |

- **One error only.** Exactly one of the four spans is the error; the other
  three are true parts of the statement. Never mutate two facts in one
  statement, and never make the "error" a correction or a paraphrase — the
  choice must be the offending text exactly as it appears.
- **Verbatim whole-word span.** Each choice must occur in the statement exactly
  once as a whole-word span (whitespace normalised, case-sensitive). Repeating
  a choice's text anywhere else in the statement makes that span ambiguous and
  fails the build.
- **Span sizes vary.** A legal choice is a single word (`falls`), a phrase
  (`break-even point`), a clause (`Fixed costs rise`), a sentence fragment, or a
  whole sentence. Across the 12 items, mix those sizes: at least **3** items
  must have a correct span of **4+ words**, and the deck must not be all single
  words.
- **No length cue.** The correct span may be the unique longest choice in at
  most **4 of 12** items. Deliberately make some distractors as long as or
  longer than the error; do not let "pick the longest" score.
- **Position scatter.** No answer position (`0`–`3`) may be used more than **4
  times** across the 12 items. After drafting, permute the four spans so the
  error is not habitually first or last.
- **The other three spans are true.** They must be real, teachable parts of the
  statement, not nonsense padding. A student should be able to defend the three
  non-answers as correct.

## Multi-select item (`multi`)

| Field | Rule |
|---|---|
| `prompt` | non-empty; names the target of the selection |
| `choices` | 4–8 distinct non-empty strings |
| `ans` | array of 2 .. `len(choices)-1` unique integer indices (array length, not index values) |

- **The prompt names the target.** Say what to select: "Select all the true
  statements", "Select all the false statements", "Select every step in the
  process", "Select all the types of market structure", "Select every fixed
  cost". The component adds no instruction of its own, so an unstated target
  leaves the item unanswerable.
- **2+ correct, never all.** At least two choices are correct and at least one
  is wrong. An all-correct set is a giveaway and fails the build.
- **Distinct, checkable options.** Every option is a single claim, step, or
  member that can be marked independently. Avoid overlapping options where one
  implies another.
- **No length cue.** The correct set's mean word count may be the highest in at
  most **4 of 8** items. Keep the wrong options as long as the right ones.
- **Answer is a set.** Order does not matter; `ans` stores the correct indices,
  and the student's checked texts are compared as a set.

## Blueprint before items (required)

List the MILOs and map each to the items that exercise it. Author only then.
The deck must cover **every** MILO: give each MILO at least **2 items** and let
no MILO hold more than **30%** of the deck (6 of the 20 items). Record the
mapping in build notes — scaffolding, never shipped student data.

## Situational and copy rules

The two words that govern every item are the ones from `question-craft.md`:

- **Situational.** The student is placed in a scene — someone proposes,
  misreads, decides, or asks "what happens if". An item answerable by lifting
  one sentence from the notebook prose fails the **copy test** and is rejected.
  "Define X" is never an item.
- **Fair.** Every concept needed was taught somewhere; every fact or number
  needed sits inside the stem; exactly one defensible answer (or one defensible
  set) exists.
- **Recompute every key.** Independently verify every `ans` in QA. A wrong key,
  unlike wrong prose, is invisible to students.

## What ships where

- Student data: `type`, `statement`, `prompt`, and `choices` only.
- Teacher key (`build/key/<name>-key.json`): `mode: "error"` plus every item
  with `n`, `type`, `prompt`, `choices`, `ans`, and `statement` on `err` rows.
