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
  var TIME_API = "https://worldtimeapi.org/api/timezone/";
  var DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday",
             "friday", "saturday"];
  function parseTrustedNow(j) {
    var dw = String((j && j.day_of_week) || "").toLowerCase();
    if (!j || !j.datetime || DOW.indexOf(dw) < 0)
      return { ok: false, reason: "malformed-time" };
    return { ok: true, iso: j.datetime, dow: dw, unixtime: j.unixtime };
  }
  function fetchTrustedNow(tz, cb) {
    if (typeof fetch !== "function") {
      cb({ ok: false, reason: "network" });
      return;
    }
    function attempt(triesLeft) {
      var done = false;
      var ac = (typeof AbortController !== "undefined") ? new AbortController() : null;
      if (ac) setTimeout(function () { try { ac.abort(); } catch (e) {} }, 8000);
      fetch(TIME_API + encodeURIComponent(tz), ac ? { signal: ac.signal } : {})
        .then(function (r) {
          if (!r.ok) throw new Error("http " + r.status);
          return r.json();
        })
        .then(function (j) {
          if (done) return;
          done = true;
          cb(parseTrustedNow(j));
        })
        .catch(function (e) {
          if (done) return;
          done = true;
          if (triesLeft > 0) attempt(triesLeft - 1);
          else cb({ ok: false, reason: (e && e.message) || "network" });
        });
    }
    attempt(1);
  }
  var clock = fetchTrustedNow;
  function windowMeta() {
    var day = metaOf("ln:window-day").toLowerCase();
    if (DOW.indexOf(day) < 0) day = "wednesday";
    var tz = metaOf("ln:window-tz") || "Asia/Manila";
    return { day: day, tz: tz };
  }
  function err(ui, m) {
    ui.errB.className = "lna-err show";
    ui.errB.textContent = m;
  }
  var api = {
    init: function (root, d) {
      window.LN.pub = window.LN.pub || LNpub;
      window.LN.keyId = window.LN.keyId || LNkeyId;
      var isDag = d.mode === "dag" && Array.isArray(d.nodes) && d.nodes.length > 0;
      if (d.mode === "dag" && !isDag) {
        var badBox = LN.h("div", { class: "lna" });
        var badCard = LN.h("div", { class: "lna-entry" });
        badCard.appendChild(LN.h("p", { text: "ASSIGNMENT UNAVAILABLE" }));
        badCard.appendChild(LN.h("p", {
          text: "This assignment failed to load. Contact your teacher — do not delete the file." }));
        badBox.appendChild(badCard);
        root.appendChild(badBox);
        return;
      }
      var items = isDag ? [] : (d.items || []);
      var nodes = isDag ? d.nodes : [];
      var nodeById = {};
      var maxLevel = 0;
      if (isDag) {
        nodes.forEach(function (n) {
          nodeById[n.id] = n;
          if (typeof n.level === "number" && n.level > maxLevel) maxLevel = n.level;
        });
      }
      var week = metaOf("ln:week"), subj = metaOf("ln:subject");
      var state = isDag
        ? { identified: false, submitted: false,
            cur: (nodes.filter(function (n) { return n.level === 0; })[0] || nodes[0] || {}).id,
            path: [], picked: null, broken: false }
        : { ix: 0, answers: [], identified: false, submitted: false };
      if (!isDag) items.forEach(function () { state.answers.push(null); });
      var box = LN.h("div", { class: "lna" });
      var card = LN.h("div", { class: "lna-entry" });
      card.appendChild(LN.h("p", { text: "ASSIGNMENT — TO BE SUBMITTED" }));
      var introFallback = isDag
        ? "A branching scenario closes this lesson. Read each decision twice — your path is what the teacher grades. "
        : "20 situational questions close this lesson. ";
      card.appendChild(LN.h("p", { text: (d.intro ||
        introFallback) +
        "Answers are collected — never scored or corrected here — and download " +
        "as an encrypted file for your teacher once you submit." }));
      var begin = LN.h("button", { type: "button", class: "lna-begin",
        text: "Begin assignment" });
      var gateNote = LN.h("p", { class: "lna-gate" });
      var meta = windowMeta();
      var gateState = { checked: false, inWindow: false, iso: "", dow: "" };
      card.appendChild(gateNote);
      card.appendChild(begin);
      box.appendChild(card);

      var deck = LN.h("div", { class: "lna-deck", role: "dialog",
        "aria-label": "Assignment" });
      var cover = LN.h("div", { class: "lna-cover" });
      deck.appendChild(cover);
      var wm = LN.h("div", { class: "lna-watermark", "aria-hidden": "true" });
      var sheet = LN.h("div", { class: "lna-sheet" });

      /* ---- Phase 1: identity gate (shown first, quiz hidden until valid) ---- */
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
      var errI = LN.h("div", { class: "lna-err" });
      var start = LN.h("button", { type: "button", class: "lna-next lna-start",
        text: "Verify identity & start quiz" });
      var ident = LN.h("div", { class: "lna-ident" }, [
        LN.h("p", { class: "lna-ident-t", text: "Confirm your identity" }),
        LN.h("p", { class: "lna-ident-s",
          text: "Enter your name and student number first. " +
            "The quiz opens only after verification, and cannot be exited once started." }),
        LN.h("div", { class: "lna-form" }, [
          LN.h("div", { class: "lna-form-cell" }, [
            LN.h("label", { text: "Student name — Lastname, Firstname" }), nam]),
          LN.h("div", { class: "lna-form-cell" }, [
            LN.h("label", { text: "Student ID — 8 digits" }), idIn])]),
        errI, start]);

      /* ---- Phase 2: quiz (hidden until identity verified) ---- */
      var quiz = LN.h("div", { class: "lna-quiz" });
      var prog = LN.h("span", { class: "lna-prog" });
      var dots = LN.h("div", { class: "lna-dots" });
      if (isDag) {
        for (var di = 0; di <= maxLevel; di++)
          dots.appendChild(LN.h("span", { class: "lna-dot" }));
      } else {
        items.forEach(function () { dots.appendChild(LN.h("span", { class: "lna-dot" })); });
      }
      var errB = LN.h("div", { class: "lna-err" });
      var back = LN.h("button", { type: "button", class: "lna-back", text: "\u2190 Back" });
      var next = LN.h("button", { type: "button", class: "lna-next", text: "Next \u2192" });
      var submit = LN.h("button", { type: "button", class: "lna-next",
        text: "Submit" });
      var close = LN.h("button", { type: "button", class: "lna-exit lna-close",
        text: "Close" });
      close.hidden = true;
      var slides = [];
      if (isDag) {
        nodes.forEach(function (n) {
          var s = LN.h("div", { class: "lna-slide" });
          s.hidden = true;
          if (n.outcome)
            s.appendChild(LN.h("p", { class: "lna-dag-outcome",
              text: "What happened: " + n.outcome }));
          s.appendChild(LN.h("div", { class: "lna-q", text: n.question }));
          if (n.isLeaf) {
            s.appendChild(LN.h("p", { class: "lna-dag-final",
              text: n.finalOutcome || "" }));
          } else {
            (n.choices || []).forEach(function (c, ci) {
              var r = LN.h("input", { type: "radio", name: "a_" + n.id });
              r.addEventListener("click", function () {
                state.picked = ci; bump();
              });
              s.appendChild(LN.h("label", { class: "lna-opt" }, [
                r, LN.h("span", { text: c.label + ". " + c.text })]));
            });
          }
          slides.push(s);
          quiz.appendChild(s);
        });
      } else {
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
              bump();
            });
            s.appendChild(t);
          } else {
            var ar = LN.h("textarea", { class: "lna-area",
              placeholder: "Name the fact or reason from the lesson." });
            ar.addEventListener("input", function () {
              state.answers[i] = ar.value.trim();
              bump();
            });
            s.appendChild(ar);
          }
          slides.push(s);
          quiz.appendChild(s);
        });
      }
      var head = LN.h("div", { class: "lna-head" }, [prog, dots]);
      var navA = LN.h("div", { class: "lna-nav" }, [
        LN.h("div", { class: "lna-nf" }, isDag ? [next] : [back, next])]);
      var navB = LN.h("div", { class: "lna-nav" }, isDag
        ? [LN.h("div", { class: "lna-nf" }, [submit]),
           LN.h("span", { class: "lna-note",
             text: "Submission sends your path — answers are never revealed." })]
        : [LN.h("div", { class: "lna-nf" }, [back, submit]),
           LN.h("span", { class: "lna-note",
             text: "Submission needs every question answered." })]);
      var navC = LN.h("div", { class: "lna-nav" }, [close]);
      navC.hidden = true;
      quiz.appendChild(head);
      quiz.appendChild(errB);
      quiz.appendChild(navA);
      quiz.appendChild(navB);
      quiz.appendChild(navC);
      sheet.appendChild(ident);
      sheet.appendChild(quiz);
      deck.appendChild(wm);
      deck.appendChild(sheet);
      box.appendChild(deck);

      function validIdentity() {
        var bad = [];
        if (!/^[^,]+,\s*\S/.test(nam.value.trim()))
          bad.push("your name as Lastname, Firstname");
        if (!/^\d{8}$/.test(idIn.value.trim()))
          bad.push("an 8-digit student ID");
        return bad;
      }
      function showIdent(msg) {
        ident.hidden = false;
        quiz.hidden = true;
        if (msg) {
          errI.className = "lna-err show";
          errI.textContent = msg;
        } else {
          errI.className = "lna-err";
        }
      }
      function showDag() {
        var n = nodeById[state.cur];
        if (!n) {
          state.broken = true;
          errB.className = "lna-err show";
          errB.textContent = "This path is broken — contact your teacher.";
          next.disabled = true;
          return;
        }
        var si = 0, i;
        for (i = 0; i < nodes.length; i++)
          if (nodes[i].id === state.cur) { si = i; break; }
        for (i = 0; i < slides.length; i++) slides[i].hidden = (i !== si);
        prog.textContent = "Layer " + (n.level + 1) + " of " + (maxLevel + 1);
        var ds = dots.childNodes;
        for (i = 0; i < ds.length; i++)
          ds[i].className = "lna-dot" +
            (i < n.level ? " done" : "") +
            (i === n.level ? " on" : "");
        var atLeaf = !!n.isLeaf;
        navA.hidden = atLeaf;
        navB.hidden = !atLeaf;
        next.hidden = atLeaf;
        submit.hidden = !atLeaf;
        next.disabled = state.picked === null;
        if (state.broken) {
          errB.className = "lna-err show";
          errB.textContent = "This path is broken — contact your teacher.";
          next.disabled = true;
        } else {
          errB.className = "lna-err";
        }
      }
      function show(ix) {
        if (!state.identified) { showIdent(); return; }
        ident.hidden = true;
        quiz.hidden = false;
        if (isDag) { showDag(); return; }
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
      function lockFullscreen() {
        if (deck.requestFullscreen) {
          try {
            var p = deck.requestFullscreen();
            if (p && p.catch) p.catch(function () {});
          } catch (e) { /* treat like rejection */ }
        }
        fallbackOpen();
      }
      function renderGate() {
        if (!gateState.checked) {
          gateNote.className = "lna-gate";
          gateNote.textContent = "Checking the trusted time\u2026";
          begin.disabled = true;
          return;
        }
        if (gateState.inWindow) {
          gateNote.className = "lna-gate lna-lock-open";
          gateNote.textContent = "Open today \u2713 \u2014 this assignment closes at " +
            "11:59 PM (" + meta.tz + ").";
          begin.disabled = false;
          return;
        }
        if (gateState.dow === "") {
          gateNote.className = "lna-gate lna-lock-shut";
          gateNote.textContent = "Cannot verify the time \u2014 connect to the internet, " +
            "then reload this page.";
        } else {
          gateNote.className = "lna-gate lna-lock-shut";
          gateNote.textContent = "This assignment opens " +
            meta.day.charAt(0).toUpperCase() + meta.day.slice(1) +
            ", 12:00 AM \u2013 11:59 PM (" + meta.tz + "). Today is " +
            gateState.iso + " \u2014 come back then.";
        }
        begin.disabled = true;
      }
      function checkGate() {
        clock(meta.tz, function (r) {
          if (r.ok) {
            gateState.checked = true;
            gateState.iso = r.iso;
            gateState.dow = r.dow;
            gateState.inWindow = (r.dow === meta.day);
          } else {
            gateState.checked = true;
            gateState.inWindow = false;
            gateState.dow = "";
          }
          renderGate();
        });
      }
      renderGate();
      checkGate();
      begin.addEventListener("click", function () {
        if (!gateState.inWindow) {
          checkGate();
          return;
        }
        opened = true;
        exiting = false;
        lockFullscreen();
        begin.textContent = isDag ? "Resume assignment"
          : "Resume assignment (Q" + (state.ix + 1) + ")";
        if (state.identified) show(state.ix);
        else showIdent();
        syncWM();
      });
      start.addEventListener("click", function () {
        var bad = validIdentity();
        if (bad.length) {
          errI.className = "lna-err show";
          errI.textContent = "Still needed: " + bad.join("; ") + ".";
          return;
        }
        state.identified = true;
        begin.textContent = isDag ? "Resume assignment"
          : "Resume assignment (Q" + (state.ix + 1) + ")";
        show(state.ix);
        syncWM();
      });
      document.addEventListener("fullscreenchange", function () {
        if (!document.fullscreenElement) {
          if (exiting) {
            exiting = false; /* intentional Close after submit — let it close */
          } else if (opened && !state.submitted) {
            lockFullscreen(); /* Esc-exit — force the quiz back, answers kept */
          } else if (opened && state.submitted) {
            fallbackOpen(); /* submitted — keep overlay, wait for Close */
          }
        }
      });
      close.addEventListener("click", function () {
        exiting = true;
        if (document.exitFullscreen && document.fullscreenElement)
          document.exitFullscreen();
        document.documentElement.style.overflow = "";
        deck.className = "lna-deck";
      });
      next.addEventListener("click", function () {
        if (isDag) {
          var n = nodeById[state.cur];
          if (!n || n.isLeaf) return;
          if (state.picked === null || state.broken) {
            errB.className = "lna-err show";
            errB.textContent = "Choose a path first — Next stays off until you pick.";
            return;
          }
          var ch = n.choices[state.picked];
          state.path.push({ node: n.id, label: ch.label });
          var nxt = ch.nextNodeId;
          if (!nxt || !nodeById[nxt]) {
            state.broken = true;
            showDag();
            return;
          }
          state.cur = nxt;
          state.picked = null;
          showDag();
          return;
        }
        if (!answered(items[state.ix], state.answers[state.ix])) {
          errB.className = "lna-err show";
          errB.textContent = "Answer Q" + (state.ix + 1) +
            " first — Next stays off until you do.";
          return;
        }
        show(state.ix + 1);
      });
      back.addEventListener("click", function () {
        if (isDag) return;
        show(state.ix - 1);
      });
      submit.addEventListener("click", function () {
        if (isDag) {
          var leaf = nodeById[state.cur];
          var dname = nam.value.trim(), did = idIn.value.trim();
          var dbad = [];
          if (!/^[^,]+,\s*\S/.test(dname))
            dbad.push("your name as Lastname, Firstname");
          if (!/^\d{8}$/.test(did)) dbad.push("an 8-digit student ID");
          if (!leaf || !leaf.isLeaf) dbad.push("a completed path to the end");
          if (dbad.length) {
            errB.className = "lna-err show";
            errB.textContent = "Still needed: " + dbad.join("; ") + ".";
            return;
          }
          api._export({
            title: document.title, subject: subj, week: Number(week),
            student: { name: dname, id: did },
            submitted_at: new Date().toISOString(),
            mode: "dag",
            path: state.path.slice(),
            final_outcome: leaf.finalOutcome || ""
          }, { errB: errB, cover: cover, submit: submit,
            onDone: function () {
              state.submitted = true;
              navC.hidden = false;
            } });
          return;
        }
        var i, missing = [];
        for (i = 0; i < items.length; i++)
          if (!answered(items[i], state.answers[i])) missing.push(i + 1);
        var name = nam.value.trim(), id = idIn.value.trim();
        var bad = [];
        if (!/^[^,]+,\s*\S/.test(name))
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
        }, { errB: errB, cover: cover, submit: submit,
          onDone: function () {
            state.submitted = true;
            navC.hidden = false;
          } });
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
    _trustedNow: fetchTrustedNow,
    _parseNow: parseTrustedNow,
    _windowMeta: windowMeta,
    _setClock: function (fn) { clock = fn; },
    _export: function (body, ui) {
      if (!(window.crypto && window.crypto.subtle && window.LN.pub) ||
          window.LN.pub.indexOf("__") >= 0) {
        err(ui, "This browser cannot encrypt — update it; nothing was exported.");
        return;
      }
      var ivv = crypto.getRandomValues(new Uint8Array(12));
      var msg = new TextEncoder().encode(JSON.stringify(body));
      var aes = null;
      crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true,
        ["encrypt"])
        .then(function (k) {
          aes = k;
          var ctP = crypto.subtle.encrypt({ name: "AES-GCM", iv: ivv }, aes,
            msg);
          var wkP = crypto.subtle.exportKey("raw", k).then(function (raw) {
            return crypto.subtle.importKey("spki", s64(window.LN.pub),
              { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"])
              .then(function (pk) {
                return crypto.subtle.encrypt({ name: "RSA-OAEP" }, pk, raw);
              });
          });
          return Promise.all([ctP, wkP]);
        })
        .then(function (both) {
          var full = {
            title: body.title, subject: body.subject, week: body.week,
            student: body.student, submitted_at: body.submitted_at,
            key_id: window.LN.keyId,
            enc: { v: 1, k: "RSA-OAEP-256+A256GCM", iv: b64(ivv),
                   ct: b64(both[0]), wk: b64(both[1]) }
          };
          var f = nameOf(body.student.name) + " - Week " + body.week +
            " - " + body.subject + ".json";
          var a = LN.h("a", { download: f, href: URL.createObjectURL(
            new Blob([JSON.stringify(full, null, 1)],
              { type: "application/json" })) });
          document.body.appendChild(a);
          a.click();
          a.remove();
          if (ui.submit) ui.submit.textContent = "Submitted — download again";
          if (ui.onDone) ui.onDone();
          err(ui, "Encrypted and downloaded: " + f);
        })
        .catch(function (e) {
          err(ui, "Encryption failed (" + e + ") — nothing was exported.");
        });
    }
  };
  return api;
})();
