import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "v2" / "build.py"

VALID_SECTIONS = (
    '<section class="block" id="costs"><h2 data-present="0">1 Costs</h2>'
    '<div class="def" data-present="1"><p>Fixed cost...</p></div>'
    '<p><span data-present="2">Rises with volume</span> and other words.</p>'
    "</section>")


def _run(tmp_path, sections, data="LN.data.m0={items:[]};"):
    wd = tmp_path / "wd"
    wd.mkdir()
    (wd / "build.json").write_text(json.dumps({
        "title": "T", "theme": "parchment", "layout": "app",
        "components": ["milo-list"], "output": "Out.html"}), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--accent:#123456}", encoding="utf-8")
    (wd / "sections.html").write_text(sections, encoding="utf-8")
    (wd / "data.js").write_text(data, encoding="utf-8")
    return subprocess.run([sys.executable, str(BUILD), str(wd)],
                          capture_output=True, text=True, cwd=str(tmp_path))


def test_clean_build_passes(tmp_path):
    r = _run(tmp_path, VALID_SECTIONS)
    assert r.returncode == 0, r.stdout + r.stderr


def test_provenance_in_sections_fails(tmp_path):
    sections = VALID_SECTIONS.replace(
        "Fixed cost...", "The syllabus carried no teaching body, so this is authored.")
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "provenance" in (r.stdout + r.stderr)


def test_provenance_in_data_fails(tmp_path):
    r = _run(tmp_path, VALID_SECTIONS,
             data='LN.data.m0={items:[{s:"source: specification"}]};')
    assert r.returncode == 1
    assert "provenance" in (r.stdout + r.stderr)


def test_factual_citation_passes(tmp_path):
    sections = VALID_SECTIONS.replace(
        "Fixed cost...", "Under BSP Circular 808, the bank must hold capital.")
    r = _run(tmp_path, sections)
    assert r.returncode == 0, r.stdout + r.stderr
