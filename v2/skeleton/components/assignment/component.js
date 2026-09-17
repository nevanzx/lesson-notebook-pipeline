LN.components["assignment"] = (function () {
  "use strict";
  var LNpub = "__PUBKEY__", LNkeyId = "__KEYID__";
  window.LN.pub = window.LN.pub || LNpub;
  window.LN.keyId = window.LN.keyId || LNkeyId;
  function metaOf(nm) {
    var el = document.querySelector('meta[name="' + nm + '"]');
    return el ? el.getAttribute("content") : "";
  }
  function answered(it, a) {
    if (a === null || a === undefined) return false;
    if (it.type === "id" || it.type === "sa") return String(a).trim() !== "";
    return true; /* mc/tf write real values at pick time */
  }
  function b64(buf) {
    var b = new Uint8Array(buf), s = "", i;
    for (i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function s64(b64str) {
    var s = atob(b64str), u = new Uint8Array(s.length), i;
    for (i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }
  function nameOf(n) {
    return String(n || "Unnamed Student")
      .replace(/[<>:"\/\\|?*\u0000-\u001f]/g, "_").trim() || "Unnamed Student";
  }
  function err(ui, m) {
    ui.errB.className = "lna-err show";
    ui.errB.textContent = m;
  }
  var api = {
    init: function (root, d) {
      window.LN.pub = window.LN.pub || LNpub;
      window.LN.keyId = window.LN.keyId || LNkeyId;
      var items = d.items || [];
      var week = metaOf("ln:week"), subj = metaOf("ln:subject");
      var state = { ix: 0, answers: [] };
      items.forEach(function () { state.answers.push(null); });
      var box = LN.h("div", { class: "lna" });
      var card = LN.h("div", { class: "lna-entry" });
      card.appendChild(LN.h("p", { text: "ASSIGNMENT — TO BE SUBMITTED" }));
      card.appendChild(LN.h("p", { text: (d.intro ||
        "20 situational questions close this lesson. ") +
        "Answers are collected — never scored or corrected here — and download " +
        "as an encrypted file for your teacher once you submit." }));
      var begin = LN.h("button", { type: "button", class: "lna-begin",
        text: "Begin assignment" });
      card.appendChild(begin);
      box.appendChild(card);

      var deck = LN.h("div", { class: "lna-deck", role: "dialog",
        "aria-label": "Assignment" });
      var cover = LN.h("div", { class: "lna-cover" });
      deck.appendChild(cover);
      var wm = LN.h("div", { class: "lna-watermark", "aria-hidden": "true" });
      var sheet = LN.h("div", { class: "lna-sheet" });
      var prog = LN.h("span", { class: "lna-prog" });
      var dots = LN.h("div", { class: "lna-dots" });
      items.forEach(function () { dots.appendChild(LN.h("span", { class: "lna-dot" })); });
      var nam = LN.h("input", { class: "lna-name", autocomplete: "off",
        placeholder: "Lastname, Firstname" });
      var idIn = LN.h("input", { class: "lna-id", autocomplete: "off",
        inputmode: "numeric", placeholder: "8-digit student no." });
      function syncWM() {
        var t = (idIn.value || "Student ID") + " — " + (nam.value || "Name");
        wm.innerHTML = "";
        for (var i = 0; i < 14; i++)
          wm.appendChild(LN.h("span", { text: t,
            style: "left:" + (8 + (i % 4) * 22) + "%;top:" +
              (6 + Math.floor(i / 4) * 15) + "%" }));
      }
      idIn.addEventListener("input", function () {
        idIn.value = idIn.value.replace(/\D/g, "").slice(0, 8);
        syncWM();
      });
      nam.addEventListener("input", syncWM);
      var form = LN.h("div", { class: "lna-form" }, [
        LN.h("div", { class: "lna-form-cell" }, [
          LN.h("label", { text: "Student name — Lastname, Firstname" }), nam]),
        LN.h("div", { class: "lna-form-cell" }, [
          LN.h("label", { text: "Student ID — 8 digits" }), idIn])]);
      var errB = LN.h("div", { class: "lna-err" });
      var back = LN.h("button", { type: "button", class: "lna-back", text: "\u2190 Back" });
      var next = LN.h("button", { type: "button", class: "lna-next", text: "Next \u2192" });
      var exit = LN.h("button", { type: "button", class: "lna-exit",
        text: "Exit (answers kept)" });
      var submit = LN.h("button", { type: "button", class: "lna-next",
        text: "Submit" });
      var slides = [];
      items.forEach(function (it, i) {
        var s = LN.h("div", { class: "lna-slide" });
        s.hidden = true;
        s.appendChild(LN.h("div", { class: "lna-q",
          text: "Q" + (i + 1) + " — " + it.prompt }));
        if (it.type === "mc") {
          (it.choices || []).forEach(function (c) {
            var r = LN.h("input", { type: "radio", name: "a" + i });
            r.addEventListener("click", function () {
              state.answers[i] = c; bump();
            });
            s.appendChild(LN.h("label", { class: "lna-opt" }, [
              r, LN.h("span", { text: c })]));
          });
        } else if (it.type === "tf") {
          ["true", "false"].forEach(function (v) {
            var r = LN.h("input", { type: "radio", name: "a" + i });
            r.addEventListener("click", function () {
              state.answers[i] = (v === "true"); bump();
            });
            s.appendChild(LN.h("label", { class: "lna-opt" }, [
              r, LN.h("span", { text: v.toUpperCase() })]));
          });
        } else if (it.type === "id") {
          var t = LN.h("input", { class: "lna-txt", placeholder: "Your answer" });
          t.addEventListener("input", function () {
            state.answers[i] = t.value.trim();
          });
          s.appendChild(t);
        } else {
          var ar = LN.h("textarea", { class: "lna-area",
            placeholder: "Name the fact or reason from the lesson." });
          ar.addEventListener("input", function () {
            state.answers[i] = ar.value.trim();
          });
          s.appendChild(ar);
        }
        slides.push(s);
        sheet.appendChild(s);
      });
      var head = LN.h("div", { class: "lna-head" }, [prog, dots]);
      var navA = LN.h("div", { class: "lna-nav" }, [
        LN.h("div", { class: "lna-nf" }, [back, next]), exit]);
      var navB = LN.h("div", { class: "lna-nav" }, [
        LN.h("div", { class: "lna-nf" }, [back, submit]),
        LN.h("span", { class: "lna-note",
          text: "Submission needs every question answered." })]);
      sheet.appendChild(head);
      sheet.appendChild(form);
      sheet.appendChild(errB);
      sheet.appendChild(navA);
      sheet.appendChild(navB);
      deck.appendChild(wm);
      deck.appendChild(sheet);
      box.appendChild(deck);

      function show(ix) {
        state.ix = Math.max(0, Math.min(items.length - 1, ix));
        var i;
        for (i = 0; i < slides.length; i++) slides[i].hidden = (i !== state.ix);
        prog.textContent = "Question " + (state.ix + 1) + " of " + items.length;
        var ds = dots.childNodes, j;
        for (j = 0; j < ds.length; j++)
          ds[j].className = "lna-dot" +
            (state.answers[j] !== null && state.answers[j] !== "" ? " done" : "") +
            (j === state.ix ? " on" : "");
        var last = state.ix === items.length - 1;
        navA.hidden = last;
        navB.hidden = !last;
        next.disabled = !answered(items[state.ix], state.answers[state.ix]);
        errB.className = "lna-err";
      }
      function bump() { show(state.ix); }
      var opened = false, exiting = false;
      function fallbackOpen() {
        deck.className = "lna-deck open lna-over";
        document.documentElement.style.overflow = "hidden";
      }
      begin.addEventListener("click", function () {
        opened = true;
        exiting = false;
        if (deck.requestFullscreen) {
          try { deck.requestFullscreen().catch(function () {}); }
          catch (e) { /* treat like rejection */ }
        }
        fallbackOpen();
        begin.textContent = "Resume assignment (Q" + (state.ix + 1) + ")";
        show(state.ix);
        syncWM();
      });
      document.addEventListener("fullscreenchange", function () {
        if (!document.fullscreenElement) {
          if (exiting) {
            exiting = false; /* intentional Exit — let it close */
          } else if (opened) {
            fallbackOpen(); /* Esc-exit — overlay stays open */
          }
        }
      });
      exit.addEventListener("click", function () {
        exiting = true;
        if (document.exitFullscreen && document.fullscreenElement)
          document.exitFullscreen();
        document.documentElement.style.overflow = "";
        deck.className = "lna-deck";
        begin.textContent = "Resume assignment (Q" + (state.ix + 1) + ")";
      });
      next.addEventListener("click", function () {
        if (!answered(items[state.ix], state.answers[state.ix])) {
          errB.className = "lna-err show";
          errB.textContent = "Answer Q" + (state.ix + 1) +
            " first — Next stays off until you do.";
          return;
        }
        show(state.ix + 1);
      });
      back.addEventListener("click", function () { show(state.ix - 1); });
      submit.addEventListener("click", function () {
        var i, missing = [];
        for (i = 0; i < items.length; i++)
          if (!answered(items[i], state.answers[i])) missing.push(i + 1);
        var name = nam.value.trim(), id = idIn.value.trim();
        var bad = [];
        if (name.indexOf(",") < 1)
          bad.push("your name as Lastname, Firstname");
        if (!/^\d{8}$/.test(id)) bad.push("an 8-digit student ID");
        if (missing.length > 0)
          bad.push("answers to Q " + missing.join(", Q"));
        if (bad.length) {
          errB.className = "lna-err show";
          errB.textContent = "Still needed: " + bad.join("; ") + ".";
          return;
        }
        var ans = [];
        for (i = 0; i < items.length; i++) ans.push({
          q: i + 1, type: items[i].type, prompt: items[i].prompt,
          answer: state.answers[i]
        });
        api._export({
          title: document.title, subject: subj, week: Number(week),
          student: { name: name, id: id },
          submitted_at: new Date().toISOString(),
          answers: ans
        }, { errB: errB, cover: cover }, submit);
      });
      deck.addEventListener("contextmenu", function (ev) {
        if (opened) ev.preventDefault();
      });
      document.addEventListener("visibilitychange", function () {
        if (!opened) return;
        cover.className = document.hidden ? "lna-cover show" : "lna-cover";
      });
      window.addEventListener("blur", function () {
        if (opened) cover.className = "lna-cover show";
      });
      window.addEventListener("focus", function () {
        cover.className = "lna-cover";
      });
      document.addEventListener("keydown", function (ev) {
        if (opened && ev.key === "PrintScreen") {
          cover.className = "lna-cover show";
          setTimeout(function () { cover.className = "lna-cover"; }, 900);
        }
      });
      root.appendChild(box);
    },
    _export: function (body, ui) { /* stub — Task 5 replaces this */
      var blob = new Blob([JSON.stringify(body, null, 1)],
        { type: "application/json" });
      var a = LN.h("a", { href: URL.createObjectURL(blob),
        download: "submission.json" });
      document.body.appendChild(a);
      a.click();
      a.remove();
      ui.errB.className = "lna-err show";
      ui.errB.textContent = "Downloaded (unencrypted stub — replaced by Task 5).";
    }
  };
  return api;
})();
