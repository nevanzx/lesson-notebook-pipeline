# Present Mode v2.17 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pinned section title and mandatory calculation tags to presentation mode, and stop the lesson nav bar from drifting inside the HTML Viewer.

**Architecture:** `data-present="0"` is reserved on each teaching section's `<h2>` to mean "pinned heading". The shell's `LN.present` engine keeps it visible, marks it `.ln-pres-title`, and pins it below the top chrome via a measured `--ln-pres-top`. The Viewer's present mode pins the iframe wrapper to `inset:0` and hides the footer so the host page can no longer scroll and drag the lesson bar.

**Tech Stack:** Vanilla ES5-compatible JS (shell), Python 3 stdlib (`build.py`), Node.js (smoke tools + viewer test), static HTML + CSS (viewer).

## Global Constraints

- No hex colours, no `http(s)://`, no `@import`, no non-gradient `url()` in any lesson/shell output. Colours are `var(--token)` only.
- Shell CSS lives in the token-based regions; no hex outside the print block.
- `data-present="N"` values: `0` is reserved for the section `<h2>` only; positive integers are content bullet depths. Tagged subtree is kept whole; untagged content hides in present mode.
- Positive depths may not skip a level; no nested `[data-present]`; not allowed on `section.block` roots.
- Exempt sections needing no tags: `overview`, `glossary`, `selfcheck` (also `self-check`), `assignment` (also `assign`), `recap`.
- Every non-exempt section must carry exactly one `data-present="0"` on its `<h2>` **and** ≥1 positive-depth marker.
- Respect `prefers-reduced-motion`: animation becomes instant.
- No new component; no change to encrypted assignment data, unlock flow, or checker grading.
- Work under `v2/` and `checker/app/`. Run Python tools as `python v2/build.py <workdir>` from the repo root.
- Commit steps assume the user has approved committing; if not, stop after the verification step.

---

### Task 1: Title marker contract in `build.py` + retag the sample

**Files:**
- Modify: `v2/build.py:508-592` (`check_present`)
- Modify: `v2/sample/lesson-demo/sections.html` (h2 tags of the 5 teaching sections)
- Modify: `tests/test_present_build.py`
- Modify successful-build fixtures so their teaching sections carry a title marker:
  `tests/test_build.py:78`, `tests/test_assignment_encryption.py:33`,
  `tests/test_assignment_meta.py:22,69`, `tests/test_assignment_window.py:31,98`,
  `tests/test_components_matrix.py:51`, `tests/test_shell_layouts.py:10,13`
- Test: `python -m pytest tests/test_present_build.py -v` then `python -m pytest tests -q`

**Interfaces:**
- Consumes: `PRESENT_ATTR_RE`, `PRESENT_EXEMPT`, `SECTION_RE`, `VOID_TAGS`, `Err`.
- Produces: `_owning_tag(block, pos) -> str` and a `check_present()` that accepts `data-present="0"` on an `<h2>`, requires exactly one per non-exempt section, and requires ≥1 positive marker.

- [ ] **Step 1: Write the failing tests** — replace the whole of `tests/test_present_build.py` with:

