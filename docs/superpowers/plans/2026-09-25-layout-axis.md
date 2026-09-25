# Layout Axis + Mobile-First Shells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `layout` axis to the notebook builder (`desk` · `app` · `feed` · `sheet`) so the main session can pick a mobile-first shell per lesson, orthogonal to the colour theme.

**Architecture:** Refactor `v2/skeleton/shell.html` into a shared runtime plus per-layout plugins under `v2/skeleton/layouts/<name>/` (`layout.css`, `layout.js`, `chrome.html`). `build.py` resolves `build.json > layout` (default `desk`), injects the plugin into four new shell markers, and validates the plugin files with the existing hex/external/JS/grid scanners. A layout registers `LN.nav = {init, go}`; the shell's `LN._showSection` delegates to it. Sections stay `section.block[id]` with one `<h2>` — the outline contract is untouched.

**Tech Stack:** Python 3 (pytest), vanilla ES5-compatible JS, pure CSS, `v2/build.py` assembler/validator, Node 24 for `v2/tools/assignment_smoke.js`.

## Global Constraints

- Run all tests with `python -m pytest -q` from the worktree root (`D:\Python\lesson-notebook-pipeline\.worktrees\layout-axis`).
- Baseline is **111 passed, 0 failed** (commit `c39fc9f`). Never claim success without that command's output.
- Every colour in `shell.html`, `layouts/**`, `components/**` uses `var(--token)`; **no hex, no `url(...)` outside gradients, no `@import`, no `http(s)://`** (the one exception is the assignment's trusted-time host list, already shipped).
- `shell.html` markers must each appear exactly once, except `__TITLE__` (may appear many times).
- `build.json > layout` is optional; **absent means `desk`**.
- Never hand-edit a built `.html`; fix skeleton/workdir files and rebuild.
- Keep `desk` visually and behaviourally identical to today.
- Grid `fr` tracks must be clamped `minmax(0, Nfr)`.
- In JS files never write a literal `</` followed by a letter; escape `<\/`.

## File Structure

| File | Responsibility |
|---|---|
| `v2/skeleton/shell.html` | Modify: shared `<head>` CSS + body skeleton + `LN` runtime + 4 new markers; layout-agnostic |
| `v2/skeleton/layouts/desk/chrome.html` | Create: sidebar, drawer button, scrim |
| `v2/skeleton/layouts/desk/layout.css` | Create: desk-only overrides (spine, content padding) |
| `v2/skeleton/layouts/desk/layout.js` | Create: extracted desk TOC/tabs/nav/wiring |
| `v2/skeleton/layouts/app/*` | Create: bottom-bar one-section-at-a-time shell |
| `v2/skeleton/layouts/feed/*` | Create: section-hub shell |
| `v2/skeleton/layouts/sheet/*` | Create: reader + bottom-sheet lab shell |
| `v2/build.py` | Modify: `MARKERS`, allowed key `layout`, resolve/read/scan/inject layout |
| `tests/test_build.py` | Modify: `MINI_SHELL` markers + `make_skel` layouts stub |
| `tests/test_shell_tabs.py` | Modify: retarget desk chrome assertions to `layouts/desk/` |
| `tests/test_shell_smoke.py` | Modify: copy real `layouts/` into temp skeleton |
| `tests/test_shell_layouts.py` | Create: per-layout build + validation tests |
| `v2/SKILL.md` | Modify: v2.9 layout axis, selection rule, markers, opening message |
| `README.md` | Modify: mention the four layouts |

---

## Task 1: Foundation — build.py layout plumbing + shell markers + desk extraction

**Files:**
- Create: `v2/skeleton/layouts/desk/chrome.html`, `v2/skeleton/layouts/desk/layout.css`, `v2/skeleton/layouts/desk/layout.js`
- Modify: `v2/skeleton/shell.html` (body chrome + runtime; keep base CSS as-is)
- Modify: `v2/build.py:34-38` (`MARKERS`), `v2/build.py:1295-1302` (allowed keys), `v2/build.py:1362-1498` (resolve, scan, inject)
- Modify: `tests/test_build.py:9-58`, `tests/test_shell_tabs.py`, `tests/test_shell_smoke.py`
- Test: `tests/test_shell_layouts.py` (create)

**Interfaces:**
- Consumes: existing `build.assemble(workdir, skeleton)`, `read_text`, `scan`, `check_js`, `check_grid`, `HEX_RE`, `EXTERNAL_RE`.
- Produces: shell markers `/*__LAYOUT_CSS__*/`, `<!--__LAYOUT_CHROME__-->`, `/*__LAYOUT_JS__*/`, `__LAYOUT__`; body attribute `data-layout="<name>"`; `LN.nav` contract `{init(), go(i, pushHash)}`; default layout `desk`; `skeleton/layouts/<name>/{layout.css,layout.js,chrome.html}`.

- [ ] **Step 1: Create `v2/skeleton/layouts/desk/chrome.html`**

```html
<aside class="sidebar no-print" id="lnSidebar" aria-label="Contents">
  <div class="brand">__TITLE__</div>
  <nav id="lnToc"></nav>
  <div class="progress" aria-hidden="true"><span id="lnProg"></span></div>
  <button class="btn" id="lnReset">Reset all activities</button>
</aside>
<button id="lnMenu" class="menu-btn no-print" aria-label="Open contents"
  aria-controls="lnSidebar">&#9776;</button>
<div id="lnScrim" class="scrim no-print"></div>
```

- [ ] **Step 2: Create `v2/skeleton/layouts/desk/layout.css`**

```css
/* desk: sidebar + one-section tabs. Base chrome CSS lives in shell.html;
   this file only reasserts the desk-specific reading-column geometry. */
.sheet::before{content:"";position:absolute;inset:0 auto 0 92px;width:2px;
  background:var(--edge-line);opacity:.75}
.content{padding:34px 40px 64px 116px}
@media (max-width:600px){
  .sheet::before{display:none}
  .content{padding:26px 18px 48px}
}
```

- [ ] **Step 3: Create `v2/skeleton/layouts/desk/layout.js`**

```js
"use strict";
LN.nav = (function () {
  var tabIndex = 0;
  function secs() { return document.querySelectorAll("section.block[id]"); }
  function buildToc() {
    var toc = document.getElementById("lnToc");
    if (!toc) return;
    toc.innerHTML = "";
    Array.prototype.forEach.call(secs(), function (s, i) {
      var hd = s.querySelector("h2,h1");
      toc.appendChild(LN.h("a", { href: "#" + s.id }, [
        LN.h("span", { class: "n", text: ("0" + (i + 1)).slice(-2) }),
        LN.h("span", { text: hd ? hd.textContent : s.id })
      ]));
    });
  }
  function show(idx, pushHash) {
    var list = secs(), toc = document.getElementById("lnToc");
    var prog = document.getElementById("lnProg"), n = list.length;
    if (!n) return;
    if (idx < 0) idx = 0;
    if (idx >= n) idx = n - 1;
    tabIndex = idx;
    Array.prototype.forEach.call(list, function (s, i) {
      var on = i === idx;
      if (on) s.removeAttribute("hidden"); else s.setAttribute("hidden", "");
      s.classList.toggle("active", on);
    });
    var links = toc ? toc.querySelectorAll("a") : [];
    Array.prototype.forEach.call(links, function (a, i) {
      var on = i === idx;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    if (prog) prog.style.width = ((idx + 1) / n * 100) + "%";
    if (pushHash !== false) {
      try { history.replaceState(null, "", "#" + list[idx].id); } catch (e) {}
    }
    var sheet = document.querySelector(".sheet");
    if (sheet && typeof sheet.scrollIntoView === "function") sheet.scrollIntoView();
  }
  function wire() {
    var sb = document.getElementById("lnSidebar");
    var menu = document.getElementById("lnMenu");
    var scrim = document.getElementById("lnScrim");
    var reset = document.getElementById("lnReset");
    var toc = document.getElementById("lnToc");
    function drawer(open) {
      if (!sb) return;
      sb.classList.toggle("open", open);
      if (menu) menu.setAttribute("aria-expanded", open ? "true" : "false");
      if (scrim) scrim.classList.toggle("show", open);
    }
    if (menu) menu.addEventListener("click", function () { drawer(true); });
    if (scrim) scrim.addEventListener("click", function () { drawer(false); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") drawer(false);
    });
    if (toc) toc.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var href = a.getAttribute("href"), list = secs(), found = -1;
      Array.prototype.forEach.call(list, function (s, i) {
        if ("#" + s.id === href) found = i;
      });
      if (found >= 0) { ev.preventDefault(); drawer(false); show(found, true); }
    });
    window.addEventListener("hashchange", function () {
      var h = window.location.hash;
      if (!h) return;
      Array.prototype.forEach.call(secs(), function (s, i) {
        if ("#" + s.id === h) show(i, false);
      });
    });
    if (reset) reset.addEventListener("click", function () { LN.resetAll(); });
  }
  function init() {
    document.body.classList.add("js-tabs");
    buildToc();
    var start = 0, h = window.location.hash;
    if (h) {
      Array.prototype.forEach.call(secs(), function (s, i) {
        if ("#" + s.id === h) start = i;
      });
    }
    show(start, false);
    wire();
  }
  return { init: init, go: show };
})();
```

- [ ] **Step 4: Modify `v2/skeleton/shell.html` body**

Replace the whole `<div class="app"> ... </div>` block (currently lines 197-212) with:

```html
<div class="app">
<!--__LAYOUT_CHROME__-->
<main class="stage">
  <div class="sheet">
    <div class="decor" aria-hidden="true"></div>
    <div class="content">
<!--__SECTIONS__-->
    </div>
  </div>
</main>
</div>
```

Then delete the now-duplicated `<button id="lnMenu" ...>` and `<div id="lnScrim" ...>` that follow `</noscript>` (currently lines 218-220). Add `data-layout="__LAYOUT__"` to the `<body>` tag (line 196). Add `/*__LAYOUT_CSS__*/` immediately before the `/*HEXOK*/` line (currently line 174) and `/*__LAYOUT_JS__*/` immediately after the runtime's closing `})();` and before `/*__DATA__*/` (currently lines 443-444).

- [ ] **Step 5: Make the runtime layout-agnostic in `v2/skeleton/shell.html`**

Delete `LN._buildToc`, `LN._buildTabs`, `LN._tabIndex`, the old `LN._showSection`, `LN._wireChrome`, and `LN.resetAll` (all currently between `LN._initOne` and `LN.boot`), and replace `LN.boot`. The result must be exactly:

```js
  LN._sections = function () {
    return document.querySelectorAll("section.block[id]");
  };
  LN._showSection = function (idx, pushHash) {
    if (LN.nav && LN.nav.go) { LN.nav.go(idx, pushHash); return; }
    var list = LN._sections(), n = list.length;
    if (!n) return;
    if (idx < 0) idx = 0;
    if (idx >= n) idx = n - 1;
    if (pushHash !== false) {
      try { history.replaceState(null, "", "#" + list[idx].id); } catch (e) {}
    }
    if (list[idx].scrollIntoView) list[idx].scrollIntoView();
  };
  LN.resetAll = function () {
    LN._mounts.forEach(LN._initOne);
  };
  LN.boot = function () {
    LN._mounts = [];
    Array.prototype.forEach.call(document.querySelectorAll("[data-component]"), function (el) {
      var name = el.getAttribute("data-component");
      var key = el.getAttribute("data-key");
      var C = LN.components[name];
      if (!C) { LN.banner("unknown component: " + name + " (not in LN.components)"); return; }
      if (!key) { LN.banner("mount " + name + " has no data-key"); return; }
      if (!(key in LN.data)) { LN.banner("data-key not defined: " + key); return; }
      var m = { el: el, name: name, key: key, C: C };
      LN._mounts.push(m);
      LN._initOne(m);
    });
    if (LN.nav && LN.nav.init) {
      LN.nav.init();
      return;
    }
    var start = 0, h = window.location.hash;
    if (h) {
      Array.prototype.forEach.call(LN._sections(), function (s, i) {
        if ("#" + s.id === h) start = i;
      });
    }
    LN._showSection(start, false);
  };
```

Also add `nav: null` to the `LN` object literal near the top of the runtime (currently `var LN = { data: {}, components: {}, _mounts: [] };`).

- [ ] **Step 6: Add markers to `v2/build.py`**

Change `MARKERS` (lines 34-37) to:

```python
MARKERS = [
    "__TITLE__", "/*__THEME__*/", "/*__TUNE__*/", "/*__COMPONENT_CSS__*/",
    "<!--__SECTIONS__-->", "/*__DATA__*/", "/*__COMPONENT_JS__*/", "__META__",
    "/*__LAYOUT_CSS__*/", "<!--__LAYOUT_CHROME__-->", "/*__LAYOUT_JS__*/",
    "__LAYOUT__",
]
```

- [ ] **Step 7: Allow and validate `layout` in `v2/build.py`**

In the `unknown` key check (lines 1295-1302) add `"layout"` to the allowed set and to the hint string. `layout` is NOT in the required-keys loop.

- [ ] **Step 8: Resolve, scan and inject the layout in `v2/build.py`**

After the component CSS/JS collection loop and before the `shell_for_hex` scan (currently line 1445), insert:

```python
    layout_name = cfg.get("layout") or "desk"
    layouts_dir = skeleton / "layouts"
    available_layouts = sorted(
        p.name for p in layouts_dir.iterdir()
        if p.is_dir() and (p / "layout.css").exists()
        and (p / "layout.js").exists() and (p / "chrome.html").exists()
    ) if layouts_dir.is_dir() else []
    layout_css = layout_js = layout_chrome = ""
    if layout_name not in available_layouts:
        errors.append(Err("layout", "build.json", None,
                          "unknown layout %r; available: %s"
                          % (layout_name, ", ".join(available_layouts) or "(none)"),
                          "pick one of the shipped layouts"))
    else:
        layout_css = read_text(layouts_dir / layout_name / "layout.css", errors) or ""
        layout_js = read_text(layouts_dir / layout_name / "layout.js", errors) or ""
        layout_chrome = read_text(layouts_dir / layout_name / "chrome.html", errors) or ""
        errors.extend(scan(layout_css, HEX_RE, "hex", "layouts/%s/layout.css" % layout_name,
                           "hard-coded colour", "layout colours come from tokens"))
        errors.extend(scan(layout_css, EXTERNAL_RE, "external", "layouts/%s/layout.css" % layout_name,
                           "external asset", "textures must be pure CSS"))
        check_grid(layout_css, "layouts/%s/layout.css" % layout_name, errors)
        errors.extend(check_js(layout_js, "layouts/%s/layout.js" % layout_name))
        errors.extend(scan(layout_js, EXTERNAL_RE, "external", "layouts/%s/layout.js" % layout_name,
                           "external asset", "no http, no @import"))
```

Then change the assembly to inject layout files and the name. Replace the block starting `title = html.escape(...)` / `out = shell.replace("__TITLE__", title)` with:

```python
    title = html.escape(str(cfg["title"]), quote=True)
    out = shell
    out = out.replace("/*__LAYOUT_CSS__*/", layout_css)
    out = out.replace("<!--__LAYOUT_CHROME__-->", layout_chrome)
    out = out.replace("/*__LAYOUT_JS__*/", layout_js)
    out = out.replace("__LAYOUT__", layout_name)
    out = out.replace("__TITLE__", title)
```

Keep the existing `meta_bits` / `out.replace("__META__", meta)` and the remaining replacements unchanged after this.

- [ ] **Step 9: Update `tests/test_build.py`**

Replace `MINI_SHELL` (lines 9-22) with:

```python
MINI_SHELL = (
    "<!DOCTYPE html><html><head><title>__TITLE__</title>__META__<style>"
    "/*__THEME__*/"
    "/*__TUNE__*/"
    "body{color:var(--ink)}"
    "/*__LAYOUT_CSS__*/"
    "/*HEXOK*/@media print{body{color:#000}}/*ENDHEX*/"
    "/*__COMPONENT_CSS__*/"
    "</style></head><body data-layout=\"__LAYOUT__\">"
    "<!--__LAYOUT_CHROME__-->"
    "<!--__SECTIONS__-->"
    "<script>window.LN={data:{},components:{},boot:function(){}};"
    "/*__LAYOUT_JS__*/"
    "/*__DATA__*/"
    "/*__COMPONENT_JS__*/"
    "</script></body></html>"
)
```

Add to `make_skel` after the components loop (line 57):

```python
    lo = skel / "layouts" / "desk"
    lo.mkdir(parents=True)
    (lo / "layout.css").write_text(".lnL{color:var(--ink)}", encoding="utf-8")
    (lo / "layout.js").write_text("LN.nav={init:function(){},go:function(){}};",
                                  encoding="utf-8")
    (lo / "chrome.html").write_text('<aside id="lnChromeMini"></aside>', encoding="utf-8")
```

- [ ] **Step 10: Update `tests/test_shell_tabs.py`**

Replace the file with:

```python
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SHELL = REPO / "v2" / "skeleton" / "shell.html"
DESK = REPO / "v2" / "skeleton" / "layouts" / "desk"


def desk_text():
    return (SHELL.read_text(encoding="utf-8")
            + (DESK / "chrome.html").read_text(encoding="utf-8")
            + (DESK / "layout.js").read_text(encoding="utf-8"))


def test_shell_has_no_top_nav():
    t = desk_text()
    assert 'id="lnTabs"' not in t
    assert 'id="lnPrev"' not in t
    assert 'id="lnNext"' not in t
    assert 'id="lnCounter"' not in t
    assert 'ln-tab' not in t
    assert '.tab-nav' not in t


def test_shell_section_switch_css_and_print():
    t = SHELL.read_text(encoding="utf-8")
    assert 'section.block[hidden]{display:none}' in t.replace(' ', '')
    assert '@media print' in t
    assert 'section.block[hidden]{display:block!important}' in t.replace(' ', '')


def test_shell_section_js_present():
    t = desk_text()
    assert 'LN._showSection' in t
    assert 'js-tabs' in t
    assert 'id="lnToc"' in t
    assert 'aria-current' in t
```

- [ ] **Step 11: Update `tests/test_shell_smoke.py`**

Replace the body of `test_real_shell_builds_clean` setup so the real layouts are present:

```python
def test_real_shell_builds_clean(tmp_path):
    skel = make_skel(tmp_path)
    (skel / "shell.html").write_text(
        (SKEL / "shell.html").read_text(encoding="utf-8"), encoding="utf-8")
    (skel / "layouts").mkdir(exist_ok=True)
    for d in (SKEL / "layouts").iterdir():
        if d.is_dir():
            shutil.copytree(d, skel / "layouts" / d.name, dirs_exist_ok=True)
    wd = make_workdir(tmp_path)
    out, errs, _ = build.assemble(wd, skel)
    assert errs == [], [str(e) for e in errs]
    for marker in ("/*__", "<!--__", "__TITLE__"):
        assert marker not in out
    assert "@media print" in out
    assert "LN.boot();" in out
    assert "Reset all activities" in out
    assert "lnErrors" in out
```

Add `import shutil` at the top of the file.

- [ ] **Step 12: Create `tests/test_shell_layouts.py`**

```python
import json
from pathlib import Path

import build

REPO = Path(__file__).resolve().parents[1]
SKEL = REPO / "v2" / "skeleton"

SECTIONS = (
    '<section class="block" id="s1"><h2>One</h2>'
    '<div data-component="glossary" data-key="s1gl"></div></section>'
    '<section class="block" id="s2"><h2>Two</h2></section>'
)
DATA = 'LN.data.s1gl={groups:[{name:"G",terms:[{t:"a",d:"b"}]}]};'

LAYOUTS = ["desk"]  # extended per layout task


def make_real_wd(tmp_path, layout=None, omit_layout=False):
    wd = tmp_path / "wd"
    wd.mkdir()
    cfg = {"title": "T", "theme": "studio", "components": ["glossary"],
           "output": "out.html"}
    if not omit_layout:
        cfg["layout"] = layout
    (wd / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--accent:#33608f;}", encoding="utf-8")
    (wd / "sections.html").write_text(SECTIONS, encoding="utf-8")
    (wd / "data.js").write_text(DATA, encoding="utf-8")
    return wd


def test_known_layouts_build(tmp_path):
    for layout in LAYOUTS:
        wd = make_real_wd(tmp_path / layout, layout=layout)
        out, errs, _ = build.assemble(wd, SKEL)
        assert errs == [], (layout, [str(e) for e in errs])
        assert 'data-layout="%s"' % layout in out
        assert "@media print" in out
        assert out.count("<section") >= 2
        assert "/*__" not in out and "<!--__" not in out


def test_missing_layout_defaults_to_desk(tmp_path):
    wd = make_real_wd(tmp_path, omit_layout=True)
    out, errs, _ = build.assemble(wd, SKEL)
    assert errs == [], [str(e) for e in errs]
    assert 'data-layout="desk"' in out


def test_unknown_layout_errors(tmp_path):
    wd = make_real_wd(tmp_path, layout="nope")
    out, errs, _ = build.assemble(wd, SKEL)
    assert out is None
    assert any(e.rule == "layout" for e in errs), [str(e) for e in errs]


def test_layout_css_hex_rejected(tmp_path):
    wd = make_real_wd(tmp_path, layout="desk")
    # use a private skeleton copy so the shipped file is never touched
    import shutil
    skel = tmp_path / "skel"
    shutil.copytree(SKEL, skel)
    (skel / "layouts" / "desk" / "layout.css").write_text(
        ".x{color:#ff0000}", encoding="utf-8")
    out, errs, _ = build.assemble(wd, skel)
    assert out is None
    assert any(e.rule == "hex" for e in errs), [str(e) for e in errs]
```

- [ ] **Step 13: Run the suite**

Run: `python -m pytest -q`
Expected: PASS, count unchanged from baseline (111) plus the new `test_shell_layouts` cases.

- [ ] **Step 14: Build the desk demo and eyeball**

Run: `python v2/build.py v2/sample/lesson-demo` from the worktree root.
Expected: `OK - wrote .../Week4-Demo-Notebook.html`. Open it: sidebar, section tabs, activities and assignment behave exactly as before.

- [ ] **Step 15: Commit**

```bash
git add v2/skeleton/shell.html v2/skeleton/layouts v2/build.py tests/test_build.py tests/test_shell_tabs.py tests/test_shell_smoke.py tests/test_shell_layouts.py
git commit -m "refactor(layout): plugin shell + desk layout, build.py layout axis plumbing"
```

---

## Task 2: `app` layout (bottom-nav, one section at a time)

**Files:**
- Create: `v2/skeleton/layouts/app/chrome.html`, `layout.css`, `layout.js`
- Modify: `tests/test_shell_layouts.py:19` (`LAYOUTS`)

**Interfaces:**
- Consumes: shell markers and `LN.nav` contract from Task 1; `LN._sections()`, `LN.h`, `LN.resetAll`.
- Produces: body class `js-tabs` while mounted; DOM ids `#lnAppProg`, `#lnAppPrev`, `#lnAppNext`, `#lnAppMenu`, `#lnAppToc`, `#lnAppReset`.

- [ ] **Step 1: Add `app` to the test parametrization**

Change `tests/test_shell_layouts.py` line 19 to:

```python
LAYOUTS = ["desk", "app"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_shell_layouts.py::test_known_layouts_build -q`
Expected: FAIL for `app` with `unknown layout 'app'`.

- [ ] **Step 3: Create `v2/skeleton/layouts/app/chrome.html`**

```html
<header class="ln-app-top no-print">
  <span class="ln-app-title">__TITLE__</span>
  <span class="ln-app-prog" id="lnAppProg" aria-hidden="true"><i></i></span>
</header>
<nav class="ln-app-bar no-print" aria-label="Section navigation">
  <button class="ln-app-btn" id="lnAppPrev" type="button"
    aria-label="Previous section">&#8249;</button>
  <button class="ln-app-btn" id="lnAppMenu" type="button"
    aria-expanded="false" aria-controls="lnAppToc">Contents</button>
  <button class="ln-app-btn ln-app-next" id="lnAppNext" type="button">Next &#8250;</button>
  <button class="ln-app-btn" id="lnAppReset" type="button">Reset</button>
</nav>
<div class="ln-app-scrim no-print" id="lnAppScrim" hidden></div>
<nav class="ln-app-toc no-print" id="lnAppToc" hidden aria-label="Contents"></nav>
```

- [ ] **Step 4: Create `v2/skeleton/layouts/app/layout.css`**

```css
/* app: mobile-first bottom navigation, one section at a time. */
.ln-app-top{display:flex;align-items:center;gap:10px;padding:10px 14px;
  background:var(--surface-2);border-bottom:1px solid var(--grid);
  position:sticky;top:0;z-index:40}
.ln-app-title{font-family:var(--display);font-size:15px;letter-spacing:var(--display-tracking);
  text-transform:var(--display-transform);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ln-app-prog{flex:1;height:6px;border-radius:999px;background:var(--grid);overflow:hidden}
.ln-app-prog>i{display:block;height:100%;width:0;background:var(--accent);transition:width .2s}
.ln-app-bar{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;gap:8px;
  align-items:center;justify-content:space-between;padding:10px 12px calc(10px + env(safe-area-inset-bottom));
  background:var(--surface-2);border-top:1px solid var(--grid);box-shadow:var(--shadow-lg)}
.ln-app-btn{background:var(--surface);border:1px solid var(--grid-strong);border-radius:999px;
  padding:9px 14px;font:600 13.5px/1.2 var(--sans);color:var(--ink);cursor:pointer;min-height:44px}
.ln-app-btn:disabled{opacity:.4;cursor:default}
.ln-app-next{background:var(--accent);border-color:var(--accent);color:var(--surface);flex:1}
.ln-app-toc{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;flex-direction:column;
  gap:2px;padding:16px 14px calc(18px + env(safe-area-inset-bottom));background:var(--surface-2);
  border-radius:18px 18px 0 0;box-shadow:var(--shadow-lg);max-height:70vh;overflow-y:auto}
.ln-app-toc[hidden]{display:none}
.ln-app-toc a{display:flex;gap:8px;padding:11px 10px;border-radius:10px;text-decoration:none;
  color:var(--ink-soft);font-size:14.5px;min-height:44px;align-items:center}
.ln-app-toc a.active{background:var(--highlight);color:var(--ink);font-weight:600}
.ln-app-scrim{position:fixed;inset:0;background:rgba(20,25,35,.45);z-index:55}
.ln-app-scrim[hidden]{display:none}
.stage{padding:0}
.content{padding:20px 16px 130px}
.sheet::before{display:none}
@media (min-width:1024px){
  .ln-app-bar{position:sticky;bottom:auto;top:0;justify-content:flex-start}
  .ln-app-bar .ln-app-next{flex:0 0 auto}
  .content{max-width:860px;margin:0 auto;padding:28px 24px 64px}
}
```

- [ ] **Step 5: Create `v2/skeleton/layouts/app/layout.js`**

```js
"use strict";
LN.nav = (function () {
  var idx = 0, toc = null, sx = 0, sy = 0;

  function list() { return document.querySelectorAll("section.block[id]"); }

  function drawToc() {
    toc = document.getElementById("lnAppToc");
    if (!toc) return;
    toc.innerHTML = "";
    Array.prototype.forEach.call(list(), function (s, i) {
      var hd = s.querySelector("h2,h1");
      toc.appendChild(LN.h("a", { href: "#" + s.id }, [
        LN.h("span", { class: "n", text: ("0" + (i + 1)).slice(-2) }),
        LN.h("span", { text: hd ? hd.textContent : s.id })
      ]));
    });
    toc.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var href = a.getAttribute("href"), found = -1;
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === href) found = i;
      });
      if (found >= 0) { ev.preventDefault(); menu(false); go(found, true); }
    });
  }

  function menu(open) {
    if (toc) toc.hidden = !open;
    var scrim = document.getElementById("lnAppScrim");
    if (scrim) scrim.hidden = !open;
    var btn = document.getElementById("lnAppMenu");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function go(i, pushHash) {
    var l = list(), n = l.length;
    if (!n) return;
    if (i < 0) i = 0;
    if (i >= n) i = n - 1;
    idx = i;
    Array.prototype.forEach.call(l, function (s, k) {
      var on = k === i;
      if (on) s.removeAttribute("hidden"); else s.setAttribute("hidden", "");
      s.classList.toggle("active", on);
    });
    var prog = document.getElementById("lnAppProg");
    if (prog && prog.firstElementChild)
      prog.firstElementChild.style.width = ((i + 1) / n * 100) + "%";
    var prev = document.getElementById("lnAppPrev");
    var next = document.getElementById("lnAppNext");
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === n - 1;
    var links = toc ? toc.querySelectorAll("a") : [];
    Array.prototype.forEach.call(links, function (a, k) {
      a.classList.toggle("active", k === i);
      if (k === i) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    if (pushHash !== false) {
      try { history.replaceState(null, "", "#" + l[i].id); } catch (e) {}
    }
    var sheet = document.querySelector(".sheet");
    if (sheet && sheet.scrollIntoView) sheet.scrollIntoView();
  }

  function init() {
    document.body.classList.add("js-tabs");
    drawToc();
    var start = 0, h = window.location.hash;
    if (h) {
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === h) start = i;
      });
    }
    go(start, false);

    var prev = document.getElementById("lnAppPrev");
    var next = document.getElementById("lnAppNext");
    var menuBtn = document.getElementById("lnAppMenu");
    var reset = document.getElementById("lnAppReset");
    var scrim = document.getElementById("lnAppScrim");
    if (prev) prev.addEventListener("click", function () { go(idx - 1, true); });
    if (next) next.addEventListener("click", function () { go(idx + 1, true); });
    if (menuBtn) menuBtn.addEventListener("click", function () { menu(toc && toc.hidden); });
    if (scrim) scrim.addEventListener("click", function () { menu(false); });
    if (reset) reset.addEventListener("click", function () { LN.resetAll(); });

    var stage = document.querySelector(".stage");
    if (stage && stage.addEventListener) {
      stage.addEventListener("touchstart", function (ev) {
        var t = ev.touches[0]; sx = t.clientX; sy = t.clientY;
      }, { passive: true });
      stage.addEventListener("touchend", function (ev) {
        var t = ev.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
          go(idx + (dx < 0 ? 1 : -1), true);
      }, { passive: true });
    }
    window.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowRight") go(idx + 1, true);
      else if (ev.key === "ArrowLeft") go(idx - 1, true);
      else if (ev.key === "Escape") menu(false);
    });
    window.addEventListener("hashchange", function () {
      var hh = window.location.hash;
      if (!hh) return;
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === hh) go(i, false);
      });
    });
  }

  return { init: init, go: go };
})();
```

- [ ] **Step 6: Run tests**

Run: `python -m pytest -q`
Expected: PASS.

- [ ] **Step 7: Build an app demo and check on a phone viewport**

Create `v2/sample/demo-app/build.json` with `"layout": "app"` and copy `v2/sample/demo-opal/{sections.html,data.js,tune.css,outline.json}` into it. Run `python v2/build.py v2/sample/demo-app`. Open in browser device emulation at 390x844: bottom bar in thumb reach, Next/Prev work, swipe changes section, Contents opens the sheet, `#hash` deep-links, print preview shows all sections.

- [ ] **Step 8: Commit**

```bash
git add v2/skeleton/layouts/app tests/test_shell_layouts.py v2/sample/demo-app
git commit -m "feat(layout): app bottom-nav shell"
```

---

## Task 3: `feed` layout (section hub)

**Files:**
- Create: `v2/skeleton/layouts/feed/chrome.html`, `layout.css`, `layout.js`
- Modify: `tests/test_shell_layouts.py:19` (`LAYOUTS`)

**Interfaces:**
- Consumes: Task 1 contract; `LN._sections()`, `LN.h`.
- Produces: body class `ln-feed-open` while a section is open; DOM ids `#lnFeed`, `#lnFeedGrid`, `#lnFeedSub`, `#lnFeedBack`.

- [ ] **Step 1: Add `feed` to `LAYOUTS`**

```python
LAYOUTS = ["desk", "app", "feed"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_shell_layouts.py::test_known_layouts_build -q`
Expected: FAIL for `feed` with `unknown layout 'feed'`.

- [ ] **Step 3: Create `v2/skeleton/layouts/feed/chrome.html`**

```html
<section class="ln-feed no-print" id="lnFeed" aria-label="Sections">
  <header class="ln-feed-head">
    <div class="ln-feed-title">__TITLE__</div>
    <div class="ln-feed-sub" id="lnFeedSub"></div>
  </header>
  <div class="ln-feed-grid" id="lnFeedGrid"></div>
</section>
<button class="ln-feed-back no-print" id="lnFeedBack" type="button"
  hidden>&#8249; All sections</button>
```

- [ ] **Step 4: Create `v2/skeleton/layouts/feed/layout.css`**

```css
/* feed: a section hub (card per section) that opens the section in a pane. */
.ln-feed{display:block;padding:16px 14px 28px;background:var(--bg);min-height:100vh}
.ln-feed-head{margin:0 2px 14px}
.ln-feed-title{font-family:var(--display);font-size:clamp(20px,5vw,30px);
  letter-spacing:var(--display-tracking);text-transform:var(--display-transform)}
.ln-feed-sub{color:var(--ink-soft);font-size:13.5px;margin-top:4px}
.ln-feed-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.ln-feed-card{display:flex;align-items:center;gap:12px;width:100%;text-align:left;
  background:var(--surface-2);border:1px solid var(--grid);border-radius:var(--radius);
  padding:13px 14px;cursor:pointer;box-shadow:var(--shadow-sm);min-height:56px;
  font:inherit;color:inherit}
.ln-feed-card.active{border-color:var(--accent);box-shadow:0 4px 14px rgba(20,25,35,.12)}
.ln-feed-num{flex:0 0 28px;height:28px;display:flex;align-items:center;justify-content:center;
  border-radius:9px;background:var(--sec-3);font:700 12px/1 var(--mono);color:var(--accent-deep)}
.ln-feed-card.active .ln-feed-num{background:var(--accent);color:var(--surface)}
.ln-feed-txt{flex:1;font-size:14.5px;font-weight:600}
.ln-feed-ring{flex:0 0 20px;height:20px;border-radius:50%;border:2.5px solid var(--grid-strong)}
.ln-feed-card.active .ln-feed-ring{border-color:var(--accent)}
.stage{display:none}
body.ln-feed-open .stage{display:block}
.ln-feed-back{position:fixed;top:10px;left:10px;z-index:50;background:var(--surface-2);
  border:1px solid var(--grid-strong);border-radius:999px;padding:9px 14px;
  font:600 13.5px/1.2 var(--sans);color:var(--ink);cursor:pointer;box-shadow:var(--shadow);
  min-height:44px}
.ln-feed-back[hidden]{display:none}
.content{padding:56px 16px 48px}
.sheet::before{display:none}
@media (min-width:768px){
  .ln-feed-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (min-width:1024px){
  .app{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);align-items:start}
  .ln-feed{min-height:auto;position:sticky;top:0;max-height:100vh;overflow-y:auto}
  .stage{display:block}
  .ln-feed-back{display:none}
  .content{padding:28px 24px 64px}
}
@media print{
  .ln-feed{display:none!important}
  .stage{display:block!important}
  .ln-feed-back{display:none!important}
}
```

- [ ] **Step 5: Create `v2/skeleton/layouts/feed/layout.js`**

```js
"use strict";
LN.nav = (function () {
  var idx = 0;

  function list() { return document.querySelectorAll("section.block[id]"); }

  function build() {
    var grid = document.getElementById("lnFeedGrid");
    if (!grid) return;
    grid.innerHTML = "";
    Array.prototype.forEach.call(list(), function (s, i) {
      var hd = s.querySelector("h2,h1");
      var card = LN.h("button", { class: "ln-feed-card", type: "button" }, [
        LN.h("span", { class: "ln-feed-num", text: ("0" + (i + 1)).slice(-2) }),
        LN.h("span", { class: "ln-feed-txt", text: hd ? hd.textContent : s.id }),
        LN.h("span", { class: "ln-feed-ring" })
      ]);
      card.addEventListener("click", function () { open(i); });
      grid.appendChild(card);
    });
    var sub = document.getElementById("lnFeedSub");
    if (sub) sub.textContent = list().length + " sections";
  }

  function marks(i) {
    var grid = document.getElementById("lnFeedGrid");
    if (!grid) return;
    Array.prototype.forEach.call(grid.children, function (c, k) {
      c.classList.toggle("active", k === i);
    });
  }

  function show(i, pushHash) {
    var l = list(), n = l.length;
    if (!n) return;
    if (i < 0) i = 0;
    if (i >= n) i = n - 1;
    idx = i;
    Array.prototype.forEach.call(l, function (s, k) {
      var on = k === i;
      if (on) s.removeAttribute("hidden"); else s.setAttribute("hidden", "");
      s.classList.toggle("active", on);
    });
    marks(i);
    if (pushHash !== false) {
      try { history.replaceState(null, "", "#" + l[i].id); } catch (e) {}
    }
    var stage = document.querySelector(".stage");
    if (stage && stage.scrollIntoView) stage.scrollIntoView();
  }

  function open(i) {
    document.body.classList.add("ln-feed-open");
    var back = document.getElementById("lnFeedBack");
    if (back) back.hidden = false;
    show(i, true);
  }

  function close() {
    document.body.classList.remove("ln-feed-open");
    var back = document.getElementById("lnFeedBack");
    if (back) back.hidden = true;
  }

  function init() {
    document.body.classList.add("js-tabs");
    build();
    var back = document.getElementById("lnFeedBack");
    if (back) back.addEventListener("click", function () { close(); });
    var h = window.location.hash, found = -1;
    Array.prototype.forEach.call(list(), function (s, i) {
      if ("#" + s.id === h) found = i;
    });
    if (found >= 0) open(found); else close();
    window.addEventListener("hashchange", function () {
      var hh = window.location.hash;
      if (!hh) return;
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === hh) open(i);
      });
    });
  }

  return { init: init, go: show };
})();
```

- [ ] **Step 6: Run tests**

Run: `python -m pytest -q`
Expected: PASS.

- [ ] **Step 7: Build a feed demo and check**

Create `v2/sample/demo-feed/` as in Task 2 Step 7 but `"layout": "feed"`; run `python v2/build.py v2/sample/demo-feed`. Phone: hub of cards, tap opens section, back returns. Desktop: grid left, reading pane right.

- [ ] **Step 8: Commit**

```bash
git add v2/skeleton/layouts/feed tests/test_shell_layouts.py v2/sample/demo-feed
git commit -m "feat(layout): feed section-hub shell"
```

---

## Task 4: `sheet` layout (reader + bottom-sheet lab)

**Files:**
- Create: `v2/skeleton/layouts/sheet/chrome.html`, `layout.css`, `layout.js`
- Modify: `tests/test_shell_layouts.py:19` (`LAYOUTS`)

**Interfaces:**
- Consumes: Task 1 contract; `LN._sections()`, `LN.h`, `[data-component]` mounts already initialised by `LN.boot`.
- Produces: DOM ids `#lnSheetPanel`, `#lnSheetGrab`, `#lnSheetToc`, `#lnSheetMenu`, `#lnSheetReset`.

- [ ] **Step 1: Add `sheet` to `LAYOUTS`**

```python
LAYOUTS = ["desk", "app", "feed", "sheet"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_shell_layouts.py::test_known_layouts_build -q`
Expected: FAIL for `sheet` with `unknown layout 'sheet'`.

- [ ] **Step 3: Create `v2/skeleton/layouts/sheet/chrome.html`**

```html
<header class="ln-sheet-top no-print">
  <button id="lnSheetMenu" type="button" aria-expanded="false"
    aria-controls="lnSheetToc">Contents</button>
  <span class="ln-sheet-t">__TITLE__</span>
  <button id="lnSheetReset" type="button">Reset</button>
</header>
<nav class="ln-sheet-toc no-print" id="lnSheetToc" hidden aria-label="Contents"></nav>
<aside class="ln-sheet-panel no-print" id="lnSheetPanel" hidden aria-label="Lab">
  <div class="ln-sheet-grab" id="lnSheetGrab" role="separator"
    aria-label="Resize lab panel"></div>
  <div class="ln-sheet-h">Lab</div>
</aside>
```

- [ ] **Step 4: Create `v2/skeleton/layouts/sheet/layout.css`**

```css
/* sheet: continuous reader; the lab lives in a draggable bottom sheet / side panel. */
.ln-sheet-top{display:flex;align-items:center;gap:10px;padding:10px 14px;
  background:var(--surface-2);border-bottom:1px solid var(--grid);position:sticky;top:0;z-index:40}
.ln-sheet-top button{background:var(--surface);border:1px solid var(--grid-strong);
  border-radius:999px;padding:8px 13px;font:600 13px/1.2 var(--sans);color:var(--ink);
  cursor:pointer;min-height:40px}
.ln-sheet-t{flex:1;text-align:center;font-family:var(--display);font-size:14.5px;
  letter-spacing:var(--display-tracking);text-transform:var(--display-transform);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ln-sheet-toc{position:absolute;top:56px;left:12px;z-index:60;display:flex;flex-direction:column;
  gap:2px;padding:12px;background:var(--surface-2);border:1px solid var(--grid);
  border-radius:12px;box-shadow:var(--shadow-lg);max-height:70vh;overflow-y:auto;min-width:220px}
.ln-sheet-toc[hidden]{display:none}
.ln-sheet-toc a{display:block;padding:10px;border-radius:9px;text-decoration:none;
  color:var(--ink-soft);font-size:14px;min-height:40px}
.ln-sheet-toc a:hover{background:var(--sec-3);color:var(--ink)}
.ln-sheet-panel{position:fixed;left:0;right:0;bottom:0;z-index:50;background:var(--surface-2);
  border-top:1px solid var(--grid);border-radius:18px 18px 0 0;box-shadow:var(--shadow-lg);
  padding:6px 14px 12px;max-height:74vh;overflow-y:auto;transform:translateY(calc(100% - 76px));
  transition:transform .22s}
.ln-sheet-panel.open{transform:none}
.ln-sheet-panel[hidden]{display:none}
.ln-sheet-grab{width:40px;height:5px;border-radius:999px;background:var(--grid-strong);
  margin:2px auto 8px;cursor:grab}
.ln-sheet-h{font:700 10.5px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;
  color:var(--accent-deep);margin-bottom:6px}
.ln-sheet-panel .ln-act-wrap{margin:0}
.stage{padding:0}
.content{padding:16px 16px 220px}
.sheet::before{display:none}
@media (min-width:768px){
  .app{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);align-items:start}
  .ln-sheet-panel{position:sticky;top:52px;transform:none;border-radius:12px;
    border:1px solid var(--grid);max-height:calc(100vh - 64px);margin:16px 16px 16px 0}
  .ln-sheet-top{grid-column:1 / -1}
  .content{padding:24px 20px 64px}
}
```

- [ ] **Step 5: Create `v2/skeleton/layouts/sheet/layout.js`**

```js
"use strict";
LN.nav = (function () {
  var LABS = ["break-even-lab", "ratio-lab", "tvm-lab", "port-lab", "step-solver"];

  function list() { return document.querySelectorAll("section.block[id]"); }

  function moveLab() {
    var panel = document.getElementById("lnSheetPanel");
    if (!panel) return;
    var found = null;
    Array.prototype.forEach.call(document.querySelectorAll("[data-component]"), function (el) {
      if (found) return;
      if (LABS.indexOf(el.getAttribute("data-component")) >= 0) found = el;
    });
    if (!found) return;
    var wrap = found.closest ? found.closest(".ln-act-wrap") : null;
    panel.appendChild(wrap || found);
    panel.hidden = false;
  }

  function drawToc() {
    var toc = document.getElementById("lnSheetToc");
    if (!toc) return;
    toc.innerHTML = "";
    Array.prototype.forEach.call(list(), function (s, i) {
      var hd = s.querySelector("h2,h1");
      toc.appendChild(LN.h("a", { href: "#" + s.id }, [
        LN.h("span", { class: "n", text: ("0" + (i + 1)).slice(-2) }),
        LN.h("span", { text: hd ? hd.textContent : s.id })
      ]));
    });
    toc.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var href = a.getAttribute("href"), found = -1;
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === href) found = i;
      });
      if (found >= 0) { ev.preventDefault(); toc.hidden = true; go(found, true); }
    });
  }

  function go(i, pushHash) {
    var l = list();
    if (!l.length) return;
    if (i < 0) i = 0;
    if (i >= l.length) i = l.length - 1;
    if (pushHash !== false) {
      try { history.replaceState(null, "", "#" + l[i].id); } catch (e) {}
    }
    if (l[i].scrollIntoView) l[i].scrollIntoView();
  }

  function init() {
    moveLab();
    drawToc();
    var menu = document.getElementById("lnSheetMenu");
    var reset = document.getElementById("lnSheetReset");
    var toc = document.getElementById("lnSheetToc");
    var panel = document.getElementById("lnSheetPanel");
    var grab = document.getElementById("lnSheetGrab");
    if (menu && toc) menu.addEventListener("click", function () {
      toc.hidden = !toc.hidden;
      menu.setAttribute("aria-expanded", toc.hidden ? "false" : "true");
    });
    if (reset) reset.addEventListener("click", function () { LN.resetAll(); });
    if (grab && panel) grab.addEventListener("click", function () {
      panel.classList.toggle("open");
    });
    window.addEventListener("hashchange", function () {
      var h = window.location.hash;
      if (!h) return;
      Array.prototype.forEach.call(list(), function (s, i) {
        if ("#" + s.id === h) go(i, false);
      });
    });
  }

  return { init: init, go: go };
})();
```

- [ ] **Step 6: Run tests**

Run: `python -m pytest -q`
Expected: PASS.

- [ ] **Step 7: Build a sheet demo and check**

Create `v2/sample/demo-sheet/` with `"layout": "sheet"` and the `lesson-demo` lesson (it mounts `break-even-lab`); run `python v2/build.py v2/sample/demo-sheet`. Phone: reading scrolls, the lab sheet peeks at the bottom and expands on tap. Desktop: reading column + sticky lab panel. Confirm the lab still calculates.

- [ ] **Step 8: Commit**

```bash
git add v2/skeleton/layouts/sheet tests/test_shell_layouts.py v2/sample/demo-sheet
git commit -m "feat(layout): sheet reader + bottom-sheet lab shell"
```

---

## Task 5: SKILL v2.9, docs, demos, full regression

**Files:**
- Modify: `v2/SKILL.md` (frontmatter `version: 2.9`, §1.2, §1.4, new selection rule, Part 8)
- Modify: `README.md`
- Test: full suite + `node v2/tools/assignment_smoke.js`

**Interfaces:**
- Consumes: everything above.
- Produces: documentation of the `layout` axis and the auto-selection rule.

- [ ] **Step 1: Bump and document the layout axis in `v2/SKILL.md`**

Change frontmatter `version: 2.8` to `version: 2.9` and the `description` to mention the layout axis. Rename §1.2 to **"Pick the theme and pick the layout"** and add after the theme-pack table:

```markdown
**Layout packs** (`skeleton/layouts/`), orthogonal to the theme:

| Layout | Reads as | Pick it when |
|---|---|---|
| `desk` | sidebar + section tabs, wide sheet | text-dense essay/history/law, long print-heavy (default) |
| `app` | thumb bottom-bar, one section at a time, swipe | standard concept lesson with small activities |
| `feed` | section hub of cards | many sections, overview/assignment-heavy, revision |
| `sheet` | continuous reader + bottom-sheet lab | a calculator/lab must stay in view while reading |

Record `"layout"` in `build.json`. If omitted, `desk` is used.
```

- [ ] **Step 2: Add the selection rule and marker table rows in `v2/SKILL.md`**

Add a new §1.2b "Auto-selecting the layout" containing the signal table from the spec (§2 there), including the tie-break (prefer `sheet` when a lab and many sections both apply). Add to the §1.4 marker table:

```markdown
| `/*__LAYOUT_CSS__*/` | `layouts/<layout>/layout.css` |
| `<!--__LAYOUT_CHROME__-->` | `layouts/<layout>/chrome.html` |
| `/*__LAYOUT_JS__*/` | `layouts/<layout>/layout.js` |
| `__LAYOUT__` | layout name, into `<body data-layout="…">` |
```

- [ ] **Step 3: Update the `build.json` schema example and opening message in `v2/SKILL.md`**

Add `"layout": "sheet"` to the schema block and add a `Layout: <name> — <why>` line to the Part 8 opening-message template.

- [ ] **Step 4: Update `README.md`**

Add a short section listing the four layouts and noting the theme × layout axes.

- [ ] **Step 5: Rebuild every shipped demo**

Run, from the worktree root:

```bash
python v2/build.py v2/sample/lesson-demo
python v2/build.py v2/sample/demo-opal
python v2/build.py v2/sample/demo-parchment
python v2/build.py v2/sample/demo-studio
python v2/build.py v2/build/week5-operational
```

Expected: each prints `OK - wrote …`.

- [ ] **Step 6: Run the assignment smoke test**

Run: `node v2/tools/assignment_smoke.js`
Expected: `SMOKE OK`.

- [ ] **Step 7: Full regression**

Run: `python -m pytest -q`
Expected: all pass. Then confirm the new layout tests cover all four: `python -m pytest tests/test_shell_layouts.py -q`.

- [ ] **Step 8: Commit**

```bash
git add v2/SKILL.md README.md
git commit -m "docs(skill): v2.9 layout axis + selection rule"
```

---

## Self-Review

- **Spec coverage:** `layout` axis + default (§1) → Task 1 Steps 7-8; auto-selection rule → Task 5 Steps 1-2; four layouts → Tasks 1-4; markers → Task 1 Steps 6-8; nav contract → Task 1 Steps 5, 9-12; invariants (print/no-JS/tokens/assignment) → Task 1 Step 5 plus each layout's `layout.css` print rules; build.py scans → Task 1 Step 8; tests/fixtures → Task 1 Steps 9-12; docs/samples → Task 5.
- **Placeholder scan:** every code and config step ships full content; no TBD.
- **Type consistency:** `LN.nav = {init, go(i, pushHash)}` is used identically in desk/app/feed/sheet; `LN._sections()` is the single section query; shell draws `js-tabs` from the layout, and base CSS/print rely on it; `data-layout` value equals the `build.json > layout` name.
- **Known gap to flag during execution:** the `app` and `sheet` layouts were prototyped in the visual companion but not yet exercised against real components; Task 2/4 Step 7 (phone-viewport QA) is the gate that catches overlap with the assignment fullscreen and the moved-lab mount. If iOS Safari cannot fullscreen the assignment deck, add a `body.ln-assign` suppression rule in the affected layout CSS.
