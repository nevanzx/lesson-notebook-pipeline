# mcq

Flat multiple-choice activity (in-section, easy→medium). One question per card,
four lettered choices; clicking a choice locks the item (no retry), colours the
picked choice, dims the rest, reveals the correct one, and shows the explanation
naming the trap. Scoreboard denominator is the TOTAL.

Data (`LN.data.quiz3 = ...`):
```js
{ prompt: "Pick the best answer to each question.",
  items: [{ q: "A firm borrows at 7% to fund a project expected to return 6%. What should it do?",
            choices: ["Reject it — it loses 1 percentage point per peso borrowed",
                      "Accept it — any positive return adds value",
                      "Accept it — the 6% is profitable in an accounting sense",
                      "Reject it — the loan principal must be repaid"],
            ans: 0,
            e: "A return below the financing cost destroys value even when the project is profitable on paper." }] }
```

`ans` is the 0-based index of the correct choice. Optional per-item `e` is
appended after "Correct." / "Not quite." — the explanation names the slip.

When-not: trivia recall; anything graded (this format refuses to grade — Section 7's
`assignment` collects instead).
