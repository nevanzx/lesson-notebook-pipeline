LN.components["capital-lab"] = {
  init: function (root, d) {
    d = d || {};
    var C = d.copy || {};
    var money = d.money || "";
    var unit = d.unit ? " " + d.unit : "";
    var minima = d.minima || { cet1: 6, t1: 7.5, car: 10, ccb: 2.5 };
    var ccb = minima.ccb;
    var exps = (d.exposures || []).map(function (e) {
      return { label: e.label, band: e.band, rw: e.rw, amount: e.amount };
    });
    var cap = {
      cet1: (d.capital || {}).cet1 || 0,
      at1: (d.capital || {}).at1 || 0,
      t2: (d.capital || {}).t2 || 0
    };
    var shockIdx = (typeof d.shockIndex === "number") ? d.shockIndex : -1;
    var rng = (d.ranges && d.ranges.shock) || [0, 0, 1];
    var SCALE = 35; // full width of the bar, in percent of RWA

    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }
    function moneyTxt(n) { return money + LN.fmt(n) + unit; }
    function pct(n) { return n.toFixed(2) + "%"; }
    function pct1(n) { return n.toFixed(1) + "%"; }
    /* one decimal only when the figure needs it, so a gap reads 218.5 and
       not 219 — the lab must show the same number the lesson's prose shows */
    function moneyDec(n) {
      var r = Math.round(Math.abs(n) * 10) / 10;
      var whole = Math.floor(r), frac = Math.round((r - whole) * 10);
      if (frac === 10) { whole += 1; frac = 0; }
      var s = money + LN.fmt(whole) + (frac ? "." + frac : "") + unit;
      return n < 0 ? "-" + s : s;
    }

    var wrap = el("div", "cl-root");
    if (C.title) wrap.appendChild(el("p", "cl-title", C.title));
    if (C.intro) wrap.appendChild(el("p", "cl-intro", C.intro));

    // ---- presets ----
    var prow = el("div", "cl-presets");
    if (C.presetsTitle) prow.appendChild(el("span", "cl-rfoot", C.presetsTitle));
    var note = el("div", "cl-note");
    note.style.display = "none";

    // ---- exposures table ----
    var tpanel = el("div", "cl-panel");
    tpanel.appendChild(el("p", "cl-h", C.exposureTitle || "Credit exposures"));
    var twrap = el("div", "cl-tblwrap");
    var tbl = el("table", "cl-tbl");
    var thead = el("thead");
    var htr = el("tr");
    [C.hExposure, C.hBand, C.hRW, C.hAmount].forEach(function (h) {
      htr.appendChild(el("th", null, h));
    });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = el("tbody");
    var amtInputs = [];
    exps.forEach(function (e) {
      var tr = el("tr");
      tr.appendChild(el("td", "lbl", e.label));
      tr.appendChild(el("td", "band", e.band));
      tr.appendChild(el("td", "rw", e.rw + "%"));
      var td = el("td");
      var inp = document.createElement("input");
      inp.type = "number";
      inp.step = "any";
      inp.min = "0";
      inp.value = String(e.amount);
      inp.setAttribute("aria-label", e.label + " " + (C.hAmount || "amount"));
      td.appendChild(inp);
      tr.appendChild(td);
      amtInputs.push(inp);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    twrap.appendChild(tbl);
    tpanel.appendChild(twrap);

    // ---- capital ----
    var cpanel = el("div", "cl-panel");
    cpanel.appendChild(el("p", "cl-h", C.capitalTitle || "Regulatory capital"));
    var cgrid = el("div", "cl-cap");
    var capInputs = {};
    [["cet1", C.hCet1], ["at1", C.hAt1], ["t2", C.hT2]].forEach(function (pair) {
      var b = el("div");
      var lab = el("label", null, pair[1]);
      var inp = document.createElement("input");
      inp.type = "number";
      inp.step = "any";
      inp.value = String(cap[pair[0]]);
      inp.setAttribute("aria-label", pair[1]);
      b.appendChild(lab);
      b.appendChild(inp);
      cgrid.appendChild(b);
      capInputs[pair[0]] = inp;
    });
    cpanel.appendChild(cgrid);

    // ---- shock dial ----
    var spanel = el("div", "cl-panel cl-shock");
    var slab = el("div", "cl-sl");
    var sname = el("span", null, C.shockTitle || "Shock");
    var sval = el("span", null, money + "0" + unit);
    slab.appendChild(sname);
    slab.appendChild(sval);
    var slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(rng[0]);
    slider.max = String(rng[1]);
    slider.step = String(rng[2]);
    slider.value = "0";
    slider.setAttribute("aria-label", C.shockTitle || "Shock");
    spanel.appendChild(slab);
    spanel.appendChild(slider);
    if (C.shockHelp) spanel.appendChild(el("p", null, C.shockHelp));

    // ---- RWA output ----
    var rpanel = el("div", "cl-panel");
    rpanel.appendChild(el("p", "cl-h", C.rwaTitle || "Risk-weighted assets"));
    var rrow = el("div", "cl-rwa");
    var rname = el("span", "cl-n", C.rwaName || "Credit risk-weighted assets");
    var rvalue = el("span", "cl-v", "—");
    rrow.appendChild(rname);
    rrow.appendChild(rvalue);
    rpanel.appendChild(rrow);
    if (C.rwaNote) rpanel.appendChild(el("p", "cl-intro", C.rwaNote));

    // ---- ratios ----
    var RATIOS = [
      { k: "cet1", nm: C.rCet1 || "CET1 ratio", mn: minima.cet1 },
      { k: "t1", nm: C.rT1 || "Tier 1 ratio", mn: minima.t1 },
      { k: "car", nm: C.rCar || "Capital adequacy ratio", mn: minima.car }
    ];
    var rpanel2 = el("div", "cl-panel");
    rpanel2.appendChild(el("p", "cl-h", C.ratioTitle || "Capital ratios against the BSP minimum"));
    var rgrid = el("div", "cl-ratios");
    var rcells = [];
    RATIOS.forEach(function (r) {
      var card = el("div", "cl-rc");
      var top = el("div", "cl-rtop");
      top.appendChild(el("span", "cl-rname", r.nm));
      var v = el("span", "cl-rval", "—");
      top.appendChild(v);
      card.appendChild(top);
      var track = el("div", "cl-track");
      var fill = el("div", "cl-fill");
      var m1 = el("div", "cl-mark min");
      var m2 = el("div", "cl-mark tgt");
      track.appendChild(fill);
      track.appendChild(m1);
      track.appendChild(m2);
      card.appendChild(track);
      var foot = el("div", "cl-rfoot", "—");
      card.appendChild(foot);
      var verd = el("p", "cl-verdict", "—");
      card.appendChild(verd);
      rgrid.appendChild(card);
      rcells.push({ def: r, val: v, fill: fill, m1: m1, m2: m2, foot: foot, verd: verd });
    });
    rpanel2.appendChild(rgrid);

    // ---- capital gaps ----
    var gpanel = el("div", "cl-panel");
    gpanel.appendChild(el("p", "cl-h", C.gapTitle || "Capital gap against minimum + buffer"));
    var ggrid = el("div", "cl-gaps");
    var gcells = [];
    RATIOS.forEach(function (r) {
      var b = el("div");
      b.appendChild(el("div", "cl-gn", r.nm));
      var gv = el("div", "cl-gv", "—");
      b.appendChild(gv);
      ggrid.appendChild(b);
      gcells.push({ def: r, val: gv });
    });
    gpanel.appendChild(ggrid);
    if (C.gapNote) gpanel.appendChild(el("p", "cl-intro", C.gapNote));

    // ---- readout ----
    var read = el("div", "cl-readout");

    function currentAmounts() {
      var out = [];
      for (var i = 0; i < amtInputs.length; i++) {
        var v = parseFloat(amtInputs[i].value);
        out.push(isFinite(v) && v > 0 ? v : 0);
      }
      return out;
    }
    function currentCap() {
      return {
        cet1: Math.max(0, parseFloat(capInputs.cet1.value) || 0),
        at1: Math.max(0, parseFloat(capInputs.at1.value) || 0),
        t2: Math.max(0, parseFloat(capInputs.t2.value) || 0)
      };
    }
    function compute() {
      var amts = currentAmounts();
      var shock = parseFloat(slider.value) || 0;
      if (shockIdx >= 0 && shock > 0) {
        amts[shockIdx] = Math.max(0, amts[shockIdx] - shock);
      }
      var c = currentCap();
      c.cet1 = Math.max(0, c.cet1 - shock);
      var rwa = 0;
      for (var i = 0; i < exps.length; i++) rwa += amts[i] * (exps[i].rw / 100);
      rvalue.textContent = rwa > 0 ? moneyTxt(rwa) : "—";

      var tiers = { cet1: c.cet1, t1: c.cet1 + c.at1, car: c.cet1 + c.at1 + c.t2 };
      var worst = null, shortAny = false;
      rcells.forEach(function (rc, i) {
        var def = rc.def;
        var tgt = def.mn + ccb;
        var r = rwa > 0 ? (tiers[def.k] / rwa) * 100 : 0;
        rc.val.textContent = rwa > 0 ? pct(r) : "—";
        var pos = Math.max(0, Math.min(1, r / SCALE));
        rc.fill.style.width = (pos * 100).toFixed(2) + "%";
        rc.m1.style.left = Math.min(100, (def.mn / SCALE) * 100) + "%";
        rc.m2.style.left = Math.min(100, (tgt / SCALE) * 100) + "%";
        rc.foot.textContent = C.footTpl
          ? C.footTpl.replace("{min}", pct1(def.mn)).replace("{tgt}", pct1(tgt))
          : "";
        var state = r < def.mn ? "breach" : (r < tgt ? "warn" : "pass");
        rc.verd.className = "cl-verdict " + state;
        rc.verd.textContent = verdictText(state, def, r, tgt, ccb, money, unit);
        if (!worst || rank(state) > rank(worst.state)) worst = { state: state, r: r, def: def, tgt: tgt };
        var req = (tgt / 100) * rwa;
        var diff = tiers[def.k] - req;
        var gv = gcells[i].val;
        if (!isFinite(diff)) { gv.textContent = "—"; gv.className = "cl-gv"; }
        else if (diff >= 0) {
          gv.textContent = "+ " + moneyDec(diff) + " " + (C.hSurplus || "surplus");
          gv.className = "cl-gv sur";
        } else {
          gv.textContent = moneyDec(-diff) + " " + (C.hShort || "short");
          gv.className = "cl-gv short";
          shortAny = true;
        }
      });
      buildReadout(rwa, tiers, worst, shock, shortAny, c, money, unit);
    }
    function rank(s) { return s === "breach" ? 2 : (s === "warn" ? 1 : 0); }
    function verdictText(state, def, r, tgt, ccb, money, unit) {
      var nm = def.nm, min = pct1(def.mn), tg = pct1(tgt);
      if (state === "breach") {
        return nm + " is " + pct(r) + " — under the " + min + " minimum. The bank is in breach and must rebuild capital.";
      }
      if (state === "warn") {
        return nm + " is " + pct(r) + " — above the " + min + " minimum, but under the " + tg +
          " target once the " + ccb.toFixed(1) + "% buffer is counted. Not a breach; dividends and bonuses are now capped.";
      }
      return nm + " is " + pct(r) + " — clears both the " + min + " minimum and the " + tg + " target. Unrestricted.";
    }
    function buildReadout(rwa, tiers, worst, shock, shortAny, c, money, unit) {
      read.innerHTML = "";
      if (!(rwa > 0)) {
        read.appendChild(el("p", null, C.readEmpty || "Enter exposures above to see the ratios."));
        return;
      }
      var lines = [];
      if (shock > 0) {
        lines.push(C.readShock
          ? C.readShock.replace("{s}", moneyTxt(shock))
          : "A write-off of " + moneyTxt(shock) + " has been applied.");
      } else {
        lines.push(C.readIdle || "No shock applied.");
      }
      lines.push(C.readRwa
        ? C.readRwa.replace("{rwa}", moneyTxt(rwa))
        : "Credit risk-weighted assets are " + moneyTxt(rwa) + ".");
      if (worst) {
        lines.push(worst.state === "pass"
          ? (C.readPass ? C.readPass.replace("{w}", worst.def.nm) : worst.def.nm + " clears every test.")
          : worst.state === "warn"
            ? (C.readWarn
                ? C.readWarn.replace("{w}", worst.def.nm).replace("{r}", pct(worst.r)).replace("{t}", pct1(worst.tgt))
                : worst.def.nm + " is inside the buffer.")
            : (C.readBreach
                ? C.readBreach.replace("{w}", worst.def.nm).replace("{r}", pct(worst.r)).replace("{m}", pct1(worst.def.mn))
                : worst.def.nm + " is in breach."));
      }
      lines.push(C.readTail
        ? C.readTail.replace("{t1}", moneyTxt(tiers.t1)).replace("{c}", moneyTxt(tiers.car))
        : "");
      lines.forEach(function (t) { if (t) read.appendChild(el("p", null, t)); });
    }

    (d.presets || []).forEach(function (p) {
      var b = el("button", "btn", p.label);
      b.addEventListener("click", function () {
        if (p.amounts) {
          p.amounts.forEach(function (v, i) {
            if (amtInputs[i]) amtInputs[i].value = String(v);
          });
        }
        if (p.capital) {
          ["cet1", "at1", "t2"].forEach(function (k) {
            if (p.capital[k] !== undefined) capInputs[k].value = String(p.capital[k]);
          });
        }
        slider.value = String(p.shock || 0);
        sval.textContent = moneyTxt(parseFloat(slider.value) || 0);
        if (p.note) { note.textContent = p.note; note.style.display = "block"; }
        compute();
      });
      prow.appendChild(b);
    });

    amtInputs.forEach(function (i) { i.addEventListener("input", compute); });
    ["cet1", "at1", "t2"].forEach(function (k) {
      capInputs[k].addEventListener("input", compute);
    });
    slider.addEventListener("input", function () {
      sval.textContent = moneyTxt(parseFloat(slider.value) || 0);
      compute();
    });

    wrap.appendChild(prow);
    wrap.appendChild(note);
    wrap.appendChild(tpanel);
    wrap.appendChild(cpanel);
    wrap.appendChild(spanel);
    wrap.appendChild(rpanel);
    wrap.appendChild(rpanel2);
    wrap.appendChild(gpanel);
    wrap.appendChild(read);
    root.appendChild(wrap);
    compute();
  }
};
