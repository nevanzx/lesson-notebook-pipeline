import io
import json
import re
import contextlib
from pathlib import Path
import build
from test_build import make_skel

COMP = Path(__file__).resolve().parents[1] / "v2" / "skeleton" / "components" / "assignment"


def _skel(tmp_path):
    skel = make_skel(tmp_path, components=("assignment",))
    cd = skel / "components" / "assignment"
    (cd / "component.css").write_text(
        (Path("v2/skeleton/components/assignment/component.css")
         .read_text(encoding="utf-8")), encoding="utf-8")
    (cd / "component.js").write_text(
        (Path("v2/skeleton/components/assignment/component.js")
         .read_text(encoding="utf-8")), encoding="utf-8")
    return skel


def _work(tmp_path):
    w = tmp_path / "w"
    w.mkdir()
    items = ([{"type": "mc", "prompt": "q%d" % i,
               "choices": ["a", "b", "c", "d"], "ans": 1} for i in range(10)]
             + [{"type": "tf", "prompt": "t%d" % i, "ans": True} for i in range(4)]
             + [{"type": "id", "prompt": "i%d" % j, "aliases": ["x"]} for j in range(4)]
             + [{"type": "sa", "prompt": "s%d" % j, "key_points": ["k"]} for j in range(2)])
    (w / "build.json").write_text(json.dumps(
        {"title": "T", "theme": "mini", "components": ["assignment"],
         "output": "o.html", "week": 4, "subject": "S"}), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="assign"><h2>6 Assignment</h2>'
        '<div data-component="assignment" data-key="assign7"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text(
        "LN.data.assign7 = " + json.dumps({"intro": "i", "items": items}) + ";",
        encoding="utf-8")
    return w


def _build(tmp_path, skel, w, monkeypatch):
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(w)])
    text = (tmp_path / "o.html").read_text(encoding="utf-8") if rc == 0 else ""
    return rc, buf.getvalue(), text


def test_deck_ships_without_leak(tmp_path, monkeypatch):
    rc, out, html = _build(tmp_path, _skel(tmp_path), _work(tmp_path), monkeypatch)
    assert rc == 0, out
    for needle in ("lna-begin", "lna-watermark", "user-select:none", "PrintScreen",
                   "visibilitychange", "lna-cover", "requestFullscreen", "exiting"):
        assert needle in html, needle
    assert '"ans"' not in html and "'ans'" not in html
    assert "key_points" not in html and "aliases" not in html
    assert "RSA-OAEP-256+A256GCM" in html
    assert "download again" in html
    assert "__PUBKEY__" not in html and "__KEYID__" not in html


def test_export_body_carries_no_plaintext_answers():
    js = Path("v2/skeleton/components/assignment/component.js").read_text(encoding="utf-8")
    m = re.search(r"var full = \{.*?\};", js, re.S)
    assert m, "export envelope literal not found"
    full_literal = m.group(0)
    assert "answers" not in full_literal
    assert "enc:" in full_literal and "wk:" in full_literal


def test_component_files_clean():
    js = Path("v2/skeleton/components/assignment/component.js").read_text(encoding="utf-8")
    css = (Path("v2/skeleton/components/assignment/component.css").read_text(encoding="utf-8"))
    assert not re.search(r"\b(alert|confirm|prompt)\s*\(", js)
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b", css)
    assert "http" not in css and "@import" not in css
    assert not re.search(r"</[A-Za-z]", js)
    assert '__PUBKEY__' in js and '__KEYID__' in js, "build injects the public key"
