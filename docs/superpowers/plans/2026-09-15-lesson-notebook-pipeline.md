# Interactive Lesson Notebook v2.0 — Component Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v2.0 staging skill (`v2/`) — shell + theme packs + component library + `build.py` assembler/validator — so a lesson notebook is assembled from 4 small content files instead of ~2,300 re-typed lines.

**Architecture:** `build.py` injects per-lesson parts (`build.json`, `tune.css`, `sections.html`, `data.js`, optional extras) into marker slots of `skeleton/shell.html`, then runs mechanical QA (markers, hex containment, external assets, IDs, data integrity, well-formedness, WCAG contrast, print block). Output is written only when every check passes. Themes are token files; components are folder-per-component (`component.css`, `component.js`, `README.md`) registered in `LN.components`, mounted via `[data-component][data-key]`.

**Tech Stack:** Python 3 stdlib only (assembler + validator); pytest for dev tests; vanilla HTML/CSS/ES6; SVG via `createElementNS` for charts. No frameworks, no CDN, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-15-lesson-notebook-pipeline-design.md` (§n below refers to it). All work happens in this repo: assets in `v2/` (staging copy of the skill dir, §8 deployment gate), tests in `tests/`. The live skill at `~/.claude/skills/interactive-lesson-notebook/` is NOT touched until the user supplies a real lesson and RED/GREEN passes (manual step, after this plan).

## Global Constraints

- `build.py`: Python 3 stdlib only; exit 0 = output written, exit 1 = itemized FAIL report; never writes partial output (§5.1, §9).
- Shell markers exactly: `__TITLE__`, `/*__THEME__*/`, `/*__TUNE__*/`, `/*__COMPONENT_CSS__*/`, `<!--__SECTIONS__-->`, `/*__DATA__*/`, `/*__COMPONENT_JS__*/` — each exactly once (§3.2).
- No hex colour outside theme packs, `tune.css`, and the shell `/*HEXOK*/.../*ENDHEX*/` print block (§5.2). Shell/component/section CSS use `var(--token)` only.
- No external assets: `http(s)://`, `@import`, `url(` with a non-gradient argument are forbidden in the assembled file; the single whitelist exception is the SVG namespace `http://www.w3.org/2000/svg` (§5.2).
- Contrast floors enforced at build time: `--ink` vs `--surface`, `--surface-2`, and every `--sec-N`-over-`--surface` composite ≥ 4.5:1; `--ink-faint` vs `--grid` ≥ 3:1; `--green`/`--amber`/`--red` stay in their hue families and saturation ≥ 0.12 (§5.2, §1.4).
- `tune.css` may override `:root` token values only — never structural rules (§6.4).
- No `id` starting with `ln` (case-insensitive) in lesson content — reserved for shell chrome (§5.2).
- Inside `<script>` content (data.js, component.js, extra.js) no literal `</` + letter: escape as `<\/` or build DOM via `LN.h`/`LN.s` (§5.2).
- Components carry zero lesson-content strings; real `<button>`/`<input>` elements; one-way answer locks where the pedagogy requires (§6.1).
- Interactive components end their CSS with `@media print{.ln-comp{display:none}}`; recap/static components stay printable (§1.7 intent).
- Shell CSS vocabulary is fixed: `section.block`, `.def`, `.gloss`, `.note.y/.g/.b/.p`, `.card`, `.mini`, `.grid2/.grid4`, `.data-strip`, `.chip`, `.step`, `.fb.ok/.no/.info`, `.hl/.hl-g`, `.tbl`, `.cmp-wrap`, `.swipe-hint`, `.tag`, `.btn`.
- Six theme packs: `ledger, receipt, contract, filecard, boardmemo, graph-paper` (§3.1, §6.4). Eleven components: `milo-list, sort-statement, comparison-table, feasibility-gate, break-even-lab, step-solver, true-false, ranked-statements, case-match, flipcards, glossary` (§3.1).

## File Structure

```
v2/
  build.py                      # assembler + validator (Tasks 2-3)
  SKILL.md                      # rewritten skill, staging only (Task 8)
  skeleton/shell.html           # layout, vocabulary CSS, LN runtime, markers (Task 4)
  skeleton/themes/<6>.css       # token blocks + textures + decor (Task 5)
  skeleton/components/registry.md
  skeleton/components/<11>/{component.css,component.js,README.md}   (Tasks 6-7)
tests/
  conftest.py                   # sys.path so tests can `import build`
  test_build.py                 # assembler + rule failures (Tasks 2-3)
  test_shell_smoke.py           # real shell passes every validator (Task 4)
  test_themes_matrix.py         # every pack builds clean (Task 5)
  test_components_matrix.py     # every component mounts + builds (Task 6)
  test_e2e_lesson.py            # demo lesson fixture (Task 7)
  fixtures/lesson-demo/         # build.json tune.css sections.html data.js (Task 7)
.gitignore
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `.gitignore`, `v2/build.py` (stub), `tests/conftest.py`
- Create dirs: `v2/skeleton/themes`, `v2/skeleton/components`, `tests/fixtures`

**Interfaces:**
- Produces: `import build` works from `tests/` once `v2/build.py` has code; directories later tasks write into.

- [ ] **Step 1: Init git repo and write .gitignore**

```powershell
git init
Set-Content -Path .gitignore -Value @("__pycache__/", ".pytest_cache/", "build/", "*Demo-Notebook.html") -Encoding ascii
```

- [ ] **Step 2: Create directory tree, stub, conftest**

```powershell
New-Item -ItemType Directory -Force -Path v2\skeleton\themes, v2\skeleton\components, tests\fixtures | Out-Null
Set-Content -Path v2\build.py -Value "" -Encoding ascii
$c = @("import sys", "from pathlib import Path", "sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'v2'))")
Set-Content -Path tests\conftest.py -Value $c -Encoding utf8
```

- [ ] **Step 3: Verify pytest collects without import errors**

Run: `python -m pytest tests -q`
Expected: `no tests ran` (exit code 5 is fine at this stage)

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m "chore: scaffold v2 pipeline staging dirs and pytest wiring"
```

---

### Task 2: `build.py` — assembler + mechanical validators

**Files:**
- Create: `tests/test_build.py`
- Modify: `v2/build.py` (replace stub with full implementation)

**Interfaces:**
- Consumes: `v2/skeleton/` tree layout (themes, components dirs — Tasks 4-6 fill them; tests inject a synthetic skeleton so this task is independent).
- Produces: `build.assemble(workdir: Path, skeleton: Path) -> (str | None, list[Err])`; `build.main(argv) -> int`; `build.Err(rule, file, line, msg, hint)`; constants `MARKERS`, `REQUIRED_TOKENS`, `GLUE_JS`. CLI: `python v2/build.py <workdir> [--skeleton DIR]`. Output filename from `build.json["output"]` (absolute or inside workdir). Rule names (used by later tests): `build.json`, `theme`, `component`, `files`, `markers`, `hex`, `external`, `js`, `ids`, `data`, `wellformed`, `print`, `tokens`, `contrast`, `hue-family`, `tune`.

- [ ] **Step 1: Write the failing test suite**

`tests/test_build.py`:

