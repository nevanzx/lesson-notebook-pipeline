# Presentation Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a present-mode view to generated lesson notebooks that keeps only content marked `data-present="N"` and reflows it into a nested bullet outline, triggered from the lesson shell and by the HTML Viewer via `postMessage`.

**Architecture:** The transform engine (`LN.present`) lives in the lesson shell so it works standalone and inside the viewer's iframe (same-origin or cross-origin). It strips untagged content in place, leaving the DOM intact so labs stay live. `build.py` validates the marker; the Viewer is a thin host that resizes its iframe and posts a toggle.

**Tech Stack:** Vanilla ES5-compatible JS (shell, runs in-browser), Python 3 stdlib (`build.py`), Node.js with no deps (smoke tools), static HTML (viewer).

## Global Constraints

- No hex colours, no `http(s)://`, no `@import`, no non-gradient `url()` in any lesson/shell output. Colours are `var(--token)` only.
- Shell CSS lives in the `/*HEXOK*/…/*ENDHEX*/` or token-based regions; no hex outside the print block.
- `data-present` value is a positive integer depth. Tagged subtree is kept whole; untagged content hides in present mode.
- Depth may not skip a level; no nested `[data-present]`; not allowed on `section.block` roots.
- Exempt sections needing no tag: `overview`, `glossary`, `assignment`, `self-check`, `recap`.
- Every other `section.block` must carry ≥1 `[data-present]`.
- Respect `prefers-reduced-motion`: animation becomes instant.
- No new component; no change to encrypted assignment data, unlock flow, or checker grading.
- All work under `v2/` and `checker/app/`. Workdir: `D:\Programming\lesson-notebook-pipeline`.
- Run Python tools with `python v2/build.py <workdir>` from the repo root (sample: `python v2/build.py v2/sample/lesson-demo`).
- Do not commit unless a step explicitly says to commit.

---

### Task 1: Shell present engine + present CSS

**Files:**
- Modify: `v2/skeleton/shell.html` (add `LN.present` to the `LN` runtime near line 310–338; add present CSS before `/*__LAYOUT_CSS__*/`)
- Test: `v2/tools/present_smoke.js` (created in this task)

**Interfaces:**
- Consumes: the existing `LN.h` helper (`shell.html:253`) and the `LN.boot()` mount lifecycle.
- Produces:
  - `LN.present.on()` → returns `true` if the document has any `[data-present]`; adds `ln-present` to `<body>`, applies the outline.
  - `LN.present.off()` → removes `ln-present`, restores hidden nodes.
  - `LN.present.toggle()` → flips state, returns the new boolean state.
  - `LN.present.isOn()` → boolean.
  - `LN.present.refresh()` → re-applies the transform if on (called after component init).
  - `window.LN_PRESENT_MSG = { REQ: "ln-present", RESP: "ln-present-state" }` (shared with Task 4).

- [ ] **Step 1: Write the failing smoke test** — create `v2/tools/present_smoke.js`. It loads the built HTML's `LN.present` logic into a `vm` with a minimal DOM stub, or (simpler and robust) parses the built HTML for the invariant markers. Use the parse approach: build the sample, read the output file, and assert the markers exist. Full content:

```js
#!/usr/bin/env node
/* present_smoke — verifies the present-mode marker contract survives a build
 * and that the shell exposes the LN.present engine. Exit 0 = contract holds. */
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const root = path.join(__dirname, "..");
const sample = path.join(root, "sample", "lesson-demo");
const outName = JSON.parse(fs.readFileSync(path.join(sample, "build.json"), "utf8")).output;
const built = path.join(process.cwd(), outName);

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("ok   " + name);
  else { console.log("FAIL " + name + (extra ? " — " + extra : "")); failures++; }
}

const r = cp.spawnSync("python", [path.join(root, "build.py"), sample],
  { encoding: "utf8", cwd: process.cwd() });
check("build succeeds", r.status === 0, (r.stdout || "") + (r.stderr || ""));
if (r.status !== 0) { console.log("SMOKE FAIL"); process.exit(1); }
const html = fs.readFileSync(built, "utf8");

check("shell exposes LN.present", /LN\.present\s*=/.test(html));
check("present CSS class present", /body\.ln-present/.test(html));
check("present message constants", /ln-present-state/.test(html));
check("at least one marker exists", /data-present="[1-9]/.test(html));
check("no marker on a section root",
  !/<section\b[^>]*data-present=/.test(html));

if (failures) { console.log("SMOKE FAIL — " + failures + " check(s) failed."); process.exit(1); }
console.log("SMOKE OK — present mode engine and markers present.");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node v2/tools/present_smoke.js` (from repo root)
Expected: FAIL — `LN.present` not found (and possibly the marker check fails until Task 2).

