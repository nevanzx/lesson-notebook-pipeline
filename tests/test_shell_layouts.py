import json
from pathlib import Path

import build

REPO = Path(__file__).resolve().parents[1]
SKEL = REPO / "v2" / "skeleton"

SECTIONS = (
    '<section class="block" id="s1"><h2>One</h2>'
    '<div data-component="glossary" data-key="s1gl"></div></section>'
    '<section class="block" id="s2"><h2>Two</h2></section>'
)
DATA = 'LN.data.s1gl={groups:[{name:"G",terms:[{t:"a",d:"b"}]}]};'

LAYOUTS = ["desk", "app", "feed", "sheet"]


def make_real_wd(tmp_path, layout=None, omit_layout=False):
    wd = tmp_path / "wd"
    wd.mkdir(parents=True)
    cfg = {"title": "T", "theme": "studio", "components": ["glossary"],
           "output": "out.html"}
    if not omit_layout:
        cfg["layout"] = layout
    (wd / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--accent:#33608f;}", encoding="utf-8")
    (wd / "sections.html").write_text(SECTIONS, encoding="utf-8")
    (wd / "data.js").write_text(DATA, encoding="utf-8")
    return wd


def test_known_layouts_build(tmp_path):
    for layout in LAYOUTS:
        wd = make_real_wd(tmp_path / layout, layout=layout)
        out, errs, _ = build.assemble(wd, SKEL)
        assert errs == [], (layout, [str(e) for e in errs])
        assert 'data-layout="%s"' % layout in out
        assert "@media print" in out
        assert out.count("<section") >= 2
        assert "/*__" not in out and "<!--__" not in out


def test_missing_layout_defaults_to_desk(tmp_path):
    wd = make_real_wd(tmp_path, omit_layout=True)
    out, errs, _ = build.assemble(wd, SKEL)
    assert errs == [], [str(e) for e in errs]
    assert 'data-layout="desk"' in out


def test_unknown_layout_errors(tmp_path):
    wd = make_real_wd(tmp_path, layout="nope")
    out, errs, _ = build.assemble(wd, SKEL)
    assert out is None
    assert any(e.rule == "layout" for e in errs), [str(e) for e in errs]


def test_layout_css_hex_rejected(tmp_path):
    wd = make_real_wd(tmp_path, layout="desk")
    # use a private skeleton copy so the shipped file is never touched
    import shutil
    skel = tmp_path / "skel"
    shutil.copytree(SKEL, skel)
    (skel / "layouts" / "desk" / "layout.css").write_text(
        ".x{color:#ff0000}", encoding="utf-8")
    out, errs, _ = build.assemble(wd, skel)
    assert out is None
    assert any(e.rule == "hex" for e in errs), [str(e) for e in errs]
