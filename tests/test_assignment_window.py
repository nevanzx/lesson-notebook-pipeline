import io
import json
import contextlib
import build
from test_build import make_skel


def build_run(skel, work, cwd, monkeypatch):
    monkeypatch.chdir(cwd)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(work)])
    return rc, buf.getvalue()


def _assign_items():
    return ([{"type": "mc", "prompt": "q%d" % i,
              "choices": ["a", "b", "c", "d"], "ans": 1} for i in range(10)]
            + [{"type": "tf", "prompt": "t%d" % i, "ans": i % 2 == 0} for i in range(4)]
            + [{"type": "id", "prompt": "i%d" % j, "aliases": ["x"]} for j in range(4)]
            + [{"type": "sa", "prompt": "s%d" % j, "key_points": ["k"],
                "rubric": "1 pt: names the point", "max_points": 1} for j in range(2)])


def workdir(tmp_path, cfg):
    w = tmp_path / "w"
    w.mkdir()
    (w / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="x"><h2>A B</h2>'
        '<div data-component="assignment" data-key="a1"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text(
        "LN.data.a1 = " + json.dumps({"intro": "i", "items": _assign_items()}) + ";",
        encoding="utf-8")
    return w


BASE = {"title": "T", "theme": "mini", "components": ["assignment"],
        "output": "out.html", "week": 4, "subject": "S"}


def test_absent_window_defaults_to_wednesday_manila(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("assignment",))
    w = workdir(tmp_path, BASE)
    rc, out = build_run(skel, w, tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert '<meta name="ln:window-day" content="wednesday">' in html
    assert '<meta name="ln:window-tz" content="Asia/Manila">' in html


def test_custom_window_baked(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("assignment",))
    cfg = dict(BASE, window={"day": "friday", "tz": "Asia/Tokyo"})
    rc, out = build_run(skel, workdir(tmp_path, cfg), tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert '<meta name="ln:window-day" content="friday">' in html
    assert '<meta name="ln:window-tz" content="Asia/Tokyo">' in html


def test_bad_day_fails(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("assignment",))
    cfg = dict(BASE, window={"day": "wednesdey", "tz": "Asia/Manila"})
    rc, out = build_run(skel, workdir(tmp_path, cfg), tmp_path, monkeypatch)
    assert rc == 1
    assert "wednesdey" in out or "day" in out


def test_empty_tz_fails(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("assignment",))
    cfg = dict(BASE, window={"day": "wednesday", "tz": ""})
    rc, out = build_run(skel, workdir(tmp_path, cfg), tmp_path, monkeypatch)
    assert rc == 1
    assert "tz" in out


def test_unknown_window_key_fails(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("assignment",))
    cfg = dict(BASE, window={"day": "wednesday", "tz": "Asia/Manila", "x": 1})
    rc, out = build_run(skel, workdir(tmp_path, cfg), tmp_path, monkeypatch)
    assert rc == 1
    assert "x" in out


def test_window_without_assignment_fails(tmp_path, monkeypatch):
    skel = make_skel(tmp_path, components=("demo",))
    cfg = {"title": "T", "theme": "mini", "components": ["demo"],
           "output": "out.html", "window": {"day": "wednesday", "tz": "Asia/Manila"}}
    w = tmp_path / "w"
    w.mkdir()
    (w / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="x"><h2>A B</h2>'
        '<div data-component="demo" data-key="d1"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text("LN.data.d1 = {};", encoding="utf-8")
    rc, out = build_run(skel, w, tmp_path, monkeypatch)
    assert rc == 1
    assert "window" in out and "assignment" in out
