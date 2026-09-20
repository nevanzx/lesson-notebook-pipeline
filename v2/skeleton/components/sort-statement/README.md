# sort-statement
Distinguish two commonly confused concepts. 8-12 statements, each bucketed left/right/both;
three buttons per item; first click locks (one-way), wrong picks reveal the correct bucket
with a dashed outline; live score chip with total denominator; Reset rebuilds.

Data (`LN.data.sort1 = ...`):
```js
{ left: "Fixed cost", right: "Variable cost",
  items: [{ t: "Rent for the shop", a: "left" }, { t: "Gas for deliveries", a: "right", e: "Gas rises with every added trip." },
          { t: "Insurance deposit amortised", a: "both" }] }   /* a in left|right|both */
```
Optional per-item `e`: shown in the wrong-pick feedback — name the slip, not just the bucket.
When-not: pure formatting/memorisation drills; anything needing numeric tolerance.
@media print hides the activity (game state is meaningless on paper).
