/* capacity-lab - the operations capacity and storage feasibility test, live.

   The lesson's two questions, from Banana Leaf Kitchen (Bulacan) and Kakaw
   Davao, expressed as arithmetic the student can move:

     1. Can the equipment actually make the forecast?
          monthly capacity = lines x daily output x production days
     2. If it can, can the cold store hold it until delivery?
          storage days of cover = freezer capacity / daily output

   The source states the raw numbers; the lab keeps them and refuses to invent
   any. Ana: two industrial steam cookers rated at 200 packs/day between them, a
   freezer holding 300 finished packs, a normal level of 1,200 packs/month, and a
   December peak of 2,400. Kakaw: one melanger at 25 kg per 48-hour cycle - 12.5
   kg per day - making about 120 kg/month of finished chocolate from 200 kg of
   dried beans.

   `lines` counts parallel production lines, so the lesson's own single plant
   sits at lines = 1 at the source's stated daily rating; raising it asks what a
   second identical line would do. `perday` is the plant's rated output for one
   production day, exactly as the source states it, which is why the two-cooker
   Banana Leaf figures are entered as one line at 200 packs/day rather than two
   lines at 200 each.

   The point of the lab is the collision the source describes: on paper the
   cookers cover the December peak, but the freezer cannot hold the surplus, so
   Ana schedules extra runs nearer to delivery and negotiates daily rather than
   weekly deliveries. The storage readout fires exactly when that is true.

   Data: LN.data.<key> = {
     unit, copy:{...all wording},
     init:{lines, perday, days, demand, store},
     ranges:{lines:[...], perday:[...], days:[...], demand:[...], store:[...]},
     presets:[{label, lines, perday, days, demand, store, note?}],
     stages:[{name, value}]     // optional production stages, each a
   }                            // {name, days} pair in source order
   All wording comes from data.js; this file carries no content strings. */
