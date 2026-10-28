# Error-checking + multi-select assignment — design

**Status:** approved
**Date:** 2026-10-28
**Amends:** `interactive-lesson-notebook` v2.32 (Section 7 and the assignment component).

## 1. Problem

The graded assignment is currently a branching DAG by default, with a flat
20-item deck (10 mc · 4 tf · 4 id · 2+ sa) as the opt-in alternative. The
course wants a different assessment shape:

- an **error-checking MCQ**: the student sees a full statement and picks the
  word, phrase, clause, or whole sentence that makes it false;
- a **multi-select** item: the student checks every option a prompt asks for
  (all true statements, all false statements, all members of a process, all
  types in a category, and so on).

A known test-taking cue must not survive: the correct option must not always be
the longest option.

## 2. Goals and non-goals

**Goals**

- Add `"assignment": "error"` to `build.json` and make it the default.
- Ship 12 error-check items and 8 multi-select items, all objective and
  auto-markable; no short-answer items.
- Support error-check options at any span size: one word, a phrase, a clause,
  a sentence fragment, or a full sentence, copied verbatim from the statement.
- Support multi-select prompts that ask for true statements, false statements,
  processes, categories, or types.
- Enforce a deck-level cap so the correct answer is not habitually the longest.
- Auto-score both item types in the teacher checker and export one column per
  type.
- Keep `dag`, `flat`, and `graph` available and unchanged for lessons that pin
  them.

**Non-goals**

- Changing the identity gate, time lock, encryption envelope, watermark, or
  fullscreen guards.
- Removing or altering the flat, DAG, or graph authoring laws.
- Reworking the lesson body, glossary, references, or theme/layout system.
- Adding short-answer items to the new mode.

## 3. Data model

The assignment data object gains `mode: "error"`:

```js
LN.data.assign7 = {
  mode: "error",
  intro: "A set of error-checking and multi-select questions closes this lesson.",
  items: [
    {
      type: "err",
      statement: "Fixed costs rise, so the break-even point falls.",
      choices: ["Fixed costs rise", "break-even point", "falls", "so the"],
      ans: 2
    },
    {
      type: "multi",
      prompt: "Select all the types of market structure.",
      choices: ["Perfect competition", "Monopoly", "Monopolistic competition",
                "Oligopoly", "Sole proprietorship", "Cartel behaviour"],
      ans: [0, 1, 2, 3]
    }
  ]
};
```

### 3.1 Error-check item (`type: "err"`)

| Field | Rule |
|---|---|
| `statement` | non-empty; 1–3 sentences; at most 80 words |
| `choices` | exactly 4 distinct non-empty strings; each copied **verbatim** from `statement` |
| `ans` | integer index 0–3 of the false span |

Each choice must occur in the statement **exactly once, as a whole-word span**
(normalized whitespace, case-sensitive). This makes the chosen text
unambiguous: a word (`falls`), a phrase (`break-even point`), a clause
(`Fixed costs rise`), a sentence fragment, or a full sentence are all legal.
The other three spans are true parts of the statement; exactly one span is the
error.

A correct span of four or more words is required on at least 3 of the 12 items,
so a deck cannot be all single words.

### 3.2 Multi-select item (`type: "multi"`)

| Field | Rule |
|---|---|
| `prompt` | non-empty; states what to select |
| `choices` | 4–8 distinct non-empty strings |
| `ans` | array of unique integer indices, length 2..`len(choices)-1` |

Two or more choices are correct and never all of them. The prompt carries the
selection instruction; the component does not add "select all that apply" of
its own, because the prompt may ask for false statements, process steps, or
category members.

## 4. Validation (`v2/build.py`)

Constants:

```python
ASSIGN_ERROR_ERR = 12
ASSIGN_ERROR_MULTI = 8
ASSIGN_ERROR_MAX_POS = 4          # max uses of one error answer position
ASSIGN_ERROR_MAX_LONGEST = 4      # max items whose correct span is unique longest
ASSIGN_ERROR_MIN_LONG_SPANS = 3   # err items whose correct span is 4+ words
ASSIGN_ERROR_MAX_CHOICES = 8      # multi-select option ceiling
```

`validate_assignment` accepts `data_mode == "error"` and delegates to
`_validate_assignment_error(data, errors)`.

Per deck:

- exactly 12 `err` items and 8 `multi` items (20 total);
- any other item type is rejected.

`err` items:

- `statement`, `choices`, `ans` validated as in §3.1;
- each choice occurrence count == 1, with whole-word boundaries;
- `ans` index used at most 4 times across the 12 items;
- at least 3 items have a correct span of 4+ words.

`multi` items:

- `prompt`, `choices`, `ans` validated as in §3.2.

### 4.1 Length-cue cap

**Error-check.** Count items whose correct span has strictly more words than
every other choice. Fail when that count exceeds 4 of 12.

**Multi-select.** Count items whose correct choices have a strictly higher mean
word count than the incorrect choices. Fail when that count exceeds 4 of 8.

Authoring guidance additionally says to vary the lengths and to make some
distractors as long as or longer than the correct span.

### 4.2 Sanitization and teacher key

`sanitize_assignment_data` gains an `error` branch. Student data keeps
`type`, `statement`, `prompt`, and `choices`; `ans` is stripped. The
`-key.json` gains an `error` branch mirroring `write_key_file`'s flat branch:
each row carries `n`, `type`, `prompt`, `choices`, and `ans`, plus `statement`
for `err` items. `body["mode"]` is `"error"`.

## 5. Notebook component

`v2/skeleton/components/assignment/component.js`:

- `isError = !isDag && d.mode === "error"`.
- Intro fallback: "A set of error-checking and multi-select questions closes
  this lesson."
