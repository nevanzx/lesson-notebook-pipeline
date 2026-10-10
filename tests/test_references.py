from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SHELL = REPO / "v2" / "skeleton" / "shell.html"


def test_shell_has_refs_class():
    css = SHELL.read_text(encoding="utf-8")
    assert ".refs{" in css.replace(" ", "")
    assert "text-indent:-1.6em" in css.replace(" ", "")


import json

import build


def _mini_skel(tmp_path, components=("demo",)):
    """make_skel plus an `app` layout: the build pins layout to app (v2.12)."""
    from test_build import make_skel
    skel = make_skel(tmp_path, components=components)
    app = skel / "layouts" / "app"
    app.mkdir(parents=True, exist_ok=True)
    for f in ("layout.css", "layout.js", "chrome.html"):
        (app / f).write_text((skel / "layouts" / "desk" / f).read_text(encoding="utf-8"),
                             encoding="utf-8")
    return skel


def _skel_wd(tmp_path, *, outline, refs, section_html=None, components=("demo",)):
    from test_build import make_workdir
    skel = _mini_skel(tmp_path, components=components)
    files = {
        "sections.html": section_html or (
            '<section class="block" id="s1"><h2 data-present="0">S</h2>'
            '<p data-present="1">Cost rises (Reyes, 2020).</p>'
            '<div data-component="demo" data-key="gl"></div></section>'),
    }
    wd = make_workdir(tmp_path, components=components, files=files)
    if outline is not None:
        (wd / "outline.json").write_text(json.dumps(outline), encoding="utf-8")
    if refs is not None:
        (wd / "refs.json").write_text(json.dumps(refs), encoding="utf-8")
    return skel, wd


def _outline(refs_section=True):
    secs = [{"id": "s1", "title": "S", "from": ["RECAP"]}]
    if refs_section:
        secs.append({"id": "references", "title": "9  References", "from": []})
    return {"source": "x", "source_titles": ["RECAP"], "sections": secs, "dropped": []}


def test_references_block_rendered(tmp_path):
    refs = {"refs": [{"key": "reye2020",
                      "text": "Reyes, A. (2020). Cost accounting. Manila Press."}]}
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=refs)
    out, errs, _ = build.assemble(wd, skel)
    assert errs == [], [str(e) for e in errs]
    assert '<section class="block" id="references">' in out
    assert '<h2>9  References</h2>' in out
    assert "Cost accounting. Manila Press." in out


def test_sidecar_refs_merged_and_deduped(tmp_path):
    from test_build import make_workdir
    skel = _mini_skel(tmp_path)
    files = {
        "sections.html": ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
                          '<p data-present="1">A (Reyes, 2020).</p>'
                          '<div data-component="demo" data-key="gl"></div></section>'),
    }
    wd = make_workdir(tmp_path, files=files)
    (wd / "outline.json").write_text(json.dumps(_outline()), encoding="utf-8")
    (wd / "parts").mkdir()
    (wd / "parts" / "01-a.refs.json").write_text(json.dumps(
        {"refs": [{"key": "r", "text": "Reyes, A. (2020). Cost. P."}]}), encoding="utf-8")
    (wd / "parts" / "02-b.refs.json").write_text(json.dumps(
        {"refs": [{"key": "r", "text": "Reyes, A. (2020). Cost. P."}]}), encoding="utf-8")
    out, errs, _ = build.assemble(wd, skel)
    assert errs == [], [str(e) for e in errs]
    assert out.count("Reyes, A. (2020)") == 1


def test_duplicate_key_conflict_errors(tmp_path):
    from test_build import make_workdir
    skel = _mini_skel(tmp_path)
    files = {
        "sections.html": ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
                          '<p data-present="1">A (Reyes, 2020).</p>'
                          '<div data-component="demo" data-key="gl"></div></section>'),
    }
    wd = make_workdir(tmp_path, files=files)
    (wd / "outline.json").write_text(json.dumps(_outline()), encoding="utf-8")
    (wd / "parts").mkdir()
    (wd / "parts" / "01-a.refs.json").write_text(json.dumps(
        {"refs": [{"key": "r", "text": "Reyes, A. (2020). One."}]}), encoding="utf-8")
    (wd / "parts" / "02-b.refs.json").write_text(json.dumps(
        {"refs": [{"key": "r", "text": "Reyes, A. (2020). Two."}]}), encoding="utf-8")
    _, errs, _ = build.assemble(wd, skel)
    assert "references" in [e.rule for e in errs]


def test_missing_references_section_fails(tmp_path):
    refs = {"refs": [{"key": "r", "text": "Reyes, A. (2020). Cost. P."}]}
    skel, wd = _skel_wd(tmp_path, outline=_outline(refs_section=False), refs=refs)
    _, errs, _ = build.assemble(wd, skel)
    assert "references" in [e.rule for e in errs]


def test_no_refs_fails(tmp_path):
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=None)
    _, errs, _ = build.assemble(wd, skel)
    assert "references" in [e.rule for e in errs]


def test_unmatched_citation_fails(tmp_path):
    refs = {"refs": [{"key": "r", "text": "Reyes, A. (2020). Cost. P."}]}
    sec = ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
           '<p data-present="1">X (Ghost, 1999).</p>'
           '<div data-component="demo" data-key="gl"></div></section>')
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=refs, section_html=sec)
    _, errs, _ = build.assemble(wd, skel)
    assert any(e.rule == "references" and "no matching reference" in e.msg for e in errs)


def test_orphan_reference_fails(tmp_path):
    refs = {"refs": [
        {"key": "r", "text": "Reyes, A. (2020). Cost. P."},
        {"key": "x", "text": "Cruz, B. (2019). Never cited. Q."},
    ]}
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=refs)
    _, errs, _ = build.assemble(wd, skel)
    assert any(e.rule == "references" and "never cited" in e.msg for e in errs)


def test_doi_in_references_allowed(tmp_path):
    refs = {"refs": [{"key": "r",
                      "text": "Reyes, A. (2020). Cost. P. https://doi.org/10.1000/xyz"}]}
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=refs)
    out, errs, _ = build.assemble(wd, skel)
    assert errs == [], [str(e) for e in errs]
    assert "https://doi.org/10.1000/xyz" in out


def test_url_outside_references_still_fails(tmp_path):
    refs = {"refs": [{"key": "r", "text": "Reyes, A. (2020). Cost. P."}]}
    sec = ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
           '<p data-present="1">See https://example.com (Reyes, 2020).</p>'
           '<div data-component="demo" data-key="gl"></div></section>')
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=refs, section_html=sec)
    _, errs, _ = build.assemble(wd, skel)
    assert "external" in [e.rule for e in errs]


def test_activity_scan_skips_references():
    import importlib.util
    p = REPO / "v2" / "tools" / "activity_numbers.py"
    spec = importlib.util.spec_from_file_location("activity_numbers", p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert "references" in mod.skip_sections

