LN.components["glossary"] = {
  init: function (root, d) {
    var wrap = LN.h("div", { class: "ln-comp ln-glossary" });
    if (d.title) wrap.appendChild(LN.h("h3", { text: d.title }));
    (d.groups || []).forEach(function (g) {
      if (g.name && (d.groups || []).length > 1) wrap.appendChild(LN.h("h3", { text: g.name }));
      var dl = LN.h("dl", { class: "gloss" });
      (g.terms || []).forEach(function (t) {
        dl.appendChild(LN.h("div", {}, [
          LN.h("dt", { text: t.t }),
          LN.h("dd", { text: t.d })
        ]));
      });
      wrap.appendChild(dl);
    });
    root.appendChild(wrap);
  }
};
