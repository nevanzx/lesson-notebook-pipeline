LN.components["ranked-statements"] = {
  init: function (root, d) {
    var self = this;
    var items = d.items || [], n = items.length, picked = [];
    var wrap = LN.h("div", { class: "ln-comp ln-rank" });
    var bank = LN.h("div", { class: "rk-bank" });
    var lineup = LN.h("ol", { class: "rk-lineup" });
    var fb = LN.h("div", { class: "fb info", text: "" });
    wrap.appendChild(LN.h("p", { text: d.prompt || "Put these statements in the correct order." }));
    wrap.appendChild(LN.h("span", { class: "chip rk-dir", text: d.direction || "First \u2192 last" }));
    function refresh() {
      bank.innerHTML = ""; lineup.innerHTML = "";
      items.forEach(function (it, i) {
        if (picked.indexOf(i) === -1) {
          bank.appendChild(LN.h("button", { type: "button", class: "rk-chip", text: it.t,
            onclick: function () { picked.push(i); refresh(); } }));
        }
      });
      picked.forEach(function (i, pos) {
        lineup.appendChild(LN.h("li", {}, [
          LN.h("button", { type: "button", class: "rk-slot", text: items[i].t,
            onclick: function () { picked.splice(pos, 1); refresh(); } })
        ]));
      });
      fb.className = "fb info";
    }
    wrap.appendChild(bank);
    wrap.appendChild(LN.h("div", { class: "rk-tools" }, [
      LN.h("button", { type: "button", class: "btn", text: "Check order", onclick: function () {
        if (picked.length !== n) {
          fb.className = "fb no show";
          fb.textContent = "Place all " + n + " items before checking.";
          return;
        }
        var hits = 0;
        picked.forEach(function (i, pos) { if (items[i].rank === pos + 1) hits++; });
        fb.className = "fb show " + (hits === n ? "ok" : "no");
        fb.textContent = hits === n
          ? "Correct order \u2014 all " + n + " statements in place."
          : hits + " of " + n + " in the right slot. Click any placed item to put it back.";
      } }),
      LN.h("button", { type: "button", class: "btn", text: "Reset",
        onclick: function () { root.innerHTML = ""; self.init(root, d); } })
    ]));
    wrap.appendChild(lineup);
    wrap.appendChild(fb);
    refresh();
    root.appendChild(wrap);
  }
};
