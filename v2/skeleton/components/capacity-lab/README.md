# capacity-lab

Operations capacity and storage feasibility lab (Week 11): five numeric inputs —
parallel production lines, output per day, production days per month, forecast
demand per month, and freezer storage capacity — driving one live **monthly
capacity** figure, a demand-versus-capacity bar pair, a plain-language readout
that separates the two failure modes the source distinguishes (equipment
shortfall vs storage shortfall), a **days of cover** bar for the freezer, an
optional master-production-schedule table, and a sensitivity table carrying the
source's own what-ifs.

Data (`LN.data.<key> = ...`):
```js
{ unit: "packs",                 // the output unit, singular, no symbol
  copy: { lines, perday, days, demand, store, presets, reset, formulaLine,
          barTitle, demandRow, capRow, capOut, okLine, spare, shortLine,
          shortEnd, storeShort, storeShortEnd, storeTight, storeTightEnd,
          storeOk, storeOkEnd, days, maxCover, storeTitle, schedTitle,
          sensTitle, scCol, scOut, scBase, scDemUp, scOutDn, scDaysDn,
          scStoreDn, scStoreBase, baseRow, delta, swipe },
  init:   { lines, perday, days, demand, store },
  ranges: { lines: [min,max,step], perday: [...], days: [...],
            demand: [...], store: [...] },
  presets: [{ label, lines, perday, days, demand, store, note? }],
  stages?: [{ name, days }] }    // optional: the source's MPS rows
```

Notes:
- `unit` is a bare noun (`packs`, `kg`) — this lab deals in counts and weights,
  never currency, so it takes no `money` prefix.
- **`lines` counts parallel production lines, and `perday` is the plant's rated
  output for one production day — exactly as the source states it.** The Week 11
  source says Banana Leaf Kitchen's *two* industrial steam cookers "can process
  at most 200 packs per day" *between them*, so that venture is entered as
  `lines: 1, perday: 200`, never as `lines: 2, perday: 200` (which would silently
  double the source's own rating). Raising `lines` asks what a second identical
  line would do; it is a what-if, not a claim about the lesson's venture.
- The two tests are kept distinct because the source keeps them distinct:
  `capacity = lines × perday × days` answers whether the equipment can make the
  forecast, and `cover = store / daily output` answers whether finished goods can
  wait for the delivery date. A venture can pass the first and fail the second —
  that is exactly Banana Leaf Kitchen's December position (1,200 packs/month
  normal, 2,400 at the peak, against a 300-pack freezer), and the readout must be
  able to say so.
- The `store` readout degrades gracefully: with `store` at 0 no cover bar and no
  storage line render, so a venture with no cold store (Kakaw Davao) is not told
  it holds zero days of anything.
- Presets must use the lesson's own ventures and the source's own figures only —
  Banana Leaf Kitchen in Bulacan and Kakaw Davao (one melanger, 25 kg per
  48-hour cycle = 12.5 kg/day, about 120 kg/month from 200 kg of dried beans).
  Never add a hypothetical third venture.
