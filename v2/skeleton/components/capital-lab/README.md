# capital-lab
Basel/BSP bank-capital lab (Week 7): a credit-exposure table (exposure band ×
risk weight → risk-weighted assets), Tier 1 / Tier 2 regulatory capital inputs,
and a loan-loss shock dial. Live outputs:

- **RWA** — each exposure amount × its risk weight, summed.
- **Capital ratios** — CET1, Tier 1, and the Capital Adequacy Ratio against the
  BSP minimum and the minimum-plus-buffer target (the buffer, `ccb`, is added to
  every minimum), each drawn on a track with a min marker and a target marker.
- **Verdicts in words** — pass / inside-the-buffer / breach, never colour alone.
- **Capital gaps** — each ratio's surplus or shortfall in money against
  minimum + buffer.
- A plain-language readout that names the binding ratio and the totals.

The shock dial writes off the selected exposure (and the same amount of CET1),
so the student sees RWA, ratios and gaps react together.

Data (`LN.data.cap1 = ...`):
```js
{ money: "₱", unit: "M",
  copy: {…all wording: titles, headings, templates ({min},{tgt},{s},{rwa},{w},{r},{m},{t1},{c}), verdict + readout sentences, footTpl, hSurplus, hShort…},
  minima: { cet1: 6, t1: 7.5, car: 10, ccb: 2.5 },
  exposures: [{ label, band, rw, amount }],
  capital: { cet1, at1, t2 },
  shockIndex: 0,                       // which exposure row the dial writes off (-1 = none)
  ranges: { shock: [min, max, step] },
  presets: [{ label, amounts: [...], capital: {...}, shock, note }] }
```

Notes:
- All CSS is scoped to `[data-component="capital-lab"]`; the `.cl-*` class names
  are generic and collide with other components otherwise (cac-lab also uses
  `.cl-tbl`, `.cl-note`, …).
- Amounts and capital are non-negative; an input left blank reads as 0.
- Minimums default to the BSP values shown above (`ccb` is the combined buffer);
  override via `minima` when the lesson states different ones.
- Presets must use the lesson's own figures.
