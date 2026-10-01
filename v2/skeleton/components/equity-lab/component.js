/* equity-lab - the weighted co-founder equity split, live.

   The lesson's formula:
     Ei = (Ci x Ti) / SUM over j of (Cj x Tj)
   where Ci is the money value of founder i's contribution and Ti their time
   commitment factor (1.0 full-time, 0.5 half-time, ...). The lab also applies
   the lesson's vesting schedule - a four-year vesting with a one-year cliff, so
   25% vests at the cliff and the remaining 75% vests monthly over the next
   three years - and shows, per founder, how much of the calculated stake has
   actually vested at a given elapsed time, and how much returns to the pool.

   Data: LN.data.<key> = {
     money, copy:{...all wording},
     init: { founders: [{name, c, t}], vest: { total, cliff, elapsed: [..] } },
     ranges: { c: [min,max,step], t: [min,max,step], elapsed: [min,max,step] },
     presets: [{ label, founders: [{name,c,t}], elapsed: [..] }]
   }
   All wording comes from data.js; this file carries no content strings. */
LN.components["equity-lab"] = {
  init: function (root, d) {
    var money = d.money || "$";
    var C = d.copy || {};
    function txt(k, fallback) { return (C[k] != null) ? C[k] : fallback; }

    var R = d.ranges || {};
    function rng(k, dflt) { return R[k] || dflt; }
    var rc = rng("c", [0, 200000, 1000]);
    var rt = rng("t", [0, 1, 0.25]);
    var re = rng("elapsed", [0, 5, 0.25]);

    var base = (d.init && d.init.founders) || [];
    var vest = (d.init && d.init.vest) || {};
    var TOTAL = LN.num(vest.total) || 4;
    var CLIFF = LN.num(vest.cliff) || 1;
    var baseElapsed = (vest.elapsed || []).map(function (v) { return LN.num(v); });

    var F = base.map(function (f) { return { name: f.name, c: LN.num(f.c) || 0, t: LN.num(f.t) || 0 }; });
    var E = F.map(function (f, i) {
      return (baseElapsed[i] != null) ? baseElapsed[i] : TOTAL;
    });

    function f2(v) {
      if (!isFinite(v)) { return "\u2014"; }
      var s = (Math.abs(v) % 1 === 0) ? String(Math.round(v)) : v.toFixed(2);
      var neg = s.charAt(0) === "-";
      if (neg) { s = s.slice(1); }
      s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (neg ? "-" : "") + s;
    }
    function money2(v) { return money + f2(v); }
    function pct(v) { return (Math.abs(v) < 0.0005) ? "0%" : (Math.round(v * 10) / 10) + "%"; }

    /* the formula, exactly as the lesson states it */
    function score(f) { return f.c * f.t; }
    function total() {
      return F.reduce(function (s, f) { return s + score(f); }, 0);
    }
    function share(f) {
      var t = total();
      return (t > 0) ? score(f) / t : NaN;
    }

    /* the lesson's vesting schedule: nothing before the cliff, cliff share at
       the cliff, then the remainder linearly to fully vested at `total` years */
    function vestedFraction(e) {
      if (!(TOTAL > 0)) { return 0; }
      if (e <= CLIFF) { return 0; }
      var atCliff = CLIFF / TOTAL;
      var span = TOTAL - CLIFF;
      if (span <= 0) { return 1; }
      var k = (e - CLIFF) / span;
      if (k > 1) { k = 1; }
      return atCliff + k * (1 - atCliff);
    }
    function vestedOf(f) {
      var s = share(f);
      return isFinite(s) ? s * vestedFraction(E[indexOf(f)]) : NaN;
    }
    function indexOf(f) { return F.indexOf(f); }

    var wrap = LN.h("div", { class: "ln-el" });
    var left = LN.h("div", { class: "el-left" });
    var right = LN.h("div", { class: "el-right" });
    var head = LN.h("div", { class: "el-head" });
    var chart = LN.h("div", { class: "el-chart" });
    var tbl = LN.h("div", { class: "el-tbl" });
    var vestBox = LN.h("div", { class: "el-vest" });
    var read = LN.h("div", { class: "el-read" });
    right.appendChild(head);
    right.appendChild(chart);
    right.appendChild(tbl);
    right.appendChild(vestBox);
    right.appendChild(read);
    wrap.appendChild(left);
    wrap.appendChild(right);

    /* ---- controls: contribution and time factor per founder ---- */
    var ctl = {};
    F.forEach(function (f, i) {
      var box = LN.h("div", { class: "el-ctl" });
      var nameTag = LN.h("span", { class: "el-name", text: f.name });
      box.appendChild(nameTag);
      var oc = LN.h("output", { class: "chip el-out" });
      var ic = LN.h("input", { type: "range", min: rc[0], max: rc[1], step: rc[2],
        value: f.c, "aria-label": txt("contrib", "Contribution value") + " - " + f.name });
      ic.addEventListener("input", function () { f.c = parseFloat(ic.value); recalc(); });
      box.appendChild(LN.h("label", { class: "el-lab", text: txt("contrib", "Contribution value") }));
      box.appendChild(ic);
      box.appendChild(oc);
      var ot = LN.h("output", { class: "chip el-out" });
      var it = LN.h("input", { type: "range", min: rt[0], max: rt[1], step: rt[2],
        value: f.t, "aria-label": txt("time", "Time commitment factor") + " - " + f.name });
      it.addEventListener("input", function () { f.t = parseFloat(it.value); recalc(); });
      box.appendChild(LN.h("label", { class: "el-lab", text: txt("time", "Time commitment factor") }));
      box.appendChild(it);
      box.appendChild(ot);
      left.appendChild(box);
      ctl[i] = { c: ic, t: it, oc: oc, ot: ot };
    });

    /* ---- vesting controls: built ONCE, so dragging a time-served slider is not
       interrupted when recalc() refreshes the numbers beneath it ---- */
    vestBox.appendChild(LN.h("p", { class: "el-lab",
      text: txt("vestTitle", "Vesting: what has actually vested") }));
    vestBox.appendChild(LN.h("p", { class: "el-note",
      text: txt("vestRule", "Nothing vests before the cliff; at the cliff the cliff share vests, "
        + "and the rest vests evenly to the end of the schedule.") }));
    F.forEach(function (f, i) {
      var box = LN.h("div", { class: "el-vestrow" });
      var out = LN.h("output", { class: "chip el-out" });
      var inp = LN.h("input", { type: "range", min: re[0], max: re[1], step: re[2],
        value: E[i], "aria-label": txt("vElapsed", "Time served") + " - " + f.name });
      inp.addEventListener("input", function () { E[i] = parseFloat(inp.value); recalc(); });
      ctl[i].e = inp;
      ctl[i].eo = out;
      box.appendChild(LN.h("span", { class: "el-name", text: f.name }));
      box.appendChild(inp);
      box.appendChild(out);
      vestBox.appendChild(box);
    });
    var vestTbl = LN.h("div", { class: "el-vesttblbox" });
    vestBox.appendChild(vestTbl);

    /* ---- presets: the lesson's own two worked splits ---- */
    var presets = d.presets || [];
    if (presets.length) {
      var row = LN.h("div", { class: "el-presets" });
      presets.forEach(function (p) {
        row.appendChild(LN.h("button", { type: "button", text: p.label, onclick: function () {
          F.forEach(function (f, i) {
            var g = (p.founders || [])[i];
            if (!g) { return; }
            if (g.name) { f.name = g.name; }
            f.c = LN.num(g.c); f.t = LN.num(g.t);
            ctl[i].c.value = f.c; ctl[i].t.value = f.t;
          });
          (p.elapsed || []).forEach(function (v, i) { E[i] = LN.num(v); });
          F.forEach(function (f, i) {
            if (ctl[i].e) { ctl[i].e.value = E[i]; }
          });
          recalc();
        } }));
      });
      left.appendChild(LN.h("div", { class: "el-ctl" }, [
        LN.h("label", { class: "el-lab", text: txt("presets", "Lesson figures") }), row]));
    }
    left.appendChild(LN.h("div", { class: "el-ctl" }, [
      LN.h("button", { type: "button", class: "chip", text: txt("reset", "Start over"),
        onclick: function () {
          F.forEach(function (f, i) {
            var b = base[i] || {};
            f.name = b.name || f.name;
            f.c = LN.num(b.c) || 0; f.t = LN.num(b.t) || 0;
            E[i] = (baseElapsed[i] != null) ? baseElapsed[i] : TOTAL;
            ctl[i].c.value = f.c; ctl[i].t.value = f.t;
            if (ctl[i].e) { ctl[i].e.value = E[i]; }
          });
          recalc();
        } })]));

    /* ---- the split, drawn ---- */
    function drawChart() {
      chart.innerHTML = "";
      var W = 560, H = 116, L = 14, R = 14, T = 30, BAR = 46;
      var bw = W - L - R;
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "Each co-founder's share of the weighted equity split" });
      function lab(x, y, str, cls, anchor) {
        var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "start", class: cls,
          fill: "var(--chart-label)" });
        t.textContent = str;
        return t;
      }
      var cols = ["var(--chart-rev)", "var(--chart-cost)", "var(--chart-profit)",
                  "var(--chart-loss)"];
      var x = L;
      F.forEach(function (f, i) {
        var s = share(f);
        if (!isFinite(s) || s <= 0) { return; }
        var w = s * bw;
        svg.appendChild(LN.s("rect", { x: x, y: T, width: Math.max(0, w - 1.5), height: BAR,
          fill: cols[i % cols.length], "fill-opacity": "0.88" }));
        if (w > 46) {
          var t = LN.s("text", { x: x + w / 2, y: T + 20, "text-anchor": "middle",
            class: "el-tick", fill: "var(--surface)" });
          t.textContent = pct(s * 100);
          svg.appendChild(t);
        }
        x += w;
      });
      svg.appendChild(LN.s("rect", { x: L, y: T, width: bw, height: BAR, fill: "none",
        stroke: "var(--chart-axis)", "stroke-width": "1.2" }));
      svg.appendChild(lab(L, 16, txt("splitLine", "Share of the company"), "el-axis", "start"));
      svg.appendChild(lab(W - R, 16, txt("hundred", "100%"), "el-axis", "end"));
      chart.appendChild(svg);
    }

    /* ---- the arithmetic, named and valued (never hue alone) ---- */
    function drawTable() {
      tbl.innerHTML = "";
      var t = total();
      var head2 = LN.h("tr", {}, [
        LN.h("th", { text: txt("fName", "Co-founder") }),
        LN.h("th", { text: txt("fContrib", "Contribution") }),
        LN.h("th", { text: txt("fTime", "Time factor") }),
        LN.h("th", { text: txt("fScore", "Weighted score") }),
        LN.h("th", { text: txt("fShare", "Equity share") })]);
      var tb = LN.h("tbody");
      F.forEach(function (f) {
        var s = share(f);
        tb.appendChild(LN.h("tr", {}, [
          LN.h("td", { text: f.name }),
          LN.h("td", { text: money2(f.c) }),
          LN.h("td", { text: f2(f.t) }),
          LN.h("td", { text: money2(score(f)) }),
          LN.h("td", { text: isFinite(s) ? pct(s * 100) : "\u2014" })]));
      });
      tb.appendChild(LN.h("tr", { class: "tot" }, [
        LN.h("td", { text: txt("totalRow", "Total") }),
        LN.h("td", { text: "" }),
        LN.h("td", { text: "" }),
        LN.h("td", { text: money2(t) }),
        LN.h("td", { text: t > 0 ? pct(100) : "\u2014" })]));
      tbl.appendChild(LN.h("p", { class: "el-lab", text: txt("calcTitle", "The weighted split") }));
      tbl.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: txt("swipe", "swipe the table sideways \u2192") }),
        LN.h("table", { class: "tbl el-calc" }, [LN.h("thead", {}, [head2]), tb])]));
    }

    /* ---- the vesting table, with the cliff doing its work. The sliders are
       built once above; this only refreshes the computed numbers. ---- */
    function drawVesting() {
      vestTbl.innerHTML = "";
      var head3 = LN.h("tr", {}, [
        LN.h("th", { text: txt("vName", "Co-founder") }),
        LN.h("th", { text: txt("vElapsed", "Time served") }),
        LN.h("th", { text: txt("vPct", "Share vested") }),
        LN.h("th", { text: txt("vKept", "Equity kept") }),
        LN.h("th", { text: txt("vBack", "Returned to the pool") })]);
      var tb3 = LN.h("tbody");

      F.forEach(function (f, i) {
        var frac = vestedFraction(E[i]);
        var s = share(f);
        var kept = isFinite(s) ? s * frac : NaN;
        var back = isFinite(s) ? s - kept : NaN;
        tb3.appendChild(LN.h("tr", { class: frac <= 0 ? "hi" : "" }, [
          LN.h("td", { text: f.name }),
          LN.h("td", { text: f2(E[i]) + " " + txt("years", "years") }),
          LN.h("td", { text: pct(frac * 100) }),
          LN.h("td", { text: isFinite(kept) ? pct(kept * 100) : "\u2014" }),
          LN.h("td", { text: isFinite(back) ? pct(back * 100) : "\u2014" })]));
      });

      vestTbl.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: txt("swipe", "swipe the table sideways \u2192") }),
        LN.h("table", { class: "tbl el-vesttbl" }, [LN.h("thead", {}, [head3]), tb3])]));
    }

    function recalc() {
      var t = total();
      head.innerHTML = "";
      head.appendChild(LN.h("span", { class: "el-caption", text: txt("totalScore", "Total weighted score") }));
      head.appendChild(LN.h("span", { class: "el-bigv", text: money2(t) }));

      F.forEach(function (f, i) {
        ctl[i].oc.textContent = money2(f.c);
        ctl[i].ot.textContent = f2(f.t);
        if (ctl[i].eo) { ctl[i].eo.textContent = f2(E[i]) + " " + txt("years", "years"); }
      });

      read.innerHTML = "";
      read.appendChild(LN.h("div", { class: "fb info show",
        text: txt("sumLine", "Every share is this founder's weighted score divided by the total, "
          + "so the shares always add to 100 percent.") }));
      var below = F.filter(function (f) { return f.t > 0 && f.t < 1; });
      if (below.length) {
        read.appendChild(LN.h("div", { class: "fb warn show",
          text: txt("partTimeLine", "A part-time founder's contribution is scaled by the time "
            + "factor, so the same money buys a smaller share than it would at full time.") }));
      }
      var noneVested = F.filter(function (f, i) { return E[i] <= CLIFF; });
      if (noneVested.length === F.length && F.length) {
        read.appendChild(LN.h("div", { class: "fb warn show",
          text: txt("cliffLine", "Nobody is past the cliff yet, so every share is still "
            + "unvested and would return to the pool if a founder left today.") }));
      }

      drawChart();
      drawTable();
      drawVesting();
    }

    root.appendChild(wrap);
    recalc();
  }
};
