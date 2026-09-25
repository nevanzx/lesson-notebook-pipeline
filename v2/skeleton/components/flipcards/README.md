# flipcards
Recap section (Section 8): 6 click-to-reveal question/answer cards. Deliberately printable -
flattens to full Q+A pairs on paper, which is the recap's job.

**Containment (§1.5):** the two faces are grid-stacked (`.fl-inner{display:grid}`,
`.fl-face{grid-area:1/1}`) so a tile grows to its longest answer. Never revert to
`position:absolute;inset:0` faces in a fixed `min-height` — long answers then spill
outside the tile. `node tools/layout_smoke.js <built.html>` guards this.

Data (`LN.data.flip8 = ...`):
```js
{ title: optional, cards: [{ q: "prompt", a: "answer, two lines max" }] }
```
When-not: active quizzing with scoring (true-false) or step verification (step-solver).
