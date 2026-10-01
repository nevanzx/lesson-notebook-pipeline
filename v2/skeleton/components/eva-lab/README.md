# eva-lab

The week's centrepiece calculator: the EVA subtraction, and the arithmetic that connects EVA to
MVA and to the value formula. It shows, live and from one set of inputs:

- NOPAT = EBIT x (1 - tax rate)
- Invested capital = book debt + book equity
- Capital charge = WACC x invested capital
- EVA = NOPAT - capital charge, with the sign read in plain language
- Return on invested capital, and the identical figure reported as the break-even cost of capital
- Market value of the firm, MVA, and the growth in EVA the market's MVA implies (`WACC - EVA/MVA`)
- Value = NOPAT x (1 - g/ROIC) / (WACC - g) at a student-set `g`, plus the reinvestment rate `g/ROIC`
- A two-bar figure: after-tax operating profit against the capital charge, so the gap *is* EVA

**When to use it.** Whenever a lesson's source carries a worked EVA/MVA or value-formula example
and the student should be able to move the cost of capital, the tax rate or the growth assumption
and watch the verdict flip. If a lesson has a capital charge but no market values, drop the
`mve` / `mvd` inputs and the MVA rows.

## Data (`LN.data.<key> = ...`)

```js
{
  money: "₱",
  copy: { ...every user-facing string in the component... },
  init:   { ebit, tax, capital, wacc, mve, mvd, g },
  ranges: { tax: [0, 50, 0.5], wacc: [4, 20, 0.25], g: [-10, 20, 0.5] },
  presets:[ { label, ebit, tax, capital, wacc, mve, mvd, g } ]
}
```

- `tax`, `wacc`, `g` are **percent points in the data** (25, 10, 5) and fractions internally.
- The four money inputs are `type="number"`; the three rate inputs are range sliders bounded by `ranges`.
- `copy` keys, all optional (the component carries English fallbacks, so a build that omits one
  still runs): `ebit, tax, capital, wacc, mve, mvd, g, presets, reset, evaOut, kNopat, kCapital,
  kCharge, kEva, kRoic, kBreak, kMvf, kMva, kImplied, kValue, kReinv, svgAlt, barTitle, barNopat,
  barCharge, atBreak, posLine, posWas, posCharge, negLine, negWas, negNopat, reinvLine, reinvOf,
  matchLine, mismatchLine, flowStock`.

**Source discipline.** The component invents no numbers. Every `init` and every `preset` figure must
come from the lesson's own worked example or its sensitivity table — Week 9's four presets are the
Camayan Foods columns and the three sensitivity rows in `src/worked.txt`, and nothing else.

**Containment (§1.5).** No fixed heights on text-bearing boxes; the bar figure is an inline SVG
sized by `viewBox` with `width:100%; height:auto`; the readout grid collapses to one column at
900px so number inputs never squeeze. Verify with `node tools/layout_smoke.js <built.html>` at
desktop **and** `--width 390`.
