from pathlib import Path
REPO = Path(__file__).resolve().parents[1]
SHELL = REPO / "v2" / "skeleton" / "shell.html"

def test_shell_has_no_top_nav():
    # Sidebar drives section switching: no top tab bar, no Prev/Next footer.
    t = SHELL.read_text(encoding="utf-8")
    assert 'id="lnTabs"' not in t
    assert 'id="lnPrev"' not in t
    assert 'id="lnNext"' not in t
    assert 'id="lnCounter"' not in t
    assert 'ln-tab' not in t
    assert '.tab-nav' not in t

def test_shell_section_switch_css_and_print():
    t = SHELL.read_text(encoding="utf-8")
    assert 'section.block[hidden]{display:none}' in t.replace(' ', '')
    assert '@media print' in t
    assert 'section.block[hidden]{display:block!important}' in t.replace(' ', '')

def test_shell_section_js_present():
    t = SHELL.read_text(encoding="utf-8")
    assert 'LN._showSection' in t
    assert 'js-tabs' in t
    assert 'id="lnToc"' in t
    assert 'aria-current' in t
