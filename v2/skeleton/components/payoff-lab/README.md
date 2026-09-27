# payoff-lab
Renders a 2x2 duopoly payoff matrix from `LN.data` and **reads it back**: each
firm's best responses, whether each has a dominant strategy, which cell is the
Nash equilibrium, and whether any cell leaves *both* firms better off than the
equilibrium (the prisoner's-dilemma test). With a `demand` block it also becomes
a live builder — the student edits the source's own parameters and all four
cells re-derive from `Qi = a - b*Pi + c*Pj` and `pi = (P - C) * Q`, each cell
printing its own four working lines.

Data (`LN.data.buildlab1 = ...`):
```js
{ title?, sub?, solution?,
  row: { name: "Firm A", strategies: ["High price", "Low price"] },  // exactly 2
  col: { name: "Firm B", strategies: ["High price", "Low price"] },  // exactly 2
  unit: "$",                       // prefix shown before every payoff; "" to omit
  sym:  { row: "A", col: "B" },    // symbols in the per-cell working lines: QA, piA
  matrix: [[ [400,400], [360,276] ],     // [rowIdx][colIdx] = [rowFirm, colFirm]
           [ [276,360], [252,252] ]],
  // builder form — including `demand` derives the matrix and shows the controls
  demand: { a: 100, b: 6, c: 4, cost: 5 },   // or cost: { row: 5, col: 5 }
  prices: { row: [10, 8], col: [10, 8] },
  ranges: { b: [0,10,1], c: [0,10,1], cost: [0,20,1], price: [0,40,1] } }
```

Mount: `<div data-component="payoff-lab" data-key="buildlab1" data-activity="class discussion"></div>`

Notes for authors:

- **`matrix` is required** unless `demand` is given; the builder recomputes it
  anyway, so the printed values must agree with the parameters you ship.
- Only **2x2** games. More strategies need a different component.
- Every verdict is *computed* from the four cells — the component asserts no
  game-theoretic fact the data does not carry.
- The welfare line uses **Pareto dominance**, not the largest joint total: a cell
  is reported as "both would rather be here" only when it is no worse for *both*
  firms than every equilibrium cell and strictly better for at least one. A game
  with a dominant strategy but no such cell reads as a coordination problem, not
  a prisoner's dilemma — which is the distinction the lecture needs.
- **Containment (§1.5):** the matrix scrolls horizontally inside `.pl-scroll` and
  the two-column body is clamped, so long strategy labels cannot widen the sheet.
  Control ranges are UI bounds only, never asserted values.
- Print keeps the matrix and the readout, hides the controls and the working
  lines.
