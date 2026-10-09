from pathlib import Path

SKILL = Path(__file__).resolve().parents[1] / "v2" / "SKILL.md"


def test_skill_documents_no_provenance_rule():
    text = SKILL.read_text(encoding="utf-8")
    assert "No build-provenance narration (self-reference class)" in text


def test_skill_rule_gap_in_opening_message_only():
    text = SKILL.read_text(encoding="utf-8")
    assert "never inside the notebook" in text


def test_skill_version_is_2_21():
    text = SKILL.read_text(encoding="utf-8")
    assert "version: 2.21" in text
