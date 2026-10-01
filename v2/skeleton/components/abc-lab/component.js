/* abc-lab — the activity-based costing allocation lab, live.

   The lesson's two formulas:
     Activity Rate = Total Cost in the Activity Pool / Total Volume of the Cost Driver
     Overhead Assigned to a Product = Activity Rate x Driver Volume Used by the Product

   The lab holds every number the lesson's worked example holds: for each
   activity cost pool the pool cost and the total driver volume, and for each
   product the driver volume it consumes plus its direct costs and revenue.
   Rates, allocations, total overhead, total cost and operating income all
   recompute live, and the two checks ABC depends on are shown on the face:
   the products' driver volumes must add up to the pool's total volume, and the
   allocated overhead must add up to the pool cost.

   Data: LN.data.<key> = {
     money: "$",
     copy: {...all wording...},
     products: ["Standard", "Custom"],
     pools: [{ name, driver, cost, total, vols:[per product] }, ...],
     direct:  [per product],
     revenue: [per product]
   }
   All wording comes from data.js; this file carries no content strings. */
LN.components["abc-lab"] = {
  init: function (root, d) {
    var money = d.money || "$";
    var C = d.copy || {};
    function txt(k, fallback) { return (C[k] != null) ? C[k] : fallback; }
    function num(v) {
      var n = parseFloat(String(v).replace(/[,$\s%]/g, ""));
      return (isNaN(n) || n < 0) ? 0 : n;
    }
    function f2(v) {
      if (!isFinite(v)) { return "\u2014"; }
      var s = (Math.abs(v) % 1 === 0) ? String(Math.round(v)) : v.toFixed(2);
      var neg = s.charAt(0) === "-";
      if (neg) { s = s.slice(1); }
      s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return (neg ? "-" : "") + s;
    }
    function m0(v) { return money + f2(v); }
    function k0(v) {
      var a = Math.abs(v);
      if (a >= 1000000) { return money + f2(Math.round(v / 10000) / 100) + "M"; }
      if (a >= 1000) { return money + f2(Math.round(v / 100) / 100) + "k"; }
      return m0(v);
    }

    var prods = (d.products || []).map(function (s) { return String(s); });
    var NP = Math.max(1, prods.length);
    var P = (d.pools || []).map(function (p) {
      var vols = (p.vols || []).map(function (v) { return num(v); });
      while (vols.length < NP) { vols.push(0); }
      return { name: String(p.name), driver: String(p.driver),
        cost: num(p.cost), total: num(p.total), vols: vols, ui: null };
    });
    var DIRECT = (d.direct || []).map(function (v) { return num(v); });
    var REVENUE = (d.revenue || []).map(function (v) { return num(v); });
    while (DIRECT.length < NP) { DIRECT.push(0); }
    while (REVENUE.length < NP) { REVENUE.push(0); }
    var CHART_COLS = ["var(--chart-rev)", "var(--chart-cost)", "var(--chart-profit)", "var(--chart-axis)"];

    /* ---------- the lesson's arithmetic, term by term ---------- */
    function calc() {
      var rows = [], oh = [], tc = [], op = [], poolTotal = 0, i, k;
      for (i = 0; i < P.length; i++) {
        var rate = P[i].total > 0 ? P[i].cost / P[i].total : 0;
        var alloc = [], used = 0;
        for (k = 0; k < NP; k++) { alloc[k] = P[i].vols[k] * rate; used += P[i].vols[k]; }
        var assigned = 0;
        for (k = 0; k < NP; k++) { assigned += alloc[k]; }
        poolTotal += P[i].cost;
        rows.push({ pool: P[i], rate: rate, alloc: alloc, used: used,
          mismatch: used - P[i].total, left: P[i].cost - assigned });
      }
      for (k = 0; k < NP; k++) {
        var sum = 0;
        for (i = 0; i < rows.length; i++) { sum += rows[i].alloc[k]; }
        oh[k] = sum;
        tc[k] = DIRECT[k] + sum;
        op[k] = REVENUE[k] - tc[k];
      }
      return { rows: rows, oh: oh, tc: tc, op: op, poolTotal: poolTotal };
    }

    /* ---------- the allocation table ---------- */
    var ui = { rate: [], check: [], alloc: [], oh: [], dc: [], rev: [], op: [] };
    var tableBox = LN.h("div", { class: "al-grid" });

    function cell(v, label, cls, onedit) {
      var inp = LN.h("input", { type: "number", min: "0", step: "any", value: String(v),
        class: cls, "aria-label": label });
      inp.addEventListener("input", function () { onedit(); recalc(); });
      return inp;
    }
    function blankRow(label, cls) {
      var tr = LN.h("tr", { class: cls || "" }, [LN.h("th", { scope: "row", text: label })]);
      var n = 1 + 2 + 2 * NP + 2;
      for (var i = 1; i < n; i++) { tr.appendChild(LN.h("td", { class: "al-sum" })); }
      return tr;
    }

    (function buildTable() {
      var h1 = LN.h("tr", {}, [
        LN.h("th", { class: "al-grp", colspan: 3, text: txt("grpPool", "Activity cost pool inputs") })
      ]);
      for (var k = 0; k < NP; k++) {
        h1.appendChild(LN.h("th", { class: "al-grp", colspan: 2, text: prods[k] }));
      }
      h1.appendChild(LN.h("th", { class: "al-grp", colspan: 2, text: txt("grpRate", "Activity rate") }));
      var h2 = LN.h("tr", {}, [
        LN.h("th", { class: "al-sub", text: txt("colPool", "Activity cost pool") }),
        LN.h("th", { class: "al-sub", text: txt("colCost", "Pool cost") }),
        LN.h("th", { class: "al-sub", text: txt("colTotal", "Total driver volume") })
      ]);
      for (var k2 = 0; k2 < NP; k2++) {
        h2.appendChild(LN.h("th", { class: "al-sub", text: txt("colVol", "Driver volume used") }));
        h2.appendChild(LN.h("th", { class: "al-sub", text: txt("colAlloc", "Overhead assigned") }));
      }
      h2.appendChild(LN.h("th", { class: "al-sub", text: txt("colRate", "Rate per driver unit") }));
      h2.appendChild(LN.h("th", { class: "al-sub", text: txt("colCheck", "Volume check") }));
      var thead = LN.h("thead", {}, [h1, h2]);
      var tbody = LN.h("tbody");

      P.forEach(function (p, i) {
        var costIn = cell(p.cost, p.name + " " + txt("lblCost", "pool cost"), "al-in", sync);
        var totIn = cell(p.total, p.name + " " + txt("lblTotal", "total driver volume"), "al-in", sync);
        var volIn = [];
        var tr = LN.h("tr", {}, [
          LN.h("th", { scope: "row" }, [
            LN.h("span", { class: "al-pool", text: p.name }),
            LN.h("span", { class: "al-driver", text: txt("driver", "driver") + ": " + p.driver })
          ]),
          LN.h("td", {}, [costIn]),
          LN.h("td", {}, [totIn])
        ]);
        for (var k = 0; k < NP; k++) {
          volIn.push(cell(p.vols[k], p.name + " " + prods[k] + " " + p.driver, "al-in", sync));
          tr.appendChild(LN.h("td", {}, [volIn[k]]));
          var out = LN.h("td", { class: "al-out" });
          ui.alloc[i] = ui.alloc[i] || [];
          ui.alloc[i][k] = out;
          tr.appendChild(out);
        }
        var rate = LN.h("td", { class: "al-rate" });
        var chk = LN.h("td", { class: "al-check" });
        ui.rate[i] = rate; ui.check[i] = chk;
        tr.appendChild(rate); tr.appendChild(chk);
        tbody.appendChild(tr);
        p.ui = { cost: costIn, total: totIn, vols: volIn };
      });

      function pairRow(label, cls, make) {
        var tr = blankRow(label, cls);
        var tds = tr.querySelectorAll("td");
        for (var k = 0; k < NP; k++) {
          var allocCol = 2 + k * 2 + 1;
          var volCol = 2 + k * 2;
          tds[allocCol - 1].className = "al-sum";
          tds[allocCol - 1].appendChild(make(k, "out"));
          tds[volCol - 1].className = "al-sum";
          tds[volCol - 1].appendChild(make(k, "in"));
        }
        tbody.appendChild(tr);
      }

      pairRow(txt("rowOh", "Total overhead assigned"), "al-row oh", function (k, kind) {
        var td = kind === "out" ? LN.h("span", { class: "al-v" }) : LN.h("span", { class: "al-v" });
        ui.oh[k] = td;
        return td;
      });
      pairRow(txt("rowDc", "Direct costs"), "al-row dc", function (k, kind) {
        var td = kind === "in"
          ? cell(DIRECT[k], prods[k] + " " + txt("lblDc", "direct costs"), "al-in", sync)
          : LN.h("span", { class: "al-v" });
        ui.dc[k] = td;
        return td;
      });
      pairRow(txt("rowRev", "Sales revenue"), "al-row rv", function (k, kind) {
        var td = kind === "in"
          ? cell(REVENUE[k], prods[k] + " " + txt("lblRev", "revenue"), "al-in", sync)
          : LN.h("span", { class: "al-v" });
        ui.rev[k] = td;
        return td;
      });
      pairRow(txt("rowOp", "Operating income (loss)"), "al-row op", function (k, kind) {
        var td = kind === "out" ? LN.h("span", { class: "al-v" }) : LN.h("span", { class: "al-v" });
        ui.op[k] = td;
        return td;
      });
      tbody.appendChild(blankRow(txt("rowNote", "Direct costs and revenue are per product; every other figure is computed."), "al-row note"));

      tableBox.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: txt("swipe", "swipe the table sideways \u2192") }),
        LN.h("table", { class: "tbl al-tbl" }, [thead, tbody])
      ]));
    })();

    /* pull the edited numbers back out of the inputs into the state */
    function sync() {
      var k;
      P.forEach(function (p) {
        p.cost = num(p.ui.cost.value);
        p.total = num(p.ui.total.value);
        for (var j = 0; j < NP; j++) { p.vols[j] = num(p.ui.vols[j].value); }
      });
      for (k = 0; k < NP; k++) {
        var d = ui.dc[k], r = ui.rev[k];
        if (d && d.tagName === "INPUT") { DIRECT[k] = num(d.value); }
        if (r && r.tagName === "INPUT") { REVENUE[k] = num(r.value); }
      }
    }

    /* ---------- the picture: each product's overhead split by activity ---------- */
    var chartBox = LN.h("div", { class: "al-svg" });
    function draw(c) {
      chartBox.innerHTML = "";
      var W = 560, H = 232, L = 128, R = 78, T = 34, B = 56;
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": txt("ariaChart", "Share of allocated overhead by activity pool, per product") });
      function lab(x, y, s, cls, anchor) {
        var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "start",
          class: cls || "al-tick", fill: "var(--chart-label)" });
        t.textContent = s;
        return t;
      }
      var maxV = 0, k, i;
      for (k = 0; k < NP; k++) { maxV = Math.max(maxV, c.oh[k]); }
      var top = maxV > 0 ? maxV * 1.02 : 1;
      var slot = (H - T - B) / NP;
      var bh = Math.min(58, Math.max(18, slot - 22));
      for (k = 0; k < NP; k++) {
        var y0 = T + k * slot + (slot - bh) / 2;
        svg.appendChild(LN.s("line", { x1: L, y1: T + k * slot + slot / 2 - bh / 2 - 4,
          x2: W - R, y2: T + k * slot + slot / 2 - bh / 2 - 4,
          stroke: "var(--chart-grid)", "stroke-width": 1 }));
        var y = y0;
        for (i = 0; i < c.rows.length; i++) {
          var v = c.rows[i].alloc[k];
          if (v <= 0) { continue; }
          var w = (top > 0) ? (v / top) * (W - L - R) : 0;
          svg.appendChild(LN.s("rect", { x: L, y: y, width: Math.max(0, w - 1), height: bh,
            fill: CHART_COLS[i % CHART_COLS.length], "fill-opacity": "0.92" }));
          y += bh;
        }
        svg.appendChild(lab(L - 8, y0 + bh / 2 + 4, prods[k], "al-tick al-strong", "end"));
        svg.appendChild(lab(W - R + 8, y0 + bh / 2 + 4, k0(c.oh[k]), "al-tick al-strong", "start"));
      }
      svg.appendChild(lab(L, 18, txt("chartTitle", "Allocated overhead, split by activity pool"), "al-axis", "start"));
      var lx = L;
      for (i = 0; i < c.rows.length; i++) {
        svg.appendChild(LN.s("rect", { x: lx, y: H - B + 12, width: 10, height: 10, rx: 2,
          fill: CHART_COLS[i % CHART_COLS.length], "fill-opacity": "0.92" }));
        svg.appendChild(lab(lx + 14, H - B + 21, c.rows[i].pool.name, "al-tick", "start"));
        lx += 18 + c.rows[i].pool.name.length * 6.4;
      }
      chartBox.appendChild(svg);
    }

    /* ---------- the plain-language read-out ---------- */
    var read = LN.h("div", { class: "al-read" });
    function readout(c) {
      read.innerHTML = "";
      var k, i, bad = 0;
      for (k = 0; k < NP; k++) {
        var line = (c.op[k] >= 0)
          ? txt("okLine", "covers its total cost of") + " " + m0(c.tc[k]) + ", "
            + txt("okLine2", "leaving") + " " + m0(c.op[k]) + " "
            + txt("opWord", "operating profit") + "."
          : txt("badLine", "does not cover its total cost of") + " " + m0(c.tc[k]) + " \u2014 "
            + txt("badLine2", "a loss of") + " " + m0(Math.abs(c.op[k])) + ".";
        read.appendChild(LN.h("div", { class: "fb " + (c.op[k] >= 0 ? "ok" : "no") + " show" }, [
          LN.h("strong", { text: prods[k] + ": " }),
          LN.h("span", { text: txt("revLead", "revenue") + " " + m0(REVENUE[k]) + " " + line })
        ]));
      }
      for (i = 0; i < c.rows.length; i++) { if (Math.abs(c.rows[i].mismatch) > 1e-6) { bad++; } }
      if (bad) {
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("volWarn", "The products' driver volumes no longer add to the pool totals, so part of the overhead is left unassigned. ABC step 3 needs the total driver volume and each product's share of it to agree.") }));
      } else {
        var left = 0;
        for (i = 0; i < c.rows.length; i++) { left += c.rows[i].left; }
        read.appendChild(LN.h("div", { class: "fb info show",
          text: txt("volOk", "Driver volumes add to each pool's total volume, so the whole pool is allocated:") + " "
            + m0(c.poolTotal - left) + " " + txt("volOk2", "of the overhead assigned, nothing left over.") }));
      }
    }

    /* ---------- sensitivity: each pool's cost +/-10%, from the lab's own inputs ---------- */
    var sens = LN.h("div", { class: "al-sens" });
    function drawSens(base) {
      sens.innerHTML = "";
      var scen = [{ label: txt("scBase", "Base case"), pool: -1, f: 1 }];
      for (var i = 0; i < P.length; i++) {
        scen.push({ label: P[i].name + " " + txt("scDn", "\u221210%"), pool: i, f: 0.9 });
        scen.push({ label: P[i].name + " " + txt("scUp", "+10%"), pool: i, f: 1.1 });
      }
      var head = LN.h("tr", {}, [LN.h("th", { text: txt("scCol", "Scenario") })]);
      for (var k = 0; k < NP; k++) {
        head.appendChild(LN.h("th", { text: prods[k] + " " + txt("sensOp", "operating income") }));
        head.appendChild(LN.h("th", { text: txt("delta", "Change vs base") }));
      }
      var tb = LN.h("tbody");
      scen.forEach(function (r, ix) {
        var snapshot = P.map(function (p) { return p.cost; });
        if (r.pool >= 0) { P[r.pool].cost = snapshot[r.pool] * r.f; }
        var c2 = calc();
        P.forEach(function (p, j) { p.cost = snapshot[j]; });
        var tr = LN.h("tr", { class: ix === 0 ? "base" : "" }, [LN.h("td", { text: r.label })]);
        for (var k2 = 0; k2 < NP; k2++) {
          tr.appendChild(LN.h("td", { text: m0(c2.op[k2]) }));
          var dv = c2.op[k2] - base.op[k2];
          tr.appendChild(LN.h("td", {
            class: "d" + (ix === 0 || Math.abs(dv) < 0.5 ? "" : (dv > 0 ? " up" : " down")),
            text: ix === 0 ? txt("baseRow", "the base case")
              : (Math.abs(dv) < 0.5 ? "\u2014" : (dv > 0 ? "+" : "\u2212") + m0(Math.abs(dv)))
          }));
        }
        tb.appendChild(tr);
      });
      sens.appendChild(LN.h("p", { class: "al-cap", text: txt("sensTitle", "Sensitivity: what a 10% move in one pool does to profit") }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: txt("swipe", "swipe the table sideways \u2192") }),
        LN.h("table", { class: "tbl sens-tbl" }, [LN.h("thead", {}, [head]), tb])
      ]));
    }

    function recalc() {
      sync();
      var c = calc(), i, k;
      for (i = 0; i < c.rows.length; i++) {
        ui.rate[i].textContent = c.rows[i].pool.total > 0
          ? m0(c.rows[i].rate) + " " + txt("perUnit", "per driver unit") : "\u2014";
        var ok = Math.abs(c.rows[i].mismatch) < 1e-6;
        ui.check[i].className = "al-check " + (ok ? "ok" : "warn");
        ui.check[i].textContent = ok ? txt("ok", "matches")
          : (c.rows[i].mismatch > 0 ? "+" : "\u2212") + f2(Math.abs(c.rows[i].mismatch));
        for (k = 0; k < NP; k++) { ui.alloc[i][k].textContent = m0(c.rows[i].alloc[k]); }
      }
      for (k = 0; k < NP; k++) {
        ui.oh[k].textContent = m0(c.oh[k]);
        ui.dc[k].textContent = m0(DIRECT[k]);
        ui.rev[k].textContent = m0(REVENUE[k]);
        ui.op[k].textContent = m0(c.op[k]);
        ui.op[k].className = "al-v " + (c.op[k] >= 0 ? "pos" : "neg");
      }
      draw(c);
      readout(c);
      drawSens(c);
    }

    var wrap = LN.h("div", { class: "ln-al" });
    root.appendChild(LN.h("p", { class: "al-formula", text: txt("formula",
      "Activity Rate = pool cost \u00f7 total driver volume   \u00b7   Overhead assigned = activity rate \u00d7 driver volume used") }));
    wrap.appendChild(LN.h("p", { class: "al-cap", text: txt("cap", "Edit any cell: rates, allocations and profit recompute") }));
    wrap.appendChild(tableBox);
    wrap.appendChild(chartBox);
    wrap.appendChild(read);
    wrap.appendChild(sens);
    root.appendChild(wrap);
    recalc();
  }
};