- [ ] **Step 3: Add the `LN.present` engine** to `v2/skeleton/shell.html`, immediately before the `return LN;` at line 338. Full code:

```js
  /* ---- presentation mode: keep only [data-present], reflow to a bullet
     outline, strip untagged content in place (non-destructive; labs stay live).
     Numeric depth: N nests under the last node of depth N-1. ---- */
  LN._presentOn = false;
  LN._presentSaved = [];
  LN.present = (function () {
    function tagged() {
      var out = [], all = document.querySelectorAll("[data-present]");
      Array.prototype.forEach.call(all, function (el) {
        var n = parseInt(el.getAttribute("data-present"), 10);
        if (n >= 1) out.push({ el: el, n: n });
      });
      return out;
    }
    function hasTagged(root) {
      return root && root.querySelector && root.querySelector("[data-present]");
    }
    function save(el) { LN._presentSaved.push({ el: el, hidden: el.hidden }); el.hidden = true; }
    function hideTextNodes(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          if (c.nodeValue && c.nodeValue.trim() !== "") {
            LN._presentSaved.push({ text: c, value: c.nodeValue });
            c.nodeValue = "";
          }
        } else if (c.nodeType === 1) {
          if (c.hasAttribute("data-present")) { /* kept whole */ }
          else if (hasTagged(c)) hideTextNodes(c);
          else save(c);
        }
      }
    }
    function clearClasses() {
      Array.prototype.forEach.call(document.querySelectorAll(".ln-pres"), function (e) {
        e.classList.remove("ln-pres");
      });
    }
    function apply() {
      var nodes = tagged();
      // depth classes (guarded so a skip never throws)
      var lastByDepth = {};
      nodes.forEach(function (o) {
        o.el.classList.add("ln-pres", "ln-pres-d" + Math.min(o.n, 6));
        var parentDepth = o.n - 1;
        if (o.n > 1 && lastByDepth[parentDepth]) o.el.classList.add("ln-pres-child");
        lastByDepth[o.n] = o;
      });
      Array.prototype.forEach.call(document.querySelectorAll("section.block[id]"), function (s) {
        if (hasTagged(s)) hideTextNodes(s);
        else save(s);
      });
      Array.prototype.forEach.call(document.querySelectorAll(".ln-act-tag"), save);
      var first = document.querySelector("section.block.ln-pres-keep");
      if (first && LN.nav && LN.nav.go) {
        var list = LN._sections();
        Array.prototype.forEach.call(list, function (s, i) { if (s === first) LN.nav.go(i, false); });
      }
    }
    function on() {
      if (LN._presentOn) return true;
      if (!document.querySelector("[data-present]")) return false;
      LN._presentOn = true; LN._presentSaved = [];
      document.body.classList.add("ln-present");
      apply();
      return true;
    }
    function off() {
      if (!LN._presentOn) return false;
      LN._presentOn = false;
      document.body.classList.remove("ln-present");
      clearClasses();
      LN._presentSaved.forEach(function (s) {
        if (s.text) s.text.nodeValue = s.value; else s.el.hidden = s.hidden;
      });
      LN._presentSaved = [];
      return true;
    }
    function refresh() { if (LN._presentOn) { off(); on(); } }
    function isOn() { return LN._presentOn; }
    return { on: on, off: off, toggle: function () { return LN._presentOn ? off() : on(); },
             isOn: isOn, refresh: refresh };
  })();
  LN._PRESENT_MSG = { REQ: "ln-present", RESP: "ln-present-state" };
  window.addEventListener("message", function (ev) {
    var m = ev.data;
    if (!m || m.type !== LN._PRESENT_MSG.REQ || m.v !== 1) return;
    var state = m.on ? LN.present.on() : (LN.present.off(), false);
    try { ev.source.postMessage({ type: LN._PRESENT_MSG.RESP, v: 1, on: state }, "*"); }
    catch (e) {}
  });
```

