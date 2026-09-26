/* bond-lab — library centrepiece for a bond-valuation lesson: a live
   coupon-bond pricer with a reverse YTM solver, annual or semi-annual
   frequency, the price-yield curve, and a +/- bps repricing table.
   Registers into LN.components, renders from LN.data[key]; all wording
   lives in the data copy object; token colours only. */
LN.components["bond-lab"] = {
  init: function (root, d) {
    var money = d.money || "$";
    var C = d.copy;
    var RG = d.ranges;
    var S = {
      mode: d.init.mode || "price",
      amt: d.init.amt, cr: d.init.cr, y: d.init.y, n: d.init.n,
      freq: d.init.freq || 1,
      p: d.init.p != null ? d.init.p : d.init.amt
    };
    var FREQ = S.freq;

    function money2(v) {
      if (!isFinite(v)) return "\u2014";
      var neg = v < 0; v = Math.abs(v);
      var s = v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (neg ? "\u2212" : "") + money + s;
    }
    function pc(v) { return (Math.round(v * 100) / 100) + "%"; }
    function periodWord() { return FREQ === 1 ? C.periodOne : C.periodHalf; }
    function coupon() { return S.amt * S.cr / 100 / FREQ; }
    function periods() { return Math.round(S.n * FREQ); }

    function priceAt(y) {
      var N = periods(), i = y / 100 / FREQ, cp = coupon();
      if (i <= 1e-9) return cp * N + S.amt;
      var disc = Math.pow(1 + i, -N);
      return cp * (1 - disc) / i + S.amt * disc;
    }
    function solveY() {
      var lo = 0.0001, hi = 200, mid, k;
      for (k = 0; k < 90; k++) {
        mid = (lo + hi) / 2;
        if (priceAt(mid) > S.p) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    function classify(price) {
      var diff = (price - S.amt) / S.amt;
      if (Math.abs(diff) < 0.0005) return "par";
      return diff > 0 ? "premium" : "discount";
    }
    function clsWord(c) {
      return c === "premium" ? C.clsPremium : c === "discount" ? C.clsDiscount : C.clsPar;
    }
    function relation(cr, y) {
      if (Math.abs(cr - y) < 0.005) return C.relEqual;
      return cr > y ? C.relAbove : C.relBelow;
    }
    function fill(t, map) {
      return t.replace(/\{(\w+)\}/g, function (_, k) { return (k in map) ? map[k] : ""; });
    }
    function niceMax(v) {
      if (v <= 0) return 10;
      var e = Math.pow(10, Math.floor(Math.log10(v))), n = v / e;
      var step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3
        : n <= 4 ? 4 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10;
      return step * e;
    }

    /* ---------- shell ---------- */
    var wrap = LN.h("div", { class: "ln-comp bond-lab" });
    var left = LN.h("div", { class: "bl-left" });
    var right = LN.h("div", { class: "bl-right" });
    wrap.appendChild(LN.h("div", { class: "bl-grid" }, [left, right]));

    var btns = {};
    var modeRow = LN.h("div", { class: "bl-modes" });
    ["price", "ytm"].forEach(function (mk, ix) {
      btns[mk] = LN.h("button", { type: "button", class: "bl-mode", text: C.modes[ix],
        onclick: function () { setMode(mk); } });
      modeRow.appendChild(btns[mk]);
    });
    left.appendChild(modeRow);

    var ctrls = {};
    function ctl(key, labelF, fmtF) {
      var lab = LN.h("label", {});
      var out = LN.h("span", { class: "bl-val" });
      var inp = LN.h("input", { type: "range", "aria-label": "value" });
      var row = LN.h("div", { class: "bl-ctl" },
        [LN.h("div", { class: "bl-line" }, [lab, out]), inp]);
      inp.addEventListener("input", function () { S[key] = parseFloat(inp.value); recalc(); });
      ctrls[key] = { inp: inp, out: out, lab: lab, row: row, labelF: labelF, fmtF: fmtF };
      left.appendChild(row);
    }
    ctl("amt", function () { return C.faceLabel; }, function () { return money2(S.amt); });
    ctl("cr", function () { return C.crLabel; }, function () { return pc(S.cr); });
    ctl("y", function () { return C.yLabel; }, function () { return pc(S.y); });
    ctl("p", function () { return C.priceLabel; }, function () { return money2(S.p); });
    ctl("n", function () { return C.nLabel; },
      function () { return S.n + " " + (S.n === 1 ? C.yrOne : C.yrMany); });

    var fbtns = {};
    var fRow = LN.h("div", { class: "bl-freqrow" }, [LN.h("span", { class: "bl-flabel", text: C.freqLabel })]);
    [1, 2].forEach(function (f, ix) {
      fbtns[f] = LN.h("button", { type: "button", class: "bl-freq",
        text: ix === 0 ? C.freqAnnual : C.freqSemi,
        onclick: function () { S.freq = f; recalc(); } });
      fRow.appendChild(fbtns[f]);
    });
    left.appendChild(fRow);

    var presetBox = LN.h("div", { class: "bl-presets" });
    (d.presets || []).forEach(function (p) {
      presetBox.appendChild(LN.h("button", { type: "button", class: "chip", text: p.label,
        onclick: function () {
          if (p.amt != null) S.amt = p.amt;
          if (p.cr != null) S.cr = p.cr;
          if (p.y != null) S.y = p.y;
          if (p.n != null) S.n = p.n;
          if (p.freq != null) S.freq = p.freq;
          if (p.p != null) S.p = p.p;
          setMode(p.mode || "price");
        }}));
    });
    left.appendChild(LN.h("div", { class: "bl-ctl" }, [
      LN.h("div", { class: "bl-line" }, [LN.h("label", { text: C.presetsLabel })]), presetBox
    ]));

    var svgBox = LN.h("div", { class: "bl-svg" });
    var strip = LN.h("div", { class: "data-strip bl-strip" });
    var read = LN.h("div", { class: "bl-read" });
    var sens = LN.h("div", { class: "bl-sens" });
    right.appendChild(svgBox); right.appendChild(strip); right.appendChild(read); right.appendChild(sens);

    /* ---------- drawing ---------- */
    function txt(x, yy, str, cls, anchor) {
      var t = LN.s("text", { x: x, y: yy, "text-anchor": anchor || "middle", "class": cls || "bl-tick",
        fill: "var(--chart-label)" });
      t.textContent = str;
      return t;
    }
    var W = 560, H = 320, L = 78, Rr = 24, T = 26, B = 50;
    function frame(xTicks, yTicks, yFmt) {
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "chart" });
      var i, gy;
      for (i = 0; i <= 4; i++) {
        gy = H - B - i / 4 * (H - B - T);
        svg.appendChild(LN.s("line", { x1: L, y1: gy, x2: W - Rr, y2: gy, stroke: "var(--chart-grid)", "stroke-width": 1 }));
        svg.appendChild(txt(L - 6, gy + 4, yFmt(yTicks[i]), "bl-tick", "end"));
      }
      xTicks.forEach(function (tk) { svg.appendChild(txt(tk[0], H - B + 16, tk[1])); });
      svg.appendChild(LN.s("line", { x1: L, y1: H - B, x2: W - Rr, y2: H - B, stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      svg.appendChild(LN.s("line", { x1: L, y1: T, x2: L, y2: H - B, stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      return svg;
    }
    function yTitle(svg, str) {
      var yt = LN.s("text", { x: 14, y: (T + H - B) / 2, "text-anchor": "middle",
        fill: "var(--chart-label)", "class": "bl-axis",
        transform: "rotate(-90 14 " + ((T + H - B) / 2) + ")" });
      yt.textContent = str;
      svg.appendChild(yt);
    }

    function drawCurve(yMark, priceMark) {
      svgBox.innerHTML = "";
      var xMax = Math.max(6, Math.ceil(Math.max(S.cr, yMark) * 1.6));
      if (xMax > 30) xMax = 30;
      var yMax = niceMax(priceAt(0));
      function sx(y) { return L + y / xMax * (W - L - Rr); }
      function sy(v) { return H - B - v / yMax * (H - B - T); }
      var xTicks = [], xi;
      for (xi = 0; xi <= 4; xi++) {
        var yy = xMax * xi / 4;
        xTicks.push([sx(yy), (Math.round(yy * 10) / 10) + "%"]);
      }
      var svg = frame(xTicks, [0, 1, 2, 3, 4].map(function (i) { return yMax * i / 4; }),
        function (v) { return money + LN.fmt(v); });
      svg.setAttribute("aria-label", C.axisPrice + " versus " + C.axisYield);
      svg.appendChild(LN.s("line", { x1: L, y1: sy(S.amt), x2: W - Rr, y2: sy(S.amt),
        stroke: "var(--chart-axis)", "stroke-dasharray": "5 4" }));
      var pts = [], k;
      for (k = 0; k <= xMax + 1e-9; k += xMax / 90) pts.push(sx(k) + "," + sy(priceAt(k)));
      svg.appendChild(LN.s("polyline", { points: pts.join(" "), fill: "none",
        stroke: "var(--chart-rev)", "stroke-width": 2.8 }));
      svg.appendChild(LN.s("circle", { cx: sx(yMark), cy: sy(priceMark), r: 4, fill: "var(--chart-rev)" }));
      svg.appendChild(txt(sx(yMark) - 8, sy(priceMark) - 12, money2(priceMark), "bl-mark", "end"));
      svg.appendChild(txt(L + 8, sy(S.amt) - 7, C.parLegend, "bl-tick", "start"));
      yTitle(svg, C.axisPrice);
      svg.appendChild(txt((L + W - Rr) / 2, H - 10, C.axisYield, "bl-axis"));
      svgBox.appendChild(svg);
    }

    /* ---------- chips, readout, sensitivity ---------- */
    function chips(mode, price, yUsed, cls) {
      strip.innerHTML = "";
      var pairs = mode === "price" ? [
        [C.chipsPrice[0], money2(coupon())],
        [C.chipsPrice[1], String(periods())],
        [C.chipsPrice[2], pc(yUsed / FREQ)],
        [C.chipsPrice[3], money2(price)],
        [C.chipsPrice[4], clsWord(cls)]
      ] : [
        [C.chipsYtm[0], money2(S.p)],
        [C.chipsYtm[1], pc(yUsed)],
        [C.chipsYtm[2], pc(yUsed / FREQ)],
        [C.chipsYtm[3], pc(S.cr)],
        [C.chipsYtm[4], clsWord(cls)]
      ];
      pairs.forEach(function (p) {
        strip.appendChild(LN.h("span", { class: "chip", text: p[0] + "  " + p[1] }));
      });
    }

    function readout(mode, price, yUsed, cls) {
      read.innerHTML = "";
      var map = {
        face: money2(S.amt), cr: pc(S.cr), y: pc(yUsed), p: money2(S.p),
        price: money2(price), cp: money2(coupon()), N: String(periods()),
        rate: pc(yUsed / FREQ), period: periodWord(), cls: clsWord(cls),
        relation: relation(S.cr, yUsed)
      };
      read.appendChild(LN.h("div", { class: "fb ok show",
        text: fill(mode === "price" ? C.readPrice : C.readYtm, map) }));
    }

    function sensitivity(yBase) {
      sens.innerHTML = "";
      var tb = LN.h("tbody");
      var base = priceAt(yBase);
      [[-100], [-50], [0], [50], [100]].forEach(function (row) {
        var bp = row[0];
        var newY = Math.max(0.0001, yBase + bp / 100);
        var price = priceAt(newY);
        var delta = (price - base) / base * 100;
        tb.appendChild(LN.h("tr", { class: bp === 0 ? "base" : "" }, [
          LN.h("td", { text: C.sensRow.replace("{n}", bp === 0 ? "\u00B10" : (bp > 0 ? "+" : "") + bp) }),
          LN.h("td", { text: money2(price) }),
          LN.h("td", { class: "d",
            text: bp === 0 ? "\u2014" : (delta > 0 ? "+" : "") + (Math.round(delta * 100) / 100) + "%" })
        ]));
      });
      var head = LN.h("tr", {}, [LN.h("th", { text: C.sensHead[0] }),
        LN.h("th", { text: C.sensHead[1] }), LN.h("th", { text: C.sensHead[2] })]);
      sens.appendChild(LN.h("h3", { text: C.sensTitle }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: "\u2192" }),
        LN.h("table", { class: "tbl bl-tbl" }, [LN.h("thead", {}, [head]), tb])
      ]));
    }

    function setMode(mode) {
      S.mode = mode;
      Object.keys(btns).forEach(function (k) {
        btns[k].setAttribute("aria-pressed", k === mode ? "true" : "false");
      });
      recalc();
    }

    function recalc() {
      FREQ = S.freq;
      ctrls.y.row.style.display = S.mode === "price" ? "" : "none";
      ctrls.p.row.style.display = S.mode === "ytm" ? "" : "none";
      Object.keys(ctrls).forEach(function (k) {
        var c = ctrls[k];
        c.lab.textContent = c.labelF();
        c.inp.setAttribute("aria-label", c.labelF());
        c.inp.min = RG[k][0]; c.inp.max = RG[k][1]; c.inp.step = RG[k][2];
        c.inp.value = S[k];
        c.out.textContent = c.fmtF();
      });
      Object.keys(fbtns).forEach(function (k) {
        fbtns[k].setAttribute("aria-pressed", Number(k) === S.freq ? "true" : "false");
      });
      var yUsed, price;
      if (S.mode === "price") { yUsed = S.y; price = priceAt(yUsed); }
      else { yUsed = solveY(); price = S.p; }
      var cls = classify(price);
      drawCurve(yUsed, price);
      chips(S.mode, price, yUsed, cls);
      readout(S.mode, price, yUsed, cls);
      sensitivity(yUsed);
    }

    root.appendChild(wrap);
    setMode(S.mode);
  }
};
