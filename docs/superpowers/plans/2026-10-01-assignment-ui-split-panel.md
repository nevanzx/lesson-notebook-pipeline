# Assignment UI Redesign — Split Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the in-lesson `assignment` component to the "Split panel" design — a meta rail beside the question on desktop, a slim strip on phone/tablet — without changing flow or behaviour.

**Architecture:** Presentation-only change to one component. `component.js` gains a `.lna-shell` wrapper (`.lna-rail` + `.lna-main`), a meta rail, a Begin-card meta row/state pill, and a DAG path trail; `component.css` is rewritten against the existing theme tokens. Every `.lna-*` hook and button label that `assignment_smoke.js` and the Python suite rely on is preserved.

**Tech Stack:** Vanilla JS DOM builder (`LN.h`), plain CSS with theme tokens, Python/pytest + Node smoke tests, headless-Chrome layout gate.

**Spec:** `docs/superpowers/specs/2026-10-01-assignment-ui-split-panel-design.md`
**Visual reference:** `assignment-ui-mockups.html`, concept 3.

## Global Constraints

- Colours come from theme tokens only — no hex, no `url()`, no `@import`, no `<style>`, no inline CSS (build.py enforces).
- Preserve every hook: `lna-begin`, `lna-start`, `lna-first`, `lna-last`, `lna-id`, `lna-name`, `lna-quiz`, `lna-ident`, `lna-deck`, `lna-lock-open`, `lna-lock-shut`, `lna-lock-link`, `lna-prog`, `lna-dots`, `lna-dot`, `lna-q`, `lna-opt`, `lna-txt`, `lna-area`, `lna-back`, `lna-next`, `lna-exit`, `lna-watermark`, `lna-cover`, radio `name` patterns, and `textarea`.
- Preserve button text exactly: `Next →`, `← Back`, `Submit`, `Begin assignment`, `Verify identity & start quiz`.
- Preserve the behavioural invariant: `show()` is the sole recompute point for `next.disabled` and the progress markers; every answer writer calls `bump()`.
- No flow, gating, encryption, DAG/flat, watermark, or guard changes. No timer.
- Breakpoints: phone `≤600px`, tablet `601–1023px`, desktop `≥1024px` (viewport media queries).
- Every grid `fr` track clamped as `minmax(0, Nfr)`; grid children `min-width:0`; boxes grow with content (no fixed `min-height`).

---

## File Structure

- `v2/skeleton/components/assignment/component.js` — modify: rail/shell/main DOM, Begin-card meta/pill, DAG trail.
- `v2/skeleton/components/assignment/component.css` — rewrite: concept-3 token system.
- `v2/skeleton/components/assignment/README.md` — modify: document the layout and hooks.
- `tests/test_assignment_ui.py` — create: source-contract test for the new UI.
- `v2/tools/assignment_smoke.js` — modify: assert the DAG rail trail grows (behaviour guard).

---

### Task 1: UI contract test + component.js structure

**Files:**
- Create: `tests/test_assignment_ui.py`
- Modify: `v2/skeleton/components/assignment/component.js`

**Interfaces:**
- Consumes: `LN.h(tag, attrs, children)` from the shell runtime.
- Produces: DOM hooks `.lna-shell`, `.lna-rail`, `.lna-rail-eyebrow`, `.lna-rail-title`, `.lna-rail-count`, `.lna-rail-meta`, `.lna-main`, `.lna-entry-top`, `.lna-eyebrow`, `.lna-entry-title`, `.lna-entry-body`, `.lna-meta`, `.lna-chip`, `.lna-pill` (+ `-open`/`-wait`/`-shut`).

- [ ] **Step 1: Write the failing test**

Create `tests/test_assignment_ui.py`:

