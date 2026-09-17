LN.components["port-lab"] = {
  init: function (root, d) {
    d = d || {};
    function pct(x) { return (x * 100).toFixed(1) + "%"; }
    function div(cls) { var e = document.createElement("div"); e.className = cls; return e; }
    function titleEl(t) { var h = document.createElement("p"); h.className = "pl-title"; h.textContent = t; return h; }

    var assets = d.assets || ["Asset 1", "Asset 2"];
    var wrap = div("pl-root");
    var grid = div("pl-grid");
    var ctrl = div("pl-ctrl");
    var out = div("pl-out");
    var tbl = document.createElement("table");
    tbl.className = "pl-tbl";
    var rows = [
      ["Portfolio risk \u03c3p", "sig"],
      ["Weighted-average risk", "avg"],
      ["Benefit from diversification", "gain"]
    ];
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var td1 = document.createElement("td"); td1.textContent = r[0];
      var td2 = document.createElement("td"); td2.textContent = "\u2014";
      tr.appendChild(td1); tr.appendChild(td2); tbl.appendChild(tr);
      r.push(td2);
    });
    function cellFor(key) {
      for (var i = 0; i < rows.length; i++) { if (rows[i][1] === key) return rows[i][2]; }
      return null;
    }
    var verdict = div("pl-verdict");
    if (d.title) wrap.appendChild(titleEl(d.title));
    grid.appendChild(ctrl); grid.appendChild(out);
    out.appendChild(tbl); out.appendChild(verdict);
    wrap.appendChild(grid);
    root.appendChild(wrap);

    var sliders = {};
    function slide(name, label, min, max, step, val) {
      var lab = document.createElement("label");
      lab.appendChild(document.createTextNode(label + ": "));
      var span = document.createElement("span"); span.textContent = "";
      lab.appendChild(span); lab.appendChild(document.createElement("br"));
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      lab.appendChild(inp);
      ctrl.appendChild(lab);
      sliders[name] = { span: span, inp: inp };
      return inp;
    }

    var ws = slide("w", d.sliderW || ("Weight in " + assets[1]), 0, 1, 0.01, d.init != null ? d.init : 0.5);
    var rs = slide("rho", "Correlation \u03c1", d.rhoMin != null ? d.rhoMin : -1, d.rhoMax != null ? d.rhoMax : 1, 0.01, d.rhoInit != null ? d.rhoInit : 0.3);

    function calc() {
      var w2 = parseFloat(sliders.w.inp.value);
      var w1 = 1 - w2;
      var rho = parseFloat(sliders.rho.inp.value);
      var s1 = d.sig1, s2 = d.sig2;
      var varp = w1 * w1 * s1 * s1 + w2 * w2 * s2 * s2 + 2 * w1 * w2 * rho * s1 * s2;
      var sigp = Math.sqrt(Math.max(varp, 0));
      var avg = w1 * s1 + w2 * s2;
      var gain = avg - sigp;
      sliders.w.span.textContent = pct(w2) + " \u00b7 " + assets[1] + " / " + pct(w1) + " \u00b7 " + assets[0];
      sliders.rho.span.textContent = rho.toFixed(2);
      var cSig = cellFor("sig"), cAvg = cellFor("avg"), cGain = cellFor("gain");
      if (cSig) cSig.textContent = pct(sigp);
      if (cAvg) cAvg.textContent = pct(avg);
      if (cGain) cGain.textContent = pct(gain) + (gain > 0.0005 ? " (risk diversified away)" : " (no benefit \u2014 \u03c1 = +1)");
      verdict.textContent = gain > 0.002
        ? "With \u03c1 = " + rho.toFixed(2) + ", this mix carries " + pct(gain) + " less risk than simply blending the two stocks \u2014 the frontier\u2019s leftward bulge, in numbers."
        : "At \u03c1 = +1 the assets move in lockstep: no amount of re-weighing removes \u2014 or adds \u2014 risk.";
    }
    ws.addEventListener("input", calc);
    rs.addEventListener("input", calc);
    calc();
  }
};
