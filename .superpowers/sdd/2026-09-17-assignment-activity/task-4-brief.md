### Task 4: `assignment` component — entry card, fullscreen slide deck, guard rails

**Files:**
- Create: `v2/skeleton/components/assignment/component.css`
- Create: `v2/skeleton/components/assignment/component.js`
- Create: `v2/skeleton/components/assignment/README.md`
- Modify: `v2/skeleton/components/registry.md` (new row)
- Create: `tests/test_assignment_deck.py`

**Interfaces:**
- Consumes: Task 1 metas; Task 3 injects `LN.pub` (single-line base64 SPKI DER) and `LN.keyId`; `LN.h`.
- Produces: `LN.components["assignment"].init(root, d)` with `d = {intro?, items:[20]}`; on submit produces body `{title, subject, week, student:{name,id}, submitted_at, answers:[{q,type,prompt,choice/answer}]}` handed to `_export` (Task 5).

- [ ] **Step 1: Write the failing tests** — `tests/test_assignment_deck.py`:

```python
import io
import json
import re
import contextlib
from pathlib import Path
import build
from test_build import make_skel

COMP = Path(__file__).resolve().parents[1] / "v2" / "skeleton" / "components" / "assignment"


def _skel(tmp_path):
    skel = make_skel(tmp_path, components=("assignment",))
    cd = skel / "components" / "assignment"
    (cd / "component.css").write_text(
        (Path("v2/skeleton/components/assignment/component.css")
         .read_text(encoding="utf-8")), encoding="utf-8")
    (cd / "component.js").write_text(
        (Path("v2/skeleton/components/assignment/component.js")
         .read_text(encoding="utf-8")), encoding="utf-8")
    return skel


def _work(tmp_path):
    w = tmp_path / "w"
    w.mkdir()
    items = ([{"type": "mc", "prompt": "q%d" % i,
               "choices": ["a", "b", "c", "d"], "ans": 1} for i in range(10)]
             + [{"type": "tf", "prompt": "t%d" % i, "ans": True} for i in range(4)]
             + [{"type": "id", "prompt": "i%d" % j, "aliases": ["x"]} for j in range(4)]
             + [{"type": "sa", "prompt": "s%d" % j, "key_points": ["k"]} for j in range(2)])
    (w / "build.json").write_text(json.dumps(
        {"title": "T", "theme": "mini", "components": ["assignment"],
         "output": "o.html", "week": 4, "subject": "S"}), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="assign"><h2>6 Assignment</h2>'
        '<div data-component="assignment" data-key="assign7"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text(
        "LN.data.assign7 = " + json.dumps({"intro": "i", "items": items}) + ";",
        encoding="utf-8")
    return w


def _build(tmp_path, skel, w, monkeypatch):
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(w)])
    text = (tmp_path / "o.html").read_text(encoding="utf-8") if rc == 0 else ""
    return rc, buf.getvalue(), text


def test_deck_ships_without_leak(tmp_path, monkeypatch):
    rc, out, html = _build(tmp_path, _skel(tmp_path), _work(tmp_path), monkeypatch)
    assert rc == 0, out
    for needle in ("lna-begin", "lna-watermark", "user-select:none", "PrintScreen",
                   "visibilitychange", "lna-cover", "requestFullscreen"):
        assert needle in html, needle
    assert '"ans"' not in html and "'ans'" not in html
    assert "key_points" not in html and "aliases" not in html


def test_component_files_clean():
    js = Path("v2/skeleton/components/assignment/component.js").read_text(encoding="utf-8")
    css = (Path("v2/skeleton/components/assignment/component.css").read_text(encoding="utf-8"))
    assert not re.search(r"\b(alert|confirm|prompt)\s*\(", js)
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b", css)
    assert "http" not in css and "@import" not in css
    assert not re.search(r"</[A-Za-z]", js)
```


- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_assignment_deck.py -q`
Expected: FAIL — component files don't exist.

- [ ] **Step 3: Write `component.css`** (final, verbatim; tokens only):

```css
/* assignment — begin card, fullscreen deck, watermark, guards. Tokens only. */
.lna{user-select:none;-webkit-user-select:none;position:relative}
.lna input,.lna textarea{-webkit-user-select:text;user-select:text}
.lna-entry{border:1px solid var(--grid-strong);border-radius:var(--radius);
  background:var(--surface-2);padding:16px 18px;margin:14px 0;box-shadow:var(--shadow-sm)}
.lna-entry p{margin:6px 0;color:var(--ink-soft);font-size:14.5px}
.lna-begin{background:var(--accent);color:var(--surface);border:0;
  border-radius:999px;padding:10px 18px;font:600 14px/1.2 var(--sans);cursor:pointer}
.lna-begin:hover{border-color:var(--accent-deep)}
.lna-deck{display:none}
.lna-deck.open{display:block}
.lna-over{position:fixed;inset:0;background:var(--surface);z-index:210;overflow:auto;
  border-radius:0}
.lna-watermark{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.lna-watermark span{position:absolute;font:700 12px/1 var(--mono);
  color:var(--ink-faint);opacity:.5;transform:rotate(-24deg);white-space:nowrap;
  min-width:0}
.lna-sheet{position:relative;z-index:2;max-width:780px;margin:0 auto;
  padding:18px 16px 44px;min-width:0}
.lna-head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;
  justify-content:space-between;border-bottom:1px solid var(--grid-strong);
  padding-bottom:8px;margin-bottom:14px}
