/* component: monopoly-lab
   The anchor calculator for a single-seller market. Given the linear inverse
   demand curve P = a - bQ and a constant marginal cost MC, it solves the
   optimal output rule, reads the monopoly price off the demand curve, marks
   the competitive quantity where demand crosses MC, shades the deadweight-loss
   triangle between them, and shows a plain-language readout plus a +/-10%
   sensitivity table. Wording comes from LN.data (copy + presets); the labels
   here are the lesson's symbols. All colours are --chart-* / --* tokens. */
LN.components["monopoly-lab"] = {
  init: function (root, d) {
    d = d || {};
    var cp = d.copy || {};
    var unit = d.unit || "units";
    var D = { a: d.init.a, b: d.init.b, mc: d.init.mc };
    var shown = { a: null, b: null, mc: null };
    var DEF_R = { a: [20, 300, 5], b: [1, 10, 1], mc: [0, 80, 1] };

    var LBL = [
      ["a", cp.a || "a - vertical intercept of the demand curve"],
      ["b", cp.b || "b - slope of the demand curve"],
      ["mc", cp.mc || "MC - constant marginal cost"]
    ];

    function nf(v) {
      if (v === null || v === undefined || !isFinite(v)) return "\u2014";
      var r = Math.round(v * 100) / 100;
      var whole = Math.abs(r - Math.round(r)) < 1e-9;
      var s = whole ? String(Math.round(r)) : String(r);
      var p = s.split(".");
      p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return p.join(".");
    }
    function setNum(key, val, fn) {
      var from = shown[key] === null ? val : shown[key];
      shown[key] = val;
      LN.tween(from, val, 220, fn);
    }
    function niceMax(v) {
      if (v <= 0) return 10;
      var e = Math.pow(10, Math.floor(Math.log10(v))), n = v / e;
      var step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5
        : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10;
      return step * e;
    }
    /* P = a - bQ, MR = a - 2bQ, MC constant. The optimal output rule sets
       MR equal to MC and the price is then read off the demand curve, never
       off MR; the competitive output is where demand itself crosses MC.
       Both quantities are located by walking the curve and bisecting, so no
       closed form the lesson does not teach is baked into this file. */
    function crossing(a, b, mc, k) {
      /* smallest Q at which (a - k*b*Q) falls to mc; null if it never does */
      if (a - k * b * 0 < mc) return null;
      var lo = 0, hi = 1, guard = 0;
      while (a - k * b * hi >= mc && guard++ < 200000) { lo = hi; hi += 1; }
      if (a - k * b * hi >= mc) return null;
      for (var i = 0; i < 60; i++) {
        var mid = (lo + hi) / 2;
        if (a - k * b * mid >= mc) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    function solve(s) {
      var a = s.a, b = s.b, mc = s.mc;
      if (!(b > 0) || !(a > mc)) return null;
      var q = crossing(a, b, mc, 2);          /* MR = MC */
      var qc = crossing(a, b, mc, 1);         /* P = MC */
      if (q == null || qc == null) return null;
      var p = a - b * q;
      return { q: q, p: p, mk: p - mc, qc: qc, gap: qc - q };
    }

    var wrap = LN.h("div", { class: "ln-comp mlab" });
    var left = LN.h("div", { class: "mlab-left" });
    var right = LN.h("div", { class: "mlab-right" });
    var sliders = {};
    LBL.forEach(function (cfg) {
      var key = cfg[0], rr = (d.ranges && d.ranges[key]) || DEF_R[key];
      var out = LN.h("output", { class: "chip mlab-out" });
      var inp = LN.h("input", { type: "range", min: rr[0], max: rr[1], step: rr[2],
        value: D[key], "aria-label": cfg[1] });
      inp.addEventListener("input", function () { D[key] = parseFloat(inp.value); recalc(); });
      sliders[key] = { inp: inp, out: out };
      left.appendChild(LN.h("div", { class: "mlab-ctl" },
        [LN.h("label", { class: "mlab-lab", text: cfg[1] }), inp, out]));
    });
    if (d.presets && d.presets.length) {
      var chips = LN.h("div", { class: "data-strip" });
      d.presets.forEach(function (pr) {
        chips.appendChild(LN.h("button", { type: "button", class: "chip", text: pr.label,
          onclick: function () {
            D.a = pr.a; D.b = pr.b; D.mc = pr.mc;
            Object.keys(sliders).forEach(function (k) { sliders[k].inp.value = D[k]; });
            recalc();
          } }));
      });
      left.appendChild(LN.h("div", { class: "mlab-ctl" }, [
        LN.h("label", { class: "mlab-lab", text: cp.presets || "Presets" }), chips]));
    }
    var svgBox = LN.h("div", { class: "mlab-svg" });
    var strip = LN.h("div", { class: "data-strip mlab-strip" });
    var read = LN.h("div", { class: "mlab-read" });
    var sens = LN.h("div", { class: "mlab-sens" });
    right.appendChild(svgBox); right.appendChild(strip); right.appendChild(read); right.appendChild(sens);

    function txt(x, y, str, cls, anchor) {
      var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "middle",
        class: cls || "mlab-tick", fill: "var(--chart-label)" });
      t.textContent = str;
      return t;
    }
    function draw(r) {
      svgBox.innerHTML = ""; strip.innerHTML = "";
      var W = 560, H = 350, L = 74, R = 24, T = 26, B = 54;
      var xMax = niceMax(Math.max(r.qc * 1.12, r.q * 1.4, 1));
      var yMax = niceMax(Math.max(D.a * 1.06, r.p * 1.1));
      function sx(x) { return L + (x / xMax) * (W - L - R); }
      function sy(y) { return H - B - (y / yMax) * (H - B - T); }
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "Demand, marginal revenue and marginal cost with the monopoly output marked" });
      var i;
      for (i = 0; i <= 5; i++) {
        var gx = sx(xMax * i / 5), gy = sy(yMax * i / 5);
        svg.appendChild(LN.s("line", { x1: gx, y1: T, x2: gx, y2: H - B,
          stroke: "var(--chart-grid)", "stroke-width": 1 }));
        svg.appendChild(LN.s("line", { x1: L, y1: gy, x2: W - R, y2: gy,
          stroke: "var(--chart-grid)", "stroke-width": 1 }));
        svg.appendChild(txt(gx, H - B + 16, nf(xMax * i / 5)));
        svg.appendChild(txt(L - 6, gy + 4, nf(yMax * i / 5), "mlab-tick", "end"));
      }
      /* deadweight loss: the triangle between demand and marginal cost,
         from the monopoly output out to the competitive output */
      svg.appendChild(LN.s("polygon", {
        points: sx(r.q) + "," + sy(r.p) + " " + sx(r.qc) + "," + sy(D.mc)
          + " " + sx(r.qc) + "," + sy(r.p),
        fill: "var(--chart-loss)", opacity: ".16" }));
      /* marginal cost: the flat line the optimal output rule runs into */
      svg.appendChild(LN.s("line", { x1: L, y1: sy(D.mc), x2: W - R, y2: sy(D.mc),
        stroke: "var(--chart-axis)", "stroke-dasharray": "5 4", "stroke-width": 1.6 }));
      svg.appendChild(txt(L + 8, sy(D.mc) - 7, cp.mcline || ("MC = " + nf(D.mc)),
        "mlab-tick", "start"));
      /* marginal revenue: same intercept as demand, twice the slope */
      var mrAtX = D.a - 2 * D.b * xMax;
      if (mrAtX > 0) {
        svg.appendChild(LN.s("line", { x1: L, y1: sy(D.a), x2: sx(xMax), y2: sy(mrAtX),
          stroke: "var(--chart-cost)", "stroke-width": 2.6 }));
      }
      /* demand */
      var dAtX = D.a - D.b * xMax;
      if (dAtX > 0) {
        svg.appendChild(LN.s("line", { x1: L, y1: sy(D.a), x2: sx(xMax), y2: sy(dAtX),
          stroke: "var(--chart-rev)", "stroke-width": 2.6 }));
      }
      /* the monopoly outcome, read off demand */
      svg.appendChild(LN.s("line", { x1: sx(r.q), y1: sy(r.p), x2: sx(r.q), y2: sy(0),
        stroke: "var(--chart-axis)", "stroke-dasharray": "3 4" }));
      svg.appendChild(LN.s("line", { x1: L, y1: sy(r.p), x2: sx(r.q), y2: sy(r.p),
        stroke: "var(--chart-axis)", "stroke-dasharray": "3 4" }));
      svg.appendChild(LN.s("circle", { cx: sx(r.q), cy: sy(r.p), r: 4.5,
        fill: "var(--chart-rev)" }));
      svg.appendChild(txt(sx(r.q) + 10, sy(r.p) - 10,
        "Q* = " + nf(r.q) + ",  P* = " + nf(r.p), "mlab-tick", "start"));
      svg.appendChild(LN.s("line", { x1: L, y1: H - B, x2: W - R, y2: H - B,
        stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      svg.appendChild(LN.s("line", { x1: L, y1: T, x2: L, y2: H - B,
        stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      svg.appendChild(txt((L + W - R) / 2, H - 12, cp.xAxis || "Quantity per period", "mlab-axis"));
      var yt = LN.s("text", { x: 14, y: (T + H - B) / 2, "text-anchor": "middle",
        fill: "var(--chart-label)", class: "mlab-axis",
        transform: "rotate(-90 14 " + ((T + H - B) / 2) + ")" });
      yt.textContent = cp.yAxis || "Price per unit";
      svg.appendChild(yt);
      /* legend */
      var keys = [
        ["var(--chart-rev)", cp.demand || "Demand  P = a - bQ"],
        ["var(--chart-cost)", cp.mr || "Marginal revenue  MR = a - 2bQ"],
        ["var(--chart-axis)", cp.mc || "Marginal cost  MC"],
        ["var(--chart-loss)", cp.dwl || "Deadweight loss"]
      ];
      keys.forEach(function (k, n) {
        var ly = T + 8 + n * 15;
        svg.appendChild(LN.s("line", { x1: L + 10, y1: ly, x2: L + 34, y2: ly,
          stroke: k[0], "stroke-width": 2.6 }));
        svg.appendChild(txt(L + 38, ly + 4, k[1], "mlab-legend", "start"));
      });
      svgBox.appendChild(svg);
      [["Q*", nf(r.q) + " " + unit], ["P*", nf(r.p)],
       ["Markup", nf(r.mk)], ["Competitive Q", nf(r.qc) + " " + unit]].forEach(function (c) {
        strip.appendChild(LN.h("span", { class: "chip", text: c[0] + "  " + c[1] }));
      });
    }
    function readout(r) {
      read.innerHTML = "";
      var tpl = cp.readout || {};
      var share = r.p > 0 ? r.mk / r.p : 0;
      var body = share < 0.25 ? tpl.thin : (share < 0.6 ? tpl.mid : tpl.wide);
      body = body || "Sell {q} at {p}; the markup over marginal cost {mc} is {mk}.";
      var msg = body
        .replace(/\{q\}/g, nf(r.q))
        .replace(/\{p\}/g, nf(r.p))
        .replace(/\{mk\}/g, nf(r.mk))
        .replace(/\{mc\}/g, nf(D.mc))
        .replace(/\{qc\}/g, nf(r.qc))
        .replace(/\{gap\}/g, nf(r.gap))
        .replace(/\{unit\}/g, unit);
      read.appendChild(LN.h("div", { class: "fb info show", text: msg }));
    }
    function sensRows(base) {
      sens.innerHTML = "";
      var rows = [
        [cp.base || "Base case", D.a, D.b, D.mc],
        ["MC \u221210%", D.a, D.b, D.mc * 0.9],
        ["MC +10%", D.a, D.b, D.mc * 1.1],
        ["a \u221210%", D.a * 0.9, D.b, D.mc],
        ["a +10%", D.a * 1.1, D.b, D.mc]
      ];
      var head = LN.h("tr", {}, [LN.h("th", { text: cp.scen || "Scenario" }),
        LN.h("th", { text: "Q*" }), LN.h("th", { text: "P*" }),
        LN.h("th", { text: cp.markup || "Markup" }),
        LN.h("th", { text: "\u0394 P*" })]);
      var tb = LN.h("tbody");
      rows.forEach(function (r) {
        var s2 = solve({ a: r[1], b: r[2], mc: r[3] });
        var delta = (s2 == null || base == null || base === 0) ? null
          : (s2.p - base) / Math.abs(base) * 100;
        var cls = (delta == null || Math.abs(delta) < 0.05) ? "" : (delta > 0 ? "up" : "down");
        tb.appendChild(LN.h("tr", { class: cls }, [
          LN.h("td", { text: r[0] }),
          LN.h("td", { text: s2 == null ? "\u2014" : nf(s2.q) }),
          LN.h("td", { text: s2 == null ? "\u2014" : nf(s2.p) }),
          LN.h("td", { text: s2 == null ? "\u2014" : nf(s2.mk) }),
          LN.h("td", { class: "d",
            text: delta == null ? "\u2014" : (delta > 0 ? "+" : "") + Math.round(delta) + "%" })
        ]));
      });
      sens.appendChild(LN.h("h3", { text: cp.sensTitle || "Sensitivity (\u00B110% swings)" }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: "swipe the table sideways \u2192" }),
        LN.h("table", { class: "tbl mlab-sens-tbl" }, [LN.h("thead", {}, [head]), tb])
      ]));
    }
    function recalc() {
      setNum("a", D.a, function (v) { sliders.a.out.textContent = nf(v); });
      setNum("b", D.b, function (v) { sliders.b.out.textContent = nf(v); });
      setNum("mc", D.mc, function (v) { sliders.mc.out.textContent = nf(v); });
      var r = solve(D);
      if (r == null) {
        svgBox.innerHTML = ""; strip.innerHTML = ""; read.innerHTML = ""; sens.innerHTML = "";
        svgBox.appendChild(LN.h("div", { class: "mlab-empty",
          text: cp.noSolution || "No profit-maximizing output here: the demand curve never crosses marginal cost above zero, so there is no output where price covers marginal cost." }));
        return;
      }
      draw(r);
      readout(r);
      sensRows(r.p);
    }
    wrap.appendChild(left);
    wrap.appendChild(right);
    root.appendChild(wrap);
    recalc();
  }
};
