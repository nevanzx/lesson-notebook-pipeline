/* cost-lab - the short-run cost matrix, live.
   Data: LN.data.<key> = { money, unit, tfc, rows:[tvc at q=1..n], ranges:{tfc:[min,max,step]} }
   The student moves fixed cost and edits the variable-cost schedule; the lab rebuilds
   TC, MC, AFC, AVC and ATC, plots the four curves, names the cheapest output level, and
   swings fixed cost and the next unit's cost by 10% to show how the efficient scale moves. */
LN.components["cost-lab"] = {
  init: function (root, d) {
    var money = d.money || "$";
    var unit = d.unit || "units";
    var baseTfc = LN.num(d.tfc) || 0;
    var baseTvc = (d.rows || []).map(function (v) { return LN.num(v); });
    var n = baseTvc.length;
    if (!n) { root.appendChild(LN.h("div", { class: "cl-empty", text: "This schedule has no output levels yet." })); return; }
    var rr = (d.ranges && d.ranges.tfc) || [0, 500, 10];
    var D = { tfc: baseTfc, tvc: baseTvc.slice(), shownTfc: null };

    function m(v) { return money + f2(v); }
    function f2(v) {
      if (!isFinite(v)) { return "\u2014"; }
      var s = (Math.abs(v) % 1 === 0) ? String(Math.round(v)) : v.toFixed(2);
      var neg = s.charAt(0) === "-";
      if (neg) { s = s.slice(1); }
      s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (neg ? "-" : "") + s;
    }
    function dash(v) { return (v === null || v === undefined || !isFinite(v)) ? "\u2014" : f2(v); }
    function niceMax(v) {
      if (!(v > 0)) { return 10; }
      var e = Math.pow(10, Math.floor(Math.log10(v))), x = v / e;
      var step = x <= 1 ? 1 : x <= 1.5 ? 1.5 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 3 ? 3
        : x <= 4 ? 4 : x <= 5 ? 5 : x <= 7.5 ? 7.5 : 10;
      return step * e;
    }
    function compute(tfc, tvc) {
      var out = [], i;
      for (i = 0; i < tvc.length; i++) {
        var q = i + 1, tv = tvc[i], tc = tfc + tv;
        out.push({ q: q, tfc: tfc, tvc: tv, tc: tc, mc: tv - (i === 0 ? 0 : tvc[i - 1]),
                   afc: tfc / q, avc: tv / q, atc: tc / q });
      }
      return out;
    }
    function lowest(rows, key) {
      var best = null;
      rows.forEach(function (r) {
        if (best === null || r[key] < best[key] - 1e-9) { best = r; }
      });
      return best;
    }
    function crossing(rows, key) {
      for (var i = 0; i < rows.length; i++) { if (rows[i].mc > rows[i][key]) { return rows[i].q; } }
      return null;
    }

    var wrap = LN.h("div", { class: "ln-comp costlab" });
    var left = LN.h("div", { class: "cl-left" });
    var right = LN.h("div", { class: "cl-right" });
    var svgBox = LN.h("div", { class: "cl-svg" });
    var strip = LN.h("div", { class: "cl-strip" });
    var read = LN.h("div", { class: "cl-read" });
    var matrix = LN.h("div", { class: "cl-matrix" });
    var sens = LN.h("div", { class: "cl-sens" });
    right.appendChild(svgBox); right.appendChild(strip);
    right.appendChild(read); right.appendChild(matrix); right.appendChild(sens);

    var tfcOut = LN.h("output", { class: "chip cl-out" });
    var tfcIn = LN.h("input", { type: "range", min: rr[0], max: rr[1], step: rr[2],
      value: D.tfc, "aria-label": "Total fixed cost" });
    tfcIn.addEventListener("input", function () { D.tfc = parseFloat(tfcIn.value); recalc(); });
    left.appendChild(LN.h("div", { class: "cl-ctl" }, [
      LN.h("label", { class: "cl-lab", text: "Total fixed cost (TFC)" }), tfcIn, tfcOut]));

    var grid = LN.h("div", { class: "cl-rows" });
    var rowIns = [];
    baseTvc.forEach(function (v, i) {
      var inp = LN.h("input", { type: "text", inputmode: "decimal", value: f2(v),
        "aria-label": "Variable cost at " + (i + 1) + " " + unit });
      inp.addEventListener("input", function () {
        var x = LN.num(inp.value);
        D.tvc[i] = isNaN(x) ? NaN : x;
        recalc();
      });
      rowIns.push(inp);
      grid.appendChild(LN.h("span", { class: "cl-q", text: "q = " + (i + 1) }));
      grid.appendChild(inp);
    });
    left.appendChild(LN.h("div", { class: "cl-ctl" }, [
      LN.h("label", { class: "cl-lab", text: "Variable cost (TVC) at each output level" }), grid]));
    var reset = LN.h("button", { type: "button", class: "chip", text: "Reset to the lesson's schedule",
      onclick: function () {
        D.tfc = baseTfc; D.tvc = baseTvc.slice(); tfcIn.value = baseTfc;
        rowIns.forEach(function (inp, i) { inp.value = f2(baseTvc[i]); });
        recalc();
      } });
    left.appendChild(LN.h("div", { class: "cl-ctl" }, [
      LN.h("label", { class: "cl-lab", text: "Start over" }), reset]));

    function txt(x, y, str, cls, anchor) {
      var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "middle", class: cls || "cl-tick",
        fill: "var(--chart-label)" });
      t.textContent = str;
      return t;
    }
    function line(x1, y1, x2, y2, stroke, w, dash) {
      var a = { x1: x1, y1: y1, x2: x2, y2: y2, stroke: stroke, "stroke-width": w || 1.6 };
      if (dash) { a["stroke-dasharray"] = dash; }
      return LN.s("line", a);
    }
    function path(rows, key, sx, sy) {
      var pts = rows.map(function (r) { return sx(r.q) + "," + sy(r[key]); });
      return LN.s("polyline", { points: pts.join(" "), fill: "none", "stroke-width": 2.6,
        "stroke-linejoin": "round", "stroke-linecap": "round" });
    }
    function draw(rows, atcMin, avcMin) {
      svgBox.innerHTML = "";
      var W = 560, H = 340, L = 74, R = 20, T = 40, B = 52;
      var hi = 0;
      rows.forEach(function (r) { hi = Math.max(hi, r.mc, r.atc, r.avc, r.afc); });
      var yMax = niceMax(hi);
      var xMax = n;
      function sx(q) { return L + ((q - 1) / Math.max(1, xMax - 1)) * (W - L - R); }
      function sy(y) { return H - B - (y / yMax) * (H - B - T); }
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "Short-run cost curves: marginal cost, average total cost, average variable cost and average fixed cost against output" });
      var i;
      for (i = 0; i <= 5; i++) {
        var gx = L + (i / 5) * (W - L - R), gy = sy(yMax * i / 5);
        svg.appendChild(line(gx, T, gx, H - B, "var(--chart-grid)", 1));
        svg.appendChild(line(L, gy, W - R, gy, "var(--chart-grid)", 1));
        if (i < 5) { svg.appendChild(txt(L + (i / 5) * (W - L - R), H - B + 16, String(Math.round(xMax * i / 5) + 1))); }
        svg.appendChild(txt(L - 6, gy + 4, m(yMax * i / 5), "cl-tick", "end"));
      }
      var afcP = path(rows, "afc", sx, sy);
      afcP.setAttribute("stroke", "var(--ink-faint)");
      afcP.setAttribute("stroke-dasharray", "5 4");
      afcP.setAttribute("stroke-width", "2");
      svg.appendChild(afcP);
      var avcP = path(rows, "avc", sx, sy); avcP.setAttribute("stroke", "var(--chart-profit)");
      svg.appendChild(avcP);
      var atcP = path(rows, "atc", sx, sy); atcP.setAttribute("stroke", "var(--chart-cost)");
      svg.appendChild(atcP);
      var mcP = path(rows, "mc", sx, sy); mcP.setAttribute("stroke", "var(--chart-rev)");
      svg.appendChild(mcP);
      [[avcMin, "var(--chart-profit)", "AVC min"], [atcMin, "var(--chart-cost)", "ATC min"]].forEach(function (p) {
        if (!p[0]) { return; }
        var cx = sx(p[0].q), cy = sy(p[0].atc !== undefined ? p[0].atc : p[0].avc);
        svg.appendChild(LN.s("circle", { cx: cx, cy: cy, r: 4.5, fill: p[1] }));
        svg.appendChild(txt(cx + 8, cy - 6, p[2], "cl-legend", "start"));
      });
      svg.appendChild(line(L, H - B, W - R, H - B, "var(--chart-axis)", 1.6));
      svg.appendChild(line(L, T, L, H - B, "var(--chart-axis)", 1.6));
      svg.appendChild(txt((L + W - R) / 2, H - 12, "Output q (" + unit + ")", "cl-axis"));
      var yt = LN.s("text", { x: 16, y: (T + H - B) / 2, "text-anchor": "middle", fill: "var(--chart-label)",
        class: "cl-axis", transform: "rotate(-90 16 " + ((T + H - B) / 2) + ")" });
      yt.textContent = money + " per unit";
      svg.appendChild(yt);
      var leg = [["MC", "var(--chart-rev)"], ["ATC", "var(--chart-cost)"],
                 ["AVC", "var(--chart-profit)"], ["AFC", "var(--ink-faint)"]];
      leg.forEach(function (g, k) {
        var lx = L + 6 + k * 74;
        svg.appendChild(line(lx, T - 20, lx + 22, T - 20, g[1], 2.6,
          g[0] === "AFC" ? "5 4" : null));
        svg.appendChild(txt(lx + 27, T - 16, g[0], "cl-legend", "start"));
      });
      svgBox.appendChild(svg);
    }
    function drawMatrix(rows, atcMin, avcMin) {
      matrix.innerHTML = "";
      var head = LN.h("tr", {}, [LN.h("th", { text: "q" }), LN.h("th", { text: "TFC" }),
        LN.h("th", { text: "TVC" }), LN.h("th", { text: "TC" }), LN.h("th", { text: "MC" }),
        LN.h("th", { text: "AFC" }), LN.h("th", { text: "AVC" }), LN.h("th", { text: "ATC" })]);
      var tb = LN.h("tbody");
      var zero = LN.h("tr", {}, [LN.h("td", { text: "0" }), LN.h("td", { text: f2(D.tfc) }),
        LN.h("td", { text: "0" }), LN.h("td", { text: f2(D.tfc) }),
        LN.h("td", { text: "\u2014" }), LN.h("td", { text: "\u2014" }),
        LN.h("td", { text: "\u2014" }), LN.h("td", { text: "\u2014" })]);
      tb.appendChild(zero);
      rows.forEach(function (r) {
        var cls = [];
        if (atcMin && r.q === atcMin.q) { cls.push("cl-min"); }
        tb.appendChild(LN.h("tr", { class: cls.join(" ") }, [
          LN.h("td", { text: String(r.q) }), LN.h("td", { text: f2(r.tfc) }),
          LN.h("td", { text: f2(r.tvc) }), LN.h("td", { text: f2(r.tc) }),
          LN.h("td", { text: f2(r.mc) }), LN.h("td", { text: f2(r.afc) }),
          LN.h("td", { text: f2(r.avc) }), LN.h("td", { text: f2(r.atc) })]));
      });
      matrix.appendChild(LN.h("p", { class: "cl-lab", text: "The cost matrix" }));
      matrix.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: "swipe the table sideways \u2192" }),
        LN.h("table", { class: "tbl" }, [LN.h("thead", {}, [head]), tb])]));
      if (avcMin) {
        matrix.appendChild(LN.h("p", { class: "cl-note", text: "" }));
        matrix.lastChild.textContent = "Highlighted row: average total cost is lowest here. "
          + "Average variable cost is lowest at " + avcMin.q + " " + unit + " (" + m(avcMin.avc) + ").";
      }
    }
    function drawSens(rows, atcMin) {
      sens.innerHTML = "";
      var nextQ = Math.min(atcMin.q + 1, n);
      function bump(f) { var c = D.tvc.slice(); c[nextQ - 1] = c[nextQ - 1] * f; return c; }
      var scen = [["Base case", D.tfc, D.tvc.slice()],
                  ["Fixed cost \u221210%", D.tfc * 0.9, D.tvc.slice()],
                  ["Fixed cost +10%", D.tfc * 1.1, D.tvc.slice()],
                  ["Unit " + nextQ + " cost \u221210%", D.tfc, bump(0.9)],
                  ["Unit " + nextQ + " cost +10%", D.tfc, bump(1.1)]];
      var head = LN.h("tr", {}, [LN.h("th", { text: "Scenario" }), LN.h("th", { text: "Cheapest level" }),
        LN.h("th", { text: "ATC there" }), LN.h("th", { text: "\u0394 vs base" })]);
      var tb = LN.h("tbody");
      scen.forEach(function (s) {
        var rs = compute(s[1], s[2]), lo = lowest(rs, "atc");
        var d = lo.atc - atcMin.atc;
        var cls = Math.abs(d) < 0.005 ? "" : (d > 0 ? "cl-up" : "cl-down");
        tb.appendChild(LN.h("tr", { class: cls }, [
          LN.h("td", { text: s[0] }),
          LN.h("td", { text: lo.q + " " + unit }),
          LN.h("td", { text: m(lo.atc) }),
          LN.h("td", { text: (Math.abs(d) < 0.005 ? "" : (d > 0 ? "+" : "\u2212")) + m(Math.abs(d)) })]));
      });
      sens.appendChild(LN.h("p", { class: "cl-lab", text: "Sensitivity: 10% swings around the base case" }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("table", { class: "tbl" }, [LN.h("thead", {}, [head]), tb])]));
    }
    function recalc() {
      LN.tween(D.shownTfc === null ? D.tfc : D.shownTfc, D.tfc, 220, function (v) {
        tfcOut.textContent = m(v) + " at every output level";
      });
      D.shownTfc = D.tfc;
      var bad = false;
      D.tvc.forEach(function (v) { if (isNaN(v)) { bad = true; } });
      if (bad) {
        svgBox.innerHTML = ""; strip.innerHTML = ""; read.innerHTML = "";
        matrix.innerHTML = ""; sens.innerHTML = "";
        svgBox.appendChild(LN.h("div", { class: "cl-empty",
          text: "Every output level needs a variable cost before the matrix can be built." }));
        return;
      }
      var rows = compute(D.tfc, D.tvc);
      var atcMin = lowest(rows, "atc"), avcMin = lowest(rows, "avc");
      draw(rows, atcMin, avcMin);
      strip.innerHTML = "";
      [["Cheapest level", atcMin.q + " " + unit], ["Lowest ATC", m(atcMin.atc)],
       ["Lowest AVC", avcMin.q + " " + unit + " at " + m(avcMin.avc)],
       ["Last unit adds", m(rows[n - 1].mc)]].forEach(function (c) {
        strip.appendChild(LN.h("span", { class: "chip", text: c[0] + "  " + c[1] }));
      });
      read.innerHTML = "";
      read.appendChild(LN.h("div", { class: "fb info show", text:
        "Average total cost is lowest at " + atcMin.q + " " + unit + ", at " + m(atcMin.atc)
        + " per unit. That is the efficient scale of production \u2014 the point where marginal"
        + " cost meets average total cost, so per-unit cost is as low as this plant gets." }));
      if (n >= 2) {
        var last = rows[n - 1].mc, prev = rows[n - 2].mc;
        read.appendChild(LN.h("div", { class: "fb info show", text: last > prev
          ? "Marginal cost is climbing: the last unit added " + m(last) + " while the unit before it"
            + " added " + m(prev) + ". Every extra unit now costs more than the one before it."
          : "Marginal cost is still falling: the last unit added " + m(last) + " against " + m(prev)
            + " for the unit before it, so the fixed setup is still being used more efficiently." }));
      }
      var cAv = crossing(rows, "avc"), cAt = crossing(rows, "atc");
      if (cAv && cAt) {
        read.appendChild(LN.h("div", { class: "fb info show", text:
          "Marginal cost passes average variable cost between " + (cAv - 1) + " and " + cAv + " "
          + unit + ", where average variable cost stops falling; it reaches average total cost later,"
          + " between " + (cAt - 1) + " and " + cAt + "." }));
      }
      drawMatrix(rows, atcMin, avcMin);
      drawSens(rows, atcMin);
    }
    wrap.appendChild(left); wrap.appendChild(right);
    root.appendChild(wrap);
    recalc();
  }
};