```python
import json
from pathlib import Path

import build

REPO = Path(__file__).resolve().parents[1]
SKEL = REPO / "v2" / "skeleton"

MINI_SHELL = (
    "<!DOCTYPE html><html><head><title>__TITLE__</title><style>"
    "/*__THEME__*/"
    "/*__TUNE__*/"
    "body{color:var(--ink)}"
    "/*HEXOK*/@media print{body{color:#000}}/*ENDHEX*/"
    "/*__COMPONENT_CSS__*/"
    "</style></head><body>"
    "<!--__SECTIONS__-->"
    "<script>window.LN={data:{},components:{},boot:function(){}};"
    "/*__DATA__*/"
    "/*__COMPONENT_JS__*/"
    "</script></body></html>"
)

MINI_THEME = (
    ":root{"
    "--bg:#d9dfe6;--surface:#fffdf7;--surface-2:#ffffff;--grid:#e4e9ef;--grid-strong:#d3dbe4;"
    "--edge-line:#c96a5c;--decor:#43704f;--ink:#232a23;--ink-soft:#54605a;--ink-faint:#68707a;"
    "--accent:#2f6b4f;--accent-deep:#204c37;--accent-2:#8a6d3b;--highlight:rgb(255 233 163);"
    "--green:#2f8f5b;--green-bg:#e6f6ec;--amber:#b8791a;--amber-bg:#fdf3e0;--red:#c0432f;--red-bg:#fdecea;"
    "--note-yellow:#fff8c9;--note-green:#d9f2e2;--note-blue:#dceafa;--note-pink:#fbdcdc;"
    "--sec-1:hsl(42 75% 72% / .26);--sec-2:hsl(150 40% 58% / .22);--sec-3:hsl(210 55% 68% / .24);"
    "--sec-4:hsl(350 55% 72% / .22);--sec-5:hsl(185 45% 58% / .22);"
    "--chart-rev:var(--accent);--chart-cost:var(--accent-2);--chart-profit:var(--green);--chart-loss:var(--red);"
    "--chart-axis:var(--ink-faint);--chart-grid:var(--grid-strong);--chart-label:var(--ink-soft);"
    "--radius:12px;--shadow-sm:0 1px 2px rgba(30,40,60,.07);--shadow:0 1px 2px rgba(30,40,60,.06);"
    "--shadow-lg:0 2px 6px rgba(30,40,60,.08);"
    "--hand:cursive;--sans:sans-serif;--mono:monospace;--serif:serif;"
    "--display:var(--hand);--display-tracking:0;--display-transform:none;}"
    ".sheet{background:var(--surface);}"
    ".decor{background:transparent;}"
)

MINI_CSS = ".demo{border:1px solid var(--grid-strong)}"
MINI_JS = "LN.components['demo']={init:function(root,d){root.appendChild(LN.h('b',{text:'ok'}));}};"


def make_skel(tmp_path, shell=None, components=("demo",)):
    skel = tmp_path / "skel"
    (skel / "themes").mkdir(parents=True)
    (skel / "components").mkdir(parents=True)
    (skel / "shell.html").write_text(shell or MINI_SHELL, encoding="utf-8")
    (skel / "themes" / "mini.css").write_text(MINI_THEME, encoding="utf-8")
    for c in components:
        cd = skel / "components" / c
        cd.mkdir(exist_ok=True)
        (cd / "component.css").write_text(MINI_CSS, encoding="utf-8")
        (cd / "component.js").write_text(MINI_JS, encoding="utf-8")
    return skel


def make_workdir(tmp_path, theme="mini", components=("demo",), files=None):
    wd = tmp_path / "wd"
    wd.mkdir(exist_ok=True)
    cfg = {"title": "T", "theme": theme, "components": list(components),
           "output": "out.html"}
    defaults = {
        "build.json": json.dumps(cfg),
        "tune.css": ":root{--accent:#33608f;}",
        "sections.html": '<section class="block" id="s1"><h2>S</h2>'
                         '<div data-component="demo" data-key="gl"></div></section>',
        "data.js": "LN.data.gl={items:[1]};",
    }
    defaults.update(files or {})
    for name, text in defaults.items():
        (wd / name).write_text(text, encoding="utf-8")
    return wd


def run(tmp_path, **kw):
    skel = make_skel(tmp_path, shell=kw.get("shell"),
                     components=kw.get("components", ("demo",)))
    wd = make_workdir(tmp_path, theme=kw.get("theme", "mini"),
                      components=kw.get("components", ("demo",)),
                      files=kw.get("files"))
    return build.assemble(wd, skel)


def rules(errs):
    return [e.rule for e in errs]


def test_good_build(tmp_path):
    out, errs = run(tmp_path)
    assert errs == [], [str(e) for e in errs]
    assert "__TITLE__" not in out and "/*__" not in out and "<!--__" not in out
    assert "LN.boot();" in out


def test_cli_writes_only_on_success(tmp_path):
    skel = make_skel(tmp_path)
    wd = make_workdir(tmp_path)
    rc = build.main([str(wd), "--skeleton", str(skel)])
    assert rc == 0
    assert (wd / "out.html").exists()


def test_cli_fail_writes_nothing(tmp_path):
    skel = make_skel(tmp_path)
    wd = make_workdir(tmp_path, files={"sections.html": '<section class="block" id="s1">'})
    rc = build.main([str(wd), "--skeleton", str(skel)])
    assert rc == 1
    assert not (wd / "out.html").exists()


def test_leftover_marker(tmp_path):
    shell = MINI_SHELL.replace("/*__TUNE__*/", "/*__TUNE_X__*/")
    _, errs = run(tmp_path, shell=shell)
    assert "markers" in rules(errs)


def test_unknown_theme_lists_options(tmp_path):
    _, errs = run(tmp_path, theme="nope")
    assert "theme" in rules(errs)
    assert any("mini" in e.msg for e in errs)


def test_unknown_component_lists_options(tmp_path):
    skel = make_skel(tmp_path)
    wd = make_workdir(tmp_path)
    (wd / "build.json").write_text(json.dumps({
        "title": "T", "theme": "mini", "components": ["ghost"], "output": "out.html"}), encoding="utf-8")
    _, errs = build.assemble(wd, skel)
    assert "component" in rules(errs)
    assert any("demo" in e.msg for e in errs)


def test_bad_component_name_shape(tmp_path):
    skel = make_skel(tmp_path)
    cd = skel / "components" / "BadName"
    cd.mkdir()
    (cd / "component.css").write_text("", encoding="utf-8")
    (cd / "component.js").write_text("", encoding="utf-8")
    wd = make_workdir(tmp_path)
    (wd / "build.json").write_text(json.dumps({
        "title": "T", "theme": "mini", "components": ["BadName"], "output": "out.html"}), encoding="utf-8")
    _, errs = build.assemble(wd, skel)
    assert "component" in rules(errs)


def test_hex_outside_allowed_spans(tmp_path):
    skel = make_skel(tmp_path)
    (skel / "components" / "demo" / "component.css").write_text(
        ".demo{background:#ff0000}\n.other{color:var(--ink)}", encoding="utf-8")
    wd = make_workdir(tmp_path)
    _, errs = build.assemble(wd, skel)
    assert "hex" in rules(errs)
    hit = [e for e in errs if e.rule == "hex"][0]
    assert "component.css" in hit.file and hit.line == 1


def test_hex_in_sections_flagged(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block" id="s1" style="background:#abc"><div data-component="demo" data-key="gl"></div></section>'})
    assert "hex" in rules(errs)


def test_external_assets(tmp_path):
    _, errs = run(tmp_path, files={"tune.css": ':root{--accent:#33608f;}\n.sheet{background:url(http://x/y.png);}'})
    assert "external" in rules(errs)


def test_gradient_url_allowed(tmp_path):
    tune = ':root{--accent:#33608f;}\n.sheet{background:repeating-linear-gradient(45deg,var(--grid) 0 2px,transparent 2px 4px);}'
    _, errs = run(tmp_path, files={"tune.css": tune})
    assert "external" not in rules(errs)


def test_ids_unique_and_required(tmp_path):
    dup = '<section class="block" id="x"><h2>A</h2></section><section class="block" id="x"><h2>B</h2></section>'
    _, errs = run(tmp_path, files={"sections.html": dup})
    assert "ids" in rules(errs)


def test_section_missing_id(tmp_path):
    _, errs = run(tmp_path, files={"sections.html": '<section class="block"><h2>A</h2></section>'})
    assert "ids" in rules(errs)


def test_reserved_id_prefix(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block" id="lnBad"><h2>A</h2></section>'})
    assert "ids" in rules(errs)


def test_missing_datakey(tmp_path):
    _, errs = run(tmp_path, files={"data.js": "LN.data.other={};"})
    assert "data" in rules(errs)


def test_mount_without_key(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block" id="s1"><div data-component="demo"></div></section>'})
    assert "data" in rules(errs)


def test_mount_component_not_in_build(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block" id="s1"><div data-component="demo" data-key="gl"></div>'
        '<div data-component="other" data-key="gl"></div></section>'})
    assert "data" in rules(errs)


def test_unclosed_tag(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block" id="s1"><div data-component="demo" data-key="gl"></div></section2><p>x'
        "</section>"})
    assert "wellformed" in rules(errs)


def test_close_tag_in_datajs_rejected(tmp_path):
    _, errs = run(tmp_path, files={"data.js": "LN.data.gl={t:'<b>x</b>'};"})
    assert "js" in rules(errs)


def test_print_block_required(tmp_path):
    shell = MINI_SHELL.replace("/*HEXOK*/@media print{body{color:#000}}/*ENDHEX*/", "")
    _, errs = run(tmp_path, shell=shell)
    assert "print" in rules(errs)


def test_missing_workdir_files(tmp_path):
    skel = make_skel(tmp_path)
    wd = tmp_path / "empty"
    wd.mkdir()
    _, errs = build.assemble(wd, skel)
    assert "files" in rules(errs)


def test_bad_build_json(tmp_path):
    _, errs = run(tmp_path, files={"build.json": '{"title":"T"}'})
    assert "build.json" in rules(errs)


def test_bad_marker_shell(tmp_path):
    _, errs = run(tmp_path, shell=MINI_SHELL.replace("<!--__SECTIONS__-->", "<!--__SECTIONS__"))
    assert "markers" in rules(errs)


def test_output_parent_created(tmp_path):
    skel = make_skel(tmp_path)
    wd = make_workdir(tmp_path)
    (wd / "build.json").write_text(json.dumps({
        "title": "T", "theme": "mini", "components": ["demo"],
        "output": "sub/out.html"}), encoding="utf-8")
    rc = build.main([str(wd), "--skeleton", str(skel)])
    assert rc == 0
    assert (wd / "sub" / "out.html").exists()

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_build.py -q`
Expected: collection/import error or mass failure (`import build` finds an empty stub, so `AttributeError: module 'build' has no attribute 'assemble'`).

