LN.components["milo-list"] = {
  init: function (root, d) {
    var items = (d.items || []).map(function (it) {
      return typeof it === "string" ? { t: it } : it;
    });
    var done = {}, C = 100.53;
    var wrap = LN.h("div", { class: "ln-comp ln-milo" });
    var ring = LN.s("svg", { viewBox: "0 0 44 44", "aria-hidden": "true" }, [
      LN.s("circle", { cx: 22, cy: 22, r: 16, fill: "none", stroke: "var(--grid)", "stroke-width": "5" })
    ]);
    var arc = LN.s("circle", { cx: 22, cy: 22, r: 16, fill: "none", stroke: "var(--accent)",
      "stroke-width": "5", "stroke-dasharray": C, "stroke-dashoffset": C,
      "stroke-linecap": "round", transform: "rotate(-90 22 22)" });
    ring.appendChild(arc);
    var count = LN.h("span", { class: "chip milo-count", text: "0 of " + items.length + " outcomes claimed" });
    wrap.appendChild(LN.h("div", { class: "milo-head" }, [ring, count]));
    if (d.title) wrap.appendChild(LN.h("h3", { text: d.title }));
    var list = LN.h("ul", { class: "milo-items" });
    items.forEach(function (it, i) {
      var box = LN.h("span", { class: "milo-box", "aria-hidden": "true", text: "\u2610" });
      var kids = [box, LN.h("span", { class: "milo-t" }, [
        LN.h("span", { text: it.t }),
        it.note ? LN.h("small", { class: "milo-note", text: it.note }) : null
      ])];
      var row = LN.h("button", { type: "button", class: "milo-row", "aria-pressed": "false" }, kids);
      row.addEventListener("click", function () {
        done[i] = !done[i];
        var n = 0;
        Object.keys(done).forEach(function (k) { if (done[k]) n++; });
        row.classList.toggle("on", !!done[i]);
        row.setAttribute("aria-pressed", done[i] ? "true" : "false");
        box.textContent = done[i] ? "\u2611" : "\u2610";
        count.textContent = n + " of " + items.length + " outcomes claimed";
        arc.setAttribute("stroke-dashoffset", C * (1 - n / items.length));
      });
      list.appendChild(row);
    });
    wrap.appendChild(list);
    root.appendChild(wrap);
  }
};