- `err` slide: statement box (`.lna-stmt`), then
  `Q<n> — Which part of the statement makes it false?`, then four radio
  options showing the verbatim spans.
- `multi` slide: `Q<n> — <prompt>`, then 4–8 checkbox options.
- `answered` returns true for `multi` when at least one box is checked, and for
  `err` once a radio is picked. Progress dots use `answered`, not a bare
  null/empty-string test.
- Selecting a checkbox rebuilds `state.answers[i]` as the array of checked
  option texts.
- Export rows carry `q`, `type`, `prompt`, `answer`; `err` rows also carry
  `statement`. For `err` rows `prompt` is the fixed question text
  (`Which part of the statement makes it false?`); `multi` rows keep their own
  prompt. `answer` is the chosen span text for `err` and an array of
  chosen texts for `multi`.
- The identity gate, trusted-time gate, encryption, and guards are untouched.

`component.css` adds:

- `.lna-stmt`: a bordered statement box that grows with its text;
- no fixed-height or absolutely positioned faces (containment rule §1.5);
- the existing `.lna-opt` checked/focus styling already covers checkboxes.

## 6. Teacher checker

`checker/app/lib/format.js`:

- `multiCorrect(answer, ans, choices)` compares the selected text set with the
  key indices as a **set**, accepting text or numeric picks.

`checker/app/lib/score.js`:

- `err` scores via `mcCorrect(given, k.ans, k.choices)`;
- `multi` scores via `multiCorrect(given, k.ans, k.choices)`;
- returns `err` and `multi` counts; `totalNonAI` is the sum of all objective
  types.

`checker/app/app.js`:

- `mode` becomes `"dag" | "error" | "flat"` from the key file;
- scored rows carry `err` and `multi`;
- an error deck renders `Name · ERR · MULTI · Total (non-AI)`, matched and
  unmatched;
- flat, DAG, and graph rendering stay as they are.

Graph keys write the same `mc` rows at the top level (`keyJson.items`) as well as
under `graph.items`, so `checker/app/app.js` reads graph submissions through the
objective path and graph-as-flat scoring and export keep working.

`checker/app/lib/export-book.js`:

- `mode: "error"` exports `ERR` and `MULTI` columns plus `Total`;
- `dag`, `flat`, and graph-as-flat columns stay byte-identical.

## 7. Default and migration

- `build.json` without an `assignment` key resolves to `"error"`.
- `validate_assign_cfg` accepts `flat`, `dag`, `graph`, `error`; the default is
  `error`. A `dag` block is still only legal when the mode is `dag`.
- `assemble()` passes `expected_mode=cfg.get("assignment", "error")`.
- The shipped flat samples already pin `"assignment": "flat"`.
- Any existing lesson that relied on the old implicit DAG default must now pin
  `"assignment": "dag"` in `build.json` as well as keeping `"mode": "dag"` in its
  assignment data; otherwise it builds as an error deck and fails the mode
  check. The docs, the assessment default row, and the opening-message guidance
  state this.
- `graph` remains explicit.

## 8. Authoring law

New `v2/skeleton/error-craft.md`:

- an `err` statement contains exactly one error;
- choices are verbatim spans, never paraphrases or corrections;
- span sizes vary (word, phrase, clause, fragment, sentence);
- the correct span is not habitually the longest;
- a `multi` prompt names the selection target (true / false / process /
  category / type);
- `multi` choices are 4–8, with 2+ correct and never all;
- items stay situational and fresh, per the existing question-craft rules;
- the deck covers the lesson's MILOs.

Update `SKILL.md` (Section 7 table, defaults, mode list, timing, opening
message), `skeleton/components/registry.md`, and the assignment
`README.md`. `question-craft.md` and `dag-craft.md` keep their existing scope;
the skill's default pointer now sends authors to `error-craft.md`.

## 9. Tests

Python (`tests/`):

- valid 12+8 deck validates and writes a key with mode `error`, including
  `ans` for both types;
- wrong counts, unknown types, bad `ans`, duplicate choices, non-verbatim
  choices, ambiguous repeated spans, empty prompts/statements, too many
  choices, all-correct/one-correct multi sets are rejected;
- position cap, long-span floor, and both length-cue caps are enforced;
- sanitize strips `ans` and keeps `statement` / `prompt` / `choices`;
- `validate_assign_cfg` defaults to `error` and accepts all four modes;
- build integration: an error deck ships encrypted with no `ans` text, and a
  key file is written.

JavaScript (`checker/app/test/`):

- `multiCorrect` handles text picks, numeric picks, order, missing picks,
  extra picks, and empty answers;
- `scoreNonAI` counts `err` and `multi`;
- `export-book` writes `ERR` / `MULTI` columns for error decks and leaves flat
  and DAG columns unchanged.

Smoke (`v2/tools/assignment_smoke.js`):

- walk one `err` and one `multi` slide through the real component: picking an
  error span enables Next; checking one box enables Next; unchecking all boxes
  disables it again; a full submit includes both answers.

## 10. Acceptance criteria

1. A workdir with `"components": ["assignment"]`, `"week"`, `"subject"`, and no
   `"assignment"` key builds with a valid 12 `err` + 8 `multi` deck.
2. Student HTML contains no `ans` values; the teacher key contains them.
3. `assignment_smoke.js` passes for flat, dag, graph, and error.
4. `python -m pytest tests/` passes.
5. `npm test` from `checker/app` (or `node --test test/*.test.js`) passes.
6. An error deck exports `ERR`, `MULTI`, and `Total` columns; a flat deck still
   exports `MC`, `TF`, `ID`, and SA columns.
7. The build rejects a deck whose correct spans are the unique longest in more
   than 4 of 12 `err` items, or whose correct sets dominate length in more than
   4 of 8 `multi` items.
