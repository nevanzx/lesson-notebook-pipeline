# ratio-lab
Operational-efficiency ratio lab (Week 5): nine numeric inputs (net/credit sales,
COGS, operating/net income, average inventory, beginning/ending assets, average
receivables) driving five live ratio cards — asset turnover, inventory turnover,
receivables turnover, operating margin, ROA — plus a plain-language readout and
a "what if net sales moved ±N%" sensitivity slider (costs and assets held fixed).

Data (`LN.data.lab1 = ...`):
```js
{ title?, presetNote?, sensMax?: 20,
  presets?: [{ label, values?: { netSales?, netCreditSales?, cogs?, opInc?,
    netInc?, avgInv?, begAssets?, endAssets?, avgAR? } }] }
```
Pitfall: presets must use source-only numbers; a ratio whose divisor is zero (or
missing) renders `n/a`, never a divide-by-zero or a bare `0`.
