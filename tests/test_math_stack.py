import json
import os
import shutil
import uuid
import subprocess
from pathlib import Path

import pytest

import build

REPO = Path(__file__).resolve().parents[1]
SKEL = REPO / "v2" / "skeleton"
TOOL = REPO / "v2" / "tools" / "math_stack.js"

HEAD = ('<section class="block" id="overview"><h2>0 Overview</h2>'
        '<p>This lesson teaches a ratio, and every step is shown on its own line so '
        'the student can follow the arithmetic from the statement to the answer.</p></section>')
TAIL = ('<p>The ratio reads in numbers, and the fixed charge is what makes the answer '
        'swing twice as wide as operating profit.</p>')


WHERE = ('<p><strong>Where:</strong><br>'
         '<math><mi>CM</mi></math> = contribution margin;<br>'
         '<math><mi>DOL</mi></math> = degree of operating leverage.</p>')


def _section(equations):
    return (HEAD + '<section class="block" id="calc"><h2 data-present="0">1 The Ratio</h2>'
            '<div class="def" data-present="1" data-kind="concept">'
            '<p class="sub-title"><strong>Worked</strong></p>'
            + equations + WHERE + TAIL + '</div></section>')


# GOOD: one display block per equation line (Section 4 / Week 11 shape).
GOOD = (
    '<p>The three steps take those levels to a DOL.</p>'
    '<math display="block"><mi>CM</mi><mo>=</mo><mn>1,600,000</mn><mo>âˆ’</mo><mn>800,000</mn></math>'
    '<math display="block"><mrow class="hl"><mn>CM</mn><mo>=</mo><mn>800,000</mn></mrow></math>'
    '<math display="block"><mi>DOL</mi><mo>=</mo><mfrac><mn>800,000</mn><mn>400,000</mn></mfrac></math>'
    '<math display="block"><mi>DOL</mi><mo>=</mo><mrow class="hl"><mn>2.0</mn></mrow></math>'
)

# BAD 1: bare inline equations with no separator at all - they share one line.
MERGED = (
    '<p><strong>1.</strong> Compute contribution margin.</p>'
    '<math><mrow><mi>CM</mi><mo>=</mo><mn>1,600,000</mn><mo>âˆ’</mo><mn>800,000</mn></mrow></math>'
    '<math><mrow><mi>CM</mi><mo>=</mo><mn>800,000</mn></mrow></math>'
    '<math display="block"><mi>DOL</mi><mo>=</mo><mfrac><mn>800,000</mn><mn>400,000</mn></mfrac></math>'
    '<math display="block"><mi>DOL</mi><mo>=</mo><mrow class="hl"><mn>2.0</mn></mrow></math>'
)

# BAD 2: <br>-joined bare equations - one line each, but no vertical room.
CRAMPED = (
    '<p><strong>1.</strong> Compute contribution margin:<br>'
    '<math><mrow><mi>CM</mi><mo>=</mo><mn>1,600,000</mn><mo>âˆ’</mo><mn>800,000</mn></mrow></math><br>'
    '<math><mrow><mi>CM</mi><mo>=</mo><mrow class="hl"><mn>800,000</mn></mrow></mrow></math></p>'
    '<math display="block"><mi>DOL</mi><mo>=</mo><mfrac><mn>800,000</mn><mn>400,000</mn></mfrac></math>'
    '<math display="block"><mi>DOL</mi><mo>=</mo><mrow class="hl"><mn>2.0</mn></mrow></math>'
)


def _workdir(tmp_path, sections):
    wd = tmp_path / "wd"
    wd.mkdir(parents=True)
    cfg = {"title": "Math Stack Test", "theme": "studio", "components": ["glossary"],
           "output": "math-stack.html"}
    (wd / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--accent:#33608f;}", encoding="utf-8")
    (wd / "sections.html").write_text(sections, encoding="utf-8")
    (wd / "data.js").write_text("", encoding="utf-8")
    return wd


def _assemble(tmp_path, sections):
    out, errs, _ = build.assemble(_workdir(tmp_path, sections), SKEL)
    assert errs == [], [str(e) for e in errs]
    page = tmp_path / "math-stack.html"
    page.write_text(out, encoding="utf-8")
    return page


def _node22():
    node = shutil.which("node")
    if not node:
        return None
    try:
        ver = subprocess.run([node, "--version"], capture_output=True, text=True,
                             timeout=20).stdout.strip()
        major = int(ver.lstrip("v").split(".")[0])
    except (OSError, ValueError, subprocess.SubprocessError):
        return None
    return node if major >= 22 else None


def _chrome():
    cands = [
        os.environ.get("LN_CHROME"),
        os.environ.get("CHROME_PATH"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
    ]
    for c in cands:
        if c and Path(c).exists():
            return c
    return None


def _run(page):
    node = _node22()
    if not node:
        pytest.skip("math_stack needs Node 22+")
    chrome = _chrome()
    if not chrome:
        pytest.skip("Chrome/Edge not installed")
    if not TOOL.exists():
        pytest.fail("tools/math_stack.js is missing")
    # Chrome cannot read a page staged in a tempfile.mkdtemp() directory on this
    # platform (mode 0700 -> navigation lands on chrome-error://chromewebdata),
    # so create the staging dir with os.makedirs and clean it up again.
    stage = REPO / ("mathstack-stage-" + uuid.uuid4().hex[:10])
    os.makedirs(str(stage))
    try:
        staged = stage / page.name
        shutil.copyfile(page, staged)
        assert staged.stat().st_size > 1000, "staged page is empty"
        return subprocess.run([node, str(TOOL), str(staged), "--chrome", chrome],
                              capture_output=True, text=True, timeout=240)
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def test_stacked_display_equations_pass(tmp_path):
    """The reference shape - one display block per line - must pass."""
    r = _run(_assemble(tmp_path, _section(GOOD)))
    assert "MATH STACK OK" in r.stdout, r.stdout + r.stderr


def test_equations_sharing_a_line_fail(tmp_path):
    """Two bare equations with no separator collapse onto one line."""
    r = _run(_assemble(tmp_path, _section(MERGED)))
    assert "MATH STACK FAIL" in r.stdout, r.stdout + r.stderr
    assert "same line" in r.stdout, r.stdout + r.stderr


def test_br_joined_equations_fail(tmp_path):
    """<br>-joined bare equations get no vertical room, so the run reads as a block."""
    r = _run(_assemble(tmp_path, _section(CRAMPED)))
    assert "MATH STACK FAIL" in r.stdout, r.stdout + r.stderr
    assert "gap" in r.stdout, r.stdout + r.stderr



