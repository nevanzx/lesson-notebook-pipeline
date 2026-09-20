# case-match
Four-plus short scenarios, each matched to a concept by dropdown with instant feedback
(wrong answers may retry; correct locks). The situational-recognition workhorse.

Data (`LN.data.match6 = ...`):
```js
{ prompt: optional, concepts: ["Adverse selection", "Moral hazard", ...],
  scenarios: [{ text: "A driver buys full insurance, then parks less carefully.",
                answer: "Moral hazard", e: "Adverse selection is a hidden type before the deal; this is behaviour after it." }] }
```
Answers must be exact members of `concepts`.
Optional per-scenario `e`: appended to "Not quite — try again" — one clause naming the slip.
