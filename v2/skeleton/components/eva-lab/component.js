/* eva-lab - the EVA / MVA worksheet, live.

   The lesson's formulas:
     NOPAT          = EBIT x (1 - tax rate)
     Invested cap.  = total debt (book) + total equity (book)
     Capital charge = WACC x invested capital
     EVA            = NOPAT - capital charge
     ROIC           = NOPAT / invested capital
     MVA            = market value of equity + market value of debt - invested capital
     implied g      = WACC - EVA / MVA
     Value          = NOPAT x (1 - g / ROIC) / (WACC - g)

   Data: LN.data.<key> = {
     money, copy:{...all wording},
     init:{ebit, tax, capital, wacc, mve, mvd, g},
     ranges:{tax:[..], wacc:[..], g:[..]},
     presets:[{label, ebit, tax, capital, wacc, mve, mvd, g, note}]
   }
   Every default and every preset number comes from the lesson's own worked
   example. All wording comes from data.js; this file carries no content
   strings. */
LN.components["eva-lab"] = {
  init: function (root, d) {
    var money = d.money || "P";
    var C = d.copy || {};
    function txt(k, fb) { return (C[k] != null) ? C[k] : fb; }
    var R = d.ranges || {};
    function rng(k, fb) { return R[k] || fb; }

    var I = d.init || {};
    var base = {
      ebit: LN.num(I.ebit) || 0,
      tax: (LN.num(I.tax) || 0) / 100,
      capital: LN.num(I.capital) || 0,
      wacc: (LN.num(I.wacc) || 0) / 100,
      mve: LN.num(I.mve) || 0,
      mvd: LN.num(I.mvd) || 0,
      g: (LN.num(I.g) || 0) / 100
    };
    var D = {};
    Object.keys(base).forEach(function (k) { D[k] = base[k]; });

    function f2(v) {
      if (!isFinite(v)) { return "\u2014"; }
      var s = String(Math.round(v));
      var neg = s.charAt(0) === "-";
      if (neg) { s = s.slice(1); }
      s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (neg ? "\u2212" : "") + s;
    }
    function m2(v) { return money + f2(v); }
    function p1(v) {
      if (Math.abs(v) < 0.00005) { return "0.0%"; }
      var s = (v * 100).toFixed(1) + "%";
      return (s.charAt(0) === "-" ? "\u2212" : "") + s.slice(s.charAt(0) === "-" ? 1 : 0);
    }

    /* ---------- the lesson's formulas, exactly as the lesson states them ---------- */
    function nopat() { return D.ebit * (1 - D.tax); }
    function charge() { return D.wacc * D.capital; }
    function eva() { return nopat() - charge(); }
    function roic() { return (D.capital !== 0) ? nopat() / D.capital : NaN; }
    function mvf() { return D.mve + D.mvd; }
    function mva() { return mvf() - D.capital; }
    function impliedG() { return (mva() !== 0) ? D.wacc - (eva() / mva()) : NaN; }
    function valueAt(g) {
      var r = roic();
      if (!isFinite(r) || r === 0) { return NaN; }
      var den = D.wacc - g;
      if (den === 0) { return NaN; }
      return nopat() * (1 - (g / r)) / den;
    }
    function reinvest(g) {
      var r = roic();
      return isFinite(r) && r !== 0 ? (g / r) : NaN;
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
    function moneyCtl(key, label, fallback, step) {
      var out = LN.h("span", { class: "el-out", text: "" });
      var inp = LN.h("input", { type: "number", step: step || 1000000, value: D[key],
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
    function rateCtl(key, label, fallback, dflt) {
      var r = rng(key, dflt);
      var out = LN.h("span", { class: "el-out", text: "" });
      var inp = LN.h("input", { type: "range", min: r[0], max: r[1], step: r[2],
        value: D[key] * 100, "aria-label": label });
      inp.addEventListener("input", function () {
        D[key] = parseFloat(inp.value) / 100;
        recalc();
      });
      inputs[key] = inp; outs[key] = out;
      left.appendChild(LN.h("div", { class: "el-ctl" }, [
        LN.h("label", { class: "el-lab", text: label }),
        LN.h("div", { class: "el-inrow" }, [inp]), out]));
    }
    moneyCtl("ebit", txt("ebit", "Operating profit (EBIT)"), null);
    rateCtl("tax", txt("tax", "Effective tax rate"), null, [0, 50, 0.5]);
    moneyCtl("capital", txt("capital", "Invested capital (book debt + book equity)"), null);
    rateCtl("wacc", txt("wacc", "Cost of capital (WACC)"), null, [4, 20, 0.25]);
    moneyCtl("mve", txt("mve", "Market value of equity"), null);
    moneyCtl("mvd", txt("mvd", "Market value of debt"), null);
    rateCtl("g", txt("g", "Assumed growth in EVA (g)"), null, [-10, 20, 0.5]);

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
      ["ebit", "capital", "mve", "mvd"].forEach(function (k) {
        if (p[k] != null) { D[k] = LN.num(p[k]); }
      });
      ["tax", "wacc", "g"].forEach(function (k) {
        if (p[k] != null) { D[k] = LN.num(p[k]) / 100; }
      });
      Object.keys(inputs).forEach(function (k) {
        if (["tax", "wacc", "g"].indexOf(k) >= 0) { inputs[k].value = (D[k] * 100); }
        else { inputs[k].value = D[k]; }
      });
      recalc();
    }

    /* ---------- the two bars: after-tax operating profit against the capital charge ---------- */
    function draw() {
      svgBox.innerHTML = "";
      var W = 560, H = 132, L = 8, R = 8, T = 30, BAR = 30, GAP = 16;
      var bw = W - L - R;
      var n1 = nopat(), c1 = charge();
      var top = Math.max(Math.abs(n1), Math.abs(c1), 1);
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": txt("svgAlt", "After-tax operating profit compared with the charge for the capital it uses") });
      function lab(x, y, str, cls, anchor) {
        var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "start", class: cls,
          fill: "var(--chart-label)" });
        t.textContent = str;
        return t;
      }
      svg.appendChild(lab(L, 16, txt("barTitle", "What the operations earned against what the capital cost"),
        "el-axis", "start"));
      var rows = [
        [txt("barNopat", "NOPAT (after tax)"), n1, "var(--chart-profit)", 0],
        [txt("barCharge", "Capital charge"), c1, "var(--chart-cost)", T + BAR + GAP]
      ];
      rows.forEach(function (r) {
        var w = (Math.abs(r[1]) / top) * bw;
        svg.appendChild(LN.s("rect", { x: L, y: r[3], width: Math.max(1, w), height: BAR,
          fill: r[2], "fill-opacity": "0.9" }));
        svg.appendChild(lab(L + 4, r[3] + 20, r[0], "el-tick", "start"));
        var v = LN.s("text", { x: Math.min(W - R, L + Math.max(1, w) + 6), y: r[3] + 20,
          class: "el-tick", fill: "var(--chart-label)" });
        v.textContent = m2(r[1]);
        svg.appendChild(v);
      });
      svg.appendChild(LN.s("line", { x1: L, y1: T - 4, x2: L, y2: T + BAR + GAP + BAR + 4,
        stroke: "var(--chart-axis)", "stroke-width": "1.2" }));
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
      var e = eva(), m = mva(), ig = impliedG(), v = valueAt(D.g), rr = reinvest(D.g);
      grid.appendChild(row(txt("kNopat", "NOPAT"), m2(nopat())));
      grid.appendChild(row(txt("kCapital", "Invested capital"), m2(D.capital)));
      grid.appendChild(row(txt("kCharge", "Capital charge"), m2(charge())));
      grid.appendChild(row(txt("kEva", "EVA"), m2(e), true));
      grid.appendChild(row(txt("kRoic", "Return on invested capital"), p1(roic())));
      grid.appendChild(row(txt("kBreak", "Break-even cost of capital"), p1(roic())));
      grid.appendChild(row(txt("kMvf", "Market value of the firm"), m2(mvf())));
      grid.appendChild(row(txt("kMva", "MVA"), m2(m), true));
      grid.appendChild(row(txt("kImplied", "Growth in EVA the market implies"), p1(ig)));
      grid.appendChild(row(txt("kValue", "Value at your assumed g"), m2(v)));
      grid.appendChild(row(txt("kReinv", "Reinvestment rate (g / ROIC)"),
        isFinite(rr) ? (rr * 100).toFixed(1) + "%" : "\u2014"));
    }

    function paintHead() {
      head.innerHTML = "";
      var e = eva();
      head.appendChild(LN.h("span", { class: "el-caption", text: txt("evaOut", "Economic value added") }));
      var big = LN.h("span", { class: "el-bigv", text: m2(e) });
      big.style.color = (e > 0.0005) ? "var(--green)" : ((e < -0.0005) ? "var(--red)" : "var(--ink)");
      head.appendChild(big);
    }

    function paintRead() {
      read.innerHTML = "";
      var e = eva(), m = mva(), ig = impliedG(), v = valueAt(D.g), rr = reinvest(D.g);
      var r = roic();
      if (isFinite(r) && Math.abs(D.wacc - r) < 0.0000005) {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("atBreak", "The cost of capital equals the return on capital, so EVA is exactly zero: the operations earned precisely what the capital cost and nothing more.") }));
      } else if (e > 0.0005) {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("posLine", "The operations earned") + " " + m2(e) + " "
            + txt("posWas", "more than") + " " + m2(charge()) + " "
            + txt("posCharge", "of capital charge — value was created this year.") }));
      } else if (e < -0.0005) {
        read.appendChild(LN.h("div", { class: "fb no show",
          text: txt("negLine", "The capital charge of") + " " + m2(charge()) + " "
            + txt("negWas", "exceeded the after-tax operating profit of")
            + " " + m2(nopat()) + " — value was destroyed this year." }));
      }
      if (isFinite(rr) && rr > 1) {
        read.appendChild(LN.h("div", { class: "fb no show",
          text: txt("reinvLine", "At the growth rate the market implies, the firm must reinvest")
            + " " + (rr * 100).toFixed(0) + "% "
            + txt("reinvOf", "of its after-tax operating profit just to stand still. Assumptions that extreme do not hold for long.") }));
      }
      if (isFinite(ig) && isFinite(v) && m > 0) {
        var gap = v - mvf();
        if (Math.abs(gap) < Math.max(1, Math.abs(mvf()) * 0.0005)) {
          read.appendChild(LN.h("div", { class: "fb info show",
            text: txt("matchLine", "Your assumed growth rate reproduces the market's valuation of the firm exactly — the value formula and the MVA calculation are telling the same story.") }));
        } else {
          read.appendChild(LN.h("div", { class: "fb info show",
            text: txt("mismatchLine", "At your assumed growth rate the firm is worth")
              + " " + m2(v) + ", against a market value of" + " " + m2(mvf())
              + ". The market's own valuation implies growth in EVA of" + " " + p1(ig) + "." }));
        }
      }
      if (m > 0 && e > 0.0005) {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("flowStock", "EVA is this year's flow") + " " + m2(e)
            + "; MVA is the stock the market has credited to the firm since it began, "
            + m2(m) + ". The two answer different questions, so read both." }));
      }
    }

    function recalc() {
      ["ebit", "capital", "mve", "mvd"].forEach(function (k) {
        outs[k].textContent = m2(D[k]);
      });
      ["tax", "wacc", "g"].forEach(function (k) { outs[k].textContent = p1(D[k]); });
      paintHead();
      draw();
      paintRead();
      paintGrid();
    }

    recalc();
  }
};
