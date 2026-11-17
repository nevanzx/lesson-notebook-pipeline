from pathlib import Path

import re

SKILL = Path(__file__).resolve().parents[1] / "v2" / "SKILL.md"


def test_skill_documents_no_provenance_rule():
    text = SKILL.read_text(encoding="utf-8")
    assert "No build-provenance narration (self-reference class)" in text


def test_skill_rule_gap_in_opening_message_only():
    text = SKILL.read_text(encoding="utf-8")
    assert "never inside the notebook" in text


def _latest_changelog_version(text):
    found = re.findall(r"What v(\d+)\.(\d+) adds:", text)
    assert found, "no 'What vX.Y adds:' changelog entry in SKILL.md"
    return max((int(a), int(b)) for a, b in found)


def test_skill_version_is_current():
    """The frontmatter version must be the newest changelog entry, so a bump
    cannot silently leave this assertion (or the doc) behind."""
    text = SKILL.read_text(encoding="utf-8")
    m = re.search(r"^version: (\d+)\.(\d+)$", text, re.MULTILINE)
    assert m, "frontmatter has no 'version: X.Y' line"
    assert (int(m.group(1)), int(m.group(2))) == _latest_changelog_version(text), (
        "frontmatter version must match the newest 'What vX.Y adds' changelog entry")


def test_skill_documents_apa_citations_rule():
    text = SKILL.read_text(encoding="utf-8")
    assert "### 2.7 Citations and References (APA 7th edition)" in text
    assert "parts/NN-<id>.refs.json" in text