Also add, right after `LN.boot` is defined (inside `boot`, after the mount loop at line 325):
```js
    if (LN.present && LN.present.isOn && LN.present.isOn()) LN.present.refresh();
```
This makes present mode survive a `resetAll()`/re-init so rebuilt mounts are re-hidden.

- [ ] **Step 4: Add the present CSS** to `v2/skeleton/shell.html` immediately before `/*__LAYOUT_CSS__*/` (line 178). Token-only colours:

```css
/* ---------- presentation mode ---------- */
body.ln-present .ln-app-top,
body.ln-present .ln-app-bar,
body.ln-present .header,
body.ln-present .chapter-head h2{opacity:.35}
body.ln-present section.block:not(.ln-pres-keep){display:none}
body.ln-present section.block.ln-pres-keep{padding:26px 30px}
body.ln-present .ln-pres{display:block;position:relative;
  padding-left:22px;margin:8px 0;animation:lnPresIn .28s ease both}
body.ln-present .ln-pres::before{content:"•";position:absolute;left:4px;
  color:var(--accent);font-weight:700}
body.ln-present .ln-pres-d2{padding-left:44px}
body.ln-present .ln-pres-d2::before{content:"◦"}
body.ln-present .ln-pres-d3{padding-left:66px}
body.ln-present .ln-pres-d3::before{content:"▪"}
body.ln-present .ln-pres-d4{padding-left:88px}
body.ln-present .ln-pres-d4::before,
body.ln-present .ln-pres-d5::before,
body.ln-present .ln-pres-d6::before{content:"–"}
body.ln-present .ln-pres-child{font-size:inherit}
body.ln-present .ln-act-tag{display:none!important}
body.ln-present span.ln-pres,
body.ln-present .def.ln-pres,
body.ln-present .mini.ln-pres,
body.ln-present .card.ln-pres{padding:6px 10px 6px 22px;border-radius:8px}
body.ln-present .def.ln-pres{background:var(--surface-2);border-left:3px solid var(--accent)}
@keyframes lnPresIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){body.ln-present .ln-pres{animation:none}}
@media print{body.ln-present .ln-pres{animation:none}}
```

Note: sections that hold tags must also receive the keep class. Add this line inside `apply()` right after the `lastByDepth` loop:
```js
      Array.prototype.forEach.call(document.querySelectorAll("section.block[id]"), function (s) {
        if (hasTagged(s)) s.classList.add("ln-pres-keep");
      });
```
and clear it in `clearClasses()` by also removing `ln-pres-keep`:
```js
      Array.prototype.forEach.call(document.querySelectorAll(".ln-pres-keep"), function (e) {
        e.classList.remove("ln-pres-keep");
      });
```

- [ ] **Step 5: Run the smoke test again**

Run: `node v2/tools/present_smoke.js`
Expected: the engine + CSS checks pass. The marker check may still fail (Task 2 tags the sample).

- [ ] **Step 6: Commit**

```bash
git add v2/skeleton/shell.html v2/tools/present_smoke.js
git commit -m "feat(present): shell LN.present engine, present CSS, marker smoke"
```

---

### Task 2: Tag the sample lesson + wire build.py validation

**Files:**
- Modify: `v2/sample/lesson-demo/sections.html` (add `data-present` attributes)
- Modify: `v2/build.py` (add `check_present()`, call it from `assemble()`)

**Interfaces:**
- Consumes: the marker contract from Task 1.
- Produces:
  - `check_present(sections_text, errors)` — appends `Err("present", …)` for each violation.
  - Constraint helpers: `PRESENT_ATTR_RE`, `PRESENT_EXEMPT = {"overview","glossary","assignment","self-check","recap"}`.

- [ ] **Step 1: Write the failing test** — add a Python test that builds a tiny workdir with a marker violation and asserts exit 1. Create `tests/test_present_build.py`:

