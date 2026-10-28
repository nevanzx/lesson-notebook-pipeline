from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / "v2" / "SKILL.md"
CHECKER = ROOT / "average-student-checker" / "SKILL.md"


def test_notebook_documents_prose_budget():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "### 2.1e The prose budget" in text
    assert "One idea per paragraph" in text
    assert "A sentence stays under ~30 words" in text


def test_section_brief_carries_prose_budget():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "Prose shape (write to this budget first" in text


def test_pipeline_documents_mechanical_prose_gate():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "prose_lint.py" in text
    assert "no LLM clarity sweep" in text


def test_prose_budget_pairs_long_sentences_with_a_visual():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "do **not** just split it" in text
    assert "--max-sentence-words" in text


def test_checker_pipeline_documents_shortlist_mode():
    text = CHECKER.read_text(encoding="utf-8")
    assert "shortlist" in text
    assert "one merged reviewer" in text


def test_checker_names_the_in_pipeline_numeric_exception():
    text = CHECKER.read_text(encoding="utf-8")
    region = text[text.index("## Stay in your lane") :]
    assert "in-pipeline" in region
    assert "numeric" in region
