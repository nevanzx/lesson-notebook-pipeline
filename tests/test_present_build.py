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


def test_nested_tag_fails(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2>1 Costs</h2>'
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


def test_invalid_value_fails(tmp_path):
    sections = (
        '<section class="block" id="costs"><h2>1 Costs</h2>'
        '<div class="def" data-present="0"><p>x</p></div></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "positive integer" in (r.stdout + r.stderr)


def test_exempt_id_variants_build(tmp_path):
    sections = (
        '<section class="block" id="self-check"><h2>0 Self Check</h2>'
        '<p>Read this before you answer.</p></section>'
        '<section class="block" id="assign"><h2>5 Assignment</h2>'
        '<p>Show what you learned.</p></section>')
    r = _run(tmp_path, sections)
    assert r.returncode == 0, r.stdout + r.stderr
