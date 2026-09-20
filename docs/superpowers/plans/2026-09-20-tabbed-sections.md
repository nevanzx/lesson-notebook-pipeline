# Tabbed Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the notebook shell from straight scroll to top tab bar with one section visible at a time.

**Architecture:** Modify only `v2/skeleton/shell.html` — add tab bar DOM + CSS gated behind `body.js-tabs`, extend LN runtime (`_buildTabs`, `_showSection`) to toggle `section.block[hidden]`, sync sidebar TOC, drive progress by tab position, keep print/no-JS as straight lesson.

**Tech Stack:** Plain HTML/CSS/JS in shell.html (no deps), Python stdlib `build.py` assembler (unchanged), pytest.

## Global Constraints

- Colours are `var(--token)` only — no hex in new CSS except inside existing `/*HEXOK*/ /*ENDHEX*/` print block.
- No `http(s)://`, no `@import`, no non-gradient `url()` in shell or parts.
- Keep exact marker slots: `__TITLE__`, `/*__THEME__*/`, `/*__TUNE__*/`, `/*__COMPONENT_CSS__*/`, `<!--__SECTIONS__-->`, `/*__DATA__*/`, `/*__COMPONENT_JS__*/`, `__META__`.
- Keep `LN.boot()`, `#lnToc`, `#lnProg`, `#lnReset`, `#lnErrors`, `@media print`.
- Grid `fr` tracks must be `minmax(0,Nfr)`; grid children `min-width:0`.
- Print shows ALL sections in outline order; tab bar and Prev/Next hidden on print.
- No-JS shows straight lesson (all sections visible).
- Respect `prefers-reduced-motion`.

---

### Task 1: Tab bar + panel CSS and DOM containers

**Files:**
- Modify: `D:\Python\lesson-notebook-pipeline\v2\skeleton\shell.html:142-210`
- Test: `D:\Python\lesson-notebook-pipeline\tests\test_shell_smoke.py`

**Interfaces:**
- Consumes: existing `section.block`, `.content`, `.sheet` layout.
- Produces: DOM ids `#lnTabs`, `#lnPrev`, `#lnNext`, `#lnCounter` and CSS classes `.tabs`, `.ln-tab`, `.tab-nav` for Task 2 JS to wire.

- [ ] **Step 1: Write the failing test**

Add `tests/test_shell_tabs.py` with:

```python
from pathlib import Path
REPO = Path(__file__).resolve().parents[1]
SHELL = REPO / "v2" / "skeleton" / "shell.html"

def test_shell_has_tab_containers():
    t = SHELL.read_text(encoding="utf-8")
    assert 'id="lnTabs"' in t
    assert 'id="lnPrev"' in t
    assert 'id="lnNext"' in t
    assert 'id="lnCounter"' in t

def test_shell_tab_css_uses_tokens_and_print_hides_tabs():
    t = SHELL.read_text(encoding="utf-8")
    assert '.tabs' in t
    assert '@media print' in t
    # print block must hide tabs/nav
    assert '.tabs' in t.split('@media print', 1)[1]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_shell_tabs.py -v`
Expected: FAIL with `assert 'id="lnTabs"'`.

- [ ] **Step 3: Write minimal implementation**

In `v2/skeleton/shell.html`, in CSS after `.swipe-hint` block (~line 137), insert:

```css
.tabs{position:sticky;top:0;z-index:20;display:none;gap:8px;overflow-x:auto;padding:10px 4px;margin:0 0 16px;background:var(--surface-2);border:1px solid var(--grid);border-radius:12px;box-shadow:var(--shadow-sm)}
body.js-tabs .tabs{display:flex}
.ln-tab{flex:0 0 auto;border:1px solid var(--grid-strong);background:var(--surface);color:var(--ink-soft);border-radius:999px;padding:7px 13px;font:600 13px/1.2 var(--sans);cursor:pointer;white-space:nowrap}
.ln-tab .n{font:11px/1 var(--mono);color:var(--ink-faint);margin-right:6px}
.ln-tab.active{background:var(--highlight);color:var(--ink);border-color:var(--accent)}
body.js-tabs section.block[hidden]{display:none}
.tab-nav{display:none;align-items:center;justify-content:space-between;gap:12px;margin:18px 0 4px}
body.js-tabs .tab-nav{display:flex}
#lnCounter{font:12px/1 var(--mono);color:var(--ink-faint)}
```

