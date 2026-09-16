/* tvm-lab — the money-through-time centrepiece, v2.
   Three modes: Grow money forward (FV), Pull a promise back (PV), and
   Bond price sensitivity (Duration & convexity): live Macaulay/modified
   duration, convexity, duration-tangent vs exact price-yield curve.
   Registers into LN.components, renders from LN.data[key]; all wording
   lives in the data copy object; token colours only. */

LN.components["tvm-lab"] = {
  init: function (root, d) {
    var money = d.money || "\u20B1";
    var C = d.copy;
    var RG = d.ranges;
    var S = { mode: d.init.mode, amt: d.init.amt, r: d.init.r, n: d.init.n,
      cr: d.init.cr != null ? d.init.cr : 6, dy: d.init.dy != null ? d.init.dy : 100 };
    var DUR = S.mode === "dur";

    function cf(r, k) { return Math.pow(1 + r / 100, k); }
    function fvOf(r, k) { return S.amt * cf(r, k); }
    function fvSimple(k) { return S.amt * (1 + S.r / 100 * k); }
    function pvOf(r, k) { return S.amt / cf(r, k); }
    function answer(r, k) { return S.mode === "fv" ? fvOf(r, k) : pvOf(r, k); }
    function yrs(n) { return n === 1 ? "year" : "years"; }
    function m1(v) {
      if (!isFinite(v)) return "\u2014";
      if (Math.abs(v) >= 1000) return money + LN.fmt(Math.round(v));
      var r = Math.round(v * 100) / 100;
      return money + (Math.abs(r % 1) > 0 ? r.toFixed(2) : String(r));
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

    /* ---------- bond maths ---------- */
    function bond(y) {
      var F = S.amt, cp = S.cr / 100 * F, T = Math.round(S.n), t, pv, P = 0, w = 0, cv = 0;
      for (t = 1; t <= T; t++) {
        pv = (cp + (t === T ? F : 0)) / Math.pow(1 + y, t);
        P += pv; w += pv * t; cv += pv * t * (t + 1);
      }
      return { P: P, dmac: P ? w / P : 0, dmod: P ? w / P / (1 + y) : 0,
        conv: P ? cv / P / Math.pow(1 + y, 2) : 0, cp: cp };
    }
    function priceAt(y) {
      var b = 0, F = S.amt, cp = S.cr / 100 * F, T = Math.round(S.n), t;
      for (t = 1; t <= T; t++) b += (cp + (t === T ? F : 0)) / Math.pow(1 + y, t);
      return b;
    }

    /* ---------- shell ---------- */
    var wrap = LN.h("div", { class: "ln-comp tvm" });
    var left = LN.h("div", { class: "tvm-left" });
    var right = LN.h("div", { class: "tvm-right" });

    var btns = {};
    var modeRow = LN.h("div", { class: "tvm-modes" });
    var MODES = d.modes || ["fv", "pv", "dur"];
    var MODE_LABEL = { fv: C.modes[0], pv: C.modes[1], dur: C.modes[2] };
    MODES.forEach(function (mk) {
      btns[mk] = LN.h("button", { type: "button", class: "tvm-mode", text: MODE_LABEL[mk],
        onclick: function () { setMode(mk); } });
      modeRow.appendChild(btns[mk]);
    });
    if (MODES.length > 1) left.appendChild(modeRow);
    else modeRow.style.display = "none";

    var ctrls = {};
    function ctl(key, labelF, fmtF) {
      var lab = LN.h("label", {});
      var out = LN.h("span", { class: "tvm-val" });
      var inp = LN.h("input", { type: "range", "aria-label": "value" });
      var row = LN.h("div", { class: "tvm-ctl" }, [LN.h("div", { class: "tvm-line" }, [lab, out]), inp]);
      inp.addEventListener("input", function () { S[key] = parseFloat(inp.value); recalc(); });
      ctrls[key] = { inp: inp, out: out, lab: lab, row: row, labelF: labelF, fmtF: fmtF };
      left.appendChild(row);
    }
    ctl("amt", function () { return S.mode === "dur" ? C.faceLabel : (S.mode === "fv" ? C.amtFV : C.amtPV); },
      function () { return m1(S.amt); });
    ctl("r", function () { return S.mode === "dur" ? C.yLabel : C.rLabel; },
      function () { return S.r + "%"; });
    ctl("cr", function () { return C.crLabel; }, function () { return S.cr + "%"; });
    ctl("n", function () { return S.mode === "dur" ? C.TLabel : C.nLabel; },
      function () { return S.mode === "dur" ? S.n + " yrs" : S.n + " " + yrs(S.n); });
    ctl("dy", function () { return C.dyLabel; }, function () { return (S.dy > 0 ? "+" : "") + S.dy + " bps"; });

    var presetBox = LN.h("div", { class: "tvm-presets" });
    (d.presets || []).forEach(function (p) {
      presetBox.appendChild(LN.h("button", {
        type: "button", class: "chip", text: p.label,
        onclick: function () {
          S.amt = p.amt; S.r = p.r; S.n = p.n;
          if (p.cr != null) S.cr = p.cr;
          if (p.dy != null) S.dy = p.dy;
          setMode(p.mode);
        }
      }));
    });
    left.appendChild(LN.h("div", { class: "tvm-ctl" }, [
      LN.h("div", { class: "tvm-line" }, [LN.h("label", { text: C.presetsLabel })]), presetBox
    ]));

    var svgBox = LN.h("div", { class: "tvm-svg" });
    var strip = LN.h("div", { class: "data-strip" });
    var read = LN.h("div", { class: "tvm-read" });
    var sens = LN.h("div", { class: "tvm-sens" });
    right.appendChild(svgBox); right.appendChild(strip); right.appendChild(read); right.appendChild(sens);

    /* ---------- drawing helpers ---------- */
    function txt(x, yy, str, cls, anchor) {
      var t = LN.s("text", { x: x, y: yy, "text-anchor": anchor || "middle", "class": cls || "tvm-tick",
        fill: "var(--chart-label)" });
      t.textContent = str;
      return t;
    }
    var W = 560, H = 320, L = 78, R = 24, T = 26, B = 50;
    function frame(xTicks, yTicks, yFmt) {
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "chart" });
      var i, gy;
      for (i = 0; i <= 4; i++) {
        gy = H - B - i / 4 * (H - B - T);
        svg.appendChild(LN.s("line", { x1: L, y1: gy, x2: W - R, y2: gy, stroke: "var(--chart-grid)", "stroke-width": 1 }));
        svg.appendChild(txt(L - 6, gy + 4, yFmt(yTicks[i]), "tvm-tick", "end"));
      }
      xTicks.forEach(function (tk) {
        svg.appendChild(txt(tk[0], H - B + 16, tk[1]));
      });
      svg.appendChild(LN.s("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      svg.appendChild(LN.s("line", { x1: L, y1: T, x2: L, y2: H - B, stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      return svg;
    }
    function yTitle(svg, str) {
      var yt = LN.s("text", { x: 14, y: (T + H - B) / 2, "text-anchor": "middle",
        fill: "var(--chart-label)", "class": "tvm-axis",
        transform: "rotate(-90 14 " + ((T + H - B) / 2) + ")" });
      yt.textContent = str;
      svg.appendChild(yt);
    }

    function drawFV() {
      svgBox.innerHTML = "";
      var xMax = S.n, yMax = niceMax(Math.max(fvOf(S.r, S.n), 1));
      function sx(k) { return L + k / xMax * (W - L - R); }
      function sy(v) { return H - B - v / yMax * (H - B - T); }
      var svg = frame([], [0, 1, 2, 3, 4].map(function (i) { return yMax * i / 4; }),
        function (v) { return money + LN.fmt(v); });
      svg.setAttribute("aria-label", "Compound versus simple growth");
      var ticks = [], i;
      for (i = 0; i <= xMax; i++) { if (!(xMax > 6 && i % 2)) ticks.push([sx(i), String(i)]); }
      ticks.forEach(function (tk) { svg.appendChild(txt(tk[0], H - B + 16, tk[1])); });
      yTitle(svg, C.axisFV);
      ticks.forEach(function (tk) { svg.appendChild(txt(tk[0], H - B + 16, tk[1])); });
      var pts = [], k;
      for (k = 0; k <= xMax + 0.0001; k += xMax / 80) pts.push(sx(k) + "," + sy(fvOf(S.r, k)));
      var back = [];
      for (k = xMax; k >= -0.0001; k -= xMax / 20) back.push(sx(k) + "," + sy(fvSimple(k)));
      svg.appendChild(LN.s("polygon", { points: pts.join(" ") + " " + back.join(" "), fill: "var(--chart-profit)", opacity: ".14" }));
      svg.appendChild(LN.s("line", { x1: sx(0), y1: sy(fvSimple(0)), x2: sx(xMax), y2: sy(fvSimple(xMax)), stroke: "var(--chart-cost)", "stroke-width": 2.2 }));
      svg.appendChild(LN.s("polyline", { points: pts.join(" "), fill: "none", stroke: "var(--chart-rev)", "stroke-width": 2.8 }));
      svg.appendChild(LN.s("circle", { cx: sx(xMax), cy: sy(fvOf(S.r, xMax)), r: 4, fill: "var(--chart-rev)" }));
      svg.appendChild(txt(sx(xMax) - 8, sy(fvOf(S.r, xMax)) - 12, fill(C.markerFV, { v: LN.fmt(fvOf(S.r, xMax)), n: xMax, years: yrs(xMax) }), "tvm-mark", "end"));
      svg.appendChild(LN.s("line", { x1: L + 10, y1: T + 8, x2: L + 34, y2: T + 8, stroke: "var(--chart-rev)", "stroke-width": 2.8 }));
      svg.appendChild(txt(L + 38, T + 12, C.legendCompound, "tvm-tick", "start"));
      svg.appendChild(LN.s("line", { x1: L + 118, y1: T + 8, x2: L + 142, y2: T + 8, stroke: "var(--chart-cost)", "stroke-width": 2.2 }));
      svg.appendChild(txt(L + 146, T + 12, C.legendSimple, "tvm-tick", "start"));
      svg.appendChild(txt((L + W - R) / 2, H - 10, C.axisYears, "tvm-axis"));
      svgBox.appendChild(svg);
    }

    function drawPV() {
      svgBox.innerHTML = "";
      var xMax = S.n, yMax = niceMax(S.amt);
      function sx(k) { return L + k / xMax * (W - L - R); }
      function sy(v) { return H - B - v / yMax * (H - B - T); }
      var svg = frame([], [0, 1, 2, 3, 4].map(function (i) { return yMax * i / 4; }),
        function (v) { return money + LN.fmt(v); });
      svg.setAttribute("aria-label", "Present value of a fixed promise as the wait grows");
      var ticks = [], i;
      for (i = 0; i <= xMax; i++) { if (!(xMax > 6 && i % 2)) ticks.push([sx(i), String(i)]); }
      ticks.forEach(function (tk) { svg.appendChild(txt(tk[0], H - B + 16, tk[1])); });
      svg.appendChild(LN.s("line", { x1: L, y1: sy(S.amt), x2: W - R, y2: sy(S.amt), stroke: "var(--chart-axis)", "stroke-dasharray": "5 4" }));
      svg.appendChild(txt(L + 8, sy(S.amt) - 7, C.legendPromise + " " + m1(S.amt), "tvm-tick", "start"));
      var pts = [], k;
      for (k = 0; k <= xMax + 0.0001; k += xMax / 80) pts.push(sx(k) + "," + sy(pvOf(S.r, k)));
      svg.appendChild(LN.s("polygon", { points: pts.join(" ") + " " + sx(xMax) + "," + sy(0) + " " + sx(0) + "," + sy(0), fill: "var(--chart-rev)", opacity: ".10" }));
      svg.appendChild(LN.s("polyline", { points: pts.join(" "), fill: "none", stroke: "var(--chart-rev)", "stroke-width": 2.8 }));
      svg.appendChild(LN.s("circle", { cx: sx(xMax), cy: sy(pvOf(S.r, xMax)), r: 4, fill: "var(--chart-rev)" }));
      var pvStr = m1(pvOf(S.r, xMax));
      svg.appendChild(txt(sx(xMax) - 8, sy(pvOf(S.r, xMax)) + 18, fill(C.markerPV, { v: pvStr.slice(money.length) }), "tvm-mark", "end"));
      yTitle(svg, C.axisPV);
      svg.appendChild(txt((L + W - R) / 2, H - 10, C.axisYears, "tvm-axis"));
      svgBox.appendChild(svg);
    }

    function drawDur(b, y0) {
      svgBox.innerHTML = "";
      var yLo = Math.max(0.0025, y0 - 0.03), yHi = Math.min(0.2, y0 + 0.03);
      var pHi = priceAt(yLo), pLo = priceAt(yHi);
      var yMax = niceMax(pHi), yMin = 0;
      function sx(yy) { return L + (yy - yLo) / (yHi - yLo) * (W - L - R); }
      function sy(v) { return H - B - (v - yMin) / (yMax - yMin) * (H - B - T); }
      var svg = frame(
        [0, 1, 2, 3, 4].map(function (i) { return [sx(yLo + (yHi - yLo) * i / 4), ((yLo + (yHi - yLo) * i / 4) * 100).toFixed(1) + "%"]; }),
        [0, 1, 2, 3, 4].map(function (i) { return yMax * i / 4; }),
        function (v) { return money + LN.fmt(v); });
      svg.setAttribute("aria-label", "Bond price versus yield with the duration tangent");
      var pts = [], yy;
      for (yy = yLo; yy <= yHi + 1e-9; yy += (yHi - yLo) / 80) pts.push(sx(yy) + "," + sy(priceAt(yy)));
      svg.appendChild(LN.s("polyline", { points: pts.join(" "), fill: "none", stroke: "var(--chart-rev)", "stroke-width": 2.8 }));
      var tan = [], d;
      for (d = -0.03; d <= 0.030001; d += 0.005) {
        var px = sy(b.P - b.dmod * b.P * d);
        if (px > T - 30 || px < H - B + 30) continue;
        tan.push(sx(Math.min(Math.max(y0 + d, yLo), yHi)) + "," + px);
      }
      if (tan.length > 1) svg.appendChild(LN.s("polyline", { points: tan.join(" "), fill: "none", stroke: "var(--chart-cost)", "stroke-width": 2, "stroke-dasharray": "6 4" }));
      svg.appendChild(LN.s("circle", { cx: sx(y0), cy: sy(b.P), r: 4, fill: "var(--chart-rev)" }));
      svg.appendChild(txt(sx(y0) + 6, sy(b.P) - 10, fill(C.markerDur, { p: money + LN.fmt(b.P), y: (y0 * 100).toFixed(2) }), "tvm-mark", "start"));
      svg.appendChild(LN.s("line", { x1: L + 10, y1: T + 8, x2: L + 34, y2: T + 8, stroke: "var(--chart-rev)", "stroke-width": 2.8 }));
      svg.appendChild(txt(L + 38, T + 12, C.legendCurve, "tvm-tick", "start"));
      svg.appendChild(LN.s("line", { x1: L + 118, y1: T + 8, x2: L + 142, y2: T + 8, stroke: "var(--chart-cost)", "stroke-width": 2, "stroke-dasharray": "6 4" }));
      svg.appendChild(txt(L + 146, T + 12, C.legendTangent, "tvm-tick", "start"));
      yTitle(svg, C.axisPrice);
      svg.appendChild(txt((L + W - R) / 2, H - 10, C.axisYield, "tvm-axis"));
      svgBox.appendChild(svg);
    }

    /* ---------- readout, chips, sensitivity ---------- */
    function chips() {
      strip.innerHTML = "";
      var pairs;
      if (S.mode === "fv")
        pairs = [[C.chipsFV[0], m1(fvOf(S.r, S.n))], [C.chipsFV[1], m1(fvSimple(S.n))], [C.chipsFV[2], m1(fvOf(S.r, S.n) - fvSimple(S.n))]];
      else if (S.mode === "pv")
        pairs = [[C.chipsPV[0], m1(pvOf(S.r, S.n))], [C.chipsPV[1], m1(S.amt - pvOf(S.r, S.n))]];
      else {
        var b = bond(S.r / 100);
        pairs = [[C.chipsDUR[0], b.dmac.toFixed(2) + " yrs"], [C.chipsDUR[1], b.dmod.toFixed(2)],
          [C.chipsDUR[2], b.conv.toFixed(2)], [C.chipsDUR[3], m1(b.P)]];
      }
      pairs.forEach(function (p) { strip.appendChild(LN.h("span", { class: "chip", text: p[0] + "  " + p[1] })); });
    }
    function readout() {
      read.innerHTML = "";
      var map = { amt: m1(S.amt), r: S.r, n: S.n, years: yrs(S.n) };
      var text;
      if (S.mode === "fv") {
        if (S.r <= 0) text = C.readFVZero;
        else {
          map.fv = m1(fvOf(S.r, S.n)); map.simple = m1(fvSimple(S.n));
          map.extra = m1(fvOf(S.r, S.n) - fvSimple(S.n));
          text = fill(C.readFV, map);
        }
      } else if (S.mode === "pv") {
        map.pv = m1(pvOf(S.r, S.n)); map.lost = m1(S.amt - pvOf(S.r, S.n));
        text = fill(C.readPV, map);
      } else {
        var b = bond(S.r / 100);
        var dy = S.dy / 10000, est = -b.dmod * b.P * dy, exact = priceAt(S.r / 100 + dy) - b.P;
        map.face = m1(S.amt); map.cr = S.cr; map.y = S.r; map.T = S.n;
        map.dmac = b.dmac.toFixed(2); map.dmod = b.dmod.toFixed(2); map.conv = b.conv.toFixed(1);
        map.dy = (S.dy > 0 ? "+" : "") + S.dy;
        map.est = (est < 0 ? "\u2212" : "+") + m1(Math.abs(est));
        map.exact = (exact < 0 ? "\u2212" : "+") + m1(Math.abs(exact));
        map.gap = m1(Math.abs(Math.abs(exact) - Math.abs(est)));
        text = S.dy === 0 ? fill(C.readDurZero, map) : fill(C.readDUR, map);
      }
      read.appendChild(LN.h("div", { class: "fb ok show", text: text }));
    }
    function sensitivity() {
      sens.innerHTML = "";
      var rows = [], head3, tb = LN.h("tbody");
      if (S.mode === "dur") {
        var y0 = S.r / 100, b = bond(y0);
        head3 = C.sensDurHead;
        [[-100], [-50], [0], [50], [100]].forEach(function (r) {
          var dy = r[0] / 10000;
          var est = -b.dmod * b.P * dy, exact = priceAt(y0 + dy) - b.P;
          rows.push([C.sensDurRow.replace("{n}", r[0] === 0 ? "\u00B10" : (r[0] > 0 ? "+" : "") + r[0]),
            (est < 0 ? "\u2212" : "+") + m1(Math.abs(est)),
            (exact < 0 ? "\u2212" : "+") + m1(Math.abs(exact))]);
        });
      } else {
        var base = answer(S.r, S.n);
        head3 = C.sensHead;
        rows = [[C.sensBase, answer(S.r, S.n), null, true],
          [C.sensRateDown, answer(S.r * 0.9, S.n), null],
          [C.sensRateUp, answer(S.r * 1.1, S.n), null]];
        if (S.n > 1) rows.push([C.sensYearsBack, answer(S.r, S.n - 1), null]);
        if (S.n < RG.n[1]) rows.push([C.sensYearsFwd, answer(S.r, S.n + 1), null]);
      }
      var head = LN.h("tr", {}, [LN.h("th", { text: head3[0] }), LN.h("th", { text: head3[1] }), LN.h("th", { text: head3[2] })]);
      rows.forEach(function (r) {
        if (S.mode === "dur") {
          tb.appendChild(LN.h("tr", { class: r[0].indexOf("\u00B10") >= 0 && S.dy === 0 ? "base" : "" }, [
            LN.h("td", { text: r[0] }), LN.h("td", { text: r[1] }), LN.h("td", { text: r[2] })]));
        } else {
          var delta = (r[1] - base) / base * 100;
          var cls = r[3] ? "base" : (delta > 0.05 ? "up" : delta < -0.05 ? "down" : "");
          tb.appendChild(LN.h("tr", { class: cls }, [
            LN.h("td", { text: r[0] }),
            LN.h("td", { text: m1(r[1]) }),
            LN.h("td", { class: "d", text: Math.abs(delta) < 0.05 ? "\u2014" : (delta > 0 ? "+" : "") + Math.round(delta) + "%" })]));
        }
      });
      sens.appendChild(LN.h("h3", { text: S.mode === "dur" ? C.sensDurTitle : C.sensTitle }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: "\u2192" }),
        LN.h("table", { class: "tbl sens-tbl" }, [LN.h("thead", {}, [head]), tb])
      ]));
    }

    function setMode(mode) {
      S.mode = mode;
      DUR = mode === "dur";
      Object.keys(btns).forEach(function (k) {
        btns[k].setAttribute("aria-pressed", k === mode ? "true" : "false");
      });
      recalc();
    }

    function recalc() {
      ctrls.cr.row.style.display = DUR ? "" : "none";
      ctrls.dy.row.style.display = DUR ? "" : "none";
      Object.keys(ctrls).forEach(function (k) {
        var c = ctrls[k];
        c.lab.textContent = c.labelF();
        c.inp.setAttribute("aria-label", c.labelF());
        c.inp.min = RG[k][0]; c.inp.max = RG[k][1]; c.inp.step = RG[k][2];
        c.inp.value = S[k];
        c.out.textContent = c.fmtF();
      });
      if (S.mode === "fv") drawFV();
      else if (S.mode === "pv") drawPV();
      else drawDur(bond(S.r / 100), S.r / 100);
      chips();
      readout();
      sensitivity();
    }

    wrap.appendChild(left);
    wrap.appendChild(right);
    root.appendChild(wrap);
    setMode(S.mode);
  }
};
