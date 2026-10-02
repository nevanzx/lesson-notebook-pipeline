from pathlib import Path

SKILL = Path(__file__).resolve().parents[1] / "v2" / "SKILL.md"


def test_skill_documents_marker():
    text = SKILL.read_text(encoding="utf-8")
    assert 'data-present="N"' in text or "data-present" in text
    assert "present" in text.lower()


def test_skill_exempt_sections():
    text = SKILL.read_text(encoding="utf-8")
    for sid in ("overview", "glossary", "selfcheck", "assignment", "recap"):
        assert sid in text


def test_brief_template_mentions_marker():
    text = SKILL.read_text(encoding="utf-8")
    assert "data-present" in text