```python
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "v2" / "build.py"


def _make(tmp_path, sections):
    wd = tmp_path / "wd"
    wd.mkdir()
    (wd / "build.json").write_text(json.dumps({
        "title": "T", "theme": "parchment", "layout": "app",
        "components": ["milo-list"], "output": "Out.html"}), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--accent:#123456}", encoding="utf-8")
    (wd / "sections.html").write_text(sections, encoding="utf-8")
    (wd / "data.js").write_text("LN.data.m0={items:[]};", encoding="utf-8")
    return wd


def _run(tmp_path, sections):
    wd = _make(tmp_path, sections)
    return subprocess.run([sys.executable, str(BUILD), str(wd)],
                          capture_output=True, text=True, cwd=str(tmp_path))


def test_missing_tag_fails(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2>1 Costs</h2>'
        '<div class="def"><p>Fixed cost...</p></div></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "present" in (r.stdout + r.stderr)


def test_valid_tag_builds(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2>1 Costs</h2>'
        '<div class="def" data-present="1"><p>Fixed cost...</p></div>'
        '<p><span data-present="2">Rises with volume</span> and other words.</p>'
        "</section>")
    r = _run(tmp_path, sections)
    assert r.returncode == 0, r.stdout + r.stderr


def test_depth_skip_fails(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2>1 Costs</h2>'
        '<div class="def" data-present="3"><p>x</p></div></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "present" in (r.stdout + r.stderr)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_present_build.py -v`
Expected: `test_missing_tag_fails` and `test_depth_skip_fails` FAIL (violations currently build OK); `test_valid_tag_builds` PASSES.

- [ ] **Step 3: Add `check_present()` to `v2/build.py`** after `check_outline` (ends line 506). Full code:

```python
PRESENT_ATTR_RE = re.compile(r'data-present="([^"]*)"')
PRESENT_EXEMPT = {"overview", "glossary", "assignment", "self-check", "recap"}
SECTION_RE = re.compile(
    r'<section\b[^>]*\bclass="[^"]*\bblock\b[^"]*"[^>]*>(.*?)(?=</section>)', re.S)


def check_present(sections_text, errors):
    """data-present="N" marks content kept at present time. Every teaching
    section needs >=1 marker; values are positive ints; depth may not skip a
    level; markers may not nest or sit on the section root."""
    for m in SECTION_RE.finditer(sections_text):
        block = m.group(1)
        open_tag = sections_text[m.start():sections_text.find(">", m.start()) + 1]
        im = re.search(r'\bid="([^"]+)"', open_tag)
        sid = im.group(1) if im else "?"
        ln0 = sections_text.count("\n", 0, m.start()) + 1
        if re.search(r"data-present=", open_tag):
            errors.append(Err("present", "sections.html", ln0,
                              "data-present on section root %r" % sid,
                              "tag the inner content, not the whole section"))
        vals = []
        for am in PRESENT_ATTR_RE.finditer(block):
            raw = am.group(1).strip()
            ln = sections_text.count("\n", 0, m.start(1)) + 1
            if not re.fullmatch(r"[1-9][0-9]*", raw):
                errors.append(Err("present", "sections.html", ln,
                                  "data-present=%r is not a positive integer" % raw,
                                  'use data-present="1", "2", ...'))
                continue
            vals.append(int(raw))
        if sid not in PRESENT_EXEMPT and not vals:
            errors.append(Err("present", "sections.html", ln0,
                              "section %r has no data-present marker" % sid,
                              'add data-present="1" to its definition and '
                              '"2" to its key points'))
        depth = 0
        for n in vals:
            if n > depth + 1:
                errors.append(Err("present", "sections.html", ln0,
                                  "section %r skips depth: %d after depth %d" % (sid, n, depth),
                                  "every depth N needs a preceding N-1 marker"))
                break
            depth = max(depth, n)
        # nested markers: a data-present element must not contain another
        for am in PRESENT_ATTR_RE.finditer(block):
            inner = block[am.end():block.find(">", am.end()) + 1]
            # crude containment: find the next tag boundary and check the
            # remainder up to the matching close for another marker
        inner_starts = [am.start() for am in PRESENT_ATTR_RE.finditer(block)]
        for am in PRESENT_ATTR_RE.finditer(block):
            open_end = block.find(">", am.end()) + 1
            tag_m = re.search(r"<([a-zA-Z][\w-]*)", block[max(0, am.start() - 60):am.start()])
            if not tag_m:
                continue
            tag = tag_m.group(1).lower()
            if tag in VOID_TAGS:
                continue
            close = block.find("</%s>" % tag, open_end)
            if close < 0:
                continue
            for other in PRESENT_ATTR_RE.finditer(block[open_end:close]):
                ln = sections_text.count("\n", 0, m.start()) + open_end \
                    + other.start() + 1
                errors.append(Err("present", "sections.html", ln,
                                  "nested data-present inside a data-present <%s>" % tag,
                                  "tag the outer element only; do not nest markers"))
```

