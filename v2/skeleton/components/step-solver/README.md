# step-solver
Worked examples verified step-by-step, not just the final number. Numbered rows with text
inputs (currency/comma/percent tolerant via LN.num, tolerance via LN.close); Check marks every
input including empties (never a lying red-outline message); full solution is a text block
toggled by a button (content stays text, never raw HTML).

Data (`LN.data.ex4 = {...}` or an array of example objects for several in one mount):
```js
{ title: "Example 1 - the bakery", story: "Prose setup from the source.", unit: "loaves",
  steps: [{ q: "Contribution margin per loaf", a: 80, pre: "\u20B1", tol: 0.5 },
          { q: "Break-even quantity", a: 562.5, unit: "loaves", tol: 1 }],
  solution: "Plain-text reasoning, one or two sentences per step." }
```
`unit` is read from each **step**, not from the example — a top-level `unit` field is ignored.

**Practice sets (SKILL §2.4b).** The array form is also the practice-set mount: 4–6
independent single-step problems whose answers are rounded to two decimal places
(`tol: 0.01`), with numbers independent of the lesson's examples. See
`skeleton/practice-craft.md`.
