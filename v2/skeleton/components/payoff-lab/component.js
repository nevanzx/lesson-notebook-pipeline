/* payoff-lab — hand-written component (proposed for library promotion).
   Data: LN.data.<key> = {
     title?, sub?,
     row: { name, strategies: [s0, s1] },      // row player, top to bottom
     col: { name, strategies: [s0, s1] },      // column player, left to right
     unit?,                                    // payoff prefix, e.g. "$"
     matrix: [[ [rp, cp], [rp, cp] ],
              [ [rp, cp], [rp, cp] ]],          // [rowIdx][colIdx]
     demand?, prices?, ranges?,                 // optional live builder
     solution?
   }
   Builder form: demand { a, b, c, cost } (or cost:{row,col}), prices
   { row:[p0,p1], col:[p0,p1] }, ranges { b:[min,max,step], c:[...],
   cost:[...], price:[...] }. The matrix is then derived from
   Qi = a - b*Pi + c*Pj and pi = (P - C) * Q, and every cell shows its own
   working. Every verdict is computed from the four cells; nothing here
   asserts a game-theoretic fact the data does not carry. */
LN.components["payoff-lab"] = {
  init: function (root, d) {
    d = d || {};
    var row = d.row || { name: "Row firm", strategies: ["A1", "A2"] };
    var col = d.col || { name: "Col firm", strategies: ["B1", "B2"] };
    var two = 2;
    if (!row.strategies || row.strategies.length !== two ||
        !col.strategies || col.strategies.length !== two) {
      root.appendChild(LN.h("p", { class: "pl-sub",
        text: "payoff-lab needs exactly two strategies for each firm." }));
      return;
    }
    var unit = d.unit == null ? "" : String(d.unit);
    var dm = d.demand || null;
    var cost = dm ? (typeof dm.cost === "object" && dm.cost !== null
      ? { row: dm.cost.row, col: dm.cost.col }
      : { row: dm.cost, col: dm.cost }) : null;

    function h(tag, cls, txt) {
      var e = LN.h(tag, { class: cls || "" });
      if (txt != null) e.textContent = txt;
      return e;
    }
    function num(n) {
      if (n == null || !isFinite(n)) return "—";
      var r = Math.round(n * 100) / 100;
      var s = (Math.abs(r - Math.round(r)) < 0.005) ? String(Math.round(r))
        : String(r);
      return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    function money(n) { return unit + num(n); }
    function total(c) { return c[0] + c[1]; }

    var wrap = h("div", "pl-root");
    if (d.title) wrap.appendChild(h("p", "pl-title", d.title));
    if (d.sub) wrap.appendChild(h("p", "pl-sub", d.sub));

    /* ---- live builder: only when the source's own demand block is given --- */
    var st = null, ins = [];
    if (dm) {
      st = {
        a: +dm.a, b: +dm.b, c: +dm.c,
        pr: [+(d.prices.row[0]), +(d.prices.row[1])],
        pc: [+(d.prices.col[0]), +(d.prices.col[1])]
      };
      var ctl = h("div", "pl-ctrl");
      ctl.appendChild(h("p", "pl-ctl-h", "Build the matrix — edit the inputs"));
      var grid = h("div", "pl-ctl-grid");
      ctl.appendChild(grid);
      wrap.appendChild(ctl);
      function slider(label, min, max, step, get, set) {
        var lab = h("label");
        var val = h("span");
        lab.appendChild(document.createTextNode(label + "  "));
        lab.appendChild(val);
        var inp = document.createElement("input");
        inp.type = "range";
        inp.min = min; inp.max = max; inp.step = step;
        inp.value = get();
        inp.setAttribute("aria-label", label);
        inp.addEventListener("input", function () {
          set(parseFloat(inp.value));
          val.textContent = get();
          paint();
        });
        lab.appendChild(inp);
        grid.appendChild(lab);
        val.textContent = get();
        ins.push(inp);
      }
      var R = d.ranges || {};
      var br = R.b || [0, Math.max(10, st.b), 1];
      var cr = R.c || [0, Math.max(10, st.c), 1];
      var kr = R.cost || [0, Math.max(20, cost.row), 1];
      var pr = R.price || [0, 40, 1];
      slider("Base demand a", Math.min(0, st.a), Math.max(200, st.a), 1,
        function () { return st.a; }, function (v) { st.a = v; });
      slider("Own-price sensitivity b", br[0], br[1], br[2],
        function () { return st.b; }, function (v) { st.b = v; });
      slider("Cross-price sensitivity c", cr[0], cr[1], cr[2],
        function () { return st.c; }, function (v) { st.c = v; });
      slider(cost.row === cost.col ? "Unit cost"
        : "Unit cost (" + row.name + ")",
        kr[0], kr[1], kr[2],
        function () { return cost.row; }, function (v) { cost.row = v; });
      if (cost.col !== cost.row) {
        slider("Unit cost (" + col.name + ")", kr[0], kr[1], kr[2],
          function () { return cost.col; }, function (v) { cost.col = v; });
      }
      slider(row.name + " high price", pr[0], pr[1], pr[2],
        function () { return st.pr[0]; }, function (v) { st.pr[0] = v; });
      slider(row.name + " low price", pr[0], pr[1], pr[2],
        function () { return st.pr[1]; }, function (v) { st.pr[1] = v; });
      slider(col.name + " high price", pr[0], pr[1], pr[2],
        function () { return st.pc[0]; }, function (v) { st.pc[0] = v; });
      slider(col.name + " low price", pr[0], pr[1], pr[2],
        function () { return st.pc[1]; }, function (v) { st.pc[1] = v; });
    }

    /* ---- the four cells ------------------------------------------------- */
    function derive() {
      var M = [], neg = false;
      for (var i = 0; i < two; i++) {
        M[i] = [];
        for (var j = 0; j < two; j++) {
          if (!dm) { M[i][j] = d.matrix[i][j].slice(); continue; }
          var qa = st.a - st.b * st.pr[i] + st.c * st.pc[j];
          var qb = st.a - st.b * st.pc[j] + st.c * st.pr[i];
          if (qa < 0 || qb < 0) neg = true;
          M[i][j] = [(st.pr[i] - cost.row) * qa, (st.pc[j] - cost.col) * qb];
        }
      }
      return { M: M, neg: neg };
    }
    function working(i, j) {
      if (!dm) return null;
      var rq = st.a - st.b * st.pr[i] + st.c * st.pc[j];
      var cq = st.a - st.b * st.pc[j] + st.c * st.pr[i];
      var rP = st.pr[i], cP = st.pc[j], ra = st.a, b = st.b, c = st.c;
      var rs = d.sym && d.sym.row ? d.sym.row : row.name;
      var cs = d.sym && d.sym.col ? d.sym.col : col.name;
      // NBSP-joined so a narrow cell wraps between terms, never inside one
      function L() { return Array.prototype.join.call(arguments, " "); }
      return {
        row: L("Q" + rs, "=", num(ra), "−", num(b) + "(" + num(rP) + ")",
          "+", num(c) + "(" + num(cP) + ")", "=", num(rq)),
        prow: L("π" + rs, "=", "(" + num(rP) + "−" + num(cost.row) + ")",
          "×", num(rq), "=", num((rP - cost.row) * rq)),
        col: L("Q" + cs, "=", num(ra), "−", num(b) + "(" + num(cP) + ")",
          "+", num(c) + "(" + num(rP) + ")", "=", num(cq)),
        pcol: L("π" + cs, "=", "(" + num(cP) + "−" + num(cost.col) + ")",
          "×", num(cq), "=", num((cP - cost.col) * cq))
      };
    }

    /* ---- read the matrix back -------------------------------------------
       rowBR[j]  = the row strategy that maximises the row payoff in column j
       colBR[i]  = the column strategy that maximises the column payoff in row i
       nash      = cells where each player is already best-responding
       mutual    = a cell that is no worse for BOTH players than every Nash
                   cell and strictly better for at least one — the source's
                   "mutually preferred" cell. Highest joint total wins.
                   null means no such cell: the equilibrium is not a
                   prisoner's dilemma, it is a coordination problem. */
    var EPS = 1e-9;
    function analyse(M) {
      var i, j;
      var rowBR = [], colBR = [];
      for (j = 0; j < two; j++)
        rowBR.push(M[0][j][0] >= M[1][j][0] - EPS ? 0 : 1);
      for (i = 0; i < two; i++)
        colBR.push(M[i][0][1] >= M[i][1][1] - EPS ? 0 : 1);
      var nash = [];
      for (i = 0; i < two; i++) for (j = 0; j < two; j++)
        if (rowBR[j] === i && colBR[i] === j) nash.push([i, j]);
      var rowDom = (rowBR[0] === rowBR[1]) ? rowBR[0] : null;
      var colDom = (colBR[0] === colBR[1]) ? colBR[0] : null;
      var mutual = null, bestT = -Infinity;
      for (i = 0; i < two; i++) for (j = 0; j < two; j++) {
        var ok = true, strict = false, k;
        for (k = 0; k < nash.length; k++) {
          var n = nash[k], t = M[n[0]][n[1]];
          if (M[i][j][0] < t[0] - EPS || M[i][j][1] < t[1] - EPS) ok = false;
          if (M[i][j][0] > t[0] + EPS || M[i][j][1] > t[1] + EPS) strict = true;
        }
        if (ok && strict && total(M[i][j]) > bestT + EPS) {
          bestT = total(M[i][j]);
          mutual = [i, j];
        }
      }
      return { rowBR: rowBR, colBR: colBR, nash: nash, rowDom: rowDom,
        colDom: colDom, mutual: mutual };
    }

    var body = h("div", "pl-body");
    var scroll = h("div", "pl-scroll");
    var read = h("div", "pl-read");
    body.appendChild(scroll);
    body.appendChild(read);
    wrap.appendChild(body);
    var warn = h("p", "pl-warn");
    if (dm) wrap.appendChild(warn);
    if (d.solution) wrap.appendChild(h("p", "pl-sub", d.solution));
    root.appendChild(wrap);

    function cellName(p) {
      return "(" + row.strategies[p[0]] + ", " + col.strategies[p[1]] + ")";
    }
    function para(lead, txt) {
      var p = document.createElement("p");
      p.appendChild(LN.h("b", { text: lead + " " }));
      p.appendChild(document.createTextNode(txt));
      read.appendChild(p);
    }

    function paint() {
      var r = derive(), M = r.M, A = analyse(M), i, j;

      scroll.innerHTML = "";
      var tbl = document.createElement("table");
      tbl.className = "pl-tbl";
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      hr.appendChild(h("th", "pl-corner", row.name + " \\ " + col.name));
      for (j = 0; j < two; j++) {
        var th = document.createElement("th");
        th.textContent = dm ? col.strategies[j] + " · " + unit + num(st.pc[j])
          : col.strategies[j];
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      tbl.appendChild(thead);
      var tb = document.createElement("tbody");
      for (i = 0; i < two; i++) {
        var tr = document.createElement("tr");
        var rh = document.createElement("th");
        rh.textContent = dm ? row.strategies[i] + " · " + unit + num(st.pr[i])
          : row.strategies[i];
        tr.appendChild(rh);
        for (j = 0; j < two; j++) {
          var isNash = A.nash.some(function (q) { return q[0] === i && q[1] === j; });
          var isMutual = A.mutual && A.mutual[0] === i && A.mutual[1] === j;
          var td = document.createElement("td");
          if (isNash) td.className = "pl-nash";
          td.appendChild(h("span", "pl-pay",
            money(M[i][j][0]) + ", " + money(M[i][j][1])));
          td.appendChild(h("span", "pl-who", row.name + ", then " + col.name));
          var tags = h("span", "pl-tags");
          if (A.rowBR[j] === i)
            tags.appendChild(h("span", "pl-tag", row.name + " best response"));
          if (A.colBR[i] === j)
            tags.appendChild(h("span", "pl-tag", col.name + " best response"));
          if (isNash) tags.appendChild(h("span", "pl-tag nash", "Nash equilibrium"));
          if (isMutual)
            tags.appendChild(h("span", "pl-tag coop", "both would rather be here"));
          if (tags.childNodes.length) td.appendChild(tags);
          var w = working(i, j);
          if (w) {
            td.appendChild(h("span", "pl-work", w.row));
            td.appendChild(h("span", "pl-work", w.prow));
            td.appendChild(h("span", "pl-work", w.col));
            td.appendChild(h("span", "pl-work", w.pcol));
          }
          tr.appendChild(td);
        }
        tb.appendChild(tr);
      }
      tbl.appendChild(tb);
      scroll.appendChild(tbl);

      read.innerHTML = "";
      var rb = [], cb = [];
      for (j = 0; j < two; j++)
        rb.push(col.strategies[j] + " → " + row.strategies[A.rowBR[j]]);
      for (i = 0; i < two; i++)
        cb.push(row.strategies[i] + " → " + col.strategies[A.colBR[i]]);
      para(row.name + "'s best responses:", rb.join("; ") + ".");
      para(col.name + "'s best responses:", cb.join("; ") + ".");

      var domTxt = [];
      domTxt.push(A.rowDom !== null
        ? row.name + " has a dominant strategy — " + row.strategies[A.rowDom] +
          " pays best whatever " + col.name + " chooses."
        : row.name + " has no dominant strategy: its best reply changes with " +
          col.name + "'s choice, so it has to watch the rival rather than ignore it.");
      domTxt.push(A.colDom !== null
        ? col.name + " has a dominant strategy — " + col.strategies[A.colDom] +
          " pays best whatever " + row.name + " chooses."
        : col.name + " has no dominant strategy: its best reply changes with " +
          row.name + "'s choice.");
      para("Dominance:", domTxt.join(" "));

      if (A.nash.length === 0) {
        para("Equilibrium:", "No cell survives a unilateral change, so this matrix has " +
          "no Nash equilibrium — one of the two firms can always do better by " +
          "switching strategy alone.");
      } else if (A.nash.length === 1) {
        var n0 = A.nash[0], c0 = M[n0[0]][n0[1]];
        para("Equilibrium:", "Neither firm gains by switching alone at " +
          cellName(n0) + ", where " + row.name + " earns " + money(c0[0]) +
          " and " + col.name + " earns " + money(c0[1]) +
          ". That is the Nash equilibrium" +
          (A.rowDom !== null && A.colDom !== null
            ? ", and it is also the dominant-strategy equilibrium." : "."));
      } else {
        para("Equilibrium:", A.nash.length + " cells are Nash equilibria — " +
          A.nash.map(cellName).join(", ") + ". The payoff matrix alone cannot say " +
          "which one actually happens; coordination on a focal point or an " +
          "institutional arrangement decides it.");
      }

      if (A.nash.length === 0) {
        para("Welfare:", "With no equilibrium to compare against, the only reading " +
          "is that neither firm's position is stable — look for the cell where " +
          "the joint total is highest.");
      } else if (A.mutual) {
        var mc = M[A.mutual[0]][A.mutual[1]];
        var worst = A.nash[0], wc = M[worst[0]][worst[1]];
        A.nash.forEach(function (n) {
          if (total(M[n[0]][n[1]]) < total(wc)) { worst = n; wc = M[n[0]][n[1]]; }
        });
        para("Welfare:", "Both firms would rather be at " + cellName(A.mutual) +
          " — " + money(mc[0]) + " and " + money(mc[1]) + ", " + money(total(mc)) +
          " between them — yet each reaches only " + money(total(wc)) +
          " at the equilibrium. The gap of " + money(total(mc) - total(wc)) +
          " is the welfare loss neither firm can escape by acting alone.");
      } else {
        para("Welfare:", "No single cell leaves both firms better off than the " +
          "equilibrium, so this game is a coordination problem, not a prisoner's " +
          "dilemma: the firms could do better on some other payoffs, but not " +
          "together and only by moving at the same time.");
      }

      if (dm) {
        warn.hidden = !r.neg;
        if (r.neg) {
          warn.textContent = "These inputs return a negative quantity on at " +
            "least one cell, so the demand function has left the range in which " +
            "it holds. Lower a price or a sensitivity.";
        }
      }
    }

    paint();
  }
};
