import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

import build

REPO = Path(__file__).resolve().parents[1]
SKEL = REPO / "v2" / "skeleton"

SECTIONS = (
    '<section class="block" id="overview"><h2>0 Overview</h2>'
    '<div data-component="glossary" data-key="gl"></div>'
    '<p>This lesson tests how a wide formula is set on a phone. Read the method, '
    'then check the result against the source.</p></section>'
    '<section class="block" id="calc"><h2 data-present="0">1 The Formula</h2>'
    '<p>A firm forecasts its external financing need before it commits to a growth '
    'plan. The formula below is the method the lesson uses.</p>'
    '<div class="def" data-present="1" data-kind="concept"><span class="tag">Definition</span>'
    '<p><math display="block"><mrow><mi>EFN</mi><mo>=</mo>'
    '<mfrac><mi>A</mi><mi>S</mi></mfrac><mo>&#215;</mo><mi>&#916;S</mi>'
    '<mo>&#8722;</mo><mfrac><mi>L</mi><mi>S</mi></mfrac><mo>&#215;</mo>'
    '<mi>&#916;S</mi><mo>&#8722;</mo><mi>PM</mi><mo>&#215;</mo>'
    '<msub><mi>S</mi><mn>1</mn></msub><mo>&#215;</mo><mrow><mo>(</mo><mn>1</mn>'
    '<mo>&#8722;</mo><mi>d</mi><mo>)</mo></mrow></mrow></math></p>'
    '<p><strong>Where:</strong><br><math><mi>EFN</mi></math> = external financing '
    'need;<br><math><mi>A</mi><mo>/</mo><mi>S</mi></math> = assets that rise with '
    'sales.</p></div>'
    '<p>The result is the amount the firm must raise from outside sources when sales '
    'grow.</p></section>'
)
DATA = 'LN.data.gl={groups:[{name:"G",terms:[{t:"EFN",d:"external financing need"}]}]};'


def _workdir(tmp_path):
    wd = tmp_path / "wd"
    wd.mkdir(parents=True)
    cfg = {"title": "Math Fit Test", "theme": "studio", "components": ["glossary"],
           "output": "math-test.html"}
    (wd / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--accent:#33608f;}", encoding="utf-8")
    (wd / "sections.html").write_text(SECTIONS, encoding="utf-8")
    (wd / "data.js").write_text(DATA, encoding="utf-8")
    return wd


def _assemble(tmp_path):
    out, errs, _ = build.assemble(_workdir(tmp_path), SKEL)
    assert errs == [], [str(e) for e in errs]
    return out


def _node22():
    node = shutil.which("node")
    if not node:
        return None
    try:
        ver = subprocess.run([node, "--version"], capture_output=True,
                             text=True, timeout=20).stdout.strip()
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
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ]
    for c in cands:
        if c and Path(c).exists():
            return c
    return None


def test_fit_rules_are_inlined_in_the_build(tmp_path):
    out = _assemble(tmp_path)
    assert 'p:has(> math[display="block"])' in out
    assert "display:block math" in out
    assert "function fitMath(scope)" in out
    assert "fitMath(l[i]);" in out
    assert "fitMath: fitMath" in out
    assert "ln-math-scroll" in out


def test_wide_formula_is_not_truncated_at_phone_width(tmp_path):
    node = _node22()
    if not node:
        pytest.skip("layout_smoke --width needs Node 22+")
    chrome = _chrome()
    if not chrome:
        pytest.skip("Chrome/Edge not installed")
    out = _assemble(tmp_path)
    page = tmp_path / "math-test.html"
    page.write_text(out, encoding="utf-8")
    smoke = REPO / "v2" / "tools" / "layout_smoke.js"
    r = subprocess.run(
        [node, str(smoke), str(page), "--chrome", chrome, "--width", "390"],
        capture_output=True, text=True, timeout=180,
    )
    assert "LAYOUT OK" in r.stdout, r.stdout + r.stderr