```python
import json
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


def test_valid_tags_build(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2 data-present="0">1 Costs</h2>'
        '<div class="def" data-present="1"><p>Fixed cost...</p></div>'
        '<p><span data-present="2">Rises with volume</span> and other words.</p>'
        "</section>")
    r = _run(tmp_path, sections)
    assert r.returncode == 0, r.stdout + r.stderr


def test_title_only_fails(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2 data-present="0">1 Costs</h2>'
        '<p>prose only</p></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "content marker" in (r.stdout + r.stderr)


def test_two_titles_fail(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2 data-present="0">1 Costs</h2>'
        '<h2 data-present="0">Dup</h2>'
        '<div class="def" data-present="1"><p>x</p></div></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "more than one title" in (r.stdout + r.stderr)


def test_zero_off_h2_fails(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2 data-present="0">1 Costs</h2>'
        '<div class="def" data-present="0"><p>x</p></div>'
        '<p data-present="1">y</p></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "only valid on" in (r.stdout + r.stderr)


def test_depth_skip_fails(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2 data-present="0">1 Costs</h2>'
        '<div class="def" data-present="3"><p>x</p></div></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "present" in (r.stdout + r.stderr)


def test_nested_tag_fails(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2 data-present="0">1 Costs</h2>'
        '<div class="def" data-present="1"><div class="sub">x</div>'
        '<span data-present="2">y</span></div></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "nested" in (r.stdout + r.stderr)


def test_root_tag_fails(tmp_path):
    sections = (
        '<section class="block" id="costs" data-present="1"><h2>1 Costs</h2>'
        '<p data-present="1">x</p></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "root" in (r.stdout + r.stderr)


def test_exempt_id_variants_build(tmp_path):
    sections = (
        '<section class="block" id="self-check"><h2>0 Self Check</h2>'
        '<p>Read this before you answer.</p></section>'
        '<section class="block" id="assign"><h2>5 Assignment</h2>'
        '<p>Show what you learned.</p></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 0, r.stdout + r.stderr
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `python -m pytest tests/test_present_build.py -v`
Expected: `test_valid_tags_build`, `test_title_only_fails`, `test_two_titles_fail`, `test_zero_off_h2_fails` FAIL.

- [ ] **Step 3: Rewrite `check_present()` in `v2/build.py`** — replace the function at lines 508-592 with:

```python
PRESENT_ATTR_RE = re.compile(r'data-present="([^"]*)"')
PRESENT_EXEMPT = {"overview", "glossary", "selfcheck", "assignment", "recap",
                  "self-check", "assign"}
SECTION_RE = re.compile(
    r'<section\b[^>]*\bclass="[^"]*\bblock\b[^"]*"[^>]*>(.*?)(?=</section>)', re.S)


def _owning_tag(block, pos):
    """Return the lowercased tag containing the attribute at `pos`, or ''."""
    pre = block[:pos]
    gt = pre.rfind(">")
    lt = pre.rfind("<")
    if lt > gt:
        tm = re.match(r"<([a-zA-Z][\w-]*)", pre[lt:])
        return tm.group(1).lower() if tm else ""
    return ""