```python
from pathlib import Path
import re

COMP = Path(__file__).resolve().parents[1] / "v2" / "skeleton" / "components" / "assignment"


def _js():
    return (COMP / "component.js").read_text(encoding="utf-8")


def test_ui_shell_structure_present():
    js = _js()
    for hook in ("lna-shell", "lna-rail", "lna-main",
                 "lna-rail-eyebrow", "lna-rail-title", "lna-rail-count"):
        assert hook in js, hook


def test_ui_begin_card_meta_and_pill():
    js = _js()
    for hook in ("lna-entry-top", "lna-eyebrow", "lna-entry-title",
                 "lna-entry-body", "lna-meta", "lna-chip", "lna-pill"):
        assert hook in js, hook


def test_ui_preserves_required_hooks():
    js = _js()
    for hook in ("lna-begin", "lna-watermark", "lna-ident", "lna-start",
                 "lna-quiz", "lna-prog", "lna-dots", "lna-dot"):
        assert hook in js, hook
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_assignment_ui.py -v`
Expected: FAIL — `lna-shell` (and the other new hooks) not found.

- [ ] **Step 3: Replace the Begin-card build in `component.js`**

Find the block that starts at `var box = LN.h("div", { class: "lna" });` and ends at `box.appendChild(card);` (around lines 153–170). Replace it with:

```js
      var box = LN.h("div", { class: "lna" });
      var card = LN.h("div", { class: "lna-entry" });
      var meta = windowMeta();
      var introFallback = isDag
        ? "A branching scenario closes this lesson. Read each decision twice — your path is what the teacher grades. "
        : "20 situational questions close this lesson. ";
      var lengthLabel = isDag
        ? ("Branching · " + (maxLevel + 1) + " layers")
        : (items.length + " questions");
      var pill = LN.h("span", { class: "lna-pill lna-pill-wait", text: "Checking…" });
      card.appendChild(LN.h("div", { class: "lna-entry-top" }, [
        LN.h("span", { class: "lna-eyebrow", text: "Assignment · to be submitted" }),
        pill]));
      card.appendChild(LN.h("h3", { class: "lna-entry-title",
        text: d.title || "Assignment" }));
      card.appendChild(LN.h("p", { class: "lna-entry-body",
        text: (d.intro || introFallback) +
          "Answers are collected — never scored or corrected here — and download " +
          "as an encrypted file for your teacher once you submit." }));
      card.appendChild(LN.h("div", { class: "lna-meta" }, [
        LN.h("span", { class: "lna-chip", text: lengthLabel }),
        LN.h("span", { class: "lna-chip", text: "Encrypted submit" }),
        LN.h("span", { class: "lna-chip",
          text: meta.day.charAt(0).toUpperCase() + meta.day.slice(1) +
            " · " + meta.tz })]));
      var begin = LN.h("button", { type: "button", class: "lna-begin",
        text: "Begin assignment" });
      card.appendChild(begin);
      var gateNote = LN.h("p", { class: "lna-gate" });
      var gateState = { checked: false, inWindow: false, iso: "", dow: "" };
      card.appendChild(gateNote);
      box.appendChild(card);
```

(This removes the old `var begin`, `var gateNote`, `var meta`, `var gateState` declarations that followed; they are now declared here, once.)

- [ ] **Step 4: Update `renderGate()` to drive the pill**

Replace the whole `function renderGate() { … }` (around lines 424–454) with:

```js
      function renderGate() {
        if (!gateState.checked) {
          pill.className = "lna-pill lna-pill-wait"; pill.textContent = "Checking…";
          gateNote.className = "lna-gate";
          gateNote.textContent = "Checking the trusted time\u2026";
          begin.disabled = true;
          return;
        }
        if (gateState.inWindow) {
          pill.className = "lna-pill lna-pill-open"; pill.textContent = "Open today";
          gateNote.className = "lna-gate lna-lock-open";
          gateNote.textContent = "Open today \u2713 \u2014 this assignment closes at " +
            "11:59 PM (" + meta.tz + ").";
          begin.disabled = false;
          return;
        }
        pill.className = "lna-pill lna-pill-shut"; pill.textContent = "Locked";
        if (gateState.dow === "") {
          gateNote.className = "lna-gate lna-lock-shut";
          gateNote.textContent = "Cannot verify the time \u2014 connect to the internet, " +
            "then reload this page.";
        } else {
          var dayName = meta.day.charAt(0).toUpperCase() + meta.day.slice(1);
          var today = gateState.dow.charAt(0).toUpperCase() +
            gateState.dow.slice(1);
          var when = gateState.iso ? " (" + gateState.iso.replace("T", " ") +
            ")" : "";
          gateNote.className = "lna-gate lna-lock-shut";
          gateNote.textContent = "This assignment opens " + dayName +
            ", 12:00 AM \u2013 11:59 PM (" + meta.tz + "). Today is " + today +
            when + " \u2014 come back on " + dayName + ".";
        }
        begin.disabled = true;
      }
```