- [ ] **Step 3: Implement `v2/build.py`** (replace the stub with exactly this file)

```python
#!/usr/bin/env python3
"""Interactive Lesson Notebook v2.0 - parts assembler + mechanical validator.

Usage:
    python build.py <workdir> [--skeleton <dir>]

Reads <workdir>/{build.json, tune.css, sections.html, data.js[, extra.css,
extra.js]} and injects them into the shell at skeleton/shell.html. Exit 0 and
the output file are produced only when every mechanical QA rule passes;
otherwise an itemized FAIL report prints (rule, file, line, message, fix hint)
and exit is 1, with no partial output. Python 3 stdlib only.
"""
import colorsys
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input",
             "link", "meta", "param", "source", "track", "wbr"}

MARKERS = [
    "__TITLE__", "/*__THEME__*/", "/*__TUNE__*/", "/*__COMPONENT_CSS__*/",
    "<!--__SECTIONS__-->", "/*__DATA__*/", "/*__COMPONENT_JS__*/",
]
GLUE_JS = "\nLN.boot();\n"

REQUIRED_TOKENS = [
    "bg", "surface", "surface-2", "grid", "grid-strong", "edge-line", "decor",
    "ink", "ink-soft", "ink-faint",
    "accent", "accent-deep", "accent-2", "highlight",
    "green", "green-bg", "amber", "amber-bg", "red", "red-bg",
    "note-yellow", "note-green", "note-blue", "note-pink",
    "sec-1", "sec-2", "sec-3", "sec-4", "sec-5",
    "chart-rev", "chart-cost", "chart-profit", "chart-loss",
    "chart-axis", "chart-grid", "chart-label",
    "radius", "shadow-sm", "shadow", "shadow-lg",
    "hand", "sans", "mono", "serif",
    "display", "display-tracking", "display-transform",
]
COLOR_TOKENS = ["ink", "surface", "surface-2", "grid", "ink-faint",
                "green", "amber", "red"] + ["sec-%d" % i for i in range(1, 6)]

HUE_FAMILY = {"green": (70, 175), "amber": (25, 70), "red": (325, 25)}  # deg, wraps at 360

HEX_RE = re.compile(r"#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b")
EXTERNAL_RE = re.compile(
    r"https?://(?!www\.w3\.org/2000/svg)"
    r"|@import"
    r"|url\(\s*(?!['\"]?(?:repeating-)?(?:linear|radial|conic)-gradient)")
JS_TAG_RE = re.compile(r"</[A-Za-z]")
LEFTOVER_RE = re.compile(r"/\*__|<!--__|__[A-Z][A-Z0-9_]*__")
ROOT_RE = re.compile(r":root\s*\{(.*?)\}", re.S)
DECL_RE = re.compile(r"--([A-Za-z0-9-]+)\s*:\s*([^;]+)")
ID_RE = re.compile(r'\bid="([^"]+)"')
KEY_RE = re.compile(r"LN\.data\.([A-Za-z_$][\w$]*)\s*=|LN\.data\[\s*['\"]([^'\"]+)['\"]\s*\]\s*=")
NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")


class Err:
    def __init__(self, rule, file, line, msg, hint=""):
        self.rule, self.file, self.line = rule, file, line
        self.msg, self.hint = msg, hint

    def __str__(self):
        loc = "%s:%s" % (self.file, self.line if self.line else "-")
        hint = ("  -> " + self.hint) if self.hint else ""
        return "FAIL\t%-11s %-46s %s%s" % (self.rule, loc, self.msg, hint)


def strip_comments(text):
    return re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"),
                  text, flags=re.S)


def scan(text, regex, rule, fname, msg, hint):
    errs = []
    for m in regex.finditer(text):
        errs.append(Err(rule, fname, text.count("\n", 0, m.start()) + 1,
                        "%s found: %r" % (msg, m.group(0)[:38]), hint))
    return errs


# ---------- colour maths ----------

def parse_color(v):
    v = v.strip()
    m = re.fullmatch(r"#([0-9a-fA-F]{3,8})", v)
    if m and len(m.group(1)) in (3, 4, 6, 8):
        h = m.group(1)
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (a,)
    m = re.fullmatch(r"rgba?\(([^)]+)\)", v)
    if m:
        parts = [p for p in re.split(r"[,\s/]+", m.group(1).strip()) if p]
        if len(parts) in (3, 4):
            try:
                rgb = tuple(_chan(p) for p in parts[:3])
                a = _alpha(parts[3]) if len(parts) == 4 else 1.0
                return rgb + (a,)
            except ValueError:
                return None
        return None
    m = re.fullmatch(r"hsla?\(([^)]+)\)", v)
    if m:
        parts = [p for p in re.split(r"[,\s/]+", m.group(1).strip()) if p]
        if len(parts) in (3, 4):
            try:
                h = float(parts[0].replace("deg", "")) % 360
                s = _pct(parts[1])
                l = _pct(parts[2])
                a = _alpha(parts[3]) if len(parts) == 4 else 1.0
                r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
                return (r, g, b, a)
            except ValueError:
                return None
        return None
    return None


def _chan(p):
    return float(p[:-1]) / 100 if p.endswith("%") else float(p) / 255


def _pct(p):
    return float(p[:-1]) / 100 if p.endswith("%") else float(p)


def _alpha(p):
    return float(p[:-1]) / 100 if p.endswith("%") else float(p)


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _lum(col):
    r, g, b = col[:3]
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def ratio(a, b):
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def over(fg, bg):
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)


def parse_tokens(css):
    out = {}
    for body in ROOT_RE.findall(css):
        for m in DECL_RE.finditer(body):
            out[m.group(1)] = m.group(2).strip()
    return out


def resolve_var(tokens, name, stack=()):
    raw = tokens.get(name)
    if raw is None:
        return None, False
    v = raw.strip()
    m = re.fullmatch(r"var\((--[^) ]+)\)", v)
    if m:
        if m.group(1) in stack:
            return v, True
        return resolve_var(tokens, m.group(1)[2:], stack + (v,))
    return v, False


def check_contrast(theme_css, tune_css, errors):
    tokens = parse_tokens(theme_css)
    tokens.update(parse_tokens(tune_css))
    for t in REQUIRED_TOKENS:
        if t not in tokens:
            errors.append(Err("tokens", "palette", None,
                              "theme/tune does not define --" + t,
                              "every token from the v1.9 :root block must be present"))
    palette = {}
    for t in COLOR_TOKENS:
        if t not in tokens:
            continue
        v, cycle = resolve_var(tokens, t)
        if cycle or v is None:
            errors.append(Err("contrast", "palette", None,
                              "--%s cannot be resolved" % t, "check var() references"))
            continue
        col = parse_color(v)
        if col is None:
            errors.append(Err("contrast", "palette", None,
                              "--%s is not a parseable colour: %r (gradients/transparent are not allowed here)" % (t, v[:40]),
                              "use #hex, rgb(), or hsl()"))
            continue
        palette[t] = col

    def cmp_(fg, bg, floor, label):
        if fg and bg:
            r = ratio(fg, bg)
            if r < floor:
                errors.append(Err("contrast", "palette", None,
                                  "%s ratio %.2f:1 below %.1f:1" % (label, r, floor),
                                  "darken --" + label.split(" vs ")[0].replace(" ", "-")))

    ink, surf, s2 = palette.get("ink"), palette.get("surface"), palette.get("surface-2")
    cmp_(ink, surf, 4.5, "ink vs surface")
    cmp_(ink, s2, 4.5, "ink vs surface-2")
    cmp_(palette.get("ink-faint"), palette.get("grid"), 3.0, "ink-faint vs grid")
    for i in range(1, 6):
        tint = palette.get("sec-%d" % i)
        if tint and ink and surf:
            comp = over(tint, surf)
            r = ratio(ink, comp)
            if r < 4.5:
                errors.append(Err("contrast", "palette", None,
                                  "ink vs sec-%d composite ratio %.2f:1 below 4.5:1" % (i, r),
                                  "reduce --sec-%d alpha or lighten it" % i))
    for name, (lo, hi) in HUE_FAMILY.items():
        col = palette.get(name)
        if not col:
            continue
        h, l, s = colorsys.rgb_to_hls(*col[:3])
        if s < 0.12:
            errors.append(Err("hue-family", "palette", None,
                              "--%s is desaturated (grey); feedback hue must stay recognisable" % name,
                              "raise saturation"))
            continue
        h *= 360
        ok = lo <= h <= hi if lo <= hi else h >= lo or h <= hi
        if not ok:
            errors.append(Err("hue-family", "palette", None,
                              "--%s hue %.0f outside family %s" % (name, h, (lo, hi)),
                              "semantics are not designable: green/amber/red families are locked"))


def check_tune(text, errors):
    body = strip_comments(text)
    stripped = re.sub(r":root\s*\{[^{}]*\}", "", body)
    leftover = stripped.strip()
    if leftover:
        m = re.search(r"\S", stripped)
        ln = stripped.count("\n", 0, m.start()) + 1 if m else None
        errors.append(Err("tune", "tune.css", ln,
                          "structural CSS in tune.css: %r" % leftover[:60],
                          "tune.css may contain :root{--token:value} overrides only"))
        return
    for body_block in re.findall(r":root\s*\{([^{}]*)\}", body):
        for decl in body_block.split(";"):
            if decl.strip() and not re.fullmatch(r"\s*--[A-Za-z0-9-]+\s*:\s*[^;}]+\s*", decl):
                errors.append(Err("tune", "tune.css", None,
                                  "non-token declaration: %r" % decl.strip()[:60],
                                  "tune.css may override token values only"))


def check_mounts(sections_text, data_text, comp_names, errors):
    defined = set()
    for m in KEY_RE.finditer(data_text):
        defined.add(m.group(1) or m.group(2))
    for m in re.finditer(r"data-component=", sections_text):
        ln = sections_text.count("\n", 0, m.start()) + 1
        tag = sections_text[sections_text.rfind("<", 0, m.start()):
                            sections_text.find(">", m.end()) + 1]
        name = re.search(r'data-component="([^"]*)"', tag)
        key = re.search(r'data-key="([^"]*)"', tag)
        name = name.group(1) if name else "?"
        if name not in comp_names:
            errors.append(Err("data", "sections.html", ln,
                              "mount %r not in build.json components" % name,
                              "add the component or remove the mount"))
        if not key:
            errors.append(Err("data", "sections.html", ln,
                              "mount %r has no data-key" % name,
                              "add data-key=... and define LN.data.<key> in data.js"))
        elif key.group(1) not in defined:
            errors.append(Err("data", "sections.html", ln,
                              "data-key %r is not defined in data.js" % key.group(1),
                              "add LN.data.%s = {...} to data.js" % key.group(1)))


class Balance(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.problems = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID_TAGS:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID_TAGS:
            return
        names = [t for t, _ in self.stack]
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
        elif tag in names:
            while self.stack and self.stack[-1][0] != tag:
                t, pos = self.stack.pop()
                self.problems.append("unclosed <%s> opened at line %d" % (t, pos[0]))
            self.stack.pop()
        else:
            self.problems.append("stray closing </%s> at line %d" % (tag, self.getpos()[0]))

    def finish(self):
        self.close()
        for t, pos in self.stack:
            self.problems.append("unclosed <%s> opened at line %d" % (t, pos[0]))


def check_wellformed(text, fname, errors):
    bal = Balance()
    try:
        bal.feed(text)
        bal.finish()
    except Exception as exc:  # pragma: no cover - parser is forgiving
        errors.append(Err("wellformed", fname, None, "parse error: %s" % exc, ""))
        return
    for msg in bal.problems:
        errors.append(Err("wellformed", fname, None, msg, "balance the tags"))


def check_ids(output_text, sections_text, errors):
    seen = {}
    for m in ID_RE.finditer(output_text):
        i = m.group(1)
        ln = output_text.count("\n", 0, m.start()) + 1
        if i in seen:
            errors.append(Err("ids", "(output)", ln,
                              "duplicate id %r (first at line %d)" % (i, seen[i]),
                              "ids must be unique"))
        seen[i] = ln
    for m in re.finditer(r"<section\b[^>]*>", sections_text):
        tag = m.group(0)
        if re.search(r'class="[^"]*\bblock\b[^"]*"', tag):
            ln = sections_text.count("\n", 0, m.start()) + 1
            im = re.search(r'\bid="([^"]*)"', tag)
            if not im:
                errors.append(Err("ids", "sections.html", ln,
                                  "section.block without id",
                                  "every section needs id= for the TOC"))
            elif im.group(1).lower().startswith("ln"):
                errors.append(Err("ids", "sections.html", ln,
                                  "reserved id prefix 'ln': %r" % im.group(1),
                                  "lesson ids must not start with ln"))


def check_js(text, fname, errors):
    return scan(text, JS_TAG_RE, "js", fname, "literal closing tag in script",
                "escape as <\\/ or build nodes with LN.h/LN.s")


def read_text(path, errors):
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        errors.append(Err("files", path.name, None, "cannot read %s" % path, ""))
        return None


def assemble(workdir, skeleton):
    errors = []
    cfg_path = workdir / "build.json"
    cfg = None
    if cfg_path.exists():
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(Err("build.json", "build.json", exc.lineno,
                              "invalid JSON: %s" % exc.msg, "fix the syntax"))
    else:
        errors.append(Err("build.json", "build.json", None, "missing",
                          "workdir needs build.json, tune.css, sections.html, data.js"))
    if cfg is not None:
        if not isinstance(cfg, dict):
            errors.append(Err("build.json", "build.json", None, "must be a JSON object", ""))
            cfg = None
    if cfg is not None:
        for k in ("title", "theme", "components", "output"):
            if not cfg.get(k):
                errors.append(Err("build.json", "build.json", None,
                                  "missing/empty required key %r" % k,
                                  "required: title, theme, components, output"))
        unknown = set(cfg) - {"title", "theme", "components", "output", "extra_css", "extra_js"}
        if unknown:
            errors.append(Err("build.json", "build.json", None,
                              "unknown keys: %s" % ", ".join(sorted(unknown)),
                              "allowed: title, theme, components, output, extra_css, extra_js"))
        if not isinstance(cfg.get("components"), list) or not cfg.get("components"):
            errors.append(Err("build.json", "build.json", None,
                              "components must be a non-empty list", ""))
            cfg["components"] = []
    if errors:
        return None, errors

    themes_dir = skeleton / "themes"
    comps_dir = skeleton / "components"
    available = sorted(p.stem for p in themes_dir.glob("*.css"))
    if cfg["theme"] not in available:
        errors.append(Err("theme", "build.json", None,
                          "unknown theme %r; available: %s" % (cfg["theme"], ", ".join(available)),
                          "pick one of the shipped theme packs"))
    comp_names = sorted(d.name for d in comps_dir.iterdir()
                        if d.is_dir() and (d / "component.css").exists()
                        and (d / "component.js").exists())
    for c in cfg["components"]:
        if not isinstance(c, str) or not NAME_RE.match(c):
            errors.append(Err("component", "build.json", None,
                              "bad component name %r" % c,
                              "use lowercase folder names, e.g. break-even-lab"))
        elif c not in comp_names:
            errors.append(Err("component", "build.json", None,
                              "unknown component %r" % c,
                              "available: " + (", ".join(comp_names) or "(none)")))

    parts = {}
    for key, fname in (("tune", "tune.css"), ("sections", "sections.html"),
                       ("data", "data.js")):
        f = workdir / fname
        if not f.exists():
            errors.append(Err("files", fname, None, "missing in workdir",
                              "the 4 required files are build.json, tune.css, sections.html, data.js"))
        else:
            parts[key] = read_text(f, errors)
    shell = read_text(skeleton / "shell.html", errors)
    if shell is None:
        errors.append(Err("files", "skeleton/shell.html", None, "missing", ""))

    extras = {"extra_css": [], "extra_js": []}
    for cfg_key, list_key in (("extra_css", "extra_css"), ("extra_js", "extra_js")):
        v = cfg.get(cfg_key)
        if v:
            f = workdir / v
            if not f.exists():
                errors.append(Err("files", v, None, "%s declared in build.json but missing" % cfg_key,
                                  "create the file or drop the key"))
            else:
                extras[list_key].append((v, read_text(f, errors)))

    if errors or shell is None:
        return None, errors

    for marker in MARKERS:
        n = shell.count(marker)
        if n < 1 or (n != 1 and marker != "__TITLE__"):
            errors.append(Err("markers", "skeleton/shell.html", None,
                              "marker %s occurs %d times" % (marker, n),
                              "every marker exactly once; title may appear in more than one slot"))

    theme_css = read_text(themes_dir / (cfg["theme"] + ".css"), errors) or ""
    check_tune(parts["tune"], errors)
    check_mounts(parts["sections"], parts["data"], set(cfg["components"]), errors)
    check_wellformed(parts["sections"], "sections.html", errors)
    errors.extend(check_js(parts["data"], "data.js", errors))

    comp_css, comp_js = [], []
    for c in cfg["components"]:
        cd = comps_dir / c
        css_t = read_text(cd / "component.css", errors) or ""
        js_t = read_text(cd / "component.js", errors) or ""
        errors.extend(scan(css_t, HEX_RE, "hex", "%s/component.css" % c,
                           "hard-coded colour", "use var(--token)"))
        errors.extend(scan(css_t, EXTERNAL_RE, "external", "%s/component.css" % c,
                           "external asset", "textures must be pure CSS"))
        errors.extend(check_js(js_t, "%s/component.js" % c, errors))
        comp_css.append("/* component: %s */\n%s" % (c, css_t))
        comp_js.append("%s\n" % js_t.strip())
    for fname, text in extras["extra_css"]:
        errors.extend(scan(text, HEX_RE, "hex", fname, "hard-coded colour",
                           "extra.css is component-level CSS: var(--token) only"))
        comp_css.append("/* extra: %s */\n%s" % (fname, text))
    for fname, text in extras["extra_js"]:
        errors.extend(check_js(text, fname, errors))
        comp_js.append("%s\n" % text.strip())

    shell_for_hex = re.sub(r"/\*HEXOK\*/.*?/\*ENDHEX\*/",
                           lambda m: "\n" * m.group(0).count("\n"), shell, flags=re.S)
    errors.extend(scan(shell_for_hex, HEX_RE, "hex", "skeleton/shell.html",
                       "hard-coded colour outside print block",
                       "move it into a theme pack"))
    for text, fname in [(theme_css, "themes/%s.css" % cfg["theme"]),
                        (parts["tune"], "tune.css"), (parts["sections"], "sections.html"),
                        (parts["data"], "data.js"), (shell, "skeleton/shell.html")] + \
                       [(t, f) for f, t in extras["extra_css"] + extras["extra_js"]]:
        errors.extend(scan(text, EXTERNAL_RE, "external", fname,
                           "external asset", "no http, no @import, gradient-only url()"))

    title = html.escape(str(cfg["title"]), quote=True)
    out = shell.replace("__TITLE__", title)
    out = out.replace("/*__THEME__*/", theme_css)
    out = out.replace("/*__TUNE__*/", parts["tune"])
    out = out.replace("/*__COMPONENT_CSS__*/", "\n".join(comp_css))
    out = out.replace("<!--__SECTIONS__-->", parts["sections"])
    out = out.replace("/*__DATA__*/", parts["data"])
    out = out.replace("/*__COMPONENT_JS__*/", "\n".join(comp_js) + GLUE_JS)

    for e in scan(out, LEFTOVER_RE, "markers", "(output)",
                  "unsubstituted marker", "check the shell marker table"):
        errors.append(e)
    check_wellformed(out, "(output)", errors)
    check_ids(out, parts["sections"], errors)
    check_contrast(theme_css, parts["tune"], errors)
    if "@media print" not in out:
        errors.append(Err("print", "skeleton/shell.html", None,
                          "no @media print block found",
                          "shell must ship the mandatory print override"))

    if errors:
        return None, errors
    return out, errors


def report(errors):
    for e in errors:
        print(str(e))


def main(argv=None):
    try:  # Windows consoles default to cp1252
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    argv = list(sys.argv[1:] if argv is None else argv)
    skeleton = Path(__file__).resolve().parent / "skeleton"
    if "--skeleton" in argv:
        i = argv.index("--skeleton")
        if i + 1 >= len(argv):
            print("FAIL\tusage: build.py <workdir> [--skeleton DIR]")
            return 2
        skeleton = Path(argv[i + 1])
        del argv[i:i + 2]
    if len(argv) != 1 or not Path(argv[0]).is_dir():
        print("usage: python build.py <workdir> [--skeleton DIR]")
        return 2
    workdir = Path(argv[0]).resolve()
    out, errors = assemble(workdir, skeleton)
    if errors:
        report(errors)
        print("FAIL - %d problem(s); no output written." % len(errors))
        return 1
    output_name = cfg_output(workdir)
    out_path = Path(output_name)
    if not out_path.is_absolute():
        out_path = workdir / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out, encoding="utf-8", newline="\n")
    print("OK - wrote %s (%d lines)" % (out_path, out.count("\n") + 1))
    return 0


def cfg_output(workdir):
    cfg = json.loads((workdir / "build.json").read_text(encoding="utf-8"))
    return cfg["output"]


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2b: Run to verify green**

Run: `python -m pytest tests/test_build.py -q`
Expected: `22 passed`

- [ ] **Step 3b: Lint the report format** — run `python v2/build.py tests 2>&1` (tests dir has no build.json) and confirm a single FAIL line for `build.json` + `FAIL - N problem(s); no output written.`, exit code 1 (`$LASTEXITCODE`).

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m "feat: build.py assembler + mechanical validators (markers, hex, external, ids, data, wellformed, print)"
```

