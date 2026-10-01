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