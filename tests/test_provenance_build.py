import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "v2" / "build.py"

VALID_SECTIONS = (
    '<section class="block" id="costs"><h2 data-present="0">1 Costs</h2>'
    '<div class="def" data-present="1"><p>{body}</p></div>'
    '<p><span data-present="2">Rises with volume</span> and other words.</p>'
    "</section>")


def _run(tmp_path, sections, data="LN.data.m0={items:[]};"):
    wd = tmp_path / "wd"
    wd.mkdir(exist_ok=True)
    (wd / "build.json").write_text(json.dumps({
        "title": "T", "theme": "parchment", "layout": "app",
        "components": ["milo-list"], "output": "Out.html"}), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--accent:#123456}", encoding="utf-8")
    (wd / "sections.html").write_text(sections, encoding="utf-8")
    (wd / "data.js").write_text(data, encoding="utf-8")
    return subprocess.run([sys.executable, str(BUILD), str(wd)],
                          capture_output=True, text=True, cwd=str(tmp_path))


def _sections(body):
    return VALID_SECTIONS.format(body=body)


def test_clean_build_passes(tmp_path):
    assert _run(tmp_path, _sections("Fixed cost...")).returncode == 0


PROVENANCE_PHRASES = [
    "The source: specification applies.",
    "This is a specification source.",
    "The syllabus carried no teaching body.",
    "Fully authored teaching text is provided.",
    "This section was authored for the course.",
    "The text is authored, not extracted.",
    "It is written against the standards the outcomes name.",
    "This week's text is written for you.",
    "Content authored against the standards.",
    "The material, authored in-house, is not extracted from a PDF.",
]


@pytest.mark.parametrize("phrase", PROVENANCE_PHRASES)
def test_provenance_phrase_fails(tmp_path, phrase):
    r = _run(tmp_path, _sections(phrase))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "provenance" in (r.stdout + r.stderr)


def test_sourcing_box_fails(tmp_path):
    for body in ("<strong>Sourcing.</strong> We built this from circulars.",
                 '<strong class="lead">Sourcing.</strong> We built this from circulars.'):
        r = _run(tmp_path, _sections(body))
        assert r.returncode == 1, body + "  " + r.stdout + r.stderr
        assert "provenance" in (r.stdout + r.stderr)


def test_provenance_in_data_fails(tmp_path):
    r = _run(tmp_path, _sections("Fixed cost..."),
             data='LN.data.m0={items:[{s:"source: specification"}]};')
    assert r.returncode == 1
    assert "provenance" in (r.stdout + r.stderr)


NEGATIVE_PHRASES = [
    "Under BSP Circular 808, the bank must hold capital.",
    "The claim carried no body of supporting evidence.",
    "Heat not extracted from the system stays in the gas.",
    "The report was authored by the analyst.",
    "The resource: specification is in the appendix.",
    "The funding sourcing. The bank reviewed it.",
    "Trace each requirement back to its specification source in the appendix.",
    "The specification source document is attached to the case.",
    "The data are authored monthly by the analytics team.",
    "The novella was authored in 1947.",
]


@pytest.mark.parametrize("phrase", NEGATIVE_PHRASES)
def test_negative_phrase_passes(tmp_path, phrase):
    r = _run(tmp_path, _sections(phrase))
    assert r.returncode == 0, r.stdout + r.stderr
