/* cac-lab - the customer acquisition cost estimate, live.

   The lesson's formula:
     CAC = Total Marketing and Sales Costs / Number of New Customers Acquired
   where the denominator counts only unique first-time buyers in the same
   period - never sign-ups, impressions, or followers. The lab holds three
   numbers (total cost, new customers, total sign-ups) so the student can see
   the denominator choice change the answer, then reads the per-channel
   attribution table the lesson works through (FitFlix).

   Data: LN.data.<key> = {
     money, copy:{...all wording},
     init:{cost, cust, signups},
     ranges:{cost:[min,max,step], cust:[...], signups:[...]},
     presets:[{label, cost, cust, signups}],
     channels:[{name, cost, cust}]
   }
   All wording comes from data.js; this file carries no content strings. */
LN.components["cac-lab"] = {
  init: function (root, d) {
    var money = d.money || "$";
    var C = d.copy || {};
    function txt(k, fallback) { return (C[k] != null) ? C[k] : fallback; }

    var base = {
      cost: LN.num((d.init || {}).cost) || 0,
      cust: LN.num((d.init || {}).cust) || 0,
      signups: LN.num((d.init || {}).signups) || 0
    };
    var D = { cost: base.cost, cust: base.cust, signups: base.signups, shown: null };
    var R = d.ranges || {};
    function rng(k, dflt) { return R[k] || dflt; }
    var CH = d.channels || [];

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
    function cac(cost, cust) { return (cust > 0) ? cost / cust : NaN; }

    var wrap = LN.h("div", { class: "ln-cl" });
    var left = LN.h("div", { class: "cl-left" });
    var right = LN.h("div", { class: "cl-right" });
    var head = LN.h("div", { class: "cl-head" });
    var svgBox = LN.h("div", { class: "cl-svg" });
    var read = LN.h("div", { class: "cl-read" });
    var tblBox = LN.h("div", { class: "cl-tbl" });
    var sens = LN.h("div", { class: "cl-sens" });
    right.appendChild(head);
    right.appendChild(svgBox);
    right.appendChild(read);
    right.appendChild(sens);
    right.appendChild(tblBox);
    wrap.appendChild(left);
    wrap.appendChild(right);

    /* ---- controls: one slider per term of the formula, plus the trap ---- */
    var outs = {};
    [["cost", txt("cost", "Total marketing and sales costs"), rng("cost", [0, 200000, 500])],
     ["cust", txt("cust", "New customers acquired"), rng("cust", [1, 2000, 1])],
     ["signups", txt("signups", "Total sign-ups (not the denominator)"), rng("signups", [1, 5000, 10])]
    ].forEach(function (spec) {
      var key = spec[0], label = spec[1], r = spec[2];
      var out = LN.h("output", { class: "chip cl-out" });
      outs[key] = { el: out, suffix: "" };
      var inp = LN.h("input", { type: "range", min: r[0], max: r[1], step: r[2],
        value: D[key], "aria-label": label });
      inp.addEventListener("input", function () {
        D[key] = parseFloat(inp.value);
        recalc();
      });
      outs[key].inp = inp;
      left.appendChild(LN.h("div", { class: "cl-ctl" }, [
        LN.h("label", { class: "cl-lab", text: label }), inp, out]));
    });

    /* ---- presets: the lesson's own three worked ventures ---- */
    var presets = d.presets || [];
    if (presets.length) {
      var row = LN.h("div", { class: "cl-presets" });
      presets.forEach(function (p) {
        row.appendChild(LN.h("button", { type: "button", text: p.label, onclick: function () {
          D.cost = LN.num(p.cost); D.cust = LN.num(p.cust);
          D.signups = (p.signups != null) ? LN.num(p.signups) : D.signups;
          ["cost", "cust", "signups"].forEach(function (k) { outs[k].inp.value = D[k]; });
          recalc();
        } }));
      });
      left.appendChild(LN.h("div", { class: "cl-ctl" }, [
        LN.h("label", { class: "cl-lab", text: txt("presets", "Lesson figures") }), row]));
    }
    left.appendChild(LN.h("div", { class: "cl-ctl" }, [
      LN.h("button", { type: "button", class: "chip", text: txt("reset", "Start over"),
        onclick: function () {
          D.cost = base.cost; D.cust = base.cust; D.signups = base.signups;
          ["cost", "cust", "signups"].forEach(function (k) { outs[k].inp.value = D[k]; });
          recalc();
        } })]));
    left.appendChild(LN.h("p", { class: "cl-note", text: txt("denomLine",
      "The denominator is new customers, not sign-ups.") }));

    /* ---- the cost bar: how the marketing peso splits across channels ---- */
    function draw() {
      svgBox.innerHTML = "";
      var W = 560, H = 128, L = 16, R = 16, T = 34, BAR = 48;
      var bw = W - L - R;
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "Composition of total marketing and sales cost across the listed channels" });
      function lab(x, y, str, cls, anchor) {
        var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "start", class: cls,
          fill: "var(--chart-label)" });
        t.textContent = str;
        return t;
      }
      var total = 0, i;
      var used = 0;
      for (i = 0; i < CH.length; i++) { if (LN.num(CH[i].cost) > 0) { used += LN.num(CH[i].cost); } }
      var rest = D.cost - used;
      var segs = [];
      for (i = 0; i < CH.length; i++) {
        if (LN.num(CH[i].cost) > 0) { segs.push({ name: CH[i].name, v: LN.num(CH[i].cost), col: CH[i].col }); }
      }
      if (rest > 0) { segs.push({ name: txt("other", "Unallocated"), v: rest, col: "var(--grid-strong)" }); }
      if (!segs.length) { segs.push({ name: txt("other", "Unallocated"), v: D.cost, col: "var(--grid-strong)" }); }
      total = segs.reduce(function (s, g) { return s + g.v; }, 0);
      var x = L;
      for (i = 0; i < segs.length; i++) {
        var w = (total > 0) ? (segs[i].v / total) * bw : 0;
        if (w <= 0) { continue; }
        svg.appendChild(LN.s("rect", { x: x, y: T, width: Math.max(0, w - 1.5), height: BAR,
          fill: segs[i].col, "fill-opacity": "0.88" }));
        if (w > 52) {
          var t = LN.s("text", { x: x + w / 2, y: T + 21, "text-anchor": "middle",
            class: "cl-tick", fill: "var(--surface)" });
          t.textContent = pct((segs[i].v / total) * 100);
          svg.appendChild(t);
        }
        x += w;
      }
      svg.appendChild(LN.s("rect", { x: L, y: T, width: bw, height: BAR, fill: "none",
        stroke: "var(--chart-axis)", "stroke-width": "1.2" }));
      svg.appendChild(lab(L, 18, txt("splitLine", "Share of the marketing and sales budget"), "cl-axis", "start"));
      svg.appendChild(lab(W - R, 18, money2(D.cost), "cl-axis", "end"));
      svg.appendChild(lab(L, T + BAR + 22, money2(0), "cl-tick", "start"));
      svg.appendChild(lab(W - R, T + BAR + 22, money2(total), "cl-tick", "end"));
      svgBox.appendChild(svg);
    }

    /* ---- per-channel attribution: the lesson's FitFlix table, live ---- */
    function drawTable() {
      tblBox.innerHTML = "";
      if (!CH.length) { return; }
      var best = null, i;
      for (i = 0; i < CH.length; i++) {
        var u = cac(CH[i].cost, CH[i].cust);
        if (isFinite(u) && (best === null || u < best)) { best = u; }
      }
      var tb = LN.h("tbody");
      for (i = 0; i < CH.length; i++) {
        var u2 = cac(CH[i].cost, CH[i].cust);
        var name = LN.h("td", { text: CH[i].name });
        var cc = LN.h("td", { text: money2(LN.num(CH[i].cost)) });
        var uu = LN.h("td", { text: isFinite(u2) ? money2(u2) : "\u2014" });
        var vv = LN.h("td", { text: money2(LN.num(CH[i].cust)) });
        var isBest = isFinite(u2) && isFinite(best) && Math.abs(u2 - best) < 1e-9;
        var mark = LN.h("span", { class: "cl-best", text: isBest ? txt("best", "most efficient") : "" });
        tb.appendChild(LN.h("tr", { class: isBest ? "hi" : "" }, [name, cc, uu, vv,
          LN.h("td", {}, [mark])]));
      }
      var head2 = LN.h("tr", {}, [
        LN.h("th", { text: txt("chName", "Channel") }),
        LN.h("th", { text: txt("chCost", "Channel cost") }),
        LN.h("th", { text: txt("chCac", "Cost per customer") }),
        LN.h("th", { text: txt("chCust", "Customers brought") }),
        LN.h("th", { text: txt("chRead", "Verdict") })]);
      tblBox.appendChild(LN.h("p", { class: "cl-lab", text: txt("attrTitle", "Attribution by channel") }));
      tblBox.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: txt("swipe", "swipe the table sideways \u2192") }),
        LN.h("table", { class: "tbl cl-attr" }, [LN.h("thead", {}, [head2]), tb])]));
    }

    /* ---- sensitivity: the lesson's own what-ifs, no invented ones ---- */
    function drawSens(baseCac) {
      sens.innerHTML = "";
      var scen = [
        [txt("scBase", "Base case"), cac(D.cost, D.cust)],
        [txt("scSignups", "If sign-ups were used as the denominator"), cac(D.cost, D.signups)],
        [txt("scCostUp", "Marketing and sales costs 10% higher"), cac(D.cost * 1.1, D.cust)],
        [txt("scCostDn", "Marketing and sales costs 10% lower"), cac(D.cost * 0.9, D.cust)],
        [txt("scCustUp", "10% more new customers"), cac(D.cost, D.cust * 1.1)],
        [txt("scCustDn", "10% fewer new customers"), cac(D.cost, D.cust * 0.9)]
      ];
      var head3 = LN.h("tr", {}, [
        LN.h("th", { text: txt("scCol", "Scenario") }),
        LN.h("th", { text: txt("cacOut", "Cost per customer") }),
        LN.h("th", { text: txt("delta", "Change vs base") })]);
      var tb3 = LN.h("tbody");
      scen.forEach(function (s, ix) {
        var v = s[1], d = (isFinite(v) && isFinite(baseCac)) ? v - baseCac : NaN;
        var cls = (ix === 0 || !isFinite(d) || Math.abs(d) < 0.005) ? "" : (d > 0 ? "up" : "down");
        var dc = LN.h("td", { class: "d" });
        dc.textContent = (ix === 0) ? txt("baseRow", "the base case")
          : (!isFinite(d) ? "\u2014" : ((d > 0 ? "+" : "\u2212") + money2(Math.abs(d))));
        tb3.appendChild(LN.h("tr", { class: cls }, [
          LN.h("td", { text: s[0] }),
          LN.h("td", { text: isFinite(v) ? money2(v) : "\u2014" }),
          dc]));
      });
      sens.appendChild(LN.h("p", { class: "cl-lab", text: txt("sensTitle", "Sensitivity") }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: txt("swipe", "swipe the table sideways \u2192") }),
        LN.h("table", { class: "tbl sens-tbl" }, [LN.h("thead", {}, [head3]), tb3])]));
    }

    function recalc() {
      var c = cac(D.cost, D.cust);
      var show = D.shown === null ? (isFinite(c) ? c : 0) : D.shown;
      LN.tween(show, isFinite(c) ? c : 0, 240, function (v) {
        head.innerHTML = "";
        head.appendChild(LN.h("span", { class: "cl-caption", text: txt("cacOut", "Cost per customer") }));
        head.appendChild(LN.h("span", { class: "cl-bigv", text: isFinite(c) ? money2(v) : "\u2014" }));
      });
      D.shown = isFinite(c) ? c : null;
      Object.keys(outs).forEach(function (k) {
        outs[k].el.textContent = (D[k] >= 0 ? "" : "-") + money2(Math.abs(D[k]));
      });

      read.innerHTML = "";
      var lines = [txt("needLine", "For every new customer won, this venture spent")];
      if (isFinite(c)) { lines.push(" " + money2(c) + "."); }
      read.appendChild(LN.h("div", { class: "fb info show", text: lines.join("") }));
      if (D.signups > D.cust && D.cust > 0) {
        var wrong = cac(D.cost, D.signups);
        read.appendChild(LN.h("div", { class: "fb warn show",
          text: txt("trapLine", "Counting sign-ups instead of buyers would report") + " "
            + (isFinite(wrong) ? money2(wrong) : "\u2014") + " "
            + txt("trapWas", "instead of") + " " + money2(c) + " \u2014 "
            + txt("trapEnd", "a vanity number, not a customer.") }));
      }
      if (isFinite(c) && D.cust > 0) {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("revLine", "At this cost, every peso returned on a first purchase covers")
            + " " + money2(1 / c) + " " + txt("revWas", "of acquisition cost.") }));
      }

      draw();
      drawTable();
      drawSens(c);
    }

    root.appendChild(wrap);
    recalc();
  }
};