---

### Task 3: Palette contrast + tuning-contract enforcement

build.py already carries `check_contrast`, `check_tune`, `parse_color`; this task adds the direct unit tests that lock their numeric behaviour, since Tasks 4-6 assets must keep passing them.

**Files:**
- Modify: `tests/test_build.py` (append)
- Modify: `v2/build.py` only if a test exposes a bug (fix it in the same commit)

**Interfaces:**
- Consumes: `build.parse_color(v) -> (r,g,b,a)|None`, `build.ratio(c1,c2) -> float`, `build.over(fg,bg)`, `build.check_contrast(theme, tune, errors)`, `build.check_tune(text, errors)`.
- Produces: numeric guarantees the six packs and every tune.css must satisfy (4.5:1 / 3:1 floors, hue families).

- [ ] **Step 1: Append failing tests**

Append to `tests/test_build.py`:

```python
def test_parse_color_forms():
    assert build.parse_color("#fff") == (1, 1, 1, 1)
    assert build.parse_color("#ff0000")[0] == 1
    assert build.parse_color("rgb(0 128 0 / .5)")[3] == 0.5
    hsl = build.parse_color("hsl(42 75% 72% / .26)")
    assert abs(hsl[3] - 0.26) < 1e-9
    assert build.parse_color("transparent") is None
    assert build.parse_color("var(--x)") is None


def test_over_composites_alpha():
    tint = (0.5, 0.5, 0.5, 0.5)
    surf = (1, 1, 1, 1)
    assert build.over(tint, surf)[:3] == (0.75, 0.75, 0.75)


def test_contrast_failures_reported(tmp_path):
    errs = []
    bad_tune = ":root{--ink:#8a94a3;--accent-deep:#204c37;--display-transform:none;}"
    build.check_contrast(MINI_THEME, bad_tune, errs)
    assert any(e.rule == "contrast" and "ink vs surface" in e.msg for e in errs)


def test_hue_family_lock(tmp_path):
    errs = []
    build.check_contrast(MINI_THEME, ":root{--green:#7a2fb5;}", errs)
    assert any(e.rule == "hue-family" for e in errs)


def test_tune_structural_rejected(tmp_path):
    errs = []
    build.check_tune(".card{color:red}", errs)
    assert any(e.rule == "tune" for e in errs)
    errs2 = []
    build.check_tune("/* c */ :root{ --accent:#33608f; --display-transform:uppercase; }", errs2)
    assert errs2 == []


def test_tune_comment_only_ok(tmp_path):
    errs = []
    build.check_tune("/* nothing overridden this lesson */", errs)
    assert errs == []
```

