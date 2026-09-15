LN.components["comparison-table"] = {
  init: function (root, d) {
    var wrap = LN.h("div", { class: "ln-comp ln-cmp" });
    if (d.title) wrap.appendChild(LN.h("h3", { text: d.title }));
    var head = LN.h("tr", {}, [
      LN.h("th", { scope: "col", text: d.rowLabel || "" }),
      LN.h("th", { scope: "col", text: d.left }),
      LN.h("th", { scope: "col", text: d.right })
    ]);
    var body = (d.rows || []).map(function (r) {
      return LN.h("tr", {}, [
        LN.h("th", { scope: "row", text: r.label }),
        LN.h("td", { text: r.l }),
        LN.h("td", { text: r.r })
      ]);
    });
    wrap.appendChild(LN.h("div", { class: "cmp-wrap" }, [
      LN.h("p", { class: "swipe-hint", text: "swipe the table sideways \u2192" }),
      LN.h("table", { class: "tbl" }, [LN.h("thead", {}, [head]), LN.h("tbody", {}, body)])
    ]));
    root.appendChild(wrap);
  }
};
