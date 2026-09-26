# bond-lab
The bond-valuation centrepiece (Section 3 of a bond lesson): a live coupon-bond
pricer with a reverse YTM solver, annual or semi-annual frequency, the
price-yield curve, and a ±bps repricing sensitivity table. Two modes — `price`
(yield → price) and `ytm` (price → yield, solved by bisection) — classify the
result as par / premium / discount and state the coupon-vs-yield relation.

Data (`LN.data.lab3 = ...`):
```js
{ money?: "$",
  init: { mode: "price"|"ytm", amt, cr, y, n, freq?: 1|2, p },
  ranges: { amt: [min,max,step], cr: [...], y: [...], n: [...], p: [...] },
  presets: [{ label, mode?, amt?, cr?, y?, n?, freq?, p? }],
  copy: { modes: ["Price","Yield"], periodOne, periodHalf,
    clsPremium, clsDiscount, clsPar, relEqual, relAbove, relBelow,
    faceLabel, crLabel, yLabel, priceLabel, nLabel, yrOne, yrMany,
    freqLabel, freqAnnual, freqSemi, presetsLabel,
    chipsPrice: [×5 labels], chipsYtm: [×5 labels],
    readPrice, readYtm,                              // {face}{cr}{y}{p}{price}{cp}{N}{rate}{period}{cls}{relation}
    sensTitle, sensRow, sensHead: [col,col,col],
    axisPrice, axisYield, parLegend } }
```
Pitfall: `freq` is periods per year (1 annual, 2 semi-annual) and the semiannual
rate shown is `yield / freq`; presets must be source-only numbers (Part 9 §9.1).
