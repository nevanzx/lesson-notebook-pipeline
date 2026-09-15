LN.components["step-solver"] = {
  init: function (root, d) {
    (Array.isArray(d) ? d : [d]).forEach(function (ex) { root.appendChild(one(ex)); });
    function one(ex) {
      var wrap = LN.h("div", { class: "ln-comp ln-solver card" });
      wrap.appendChild(LN.h("h3", { text: ex.title || "Worked example" }));
      if (ex.story) wrap.appendChild(LN.h("p", { text: ex.story }));
      var recs = [];
      (ex.steps || []).forEach(function (st, i) {
        var inp = LN.h("input", { type: "text", inputmode: "decimal",
          "aria-label": st.q, placeholder: "your answer" });
        recs.push({ inp: inp, st: st });
        wrap.appendChild(LN.h("div", { class: "step" }, [
          LN.h("span", { class: "n", text: String(i + 1) }),
          LN.h("span", { class: "q", text: st.q }),
          LN.h("span", { class: "inp" }, [
            st.pre ? LN.h("span", { class: "chip", text: st.pre }) : null,
            inp,
            (st.unit || st.suf) ? LN.h("span", { class: "chip", text: st.unit || st.suf }) : null
          ])
        ]));
      });
      var msg = LN.h("div", { class: "fb info", text: "" });
      var tools = LN.h("div", { class: "sg-tools" });
      tools.appendChild(LN.h("button", { type: "button", class: "btn", text: "Check my answers", onclick: function () {
        var bad = 0;
        recs.forEach(function (rec) {
          var v = rec.inp.value.trim();
          var ok = v !== "" && LN.close(LN.num(v), Number(rec.st.a), rec.st.tol);
          rec.inp.className = ok ? "ok" : "bad";       /* empties marked too - no lying feedback */
          if (!ok) bad++;
        });
        msg.className = "fb show " + (bad ? "no" : "ok");
        msg.textContent = bad ? "Some answers are missing or incorrect \u2014 red outlines mark them."
          : "All steps correct \u2014 nice work.";
      } }));
      var sol = null;
      if (ex.solution) {
        sol = LN.h("div", { class: "fb info sol", text: ex.solution });
        tools.appendChild(LN.h("button", { type: "button", class: "btn", text: "Show full solution",
          onclick: function () { sol.classList.toggle("show"); } }));
      }
      wrap.appendChild(tools);
      wrap.appendChild(msg);
      if (sol) wrap.appendChild(sol);
      return wrap;
    }
  }
};
