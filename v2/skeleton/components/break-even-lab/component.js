LN.components["break-even-lab"] = {
  init: function (root, d) {
    var money = d.money || "\u20B1", unit = d.unit || "units";
    var D = { fc: d.init.fc, p: d.init.p, vc: d.init.vc, vol: d.init.vol };
    var shown = { fc: null, p: null, vc: null, vol: null, mos: null };
    function setNum(key, val, fmtFn) {
      var from = shown[key] === null ? val : shown[key];
      shown[key] = val;
      LN.tween(from, val, 220, fmtFn);
    }
    var DEF_R = { fc: [0, 200000, 500], p: [0, 500, 5], vc: [0, 400, 5], vol: [0, 3000, 10] };
    function m(v) { return money + LN.fmt(v); }
    function niceMax(v) {
      if (v <= 0) return 10;
      var e = Math.pow(10, Math.floor(Math.log10(v))), n = v / e;
      var step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3
        : n <= 4 ? 4 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10;
      return step * e;
    }
    var wrap = LN.h("div", { class: "ln-comp ln-lab" });
    var left = LN.h("div", { class: "lab-left" });
    var right = LN.h("div", { class: "lab-right" });
    var sliders = {};
    [["fc", "Fixed costs (FC)"], ["p", "Price per unit (P)"],
     ["vc", "Variable cost (VC)"], ["vol", "Expected volume"]].forEach(function (cfg) {
      var key = cfg[0], rr = (d.ranges && d.ranges[key]) || DEF_R[key];
      var out = LN.h("output", { class: "chip lab-out" });
      var inp = LN.h("input", { type: "range", min: rr[0], max: rr[1], step: rr[2],
        value: D[key], "aria-label": cfg[1] });
      inp.addEventListener("input", function () { D[key] = parseFloat(inp.value); recalc(); });
      sliders[key] = { inp: inp, out: out };
      left.appendChild(LN.h("div", { class: "lab-ctl" }, [LN.h("label", { class: "lab-lab", text: cfg[1] }), inp, out]));
    });
    if (d.presets && d.presets.length) {
      var chips = LN.h("div", { class: "data-strip" });
      d.presets.forEach(function (pr) {
        chips.appendChild(LN.h("button", { type: "button", class: "chip", text: pr.label,
          onclick: function () {
            D.fc = pr.fc; D.p = pr.p; D.vc = pr.vc; D.vol = pr.vol;
            Object.keys(sliders).forEach(function (k) { sliders[k].inp.value = D[k]; });
            recalc();
          } }));
      });
      left.appendChild(LN.h("div", { class: "lab-ctl" }, [LN.h("label", { class: "lab-lab", text: "Presets" }), chips]));
    }
    var svgBox = LN.h("div", { class: "lab-svg" });
    var strip = LN.h("div", { class: "data-strip lab-strip" });
    var read = LN.h("div", { class: "lab-read" });
    var sens = LN.h("div", { class: "lab-sens" });
    right.appendChild(svgBox); right.appendChild(strip); right.appendChild(read); right.appendChild(sens);
    function txt(x, y, str, cls, anchor) {
      var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "middle", "class": cls || "lab-tick",
        fill: "var(--chart-label)" });
      t.textContent = str;
      return t;
    }
    function draw(bep, cm) {
      svgBox.innerHTML = ""; strip.innerHTML = "";
      var W = 560, H = 340, L = 78, R = 22, T = 22, B = 52;
      var xMax = niceMax(Math.max(bep * 1.25, D.vol * 1.1, 1));
      var yMax = niceMax(Math.max(D.p * xMax, D.fc + D.vc * xMax));
      function sx(x) { return L + (x / xMax) * (W - L - R); }
      function sy(y) { return H - B - (y / yMax) * (H - B - T); }
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Break-even chart" });
      var i;
      for (i = 0; i <= 5; i++) {
        var gx = sx(xMax * i / 5), gy = sy(yMax * i / 5);
        svg.appendChild(LN.s("line", { x1: gx, y1: T, x2: gx, y2: H - B, stroke: "var(--chart-grid)", "stroke-width": 1 }));
        svg.appendChild(LN.s("line", { x1: L, y1: gy, x2: W - R, y2: gy, stroke: "var(--chart-grid)", "stroke-width": 1 }));
        svg.appendChild(txt(gx, H - B + 16, LN.fmt(xMax * i / 5)));
        svg.appendChild(txt(L - 6, gy + 4, m(yMax * i / 5), "lab-tick", "end"));
      }
      var bx = sx(bep), by = sy(D.p * bep), ex = sx(xMax);
      svg.appendChild(LN.s("polygon", { points: L + "," + sy(0) + " " + bx + "," + by + " " + L + "," + sy(D.fc),
        fill: "var(--chart-loss)", opacity: ".14" }));
      svg.appendChild(LN.s("polygon", { points: bx + "," + by + " " + ex + "," + sy(D.p * xMax) + " " + ex + "," + sy(D.fc + D.vc * xMax),
        fill: "var(--chart-profit)", opacity: ".14" }));
      svg.appendChild(LN.s("line", { x1: L, y1: sy(D.fc), x2: ex, y2: sy(D.fc), stroke: "var(--chart-axis)", "stroke-dasharray": "5 4" }));
      svg.appendChild(txt(L + 8, sy(D.fc) - 7, "FC " + m(D.fc), "lab-tick", "start"));
      svg.appendChild(LN.s("line", { x1: L, y1: sy(0), x2: ex, y2: sy(D.p * xMax), stroke: "var(--chart-rev)", "stroke-width": "2.6" }));
      svg.appendChild(LN.s("line", { x1: L, y1: sy(D.fc), x2: ex, y2: sy(D.fc + D.vc * xMax), stroke: "var(--chart-cost)", "stroke-width": "2.6" }));
      svg.appendChild(LN.s("line", { x1: bx, y1: by, x2: bx, y2: sy(0), stroke: "var(--chart-axis)", "stroke-dasharray": "3 4" }));
      svg.appendChild(LN.s("line", { x1: L, y1: by, x2: bx, y2: by, stroke: "var(--chart-axis)", "stroke-dasharray": "3 4" }));
      svg.appendChild(LN.s("circle", { cx: bx, cy: by, r: 4, fill: "var(--chart-rev)" }));
      svg.appendChild(txt(bx + 10, by - 10, "BEP " + LN.fmt(bep), "lab-tick", "start"));
      svg.appendChild(LN.s("line", { x1: L, y1: H - B, x2: W - R, y2: H - B, stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      svg.appendChild(LN.s("line", { x1: L, y1: T, x2: L, y2: H - B, stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      svg.appendChild(txt((L + W - R) / 2, H - 12, "Units sold per month", "lab-axis"));
      var yt = LN.s("text", { x: 14, y: (T + H - B) / 2, "text-anchor": "middle", fill: "var(--chart-label)",
        "class": "lab-axis", transform: "rotate(-90 14 " + ((T + H - B) / 2) + ")" });
      yt.textContent = money + " per month";
      svg.appendChild(yt);
      svg.appendChild(LN.s("line", { x1: L + 10, y1: T + 8, x2: L + 34, y2: T + 8, stroke: "var(--chart-rev)", "stroke-width": 2.6 }));
      svg.appendChild(txt(L + 38, T + 12, "Revenue", "lab-legend", "start"));
      svg.appendChild(LN.s("line", { x1: L + 110, y1: T + 8, x2: L + 134, y2: T + 8, stroke: "var(--chart-cost)", "stroke-width": 2.6 }));
      svg.appendChild(txt(L + 138, T + 12, "Total cost", "lab-legend", "start"));
      svgBox.appendChild(svg);
      [["CM per unit", m(cm)], ["CM ratio", Math.round(cm / D.p * 1000) / 10 + "%"],
       ["BEP", LN.fmt(bep) + " " + unit], ["BEP revenue", m(bep * D.p)]].forEach(function (c) {
        strip.appendChild(LN.h("span", { class: "chip", text: c[0] + "  " + c[1] }));
      });
    }
    function readout(bep, cm) {
      read.innerHTML = "";
      var mos = D.vol > 0 ? (D.vol - bep) / D.vol : NaN;
      var need = "You must sell " + LN.fmt(bep) + " " + unit + " per month \u2014 roughly " +
        LN.fmt(bep / 30) + " a day \u2014 to cover all costs.";
      var card;
      if (!isFinite(mos)) card = LN.h("div", { class: "fb info show", text: need + " Set an expected volume to see your margin of safety." });
      else if (mos < 0) card = LN.h("div", { class: "fb no show", text: need + " But you expect only " + LN.fmt(D.vol) + " \u2014 at these numbers the plan loses money; something has to change." });
      else if (mos < 0.15) card = LN.h("div", { class: "fb info show", text: need + " At your expected " + LN.fmt(D.vol) + " you clear break-even by " + LN.fmt(D.vol - bep) + " units \u2014 a thin margin of safety (" + Math.round(mos * 100) + "%). Watch costs closely." });
      else card = LN.h("div", { class: "fb ok show", text: need + " At your expected " + LN.fmt(D.vol) + " you clear break-even by " + LN.fmt(D.vol - bep) + " units \u2014 a comfortable margin of safety (" + Math.round(mos * 100) + "%)." });
      read.appendChild(card);
      var mosChip = strip.lastChild;
      setNum("mos", isFinite(mos) ? Math.round(mos * 100) : null, function (v) {
        mosChip.textContent = "MoS  " + (v === null ? "\u2014" : Math.round(v) + "%");
      });
    }
    function sensRows(base) {
      sens.innerHTML = "";
      function bepOf(f, p, v) { var c = p - v; return c <= 0 ? null : f / c; }
      var rows = [
        ["Base case", D.fc, D.p, D.vc], ["Price \u221210%", D.fc, D.p * 0.9, D.vc],
        ["Price +10%", D.fc, D.p * 1.1, D.vc], ["VC \u221210%", D.fc, D.p, D.vc * 0.9],
        ["VC +10%", D.fc, D.p, D.vc * 1.1], ["FC \u221210%", D.fc * 0.9, D.p, D.vc],
        ["FC +10%", D.fc * 1.1, D.p, D.vc]
      ];
      var head = LN.h("tr", {}, [LN.h("th", { text: "Scenario" }), LN.h("th", { text: "CM" }),
        LN.h("th", { text: "BEP (" + unit + ")" }), LN.h("th", { text: "\u0394 vs base" })]);
      var tb = LN.h("tbody");
      rows.forEach(function (r) {
        var cm2 = r[2] - r[3], b2 = bepOf(r[1], r[2], r[3]);
        var delta = (b2 == null || !base) ? null : (b2 - base) / base * 100;
        var cls = (delta == null || Math.abs(delta) < 0.05) ? "" : (delta > 0 ? "up" : "down");
        tb.appendChild(LN.h("tr", { class: cls }, [
          LN.h("td", { text: r[0] }),
          LN.h("td", { text: cm2 > 0 ? m(cm2) : "\u2014" }),
          LN.h("td", { text: b2 == null ? "\u2014" : LN.fmt(b2) }),
          LN.h("td", { class: "d", text: delta == null ? "\u2014" : (delta > 0 ? "+" : "") + Math.round(delta) + "%" })
        ]));
      });
      sens.appendChild(LN.h("h3", { text: "Sensitivity (\u00B110% swings)" }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: "swipe the table sideways \u2192" }),
        LN.h("table", { class: "tbl sens-tbl" }, [LN.h("thead", {}, [head]), tb])
      ]));
    }
    function recalc() {
      setNum("fc", D.fc, function (v) { sliders.fc.out.textContent = m(v); });
      setNum("p", D.p, function (v) { sliders.p.out.textContent = m(v); });
      setNum("vc", D.vc, function (v) { sliders.vc.out.textContent = m(v); });
      setNum("vol", D.vol, function (v) { sliders.vol.out.textContent = LN.fmt(v) + " " + unit; });
      var cm = D.p - D.vc;
      if (cm <= 0) {
        shown.mos = null;
        svgBox.innerHTML = ""; strip.innerHTML = "";
        svgBox.appendChild(LN.h("div", { class: "lab-empty",
          text: "Contribution margin is zero or negative \u2014 no break-even is possible. Price must exceed variable cost." }));
        read.innerHTML = ""; sens.innerHTML = "";
        return;
      }
      var bep = D.fc / cm;
      draw(bep, cm);
      readout(bep, cm);
      sensRows(bep);
    }
    wrap.appendChild(left);
    wrap.appendChild(right);
    root.appendChild(wrap);
    recalc();
  }
};
