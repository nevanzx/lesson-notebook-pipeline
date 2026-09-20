LN.components["case-match"] = {
  init: function (root, d) {
    var sc = d.scenarios || [], concepts = d.concepts || [], score = 0;
    var wrap = LN.h("div", { class: "ln-comp ln-match" });
    var chip = LN.h("span", { class: "chip", text: "0 / " + sc.length });
    wrap.appendChild(LN.h("div", { class: "mt-head" }, [
      LN.h("span", { class: "mt-note", text: d.prompt || "Match each scenario to the concept it shows." }),
      chip
    ]));
    sc.forEach(function (s) {
      var sel = LN.h("select", { class: "mt-sel", "aria-label": s.text });
      sel.appendChild(LN.h("option", { value: "", text: "Pick\u2026" }));
      concepts.forEach(function (c) { sel.appendChild(LN.h("option", { value: c, text: c })); });
      var fb = LN.h("span", { class: "mt-fb", text: "" });
      var solved = false;
      sel.addEventListener("change", function () {
        if (solved) return;
        if (sel.value === s.answer) {
          solved = true; score++;
          sel.disabled = true;
          fb.className = "mt-fb ok";
          fb.textContent = "Correct";
        } else {
          fb.className = "mt-fb no";
          fb.textContent = "Not quite \u2014 try again" + (s.e ? ": " + s.e : "");
        }
        chip.textContent = score + " / " + sc.length;
      });
      wrap.appendChild(LN.h("div", { class: "mt-row" }, [
        LN.h("span", { class: "mt-text", text: s.text }),
        LN.h("span", { class: "mt-pick" }, [sel, fb])
      ]));
    });
    root.appendChild(wrap);
  }
};
