# mcq

Multiple-choice activity, in one of two shapes. One question per card, four lettered
choices; clicking a choice locks the item (no retry), colours the picked choice, dims the
rest, reveals the correct one, and shows the explanation naming the trap. Scoreboard
denominator is the TOTAL. The component never shuffles: the author's order ships.

Both shapes are folded by the shell — the mount carries `data-collapse` and the student
sees a closed dropdown (SKILL §2.4c).

**Comprehension check** — exactly 10 items at medium difficulty, all one shape.
Mount with `data-activity="comprehension check"` and
`data-collapse="Comprehension check — 10 items"`.

**MCQ Situational** — exactly 10 items, two shapes in one block (SKILL §2.4d):
items 1–5 choose among four **terms** (1–3 words each); items 6–10 choose among four
statements of **exactly five words**. Every stem is a situation of 35 words or fewer.
`build.py` fails a block that breaks a count. Mount with
`data-activity="mcq situational"` and `data-collapse="MCQ Situational — 10 items"`.

Data (`LN.data.quiz3 = ...`), same object for both:

```js
{ prompt: "Pick the best answer to each question.",
  items: [{ q: "A firm borrows at 7% to fund a project expected to return 6%. What should it do?",
            choices: ["Reject: return below funding cost",
                      "Accept: any positive return adds value",
                      "Accept: the 6% is profitable on paper",
                      "Reject: the principal must be repaid"],
            ans: 0,
            e: "A return below the financing cost destroys value even when the project is profitable on paper." }] }
```

`ans` is the 0-based index of the correct choice. Optional per-item `e` is
appended after "Correct." / "Not quite." — the explanation names the slip. Spread the
key across A–D: no position more than three times in ten.

When-not: trivia recall; anything graded (this format refuses to grade — Section 7's
`assignment` collects instead).
