from pathlib import Path
import re

COMP = Path(__file__).resolve().parents[1] / "v2" / "skeleton" / "components" / "assignment"


def _js():
    return (COMP / "component.js").read_text(encoding="utf-8")


def test_ui_shell_structure_present():
    js = _js()
    for hook in ("lna-shell", "lna-rail", "lna-main",
                 "lna-rail-eyebrow", "lna-rail-title", "lna-rail-count"):
        assert hook in js, hook


def test_ui_begin_card_meta_and_pill():
    js = _js()
    for hook in ("lna-entry-top", "lna-eyebrow", "lna-entry-title",
                 "lna-entry-body", "lna-meta", "lna-chip", "lna-pill"):
        assert hook in js, hook


def test_ui_preserves_required_hooks():
    js = _js()
    for hook in ("lna-begin", "lna-watermark", "lna-ident", "lna-start",
                 "lna-quiz", "lna-prog", "lna-dots", "lna-dot"):
        assert hook in js, hook


def _css():
    return (COMP / "component.css").read_text(encoding="utf-8")


def test_ui_css_concept3_selectors():
    css = _css()
    for sel in (".lna-shell", ".lna-rail", ".lna-main", ".lna-rail-count",
                ".lna-opt:has(input:checked)", ".lna-dot"):
        assert sel in css, sel
    assert "grid-template-columns:240px minmax(0,1fr)" in css
    assert "@media (min-width:1024px)" in css
    assert "@media (max-width:600px)" in css


def test_ui_css_is_token_only():
    css = _css()
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b", css)
    assert "http" not in css and "@import" not in css