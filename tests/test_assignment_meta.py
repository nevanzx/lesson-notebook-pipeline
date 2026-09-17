import io
import json
import contextlib
import build
from test_build import make_skel, MINI_SHELL


def build_run(skel, work, cwd, monkeypatch):
    monkeypatch.chdir(cwd)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(work)])
    return rc, buf.getvalue()


def workdir(tmp_path, cfg):
    w = tmp_path / "w"
    w.mkdir()
    (w / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="x"><h2>A B</h2>'
        '<div data-component="demo" data-key="x1"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text("LN.data.x1 = {};", encoding="utf-8")
    return w


def test_week_subject_injected_as_meta(tmp_path, monkeypatch):
    skel = make_skel(tmp_path)
    w = workdir(tmp_path, {"title": "T", "theme": "mini",
                           "components": ["demo"], "output": "out.html",
                           "week": 4, "subject": "Management Science"})
    rc, out = build_run(skel, w, tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert '<meta name="ln:week" content="4">' in html
    assert '<meta name="ln:subject" content="Management Science">' in html


def test_meta_html_escaped(tmp_path, monkeypatch):
    skel = make_skel(tmp_path)
    w = workdir(tmp_path, {"title": "T", "theme": "mini",
                           "components": ["demo"], "output": "out.html",
                           "week": 12, "subject": 'Oil & "Drills"'})
    rc, out = build_run(skel, w, tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert 'content="Oil &amp; &quot;Drills&quot;">' in html


def test_absent_keys_no_meta(tmp_path, monkeypatch):
    skel = make_skel(tmp_path)
    w = workdir(tmp_path, {"title": "T", "theme": "mini",
                           "components": ["demo"], "output": "out.html"})
    rc, out = build_run(skel, w, tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert "ln:week" not in html and "ln:subject" not in html