.lna-prog{font:600 12.5px/1.4 var(--mono);color:var(--accent-deep)}
.lna-dots{display:flex;gap:5px;flex:0 1 auto;min-width:0;flex-wrap:wrap}
.lna-dot{width:9px;height:9px;border-radius:999px;background:var(--grid)}
.lna-dot.on{background:var(--accent)}
.lna-dot.done{background:var(--accent-deep)}
.lna-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;
  background:var(--surface-2);border:1px solid var(--grid-strong);
  border-radius:var(--radius);padding:12px 14px;margin:0 0 14px}
.lna-form>div{min-width:0}
.lna-form label{font:600 11.5px/1.4 var(--mono);color:var(--accent-deep);
  letter-spacing:.08em;text-transform:uppercase}
.lna-name,.lna-id{font:15px/1.3 var(--sans);padding:8px 10px;width:100%;min-width:0;
  border:2px solid var(--grid-strong);border-radius:8px;background:var(--surface);
  color:var(--ink)}
.lna-err{display:none;background:var(--note-pink);border:1px solid var(--red);
  border-radius:8px;padding:9px 12px;font-size:13.5px;margin:10px 0;color:var(--ink)}
.lna-err.show{display:block}
.lna-q{font-size:16.5px;font-weight:600;margin:12px 0 10px}
.lna-opt{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;
  border:1px solid var(--grid-strong);border-radius:8px;margin:7px 0;
  background:var(--surface-2);cursor:pointer;min-width:0}
.lna-opt input{flex:none;margin-top:3px}
.lna-txt,.lna-area{width:100%;font:15px/1.55 var(--sans);padding:9px 11px;
  border:2px solid var(--grid-strong);border-radius:8px;background:var(--surface);
  color:var(--ink);min-width:0}
.lna-area{min-height:104px;resize:vertical}
.lna-nav{display:flex;gap:10px;align-items:center;justify-content:space-between;
  flex-wrap:wrap;margin-top:16px;border-top:1px solid var(--grid-strong);
  padding-top:12px}
.lna-nf{display:flex;gap:10px}
.lna-back,.lna-next,.lna-exit{font:600 14px/1.2 var(--sans);border-radius:999px;
  padding:9px 16px;cursor:pointer;border:1px solid var(--grid-strong);
  background:var(--surface-2);color:var(--ink)}
.lna-next{background:var(--accent);color:var(--surface);border-color:var(--accent)}
.lna-next[disabled]{opacity:.5}
.lna-exit{background:var(--note-yellow)}
.lna-note{font:12px/1.5 var(--mono);color:var(--ink-faint)}
.lna-cover{position:absolute;inset:0;background:var(--ink);display:none;z-index:5}
.lna-cover.show{display:block}
@media (max-width:640px){
  .lna-form{grid-template-columns:minmax(0,1fr)}
  .lna-sheet{padding:12px 10px 56px}
}
@media print{.lna{display:none!important}}
```

- [ ] **Step 4: Write `component.js`** (complete; the top helpers `b64`, `s64`, `nameOf`, `err` ship here; `_export` is a stub in Task 4, replaced in Task 5):

```js
LN.components["assignment"] = (function () {
  "use strict";
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
  return {
    init: function (root, d) {
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
      var opened = false;
      function fallbackOpen() {
        deck.className = "lna-deck open lna-over";
        document.documentElement.style.overflow = "hidden";
      }
      begin.addEventListener("click", function () {
        opened = true;
        if (deck.requestFullscreen) {
          deck.requestFullscreen().catch(fallbackOpen);
        } else {
          fallbackOpen();
        }
        begin.textContent = "Resume assignment (Q" + (state.ix + 1) + ")";
        show(state.ix);
        syncWM();
      });
      exit.addEventListener("click", function () {
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
        if (missing.length < items.length && missing.length > 0)
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
        this._export({
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
    _export: function (body, ui) { /* Task 5 replaces this stub */
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
})();
```

`v2/skeleton/components/assignment/README.md`:

```markdown
# assignment

Collect-only assessment. Mount: `<div data-component="assignment" data-key="…">`.
Data `{intro?, items:[20]}` — 10 mc (4 choices), 4 tf, 4 id, 2 sa, all situational.
The component never reveals answers and never scores: those live only in the
build's teacher key file (`build/key/`) written by build.py.

Flow: hidden Begin card → fullscreen deck (iOS: fixed-overlay simulation) →
one question per slide, locked Next → name (Lastname, Firstname) + 8-digit ID →
submit validates completeness and downloads an AES-GCM/RSA-OAEP-encrypted
`<name> - Week N - Subject.json`. Exit keeps answers; re-entry resumes.

Guards (best effort, not absolute): selection disabled inside the deck
(inputs stay typeable), context menu off while open, cover on
blur/visibilitychange/PrintScreen, diagonal `ID — Name` watermark filled live.
```

Registry row appended to the table in `v2/skeleton/components/registry.md` (before the "Conventions" footer):

```markdown
| Collect answers for the teacher (no reveal), encrypted submit | `assignment` | `{intro?, items:[20: 10×{type:'mc',prompt,choices[4]}, 4×{type:'tf',prompt}, 4×{type:'id',prompt}, 2×{type:'sa',prompt}]}` — answers never in student data | `<div data-component="assignment" data-key="assign7"></div>` |
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_assignment_deck.py -q`
Expected: PASS (2 tests).

- [ ] **Step 6: Full suite**

Run: `python -m pytest tests -q` — expected PASS.

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/components/assignment v2/skeleton/components/registry.md tests/
git commit -m "feat(v2.5): assignment component — hidden fullscreen deck, watermark, copy/screenshot guards"
```

---

