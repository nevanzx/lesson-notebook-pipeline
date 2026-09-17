(function () {
  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  function app(d, o) {
    for (var k in o) d.appendChild(typeof o[k] === 'string' ? document.createTextNode(o[k]) : o[k]);
    return d;
  }
  function div(cls) { var d = document.createElement('div'); d.className = cls; return d; }

  LN.components = LN.components || {};
  LN.components['port-lab'] = function (el, key) {
    var d = LN.data[key];
    var root = div('pl-root');
    var grid = div('pl-grid');
    var ctrl = div('pl-ctrl');
    var out = div('pl-out');
    var tbl = document.createElement('table');
    tbl.className = 'pl-tbl';
    var rows = [
      ['Portfolio risk \u03c3\u209a', 'sig'],
      ['Weighted-average risk', 'avg'],
      ['Benefit from diversification', 'gain']
    ];
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      var td1 = document.createElement('td'); td1.textContent = r[0];
      var td2 = document.createElement('td'); td2.textContent = '\u2014';
      tr.appendChild(td1); tr.appendChild(td2); tbl.appendChild(tr);
      r.push(td2);
    });
    var verdict = div('pl-verdict');
    root.appendChild(el.title ? titleEl(el.title) : document.createDocumentFragment());
    grid.appendChild(ctrl); grid.appendChild(out);
    out.appendChild(tbl); out.appendChild(verdict);
    root.appendChild(grid);
    el.appendChild(root);

    var sliders = {};
    function slide(name, label, min, max, step, val) {
      var lab = document.createElement('label');
      lab.appendChild(document.createTextNode(label + ': '));
      var span = document.createElement('span'); span.textContent = '';
      lab.appendChild(span); lab.appendChild(document.createElement('br'));
      var inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      lab.appendChild(inp);
      ctrl.appendChild(lab);
      sliders[name] = { span: span, inp: inp };
      return inp;
    }

    var ws = slide('w', d.sliderW || 'Weight in ' + d.assets[1], 0, 1, 0.01, d.init != null ? d.init : 0.5);
    var rs = slide('rho', 'Correlation \u03c1', d.rhoMin != null ? d.rhoMin : -1, d.rhoMax != null ? d.rhoMax : 1, 0.01, d.rhoInit != null ? d.rhoInit : 0.3);

    function name(n) { return d.assets[n]; }
    function calc() {
      var w2 = parseFloat(sliders.w.inp.value);
      var w1 = 1 - w2;
      var rho = parseFloat(sliders.rho.inp.value);
      var s1 = d.sig1, s2 = d.sig2;
      var varp = w1 * w1 * s1 * s1 + w2 * w2 * s2 * s2 + 2 * w1 * w2 * rho * s1 * s2;
      var sigp = Math.sqrt(Math.max(varp, 0));
      var avg = w1 * s1 + w2 * s2;
      var gain = avg - sigp;
      var mu = w1 * d.mu1 + w2 * d.mu2;
      function slideNum(key, to, fmtFn) {
        var cell = null;
        rows.forEach(function (r) { if (r[1] === key) cell = r[3]; });
        var from = shown[key] == null ? to : shown[key];
        LN.tween(from, to, 200, function (v) { fmtFn(cell, v); });
        shown[key] = to;
      }
      var shown = { sig: null, avg: null, gain: null, mu: null };
      sliders.w.span.textContent = pct(w2) + ' \u00b7 ' + name(1) + ' / ' + pct(w1) + ' \u00b7 ' + name(0);
      sliders.rho.span.textContent = rho.toFixed(2);
      slideNum('sig', sigp, function (c, v) { c.textContent = pct(v); });
      slideNum('avg', avg, function (c, v) { c.textContent = pct(v); });
      slideNum('gain', gain, function (c, v) {
        c.textContent = pct(v) + (gain > 0.0005 ? ' (risk diversified away)' : ' (no benefit \u2014 \u03c1 = +1)');
      });
      slideNum('mu', mu, function (c, v) { c.textContent = pct(v); });
      verdict.textContent = gain > 0.002
        ? 'With \u03c1 = ' + rho.toFixed(2) + ', this mix carries ' + pct(gain) + ' less risk than simply blending the two stocks \u2014 the frontier\u2019s leftward bulge, in numbers.'
        : 'At \u03c1 = +1 the assets move in lockstep: no amount of re-weighing removes \u2014 or adds \u2014 risk.';
    }
    ws.addEventListener('input', calc);
    rs.addEventListener('input', calc);
    calc();
  };

  function titleEl(t) { var h = document.createElement('p'); h.className = 'pl-title'; h.textContent = t; return h; }
})();
