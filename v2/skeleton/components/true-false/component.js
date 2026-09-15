LN.components["true-false"] = {
  init: function (root, d) {
    var self = this;
    var items = d.items || [], score = 0;
    var wrap = LN.h("div", { class: "ln-comp ln-tf" });
    var chip = LN.h("span", { class: "chip", text: "score 0 / " + items.length });
    wrap.appendChild(LN.h("div", { class: "tf-head" }, [
      LN.h("span", { class: "tf-note", text: "Calibration, not grading. Every statement is situational \u2014 hunt the trap." }),
      chip,
      LN.h("button", { type: "button", class: "btn", text: "Reset",
        onclick: function () { root.innerHTML = ""; self.init(root, d); } })
    ]));
    items.forEach(function (it) {
      var locked = false;
      var expl = LN.h("div", { class: "fb info" });
      var bt = LN.h("button", { type: "button", class: "tf-btn", text: "TRUE" });
      var bf = LN.h("button", { type: "button", class: "tf-btn", text: "FALSE" });
      function answer(pick) {
        if (locked) return;                          /* no retry */
        locked = true;
        var ok = pick === !!it.a;
        if (ok) score++;
        bt.disabled = true; bf.disabled = true;
        (pick ? bt : bf).className = "tf-btn " + (ok ? "picked-ok" : "picked-bad");
        (pick ? bf : bt).className = "tf-btn faded";
        expl.className = "fb show " + (ok ? "ok" : "no");
        expl.textContent = (ok ? "Correct. " : "Not quite. ") + it.e;
        chip.textContent = "score " + score + " / " + items.length;   /* denominator = total, always */
      }
      bt.addEventListener("click", function () { answer(true); });
      bf.addEventListener("click", function () { answer(false); });
      wrap.appendChild(LN.h("div", { class: "tf-item" }, [
        LN.h("div", { class: "tf-s", text: it.s }),
        LN.h("div", { class: "tf-opts" }, [bt, bf]),
        expl
      ]));
    });
    root.appendChild(wrap);
  }
};
