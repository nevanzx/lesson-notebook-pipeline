from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SHELL = REPO / "v2" / "skeleton" / "shell.html"
DESK = REPO / "v2" / "skeleton" / "layouts" / "desk"


def desk_text():
    return (SHELL.read_text(encoding="utf-8")
            + (DESK / "chrome.html").read_text(encoding="utf-8")
            + (DESK / "layout.js").read_text(encoding="utf-8"))


def test_shell_has_no_top_nav():
    t = desk_text()
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
    t = desk_text()
    assert 'LN._showSection' in t
    assert 'js-tabs' in t
    assert 'id="lnToc"' in t
    assert 'aria-current' in t
