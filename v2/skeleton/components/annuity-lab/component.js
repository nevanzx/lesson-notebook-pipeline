/* annuity-lab — the annuity valuation centrepiece (Section 3 of a
   time-value lesson). Three modes: ordinary annuity, annuity due, and
   perpetuity. Sliders for the payment C, the periodic rate r, and the
   number of periods n; a PV/FV result strip; a grouped PV-vs-FV chart
   that shows the one-period head start of an annuity due; a plain
   readout; and a rate/period sensitivity table. Registers into
   LN.components, renders from LN.data[key]; all wording lives in the
   data copy object; token colours only. */

LN.components["annuity-lab"] = {
  init: function (root, d) {
    d = d || {};
    var money = d.money || "$";
    var CP = d.copy || {};
    var RG = d.ranges || {};
    function rg(k, def) { return (RG[k] && RG[k].length === 3) ? RG[k] : def; }
    var RC = rg("c", [100, 10000, 50]);
    var RR = rg("r", [0, 20, 0.25]);
    var RN = rg("n", [1, 40, 1]);
    var S = {
      mode: (d.init && d.init.mode) || "ordinary",
      c: (d.init && d.init.c != null) ? d.init.c : RC[0],
      r: (d.init && d.init.r != null) ? d.init.r : 6,
      n: (d.init && d.init.n != null) ? d.init.n : 5
    };

    function rate() { return S.r / 100; }
    function m1(v) {
      if (!isFinite(v)) return "\u2014";
      if (Math.abs(v) >= 1000) return money + LN.fmt(Math.round(v));
      var x = Math.round(v * 100) / 100;
      return money + (Math.abs(x % 1) > 0 ? x.toFixed(2) : String(x));
    }
    function fill(t, map) {
      return String(t == null ? "" : t).replace(/\{(\w+)\}/g, function (_, k) {
        return (k in map) ? map[k] : "";
      });
    }
    function oaPV(c, rp, n) { return rp === 0 ? c * n : c * (1 - Math.pow(1 + rp, -n)) / rp; }
    function oaFV(c, rp, n) { return rp === 0 ? c * n : c * (Math.pow(1 + rp, n) - 1) / rp; }
    function vals(mode, c, rp, n) {
      var pvOA = oaPV(c, rp, n), fvOA = oaFV(c, rp, n), pv, fv;
      if (mode === "perpetuity") { pv = rp === 0 ? Infinity : c / rp; fv = NaN; }
      else if (mode === "due") { pv = pvOA * (1 + rp); fv = fvOA * (1 + rp); }
      else { pv = pvOA; fv = fvOA; }
      return { pv: pv, fv: fv, pvOA: pvOA, fvOA: fvOA };
    }

    var ACT = {};
    var MODES = d.modes || ["ordinary", "due", "perpetuity"];
    var MODE_LABEL = {};
    (CP.modes || []).forEach(function (t, i) { MODE_LABEL[MODES[i]] = t; });

    var wrap = LN.h("div", { class: "al" });
    var grid = LN.h("div", { class: "al-grid" });
    var left = LN.h("div", { class: "al-left" });
    var right = LN.h("div", { class: "al-right" });
    wrap.appendChild(grid);
    grid.appendChild(left);
    grid.appendChild(right);
    root.appendChild(wrap);

    /* ---- mode buttons ---- */
    var btns = {};
    var modeRow = LN.h("div", { class: "al-modes" });
    MODES.forEach(function (mk) {
      btns[mk] = LN.h("button", {
        type: "button", class: "al-mode",
        text: MODE_LABEL[mk] || mk,
        onclick: function () { setMode(mk); }
      });
      modeRow.appendChild(btns[mk]);
    });
    if (MODES.length > 1) left.appendChild(modeRow);

    /* ---- sliders ---- */
    var ctrls = {};
    function ctl(key, labelF, fmtF, def) {
      var lab = LN.h("span", { text: "" });
      var out = LN.h("span", { class: "al-val" });
      var inp = LN.h("input", { type: "range" });
      var row = LN.h("div", { class: "al-ctl" }, [
        LN.h("div", { class: "al-line" }, [lab, out]), inp
      ]);
      inp.addEventListener("input", function () { S[key] = parseFloat(inp.value); recalc(); });
      ctrls[key] = { inp: inp, out: out, lab: lab, row: row, labelF: labelF, fmtF: fmtF, def: def };
      left.appendChild(row);
    }
    ctl("c", function () { return CP.cLabel || "Payment C"; }, function () { return m1(S.c); });
    ctl("r", function () { return CP.rLabel || "Rate per period r"; }, function () { return S.r + "%"; });
    ctl("n", function () { return CP.nLabel || "Number of periods n"; },
      function () { return String(S.n); });

    /* ---- presets ---- */
    var presetBox = LN.h("div", { class: "al-presets" });
    (d.presets || []).forEach(function (p) {
      presetBox.appendChild(LN.h("button", {
        type: "button", class: "chip", text: p.label,
        onclick: function () {
          S.c = p.c; S.r = p.r;
          if (p.n != null) S.n = p.n;
          setMode(p.mode || S.mode);
        }
      }));
    });
    if (presetBox.children.length) {
      left.appendChild(LN.h("div", { class: "al-ctl" }, [
        LN.h("div", { class: "al-line" }, [LN.h("span", { text: CP.presetsLabel || "Lesson presets" })]),
        presetBox
      ]));
    }

    /* ---- right column ---- */
    var svgBox = LN.h("div", { class: "al-svg" });
    var strip = LN.h("div", { class: "data-strip" });
    var read = LN.h("div", { class: "al-read" });
    var sens = LN.h("div", { class: "al-sens" });
    right.appendChild(svgBox);
    right.appendChild(strip);
    right.appendChild(read);
    right.appendChild(sens);

    /* ---- chart: grouped PV / FV bars ---- */
    var W = 520, H = 240, LY = 52, RY = 16, TY = 24, BY = 46;
    function svgText(x, y, str, anchor, cls) {
      var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "middle",
        fill: "var(--chart-label)", "font-size": "11", "class": cls || "" });
      t.textContent = str;
      return t;
    }
    function yScale(v, max) { return H - BY - (v / max) * (H - BY - TY); }
    function chart(v) {
      svgBox.innerHTML = "";
      var bars;
      if (S.mode === "perpetuity") {
        bars = [{ label: CP.barPerp || "PV \u2014 perpetuity", val: v.pv }];
      } else {
        bars = [
          { label: CP.barPVoa || "PV ordinary", val: v.pvOA },
          { label: CP.barPVdue || "PV due", val: v.pvOA * (1 + rate()) },
          { label: CP.barFVoa || "FV ordinary", val: v.fvOA },
          { label: CP.barFVdue || "FV due", val: v.fvOA * (1 + rate()) }
        ];
      }
      var maxV = 1;
      bars.forEach(function (b) { if (isFinite(b.val) && b.val > maxV) maxV = b.val; });
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": CP.chartLabel || "Annuity value by payout timing" });
      var i, gy;
      for (i = 0; i <= 4; i++) {
        gy = H - BY - i / 4 * (H - BY - TY);
        svg.appendChild(LN.s("line", { x1: LY, y1: gy, x2: W - RY, y2: gy,
          stroke: "var(--chart-grid)", "stroke-width": 1 }));
        svg.appendChild(svgText(LY - 6, gy + 4, money + LN.fmt(maxV * i / 4), "end"));
      }
      svg.appendChild(LN.s("line", { x1: LY, y1: H - BY, x2: W - RY, y2: H - BY,
        stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      svg.appendChild(LN.s("line", { x1: LY, y1: TY, x2: LY, y2: H - BY,
        stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      var slot = (W - LY - RY) / bars.length;
      var bw = Math.min(64, slot * 0.55);
      bars.forEach(function (b, k) {
        var cx = LY + slot * (k + 0.5);
        var val = isFinite(b.val) ? b.val : 0;
        var y = yScale(val, maxV);
        var isActive = S.mode === "perpetuity"
          || (S.mode === "due" && /due/i.test(b.label))
          || (S.mode === "ordinary" && !/due/i.test(b.label));
        svg.appendChild(LN.s("rect", { x: cx - bw / 2, y: y, width: bw, height: H - BY - y,
          fill: isActive ? "var(--chart-rev)" : "var(--chart-grid)" }));
        svg.appendChild(svgText(cx, y - 6, m1(b.val), "middle"));
        svg.appendChild(svgText(cx, H - BY + 16, b.label, "middle"));
      });
      svgBox.appendChild(svg);
    }

    /* ---- chips ---- */
    var shown = {};
    function chip(label, val) {
      var c = LN.h("span", { class: "chip" });
      c.appendChild(document.createTextNode(label + "  "));
      var sp = document.createElement("span");
      var key = "k" + label;
      var from = (shown[key] == null) ? val : shown[key];
      shown[key] = val;
      LN.tween(from, val, 180, function (x) { sp.textContent = m1(x); });
      c.appendChild(sp);
      return c;
    }
    function chips(v) {
      strip.innerHTML = "";
      if (S.mode === "perpetuity") {
        strip.appendChild(chip(CP.chipPerpPV || "PV of perpetuity", v.pv));
        strip.appendChild(chip(CP.chipPerpSum || "Paid over " + S.n + " periods",
          S.c * S.n));
      } else if (S.mode === "due") {
        strip.appendChild(chip(CP.chipDuePV || "PV of annuity due", v.pv));
        strip.appendChild(chip(CP.chipDueFV || "FV of annuity due", v.fv));
        strip.appendChild(chip(CP.chipDuePVoa || "PV if ordinary", v.pvOA));
      } else {
        strip.appendChild(chip(CP.chipOaPV || "PV of ordinary annuity", v.pv));
        strip.appendChild(chip(CP.chipOaFV || "FV of ordinary annuity", v.fv));
        strip.appendChild(chip(CP.chipOaSum || "Sum of payments", S.c * S.n));
      }
    }

    /* ---- readout ---- */
    function readout(v) {
      var map = {
        c: m1(S.c), r: S.r, n: S.n, years: S.n === 1 ? "year" : "years",
        pv: m1(v.pv), fv: m1(v.fv), pvOA: m1(v.pvOA), fvOA: m1(v.fvOA),
        sum: m1(S.c * S.n), boost: S.r + "%"
      };
      var text;
      if (S.mode === "perpetuity") text = fill(CP.readPerp, map);
      else if (S.mode === "due") text = fill(CP.readDue, map);
      else text = fill(CP.readOA, map);
      read.textContent = text;
    }

    /* ---- sensitivity ---- */
    function sensTable() {
      sens.innerHTML = "";
      var rp = rate();
      var head = CP.sensHead || ["Scenario", "PV", "FV"];
      var tb = LN.h("tbody");
      var rows = [];
      if (S.mode === "perpetuity") {
        rows.push([CP.sensRateDown || "Rate \u221210%", vals(S.mode, S.c, rp * 0.9, S.n), null]);
        rows.push([CP.sensBase || "Base", vals(S.mode, S.c, rp, S.n), true]);
        rows.push([CP.sensRateUp || "Rate +10%", vals(S.mode, S.c, rp * 1.1, S.n), null]);
      } else {
        rows.push([CP.sensBase || "Base", vals(S.mode, S.c, rp, S.n), true]);
        rows.push([CP.sensRateDown || "Rate \u221210%", vals(S.mode, S.c, rp * 0.9, S.n), null]);
        rows.push([CP.sensRateUp || "Rate +10%", vals(S.mode, S.c, rp * 1.1, S.n), null]);
        if (S.n > RN[0]) rows.push([CP.sensYearsBack || "One period fewer", vals(S.mode, S.c, rp, S.n - 1), null]);
        if (S.n < RN[1]) rows.push([CP.sensYearsFwd || "One period more", vals(S.mode, S.c, rp, S.n + 1), null]);
      }
      var base = vals(S.mode, S.c, rp, S.n);
      rows.forEach(function (r) {
        var tr = LN.h("tr", r[2] ? { class: "base" } : {});
        tr.appendChild(LN.h("td", { text: r[0] }));
        tr.appendChild(LN.h("td", { text: m1(r[1].pv) }));
        tr.appendChild(LN.h("td", { text: isFinite(r[1].fv) ? m1(r[1].fv) : "\u2014" }));
        tb.appendChild(tr);
      });
      var thead = LN.h("tr", {}, [LN.h("th", { text: head[0] }),
        LN.h("th", { text: head[1] }), LN.h("th", { text: head[2] })]);
      sens.appendChild(LN.h("h3", { text: CP.sensTitle || "Sensitivity" }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("table", { class: "al-tbl" }, [LN.h("thead", {}, [thead]), tb])
      ]));
    }

    /* ---- mode + recalc ---- */
    function setMode(mode) {
      S.mode = mode;
      Object.keys(btns).forEach(function (k) {
        btns[k].setAttribute("aria-pressed", k === mode ? "true" : "false");
      });
      recalc();
    }
    function recalc() {
      ctrls.n.row.style.display = (S.mode === "perpetuity") ? "none" : "";
      Object.keys(ctrls).forEach(function (k) {
        var c = ctrls[k];
        c.lab.textContent = c.labelF();
        c.inp.setAttribute("aria-label", c.labelF());
        c.inp.min = (k === "c" ? RC : k === "r" ? RR : RN)[0];
        c.inp.max = (k === "c" ? RC : k === "r" ? RR : RN)[1];
        c.inp.step = (k === "c" ? RC : k === "r" ? RR : RN)[2];
        c.inp.value = S[k];
        c.out.textContent = c.fmtF();
      });
      var v = vals(S.mode, S.c, rate(), S.n);
      chart(v);
      chips(v);
      readout(v);
      sensTable();
    }

    setMode(S.mode);
  }
};
