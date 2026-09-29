# cac-lab
Customer acquisition cost lab (Week 8): three numeric inputs — total marketing
and sales costs, new customers acquired, total sign-ups — driving one live
**CAC** figure, a plain-language readout, a *vanity-number trap* readout that
fires when sign-ups exceed buyers, a stacked cost-split bar, a per-channel
attribution table (each channel's cost ÷ its customers, cheapest flagged in
words as well as colour), and a six-row sensitivity table whose second row is
the lesson's own trap: what CAC would look like if sign-ups were the denominator.

Data (`LN.data.cac1 = ...`):
```js
{ money: "₱",
  copy: { cost, cust, signups, presets, reset, denomLine, cacOut, needLine,
          trapLine, trapWas, trapEnd, revLine, revWas, splitLine, other,
          attrTitle, chName, chCost, chCac, chCust, chRead, best,
          sensTitle, scCol, scBase, scSignups, scCostUp, scCostDn,
          scCustUp, scCustDn, delta, baseRow, swipe },
  init:   { cost, cust, signups },
  ranges: { cost: [min,max,step], cust: [min,max,step], signups: [min,max,step] },
  presets: [{ label, cost, cust, signups }],
  channels: [{ name, cost, cust, col }] }   // col: a var(--chart-*) token name
```

Notes:
- `signups` is never a denominator inside the formula — it exists so the trap
  readout and the `scSignups` row can show what the wrong choice would report.
- `channels` totals may be less than `cost`; the remainder renders as the
  `other` segment. Channel colours must be `var(--chart-*)` tokens, never hex.
- A channel with zero customers renders `—`, never a divide-by-zero or `0`.
- Presets must use the lesson's own ventures (Cacao de Barako, TuroKada, FitFlix).