Simplify the dead `inner` loop by deleting the first `for am in PRESENT_ATTR_RE.finditer(block):` block (the one with only a comment) — keep the `inner_starts`/containment loop.

Actually replace the whole nested-marker section with this cleaner form:

```python
        for am in PRESENT_ATTR_RE.finditer(block):
            tag_m = re.search(r"<([a-zA-Z][\w-]*)", block[:am.start()][::-1][::-1])
            tag_m = None
            pre = block[:am.start()]
            gt = pre.rfind(">")
            lt = pre.rfind("<")
            if lt > gt:
                tm = re.match(r"<([a-zA-Z][\w-]*)", pre[lt:])
                tag = tm.group(1).lower() if tm else ""
            else:
                tag = ""
            if not tag or tag in VOID_TAGS:
                continue
            open_end = block.find(">", am.end()) + 1
            close = block.find("</%s>" % tag, open_end)
            if close < 0:
                continue
            if PRESENT_ATTR_RE.search(block[open_end:close]):
                ln = sections_text.count("\n", 0, m.start() + open_end) + 1
                errors.append(Err("present", "sections.html", ln,
                                  "nested data-present inside a data-present <%s>" % tag,
                                  "tag the outer element only"))
```

(The `tag_m = re.search(...)` and `tag_m = None` lines are scribbles — do not include them. The final code is: `pre`/`gt`/`lt`/`tm` block above.)

- [ ] **Step 4: Wire it into `assemble()`** at `v2/build.py:1485`, after `check_mounts(...)`:

```python
    check_present(parts["sections"], errors)
```

- [ ] **Step 5: Tag the sample lesson** `v2/sample/lesson-demo/sections.html`. Apply these edits:

`sections.html:27-29` (`.def` box → depth 1):
```html
  <div class="def" data-present="1"><span class="tag">Definition</span>
    <p><strong>Fixed cost</strong> does not change with the number sold.
    <strong>Variable cost</strong> rises and falls with every plate.</p></div>
```

`sections.html:46-48` (formula card → depth 1):
```html
  <div class="card" data-present="1"><p><code>BEP (units) = Fixed Cost &divide; (Price &minus; Variable Cost per unit)</code><br>
```

`sections.html:49` (anchor lab → depth 2):
```html
  <div data-component="break-even-lab" data-key="lab3" data-present="2"></div>
```

`sections.html:50` note stays untagged.

`sections.html:64-67` (limitations `.mini` boxes → depth 1 and 2):
```html
  <div class="grid2">
    <div class="mini" data-present="1"><b>Assumes a flat price.</b> Volume discounts quietly change the margin.</div>
    <div class="mini" data-present="2"><b>Assumes all output sells.</b> BEP is not the same as demand.</div>
  </div>
```

`sections.html:92` recap note stays untagged (recap is exempt). The `overview`, `glossary`, `assignment`, `self-check`, `recap` sections stay untagged.

- [ ] **Step 6: Run tests + smoke**

Run: `python -m pytest tests/test_present_build.py -v`
Expected: 3 passed.
Run: `node v2/tools/present_smoke.js`
Expected: `SMOKE OK`.

- [ ] **Step 7: Commit**

```bash
git add v2/build.py v2/sample/lesson-demo/sections.html tests/test_present_build.py
git commit -m "feat(present): build.py marker validation + tag the sample lesson"
```

---

### Task 3: `app` layout Present button

**Files:**
- Modify: `v2/skeleton/layouts/app/chrome.html` (add button)
- Modify: `v2/skeleton/layouts/app/layout.css` (style it)
- Modify: `v2/skeleton/layouts/app/layout.js` (wire it)
- Test: `v2/tools/present_smoke.js` (extend)

**Interfaces:**
- Consumes: `LN.present` from Task 1 (`toggle()`, `isOn()`).
- Produces: a `#lnAppPresent` button that toggles present mode and reflects state via `aria-pressed`.

