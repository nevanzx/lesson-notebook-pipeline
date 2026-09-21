LN.components["ratio-lab"] = {
  init: function (root, d) {
    d = d || {};
    var FIELDS = [
      ["netSales", "Net sales"],
      ["netCreditSales", "Net credit sales"],
      ["cogs", "Cost of goods sold"],
      ["opInc", "Operating income"],
      ["netInc", "Net income"],
      ["avgInv", "Average inventory"],
      ["begAssets", "Beginning total assets"],
      ["endAssets", "Ending total assets"],
      ["avgAR", "Avg. accounts receivable"]
    ];
    var RATIOS = [
      ["assetTurn", "Asset turnover", "Net Sales \u00f7 Average Total Assets"],
      ["invTurn", "Inventory turnover", "COGS \u00f7 Average Inventory"],
      ["recTurn", "Receivables turnover", "Net Credit Sales \u00f7 Avg. Receivables"],
      ["opMargin", "Operating margin", "Operating Income \u00f7 Net Sales \u00d7 100%"],
      ["roa", "Return on assets", "Net Income \u00f7 Average Total Assets \u00d7 100%"]
    ];
    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }
    var wrap = el("div", "rl-root");
    if (d.title) wrap.appendChild(el("p", "rl-title", d.title));
    var prow = el("div", "rl-presets");
    var inputs = {};
    FIELDS.forEach(function (f) {
      var inp = document.createElement("input");
      inp.type = "number";
      inp.value = "0";
      inp.setAttribute("aria-label", f[1]);
      inputs[f[0]] = inp;
    });
    function val(name) { return parseFloat(inputs[name].value) || 0; }
    var grid = el("div", "rl-grid");
    FIELDS.forEach(function (f) {
      var box = el("div", "rl-field");
      box.appendChild(el("label", null, f[1]));
      box.appendChild(inputs[f[0]]);
      grid.appendChild(box);
    });
    var note = el("div", "rl-note", d.presetNote || "");
    note.style.display = "none";
    var out = el("div", "rl-out");
    var cells = {};
    RATIOS.forEach(function (r) {
      var card = el("div", "rl-card");
      card.appendChild(el("div", "rl-label", r[1]));
      card.appendChild(el("div", "rl-form", r[2]));
      var v = el("div", "rl-value", "\u2014");
      card.appendChild(v);
      out.appendChild(card);
      cells[r[0]] = v;
    });
    var readout = el("div", "rl-readout", "Enter figures above to see a plain-language read.");
    var sensBox = el("div", "rl-sens");
    var sensMax = d.sensMax || 20;
    var sensLab = el("div", "rl-sens-label");
    var sensQ = el("span", null, "What if net sales moved?");
    var sensPct = el("span", null, "0%");
    sensLab.appendChild(sensQ);
    sensLab.appendChild(sensPct);
    var slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(-sensMax);
    slider.max = String(sensMax);
    slider.step = "1";
    slider.value = "0";
    slider.setAttribute("aria-label", "Percent change in net sales");
    var sensOut = el("div", "rl-readout", "Move the slider to see how asset turnover and operating margin react to a change in net sales alone, holding costs and assets fixed.");
    sensBox.appendChild(sensLab);
    sensBox.appendChild(slider);
    sensBox.appendChild(sensOut);
    function fmt(x, suffix) {
      if (!isFinite(x) || x === 0) return "n/a";
      return x.toFixed(2) + (suffix || "");
    }
    function compute() {
      var netSales = val("netSales"), netCreditSales = val("netCreditSales"),
        cogs = val("cogs"), opInc = val("opInc"), netInc = val("netInc"),
        avgInv = val("avgInv"), beg = val("begAssets"), end = val("endAssets"),
        avgAR = val("avgAR");
      var avgAssets = (beg + end) / 2;
      var assetTurn = avgAssets > 0 ? netSales / avgAssets : 0;
      var invTurn = avgInv > 0 ? cogs / avgInv : 0;
      var recTurn = avgAR > 0 ? netCreditSales / avgAR : 0;
      var opMargin = netSales > 0 ? (opInc / netSales) * 100 : 0;
      var roa = avgAssets > 0 ? (netInc / avgAssets) * 100 : 0;
      cells.assetTurn.textContent = fmt(assetTurn, "\u00d7");
      cells.invTurn.textContent = fmt(invTurn, "\u00d7");
      cells.recTurn.textContent = fmt(recTurn, "\u00d7");
      cells.opMargin.textContent = fmt(opMargin, "%");
      cells.roa.textContent = fmt(roa, "%");
      var parts = [];
      if (assetTurn > 0) parts.push("the firm generates $" + assetTurn.toFixed(2) + " in sales per dollar of assets");
      if (invTurn > 0) parts.push("inventory turns over about " + invTurn.toFixed(1) + " times over the period");
      if (recTurn > 0) parts.push("credit sales are collected about " + recTurn.toFixed(1) + " times over the period");
      if (opMargin !== 0) parts.push("roughly " + opMargin.toFixed(0) + "% of each sales dollar survives as operating income");
      if (roa !== 0) parts.push("every dollar of assets returns about " + roa.toFixed(1) + " cents of net income");
      readout.textContent = parts.length
        ? "In plain terms: " + parts.join("; ") + ". Higher values generally indicate more efficient use of resources \u2014 compare with prior periods, budgeted targets, and industry benchmarks to judge whether efficiency is improving."
        : "Enter figures above to see a plain-language read.";
      runSens();
    }
    function runSens() {
      var pct = parseInt(slider.value, 10);
      sensPct.textContent = (pct > 0 ? "+" : "") + pct + "%";
      var base = val("netSales"), opInc = val("opInc"),
        avgAssets = (val("begAssets") + val("endAssets")) / 2;
      if (!(base > 0) || !(avgAssets > 0)) {
        sensOut.textContent = "Enter Net Sales and Total Assets above first.";
        return;
      }
      var moved = base * (1 + pct / 100);
      var t = moved / avgAssets;
      var m = (opInc / moved) * 100;
      sensOut.textContent = "At " + (pct > 0 ? "+" : "") + pct + "% net sales, asset turnover would be about "
        + t.toFixed(2) + "\u00d7 and operating margin about " + m.toFixed(1)
        + "% \u2014 turnover moves with sales, but margin only moves if operating income grows proportionally too (it is held fixed here).";
    }
    (d.presets || []).forEach(function (p) {
      var b = el("button", "btn", p.label);
      b.addEventListener("click", function () {
        FIELDS.forEach(function (f) {
          var v = p.values ? p.values[f[0]] : undefined;
          inputs[f[0]].value = v !== undefined ? String(v) : "0";
        });
        note.style.display = "block";
        compute();
      });
      prow.appendChild(b);
    });
    FIELDS.forEach(function (f) {
      inputs[f[0]].addEventListener("input", compute);
    });
    slider.addEventListener("input", runSens);
    wrap.appendChild(prow);
    wrap.appendChild(note);
    wrap.appendChild(grid);
    wrap.appendChild(out);
    wrap.appendChild(readout);
    wrap.appendChild(sensBox);
    root.appendChild(wrap);
    compute();
  }
};
