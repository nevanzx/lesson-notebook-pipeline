# tvm-lab
The money-through-time centrepiece (Section 3 of a TVM lesson; Section 7 of an
interest-rate/bond lesson), in three modes:
1. **FV** — compound curve vs simple line, shaded interest-on-interest gap.
2. **PV** — the discount window: today-value of a fixed promise decaying with the wait.
3. **Duration** — annual-coupon bond: live Macaulay/modified duration + convexity,
   the price-yield curve with its duration tangent (the wedge between them IS convexity),
   duration estimate vs exact repricing for a chosen Δy, and a ±25/50/100 bps sensitivity table.
Common to all modes: sliders, preset chips, results chip strip, plain-language readout
templates, sensitivity table. Every stroke reads --chart-*/shell tokens.

Data (`LN.data.lab3 = {...}`):
```js
{ money: "\u20B1",
  modes: ["fv", "pv", "dur"],            // optional: restrict modes; single mode hides the toggle row
  init: { mode: "fv", amt: 100, r: 10, n: 2 },     // dur mode adds: cr: 6, dy: 100
  ranges: { amt: [100, 50000, 50], r: [0, 30, 0.5], n: [1, 10, 1],
            cr: [0, 12, 0.25], dy: [-300, 300, 25] },   // cr/dy only used by dur
  presets: [{ label, mode, amt, r, n, cr?, dy? }],
  copy: {
    modes: [fvLabel, pvLabel, durLabel],
    amtFV, amtPV, faceLabel, rLabel, yLabel, crLabel, nLabel, TLabel, dyLabel, presetsLabel,
    chipsFV: [a, b, c], chipsPV: [a, b], chipsDUR: [dmac, dmod, convexity, price],
    readFV / readPV / readDUR / readFVZero / readDurZero:        // {amt} {r} {n} {years}
      // FV also {fv}{simple}{extra}; PV also {pv}{lost}; DUR also
      // {face}{cr}{y}{T}{dmac}{dmod}{conv}{dy}{est}{exact}{gap}
    sensTitle, sensHead: [c1, c2, c3], sensBase, sensRateDown, sensRateUp,
    sensYearsBack, sensYearsFwd,
    sensDurTitle, sensDurHead: [dy, estimate, exact], sensDurRow: "\u0394y {n} bps",
    axisYears, axisFV, axisPV, axisPrice, axisYield,
    legendCompound, legendSimple, legendPromise, legendCurve, legendTangent,
    markerFV, markerPV, markerDur: {p}{y} } }
```
Keys absent from `ranges`/`copy` fall back to defaults where sensible; the dur mode
requires cr/dy ranges and its copy keys. All wording lives in data — the component
ships no content strings. `markerFV`/`markerPV`/`markerDur` templates carry their own
currency symbol where shown; do not double it.
Pitfall: presets must use the lesson's own numbers. Duration maths assume annual
coupons; y is a decimal in the maths but the slider/labels speak percent.
