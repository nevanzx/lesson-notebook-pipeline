from pathlib import Path
REPO = Path(__file__).resolve().parents[1]
SHELL = REPO / "v2" / "skeleton" / "shell.html"

def test_shell_has_tab_containers():
    t = SHELL.read_text(encoding="utf-8")
    assert 'id="lnTabs"' in t
    assert 'id="lnPrev"' in t
    assert 'id="lnNext"' in t
    assert 'id="lnCounter"' in t

def test_shell_tab_css_uses_tokens_and_print_hides_tabs():
    t = SHELL.read_text(encoding="utf-8")
    assert '.tabs' in t
    assert '@media print' in t
    assert '.tabs' in t.split('@media print', 1)[1]

def test_shell_tab_js_present():
    t = SHELL.read_text(encoding="utf-8")
    assert 'LN._buildTabs' in t
    assert 'LN._showSection' in t
    assert 'js-tabs' in t
    assert 'aria-selected' in t
