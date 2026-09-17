LN.components["sort-statement"] = {
  init: function (root, d) {
    var self = this;
    var total = d.items.length, score = 0, done = 0;
    function pulse(el) {
      el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    }
    var wrap = LN.h("div", { class: "ln-comp ln-sort" });
    var chip = LN.h("span", { class: "chip", text: "0 / " + total });
    wrap.appendChild(LN.h("div", { class: "sg-head" }, [
      LN.h("span", { class: "sg-cols", text: d.left + "   vs   " + d.right }),
      chip,
      LN.h("button", { type: "button", class: "btn", text: "Reset",
        onclick: function () { root.innerHTML = ""; self.init(root, d); } })
    ]));
    var fb = LN.h("div", { class: "fb info show", text: "Sort every statement into its bucket \u2014 no take-backs once you click." });
    d.items.forEach(function (it) {
      var picked = false, btns = {};
      var opts = LN.h("div", { class: "sg-opts" });
      ["left", "right", "both"].forEach(function (choice) {
        var label = choice === "both" ? "BOTH" : (choice === "left" ? d.left : d.right);
        var b = LN.h("button", { type: "button", text: label, onclick: function () {
          if (picked) return;                       /* one-way: never re-answer */
          picked = true; done++;
          var ok = it.a === choice;
          if (ok) score++;
          Object.keys(btns).forEach(function (k) {
            var el = btns[k];
            el.disabled = true;
            if (k === choice) el.className = "picked " + (ok ? "ok" : "bad");
            else if (k === it.a) el.className = "fade reveal";
            else el.className = "fade";
          });
          chip.textContent = score + " / " + total;
          if (done === total) {
            fb.className = "fb show " + (score === total ? "ok" : "info");
            fb.textContent = "Done \u2014 " + score + " of " + total + " correct.";
          } else {
            fb.className = "fb show " + (ok ? "ok" : "no");
            fb.textContent = (ok ? "Correct. " : "Not quite \u2014 the dashed outline marks the right bucket. ")
              + done + " of " + total + " answered.";
          }
          pulse(fb);
        } });
        btns[choice] = b;
        opts.appendChild(b);
      });
      wrap.appendChild(LN.h("div", { class: "sg-item" }, [LN.h("div", { class: "sg-t", text: it.t }), opts]));
    });
    wrap.appendChild(fb);
    root.appendChild(wrap);
  }
};