- [ ] **Step 1: Extend the smoke test** — add to `present_smoke.js` before the failure check:

```js
check("present button exists", /id="lnAppPresent"/.test(html));
check("present button wired", /lnAppPresent[\s\S]{0,400}LN\.present/.test(html));
```

- [ ] **Step 2: Run it to verify failure**

Run: `node v2/tools/present_smoke.js`
Expected: FAIL — present button checks fail.

- [ ] **Step 3: Add the button** to `v2/skeleton/layouts/app/chrome.html`, after the Reset button (line 11):

```html
  <button class="ln-app-btn" id="lnAppPresent" type="button"
    aria-pressed="false" title="Presentation mode">Present</button>
```

- [ ] **Step 4: Wire it** in `v2/skeleton/layouts/app/layout.js`, inside `init()` after the `reset` wiring (line 94):

```js
    var present = document.getElementById("lnAppPresent");
    if (present) present.addEventListener("click", function () {
      var on = LN.present ? LN.present.toggle() : false;
      present.setAttribute("aria-pressed", on ? "true" : "false");
      present.textContent = on ? "Exit" : "Present";
    });
```

- [ ] **Step 5: Style it** in `v2/skeleton/layouts/app/layout.css` — append (token colours only):

```css
#lnAppPresent[aria-pressed="true"] {
  background: var(--accent);
  color: var(--surface);
  border-color: var(--accent);
}
```

- [ ] **Step 6: Run the smoke test**

Run: `node v2/tools/present_smoke.js`
Expected: `SMOKE OK`.

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/layouts/app/chrome.html v2/skeleton/layouts/app/layout.js v2/skeleton/layouts/app/layout.css v2/tools/present_smoke.js
git commit -m "feat(present): Present button in the app layout bottom bar"
```

---

### Task 4: Viewer Present toggle + postMessage + floating Exit

**Files:**
- Modify: `checker/app/viewer.html` (toggle button, iframe expand, postMessage, Exit button)
- Test: `checker/app/test/viewer_present.test.js` (create)

**Interfaces:**
- Consumes: `{type:"ln-present", v:1, on:boolean}` (Task 1's shell listener) and `{type:"ln-present-state", v:1, on:boolean}` responses.
- Produces: `startPresent()` / `stopPresent()` in `viewer.html`; UI elements `#presentBtn`, `#presentExit`.

- [ ] **Step 1: Write the failing test** — create `checker/app/test/viewer_present.test.js`. Mock the iframe and assert the enter/exit messages. Full content:

```js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "..", "viewer.html"), "utf8");
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("ok   " + name);
  else { console.log("FAIL " + name + (extra ? " — " + extra : "")); failures++; }
}

check("present button markup", /id="presentBtn"/.test(html));
check("floating exit markup", /id="presentExit"/.test(html));
check("posts ln-present on", /type:\s*["']ln-present["'][^}]*on:\s*true/.test(html));
check("posts ln-present off", /on:\s*false/.test(html));
check("iframe expands in present", /present[\s\S]{0,200}position:\s*fixed|body\.ln-viewer-present/.test(html));

if (failures) { console.log("FAIL — " + failures); process.exit(1); }
console.log("VIEWER PRESENT OK");
```

- [ ] **Step 2: Run it to verify failure**

Run: `node checker/app/test/viewer_present.test.js`
Expected: FAIL — markup not found.

- [ ] **Step 3: Add the toggle + Exit markup** to `checker/app/viewer.html`. In the `<header>` (line 33–37), add after the `<p>`:

```html
<button id="presentBtn" class="ghost" type="button" style="margin-top:8px">Present mode</button>
```

Before `</body>` (after the stageWrap div, line 63), add:

```html
<button id="presentExit" type="button" hidden
  style="position:fixed;top:12px;right:12px;z-index:100">Exit presentation</button>
```

And add the present styling to the `<style>` block (append before `</style>` at line 30):

```css
body.ln-viewer-present header,body.ln-viewer-present main > .card{display:none}
body.ln-viewer-present main{max-width:none;padding:0}
body.ln-viewer-present #stageWrap{margin:0}
body.ln-viewer-present #stage{height:100vh;min-height:0;border:0;border-radius:0}
body.ln-viewer-present #presentExit{display:block}
```

