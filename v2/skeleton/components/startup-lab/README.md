# startup-lab
The total startup-capital centrepiece for a business-plan lesson (Section 3 or 4
of one): the plan's own formula —
`Total Startup Costs = Fixed Assets + Pre-Opening Expenses + Initial Working
Capital + Contingency Reserve` — with a slider per formula term plus the reserve
rate, a live total, a composition bar showing where the capital actually goes,
a plain-language readout, and a sensitivity table that holds the reserve to the
two ends of the lesson's own band and swings each cost bucket by 10%.

The reserve is always computed on the **subtotal of the first three items**, not
on the total. The component says so in its own readout (`copy.reserveLine`),
because a student who divides the subtotal by `1 + rate` gets every downstream
figure quietly wrong.

Data (`LN.data.lab3 = ...`):
```js
{ money?: "$",
  init:    { fa, pre, wc, rate },            // rate is a whole percent
  ranges:  { fa: [min,max,step], pre: [...], wc: [...], rate: [min,max,step] },
  presets: [{ label, fa, pre, wc, rate }, …],
  copy: { fa, pre, wc, rate, total, needLine, about, biggest, ofTotal,
          reserveLine, reserveNow, reserveIs, onTop, presets, reset, shareOf,
          sensTitle, scCol, scBase, scRateLo, scRateHi, scFa, scPre, scWc,
          delta, baseRow, swipe } }
```
Every `copy` string is shown to the student, so the component carries no content
of its own — all wording lives in `data.js`. Fallbacks exist for the four bucket
labels and `total` only; the rest render blank if omitted.

`scRateLo` / `scRateHi` name the low and high ends of the reserve band as
**words** in the label ("Reserve at the low end of the 10–20% band") while the
component hard-codes 10 and 20 in the maths — if a lesson teaches a different
band, edit those two numbers in `component.js` or override the copy.

Pitfalls:
- Presets and `init` must be source-only figures (Part 9 §9.1). Ship the
  lesson's own worked ventures; do not fill the schema with round invented
  numbers to look tidy.
- Set `ranges` wide enough to contain every preset, or a preset lands off the
  end of its slider.
- The component hides in print (like the other labs). Every figure it shows must
  therefore also appear in the section prose (§2.4) — the prose carries the math,
  the lab practises it.