In HTML inside `.content` just before `<!--__SECTIONS__-->` (~line 206), insert:

```html
<div class="tabs no-print" role="tablist" aria-label="Lesson sections"><div id="lnTabs" style="display:contents"></div></div>
```

After `<!--__SECTIONS__-->` still inside `.content`, insert:

```html
<div class="tab-nav no-print"><button class="btn" id="lnPrev" type="button">← Prev</button><span id="lnCounter" aria-live="polite"></span><button class="btn" id="lnNext" type="button">Next →</button></div>
```

In print block `@media print` add to the hide selector list: `.tabs,.tab-nav`:

```css
.decor,.sidebar,.menu-btn,.scrim,.no-print,#lnErrors{display:none!important}
```

already covers `.tabs`/`.tab-nav` via `.no-print`, plus append explicit rule:

```css
body.js-tabs section.block[hidden]{display:block!important}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_shell_tabs.py tests/test_shell_smoke.py -v`
Expected: PASS (smoke still passes: markers gone after build, print present, `LN.boot()`, Reset, lnErrors).

- [ ] **Step 5: Commit**

```bash
git add v2/skeleton/shell.html tests/test_shell_tabs.py
git commit -m "feat(shell): add tab bar containers and CSS"
```

### Task 2: Tab JS — build, show, sidebar sync, hash

**Files:**
- Modify: `D:\Python\lesson-notebook-pipeline\v2\skeleton\shell.html:296-370`
- Test: `D:\Python\lesson-notebook-pipeline\tests\test_shell_tabs.py`

