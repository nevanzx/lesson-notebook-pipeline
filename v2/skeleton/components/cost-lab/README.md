# cost-lab
The centrepiece for a short-run cost lesson: a total-fixed-cost slider plus one
editable variable-cost input per output level, rebuilding the whole cost matrix
(q, TFC, TVC, TC, MC, AFC, AVC, ATC) live — the q=0 row included, with dashes
where the averages are undefined. Plots MC/ATC/AVC/AFC against output with the
AVC and ATC minima marked, names the cheapest output level in plain language
("lowest ATC … that is the efficient scale of production"), states where MC
passes each average, and swings fixed cost and the next unit's cost by 10% so
the efficient scale visibly moves. Every stroke reads a --chart-* token (AFC
uses --ink-faint, dashed), so it re-tints with any skin. A `Reset to the
lesson's schedule` chip restores the source values. Hidden in print — pair it
with a static SVG figure in the prose (§2.5), which is the version that prints.

Data (`LN.data.lab3 = ...`):
```js
{ money: "$", unit: "units", tfc: 100, rows: [50, 90, 150, 240, 370, 550],
  ranges: { tfc: [0, 500, 10] } }
```
`rows` is total variable cost at q = 1..n. TVC at q = 0 is 0 by definition, so
the first unit's MC is its own TVC. `money` defaults to "$", `unit` to "units",
`ranges.tfc` to [0, 500, 10].

Pitfall: `rows` and `tfc` must be source-only numbers (§9.1) — this lab ships no
`presets`, because a cost lesson supplies exactly one schedule and a second one
would be an invented example. A blank or non-numeric TVC input fails closed to
the `cl-empty` card rather than drawing a partial curve. Values are formatted to
2dp only when they need it, so a whole-dollar column prints as the source's
table does.
