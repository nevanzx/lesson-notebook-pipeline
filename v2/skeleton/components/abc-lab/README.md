# abc-lab
The centrepiece (Section 3): a live activity-based costing allocation table. For each
activity cost pool the student edits the pool cost, the total driver volume and each
product's driver volume; activity rates, per-pool allocations, total overhead, total
cost and operating income all recompute on every keystroke. On the face it also shows
the two checks ABC depends on (the products' driver volumes must add to the pool total;
the allocated overhead must add to the pool cost), a stacked bar per product splitting
its allocated overhead by pool, a plain-language profit/loss read-out, and a sensitivity
table that moves each pool's cost ±10%.

Data (`LN.data.abclab1 = ...`):
```js
{ money: "$",
  copy: { formula, cap, colPool, colCost, colTotal, colVol, colAlloc, colRate, colCheck,
          grpPool, grpRate, driver, perUnit, ok, lblCost, lblTotal, lblDc, lblRev,
          rowOh, rowDc, rowRev, rowOp, rowNote, ariaChart, chartTitle, revLead,
          okLine, okLine2, badLine, badLine2, opWord, volOk, volOk2, volWarn,
          sensTitle, scCol, scBase, scUp, scDn, sensOp, delta, baseRow, swipe },
  products: ["Standard", "Custom"],
  pools: [{ name: "Machine setups", driver: "production runs", cost: 300000,
            total: 200, vols: [60, 140] }, ...],
  direct: [450000, 260000],
  revenue: [1250000, 800000] }
```
Every string is a `copy` key with an English fallback, so `data.js` owns all wording.
Pool costs, driver volumes, direct costs and revenues must be the lesson's own figures
(§9.1): a pool's `vols` must sum to its `total`, or the read-out will warn.
When-not: single-product cost behaviour (use `cost-lab`) or a break-even question
(use `break-even-lab`) — this lab answers "which activity actually caused that overhead?".
