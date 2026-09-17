LN.components["flipcards"] = {
  init: function (root, d) {
    var wrap = LN.h("div", { class: "ln-comp ln-flip" });
    if (d.title) wrap.appendChild(LN.h("h3", { text: d.title }));
    var grid = LN.h("div", { class: "fl-grid" });
    (d.cards || []).forEach(function (c) {
      var btn = LN.h("button", { type: "button", class: "fl-card", "aria-pressed": "false" }, [
        LN.h("span", { class: "fl-inner" }, [
          LN.h("span", { class: "fl-face fl-front", text: c.q }),
          LN.h("span", { class: "fl-face fl-back", text: c.a })
        ])
      ]);
      btn.addEventListener("click", function () {
        btn.setAttribute("aria-pressed", btn.classList.toggle("on") ? "true" : "false");
      });
      grid.appendChild(btn);
    });
    wrap.appendChild(grid);
    wrap.appendChild(LN.h("p", { class: "fl-hint", text: "Click a card to flip it over. In print both sides show." }));
    root.appendChild(wrap);
  }
};
