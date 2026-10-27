/* mcq — a flat multiple-choice activity: one question per card, four lettered
 * choices, one-way lock, instant Correct / Not quite feedback with the reason.
 * All wording lives in the data object (LN.data[key]); this file is content-free.
 * Data: { prompt?: string, items: [{ q, choices:[…], ans:<index>, e?: string }] }
 */
LN.components["mcq"] = {
  init: function (root, d) {
    var self = this;
    var items = d.items || [], score = 0;
    var KEYS = ["A", "B", "C", "D", "E", "F"];
    var wrap = LN.h("div", { class: "ln-comp ln-mcq" });
    var chip = LN.h("span", { class: "chip", text: "score 0 / " + items.length });
    wrap.appendChild(LN.h("div", { class: "mcq-head" }, [
      LN.h("span", { class: "mcq-note",
        text: d.prompt || "Pick the best answer to each question." }),
      chip,
      LN.h("button", { type: "button", class: "btn", text: "Reset",
        onclick: function () { root.innerHTML = ""; self.init(root, d); } })
    ]));
    items.forEach(function (it) {
      var locked = false;
      var choices = it.choices || [];
      var expl = LN.h("div", { class: "fb info" });
      var btns = choices.map(function (c, j) {
        return LN.h("button", { type: "button", class: "mcq-btn" }, [
          LN.h("span", { class: "mcq-key", text: KEYS[j] || String(j + 1) }),
          LN.h("span", { class: "mcq-txt", text: c })
        ]);
      });
      function answer(pick) {
        if (locked) return;                          /* no retry */
        locked = true;
        var ok = pick === it.ans;
        if (ok) score++;
        btns.forEach(function (b, j) {
          b.disabled = true;
          if (j === pick) b.className = "mcq-btn " + (ok ? "picked-ok" : "picked-bad");
          else if (j === it.ans) b.className = "mcq-btn reveal";
          else b.className = "mcq-btn faded";
        });
        var msg = ok ? "Correct." : "Not quite.";
        expl.textContent = it.e ? msg + " " + it.e : msg;
        expl.className = "fb show " + (ok ? "ok" : "no");
        chip.textContent = "score " + score + " / " + items.length;   /* denominator = total, always */
      }
      btns.forEach(function (b, j) {
        b.addEventListener("click", function () { answer(j); });
      });
      wrap.appendChild(LN.h("div", { class: "mcq-item" }, [
        LN.h("div", { class: "mcq-q", text: it.q }),
        LN.h("div", { class: "mcq-opts" }, btns),
        expl
      ]));
    });
    root.appendChild(wrap);
  }
};