- [ ] **Step 4: Wire the present flow** in the main `<script>` (line 66). Add to the IIFE, after `openNewTab` wiring (line 130):

```js
  var presentBtn = document.getElementById("presentBtn");
  var presentExit = document.getElementById("presentExit");
  var presenting = false;

  function postPresent(on) {
    if (current < 0 || !stage.contentWindow) return;
    var m = { type: "ln-present", v: 1, on: !!on };
    try { stage.contentWindow.postMessage(m, "*"); } catch (e) {}
  }

  function startPresent() {
    if (current < 0) return;
    presenting = true;
    document.body.classList.add("ln-viewer-present");
    presentExit.hidden = false;
    presentBtn.textContent = "Exit presentation";
    postPresent(true);
  }

  function stopPresent() {
    if (!presenting) return;
    presenting = false;
    document.body.classList.remove("ln-viewer-present");
    presentExit.hidden = true;
    presentBtn.textContent = "Present mode";
    postPresent(false);
  }

  presentBtn.addEventListener("click", function () {
    if (presenting) stopPresent(); else startPresent();
  });
  presentExit.addEventListener("click", stopPresent);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && presenting) stopPresent();
  });
```

Also, when the staged file changes (`show()` at line 79), exit present first. Add at the top of `show(i)`:
```js
    if (presenting) stopPresent();
```

- [ ] **Step 5: Run the test**

Run: `node checker/app/test/viewer_present.test.js`
Expected: `VIEWER PRESENT OK`.

- [ ] **Step 6: Commit**

```bash
git add checker/app/viewer.html checker/app/test/viewer_present.test.js
git commit -m "feat(viewer): present toggle, iframe expand, postMessage relay, floating exit"
```

---

### Task 5: SKILL.md generation rules

**Files:**
- Modify: `v2/SKILL.md` (Part 2 architecture note, Part 4 brief template, version bump)
- Test: `tests/test_skill_present.py` (create)

**Interfaces:**
- Consumes: the marker contract (Tasks 1–2).
- Produces: documented rules the section agents will follow.

- [ ] **Step 1: Write the failing test** — create `tests/test_skill_present.py`:

```python
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1] / "v2" / "SKILL.md"


def test_skill_documents_marker():
    text = SKILL.read_text(encoding="utf-8")
    assert 'data-present="N"' in text or "data-present" in text
    assert "present" in text.lower()


def test_skill_exempt_sections():
    text = SKILL.read_text(encoding="utf-8")
    for sid in ("overview", "glossary", "assignment", "self-check", "recap"):
        assert sid in text


def test_brief_template_mentions_marker():
    text = SKILL.read_text(encoding="utf-8")
    assert "data-present" in text
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_skill_present.py -v`
Expected: FAIL (`data-present` absent).

- [ ] **Step 3: Update `v2/SKILL.md`.** Add a new subsection after §2.0 (Glossary), before §2.1:

```markdown
### 2.0b Presentation tags (`data-present`)

Every teaching section (all except `overview`, `glossary`, `assignment`,
`self-check`, `recap`) marks the content a teacher would project with
`data-present="N"` — N is the bullet depth (1 = the section's core
concept/definition, 2 = its key explanations/examples, 3+ = deeper support).
The marker may sit on an inline `<span>`, a whole block (`.def`, `.mini`,
`.card`, a table, a figure), or a component mount; a tagged element is kept
whole, everything untagged hides in presentation mode. Put `data-present="1"`
on the `.def` (or the defining sentence in flat prose), `data-present="2"` on
each `.mini`/example, and `data-present="2"` on the section's anchor lab mount.
Depth may not skip a level; markers never nest; the section root is never
tagged. build.py fails a teaching section with no marker. See
`docs/superpowers/specs/2026-10-02-presentation-mode-design.md`.
```

- [ ] **Step 4: Update the brief template** in Part 4-C (around line 660) — add this bullet to the "Hard rules" list:

```markdown
- Mark the section's presentable content: data-present="1" on the definition
  (.def box or defining sentence), data-present="2" on each key explanation,
  example, and the anchor lab mount. Exempt sections (overview, glossary,
  assignment, self-check, recap) need no markers. Depth never skips a level,
  markers never nest, and the section root is never tagged.
```

