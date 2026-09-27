/* startup-lab - the total startup capital estimate, live.

   The lesson's formula:
     Total Startup Costs = Fixed Assets + Pre-Opening Expenses
                        + Initial Working Capital + Contingency Reserve
   where the reserve is a percentage of the subtotal of the first three.

   Data: LN.data.<key> = {
     money, copy:{...all wording},
     init:{fa, pre, wc, rate},
     ranges:{fa:[min,max,step], pre:[...], wc:[...], rate:[min,max,step]},
     presets:[{label, fa, pre, wc, rate}]
   }
   All wording comes from data.js; this file carries no content strings. */
LN.components["startup-lab"] = {
  init: function (root, d) {
    var money = d.money || "$";
    var C = d.copy || {};
    function txt(k, fallback) { return (C[k] != null) ? C[k] : fallback; }

    var base = {
      fa: LN.num((d.init || {}).fa) || 0,
      pre: LN.num((d.init || {}).pre) || 0,
      wc: LN.num((d.init || {}).wc) || 0,
      rate: LN.num((d.init || {}).rate) || 0
    };
    var D = { fa: base.fa, pre: base.pre, wc: base.wc, rate: base.rate, shown: null };
    var R = d.ranges || {};
    function rng(k, dflt) { return R[k] || dflt; }

    function f2(v) {
      if (!isFinite(v)) { return "\u2014"; }
      var s = (Math.abs(v) % 1 === 0) ? String(Math.round(v)) : v.toFixed(2);
      var neg = s.charAt(0) === "-";
      if (neg) { s = s.slice(1); }
      s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (neg ? "-" : "") + s;
    }
    function money2(v) { return money + f2(v); }
    function kfmt(v) {
      var a = Math.abs(v);
      if (a >= 1000000) { return money + f2(Math.round(v / 100000) / 10) + "M"; }
      if (a >= 1000) { return money + f2(Math.round(v / 100) / 10) + "k"; }
      return money + f2(v);
    }
    function pct(v) { return (Math.abs(v) < 0.05) ? "0%" : Math.round(v) + "%"; }

    /* the formula, exactly as the lesson states it */
    function calc(x) {
      var sub = x.fa + x.pre + x.wc;
      var res = sub * (x.rate / 100);
      return { sub: sub, res: res, total: sub + res };
    }

    var BUCKETS = [
      { k: "fa", name: txt("fa", "Fixed assets"), col: "var(--chart-cost)" },
      { k: "pre", name: txt("pre", "Pre-opening expenses"), col: "var(--chart-rev)" },
      { k: "wc", name: txt("wc", "Initial working capital"), col: "var(--chart-profit)" },
      { k: "res", name: txt("res", "Contingency reserve"), col: "var(--amber)" }
    ];

    var wrap = LN.h("div", { class: "ln-sl" });
    var left = LN.h("div", { class: "sl-left" });
    var right = LN.h("div", { class: "sl-right" });
    var head = LN.h("div", { class: "sl-head" });
    var svgBox = LN.h("div", { class: "sl-svg" });
    var keys = LN.h("div", { class: "sl-keys" });
    var read = LN.h("div", { class: "sl-read" });
    var sens = LN.h("div", { class: "sl-sens" });
    right.appendChild(head);
    right.appendChild(svgBox);
    right.appendChild(keys);
    right.appendChild(read);
    right.appendChild(sens);
    wrap.appendChild(left);
    wrap.appendChild(right);

    /* ---- controls: one slider per formula term ---- */
    var outs = {};
    [["fa", txt("fa", "Fixed assets"), rng("fa", [0, 120000, 1000])],
     ["pre", txt("pre", "Pre-opening expenses"), rng("pre", [0, 120000, 1000])],
     ["wc", txt("wc", "Initial working capital"), rng("wc", [0, 120000, 1000])],
     ["rate", txt("rate", "Contingency reserve"), rng("rate", [0, 40, 1])]
    ].forEach(function (spec) {
      var key = spec[0], label = spec[1], r = spec[2];
      var out = LN.h("output", { class: "chip sl-out" });
      outs[key] = { el: out, suffix: (key === "rate") ? "%" : "" };
      var inp = LN.h("input", { type: "range", min: r[0], max: r[1], step: r[2],
        value: D[key], "aria-label": label });
      inp.addEventListener("input", function () {
        D[key] = parseFloat(inp.value);
        recalc();
      });
      outs[key].inp = inp;
      left.appendChild(LN.h("div", { class: "sl-ctl" }, [
        LN.h("label", { class: "sl-lab", text: label }), inp, out]));
    });

    /* ---- presets: the lesson's own two worked ventures ---- */
    var presets = d.presets || [];
    if (presets.length) {
      var row = LN.h("div", { class: "sl-presets" });
      presets.forEach(function (p) {
        row.appendChild(LN.h("button", { type: "button", text: p.label, onclick: function () {
          D.fa = LN.num(p.fa); D.pre = LN.num(p.pre);
          D.wc = LN.num(p.wc); D.rate = LN.num(p.rate);
          ["fa", "pre", "wc", "rate"].forEach(function (k) { outs[k].inp.value = D[k]; });
          recalc();
        } }));
      });
      left.appendChild(LN.h("div", { class: "sl-ctl" }, [
        LN.h("label", { class: "sl-lab", text: txt("presets", "Lesson figures") }), row]));
    }
    left.appendChild(LN.h("div", { class: "sl-ctl" }, [
      LN.h("button", { type: "button", class: "chip", text: txt("reset", "Start over"),
        onclick: function () {
          D.fa = base.fa; D.pre = base.pre; D.wc = base.wc; D.rate = base.rate;
          ["fa", "pre", "wc", "rate"].forEach(function (k) { outs[k].inp.value = D[k]; });
          recalc();
        } })]));

    /* ---- the composition bar: where the capital actually goes ---- */
    function draw(c) {
      svgBox.innerHTML = "";
      var W = 560, H = 132, L = 16, R = 16, T = 34, BAR = 52;
      var bw = W - L - R;
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "Composition of the total startup cost, split into fixed assets, "
          + "pre-opening expenses, initial working capital and the contingency reserve" });
      function lab(x, y, str, cls, anchor) {
        var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "start", class: cls,
          fill: "var(--chart-label)" });
        t.textContent = str;
        return t;
      }
      var vals = BUCKETS.map(function (b) { return (b.k === "res") ? c.res : D[b.k]; });
      var total = c.total;
      var x = L, i;
      for (i = 0; i < BUCKETS.length; i++) {
        var w = (total > 0) ? (vals[i] / total) * bw : 0;
        if (w <= 0) { continue; }
        svg.appendChild(LN.s("rect", { x: x, y: T, width: Math.max(0, w - 1.5), height: BAR,
          fill: BUCKETS[i].col, "fill-opacity": "0.88" }));
        if (w > 46) {
          var t = LN.s("text", { x: x + w / 2, y: T + 22, "text-anchor": "middle",
            class: "sl-tick", fill: "var(--surface)" });
          t.textContent = pct((vals[i] / total) * 100);
          svg.appendChild(t);
        }
        x += w;
      }
      svg.appendChild(LN.s("rect", { x: L, y: T, width: bw, height: BAR, fill: "none",
        "stroke": "var(--chart-axis)", "stroke-width": "1.2" }));
      svg.appendChild(lab(L, 18, txt("shareOf", "Share of the total capital"), "sl-axis", "start"));
      svg.appendChild(lab(W - R, 18, money2(total), "sl-axis", "end"));
      svg.appendChild(lab(L, T + BAR + 22, money2(0), "sl-tick", "start"));
      svg.appendChild(lab(W - R, T + BAR + 22, money2(total), "sl-tick", "end"));
      svgBox.appendChild(svg);
    }

    /* ---- the four buckets, named and valued (never hue alone) ---- */
    function drawKeys(c) {
      keys.innerHTML = "";
      BUCKETS.forEach(function (b) {
        var v = (b.k === "res") ? c.res : D[b.k];
        var sw = LN.h("span", { class: "sl-sw" });
        sw.style.background = b.col;
        keys.appendChild(LN.h("div", { class: "sl-key" }, [
          sw,
          LN.h("span", { text: b.name }),
          LN.h("span", {}, [
            LN.h("span", { class: "sl-amt", text: money2(v) }),
            LN.h("span", { class: "sl-pct", text: c.total > 0
              ? pct((v / c.total) * 100) + txt("ofTotal", " of total") : "\u2014" })])
        ]));
      });
    }

    /* ---- sensitivity: the source's own what-ifs, no invented ones ---- */
    function drawSens() {
      sens.innerHTML = "";
      var baseC = calc(D);
      var scen = [
        [txt("scBase", "Base case"), D],
        [txt("scRateLo", "Reserve at the low end of the 10-20% band"), { fa: D.fa, pre: D.pre, wc: D.wc, rate: 10 }],
        [txt("scRateHi", "Reserve at the top of the 10-20% band"), { fa: D.fa, pre: D.pre, wc: D.wc, rate: 20 }],
        [txt("scFa", "Fixed assets 10% higher"), { fa: D.fa * 1.1, pre: D.pre, wc: D.wc, rate: D.rate }],
        [txt("scPre", "Pre-opening expenses 10% higher"), { fa: D.fa, pre: D.pre * 1.1, wc: D.wc, rate: D.rate }],
        [txt("scWc", "Initial working capital 10% higher"), { fa: D.fa, pre: D.pre, wc: D.wc * 1.1, rate: D.rate }]
      ];
      var head = LN.h("tr", {}, [LN.h("th", { text: txt("scCol", "Scenario") }),
        LN.h("th", { text: txt("res", "Contingency reserve") }),
        LN.h("th", { text: txt("total", "Total startup costs") }),
        LN.h("th", { text: txt("delta", "Change vs base") })]);
      var tb = LN.h("tbody");
      scen.forEach(function (s, ix) {
        var c = calc(s[1]), d = c.total - baseC.total;
        var cls = (ix === 0 || Math.abs(d) < 0.005) ? "" : "up";
        var dcell = LN.h("td", { class: "d" });
        dcell.textContent = (ix === 0) ? txt("baseRow", "the base case")
          : ((d > 0 ? "+" : "\u2212") + money2(Math.abs(d)));
        tb.appendChild(LN.h("tr", { class: cls }, [
          LN.h("td", { text: s[0] }),
          LN.h("td", { text: money2(c.res) }),
          LN.h("td", { text: money2(c.total) }),
          dcell]));
      });
      sens.appendChild(LN.h("p", { class: "sl-lab", text: txt("sensTitle", "Sensitivity") }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: txt("swipe", "swipe the table sideways \u2192") }),
        LN.h("table", { class: "tbl sens-tbl" }, [LN.h("thead", {}, [head]), tb])]));
    }

    function recalc() {
      var c = calc(D);
      var show = D.shown === null ? c.total : D.shown;
      LN.tween(show, c.total, 240, function (v) {
        head.innerHTML = "";
        head.appendChild(LN.h("span", { class: "sl-caption", text: txt("total", "Total startup costs") }));
        head.appendChild(LN.h("span", { class: "sl-bigv", text: money2(v) }));
      });
      D.shown = c.total;
      Object.keys(outs).forEach(function (k) {
        outs[k].el.textContent = (k === "rate") ? f2(D[k]) + "%"
          : (D[k] >= 0 ? "" : "-") + money2(Math.abs(D[k]));
      });

      read.innerHTML = "";
      var lines = [txt("needLine", "Before it earns anything, this venture needs")];
      if (c.total >= 1000) {
        lines.push(" " + txt("about", "about") + " "
          + kfmt(Math.round(c.total / 1000) * 1000) + ".");
      }
      read.appendChild(LN.h("div", { class: "fb info show", text: lines.join("") }));
      var top = BUCKETS.slice(0, 3).map(function (b) { return { b: b, v: D[b.k] }; })
        .sort(function (p, q) { return q.v - p.v; })[0];
      if (top && top.v > 0) {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("biggest", "The largest single commitment is") + " " + top.b.name.toLowerCase()
            + " at " + money2(top.v) + " \u2014 " + pct((top.v / c.total) * 100)
            + txt("ofTotal", " of total") + "." }));
      }
      read.appendChild(LN.h("div", { class: "fb info show", text: txt("reserveLine",
        "The reserve is a percentage of the first three items, not of the total.") + " "
        + txt("reserveNow", "At") + " " + f2(D.rate) + "%, "
        + txt("reserveIs", "it adds") + " " + money2(c.res) + " "
        + txt("onTop", "on top of") + " " + money2(c.sub) + "." }));

      draw(c);
      drawKeys(c);
      drawSens();
    }

    root.appendChild(wrap);
    recalc();
  }
};