- [ ] **Step 5: Wrap the quiz in a shell (rail + main)**

Replace the block from `var quiz = LN.h("div", { class: "lna-quiz" });` through `box.appendChild(deck);` (around lines 234–341) with:

```js
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
        });
      }
      var railCount = LN.h("span", { class: "lna-rail-count" });
      var rail = LN.h("div", { class: "lna-rail" }, [
        LN.h("span", { class: "lna-rail-eyebrow", text: "Assignment" }),
        LN.h("b", { class: "lna-rail-title",
          text: d.title || document.title || "Assignment" }),
        railCount,
        LN.h("p", { class: "lna-rail-meta",
          text: "Encrypted submit — answers are never revealed." })]);
      var railPath = null;
      if (isDag) {
        railPath = LN.h("ul", { class: "lna-path" });
        rail.appendChild(railPath);
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
      var main = LN.h("div", { class: "lna-main" });
      main.appendChild(head);
      slides.forEach(function (s) { main.appendChild(s); });
      main.appendChild(errB);
      main.appendChild(navA);
      main.appendChild(navB);
      main.appendChild(navC);
      var shell = LN.h("div", { class: "lna-shell" }, [rail, main]);
      quiz.appendChild(shell);
      sheet.appendChild(ident);
      sheet.appendChild(quiz);
      deck.appendChild(wm);
      deck.appendChild(sheet);
      box.appendChild(deck);
```

- [ ] **Step 6: Update `show()` and `showDag()` to write the rail counter**

In `function showDag()`, immediately after the line `prog.textContent = "Layer " + (n.level + 1) + " of " + (maxLevel + 1);`, add:

```js
        railCount.textContent = "Layer " + (n.level + 1) + " of " + (maxLevel + 1);
```

In `function show(ix)`, immediately after the line `prog.textContent = "Question " + (state.ix + 1) + " of " + items.length;`, add:

```js
        railCount.textContent = "Question " + (state.ix + 1) + " of " + items.length;
```

- [ ] **Step 7: Update the `unlockThenInit` card to the same vocabulary**

Replace the first four lines of `function unlockThenInit(root, d) { … }`:

```js
    var box = LN.h("div", { class: "lna" });
    var card = LN.h("div", { class: "lna-entry" });
    card.appendChild(LN.h("p", { text: "ASSIGNMENT — TO BE SUBMITTED" }));
    var status = LN.h("p", { class: "lna-gate", text: "Unlocking\u2026" });
```

with:

```js
    var box = LN.h("div", { class: "lna" });
    var card = LN.h("div", { class: "lna-entry" });
    card.appendChild(LN.h("div", { class: "lna-entry-top" }, [
      LN.h("span", { class: "lna-eyebrow", text: "Assignment · to be submitted" }),
      LN.h("span", { class: "lna-pill lna-pill-wait", text: "Locked" })]));
    card.appendChild(LN.h("h3", { class: "lna-entry-title", text: "Assignment" }));
    var status = LN.h("p", { class: "lna-gate", text: "Unlocking\u2026" });
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `python -m pytest tests/test_assignment_ui.py -v`
Expected: PASS (3 tests).

- [ ] **Step 9: Run the behaviour smoke**

Run: `node v2/tools/assignment_smoke.js`
Expected: `SMOKE OK — flat deck + dag walk both let the student advance.`

- [ ] **Step 10: Commit**

```bash
git add tests/test_assignment_ui.py v2/skeleton/components/assignment/component.js
git commit -m "feat(assignment): split-panel shell, meta rail, begin-card status"
```

---

### Task 2: Rewrite `component.css` (concept 3, tokens only)

**Files:**
- Modify: `v2/skeleton/components/assignment/component.css` (full rewrite)
- Test: `tests/test_assignment_ui.py` (append CSS contract tests)

**Interfaces:**
- Consumes: the DOM hooks produced by Task 1.
- Produces: responsive `.lna-shell` grid (`240px minmax(0,1fr)` at ≥1024px), segmented `.lna-dot` progress, `.lna-prog` visually hidden, selected-option state via `.lna-opt:has(input:checked)`.

- [ ] **Step 1: Write the failing CSS tests**

Append to `tests/test_assignment_ui.py`:

```python
def _css():
    return (COMP / "component.css").read_text(encoding="utf-8")


