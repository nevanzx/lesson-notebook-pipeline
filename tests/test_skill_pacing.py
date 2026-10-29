from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / "v2" / "SKILL.md"


def test_skill_states_the_content_hour_default():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "### 2.3 The 60-minute budget" in text
    assert "60 minutes of lesson content" in text
    assert "130 words" in text


def test_activities_and_assignment_are_not_budgeted():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "not budgeted" in text
    assert "never cut to make the" in text
    assert "Never cut to save minutes" in text


def test_calculation_content_counts_less():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "**half weight**" in text
    assert "1,500" in text and "450" in text


def test_skill_documents_the_pacing_gate():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "pacing_lint.py" in text
    assert "pacing-review.json" in text
    assert "lesson_over_budget" in text
    assert "section_over_budget" in text


def test_skill_build_json_allows_a_longer_class():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert '"minutes": 60' in text
    assert '"minutes": 90' in text


def test_section_brief_carries_the_section_budget():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "Pacing (one-hour content lesson" in text
    assert "Activities and the assignment are not budgeted" in text


def test_opening_message_declares_the_content_budget():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "Pacing: <N> min of content" in text