- [ ] **Step 2: Run to verify failures**

Run: `python -m pytest tests/test_build.py -q -k "color or composite or contrast_fail or hue or tune"`
Expected: `test_contrast_failures_reported` fails (MINI_THEME + light-ink tune may already pass if defaults are used — it must assert a failure, so confirm the failing ink actually produces <4.5:1; `#8a94a3` on `#fffdf7` ≈ 3.0:1). If `check_contrast` was wired to accept empty tune arg differently, fix wiring, not the threshold.

- [ ] **Step 3: Make green** — any API mismatch found by these tests (e.g. `check_contrast` signature, alpha-in-hsl parsing) is fixed in `v2/build.py`.

Run: `python -m pytest tests/test_build.py -q`
Expected: `28 passed`

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m "test: contrast + tune-contract numeric gates for the pipeline"
```

---

### Task 4: `shell.html` — layout, vocabulary CSS, LN runtime, markers

**Files:**
- Create: `v2/skeleton/shell.html`
- Create: `tests/test_shell_smoke.py`

**Interfaces:**
- Consumes: Task 2/3 marker + validator contract; token names from `REQUIRED_TOKENS`.
- Produces (runtime globals the whole library relies on — exact names):
  - `LN.data` (object), `LN.components` (object), `LN.h(tag, attrs, kids)` HTML element factory, `LN.s(tag, attrs)` SVG element factory, `LN.num(s)` numeric parser, `LN.close(a, b, tol)` tolerance check, `LN.fmt(n)` thousands-format, `LN.banner(msg)` red error banner, `LN.boot()` mount scanner (called by injected glue), `LN.resetAll()` via the `#lnReset` button.
  - Shell-owned chrome: auto TOC from `section.block[id]`, scroll-spy `.active`, progress bar `#lnProg`, mobile drawer (`#lnMenu`/`#lnSidebar`/`#lnScrim`), global reset. The AI never writes chrome (§3.3).
  - Shell ids: `lnMenu, lnScrim, lnSidebar, lnToc, lnProg, lnReset, lnErrors` (reserved `ln` prefix enforced by build.py).