def test_ui_css_concept3_selectors():
    css = _css()
    for sel in (".lna-shell", ".lna-rail", ".lna-main", ".lna-rail-count",
                ".lna-opt:has(input:checked)", ".lna-dot"):
        assert sel in css, sel
    assert "grid-template-columns:240px minmax(0,1fr)" in css
    assert "@media (min-width:1024px)" in css
    assert "@media (max-width:600px)" in css


def test_ui_css_is_token_only():
    css = _css()
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b", css)
    assert "http" not in css and "@import" not in css
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_ui.py -v`
Expected: FAIL — `.lna-shell` / `grid-template-columns:240px …` not present in the old CSS.

- [ ] **Step 3: Replace the whole `component.css`**

Overwrite `v2/skeleton/components/assignment/component.css` with:

```css
/* assignment — begin card, fullscreen split-panel deck, watermark, guards.
   Colours are theme tokens only. */
.lna{user-select:none;-webkit-user-select:none;position:relative}
.lna input,.lna textarea{-webkit-user-select:text;user-select:text}

/* ---- Begin card (inline in Section 7) ---- */
.lna-entry{border:1px solid var(--grid-strong);border-left:4px solid var(--accent);
  border-radius:var(--radius);background:var(--surface-2);padding:18px;
  margin:14px 0;box-shadow:var(--shadow-sm)}
.lna-entry-top{display:flex;align-items:center;justify-content:space-between;
  gap:10px;flex-wrap:wrap}
.lna-eyebrow{font:700 10.5px/1 var(--mono);letter-spacing:.1em;
  text-transform:uppercase;color:var(--accent-deep)}
.lna-entry-title{font:700 20px/1.25 var(--display);
  letter-spacing:var(--display-tracking);text-transform:var(--display-transform);
  color:var(--ink);margin:10px 0 8px}
.lna-entry-body{margin:0 0 14px;color:var(--ink-soft);font-size:14.5px;line-height:1.55}
.lna-meta{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px}
.lna-chip{font:600 11.5px/1 var(--mono);color:var(--ink-soft);background:var(--surface);
  border:1px solid var(--grid-strong);border-radius:8px;padding:6px 9px}
.lna-pill{font:700 11px/1 var(--sans);padding:5px 11px;border-radius:999px;
  background:var(--grid);color:var(--ink-soft);white-space:nowrap}
.lna-pill-open{background:var(--green-bg);color:var(--green)}
.lna-pill-wait,.lna-pill-shut{background:var(--amber-bg);color:var(--amber)}
.lna-gate{margin:8px 0 2px;font-size:13.5px;color:var(--ink-soft)}
.lna-lock-open{color:var(--green)}
.lna-lock-shut{background:var(--amber-bg);border:1px solid var(--amber);
  border-radius:10px;padding:10px 12px;color:var(--ink)}
.lna-lock-link{background:var(--note-blue);border:1px solid var(--grid-strong);
  border-radius:10px;padding:10px 12px;color:var(--ink);word-break:break-all}
.lna-begin{display:block;width:100%;background:var(--accent);color:var(--surface);
  border:0;border-radius:10px;padding:12px 18px;font:600 14.5px/1.2 var(--sans);
  cursor:pointer}
.lna-begin:hover{background:var(--accent-deep)}
.lna-begin[disabled]{opacity:.55;cursor:default}

