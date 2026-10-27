/* npv-lab — the capital budgeting centrepiece (Section 3 of the payback /
   NPV / IRR lesson). A per-year incremental cash-flow schedule with sliders
   for the initial outlay, the discount rate, and each year's inflow; live
   Payback, discounted-payback, NPV, and IRR readouts; a drawn NPV profile
   whose x-axis crossing is the IRR; and an NPV-at-alternative-rates table.
   Registers into LN.components, renders from LN.data[key]; all wording lives
   in the data copy object; token colours only. */
LN.components["npv-lab"] = {
  init: function (root, d) {
    d = d || {};
    var money = d.money || "\u20b1";
    var CP = d.copy || {};
    var RG = d.ranges || {};
    function rg(k, def) { return (RG[k] && RG[k].length === 3) ? RG[k] : def; }
    var RO = rg("outlay", [50000, 250000, 5000]);
    var RR = rg("rate", [0, 30, 0.5]);
    var RF = rg("flow", [0, 80000, 1000]);

    var init = d.init || {};
    var S = {
      outlay: (init.outlay != null) ? init.outlay : 100000,
      rate: (init.rate != null) ? init.rate : 10,
      flows: (init.flows ? init.flows.slice(0) : [30000, 30000, 30000, 30000, 30000])
    };

    function moneyFmt(v) {
      if (v == null || !isFinite(v)) return "\u2014";
      var sign = v < 0 ? "-" : "";
      var a = Math.abs(v);
      if (a >= 1000) return sign + money + LN.fmt(Math.round(a));
      var x = Math.round(a * 100) / 100;
      return sign + money + (Math.abs(x % 1) > 0 ? x.toFixed(2) : String(x));
    }
    function pctFmt(v) {
      if (v == null || !isFinite(v)) return "\u2014";
      return (Math.round(v * 100) / 100).toFixed(2) + "%";
    }
    function fill(t, map) {
      return String(t == null ? "" : t).replace(/\{(\w+)\}/g, function (_, k) {
        return (k in map) ? map[k] : "";
      });
    }

    /* ---- maths ---- */
    function npv(rp) {
      var s = -S.outlay;
      for (var t = 0; t < S.flows.length; t++) s += S.flows[t] / Math.pow(1 + rp, t + 1);
      return s;
    }
    function irr() {
      var lo = -0.9999, hi = 10, i, mid;
      if (npv(0) <= 0) return NaN;
      for (i = 0; i < 200; i++) {
        mid = (lo + hi) / 2;
        if (npv(mid) > 0) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    function payback(discounted, rp) {
      var cum = 0, t, f;
      for (t = 0; t < S.flows.length; t++) {
        f = discounted ? S.flows[t] / Math.pow(1 + rp, t + 1) : S.flows[t];
        if (f > 0 && cum + f >= S.outlay) return t + (S.outlay - cum) / f;
        cum += f;
      }
      return NaN;
    }

    /* ---- DOM ---- */
    var wrap = LN.h("div", { class: "nl" });
    var grid = LN.h("div", { class: "nl-grid" });
    var left = LN.h("div", { class: "nl-left" });
    var right = LN.h("div", { class: "nl-right" });
    grid.appendChild(left); grid.appendChild(right); wrap.appendChild(grid);
    root.appendChild(wrap);

    function ctl(key, labelF, fmtF) {
      var lab = LN.h("span", { text: "" });
      var out = LN.h("span", { class: "nl-val" });
      var inp = LN.h("input", { type: "range" });
      var row = LN.h("div", { class: "nl-ctl" }, [
        LN.h("div", { class: "nl-line" }, [lab, out]), inp
      ]);
      inp.addEventListener("input", function () {
        if (key === "outlay") S.outlay = parseFloat(inp.value);
        else if (key === "rate") S.rate = parseFloat(inp.value);
        else S.flows[parseInt(key.slice(1), 10)] = parseFloat(inp.value);
        recalc();
      });
      left.appendChild(row);
      return { inp: inp, out: out, lab: lab, labelF: labelF, fmtF: fmtF, row: row };
    }

    var cOut = ctl("outlay", function () { return CP.outlayLabel || "Initial outlay (CF0)"; },
      function () { return moneyFmt(S.outlay); });
    var cRate = ctl("rate", function () { return CP.rateLabel || "Discount rate r"; },
      function () { return S.rate + "%"; });
    var cFlow = [];

    function addFlowCtl(t) {
      cFlow[t] = ctl("f" + t, function () { return (CP.flowLabel || "Year {n} inflow").replace("{n}", t + 1); },
        function () { return moneyFmt(S.flows[t]); });
    }
    function rebuildFlows() {
      cFlow.forEach(function (c) { if (c && c.row.parentNode) c.row.parentNode.removeChild(c.row); });
      cFlow = [];
      for (var t = 0; t < S.flows.length; t++) addFlowCtl(t);
    }
    for (var _t = 0; _t < S.flows.length; _t++) addFlowCtl(_t);

    var presetBox = LN.h("div", { class: "nl-presets" });
    (d.presets || []).forEach(function (p) {
      presetBox.appendChild(LN.h("button", {
        type: "button", class: "chip", text: p.label,
        onclick: function () {
          if (p.outlay != null) S.outlay = p.outlay;
          if (p.rate != null) S.rate = p.rate;
          if (p.flows) S.flows = p.flows.slice(0);
          rebuildFlows(); recalc();
        }
      }));
    });
    if (presetBox.children.length) {
      left.appendChild(LN.h("div", { class: "nl-ctl" }, [
        LN.h("div", { class: "nl-line" }, [LN.h("span", { text: CP.presetsLabel || "Lesson presets" })]),
        presetBox
      ]));
    }

    var svgBox = LN.h("div", { class: "nl-svgbox" });
    var strip = LN.h("div", { class: "data-strip" });
    var read = LN.h("div", { class: "nl-read" });
    var sens = LN.h("div", { class: "nl-sens" });
    right.appendChild(svgBox); right.appendChild(strip);
    right.appendChild(read); right.appendChild(sens);

    function profileSVG(rateIRR) {
      var VW = 520, VH = 240, L = 56, R = 16, T = 18, B = 46, i;
      var minR = 0, maxR = Math.max(30, isFinite(rateIRR) ? rateIRR * 100 + 8 : 30);
      var rates = [], vals = [];
      for (i = 0; i <= 60; i++) {
        var rp = (minR + (maxR - minR) * i / 60) / 100;
        rates.push(rp); vals.push(npv(rp));
      }
      var vmax = Math.max.apply(null, vals), vmin = Math.min.apply(null, vals);
      vmax = Math.max(vmax, 0); vmin = Math.min(vmin, 0);
      if (vmax === vmin) vmax = vmin + 1;
      var pad = (vmax - vmin) * 0.08; vmax += pad; vmin -= pad;
      function X(rp) { return L + (rp * 100 - minR) / (maxR - minR) * (VW - L - R); }
      function Y(v) { return T + (vmax - v) / (vmax - vmin) * (VH - T - B); }
      var svg = LN.s("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 " + VW + " " + VH,
        role: "img", "aria-label": "NPV profile: net present value against the discount rate, crossing zero at the internal rate of return." });
      svg.setAttribute("class", "nl-svg");
      for (i = 0; i <= 4; i++) {
        var yv = vmin + (vmax - vmin) * i / 4, yy = Y(yv);
        svg.appendChild(LN.s("line", { x1: L, y1: yy, x2: VW - R, y2: yy,
          stroke: "var(--chart-grid)", "stroke-width": "1" }));
        var t1 = LN.s("text", { x: L - 8, y: yy + 4, "text-anchor": "end",
          fill: "var(--chart-label)", "font-size": "10" });
        t1.textContent = LN.fmt(Math.round(yv)); svg.appendChild(t1);
      }
      var y0 = Y(0);
      svg.appendChild(LN.s("line", { x1: L, y1: y0, x2: VW - R, y2: y0,
        stroke: "var(--chart-axis)", "stroke-width": "1.5" }));
      svg.appendChild(LN.s("line", { x1: L, y1: T, x2: L, y2: VH - B,
        stroke: "var(--chart-axis)", "stroke-width": "1.5" }));
      for (i = 0; i <= 6; i++) {
        var rv = minR + (maxR - minR) * i / 6, xx = X(rv / 100);
        var tx = LN.s("text", { x: xx, y: VH - B + 16, "text-anchor": "middle",
          fill: "var(--chart-label)", "font-size": "10" });
        tx.textContent = Math.round(rv) + "%"; svg.appendChild(tx);
      }
      var xt = LN.s("text", { x: VW / 2, y: VH - 6, "text-anchor": "middle",
        fill: "var(--chart-label)", "font-size": "11" });
      xt.textContent = CP.xLabel || "Discount rate"; svg.appendChild(xt);
      var yt = LN.s("text", { x: 14, y: T + 2, fill: "var(--chart-label)", "font-size": "11" });
      yt.textContent = CP.yLabel || "NPV"; svg.appendChild(yt);
      var dd = "";
      for (i = 0; i < rates.length; i++) dd += (i ? " L " : "M ") + X(rates[i]).toFixed(1) + " " + Y(vals[i]).toFixed(1);
      svg.appendChild(LN.s("path", { d: dd, fill: "none", stroke: "var(--chart-rev)", "stroke-width": "2.5" }));
      if (isFinite(rateIRR)) {
        var xr = X(rateIRR);
        svg.appendChild(LN.s("line", { x1: xr, y1: T, x2: xr, y2: y0,
          stroke: "var(--accent-2)", "stroke-width": "1.2", "stroke-dasharray": "4 3" }));
        svg.appendChild(LN.s("circle", { cx: xr, cy: y0, r: "4.5", fill: "var(--accent-2)" }));
        var lt = LN.s("text", { x: xr, y: T - 4, "text-anchor": "middle",
          fill: "var(--accent-2)", "font-size": "11", "font-weight": "bold" });
        lt.textContent = "IRR " + pctFmt(rateIRR * 100); svg.appendChild(lt);
        var xnow = X(S.rate / 100);
        var pt = LN.s("text", { x: xnow + (S.rate / 100 < rateIRR ? 6 : -6), y: Y(npv(S.rate / 100)) - 6,
          "text-anchor": S.rate / 100 < rateIRR ? "start" : "end",
          fill: "var(--chart-profit)", "font-size": "10", "font-weight": "bold" });
        pt.textContent = "r = " + S.rate + "%"; svg.appendChild(pt);
      }
      return svg;
    }

    function maxRatePct() {
      var irrV = irr();
      return Math.max(20, isFinite(irrV) ? Math.ceil(irrV * 100 / 5) * 5 + 5 : 25);
    }

    function recalc() {
      cOut.inp.min = RO[0]; cOut.inp.max = RO[1]; cOut.inp.step = RO[2]; cOut.inp.value = S.outlay;
      cOut.out.textContent = cOut.fmtF(); cOut.lab.textContent = cOut.labelF();
      cRate.inp.min = RR[0]; cRate.inp.max = RR[1]; cRate.inp.step = RR[2]; cRate.inp.value = S.rate;
      cRate.out.textContent = cRate.fmtF(); cRate.lab.textContent = cRate.labelF();
      cFlow.forEach(function (c, t) {
        c.inp.min = RF[0]; c.inp.max = RF[1]; c.inp.step = RF[2]; c.inp.value = S.flows[t];
        c.out.textContent = c.fmtF(); c.lab.textContent = c.labelF();
      });

      var rp = S.rate / 100;
      var npvV = npv(rp), irrV = irr();
      var pb = payback(false, rp), dpb = payback(true, rp);

      strip.innerHTML = "";
      strip.appendChild(LN.h("span", { class: "pill", text: (CP.paybackLabel || "Payback") + " " + (isFinite(pb) ? pb.toFixed(2) + " yr" : "\u2014") }));
      strip.appendChild(LN.h("span", { class: "pill", text: (CP.dpaybackLabel || "Discounted payback") + " " + (isFinite(dpb) ? dpb.toFixed(2) + " yr" : "\u2014") }));
      strip.appendChild(LN.h("span", { class: "pill", text: "NPV " + moneyFmt(npvV) }));
      strip.appendChild(LN.h("span", { class: "pill", text: "IRR " + (isFinite(irrV) ? pctFmt(irrV * 100) : "\u2014") }));

      svgBox.innerHTML = "";
      svgBox.appendChild(profileSVG(irrV));

      read.innerHTML = "";
      read.appendChild(LN.h("p", { text: fill(CP.readout || "", {
        outlay: moneyFmt(S.outlay), rate: S.rate + "%", npv: moneyFmt(npvV),
        irr: isFinite(irrV) ? pctFmt(irrV * 100) : "\u2014",
        payback: isFinite(pb) ? pb.toFixed(2) : "\u2014",
        verdict: npvV > 0 ? (CP.accept || "accepted") : (npvV < 0 ? (CP.reject || "rejected") : (CP.indifferent || "indifferent"))
      }) }));

      var stepR = (maxRatePct() <= 20) ? 5 : Math.ceil(maxRatePct() / 5 / 5) * 5;
      var rows = [], rr2;
      for (rr2 = 0; rr2 <= maxRatePct() + 0.001; rr2 += stepR) rows.push(rr2);
      var html = "<table><thead><tr><th>" + (CP.sensHead || "Discount rate") + "<\/th><th>NPV<\/th><\/tr><\/thead><tbody>";
      rows.forEach(function (rrp) {
        var v = npv(rrp / 100);
        html += "<tr><td>" + rrp + "%<\/td><td class=\"" + (v < 0 ? "nl-neg" : "nl-pos") + "\">" + moneyFmt(v) + "<\/td><\/tr>";
      });
      html += "<\/tbody><\/table>";
      sens.innerHTML = "<div class=\"nl-sched\">" + html + "<\/div>";
    }

    recalc();
  }
};
