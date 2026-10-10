from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SHELL = REPO / "v2" / "skeleton" / "shell.html"


def test_shell_has_refs_class():
    css = SHELL.read_text(encoding="utf-8")
    assert ".refs{" in css.replace(" ", "")
    assert "text-indent:-1.6em" in css.replace(" ", "")
