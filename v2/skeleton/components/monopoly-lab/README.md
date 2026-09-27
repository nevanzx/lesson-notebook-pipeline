# monopoly-lab
The single-seller centrepiece (Section 3 of a monopoly / market-structure lesson):
sliders for the linear inverse demand curve's vertical intercept `a` and slope `b`
and a constant marginal cost `MC`, preset chips, a live demand + marginal-revenue +
marginal-cost chart with the monopoly point marked and the deadweight-loss triangle
shaded between the monopoly output and the competitive output, a results chip
strip, a plain-language readout, and a ±10% sensitivity table. Every stroke reads a
`--chart-*` token, so it re-tints with any skin.

What it computes, from the lesson's own rules: the optimal output rule
(`MR = MC`) for `MR = a − 2bQ`; the monopoly price read off the **demand** curve
(`P* = a − bQ*`, never off MR); the markup `P* − MC`; and the competitive output
where demand itself crosses `MC`. Both quantities are located by walking the curve
and bisecting, so no closed form the lesson does not teach is baked into this file.

Data (`LN.data.lab1 = {...}`):
```js
{ unit?: "units",
  init: { a, b, mc },
  ranges: { a: [min,max,step], b: [min,max,step], mc: [min,max,step] },
  presets: [{ label, a, b, mc }],
  copy: {
    a, b, mc,                     // slider labels; mc doubles as the MC legend entry
    mcline,                       // label for the flat marginal-cost line on the chart
    presets,                      // heading above the preset chips
    base, scen,                   // sensitivity table: base-case row, scenario column
    markup,                       // sensitivity table: markup column
    sensTitle,
    demand, mr, dwl,              // chart legend entries
    xAxis, yAxis,
    noSolution,                   // guard message when demand never crosses MC above zero
    readout: { thin, mid, wide }  // placeholders {q}{p}{mk}{mc}{qc}{gap}{unit};
  }                               //  picked by how large the markup is as a share of price
}
```
Keys absent from `ranges`/`copy` fall back to sensible defaults. All wording lives in
data — the component ships no content strings.

Pitfalls:
- Presets and `init` must be the lesson's own numbers (SKILL.md §9.1). A preset that
  invents an example the source does not carry is a source-only violation even though
  the arithmetic is right.
- A worked example the source states but never finishes (it gives the inputs and says
  the firm "solves the optimal output rule") should be worked out in the **prose**
  before it is used as a preset, so prose and widget agree.
- When `a <= mc` or `b <= 0` there is no interior optimum; the component shows
  `copy.noSolution` instead of a chart and renders no table.
- Do not label the shaded triangle's area: the lesson describes the deadweight loss
  as the triangular area between demand and MC from the monopoly output to the
  competitive output, and never gives a formula for its size. The chart shows the
  shape and the endpoints, not a number.