- [ ] **Step 1: Write the failing smoke test**

`tests/test_shell_smoke.py`:

```python
from pathlib import Path

import build
from test_build import MINI_THEME, make_skel, make_workdir

REPO = Path(__file__).resolve().parents[1]
SKEL = REPO / "v2" / "skeleton"


def test_real_shell_builds_clean(tmp_path):
    skel = make_skel(tmp_path)
    (skel / "shell.html").write_text(
        (SKEL / "shell.html").read_text(encoding="utf-8"), encoding="utf-8")
    (skel / "themes" / "mini.css").write_text(MINI_THEME, encoding="utf-8")
    wd = make_workdir(tmp_path)
    out, errs = build.assemble(wd, skel)
    assert errs == [], [str(e) for e in errs]
    for marker in ("/*__", "<!--__", "__TITLE__"):
        assert marker not in out
    assert "@media print" in out
    assert "LN.boot();" in out
    assert "Reset all activities" in out
    assert "lnErrors" in out
```

- [ ] **Step 2: Run to verify failure** — `python -m pytest tests/test_shell_smoke.py -q` → `FileNotFoundError` (shell.html missing).

- [ ] **Step 3: Write `v2/skeleton/shell.html`** — exactly this content:

````html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>__TITLE__</title>
<style>
/* ============================================================
   LN v2 SHELL — layout, vocabulary CSS, print rules.
   Everything injected (theme, tune, components, sections)
   goes to its marker slot below; injection points keep their
   exact one-occurrence form the assembler expects.
   Colours here: var(--token) only, except inside the print
   override. No external assets, no hex outside the print block.
   ============================================================ */
/*__THEME__*/
/*__TUNE__*/

/* ---------------- base + layout (§1.5) ---------------- */
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.62 var(--sans)}
.app{display:flex;align-items:flex-start;min-height:100vh}
.sidebar{position:sticky;top:0;flex:0 0 274px;width:274px;max-height:100vh;
  overflow-y:auto;padding:22px 18px;background:var(--surface-2);
  border-right:1px solid var(--grid);box-shadow:var(--shadow)}
.brand{font-family:var(--display);font-size:19px;line-height:1.3;
  letter-spacing:var(--display-tracking);text-transform:var(--display-transform);
  margin:0 0 16px}
#lnToc{display:flex;flex-direction:column;gap:2px;margin-bottom:16px}
#lnToc a{display:flex;gap:8px;align-items:baseline;padding:6px 8px;border-radius:8px;
  text-decoration:none;color:var(--ink-soft);font-size:13.5px}