/* ---- deck shell ---- */
.lna-deck{display:none}
.lna-deck.open{display:block}
.lna-over{position:fixed;inset:0;background:var(--surface);z-index:210;
  overflow:auto;border-radius:0}
.lna-watermark{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.lna-watermark span{position:absolute;font:700 12px/1 var(--mono);
  color:var(--ink-faint);opacity:.5;transform:rotate(-24deg);white-space:nowrap;
  min-width:0}
.lna-sheet{position:relative;z-index:2;max-width:1040px;margin:0 auto;
  padding:18px 16px 44px;min-width:0}
.lna-quiz{min-width:0}
.lna-shell{display:grid;grid-template-columns:minmax(0,1fr);min-width:0}
.lna-shell>*{min-width:0}
.lna-main{min-width:0}

/* ---- rail (slim strip; column on desktop) ---- */
.lna-rail{display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  background:var(--surface-2);border:1px solid var(--grid-strong);
  border-radius:var(--radius);padding:11px 14px;margin-bottom:12px;min-width:0}
.lna-rail-eyebrow{font:700 10px/1 var(--mono);letter-spacing:.1em;
  text-transform:uppercase;color:var(--accent-deep)}
.lna-rail-title{font:700 13px/1.3 var(--sans);color:var(--ink);min-width:0}
.lna-rail-count{margin-left:auto;font:700 13px/1 var(--mono);
  color:var(--accent-deep);white-space:nowrap}
.lna-rail-meta{display:none;font:12px/1.5 var(--mono);color:var(--ink-faint);margin:0}
.lna-path{display:none;list-style:none;margin:0;padding:0}

/* ---- head + segmented progress ---- */
.lna-head{display:flex;flex-direction:column;gap:8px;margin:6px 0 14px}
.lna-prog{position:absolute;width:1px;height:1px;margin:-1px;padding:0;
  overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
.lna-dots{display:flex;gap:4px;flex-wrap:nowrap;min-width:0}
.lna-dot{flex:1 1 0;min-width:0;height:6px;border-radius:999px;background:var(--grid)}
.lna-dot.on{background:var(--accent)}
.lna-dot.done{background:var(--accent-deep)}

/* ---- identity gate ---- */
.lna-ident{max-width:640px;margin:8vh auto 0;background:var(--surface-2);
  border:1px solid var(--grid-strong);border-left:4px solid var(--accent);
  border-radius:var(--radius);padding:22px;box-shadow:var(--shadow)}
.lna-ident-t{font-size:19px;font-weight:700;margin:0 0 6px;color:var(--ink)}
.lna-ident-s{font-size:14px;color:var(--ink-soft);margin:0 0 14px;line-height:1.55}
.lna-start{margin-top:4px}
.lna-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  gap:12px;margin:0 0 14px}
.lna-form>div{min-width:0}
.lna-form-wide{grid-column:1/-1}
.lna-form label{display:block;margin-bottom:6px;font:600 11.5px/1.4 var(--mono);
  color:var(--ink-faint);letter-spacing:.08em;text-transform:uppercase}
.lna-name,.lna-id{font:15px/1.3 var(--sans);padding:10px 11px;width:100%;min-width:0;
  border:1.5px solid var(--grid-strong);border-radius:9px;background:var(--surface);
  color:var(--ink)}
.lna-name:focus,.lna-id:focus{outline:none;border-color:var(--accent);
  box-shadow:0 0 0 3px var(--highlight)}

/* ---- error ---- */
.lna-err{display:none;background:var(--red-bg);border:1px solid var(--red);
  border-radius:10px;padding:10px 12px;font-size:13.5px;margin:10px 0;color:var(--ink)}
.lna-err.show{display:block}

/* ---- question ---- */
.lna-q{font:600 17px/1.45 var(--sans);letter-spacing:-.01em;color:var(--ink);
  margin:10px 0 14px}
.lna-opt{display:flex;gap:11px;align-items:flex-start;padding:12px 13px;
  border:1.5px solid var(--grid-strong);border-radius:10px;margin:0 0 8px;
  background:var(--surface-2);cursor:pointer;min-width:0}
.lna-opt input{flex:none;margin:3px 0 0}
.lna-opt:has(input:checked){border-color:var(--accent);background:var(--highlight);
  box-shadow:inset 3px 0 0 var(--accent)}
.lna-opt:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--highlight)}
.lna-txt,.lna-area{width:100%;font:15px/1.55 var(--sans);padding:11px 12px;
  border:1.5px solid var(--grid-strong);border-radius:10px;background:var(--surface);
  color:var(--ink);min-width:0}
