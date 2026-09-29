# equity-lab
Weighted co-founder equity split (Week 10), live. Up to four founders, each with
a contribution value and a time-commitment factor, driving one live split:

    Ei = (Ci x Ti) / SUM over j of (Cj x Tj)

plus the lesson's four-year vesting with a one-year cliff applied to each
founder's calculated stake — a per-founder "time served" slider shows the share
vested, the equity kept, and the share that returns to the unallocated pool when
a founder leaves.

Data (`LN.data.equity1 = ...`):
```js
{ money: "$",
  copy: { contrib, time, presets, reset, splitLine, hundred, calcTitle, fName,
          fContrib, fTime, fScore, fShare, totalRow, totalScore, vestTitle,
          vestRule, vName, vElapsed, vPct, vKept, vBack, years, sumLine,
          partTimeLine, cliffLine, swipe },
  init: { founders: [{ name, c, t }],
          vest: { total: 4, cliff: 1, elapsed: [..] } },
  ranges: { c: [min,max,step], t: [min,max,step], elapsed: [min,max,step] },
  presets: [{ label, founders: [{name,c,t}], elapsed: [..] }] }
```

Vesting schedule — the lesson's own, no invention: nothing vests at or before the
cliff; at the cliff, `cliff / total` vests; the remaining `1 - cliff/total` vests
evenly from the cliff to `total` years. For the lesson's four-year/one-year
schedule that is 25% at month 12 rising to 100% at year 4, and 62.5% at 2.5 years.

Notes:
- A founder with `t` between 0 and 1 is part-time; the readout says so in words.
- While every founder sits at or before the cliff, the readout says in words that
  every share would return to the pool.
- Shares are recomputed live, so they always total 100% unless every score is 0,
  in which case the cell renders an em dash rather than dividing by zero.
- Presets must use the lesson's own two worked splits.
