# forecast-lab

The week's centrepiece calculator for financial planning: the percent-of-sales pro-forma and the
funding it requires, computed live from one set of inputs. It shows:

- Projected sales: `S1 = S0 × (1 + g)`
- New assets growth requires: `(A*/S0) × ΔS`
- Spontaneous financing that rises with sales: `(L*/S0) × ΔS`
- Addition to retained earnings: `M × S1 × (1 − d)`
- External financing needed: `EFN = new assets − spontaneous − retained`, with the sign read in plain language
- Internally fundable growth rate: `g* = M(1 − d) / [ (A*/S0) − (L*/S0) − M(1 − d) ]` (long-term debt held fixed)
- Sustainable growth rate: `SGR = (ROE × b) / (1 − ROE × b)`, where `ROE = M × S0 / equity`
- A figure: EFN plotted against the planned growth rate, with the zero-crossing (self-funding) marked and the current growth flagged

**When to use it.** Whenever a lesson teaches the percent-of-sales pro-forma, external financing
needed, or growth-and-funding limits, and the student should be able to move the growth rate, the
margin or the payout ratio and watch the funding need move. If a lesson has no balance-sheet ratios,
drop the `as` / `sl` inputs and the internally-fundable/EFN rows.

## Data (`LN.data.<key> = ...`)

```js
{
  money: "₱",
  unit: "million",
  copy: { ...every user-facing string in the component... },
  init:   { sales, growth, as, sl, margin, payout, equity },
  ranges: { growth: [0,30,0.1], as: [40,120,1], sl: [0,60,1], margin: [1,15,0.1], payout: [0,100,1] },
  presets:[ { label, sales, growth, as, sl, margin, payout, equity } ]
}
```

- `growth`, `as`, `sl`, `margin`, `payout` are **percent points in the data** (15, 80, 20, 6, 40)
  and fractions internally; `sales` and `equity` are absolute amounts.
- `sales` and `equity` are `type="number"`; the five rate inputs are range sliders bounded by `ranges`.
- `copy` keys, all optional (the component carries English fallbacks, so a build that omits one still
  runs): `sales, growth, as, sl, margin, payout, equity, presets, reset, efnOut, subNeed, subSurplus,
  svgAlt, figTitle, figX, selfMark, kProj, kDs, kAssets, kSpont, kRet, kEfn, kSelf, kRoe, kSgr,
  needLine, needWas, surLine, surWas, selfLine, selfWas, sgrLine, sgrWas, aboveSgr, negRoe`.

**Source discipline.** The component invents no numbers. Every `init` and every `preset` figure must
come from the lesson's own worked example or its sensitivity/scenario tables — Week 10's five presets
are the plan, the weak and strong scenarios, and the self-funding and sustainable rates from
`src/worked.txt` and `src/scenario.txt`, and nothing else.

**Containment (§1.5).** No fixed heights on text-bearing boxes; the figure is an inline SVG sized by
`viewBox` with `width:100%; height:auto`; the readout grid collapses to one column at 900px so the
number inputs never squeeze. Verify with `node tools/layout_smoke.js <built.html>` at desktop **and**
`--width 390` (and with `--present` when the lesson ships presentation tags).