.lna-txt:focus,.lna-area:focus{outline:none;border-color:var(--accent);
  box-shadow:0 0 0 3px var(--highlight)}
.lna-area{min-height:104px;resize:vertical}

/* ---- nav ---- */
.lna-nav{display:flex;gap:10px;align-items:center;justify-content:space-between;
  flex-wrap:wrap;margin-top:16px;border-top:1px solid var(--grid-strong);padding-top:12px}
.lna-nf{display:flex;gap:10px;min-width:0}
.lna-back,.lna-next,.lna-exit{font:600 14px/1.2 var(--sans);border-radius:10px;
  padding:10px 16px;cursor:pointer;border:1px solid var(--grid-strong);
  background:var(--surface-2);color:var(--ink)}
.lna-next{background:var(--accent);color:var(--surface);border-color:var(--accent)}
.lna-next[disabled]{opacity:.5}
.lna-note{font:12px/1.5 var(--mono);color:var(--ink-faint)}

/* ---- dag bits ---- */
.lna-dag-outcome{background:var(--surface-2);border:1px solid var(--grid-strong);
  border-left:3px solid var(--accent);border-radius:10px;padding:10px 12px;
  margin:0 0 10px;font-size:14px;color:var(--ink-soft)}
.lna-dag-final{background:var(--note-yellow);border:1px solid var(--grid-strong);
  border-radius:10px;padding:12px 14px;margin:12px 0 0;font-size:15px;color:var(--ink)}

/* ---- cover + print ---- */
.lna-cover{position:absolute;inset:0;background:var(--ink);display:none;z-index:5}
.lna-cover.show{display:block}
@media print{.lna{display:none!important}}

/* ---- phone ---- */
@media (max-width:600px){
  .lna-form{grid-template-columns:minmax(0,1fr)}
  .lna-sheet{padding:12px 10px 56px}
  .lna-q{font-size:16px}
  .lna-nav{position:sticky;bottom:0;background:var(--surface);padding-bottom:14px}
  .lna-nf{width:100%}
  .lna-back,.lna-next,.lna-exit{flex:1 1 auto}
}

/* ---- tablet ---- */
@media (min-width:601px) and (max-width:1023px){
  .lna-sheet{max-width:760px}
  .lna-nav{position:sticky;bottom:0;background:var(--surface);padding-bottom:14px}
}

/* ---- desktop: rail becomes a left column ---- */
@media (min-width:1024px){
  .lna-sheet{max-width:1040px;padding:24px 24px 48px}
  .lna-shell{grid-template-columns:240px minmax(0,1fr);align-items:start}
  .lna-rail{flex-direction:column;align-items:flex-start;gap:12px;
    position:sticky;top:16px;margin-bottom:0;padding:20px 18px;border-left:0;
    border-right:3px solid var(--accent);min-height:0}
  .lna-rail-title{font-size:16px}
  .lna-rail-count{margin:0;font-size:22px}
  .lna-rail-meta{display:block}
  .lna-path{display:flex;flex-direction:column;gap:8px;width:100%;margin-top:4px;
    padding-top:12px;border-top:1px dashed var(--grid-strong)}
  .lna-path li{font:600 12.5px/1.35 var(--sans);color:var(--ink-soft);
    padding-left:14px;position:relative;min-width:0}
  .lna-path li::before{content:"";position:absolute;left:0;top:6px;width:6px;
    height:6px;border-radius:999px;background:var(--accent)}
  .lna-main{padding-left:24px}
  .lna-nav{position:static;padding-bottom:0}
  .lna-back,.lna-next{flex:none}
  .lna-q{font-size:19px;max-width:46ch}
  .lna-opt{padding:14px 16px}
  .lna-ident{padding:26px 28px}
}
```

- [ ] **Step 4: Run the CSS tests to verify they pass**

Run: `python -m pytest tests/test_assignment_ui.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the component contract suite**

