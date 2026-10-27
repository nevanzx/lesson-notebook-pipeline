/* wacc-lab - the weighted average cost of capital worksheet, live.

   The lesson's formulas:
     After-tax cost of debt = r_d x (1 - T)
     WACC = w_d r_d (1 - T) + w_p r_p + w_e r_e
     Cost of preferred     = D_p / P_p
     Cost of equity (CAPM) = r_f + beta (r_m - r_f)
     Cost of equity (DGM)  = D_1 / P_0 + g
   The lab assembles the WACC from the three component costs and their
   market-value weights, and lets the tax rate slide so the after-tax
   adjustment is visible.

   Data: LN.data.<key> = {
     copy:{...all wording},
     init:{wd, wp, we, rd, rp, re, t},
     ranges:{t:[min,max,step]},
     presets:[{label, wd, wp, we, rd, rp, re, t}]
   }
   Weights and rates are percent points in the data and fractions
   internally. Every default and preset number comes from the lesson's
   own worked example. All wording comes from data.js; this file carries
   no content strings. */
LN.components["wacc-lab"] = {
  init: function (root, d) {
    var C = d.copy || {};
    function txt(k, fb) { return (C[k] != null) ? C[k] : fb; }
    var R = d.ranges || {};
    function rng(k, fb) { return R[k] || fb; }

    var I = d.init || {};
    var base = {
      wd: LN.num(I.wd), wp: LN.num(I.wp), we: LN.num(I.we),
      rd: LN.num(I.rd), rp: LN.num(I.rp), re: LN.num(I.re),
      t: LN.num(I.t)
    };

    var D = {};
    Object.keys(base).forEach(function (k) { D[k] = base[k]; });

    function p2(v) {
      if (!isFinite(v)) { return "\u2014"; }
      var s = (v).toFixed(2) + "%";
      return (s.charAt(0) === "-" ? "\u2212" : "") + s.slice(s.charAt(0) === "-" ? 1 : 0);
    }
    function p1(v) {
      if (!isFinite(v)) { return "\u2014"; }
      var s = (v).toFixed(1) + "%";
      return (s.charAt(0) === "-" ? "\u2212" : "") + s.slice(s.charAt(0) === "-" ? 1 : 0);
    }

    /* ---------- the lesson's formulas, exactly as the lesson states them ---------- */
    function atd() { return (D.rd / 100) * (1 - D.t / 100); } /* after-tax cost of debt */
    function contribDebt() { return (D.wd / 100) * atd(); }
    function contribPref() { return (D.wp / 100) * (D.rp / 100); }
    function contribEq() { return (D.we / 100) * (D.re / 100); }
    function wacc() { return contribDebt() + contribPref() + contribEq(); }
    function wsum() { return D.wd + D.wp + D.we; }
    function waccAt(t) {
      return (D.wd / 100) * ((D.rd / 100) * (1 - t / 100))
        + (D.wp / 100) * (D.rp / 100) + (D.we / 100) * (D.re / 100);
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
    function pctCtl(key, label, step) {
      var out = LN.h("span", { class: "el-out", text: "" });
      var inp = LN.h("input", { type: "number", step: step || 0.5, value: D[key],
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

    pctCtl("wd", txt("wd", "Debt weight (w_d)"), 1);
    pctCtl("wp", txt("wp", "Preferred weight (w_p)"), 1);
    pctCtl("we", txt("we", "Equity weight (w_e)"), 1);
    pctCtl("rd", txt("rd", "Pre-tax cost of debt (r_d)"), 0.1);
    pctCtl("rp", txt("rp", "Cost of preferred stock (r_p)"), 0.1);
    pctCtl("re", txt("re", "Cost of common equity (r_e)"), 0.1);
    rateCtl("t", txt("t", "Marginal tax rate (T)"), [0, 60, 0.5]);

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
      ["wd", "wp", "we", "rd", "rp", "re", "t"].forEach(function (k) {
        if (p[k] != null) { D[k] = LN.num(p[k]); }
      });
      Object.keys(inputs).forEach(function (k) { inputs[k].value = D[k]; });
      recalc();
    }

    /* ---------- the stacked bar: each source's contribution to WACC ---------- */
    function draw() {
      svgBox.innerHTML = "";
      var W = 560, H = 128, L = 6, Rr = 6, T = 34, BAR = 30, bw = W - L - Rr;
      var cd = contribDebt(), cp = contribPref(), ce = contribEq();
      var total = cd + cp + ce;
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": txt("svgAlt", "Each capital source's contribution to the weighted average cost of capital") });
      function lab(x, y, str, cls, anchor) {
        var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "start",
          class: cls, fill: "var(--chart-label)" });
        t.textContent = str;
        return t;
      }
      svg.appendChild(lab(L, 16, txt("barTitle", "How each source adds to the WACC"), "el-axis", "start"));
      svg.appendChild(LN.s("line", { x1: L, y1: T, x2: L, y2: T + BAR + 4,
        stroke: "var(--chart-axis)", "stroke-width": "1.2" }));
      if (total > 0) {
        var segs = [
          [cd, "var(--chart-rev)", "var(--chart-rev)"],
          [cp, "var(--chart-cost)", "var(--chart-cost)"],
          [ce, "var(--chart-profit)", "var(--chart-profit)"]
        ];
        var x = L;
        segs.forEach(function (s) {
          var w = (Math.abs(s[0]) / total) * bw;
          svg.appendChild(LN.s("rect", { x: x, y: T, width: Math.max(0, w), height: BAR,
            fill: s[1], "fill-opacity": "0.9" }));
          if (w > 34) {
            svg.appendChild(lab(x + 4, T + 20, p2(s[0] * 100), "el-tick", "start"));
          }
          x += w;
        });
      }
      var rows = [
        [txt("legDebt", "Debt"), cd, "var(--chart-rev)"],
        [txt("legPref", "Preferred"), cp, "var(--chart-cost)"],
        [txt("legEq", "Equity"), ce, "var(--chart-profit)"]
      ];
      rows.forEach(function (r, i) {
        var yy = T + BAR + 22 + i * 15;
        svg.appendChild(LN.s("rect", { x: L, y: yy - 9, width: 11, height: 11,
          fill: r[2], "fill-opacity": "0.9" }));
        svg.appendChild(lab(L + 17, yy, r[0] + " " + p2(r[1] * 100), "el-tick", "start"));
      });
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
      var sum = wsum();
      grid.appendChild(row(txt("kAtd", "After-tax cost of debt"), p2(atd() * 100)));
      grid.appendChild(row(txt("kWd", "Weighted debt contribution"), p2(contribDebt() * 100)));
      grid.appendChild(row(txt("kWp", "Weighted preferred contribution"), p2(contribPref() * 100)));
      grid.appendChild(row(txt("kWe", "Weighted equity contribution"), p2(contribEq() * 100)));
      grid.appendChild(row(txt("kWacc", "WACC"), p2(wacc() * 100), true));
      grid.appendChild(row(txt("kSum", "Weights total"), p1(sum)));
      grid.appendChild(row(txt("kLow", "WACC if T falls 5 points"), p2(waccAt(Math.max(0, D.t - 5)) * 100)));
      grid.appendChild(row(txt("kHigh", "WACC if T rises 5 points"), p2(waccAt(Math.min(100, D.t + 5)) * 100)));
    }

    function paintHead() {
      head.innerHTML = "";
      head.appendChild(LN.h("span", { class: "el-caption", text: txt("waccOut", "Weighted average cost of capital") }));
      head.appendChild(LN.h("span", { class: "el-bigv", text: p2(wacc() * 100) }));
    }

    function paintRead() {
      read.innerHTML = "";
      var cd = contribDebt(), cp = contribPref(), ce = contribEq(), sum = wsum();
      if (Math.abs(sum - 100) > 0.05) {
        read.appendChild(LN.h("div", { class: "fb no show",
          text: txt("sumLine", "The three weights total") + " " + p1(sum)
            + ". " + txt("sumFix", "They should sum to 100% — adjust the weights so each source's share of total market value is right.") }));
      }
      var parts = [
        [cd, txt("nameDebt", "debt")],
        [cp, txt("namePref", "preferred stock")],
        [ce, txt("nameEq", "common equity")]
      ];
      var top = parts[0];
      parts.forEach(function (p) { if (p[0] > top[0]) { top = p; } });
      var eqBiggestWeight = D.we >= D.wd && D.we >= D.wp;
      var eqDearest = (D.re / 100) >= atd() && (D.re / 100) >= (D.rp / 100);
      if (ce >= cd && ce >= cp && eqBiggestWeight && eqDearest) {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("eqLine", "Common equity carries the largest share of the WACC here, because it is both the biggest weight and the most expensive source after tax.") }));
      } else {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("topLine", "The largest single contribution comes from") + " "
            + top[1] + " (" + p2(top[0] * 100) + ")." }));
      }
      if (D.rd > 0 && atd() < (D.rp / 100) && D.rp > 0) {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("atdLine", "After tax, debt costs") + " " + p2(atd() * 100)
            + ", " + txt("atdNote", "below the preferred and equity costs, because the interest deduction cuts the effective cost of borrowing.") }));
      }
    }

    function recalc() {
      outs.rd.textContent = p1(D.rd);
      outs.rp.textContent = p1(D.rp);
      outs.re.textContent = p1(D.re);
      outs.t.textContent = p1(D.t);
      outs.wd.textContent = p1(D.wd);
      outs.wp.textContent = p1(D.wp);
      outs.we.textContent = p1(D.we);
      paintHead();
      draw();
      paintRead();
      paintGrid();
    }

    recalc();
  }
};
