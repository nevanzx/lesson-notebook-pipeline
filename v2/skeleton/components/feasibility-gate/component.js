LN.components["feasibility-gate"] = {
  init: function (root, d) {
    var cases = d.cases || [];
    var state = {};
    cases.forEach(function (c) { state[c.id] = { picks: {}, res: null }; });
    var active = cases[0].id;
    var wrap = LN.h("div", { class: "ln-comp ln-gate" });
    var tabs = LN.h("div", { class: "gate-tabs" });
    var body = LN.h("div", { class: "gate-body" });
    function verdictOf(c, st) {
      var worst = "go";
      c.domains.forEach(function (dm, i) {
        if (st.picks[i] === "marginal" && worst === "go") worst = "marginal";
        if (st.picks[i] === "fail") worst = "fail";
      });
      return worst;
    }
    function resBox(c, st) {
      var worst = st.res.worst;
      var verdict = worst === "fail" ? "NO-GO" : worst === "marginal" ? "CONDITIONAL GO" : "GO";
      return LN.h("div", { class: "fb show " + (worst === "fail" ? "no" : worst === "marginal" ? "info" : "ok") }, [
        LN.h("b", { text: "Your judgment: " + verdict + ". " }),
        LN.h("span", { text: (st.res.matched ? "You matched the lesson's judgment. " : "The lesson reached a different verdict. ") + c.outcome })
      ]);
    }
    function render() {
      tabs.innerHTML = "";
      cases.forEach(function (c) {
        tabs.appendChild(LN.h("button", { type: "button", class: "btn" + (c.id === active ? " gate-active" : ""),
          text: c.name, onclick: function () { active = c.id; render(); } }));
      });
      body.innerHTML = "";
      var c = null;
      cases.forEach(function (x) { if (x.id === active) c = x; });
      var st = state[c.id];
      c.domains.forEach(function (dm, i) {
        var btns = {};
        var opts = LN.h("div", { class: "gate-opts" });
        ["pass", "marginal", "fail"].forEach(function (v) {
          btns[v] = LN.h("button", { type: "button", text: v.toUpperCase(),
            class: "vbtn v-" + v + (st.picks[i] === v ? " sel" : ""), onclick: function () {
              if (st.res) return;
              st.picks[i] = v;
              ["pass", "marginal", "fail"].forEach(function (k) {
                btns[k].className = "vbtn v-" + k + (st.picks[i] === k ? " sel" : "");
              });
            } });
          opts.appendChild(btns[v]);
        });
        body.appendChild(LN.h("div", { class: "gate-row" }, [
          LN.h("div", { class: "gate-fact" }, [LN.h("b", { text: dm.d }), LN.h("span", { class: "gate-t", text: dm.fact })]),
          opts
        ]));
      });
      var msg = LN.h("div", { class: "fb info" });
      var sub = LN.h("button", { type: "button", class: "btn gate-submit", text: "Submit judgment", onclick: function () {
        if (Object.keys(st.picks).length < c.domains.length) {
          msg.className = "fb info show";
          msg.textContent = "Judge every domain first \u2014 pass, marginal, or fail.";
          pulse(".fb.info.show");
          return;
        }
        msg.className = "fb info";
        var worst = verdictOf(c, st);
        var matched = (c.lessonVerdict === "nogo") === (worst === "fail");
        st.res = { worst: worst, matched: matched };
        finish();
        pulse(".fb.no, .fb.ok");
      } });
      function finish() {
        if (!st.res) return;
        sub.disabled = true;
        body.querySelectorAll(".vbtn").forEach(function (b) { b.disabled = true; });
        body.appendChild(resBox(c, st));
      }
      body.appendChild(sub);
      body.appendChild(msg);
      if (st.res) { finish(); pulse(".fb.no, .fb.ok, .fb.info.show"); }
      function pulse(sel) {
        var n = body.querySelector(sel); if (!n) return;
        n.classList.remove("pop"); void n.offsetWidth; n.classList.add("pop");
      }
    }
    wrap.appendChild(tabs);
    wrap.appendChild(body);
    render();
    root.appendChild(wrap);
  }
};
