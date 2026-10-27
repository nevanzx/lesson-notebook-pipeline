/* dividend-lab — the equity valuation centrepiece (Section 3 of the
   dividend-discount lesson). Two modes: the zero-growth (perpetuity) model
   and the constant-growth Gordon model. Sliders for the latest dividend D0,
   the required return r, and the growth rate g; a per-share price readout; a
   next-dividend / spread strip; a price-versus-input curve; and a required
   return / growth sensitivity table. Registers into LN.components, renders
   from LN.data[key]; all wording lives in the data copy object; token
   colours only. */
LN.components["dividend-lab"] = {
  init: function (root, d) {
    d = d || {};
    var money = d.money || "$";
    var CP = d.copy || {};
    var RG = d.ranges || {};
    function rg(k, def) { return (RG[k] && RG[k].length === 3) ? RG[k] : def; }
    var RD = rg("d0", [0.5, 20, 0.25]);
    var RR = rg("r", [1, 20, 0.25]);
    var RGG = rg("g", [0, 15, 0.25]);
    var S = {
      mode: (d.init && d.init.mode) || "gordon",
      d0: (d.init && d.init.d0 != null) ? d.init.d0 : 2,
      r: (d.init && d.init.r != null) ? d.init.r : 10,
      g: (d.init && d.init.g != null) ? d.init.g : 5
    };

    var MODES = ["zero", "gordon"];
    var MODE_LABEL = { zero: (CP.modes && CP.modes[0]) || "Zero-growth",
      gordon: (CP.modes && CP.modes[1]) || "Constant growth (Gordon)" };

    function rp() { return S.r / 100; }
    function gp() { return S.g / 100; }
    function m2(v) {
      if (v == null || !isFinite(v)) return "\u2014";
      var x = Math.round(Math.abs(v) * 100) / 100 * (v < 0 ? -1 : 1);
      var s = (Math.abs(x) >= 1000) ? LN.fmt(Math.round(x)) : x.toFixed(2);
      return money + s;
    }
    function fill(t, map) {
      return String(t == null ? "" : t).replace(/\{(\w+)\}/g, function (_, k) {
        return (k in map) ? map[k] : "";
      });
    }
    /* model outputs for a given input set */
    function calc(mode, d0, r, g) {
      var out = { mode: mode, d0: d0, r: r, g: g, valid: true };
      if (mode === "zero") {
        out.d1 = d0;
        out.spread = null;
        out.price = r > 0 ? d0 / r : NaN;
      } else {
        out.d1 = d0 * (1 + g);
        out.spread = r - g;
        if (r <= g) { out.valid = false; out.price = NaN; }
        else { out.price = out.d1 / (r - g); }
      }
      return out;
    }
    function cur() { return calc(S.mode, S.d0, rp(), gp()); }

    var wrap = LN.h("div", { class: "dl" });
    var grid = LN.h("div", { class: "dl-grid" });
    var left = LN.h("div", { class: "dl-left" });
    var right = LN.h("div", { class: "dl-right" });
    wrap.appendChild(grid);
    grid.appendChild(left);
    grid.appendChild(right);
    root.appendChild(wrap);

    /* ---- mode buttons ---- */
    var btns = {};
    var modeRow = LN.h("div", { class: "dl-modes" });
    MODES.forEach(function (mk) {
      btns[mk] = LN.h("button", { type: "button", class: "dl-mode",
        text: MODE_LABEL[mk], onclick: function () { setMode(mk); } });
      modeRow.appendChild(btns[mk]);
    });
    left.appendChild(modeRow);

    /* ---- sliders ---- */
    var ctrls = {};
    function ctl(key, labelF, fmtF) {
      var lab = LN.h("span", { text: "" });
      var out = LN.h("span", { class: "dl-val" });
      var inp = LN.h("input", { type: "range" });
      var row = LN.h("div", { class: "dl-ctl" }, [
        LN.h("div", { class: "dl-line" }, [lab, out]), inp
      ]);
      inp.addEventListener("input", function () { S[key] = parseFloat(inp.value); recalc(); });
      ctrls[key] = { inp: inp, out: out, lab: lab, row: row, labelF: labelF, fmtF: fmtF };
      left.appendChild(row);
    }
    ctl("d0", function () {
      return S.mode === "zero" ? (CP.dLabel || "Fixed annual dividend D")
        : (CP.d0Label || "Latest dividend D\u2080");
    }, function () { return m2(S.d0); });
    ctl("r", function () { return CP.rLabel || "Required return r"; },
      function () { return S.r + "%"; });
    ctl("g", function () { return CP.gLabel || "Growth rate g"; },
      function () { return S.g + "%"; });

    /* ---- presets ---- */
    var presetBox = LN.h("div", { class: "dl-presets" });
    (d.presets || []).forEach(function (p) {
      presetBox.appendChild(LN.h("button", {
        type: "button", class: "chip", text: p.label,
        onclick: function () {
          S.d0 = p.d0; S.r = p.r;
          if (p.g != null) S.g = p.g;
          setMode(p.mode || S.mode);
        }
      }));
    });
    if (presetBox.children.length) {
      left.appendChild(LN.h("div", { class: "dl-ctl" }, [
        LN.h("div", { class: "dl-line" }, [LN.h("span", { text: CP.presetsLabel || "Lesson presets" })]),
        presetBox
      ]));
    }

    /* ---- right column ---- */
    var svgBox = LN.h("div", { class: "dl-svg" });
    var strip = LN.h("div", { class: "data-strip" });
    var read = LN.h("div", { class: "dl-read" });
    var sens = LN.h("div", { class: "dl-sens" });
    right.appendChild(svgBox);
    right.appendChild(strip);
    right.appendChild(read);
    right.appendChild(sens);

    /* ---- chart: price vs the model's input ---- */
    var W = 520, H = 240, LXX = 60, RXX = 16, TY = 26, BY = 46;
    function svgText(x, y, str, anchor, fill) {
      var t = LN.s("text", { x: x, y: y, "text-anchor": anchor || "middle",
        fill: fill || "var(--chart-label)", "font-size": "11" });
      t.textContent = str;
      return t;
    }
    function chart(c) {
      svgBox.innerHTML = "";
      var xs = [], ys = [], i, n = 60;
      if (S.mode === "zero") {
        for (i = 0; i <= n; i++) { var rr = 1 + (20 - 1) * i / n; xs.push(rr); ys.push(S.d0 / (rr / 100)); }
        var xcur = S.r;
      } else {
        var base = Math.max(0.25, S.r - S.g);
        var sMin = Math.max(0.25, base / 6);
        var sMax = Math.max(S.r, base + 1);
        var d1 = S.d0 * (1 + gp());
        for (i = 0; i <= n; i++) { var ss = sMin + (sMax - sMin) * i / n; xs.push(ss); ys.push(d1 / (ss / 100)); }
        var xcur = S.r - S.g;
      }
      var maxY = 1;
      for (i = 0; i < ys.length; i++) if (isFinite(ys[i]) && ys[i] > maxY) maxY = ys[i];
      var x0 = xs[0], x1 = xs[xs.length - 1];
      function px(x) { return LXX + (x - x0) / (x1 - x0) * (W - LXX - RXX); }
      function py(y) { return H - BY - Math.max(0, Math.min(y, maxY)) / maxY * (H - BY - TY); }
      var svg = LN.s("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": CP.chartLabel || "Price versus input" });
      for (i = 0; i <= 4; i++) {
        var gy = H - BY - i / 4 * (H - BY - TY);
        svg.appendChild(LN.s("line", { x1: LXX, y1: gy, x2: W - RXX, y2: gy,
          stroke: "var(--chart-grid)", "stroke-width": 1 }));
        svg.appendChild(svgText(LXX - 6, gy + 4, money + LN.fmt(maxY * i / 4), "end"));
      }
      svg.appendChild(LN.s("line", { x1: LXX, y1: H - BY, x2: W - RXX, y2: H - BY,
        stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      svg.appendChild(LN.s("line", { x1: LXX, y1: TY, x2: LXX, y2: H - BY,
        stroke: "var(--chart-axis)", "stroke-width": 1.6 }));
      var pts = [];
      for (i = 0; i < xs.length; i++) {
        if (isFinite(ys[i])) pts.push(px(xs[i]).toFixed(1) + "," + py(ys[i]).toFixed(1));
      }
      svg.appendChild(LN.s("polyline", { points: pts.join(" "), fill: "none",
        stroke: "var(--chart-rev)", "stroke-width": 2.4 }));
      if (isFinite(xcur) && xcur >= x0 && xcur <= x1 && isFinite(c.price)) {
        svg.appendChild(LN.s("line", { x1: px(xcur), y1: TY, x2: px(xcur), y2: H - BY,
          stroke: "var(--chart-cost)", "stroke-width": 1.4, "stroke-dasharray": "4 3" }));
        svg.appendChild(LN.s("circle", { cx: px(xcur), cy: py(c.price), r: 4,
          fill: "var(--chart-cost)" }));
        svg.appendChild(svgText(px(xcur), ty(c.price) , m2(c.price), "middle", "var(--chart-cost)"));
      }
      function ty(y) { return Math.max(TY + 10, py(y) - 8); }
      svg.appendChild(svgText((LXX + W - RXX) / 2, H - 8,
        S.mode === "zero" ? (CP.xLabelZero || "Required return r (%)")
          : (CP.xLabelGordon || "Spread r \u2212 g (percentage points)"), "middle"));
      svgBox.appendChild(svg);
    }

    /* ---- chips ---- */
    var shown = {};
    function chip(label, val, fmt) {
      var c = LN.h("span", { class: "chip" });
      c.appendChild(document.createTextNode(label + "  "));
      var sp = document.createElement("span");
      var key = "k" + label;
      var from = (shown[key] == null) ? val : shown[key];
      shown[key] = val;
      LN.tween(from, val, 180, function (x) { sp.textContent = fmt ? fmt(x) : m2(x); });
      c.appendChild(sp);
      return c;
    }
    function chips(c) {
      strip.innerHTML = "";
      if (S.mode === "zero") {
        strip.appendChild(chip(CP.chipPrice || "Price P\u2080", c.price));
        strip.appendChild(chip(CP.chipDiv || "Annual dividend D", c.d0));
        strip.appendChild(chip(CP.chipRate || "Required return", rp(), function (x) { return (x * 100).toFixed(2) + "%"; }));
      } else {
        strip.appendChild(chip(CP.chipPrice || "Price P\u2080", c.price));
        strip.appendChild(chip(CP.chipNext || "Next dividend D\u2081", c.d1));
        strip.appendChild(chip(CP.chipSpread || "Spread r \u2212 g", c.spread,
          function (x) { return isFinite(x) ? x.toFixed(2) + " pp" : "\u2014"; }));
      }
    }

    /* ---- readout ---- */
    function readout(c) {
      read.classList.toggle("invalid", !c.valid);
      var map = {
        d0: m2(S.d0), d1: m2(c.d1), r: S.r, g: S.g,
        spread: (c.spread == null) ? "" : c.spread.toFixed(2),
        price: m2(c.price)
      };
      var text;
      if (!c.valid) text = fill(CP.readInvalid, map);
      else if (S.mode === "zero") text = fill(CP.readZero, map);
      else text = fill(CP.readGordon, map);
      read.textContent = text;
    }

    /* ---- sensitivity ---- */
    function sensTable() {
      sens.innerHTML = "";
      var head = CP.sensHead || ["Scenario", "Price P\u2080"];
      var tb = LN.h("tbody");
      var rows = [];
      if (S.mode === "zero") {
        rows.push([CP.sensBase || "Base", cur(), true]);
        rows.push([CP.sensRateUp || "Required return +1 pp", calc("zero", S.d0, rp() + 0.01), null]);
        rows.push([CP.sensRateDown || "Required return \u22121 pp", calc("zero", S.d0, Math.max(0.005, rp() - 0.01)), null]);
        rows.push([CP.sensDivUp || "Dividend +10%", calc("zero", S.d0 * 1.1, rp()), null]);
        rows.push([CP.sensDivDown || "Dividend \u221210%", calc("zero", S.d0 * 0.9, rp()), null]);
      } else {
        rows.push([CP.sensBase || "Base", cur(), true]);
        rows.push([CP.sensRateUp || "Required return +1 pp", calc("gordon", S.d0, rp() + 0.01, gp()), null]);
        rows.push([CP.sensRateDown || "Required return \u22121 pp", calc("gordon", S.d0, Math.max(0.005, rp() - 0.01), gp()), null]);
        rows.push([CP.sensGrowUp || "Growth rate +1 pp", calc("gordon", S.d0, rp(), gp() + 0.01), null]);
        rows.push([CP.sensGrowDown || "Growth rate \u22121 pp", calc("gordon", S.d0, rp(), Math.max(0, gp() - 0.01)), null]);
      }
      rows.forEach(function (r) {
        var tr = LN.h("tr", r[2] ? { class: "base" } : {});
        tr.appendChild(LN.h("td", { text: r[0] }));
        var td = LN.h("td");
        if (!r[1].valid) { td.textContent = CP.sensInvalid || "not defined (r \u2264 g)"; td.className = "down"; }
        else { td.textContent = m2(r[1].price); }
        tr.appendChild(td);
        tb.appendChild(tr);
      });
      var thead = LN.h("tr", {}, [LN.h("th", { text: head[0] }), LN.h("th", { text: head[1] })]);
      sens.appendChild(LN.h("h3", { text: CP.sensTitle || "Sensitivity" }));
      sens.appendChild(LN.h("div", { class: "cmp-wrap" }, [
        LN.h("table", { class: "dl-tbl" }, [LN.h("thead", {}, [thead]), tb])
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
      ctrls.g.row.style.display = (S.mode === "zero") ? "none" : "";
      Object.keys(ctrls).forEach(function (k) {
        var c = ctrls[k];
        c.lab.textContent = c.labelF();
        c.inp.setAttribute("aria-label", c.labelF());
        var range = (k === "d0") ? RD : (k === "r") ? RR : RGG;
        c.inp.min = range[0]; c.inp.max = range[1]; c.inp.step = range[2];
        c.inp.value = S[k];
        c.out.textContent = c.fmtF();
      });
      var c = cur();
      chart(c);
      chips(c);
      readout(c);
      sensTable();
    }

    setMode(S.mode);
  }
};