Run: `python -m pytest tests/test_assignment_deck.py -v`
Expected: PASS. `test_component_files_clean` re-checks no-hex/no-`http`/no-`</x`.

- [ ] **Step 6: Run the behaviour smoke again**

Run: `node v2/tools/assignment_smoke.js`
Expected: `SMOKE OK`.

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/components/assignment/component.css tests/test_assignment_ui.py
git commit -m "style(assignment): concept-3 split-panel CSS with segmented progress"
```

---

### Task 3: DAG path trail in the rail

**Files:**
- Modify: `v2/skeleton/components/assignment/component.js`
- Modify: `v2/tools/assignment_smoke.js`
- Test: `tests/test_assignment_ui.py` (source contract)

**Interfaces:**
- Consumes: the DAG state `{ cur, path, picked, broken }` and `nodeById`.
- Produces: `state.trail` (array of display strings) rendered into `.lna-path` on every `showDag()`. The exported submission `path` shape stays `[{node,label}]` — unchanged.

- [ ] **Step 1: Add the failing source test**

Append to `tests/test_assignment_ui.py`:

```python
def test_ui_dag_rail_trail_present():
    js = _js()
    assert "lna-path" in js
    assert "state.trail" in js
```

- [ ] **Step 2: Add the failing behaviour assertion to the smoke test**

In `v2/tools/assignment_smoke.js`, inside the DAG walk, immediately after the
`next2.click();` that follows `check("dag: pick enables Next", next2.disabled === false);`
(i.e. after the walk has advanced from `n0` to `n1`) add:

```js
  const railPath = walk(root2, function (e) {
    return (e.className || "").indexOf("lna-path") >= 0;
  })[0];
  check("dag: rail trail records the first choice",
    !!railPath && railPath.children.length === 1,
    "path children=" + (railPath && railPath.children.length));
```

- [ ] **Step 3: Run both to verify they fail**

Run: `python -m pytest tests/test_assignment_ui.py::test_ui_dag_rail_trail_present -v`
Expected: FAIL — `state.trail` not found.
Run: `node v2/tools/assignment_smoke.js`
Expected: `FAIL dag: rail trail records the first choice` (rail exists but stays empty).

- [ ] **Step 4: Add `trail` to DAG state**

In `component.js`, change the DAG branch of the `state` initialiser from:

```js
        ? { identified: false, submitted: false,
            cur: (nodes.filter(function (n) { return n.level === 0; })[0] || nodes[0] || {}).id,
            path: [], picked: null, broken: false }
```

to:

```js
        ? { identified: false, submitted: false,
            cur: (nodes.filter(function (n) { return n.level === 0; })[0] || nodes[0] || {}).id,
            path: [], trail: [], picked: null, broken: false }
```

- [ ] **Step 5: Render the trail in `showDag()`**

In `component.js`, inside `function showDag()`, immediately after the
`railCount.textContent = "Layer " + …` line added in Task 1, add:

```js
        if (railPath) {
          railPath.innerHTML = "";
          state.trail.forEach(function (t) {
            railPath.appendChild(LN.h("li", { text: t }));
          });
        }
```

- [ ] **Step 6: Record each choice in the next handler**

In `component.js`, inside the `next.addEventListener("click", …)` DAG branch,
immediately after `state.path.push({ node: n.id, label: ch.label });` add:

```js
          state.trail.push(ch.label + ". " + ch.text);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `python -m pytest tests/test_assignment_ui.py -v`
Expected: PASS (6 tests).
Run: `node v2/tools/assignment_smoke.js`
Expected: `SMOKE OK` (includes the new rail-trail check).

- [ ] **Step 8: Commit**

```bash
git add v2/skeleton/components/assignment/component.js v2/tools/assignment_smoke.js tests/test_assignment_ui.py
git commit -m "feat(assignment): show the chosen path in the desktop rail"
```

