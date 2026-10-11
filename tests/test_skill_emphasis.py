from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / "v2" / "SKILL.md"
CHECKER = ROOT / "average-student-checker" / "SKILL.md"


def test_notebook_documents_emphasis_rule():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "### 2.1d Emphasis" in text
    assert "Never underline" in text
    assert "first time it appears" in text


def test_section_brief_carries_emphasis_rule():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "Emphasis: bold (<strong>)" in text


def test_checker_documents_formatting_check():
    text = CHECKER.read_text(encoding="utf-8")
    assert "## The formatting check" in text
    assert "UNFORMATTED" in text
