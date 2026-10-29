# Mixed objective assignment — design

**Status:** implemented
**Date:** 2026-10-29
**Amends:** `interactive-lesson-notebook` v2.36 (Section 7 and the assignment
component). The opt-in error-check deck (v2.33) is unchanged.

## 1. Problem

The default graded assignment is a 12 error-check + 8 multi-select deck. The
course wants a broader objective mix that reads as a normal quiz: mostly
multiple choice, a true-or-false block, and a couple of multi-select items. The
error-check item stays valuable, so it must not be deleted — it becomes opt-in.

## 2. Goals and non-goals

**Goals**

- Add `"assignment": "mixed"` to `build.json` and make it the default: exactly
  10 `mc` + 8 `tf` + 2 `multi` items, 20 in all, no short-answer items.
- Reuse the existing objective item types (`mc`, `tf`, `multi`) so the
  component, checker, and export paths need no new scoring logic.
- Keep every answer-material rule: `ans` never reaches the student HTML.
- Enforce shape guards so the answer cannot be guessed from the deck's form:
  equal-length `mc` choices, a balanced `tf` block, and no length cue on
  `multi`.
- Keep `error`, `flat`, `dag`, and `graph` available and unchanged.

**Non-goals**

- Changing the identity gate, time lock, encryption envelope, watermark, or
  fullscreen guards.
- Removing `err` support or altering `error-craft.md`'s own item rules.
- Adding short-answer items to the default deck.

## 3. Data model

```js
LN.data.assign7 = {
  mode: "mixed",
  intro: "A set of multiple-choice, true-or-false, and multi-select questions closes this lesson.",
  items: [
    { type: "mc", prompt: "…", choices: ["…","…","…","…"], ans: 0 },
    { type: "tf", prompt: "…", ans: true },
    { type: "multi", prompt: "Select all …", choices: ["…","…","…","…"], ans: [0, 2] }
  ]
};
```

| Type | Count | Fields |
|---|---|---|
| `mc` | 10 | `prompt`, 4 distinct `choices`, integer `ans` 0–3 |
| `tf` | 8 | `prompt`, boolean `ans` |
| `multi` | 2 | `prompt`, 4–8 distinct `choices`, `ans` array of 2..n−1 indices |

## 4. Validation (`v2/build.py`)

```python
ASSIGN_MIX = {"mc": 10, "tf": 8, "multi": 2}
ASSIGN_MIX_MAX_POS = 3        # max uses of one mc answer position
ASSIGN_MIX_MIN_TF_EACH = 3    # min true and min false statements
ASSIGN_MULTI_MAX_CHOICES = 8  # option ceiling, shared with error mode
```

`validate_assignment` accepts `data_mode == "mixed"` and delegates to
`_validate_assignment_mixed(data, errors)`. The multi-select block moved into
`_check_multi_item(n, it, errors)` so mixed and error mode share one
implementation and one set of messages.

Per deck:

- exactly 10 `mc`, 8 `tf`, 2 `multi`; any other type is rejected;
- `mc`: four non-empty choices, distinct after normalization, within ±1 word of
  each other, no "all of the above" / "none of the above", `ans` 0–3, no answer
  position used more than 3 times;
- `tf`: boolean `ans`, at least 3 true and 3 false;
- `multi`: the shared 4–8 options / 2..n−1 correct rules, plus a per-item
  length-cue failure when the correct set's mean word count exceeds the wrong
  set's.

## 5. Sanitization and teacher key

`sanitize_assignment_data` gains a `mixed` branch: student data keeps `type`,
`prompt`, and `choices` for `mc`/`multi` (no options on `tf`); `ans` is
stripped. `write_key_file` gains a `mixed` branch: rows carry `n`, `type`,
`prompt`, `ans`, plus `choices` for `mc`/`multi`; `body["mode"]` is `"mixed"`.

## 6. Notebook component

`component.js` needs one flag for copy only — `mc`, `tf`, and `multi` already
render in the non-DAG path, and `answered()` already handles all three:

- `isMixed = !isDag && d.mode === "mixed"`;
- intro fallback: "Ten multiple-choice, eight true-or-false, and two
  multi-select questions close this lesson."
- Submission rows carry `q`, `type`, `prompt`, `answer`; `multi` answers are
  arrays of chosen texts, `tf` answers are booleans.

## 7. Teacher checker

- `app.js`: `mode` becomes `"dag" | "error" | "mixed" | "flat"`; `mixed` is
  objective-only, so it finishes without an SA pass; the results table renders
  `Name · MC · TF · MULTI · Total (non-AI)` for matched and unmatched rows.
- `score.js`: unchanged — `mc`, `tf`, and `multi` are already scored by type.
- `export-book.js`: `mixed` exports `MC`, `TF`, `MULTI` columns plus `Total`.

## 8. Default and migration

- `build.json` without an `assignment` key resolves to `"mixed"`.
- `validate_assign_cfg` accepts `flat`, `dag`, `graph`, `error`, `mixed`;
  `mixed` (like `error`) requires the assignment component.
- `assemble()` passes `expected_mode=cfg.get("assignment", "mixed")`.
- A lesson written for the v2.33 error default must pin
  `"assignment": "error"` (and keep `"mode": "error"` in its data). A lesson
  written for the old implicit DAG default must pin `"assignment": "dag"`; the
  mode-mismatch hint says so.
- `flat`, `dag`, and `graph` stay explicit opt-ins.

## 9. Authoring law

New `v2/skeleton/mixed-craft.md`: the item mix, the three type rules, the
copy test, the ≥2-per-MILO / ≤30% blueprint (≤6 of 20), and the rule that every
invented answer is recomputed in QA. `error-craft.md` is retitled as opt-in and
`question-craft.md`, `dag-craft.md`, `graph-craft.md`, `registry.md`, the
assignment `README.md`, and `SKILL.md` point at the new default.

## 10. Tests

Python (`tests/test_assignment_mixed.py`):

- a valid 10/8/2 deck validates; wrong counts, SA/unknown types, and a missing
  `mode` are rejected;
- `mc` answer bounds, position cap, ±1-word spread, banned phrases, and
  normalized duplicates are rejected;
- `tf` non-boolean answers and an unbalanced block are rejected;
- `multi` shares the error-mode option/answer rules and the length cue;
- sanitize strips `ans` and keeps the right fields; the key file carries
  `mode:"mixed"` with `ans` for every type;
- build integration ships an encrypted student deck and a mixed key.

JavaScript (`checker/app/test/`):

- `scoreNonAI` scores a mixed key by type;
- `export-book` writes `MC` / `TF` / `MULTI` columns and leaves error, flat, and
  DAG columns unchanged.

Smoke (`v2/tools/`):

- `assignment_smoke.js` walks an `mc`, a `tf`, and a `multi` slide and checks
  the export payload;
- `deck_layout_smoke.js` measures the 20-slide mixed deck at desktop, tablet,
  and phone widths.

## 11. Acceptance criteria

1. A workdir with `"components": ["assignment"]`, `"week"`, `"subject"`, and no
   `"assignment"` key builds with a valid 10/8/2 deck.
2. Student HTML contains no `ans` values; the teacher key contains them.
3. `assignment_smoke.js` passes for flat, dag, graph, error, and mixed.
4. `deck_layout_smoke.js` passes all 13 rendered runs.
5. `python -m pytest tests/` passes.
6. `npm test` from `checker/app` passes.
7. A mixed deck exports `MC`, `TF`, `MULTI`, and `Total` columns.