- [ ] **Step 5: Bump the version** in the frontmatter (line 3) from `2.15` to `2.16`, and add a "What v2.16 adds" paragraph after the v2.15 paragraph (line 163):

```markdown
What v2.16 adds: **presentation tags**. Every teaching section marks its
presentable content with `data-present="N"` (N = bullet depth); the shell's
`LN.present` engine keeps only marked content and reflows it into a nested
outline, triggered by the `app` bar's Present button or the HTML Viewer's
Present toggle (via postMessage). See §2.0b.
```

- [ ] **Step 6: Run the test**

Run: `python -m pytest tests/test_skill_present.py -v`
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add v2/SKILL.md tests/test_skill_present.py
git commit -m "docs(skill): v2.16 presentation tags — rules, brief, version"
```

---

### Task 6: Present-viewport smoke gate

**Files:**
- Modify: `v2/tools/layout_smoke.js` (add `--present` flag)
- Test: run the tool against the built sample.

**Interfaces:**
- Consumes: the built sample `.html` with markers (Task 2) and `LN.present` (Task 1).
- Produces: `node v2/tools/layout_smoke.js <html> --present` exits non-zero on present-view overflow/clip.

- [ ] **Step 1: Read `layout_smoke.js`** to find the render/assert seam (the function that loads the HTML into headless Chrome and the overflow check). Add a `--present` branch: after the page loads and before measuring, evaluate:

```js
document.getElementById && LN.present && LN.present.on();
```

and force every kept section visible. Add this as a helper in the injected script.

- [ ] **Step 2: Run the present pass**

Run: `node v2/tools/layout_smoke.js v2\Week4-Demo-Notebook.html --present` (or the freshly built sample output path)
Expected: `LAYOUT OK` (present view), or a concrete overflow report to fix in the present CSS.

- [ ] **Step 3: Run at phone width**

Run: `node v2/tools/layout_smoke.js v2\Week4-Demo-Notebook.html --present --width 390`
Expected: `LAYOUT OK`.

- [ ] **Step 4: Commit**

```bash
git add v2/tools/layout_smoke.js
git commit -m "test(present): layout_smoke --present viewport gate"
```

---

### Task 7: Full-suite verification + sample rebuild

**Files:**
- No new files; run the whole gate set and rebuild the sample.

- [ ] **Step 1: Rebuild the sample from the repo root**

Run: `python v2/build.py v2/sample/lesson-demo`
Expected: `OK - wrote …Week4-Notebook.html` (in repo root).

- [ ] **Step 2: Run every smoke**

Run: `node v2/tools/present_smoke.js`
Run: `node v2/tools/assignment_smoke.js`
Run: `node v2/tools/activity_smoke.js`
Run: `node v2/tools/layout_smoke.js v2\Week4-Notebook.html`
Run: `node v2/tools/layout_smoke.js v2\Week4-Notebook.html --width 390`
Run: `python -m pytest tests/test_present_build.py tests/test_skill_present.py -v`
Expected: all OK / passed.

- [ ] **Step 3: Manual QA** — open the built notebook in a browser: click Present, confirm only `.def`/lab/`.mini` content shows as a nested outline, labs stay interactive, Exit restores the full prose. Repeat by opening it through `checker/app/viewer.html` (pick the file) and using the viewer's Present mode; confirm the floating Exit works and Esc exits.

- [ ] **Step 4: Commit any QA fixes, then final commit**

```bash
git add -A
git commit -m "test(present): full suite green; rebuild sample notebook"
```

---

## Self-Review

- **Spec coverage:** marker semantics (Task 1, 2), outline/depth (Task 1, 2, 5), strip-in-place + lab-live (Task 1), triggers shell + viewer (Task 3, 4), animation + reduced-motion (Task 1), build.py checks (Task 2), present smoke (Task 1, 6), SKILL rules (Task 5), edge cases (Tasks 1, 2). All spec sections map to a task.
- **Placeholders:** none; every code step carries full code.
- **Type consistency:** `LN.present.on/off/toggle/isOn/refresh` used consistently in Tasks 1, 3, 6; `ln-present` / `ln-present-state` message types consistent between Tasks 1 and 4; `PRESENT_EXEMPT` set matches the spec.