def check_present(sections_text, errors):
    """data-present="N" marks content kept at present time.

    N=0 is reserved for the section title <h2>: shown pinned, not a bullet.
    Every teaching section needs exactly one title marker and >=1 positive
    content marker; positive depths may not skip a level; markers may not nest
    or sit on the section root."""
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
        titles = 0
        for am in PRESENT_ATTR_RE.finditer(block):
            raw = am.group(1).strip()
            ln = sections_text.count("\n", 0, m.start(1) + am.start(1)) + 1
            if raw == "0":
                if _owning_tag(block, am.start()) == "h2":
                    titles += 1
                else:
                    errors.append(Err("present", "sections.html", ln,
                                      'data-present="0" is only valid on the '
                                      "section title <h2>",
                                      'put data-present="0" on the <h2>; use '
                                      '"1","2",... for content'))
                continue
            if not re.fullmatch(r"[1-9][0-9]*", raw):
                errors.append(Err("present", "sections.html", ln,
                                  "data-present=%r is not a positive integer" % raw,
                                  'use data-present="1", "2", ... (or "0" on the <h2>)'))
                continue
            vals.append(int(raw))
        if sid not in PRESENT_EXEMPT:
            if titles == 0:
                errors.append(Err("present", "sections.html", ln0,
                                  "section %r has no title marker" % sid,
                                  'put data-present="0" on its <h2>'))
            elif titles > 1:
                errors.append(Err("present", "sections.html", ln0,
                                  "section %r has more than one title marker" % sid,
                                  'exactly one data-present="0" belongs on the <h2>'))
            if not vals:
                errors.append(Err("present", "sections.html", ln0,
                                  "section %r has no data-present content marker" % sid,
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
            tag = _owning_tag(block, am.start())
            if not tag or tag in VOID_TAGS:
                continue
            open_end = block.find(">", am.end()) + 1
            # Find the close tag at the same nesting depth. A naive find()
            # stops at the first same-named close, hiding a marker that sits
            # after an inner same-tag close (e.g. a div nested in a div).
            tag_open = re.compile(r"<%s(?=[\s/>])" % re.escape(tag))
            tag_close = re.compile(r"</%s\s*>" % re.escape(tag))
            depth, close, pos = 1, -1, open_end
            while depth > 0:
                no = tag_open.search(block, pos)
                nc = tag_close.search(block, pos)
                if not nc:
                    break
                if no and no.start() < nc.start():
                    depth += 1
                    pos = no.end()
                else:
                    depth -= 1
                    if depth == 0:
                        close = nc.start()
                    pos = nc.end()
            if close < 0:
                continue
            nested = PRESENT_ATTR_RE.search(block[open_end:close])
            if nested:
                ln = sections_text.count(
                    "\n", 0, m.start(1) + open_end + nested.start()) + 1
                errors.append(Err("present", "sections.html", ln,
                                  "nested data-present inside a data-present <%s>" % tag,
                                  "tag the outer element only"))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/test_present_build.py -v`
Expected: 9 passed.

- [ ] **Step 5: Add title markers to the successful-build fixtures.** Each `<h2>` below gains `data-present="0"` (the surrounding section has a `data-present="1"` and the build is expected to succeed):

```
tests/test_build.py:78                <h2>S</h2>  ->  <h2 data-present="0">S</h2>
tests/test_assignment_encryption.py:33 <h2>A B</h2> -> <h2 data-present="0">A B</h2>
tests/test_assignment_meta.py:22       <h2>A B</h2> -> <h2 data-present="0">A B</h2>
tests/test_assignment_meta.py:69       <h2>A B</h2> -> <h2 data-present="0">A B</h2>
tests/test_assignment_window.py:31     <h2>A B</h2> -> <h2 data-present="0">A B</h2>
tests/test_assignment_window.py:98     <h2>A B</h2> -> <h2 data-present="0">A B</h2>
tests/test_components_matrix.py:51     <h2>Matrix</h2> -> <h2 data-present="0">Matrix</h2>
tests/test_shell_layouts.py:10         <h2>One</h2> -> <h2 data-present="0">One</h2>
tests/test_shell_layouts.py:13         <h2>Two</h2> -> <h2 data-present="0">Two</h2>
```

Do not touch fixtures whose builds are expected to fail (`test_build.py:124,184,203-204,211,217,227-235,240`); extra `present` errors do not change their assertions.

- [ ] **Step 6: Retag the sample lesson titles** in `v2/sample/lesson-demo/sections.html`. Change these five `<h2>` lines (leave `overview`, `glossary`, `assignment`, `selfcheck`, `recap` untagged):

```
line 24: <h2>1 &nbsp;Fixed vs. Variable Cost</h2>
   ->    <h2 data-present="0">1 &nbsp;Fixed vs. Variable Cost</h2>
line 36: <h2>2 &nbsp;The Feasibility Gate</h2>
   ->    <h2 data-present="0">2 &nbsp;The Feasibility Gate</h2>
line 44: <h2>3 &nbsp;The Break-Even Lab</h2>
   ->    <h2 data-present="0">3 &nbsp;The Break-Even Lab</h2>
line 55: <h2>4 &nbsp;Worked Examples</h2>
   ->    <h2 data-present="0">4 &nbsp;Worked Examples</h2>
line 61: <h2>5 &nbsp;Where the Method Fails</h2>
   ->    <h2 data-present="0">5 &nbsp;Where the Method Fails</h2>
```

- [ ] **Step 7: Rebuild the sample and confirm the marker passes**

Run: `python v2/build.py v2/sample/lesson-demo`
Expected: `OK - wrote …Week4-Demo-Notebook.html` and `OK - wrote …-key.json`.

- [ ] **Step 8: Run the broader Python suite to confirm the fixture edits**

Run: `python -m pytest tests -q`
Expected: no new failures (the present fixtures above now satisfy the title rule).

- [ ] **Step 9: Commit**

```bash
git add v2/build.py v2/sample/lesson-demo/sections.html tests/
git commit -m "feat(present): data-present=0 title marker — build rule + fixtures"
```

---

### Task 2: Shell engine pinned title + present CSS

**Files:**
- Modify: `v2/skeleton/shell.html:178-209` (present CSS) and `:373-522` (`LN.present`)
- Modify: `v2/tools/present_smoke.js`
- Test: `node v2/tools/present_smoke.js`

**Interfaces:**
- Consumes: the `data-present="0"` contract from Task 1.
- Produces: `headings()`, `measureTop()`, `.ln-pres-title`, `--ln-pres-top`, and `overflow:visible` overrides in present mode.

- [ ] **Step 1: Extend the smoke test** — add these checks to `v2/tools/present_smoke.js` immediately before the final `if (failures)` block:

```js
check("section title marker on h2", /<h2[^>]*data-present="0"/.test(html));
check("engine collects title headings", /h2\[data-present="0"\]/.test(html));
check("present title CSS present", /body\.ln-present \.ln-pres-title/.test(html));
check("title offset var measured", /--ln-pres-top/.test(html));
check("present relaxes ancestor overflow", /body\.ln-present \.app \.sheet/.test(html));
```

- [ ] **Step 2: Run it to verify failure**

Run: `node v2/tools/present_smoke.js`
Expected: FAIL on the five new checks (the sample rebuild from Task 1 keeps the build succeeding).

- [ ] **Step 3: Add the present CSS** to `v2/skeleton/shell.html` immediately after line 185 (`body.ln-present section.block.ln-pres-keep{padding:26px 30px}`):

```css
body.ln-present .app .sheet,
body.ln-present section.block.ln-pres-keep{overflow:visible}
body.ln-present .ln-pres-title{position:sticky;top:var(--ln-pres-top,0);
  z-index:30;background:var(--bg);padding:8px 0 10px;margin:0 0 12px;
  border-bottom:1px solid var(--grid)}
```

- [ ] **Step 4: Add `headings()` and `measureTop()`** in `v2/skeleton/shell.html`. Insert `headings()` immediately after the existing `tagged()` function (after its closing `}` at line 398):

```js
    function headings() {
      return document.querySelectorAll('section.block[id] h2[data-present="0"]');
    }
```

Insert `measureTop()` immediately after the existing `currentIndex()` function (after its closing `}` at line 444):

```js
    // Pin the section title below whatever top chrome is on screen: the
    // mobile .ln-app-top (sticky top:0) or the desktop .ln-app-bar (sticky
    // top:0). The fixed bottom bar is excluded because its computed top is
    // "auto". The measured height is written to --ln-pres-top.
    function measureTop() {
      var h = 0, nodes = [document.querySelector(".ln-app-top"),
                          document.querySelector(".ln-app-bar")];
      Array.prototype.forEach.call(nodes, function (el) {
        if (!el) return;
        var cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return;
        var anchoredTop = (cs.position === "sticky" || cs.position === "fixed")
          ? parseFloat(cs.top) === 0 : true;
        if (!anchoredTop) return;
        h = Math.max(h, el.getBoundingClientRect().height);
      });
      if (document.documentElement.style) {
        document.documentElement.style.setProperty("--ln-pres-top",
          Math.round(h) + "px");
      }
    }