#lnToc a .n{font:11px/1 var(--mono);color:var(--ink-faint);min-width:22px}
#lnToc a:hover{background:var(--sec-3);color:var(--ink)}
#lnToc a.active{background:var(--highlight);color:var(--ink);font-weight:600}
.progress{height:6px;border-radius:999px;background:var(--grid);
  overflow:hidden;margin:6px 0 18px}
.progress>span{display:block;height:100%;width:0;background:var(--accent)}
.stage{flex:1;min-width:0;padding:28px}
.sheet{position:relative;max-width:1060px;margin:0 auto;border-radius:16px;
  box-shadow:var(--shadow-lg)}
.sheet::before{content:"";position:absolute;inset:0 auto 0 92px;width:2px;
  background:var(--edge-line);opacity:.75}
.decor{position:absolute;inset:0;pointer-events:none;border-radius:inherit;overflow:hidden}
.content{position:relative;padding:34px 40px 64px 116px}
header.lesson-head{margin:4px 0 28px}
.lesson-head h1{font-family:var(--display);font-size:clamp(26px,4vw,38px);
  letter-spacing:var(--display-tracking);text-transform:var(--display-transform);
  margin:0 0 6px}
.lesson-head p{margin:0;color:var(--ink-soft);font-size:15px}
button{font:inherit;color:inherit}
.btn{display:inline-block;background:var(--surface-2);border:1px solid var(--grid-strong);
  border-radius:999px;padding:7px 14px;font:600 13.5px/1.2 var(--sans);color:var(--ink);
  cursor:pointer;box-shadow:var(--shadow-sm)}
.btn:hover{border-color:var(--accent)}
:focus-visible{outline:2px solid var(--accent-deep);outline-offset:2px;
  box-shadow:0 0 0 5px rgba(255,255,255,.75)}

/* ---------------- sections + type (§1.3, §1.6) ---------------- */
section.block{background:var(--sec-1);border-radius:var(--radius);
  padding:22px 26px;margin-bottom:26px;scroll-margin-top:16px}
section.block:nth-of-type(5n+2){background:var(--sec-2)}
section.block:nth-of-type(5n+3){background:var(--sec-3)}
section.block:nth-of-type(5n+4){background:var(--sec-4)}
section.block:nth-of-type(5n+5){background:var(--sec-5)}
section.block>h2{position:relative;display:inline-block;margin:2px 0 14px;
  padding:0 6px;font-family:var(--display);font-size:24px;
  letter-spacing:var(--display-tracking);text-transform:var(--display-transform)}
section.block>h2::after{content:"";position:absolute;left:-2px;right:-2px;bottom:2px;
  height:38%;z-index:-1;background:var(--highlight);transform:skew(-12deg);border-radius:2px}
h3{font-size:17.5px;margin:20px 0 8px}
p{margin:10px 0}
a{color:var(--accent-deep)}
ul,ol{margin:10px 0;padding-left:24px}
li{margin:4px 0}
strong{color:var(--ink)}
table{border-collapse:collapse}
th,td{text-align:left}

/* ---------------- content vocabulary (§1.8) ---------------- */
.def{border-left:4px solid var(--accent);background:var(--surface-2);
  border-radius:0 var(--radius) var(--radius) 0;padding:12px 16px;margin:14px 0;
  box-shadow:var(--shadow-sm)}
.def .tag{display:block;font:700 10.5px/1 var(--mono);letter-spacing:.12em;
  color:var(--accent-deep);text-transform:uppercase;margin-bottom:4px}
.def p{margin:4px 0}
.gloss{margin:12px 0 16px}
.gloss>div{display:grid;grid-template-columns:190px 1fr;gap:12px;padding:7px 10px;
  border-bottom:1px dashed var(--grid-strong)}
.gloss dt{font-family:var(--mono);font-size:13px;color:var(--accent-deep)}
.gloss dd{margin:0;font-size:14.5px;color:var(--ink-soft)}
.note{border-radius:8px;padding:10px 14px;margin:14px 0;box-shadow:var(--shadow-sm);font-size:15px}
.note p:first-child{margin-top:0}.note p:last-child{margin-bottom:0}
.note.y{background:var(--note-yellow)}
.note.g{background:var(--note-green)}
.note.b{background:var(--note-blue)}
.note.p{background:var(--note-pink)}
.card{background:var(--surface-2);border:1px solid var(--grid);border-radius:var(--radius);
  padding:14px 18px;margin:14px 0;box-shadow:var(--shadow-sm)}
.mini{background:var(--surface-2);border-radius:var(--radius);padding:12px 14px;
  box-shadow:var(--shadow-sm);font-size:14.5px}
.mini b{color:var(--accent-deep)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}
.data-strip{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.chip{font:600 12.5px/1.4 var(--mono);background:var(--surface-2);
  border:1px solid var(--grid-strong);border-radius:999px;padding:6px 10px;color:var(--ink-soft)}
.step{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:center;
  padding:9px 0;border-bottom:1px dashed var(--grid-strong)}
.step .n{grid-row:1;font:700 12px/1 var(--mono);background:var(--accent);color:var(--surface);
  border-radius:999px;padding:5px 8px}
.step .q{font-size:14.5px}
.step .inp{grid-column:2;display:flex;gap:8px;align-items:center}
.step input{font:15px/1 var(--mono);padding:8px 10px;border:2px solid var(--grid-strong);
  border-radius:8px;background:var(--surface-2);color:var(--ink);min-width:0}
.step input.ok{border-color:var(--green);background:var(--green-bg)}
.step input.bad{border-color:var(--red);background:var(--red-bg)}
.fb{display:none;padding:10px 14px;border-radius:8px;margin:12px 0;font-weight:600;
  font-size:14.5px;color:var(--ink);background:var(--surface-2)}
.fb.show{display:block}
.fb.ok{background:var(--green-bg);border:1px solid var(--green)}
.fb.no{background:var(--red-bg);border:1px solid var(--red)}
.fb.info{background:var(--note-blue);border:1px solid var(--accent)}
.hl{background:var(--highlight);padding:0 4px;border-radius:3px}
.hl-g{background:var(--green-bg);padding:0 4px;border-radius:3px}
.tbl{width:100%;font-size:14.5px}
.tbl th,.tbl td{padding:8px 10px;border-bottom:1px solid var(--grid-strong);vertical-align:top}
.tbl th{font:700 12px/1.4 var(--mono);color:var(--accent-deep)}
.cmp-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:14px 0}
.cmp-wrap table{min-width:640px}
.swipe-hint{display:none;font:12px/1 var(--mono);color:var(--ink-faint);margin:2px 0 6px}
[data-component]{margin:18px 0}
.noscript-note{padding:12px 16px;background:var(--red-bg);border:1px solid var(--red);
  border-radius:8px;margin-bottom:20px}

/* ---------------- chrome: banner, drawer, responsive, motion ---------------- */
#lnErrors{position:fixed;top:0;left:0;right:0;z-index:99;background:var(--red);
  color:var(--surface);padding:12px 18px;font:600 13.5px/1.5 var(--mono);
  box-shadow:var(--shadow-lg)}
#lnErrors[hidden]{display:none}
.menu-btn{display:none;position:fixed;top:14px;left:14px;z-index:60;padding:10px 13px;
  font-size:16px;background:var(--surface-2);color:var(--ink);
  border:1px solid var(--grid-strong);border-radius:10px;box-shadow:var(--shadow)}
.scrim{display:none;position:fixed;inset:0;background:rgba(20,25,35,.45);z-index:45}
.scrim.show{display:block}
@media (max-width:1024px){
  .sidebar{position:fixed;left:0;top:0;bottom:0;z-index:50;transform:translateX(-105%);
    transition:transform .25s}
  .sidebar.open{transform:none;box-shadow:var(--shadow-lg)}
  .menu-btn{display:block}
}
@media (max-width:900px){.grid4{grid-template-columns:1fr 1fr}}
@media (max-width:600px){
  .stage{padding:10px}
  .content{padding:26px 18px 48px}
  .sheet::before{display:none}
  .decor{display:none}
  .grid2,.grid4{grid-template-columns:1fr}
  .gloss>div{grid-template-columns:1fr;gap:2px}
  .swipe-hint{display:block}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
  html{scroll-behavior:auto}
}

