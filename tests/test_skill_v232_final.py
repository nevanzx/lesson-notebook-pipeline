from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / "v2" / "SKILL.md"


def text():
    return NOTEBOOK.read_text(encoding="utf-8")


def test_retired_sweep_phrases_are_absent():
    body = text()
    for phrase in ("final sweep over the assembled file",
                   "runs on the assembled file (the Part 5 sweep)",
                   "the sweep keeps"):
        assert phrase not in body


def test_c2_passes_the_glossary_data_file():
    body = text()
    assert ("python tools/prose_lint.py build/<slug>/parts/NN-<id>.sections.html "
            "--glossary build/<slug>/parts/<glossary-id>.data.js") in body


def test_migration_note_documents_the_required_lint_pass():
    body = text()
    assert "Migrating an existing lesson" in body
    assert "There is no bypass" in body
