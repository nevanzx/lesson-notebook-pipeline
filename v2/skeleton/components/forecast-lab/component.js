/* forecast-lab — the percent-of-sales pro-forma and funding worksheet, live.

   The lesson's formulas:
     Projected sales   S1 = S0 x (1 + g)
     New assets        (assets / sales) x dS
     Spontaneous fin.  (liab / sales) x dS
     Retained earnings M x S1 x (1 - d)
     EFN               new assets - spontaneous - retained
     Internally fundable growth   g* = M(1-d) / [ (assets / sales) - (liab / sales) - M(1-d) ]
     Sustainable growth rate      SGR = (ROE x b) / (1 - ROE x b)

   Data: LN.data.<key> = {
     money, unit, copy:{...all wording},
     init:{sales, growth, as, sl, margin, payout, equity},
     ranges:{growth, as, sl, margin, payout},
     presets:[{label, sales, growth, as, sl, margin, payout, equity, note}]
   }
   All wording comes from data.js; this file carries no content strings, and it
   invents no numbers — the defaults and presets are the lesson's own figures. */
LN.components["forecast-lab"] = {
  init: function (root, d) {
    var money = d.money || "P";
    var unit = d.unit || "";
    var C = d.copy || {};
    function txt(k, fb) { return (C[k] != null) ? C[k] : fb; }
    var R = d.ranges || {};
    function rng(k, fb) { return R[k] || fb; }

    var I = d.init || {};
    var base = {
      sales: LN.num(I.sales) || 0,
      growth: LN.num(I.growth) || 0,
      as: LN.num(I.as) || 0,
      sl: LN.num(I.sl) || 0,
      margin: LN.num(I.margin) || 0,
      payout: LN.num(I.payout) || 0,
      equity: LN.num(I.equity) || 0
    };
    var D = {};
    Object.keys(base).forEach(function (k) { D[k] = base[k]; });

    /* money with up to 3 decimals, trailing zeros trimmed, thousands grouped */
    function fnum(v) {
      if (!isFinite(v)) { return "\u2014"; }
      var neg = v < -0.0005;
      var a = Math.abs(v);
      var s = a.toFixed(3).replace(/\.?0+$/, "");
      if (s === "") { s = "0"; }
      var parts = s.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      s = parts.join(".");
      return (neg ? "\u2212" : "") + s;
    }
    function m2(v) { return money + fnum(v); }
    function m2u(v) { return money + fnum(v) + (unit ? " " + unit : ""); }
    function p2(v) {
      if (!isFinite(v)) { return "\u2014"; }
      var s = (v * 100).toFixed(2) + "%";
      return s;
    }

    /* the lesson's formulas, exactly as the lesson states them */
    function projSales() { return D.sales * (1 + D.growth / 100); }
    function dS() { return projSales() - D.sales; }
    function reqAssets() { return (D.as / 100) * dS(); }
    function spont() { return (D.sl / 100) * dS(); }
    function retained() { return (D.margin / 100) * projSales() * (1 - D.payout / 100); }
    function efn() { return reqAssets() - spont() - retained(); }
    function retention() { return 1 - D.payout / 100; }
    function mb() { return (D.margin / 100) * retention(); }
    function roe() { return D.equity !== 0 ? (D.margin / 100) * D.sales / D.equity : NaN; }
    function sgr() {
      var r = roe(), b = retention();
      var rb = r * b;
      return isFinite(rb) && (1 - rb) !== 0 ? rb / (1 - rb) : NaN;
    }
    function selfFund() {
      var den = (D.as / 100) - (D.sl / 100) - mb();
      return Math.abs(den) > 1e-9 ? mb() / den : NaN;
    }
    function efnAt(g) {
      var S1 = D.sales * (1 + g);
      return (D.as / 100) * D.sales * g - (D.sl / 100) * D.sales * g
        - (D.margin / 100) * S1 * (1 - D.payout / 100);
    }

    /* ---------- frame ---------- */
    var wrap = LN.h("div", { class: "ln-el" });
    var left = LN.h("div", { class: "el-left" });
    var right = LN.h("div", { class: "el-right" });
    var head = LN.h("div", {});
    var svgBox = LN.h("div", { class: "el-svg" });
    var read = LN.h("div", { class: "el-read" });
    var grid = LN.h("div", { class: "el-grid" });
    right.appendChild(head); right.appendChild(svgBox);
    right.appendChild(read); right.appendChild(grid);
    wrap.appendChild(left); wrap.appendChild(right);
    root.appendChild(wrap);

    /* ---------- controls ---------- */
    var outs = {}, inputs = {};
    function moneyCtl(key, label, step) {
      var out = LN.h("span", { class: "el-out", text: "" });
      var inp = LN.h("input", { type: "number", step: step || 10, value: D[key],
        "aria-label": label });
      inp.addEventListener("input", function () {
        var v = parseFloat(inp.value);
        D[key] = isNaN(v) ? 0 : v;
        recalc();
      });
      inputs[key] = inp; outs[key] = out;
      left.appendChild(LN.h("div", { class: "el-ctl" }, [
        LN.h("label", { class: "el-lab", text: label }),
        LN.h("div", { class: "el-inrow" }, [inp]), out]));
    }
    function rateCtl(key, label, dflt) {
      var r = rng(key, dflt);
      var out = LN.h("span", { class: "el-out", text: "" });
      var inp = LN.h("input", { type: "range", min: r[0], max: r[1], step: r[2],
        value: D[key], "aria-label": label });
      inp.addEventListener("input", function () {
        D[key] = parseFloat(inp.value);
        recalc();
      });
      inputs[key] = inp; outs[key] = out;
      left.appendChild(LN.h("div", { class: "el-ctl" }, [
        LN.h("label", { class: "el-lab", text: label }),
        LN.h("div", { class: "el-inrow" }, [inp]), out]));
    }
    moneyCtl("sales", txt("sales", "Base-year sales"), 10);
    rateCtl("growth", txt("growth", "Planned sales growth"), [0, 30, 0.1]);
    rateCtl("as", txt("as", "Assets as a share of sales"), [40, 120, 1]);
    rateCtl("sl", txt("sl", "Spontaneous liabilities as a share of sales"), [0, 60, 1]);
    rateCtl("margin", txt("margin", "Net profit margin"), [1, 15, 0.1]);
    rateCtl("payout", txt("payout", "Dividend payout ratio"), [0, 100, 1]);
    moneyCtl("equity", txt("equity", "Shareholders' equity"), 10);

    var presets = d.presets || [];
    if (presets.length) {
      var prow = LN.h("div", { class: "el-presets" });
      presets.forEach(function (p) {
        prow.appendChild(LN.h("button", { type: "button", text: p.label,
          onclick: function () { load(p); } }));
      });
      left.appendChild(LN.h("div", { class: "el-ctl" }, [
        LN.h("label", { class: "el-lab", text: txt("presets", "The lesson's own figures") }),
        prow]));
    }
    left.appendChild(LN.h("div", { class: "el-ctl" }, [
      LN.h("button", { type: "button", class: "el-reset", text: txt("reset", "Start over"),
        onclick: function () { load(base); } })]));

    function load(p) {
      ["sales", "growth", "as", "sl", "margin", "payout", "equity"].forEach(function (k) {
        if (p[k] != null) { D[k] = LN.num(p[k]); }
      });
      Object.keys(inputs).forEach(function (k) { inputs[k].value = D[k]; });
      recalc();
    }

    /* ---------- the figure: EFN across the growth rate ---------- */
    function draw() {
      svgBox.innerHTML = "";
      var W = 560, H = 210, L = 52, Rr = 14, T = 26, B = 34;
      var gMax = 30;
      var pts = [], vals = [];
      for (var g = 0; g <= gMax + 0.001; g += 2.5) {
        var v = efnAt(g / 100);
        pts.push([g, v]); vals.push(v);
      }
      vals.push(0);
      var vMin = Math.min.apply(null, vals), vMax = Math.max.apply(null, vals);
      if (vMax - vMin < 1e-9) { vMax = vMin + 1; }
      var pad = (vMax - vMin) * 0.08; vMin -= pad; vMax += pad;
      var X = function (g) { return L + (g / gMax) * (W - L - Rr); };
      var Y = function (v) { return T + (1 - (v - vMin) / (vMax - vMin)) * (H - T - B); };
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": txt("svgAlt", "External financing needed plotted against the planned growth rate; the line crosses zero at the internally fundable growth rate") });
      function lab(x, y, str, cls, anchor) {
        var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "start",
          class: cls, fill: "var(--chart-label)" });
        t.textContent = str;
        return t;
      }
      /* gridlines + x ticks every 5% */
      for (var gt = 0; gt <= gMax; gt += 5) {
        svg.appendChild(LN.s("line", { x1: X(gt), y1: T, x2: X(gt), y2: H - B,
          stroke: "var(--chart-grid)", "stroke-width": "1" }));
        svg.appendChild(lab(X(gt), H - B + 15, gt + "%", "el-tick", "middle"));
      }
      /* zero line */
      var y0 = Y(0);
      svg.appendChild(LN.s("line", { x1: L, y1: y0, x2: W - Rr, y2: y0,
        stroke: "var(--chart-axis)", "stroke-width": "1.3", "stroke-dasharray": "4 3" }));
      svg.appendChild(lab(L - 6, y0 + 4, "0", "el-tick", "end"));
      /* y-axis */
      svg.appendChild(LN.s("line", { x1: L, y1: T, x2: L, y2: H - B,
        stroke: "var(--chart-axis)", "stroke-width": "1.2" }));
      /* EFN polyline */
      var poly = "";
      pts.forEach(function (p) { poly += X(p[0]) + "," + Y(p[1]) + " "; });
      svg.appendChild(LN.s("polyline", { points: poly.trim(), fill: "none",
        stroke: "var(--chart-cost)", "stroke-width": "2.2" }));
      /* zero-crossing marker */
      var gz = selfFund();
      if (isFinite(gz) && gz >= 0 && gz <= 1) {
        svg.appendChild(LN.s("circle", { cx: X(gz * 100), cy: y0, r: 4.5,
          fill: "var(--chart-profit)" }));
        svg.appendChild(lab(X(gz * 100), y0 - 9,
          txt("selfMark", "self-funding") + " " + p2(gz), "el-tick", "middle"));
      }
      /* current marker */
      var gNow = Math.max(0, Math.min(gMax, D.growth));
      svg.appendChild(LN.s("circle", { cx: X(gNow), cy: Y(efn()), r: 5,
        fill: "var(--accent)" }));
      svg.appendChild(lab(L, 15, txt("figTitle", "External financing needed as the growth rate moves"),
        "el-axis", "start"));
      svg.appendChild(lab(W - Rr, H - 4, txt("figX", "planned growth"), "el-tick", "end"));
      svgBox.appendChild(svg);
    }

    /* ---------- readouts ---------- */
    function row(k, val, key) {
      return LN.h("div", {}, [
        LN.h("span", { class: key ? "k" : "", text: k }),
        LN.h("span", { text: val })
      ]);
    }
    function paintGrid() {
      grid.innerHTML = "";
      grid.appendChild(row(txt("kProj", "Projected sales"), m2(projSales())));
      grid.appendChild(row(txt("kDs", "Change in sales"), m2(dS())));
      grid.appendChild(row(txt("kAssets", "New assets required"), m2(reqAssets())));
      grid.appendChild(row(txt("kSpont", "Spontaneous financing"), m2(spont())));
      grid.appendChild(row(txt("kRet", "Addition to retained earnings"), m2(retained())));
      grid.appendChild(row(txt("kEfn", "External financing needed (EFN)"), m2(efn()), true));
      grid.appendChild(row(txt("kSelf", "Internally fundable growth"),
        isFinite(selfFund()) ? p2(selfFund()) : "\u2014"));
      grid.appendChild(row(txt("kRoe", "Return on equity"), p2(roe())));
      grid.appendChild(row(txt("kSgr", "Sustainable growth rate"),
        isFinite(sgr()) ? p2(sgr()) : "\u2014"));
    }

    function paintHead() {
      head.innerHTML = "";
      var e = efn();
      head.appendChild(LN.h("span", { class: "el-caption",
        text: txt("efnOut", "External financing needed") }));
      var big = LN.h("span", { class: "el-bigv", text: m2u(e) });
      big.style.color = (e > 0.0005) ? "var(--red)" : "var(--green)";
      head.appendChild(big);
      head.appendChild(LN.h("span", { class: "el-sub",
        text: (e > 0.0005) ? txt("subNeed", "a funding need the plan must raise from outside")
          : txt("subSurplus", "a surplus; the plan funds itself") }));
    }

    function paintRead() {
      read.innerHTML = "";
      var e = efn(), sf = selfFund(), sg = sgr(), r = roe();
      if (e > 0.0005) {
        read.appendChild(LN.h("div", { class: "fb no show",
          text: txt("needLine", "The plan needs") + " " + m2(e) + " "
            + txt("needWas", "of financing from outside. Growth above the internally fundable rate has to be funded deliberately.") }));
      } else {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("surLine", "The plan throws off a surplus of") + " " + m2(-e) + " "
            + txt("surWas", "because retained profit and automatic credit more than cover the new assets.") }));
      }
      if (isFinite(sf)) {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("selfLine", "With no new financing at all, the firm can grow about")
            + " " + p2(sf) + " " + txt("selfWas", "a year; every point above that must be paid for from outside.") }));
      }
      if (isFinite(sg)) {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("sgrLine", "Holding its capital structure and issuing no new equity, the firm can grow")
            + " " + p2(sg) + " " + txt("sgrWas", "a year — its sustainable growth rate. Long-term debt grows with the firm, so this sits above the internally fundable rate.") }));
      }
      if (isFinite(sg) && D.growth / 100 > sg + 0.0005) {
        read.appendChild(LN.h("div", { class: "fb no show",
          text: txt("aboveSgr", "The planned growth is above the sustainable rate, so the plan has to change a policy — margin, dividend, leverage, or new equity — to be financeable over the long run.") }));
      }
      if (isFinite(r) && r <= 0) {
        read.appendChild(LN.h("div", { class: "fb no show",
          text: txt("negRoe", "With no profit margin there is no return on equity and no internally generated funding at all.") }));
      }
    }

    function recalc() {
      outs.sales.textContent = m2(D.sales);
      outs.equity.textContent = m2(D.equity);
      outs.growth.textContent = D.growth.toFixed(1) + "%";
      outs.as.textContent = D.as + "%";
      outs.sl.textContent = D.sl + "%";
      outs.margin.textContent = D.margin.toFixed(1) + "%";
      outs.payout.textContent = D.payout + "%";
      paintHead();
      draw();
      paintRead();
      paintGrid();
    }

    recalc();
  }
};