---

### Task 4: Docs, rebuild, and full regression

**Files:**
- Modify: `v2/skeleton/components/assignment/README.md`
- Regenerate: `v2/Week4-Demo-Notebook.html` (sample build)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: updated component docs and a green full gate.

- [ ] **Step 1: Document the layout and hooks**

In `v2/skeleton/components/assignment/README.md`, after the first paragraph
(`The component never reveals answers …`), add:

```markdown
## Layout (split panel)

Begin opens a fullscreen deck whose body is `.lna-shell` — a `.lna-rail` beside a
`.lna-main`. On desktop (≥1024 px) the rail is a left column carrying the title,
position (`Question k of M` / `Layer k of L`), an "Encrypted submit" note, and —
in DAG mode — the path taken (`.lna-path`). On phone (≤600 px) and tablet
(601–1023 px) the rail collapses to a slim horizontal strip and the nav pins to
the bottom. Progress is the existing `.lna-dots` / `.lna-dot` row rendered as a
segmented bar; `.lna-prog` is kept in the DOM (visually hidden) as the counter
hook. Selected options use `.lna-opt:has(input:checked)`. All colours are theme
tokens; restyling never touches flow, gating, or the submission envelope.
```

- [ ] **Step 2: Rebuild the sample lesson**

Run (workdir `v2`): `python build.py sample/lesson-demo`
Expected: exit 0, `OK`, and `v2/Week4-Demo-Notebook.html` regenerated.

- [ ] **Step 3: Run the rendered layout gate (desktop and phone)**

Run (workdir `v2`): `node tools/layout_smoke.js Week4-Demo-Notebook.html`
Expected: `LAYOUT OK`.
Run (workdir `v2`): `node tools/layout_smoke.js Week4-Demo-Notebook.html --width 390`
Expected: `LAYOUT OK`. (If it prints `LAYOUT SKIP`, set `LN_CHROME` to a Chrome/Edge path — a skip is not a pass.)

- [ ] **Step 4: Run the full Python suite**

Run: `python -m pytest tests/ -q`
Expected: all tests pass.

- [ ] **Step 5: Run all node smokes**

Run: `node v2/tools/assignment_smoke.js`
Run: `node v2/tools/activity_smoke.js`
Expected: both `… OK`.

- [ ] **Step 6: Manual visual QA**

Open `v2/Week4-Demo-Notebook.html` in a browser. In Section 7: confirm the Begin
card's status pill and meta chips; click Begin and verify the identity gate, then
the deck at phone, tablet, and desktop widths. Confirm: the rail collapses to a
strip at ≤600 px and 601–1023 px; it is a left column at ≥1024 px; selected
options show the accent edge; the nav pins to the bottom on phone/tablet; the
counter reads `Question k of 20`. Then rebuild with `"assignment": "dag"` in a
scratch workdir to confirm the rail path trail grows with each choice. Repeat in
the `opal`, `studio`, and `ledger` themes.

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/components/assignment/README.md v2/Week4-Demo-Notebook.html
git commit -m "docs(assignment): document split-panel layout; rebuild sample"
```

---

## Self-Review

- **Spec coverage:** §3.1 tokens → Task 2; §3.2 Begin card → Task 1; identity / deck / nav / progress → Tasks 1–2; DAG rail path → Task 3; §3.3 breakpoints → Task 2; §4.1 JS → Tasks 1,3; §4.2 CSS → Task 2; §4.3 themes → Global Constraints + Task 4 QA; §4.4 hooks/invariants → Global Constraints + Task 1 test; §5 a11y → Task 2 (`:focus-within`, `:has`); §6 testing → Tasks 1–4; §7 files → File Structure.
- **Placeholder scan:** none — every code step is complete; the layout smoke and manual QA are the only non-code steps and carry exact commands/expectations.
- **Type consistency:** `state.trail` (Task 3) matches the test assertion; `.lna-rail-count` written in `show()`/`showDag()` (Task 1) is the element created in Task 1's shell block; `.lna-path` is created only when `isDag`, matching the `railPath` guard in Task 3.