```

- [ ] **Step 5: Wire both into the transform.** In `clearClasses()` add `"ln-pres-title"` to the class array:

```js
      ["ln-pres", "ln-pres-keep", "ln-pres-child", "ln-pres-title",
       "ln-pres-d1", "ln-pres-d2", "ln-pres-d3",
       "ln-pres-d4", "ln-pres-d5", "ln-pres-d6"].forEach(function (cls) {
```

In `apply()`, after the section `ln-pres-keep` loop (ends line 457), insert:

```js
      Array.prototype.forEach.call(headings(), function (h) {
        h.classList.add("ln-pres-title");
      });
```

At the top of `apply()` (before `var nodes = tagged();`), add:

```js
      measureTop();
```

In `off()`, immediately after `document.body.classList.remove("ln-present");` (line 486), add:

```js
      try { document.documentElement.style.removeProperty("--ln-pres-top"); } catch (e) {}
```

Add a resize listener inside the IIFE, immediately after `function isOn() { ... }` (line 519):

```js
    window.addEventListener("resize", function () {
      if (LN._presentOn) measureTop();
    });
```

- [ ] **Step 6: Rebuild + run the smoke test**

Run: `python v2/build.py v2/sample/lesson-demo`
Run: `node v2/tools/present_smoke.js`
Expected: `SMOKE OK`.

- [ ] **Step 7: Run the present layout gate (desktop + phone)**

Run: `node v2/tools/layout_smoke.js Week4-Demo-Notebook.html --present`
Run: `node v2/tools/layout_smoke.js Week4-Demo-Notebook.html --present --width 390`
Expected: `LAYOUT OK` both times.

- [ ] **Step 8: Commit**

```bash
git add v2/skeleton/shell.html v2/tools/present_smoke.js
git commit -m "feat(present): pinned section title under the app chrome"
```

---

### Task 3: Viewer host — pin the iframe, hide the footer

**Files:**
- Modify: `checker/app/viewer.html:30-34` (present CSS)
- Modify: `checker/app/test/viewer_present.test.js`
- Test: `node checker/app/test/viewer_present.test.js`

**Interfaces:**
- Consumes: the existing `ln-viewer-present` body class and `#stage` / `#stageWrap` markup.
- Produces: host present mode that cannot scroll (`overflow:hidden`), footer hidden, `#stageWrap` fixed to the viewport.

- [ ] **Step 1: Extend the test** — add these checks to `checker/app/test/viewer_present.test.js` in the static markup section (after line 20):

```js
check("present hides viewer footer", /body\.ln-viewer-present footer\{display:none\}/.test(html));
check("present pins the stage wrap",
  /body\.ln-viewer-present #stageWrap\{position:fixed;inset:0/.test(html));
check("present locks host scroll", /body\.ln-viewer-present\{overflow:hidden\}/.test(html));
```

- [ ] **Step 2: Run it to verify failure**

Run: `node checker/app/test/viewer_present.test.js`
Expected: FAIL on the three new checks.

- [ ] **Step 3: Replace the viewer present CSS** — in `checker/app/viewer.html`, replace lines 30-34:

```css
body.ln-viewer-present header,body.ln-viewer-present main > .card{display:none}
body.ln-viewer-present main{max-width:none;padding:0}
body.ln-viewer-present #stageWrap{margin:0}
body.ln-viewer-present #stage{height:100vh;min-height:0;border:0;border-radius:0}
body.ln-viewer-present #presentExit{display:block}
```

with:

```css
body.ln-viewer-present{overflow:hidden}
body.ln-viewer-present header,body.ln-viewer-present main > .card{display:none}
body.ln-viewer-present main{max-width:none;padding:0}
body.ln-viewer-present footer{display:none}
body.ln-viewer-present #stageWrap{position:fixed;inset:0;margin:0}
body.ln-viewer-present #stage{width:100%;height:100%;min-height:0;border:0;border-radius:0}
body.ln-viewer-present #presentExit{display:block}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node checker/app/test/viewer_present.test.js`
Expected: `VIEWER PRESENT OK`.

- [ ] **Step 5: Commit**

```bash
git add checker/app/viewer.html checker/app/test/viewer_present.test.js
git commit -m "fix(viewer): pin present iframe so the lesson nav bar cannot drift"
```

---

### Task 4: Skill documentation — title + calculation rules

**Files:**
- Modify: `v2/SKILL.md` (frontmatter, v2.16 paragraph, §2.0b, Part 4 brief template)
- Modify: `tests/test_skill_present.py`
- Test: `python -m pytest tests/test_skill_present.py -v`

**Interfaces:**
- Consumes: the final marker contract from Tasks 1-2.
- Produces: documented generation rules the section agents follow.

- [ ] **Step 1: Extend the test** — add to `tests/test_skill_present.py`:

```python
def test_skill_documents_title_marker():
    text = SKILL.read_text(encoding="utf-8")
    assert 'data-present="0"' in text


def test_skill_documents_calculation_rule():
    text = SKILL.read_text(encoding="utf-8")
    assert "Every calculation must be tagged" in text
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_skill_present.py -v`
Expected: `test_skill_documents_title_marker` FAILS.

- [ ] **Step 3: Update §2.0b** in `v2/SKILL.md` (currently lines 441-456). Replace its body with:

```markdown
### 2.0b Presentation tags (`data-present`)

Every teaching section (all except the canonical exempt ids `overview`,
`glossary`, `selfcheck` (also accept `self-check`), `assignment` (also accept
`assign`), and `recap`) marks the content a teacher would project with
`data-present="N"`. Two forms:

- `data-present="0"` on the section's direct-child `<h2>` — the **pinned section
  title**. It is shown as a sticky heading above the outline and is *not* a
  bullet; it does not count toward the depth sequence. Every teaching section must
  carry exactly one.
- `data-present="N"` (N ≥ 1) on content — the bullet depth (1 = the section's
  core concept/definition/formula, 2 = its key explanations/examples, 3+ = deeper
  support). The marker may sit on an inline `<span>`, a whole block (`.def`,
  `.mini`, `.card`, a table, a figure), or a component mount; a tagged element is
  kept whole, everything untagged hides in presentation mode.

**Every calculation must be tagged.** Tag each formula block (the `.def`/`.card`
carrying the formula and its `Where:` list) and each worked example (the
`Worked — <topic>` `.def` with numbered steps, and any tabular computation) at its
natural depth, so the arithmetic survives into the projected view.

`0` is only valid on the title `<h2>`. Depth may not skip a level; markers never
nest; the section root is never tagged. build.py fails a teaching section that
lacks its title marker or any content marker. See
`docs/superpowers/specs/2026-10-02-presentation-tags-v2.17-design.md`.
```

- [ ] **Step 4: Update the Part 4-C brief bullet** (currently lines 683-689). Replace the "Mark the section's presentable content" bullet with:

```markdown
- Mark the section's presentable content. Put data-present="0" on the section's
  <h2>. Tag every calculation at its natural depth: data-present="1" on the
  definition/formula (.def or .card), data-present="2" on each key explanation,
  worked example, and the anchor lab mount (use "1" for the lab only when it is
  the section's first content marker). Exempt sections (overview, glossary,
  selfcheck [also accept self-check], assignment [also accept assign], recap)
  need no markers. data-present="0" is valid only on the <h2>; depth never skips
  a level, markers never nest, and the section root is never tagged.
```

- [ ] **Step 5: Bump the version and add the changelog paragraph** in `v2/SKILL.md`. Change frontmatter `version: 2.16` to `version: 2.17`, change `# Interactive Lesson Notebook (v2.16 — ...)` to `(v2.17 — ...)`, and after the v2.16 paragraph (line 169) add:

```markdown
What v2.17 adds: **pinned titles + calculations in present mode**. Every teaching
section's `<h2>` carries `data-present="0"` — the shell pins it under the top
chrome while the outline scrolls beneath it. All formulas and worked examples
must now be tagged, so a projected lesson keeps its arithmetic. The HTML Viewer's
present mode pins the lesson iframe to the viewport and hides its footer, so the
lesson's navigation bar no longer drifts with the host page. See §2.0b.
```

- [ ] **Step 6: Run the test**

Run: `python -m pytest tests/test_skill_present.py -v`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add v2/SKILL.md tests/test_skill_present.py
git commit -m "docs(skill): v2.17 pinned titles + calculation tags"
```

---

### Task 5: Full verification

**Files:**
- No source changes; rebuild and run every gate.

- [ ] **Step 1: Rebuild the sample from the repo root**

Run: `python v2/build.py v2/sample/lesson-demo`
Expected: `OK - wrote …Week4-Demo-Notebook.html`.

- [ ] **Step 2: Run every present gate**

Run: `node v2/tools/present_smoke.js`
Run: `node v2/tools/layout_smoke.js Week4-Demo-Notebook.html --present`
Run: `node v2/tools/layout_smoke.js Week4-Demo-Notebook.html --present --width 390`
Run: `node checker/app/test/viewer_present.test.js`
Run: `python -m pytest tests/test_present_build.py tests/test_skill_present.py -v`
Expected: `SMOKE OK`, `LAYOUT OK` (×2), `VIEWER PRESENT OK`, all tests passed.

- [ ] **Step 3: Regression gate**

Run: `node v2/tools/assignment_smoke.js`
Run: `node v2/tools/activity_smoke.js`
Run: `python -m pytest tests -q`
Expected: all OK / no new failures.

- [ ] **Step 4: Manual QA** — open `Week4-Demo-Notebook.html` directly, click Present, scroll a long section: the title stays pinned below the top bar and only tagged content shows. Open it through `checker/app/viewer.html`, present, scroll: the lesson's bottom/next bar does not move, and `Exit presentation` stays reachable.

- [ ] **Step 5: Commit any QA fixes**

```bash
git add -A
git commit -m "test(present): v2.17 gates green; rebuild sample"
```

---

## Self-Review

- **Spec coverage:** §3 marker contract → Task 1 (build + sample + fixtures); §4 engine → Task 2; §5 viewer fix → Task 3; §6 build.py → Task 1; §7 tests → Tasks 1-3, 5; §8 skill rules → Task 4. All covered.
- **Placeholders:** none; every code/edit step is concrete.
- **Type consistency:** `data-present="0"` consistent across build.py, engine selector, sample, tests, docs; `--ln-pres-top` / `.ln-pres-title` consistent between shell CSS and JS.