**Interfaces:**
- Consumes: `#lnTabs`, `section.block[id]` order from Task 1.
- Produces: `LN._buildTabs()`, `LN._showSection(i)` used by Task 3 Prev/Next.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_shell_tabs.py`:

```python
def test_shell_tab_js_present():
    t = SHELL.read_text(encoding="utf-8")
    assert 'LN._buildTabs' in t
    assert 'LN._showSection' in t
    assert 'js-tabs' in t
    assert 'aria-selected' in t
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_shell_tabs.py::test_shell_tab_js_present -v`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Replace `LN._buildToc` body-adjacent code: keep existing `LN._buildToc` as-is, add after it:

```js
LN._tabIndex = 0;
LN._buildTabs = function () {
  var wrap = document.getElementById("lnTabs");
  if (!wrap) return;
  wrap.innerHTML = "";
  var secs = document.querySelectorAll("section.block[id]");
  document.body.classList.add("js-tabs");
  Array.prototype.forEach.call(secs, function (s, i) {
    var hd = s.querySelector("h2,h1");
    var b = LN.h("button", { class: "ln-tab", role: "tab",
      id: "ln-tab-" + s.id, "aria-controls": s.id, "aria-selected": i === 0 ? "true" : "false" });
    b.appendChild(LN.h("span", { class: "n", text: ("0" + (i + 1)).slice(-2) }));
    b.appendChild(LN.h("span", { text: hd ? hd.textContent : s.id }));
    (function (idx) { b.addEventListener("click", function () { LN._showSection(idx, true); }); })(i);
    wrap.appendChild(b);
    s.setAttribute("role", "tabpanel");
    s.setAttribute("aria-labelledby", "ln-tab-" + s.id);
  });
};
LN._showSection = function (idx, pushHash) {
  var secs = document.querySelectorAll("section.block[id]");
  if (!secs.length) return;
  if (idx < 0) idx = 0;
  if (idx >= secs.length) idx = secs.length - 1;
  LN._tabIndex = idx;
  var tabs = document.querySelectorAll("#lnTabs .ln-tab");
  Array.prototype.forEach.call(secs, function (s, i) {
    if (i === idx) s.removeAttribute("hidden");
    else s.setAttribute("hidden", "");
    s.classList.toggle("active", i === idx);
  });
  Array.prototype.forEach.call(tabs, function (b, i) {
    b.classList.toggle("active", i === idx);
    b.setAttribute("aria-selected", i === idx ? "true" : "false");
    if (i === idx) b.setAttribute("tabindex", "0");
    else b.setAttribute("tabindex", "-1");
  });
  var toc = document.getElementById("lnToc");
  var links = toc ? toc.querySelectorAll("a") : [];
  Array.prototype.forEach.call(links, function (a, i) {
    a.classList.toggle("active", i === idx);
    if (i === idx) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
  var prog = document.getElementById("lnProg");
  if (prog) prog.style.width = ((idx + 1) / secs.length * 100) + "%";
  var counter = document.getElementById("lnCounter");
  if (counter) counter.textContent = "Section " + (idx + 1) + " of " + secs.length;
  var prev = document.getElementById("lnPrev");
  var next = document.getElementById("lnNext");
  if (prev) prev.disabled = idx === 0;
  if (next) next.disabled = idx === secs.length - 1;
  var id = secs[idx].id;
  if (pushHash !== false) {
    try { history.replaceState(null, "", "#" + id); } catch (e) {}
  }
  var sheet = document.querySelector(".sheet");
  if (sheet && !LN.mos) sheet.scrollIntoView();
  else if (sheet) sheet.scrollIntoView();
};
```

In `LN._wireChrome`, after drawer wiring add:

```js
var tocClick = document.getElementById("lnToc");
if (tocClick) tocClick.addEventListener("click", function (ev) {
  var a = ev.target.closest ? ev.target.closest("a[href^='#']") : null;
  if (!a) return;
  var id = a.getAttribute("href").slice(1);
  var secs = document.querySelectorAll("section.block[id]");
  for (var i = 0; i < secs.length; i++) {
    if (secs[i].id === id) { ev.preventDefault(); LN._showSection(i, true); break; }
  }
});
window.addEventListener("hashchange", function () {
  var id = location.hash.slice(1);
  var secs = document.querySelectorAll("section.block[id]");
  Array.prototype.forEach.call(secs, function (s, i) {
    if (s.id === id) LN._showSection(i, false);
  });
});
```

In `LN.boot`, after `LN._buildToc()` add:

```js
LN._buildTabs();
var start = 0;
var hid = location.hash ? location.hash.slice(1) : "";
var all = document.querySelectorAll("section.block[id]");
Array.prototype.forEach.call(all, function (s, i) { if (s.id === hid) start = i; });
LN._showSection(start, false);
```

Replace scroll-spy `onScroll` progress/TOC-active section with no-op guard: keep function but early-return when `document.body.classList.contains("js-tabs")` for the scroll-spy part (progress now driven by tabs). Keep drawer/reset wiring untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_shell_tabs.py tests/test_shell_smoke.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add v2/skeleton/shell.html tests/test_shell_tabs.py
git commit -m "feat(shell): tab switching with sidebar sync and hash"
```

### Task 3: Prev/Next, keyboard, print/no-JS hardening

**Files:**
- Modify: `D:\Python\lesson-notebook-pipeline\v2\skeleton\shell.html:309-351`
- Test: `D:\Python\lesson-notebook-pipeline\tests\test_shell_tabs.py`

**Interfaces:**
- Consumes: `LN._showSection`, `LN._tabIndex` from Task 2.
- Produces: finished tab chrome; nothing further consumes.

- [ ] **Step 1: Write the failing test**

Append:

```python
def test_shell_prev_next_keyboard_print():
    t = SHELL.read_text(encoding="utf-8")
    assert 'id="lnPrev"' in t and 'lnNext' in t
    assert 'ArrowRight' in t or 'ArrowLeft' in t
    assert 'section.block[hidden]{display:block!important}' in t.replace(' ', '')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_shell_tabs.py::test_shell_prev_next_keyboard_print -v`
Expected: FAIL (keyboard handler missing).

- [ ] **Step 3: Write minimal implementation**

In `LN._wireChrome` add:

```js
var prev = document.getElementById("lnPrev");
var next = document.getElementById("lnNext");
if (prev) prev.addEventListener("click", function () { LN._showSection(LN._tabIndex - 1, true); });
if (next) next.addEventListener("click", function () { LN._showSection(LN._tabIndex + 1, true); });
var tabs = document.getElementById("lnTabs");
if (tabs) tabs.addEventListener("keydown", function (ev) {
  var n = document.querySelectorAll("#lnTabs .ln-tab").length;
  if (ev.key === "ArrowRight") { ev.preventDefault(); LN._showSection(Math.min(n - 1, LN._tabIndex + 1), true); }
  else if (ev.key === "ArrowLeft") { ev.preventDefault(); LN._showSection(Math.max(0, LN._tabIndex - 1), true); }
  else if (ev.key === "Home") { ev.preventDefault(); LN._showSection(0, true); }
  else if (ev.key === "End") { ev.preventDefault(); LN._showSection(n - 1, true); }
  var btns = tabs.querySelectorAll(".ln-tab");
  if (btns[LN._tabIndex]) btns[LN._tabIndex].focus();
});
document.addEventListener("keydown", function (ev) {
  if (ev.key === "Escape") { var sb = document.getElementById("lnSidebar"); if (sb) sb.classList.remove("open"); }
});
```

Verify print CSS contains `body.js-tabs section.block[hidden]{display:block!important}` and `.tabs,.tab-nav` hidden via `.no-print`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_shell_tabs.py tests/test_shell_smoke.py tests/test_build.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add v2/skeleton/shell.html tests/test_shell_tabs.py
git commit -m "feat(shell): prev/next, keyboard, print hardening for tabs"
```

### Task 4: Rebuild demos + manual QA

**Files:**
- Verify: `D:\Python\lesson-notebook-pipeline\v2\skeleton\shell.html`
- Rebuild outputs (run dir = repo root): `opal-demo.html`, `parchment-demo.html`, `studio-demo.html`, `Component-Zoo-Demo.html`

**Interfaces:**
- Consumes: finished shell from Tasks 1-3.
- Produces: rebuilt demo notebooks proving no regression.

- [ ] **Step 1: Run full relevant suite**

Run: `python -m pytest tests/test_shell_smoke.py tests/test_shell_tabs.py tests/test_build.py tests/test_themes_matrix.py tests/test_components_matrix.py -q`
Expected: all PASS.

- [ ] **Step 2: Rebuild one demo and eyeball tabs**

Run: `python v2/build.py v2/sample/lesson-demo`
Expected: `OK` + `Week4-Demo-Notebook.html` in CWD with tab bar. Open file: click each tab, reload with `#<section-id>`, Prev/Next + counter, sidebar sync, mobile drawer, print preview shows all sections, assignment deck still opens.

- [ ] **Step 3: Commit rebuilt artifacts only if repo tracks them**

```bash
git status --short
```

Only commit shell + tests; demo HTML outputs are throwaway verification unless repo convention tracks them.

## Self-Review

- Spec coverage: top tab bar / one-at-a-time / Prev-Next + progress + sidebar sync / all-notebooks scope / hash / keyboard / print-all / no-JS straight — each has a task above (Tasks 1-3 build, Task 4 verifies).
- No placeholders: all steps carry exact paths, code, commands, expected outputs.
- Type consistency: `LN._tabIndex:number`, `LN._buildTabs():void`, `LN._showSection(idx:number, pushHash:boolean):void` used identically across Tasks 2-3.
