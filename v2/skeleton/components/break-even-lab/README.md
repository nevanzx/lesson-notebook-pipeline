# break-even-lab
The centrepiece (Section 3): FC/P/VC/volume sliders + preset chips, live inline SVG
break-even chart (loss/profit triangles, BEP marker, dashed FC line, legend, niceMax
axis scaling), a results chip strip, a plain-language readout that branches on the
margin of safety, and a +/-10% sensitivity table with red/green delta classes.
Every stroke reads a --chart-* token, so it re-tints with any skin. Guards cm <= 0.

Data (`LN.data.lab3 = ...`):
```js
{ money: "\u20B1", unit: "loaves", init: { fc: 45000, p: 160, vc: 80, vol: 750 },
  ranges: { fc: [5000, 120000, 500], p: [80, 300, 5], vc: [20, 150, 5], vol: [0, 2000, 10] },
  presets: [{ label: "The bakery (as in the lesson)", fc: 45000, p: 160, vc: 80, vol: 750 }] }
```
Pitfall: a multi-product preset must use weighted-average P and VC, never one product.