/*HEXOK*/
/* ---------------- print override — mandatory, shell-owned (§1.7) ---------------- */
@media print{
  :root{
    --bg:#fff;--surface:#fff;--surface-2:#fff;
    --grid:transparent;--grid-strong:transparent;
    --sec-1:transparent;--sec-2:transparent;--sec-3:transparent;
    --sec-4:transparent;--sec-5:transparent;
    --ink:#000;--ink-soft:#333;--ink-faint:#555;
    --shadow:none;--shadow-sm:none;--shadow-lg:none;
  }
  .sheet{background:#fff!important}
  .decor,.sidebar,.menu-btn,.scrim,.no-print,#lnErrors{display:none!important}
  .stage{padding:0}
  .content{padding:0}
  section.block,.card,.def{page-break-inside:avoid}
}
/*ENDHEX*/
/*__COMPONENT_CSS__*/
</style>
</head>
<body>
<noscript><div class="app"><div class="stage" style="width:100%"><div class="sheet">
<div class="content"><p class="noscript-note">This notebook needs JavaScript for its
activities; the reading and recap still print.</p></div></div></div></div></noscript>
<button id="lnMenu" class="menu-btn no-print" aria-label="Open contents"
  aria-controls="lnSidebar">☰</button>
<div id="lnScrim" class="scrim no-print"></div>
<div class="app">
<aside class="sidebar no-print" id="lnSidebar" aria-label="Contents">
  <div class="brand">__TITLE__</div>
  <nav id="lnToc"></nav>
  <div class="progress" aria-hidden="true"><span id="lnProg"></span></div>
  <button class="btn" id="lnReset">Reset all activities</button>
</aside>
<main class="stage">
  <div class="sheet">
    <div class="decor" aria-hidden="true"></div>
    <div class="content">
<!--__SECTIONS__-->
    </div>
  </div>
</main>
</div>
<div id="lnErrors" role="alert" hidden></div>
<script>
"use strict";
/* =============== LN runtime — shell-owned chrome =============== */
window.LN = (function () {
  var SVGNS = "http://www.w3.org/2000/svg";
  var LN = { data: {}, components: {}, _mounts: [] };

  LN.num = function (s) {
    if (typeof s === "number") return s;
    var v = parseFloat(String(s).replace(/[₱$€£¥,\s%]/g, ""));
    return isNaN(v) ? NaN : v;
  };
  LN.close = function (a, b, tol) {
    if (isNaN(a) || isNaN(b)) return false;
    var t = (tol != null) ? tol : Math.max(0.6, Math.abs(b) * 0.012);
    return Math.abs(a - b) <= t;
  };
  LN.fmt = function (n) {
    if (isNaN(n) || !isFinite(n)) return "—";
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  LN.h = function (tag, attrs, kids) {
    var e = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function")
        e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (kids) kids.forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  };
  LN.s = function (tag, attrs) {
    var e = document.createElementNS(SVGNS, tag), k;
    if (attrs) for (k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  LN.banner = function (msg) {
    var box = document.getElementById("lnErrors");
    if (!box) { if (window.console) console.error("LN: " + msg); return; }
    box.hidden = false;
    box.appendChild(LN.h("div", { text: "LN BUILD ERROR: " + msg }));
  };

  LN._initOne = function (m) {
    try {
      m.el.innerHTML = "";
      m.C.init(m.el, LN.data[m.key]);
    } catch (e) {
      LN.banner("component " + m.name + " failed: " + (e && e.message));
    }
  };
  LN._buildToc = function () {
    var toc = document.getElementById("lnToc");
    if (!toc) return;
    toc.innerHTML = "";
    var secs = document.querySelectorAll("section.block[id]");
    Array.prototype.forEach.call(secs, function (s, i) {
      var hd = s.querySelector("h2,h1");
      toc.appendChild(LN.h("a", { href: "#" + s.id }, [
        LN.h("span", { class: "n", text: ("0" + (i + 1)).slice(-2) }),
        LN.h("span", { text: hd ? hd.textContent : s.id }),
      ]));
    });
  };
  LN._wireChrome = function () {
    if (LN._wired) return;
    LN._wired = true;
    var sb = document.getElementById("lnSidebar");
    var menu = document.getElementById("lnMenu");
    var scrim = document.getElementById("lnScrim");
    var prog = document.getElementById("lnProg");
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
      if (ev.target.closest("a")) drawer(false);
    });
    var onScroll = function () {
      var de = document.documentElement;
      var max = de.scrollHeight - de.clientHeight;
      if (prog) prog.style.width = (max > 0 ? Math.min(1, de.scrollTop / max) * 100 : 0) + "%";
      var links = toc ? toc.querySelectorAll("a") : [];
      var secs = document.querySelectorAll("section.block[id]");
      var idx = -1;
      Array.prototype.forEach.call(secs, function (s, i) {
        if (s.getBoundingClientRect().top <= 80) idx = i;
      });
      Array.prototype.forEach.call(links, function (a, i) {
        a.classList.toggle("active", i === idx);
        if (i === idx) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    if (reset) reset.addEventListener("click", function () { LN.resetAll(); });
  };
  LN.resetAll = function () {
    LN._mounts.forEach(LN._initOne);
    var box = document.getElementById("lnErrors");
    if (box) { box.innerHTML = ""; box.hidden = true; }
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
    LN._buildToc();
    LN._wireChrome();
  };
  return LN;
})();
/*__DATA__*/
/*__COMPONENT_JS__*/
</script>
</body>
</html>
````

- [ ] **Step 4: Run smoke test to verify green**

Run: `python -m pytest tests -q`
Expected: all Task 2/3 tests + `test_real_shell_builds_clean` pass (`33 passed`)

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: shell.html — layout, vocabulary CSS, LN runtime chrome, print block, marker slots"
```

---

---

## Execution status (2026-09-15, inline)

Plan executed inline in this repo. Tasks 1-7 complete and verified:

| Gate | Result |
|---|---|
| `python -m pytest tests -q` | **38 passed** (validator rules, contrast maths, shell smoke, 6-pack matrix, 11-component matrix, e2e) |
| `python v2/build.py tests/fixtures/lesson-demo` | **OK** - 1,398 lines, 11 mounts, 0 marker leaks, 0 external refs; embedded script passes `node --check` |
| Spec §5.2 rule-by-rule | markers/hex/external/ids/data/wellformed/contrast+hue/print all enforced with rule-named, line-located FAIL reports and no-partial-output gate |
| Spec §8 library verification | good-fixture build per pack and per component automated; smoke failure fixtures = the rule tests in `test_build.py` |

Deviations from the plan text (final code is the source of truth in `v2/`):
unknown theme/component names are listed in the error message itself; `make_skel`
always writes `mini.css`; demo fixture ships `receipt` pack tuned to "tumba-tapa"
(Week 4 content) rather than ledger.

**Pending manual steps (require the user):**
1. Open `tests/fixtures/lesson-demo/Week4-Demo-Notebook.html` in a browser; check every
   activity: answers lock one-way, resets work, sliders move chart + readout + sensitivity,
   scoreboard denominators correct on first paint, drawer/TOC/scroll-spy, print preview.
2. Spec §8 RED/GREEN: convert one real unconverted week with v1.9 (baseline) and the same
   week with this pipeline; compare output tokens (target <= 40%) and §5 judgment QA.
3. Second, non-business lesson to exercise the hand-derived fallback (§6.4) and propose a
   7th pack if it lands.
4. Only after GREEN: copy `v2/` over the live skill directory. Until then `v2/SKILL.md`
   remains staging; the v1.9 skill is untouched, as spec §8 requires.
