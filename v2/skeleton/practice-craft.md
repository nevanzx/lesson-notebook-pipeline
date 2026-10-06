# Practice sets (calculation lessons)

A **practice set** gives students independent reps on a section's method. It is an
*activity* (class discussion), never graded — the graded work is Section 7. See SKILL §2.4b.

## Shape

One `step-solver` mount per calculation section; its data is an **array of examples**, one
per problem:

```js
LN.data.<key> = [
  { title: "Practice 1 - total utility",
    story: "A student's first iced tea adds 16 utils, the second adds 12 and the third 7.",
    steps: [{ q: "What is total utility after three drinks?", a: 35, unit: "utils", tol: 0.01 }],
    solution: "MU 16 + 12 + 7 = 35.00 utils." },
  // ... 4-6 problems total
];
```

The mount is `<div data-component="step-solver" data-key="<key>" data-activity="class
discussion" data-present="2"></div>`.

## Rules

- **Count:** 4–6 problems per calculation section (5 default; 4 for a short section).
- **Rounding:** every answer is given to **two decimal places**; set `tol: 0.01`.
- **Independence:** the numbers must NOT come from the lesson's examples or figures (§2.4),
  and should vary across the problems — do not reuse one parameter set 4–6 times.
- **One number per problem.** Each problem has exactly one input; split multi-part questions.
- **Show the work.** Every `solution` states the formula, the substitution and the result,
  e.g. `"CS = 1/2 x (16 - 6) x 5 = $25.00."`
- **Situation first.** `story` states a concrete situation; a bare equation is not a problem.
- **Method only as taught.** Invent numbers, never derivations (§9.1).

## Traps (all seen in real builds)

- **Ties.** Avoid a price exactly equal to a willingness-to-pay value unless the section
  defines the tie rule; a tie flips the answer between "exceeds" and "at least".
- **Bundle equality.** With indivisible units the last-unit ratios need not be equal at the
  budget. Choose a budget that lands on an equality point, or ask for spending / ratios
  rather than asserting optimality.
- **False premises.** Never label the utility maximum "not optimal". If a proposed bundle is
  to fail the check it must leave budget unspent and/or have unequal ratios you then resolve.
  Verify the *premise*, not just the arithmetic — this class of bug survives an arithmetic-only
  check (dispatch a per-section reviewer, SKILL Part 5).
- **Stale wording.** If a section's prose or a step's `solution` claims "the ratios equal",
  make sure the numbers you chose actually reach an equality point, or soften the wording.
- **Unit chips.** `step-solver` renders units only from per-step `unit` / `suf`; a top-level
  `unit` field is ignored.
