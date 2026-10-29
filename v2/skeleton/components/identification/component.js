LN.components["identification"] = {
  init: function (root, d) {
    var self = this;
    var items = d.items || [], score = 0;
    var wrap = LN.h("div", { class: "ln-comp ln-id" });
    var chip = LN.h("span", { class: "chip", text: "score 0 / " + items.length });
    function norm(s) {
      return String(s == null ? "" : s).toLowerCase()
        .replace(/[^a-z0-9%$.\s-]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^[\s.-]+|[\s.-]+$/g, "");
    }
    function accepted(it) {
      return [it.a].concat(it.aliases || []).map(norm);
    }
    wrap.appendChild(LN.h("div", { class: "id-head" }, [
      LN.h("span", { class: "id-note",
        text: d.prompt || "Identify the term or concept each item describes." }),
      chip,
      LN.h("button", { type: "button", class: "btn", text: "Reset",
        onclick: function () { root.innerHTML = ""; self.init(root, d); } })
    ]));
    items.forEach(function (it) {
      var locked = false;
      var ok = accepted(it);
      var inp = LN.h("input", { type: "text", class: "id-input",
        placeholder: "Type the term" });
      var btn = LN.h("button", { type: "button", class: "id-check", text: "Check" });
      var expl = LN.h("div", { class: "fb info" });
      function answer() {
        if (locked) return;
        var val = norm(inp.value);
        if (!val) return;
        locked = true;
        var good = ok.indexOf(val) !== -1;
        if (good) score++;
        inp.disabled = true;
        btn.disabled = true;
        inp.className = "id-input " + (good ? "picked-ok" : "picked-bad");
        expl.className = "fb show " + (good ? "ok" : "no");
        expl.textContent = (good ? "Correct." :
          "Not quite. The answer is \u201c" + it.a + ".\u201d") +
          (it.e ? " " + it.e : "");
        chip.textContent = "score " + score + " / " + items.length;
      }
      btn.addEventListener("click", answer);
      inp.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") answer();
      });
      wrap.appendChild(LN.h("div", { class: "id-item" }, [
        LN.h("div", { class: "id-q", text: it.q }),
        LN.h("div", { class: "id-row" }, [inp, btn]),
        expl
      ]));
    });
    root.appendChild(wrap);
  }
};
