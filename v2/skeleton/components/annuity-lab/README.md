# annuity-lab
The annuity valuation centrepiece (Section 3 of a time-value lesson): three modes
— ordinary annuity, annuity due, perpetuity — with sliders for the payment `C`,
the periodic rate `r`, and the number of periods `n`, a PV/FV result strip, a
grouped PV-vs-FV chart that shows the one-period head start of an annuity due,
a plain-language readout, and a rate/period sensitivity table.

Data (`LN.data.lab3 = ...`):
```js
{ money?: "$",
  modes?: ["ordinary","due","perpetuity"],      // subset; copy.modes labels them in order
  init: { mode?, c, r, n },
  ranges: { c: [min,max,step], r: [...], n: [...] },
  presets: [{ label, mode?, c, r, n? }],
  copy: { modes: [...], cLabel, rLabel, nLabel, presetsLabel,
    barPerp, barPVoa, barPVdue, barFVoa, barFVdue, chartLabel,
    chipPerpPV, chipPerpSum, chipDuePV, chipDueFV, chipDuePVoa,
    chipOaPV, chipOaFV, chipOaSum,
    readPerp, readDue, readOA,                       // {c}{r}{n}{pv}{fv}{pvOA}{fvOA}{sum}{boost}
    sensTitle, sensHead: [col,col,col], sensBase, sensRateDown, sensRateUp,
    sensYearsBack, sensYearsFwd } }
```
Pitfall: presets and init must be source-only numbers (Part 9 §9.1); the perpetuity
mode ignores `n` (its control row hides), and renders `—` for FV by design.