LN.components["capacity-lab"] = {
  init: function (root, d) {
    var U = d.unit || "packs";
    var C = d.copy || {};
    function txt(k, fallback) { return (C[k] != null) ? C[k] : fallback; }

    var base = {
      lines: LN.num((d.init || {}).lines) || 0,
      perday: LN.num((d.init || {}).perday) || 0,
      days: LN.num((d.init || {}).days) || 0,
      demand: LN.num((d.init || {}).demand) || 0,
      store: LN.num((d.init || {}).store) || 0
    };
    var D = {
      lines: base.lines, perday: base.perday, days: base.days,
      demand: base.demand, store: base.store, shown: null
    };
    var R = d.ranges || {};
    function rng(k, dflt) { return R[k] || dflt; }
    var ST = d.stages || [];

    function f0(v) {
      if (!isFinite(v)) { return "\u2014"; }
      return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    function f1(v) {
      if (!isFinite(v)) { return "\u2014"; }
      return v.toFixed(1);
    }

    /* the two tests, exactly as the source poses them */
    function daily(l, p) { return l * p; }
    function capacity(l, p, d2) { return l * p * d2; }
    function cover(st, day) { return (day > 0) ? st / day : NaN; }

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

    /* ---- controls: one slider per term of the capacity formula ---- */
    var outs = {};
    [     ["lines", txt("lines", "Parallel production lines"), rng("lines", [1, 4, 1])],
     ["perday", txt("perday", "Output per day"), rng("perday", [10, 600, 10])],
     ["days", txt("days", "Production days per month"), rng("days", [1, 31, 1])],
     ["demand", txt("demand", "Forecast demand per month"), rng("demand", [100, 8000, 100])],
     ["store", txt("store", "Freezer storage capacity"), rng("store", [0, 4000, 50])]
    ].forEach(function (spec) {
      var key = spec[0], label = spec[1], r = spec[2];
      var out = LN.h("output", { class: "chip cl-out" });
      outs[key] = { el: out };
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

    /* ---- presets: the source's own two ventures ---- */
    var presets = d.presets || [];
    var noteBox = LN.h("p", { class: "cl-note" });
    if (presets.length) {
      var row = LN.h("div", { class: "cl-presets" });
      presets.forEach(function (p) {
        row.appendChild(LN.h("button", { type: "button", text: p.label, onclick: function () {
          ["lines", "perday", "days", "demand", "store"].forEach(function (k) {
            if (p[k] != null) { D[k] = LN.num(p[k]); outs[k].inp.value = D[k]; }
          });
          noteBox.textContent = p.note || "";
          recalc();
        } }));
      });
      left.appendChild(LN.h("div", { class: "cl-ctl" }, [
        LN.h("label", { class: "cl-lab", text: txt("presets", "Lesson figures") }), row]));
    }
    left.appendChild(LN.h("div", { class: "cl-ctl" }, [
      LN.h("button", { type: "button", class: "chip", text: txt("reset", "Start over"),
        onclick: function () {
          D.lines = base.lines; D.perday = base.perday; D.days = base.days;
          D.demand = base.demand; D.store = base.store;
          ["lines", "perday", "days", "demand", "store"].forEach(function (k) {
            outs[k].inp.value = D[k];
          });
          noteBox.textContent = "";
          recalc();
        } })]));
    left.appendChild(noteBox);
    left.appendChild(LN.h("p", { class: "cl-note", text: txt("formulaLine",
      "Monthly capacity = lines x output per day x production days.") }));

    /* ---- the capacity bar: forecast against what the equipment can make ---- */
    function draw() {
      svgBox.innerHTML = "";
      var W = 560, H = 132, L = 16, R = 16, T = 34, BAR = 44;
      var bw = W - L - R;
      var cap = capacity(D.lines, D.perday, D.days);
      var dem = D.demand;
      var scale = Math.max(cap, dem, 1);
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "Forecast demand compared with monthly production capacity" });
      function lab(x, y, str, cls, anchor) {
        var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "start", class: cls,
          fill: "var(--chart-label)" });
        t.textContent = str;
        return t;
      }
      function bar(y, v, col, name, val) {
        var w = (v / scale) * bw;
        svg.appendChild(LN.s("rect", { x: L, y: y, width: Math.max(0, w), height: BAR - 16,
          fill: col, "fill-opacity": "0.88" }));
        svg.appendChild(lab(L + 6, y + 19, name, "cl-tick", "start"));
        var t = LN.s("text", { x: L + Math.max(0, w) + 8, y: y + 19, "text-anchor": "start",
          class: "cl-tick", fill: "var(--chart-label)" });
        t.textContent = val;
        svg.appendChild(t);
      }
      bar(T, dem, "var(--chart-cost)", txt("demandRow", "Forecast demand"),
        f0(dem) + " " + U);
      bar(T + BAR, cap, (cap >= dem) ? "var(--chart-profit)" : "var(--chart-loss)",
        txt("capRow", "Monthly capacity"), f0(cap) + " " + U);
      svg.appendChild(lab(L, 18, txt("barTitle", "Demand against capacity"), "cl-axis", "start"));
      svg.appendChild(lab(L, T - 6, "0", "cl-tick", "start"));
      svg.appendChild(lab(W - R, T - 6, f0(scale), "cl-tick", "end"));
      svgBox.appendChild(svg);
    }

    /* ---- the source's storage constraint, as a cover-days bar ---- */
    function drawStore(day) {
      if (!(D.store > 0)) { return; }
      tblBox.innerHTML = "";
      var cv = cover(D.store, day);
      var W = 560, H = 74, L = 16, R = 16, T = 30, BAR = 26;
      var bw = W - L - R;
      var maxDays = 30;
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "Days of production the freezer can hold" });
      function lab(x, y, str, cls, anchor) {
        var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "start", class: cls,
          fill: "var(--chart-label)" });
        t.textContent = str;
        return t;
      }
      var w = isFinite(cv) ? Math.min(maxDays, cv) / maxDays * bw : 0;
      var col = (isFinite(cv) && cv >= 2) ? "var(--chart-profit)" : "var(--chart-loss)";
      svg.appendChild(lN.s("rect", { x: L, y: T, width: Math.max(0, w), height: BAR,
        fill: col, "fill-opacity": "0.88" }));
      svg.appendChild(lN.s("rect", { x: L, y: T, width: bw, height: BAR, fill: "none",
        stroke: "var(--chart-axis)", "stroke-width": "1.2" }));
      var t1 = LN.s("text", { x: L + Math.max(0, w) + 8, y: T + 18, "text-anchor": "start",
        class: "cl-tick", fill: "var(--chart-label)" });
      t1.textContent = isFinite(cv) ? f1(cv) + " " + txt("days", "days") : "\u2014";
      svg.appendChild(t1);
      svg.appendChild(lab(L, 18, txt("storeTitle", "Days of output the freezer holds"),
        "cl-axis", "start"));
      svg.appendChild(lab(L, T + BAR + 16, "0", "cl-tick", "start"));
      svg.appendChild(lab(W - R, T + BAR + 16, txt("maxCover", "30 days"), "cl-tick", "end"));
      tblBox.appendChild(svg);
    }

    /* ---- the master production schedule the source describes ---- */
    function drawStages() {
      if (!ST.length) { return; }
      var existing = tblBox.querySelector(".cl-stages");
      if (existing) { existing.remove(); }
      var tb = LN.h("tbody");
      ST.forEach(function (s) {
        tb.appendChild(LN.h("tr", {}, [
          LN.h("td", { text: s.name }),
          LN.h("td", { text: (s.days != null) ? s.days : "\u2014" })]));
      });
      tblBox.appendChild(LN.h("div", { class: "cl-stages" }, [
        LN.h("p", { class: "cl-lab", text: txt("schedTitle", "Master production schedule") }),
        LN.h("div", { class: "cmp-wrap" }, [
          LN.h("p", { class: "swipe-hint", text: txt("swipe", "swipe the table sideways \u2192") }),
          LN.h("table", { class: "tbl" }, [LN.h("tbody", {}, [tb])])])]));
    }

    /* ---- sensitivity: the source's own what-ifs, no invented ones ---- */
    function drawSens(baseCap) {
      sens.innerHTML = "";
      var scen = [
        [txt("scBase", "Base case"), capacity(D.lines, D.perday, D.days)],
        [txt("scDemUp", "Forecast 10% higher"), capacity(D.lines, D.perday, D.days) * 1.1],
        [txt("scOutDn", "Output per unit 10% lower"), capacity(D.lines, D.perday * 0.9, D.days)],
        [txt("scDaysDn", "One fewer production day"),
          capacity(D.lines, D.perday, Math.max(0, D.days - 1))],
        [txt("scStoreDn", "Freezer capacity 10% smaller"), cover(D.store * 0.9, daily(D.lines, D.perday))],
        [txt("scStoreBase", "Freezer as specified"), cover(D.store, daily(D.lines, D.perday))]
      ];
      var lastUnit = txt("days", "days");
      var head3 = LN.h("tr", {}, [
        LN.h("th", { text: txt("scCol", "Scenario") }),
        LN.h("th", { text: txt("scOut", "Capacity / cover") }),
        LN.h("th", { text: txt("delta", "Change vs base") })]);
      var tb3 = LN.h("tbody");
      scen.forEach(function (s, ix) {
        var v = s[1];
        var isCap = ix <= 3;
        var d = (isFinite(v) && isFinite(baseCap)) ? v - baseCap : NaN;
        var cls = (ix === 0 || !isFinite(d) || Math.abs(d) < 0.005) ? "" : (d > 0 ? "up" : "down");
        var dc = LN.h("td", { class: "d" });
        dc.textContent = (ix === 0) ? txt("baseRow", "the base case")
          : (!isFinite(d) ? "\u2014"
            : ((d > 0 ? "+" : "\u2212") + (isCap ? f0(Math.abs(d)) : f1(Math.abs(d)))
              + " " + (isCap ? U : lastUnit)));
        tb3.appendChild(LN.h("tr", { class: cls }, [
          LN.h("td", { text: s[0] }),
          LN.h("td", { text: isFinite(v) ? (isCap ? f0(v) : f1(v)) + " "
            + (isCap ? U : lastUnit) : "\u2014" }),
          dc]));
      });
      sens.appendChild(LN.h("p", { class: "cl-lab", text: txt("sensTitle", "Sensitivity") }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("p", { class: "swipe-hint", text: txt("swipe", "swipe the table sideways \u2192") }),
        LN.h("table", { class: "tbl sens-tbl" }, [LN.h("thead", {}, [head3]), tb3])]));
    }

    function recalc() {
      var day = daily(D.lines, D.perday);
      var cap = capacity(D.lines, D.perday, D.days);
      var cv = cover(D.store, day);
      var gap = cap - D.demand;
      var show = D.shown === null ? cap : D.shown;
      LN.tween(show, cap, 240, function (v) {
        head.innerHTML = "";
        head.appendChild(LN.h("span", { class: "cl-caption", text: txt("capOut", "Monthly capacity") }));
        head.appendChild(LN.h("span", { class: "cl-bigv",
          text: f0(isFinite(cap) ? v : NaN) + " " + U }));
      });
      D.shown = cap;
      Object.keys(outs).forEach(function (k) {
        outs[k].el.textContent = f0(D[k]);
      });

      read.innerHTML = "";
      if (isFinite(cap) && D.demand > 0) {
        if (gap >= 0) {
          read.appendChild(LN.h("div", { class: "fb info show",
            text: txt("okLine", "The equipment covers the forecast with") + " "
              + f0(gap) + " " + txt("spare", U + " to spare each month.") }));
        } else {
          read.appendChild(LN.h("div", { class: "fb warn show",
            text: txt("shortLine", "The equipment falls short of the forecast by") + " "
              + f0(-gap) + " " + U + " " + txt("shortEnd", "each month.") }));
        }
      }
      if (isFinite(cv) && D.store > 0) {
        if (cv < 1) {
          read.appendChild(LN.h("div", { class: "fb warn show",
            text: txt("storeShort", "The freezer holds less than one day of output, so finished")
              + " " + U + " " + txt("storeShortEnd",
                "cannot wait for the next scheduled run. Cook nearer to the delivery date.") }));
        } else if (cv < 3) {
          read.appendChild(LN.h("div", { class: "fb warn show",
            text: txt("storeTight", "The freezer covers only") + " " + f1(cv) + " "
              + txt("days", "days") + " " + txt("storeTightEnd",
                "of output, so the storage constraint binds before the equipment does.") }));
        } else {
          read.appendChild(LN.h("div", { class: "fb info show",
            text: txt("storeOk", "The freezer covers") + " " + f1(cv) + " "
              + txt("days", "days") + " " + txt("storeOkEnd",
                "of output, so storage is not the binding constraint.") }));
        }
      }

      draw();
      drawStore(day);
      drawStages();
      drawSens(cap);
    }

    root.appendChild(wrap);
    recalc();
  }
};
