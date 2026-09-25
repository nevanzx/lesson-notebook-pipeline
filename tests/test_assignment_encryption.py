import base64
import contextlib
import io
import json
import re

import build
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from test_build import make_skel

ENV_KEY_B64 = base64.b64encode(bytes(range(32))).decode("ascii")


def _items():
    return ([{"type": "mc", "prompt": "qPrompt%d" % i,
              "choices": ["choiceX", "b", "c", "d"], "ans": 1} for i in range(10)]
            + [{"type": "tf", "prompt": "tPrompt%d" % i,
                "ans": i % 2 == 0} for i in range(4)]
            + [{"type": "id", "prompt": "iPrompt%d" % j,
                "aliases": ["aliasZ"]} for j in range(4)]
            + [{"type": "sa", "prompt": "sPrompt%d" % j, "key_points": ["kpW"],
                "rubric": "1 pt: the point", "max_points": 1} for j in range(2)])


def _workdir(tmp_path):
    w = tmp_path / "w"
    w.mkdir(exist_ok=True)
    (w / "build.json").write_text(json.dumps(
        {"title": "T", "theme": "mini", "components": ["assignment"],
         "output": "out.html", "week": 4, "subject": "S"}), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="x"><h2>A B</h2>'
        '<div data-component="assignment" data-key="a1"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text(
        "LN.data.a1 = " + json.dumps({"intro": "introSentinel",
                                      "items": _items()}) + ";",
        encoding="utf-8")
    return w


def _run(tmp_path, monkeypatch, cwd=None):
    monkeypatch.delenv("LN_UNLOCK_KEY", raising=False)
    skel = tmp_path / "skel"
    if not skel.exists():
        make_skel(tmp_path, components=("assignment",))
    cwd = cwd or tmp_path
    monkeypatch.chdir(cwd)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(_workdir(tmp_path))])
    return rc, buf.getvalue()


def _envelope(html):
    m = re.search(r"LN\.data\.a1 = (\{.*?\});", html)
    assert m, "LN.data.a1 missing from output"
    return json.loads(m.group(1))


def _decrypt(env, key_bytes):
    pt = AESGCM(key_bytes).decrypt(base64.b64decode(env["iv"]),
                                   base64.b64decode(env["ct"]), None)
    return json.loads(pt.decode("utf-8"))


def test_output_ships_envelope_and_no_plaintext(tmp_path, monkeypatch):
    rc, out = _run(tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    env = _envelope(html)
    assert env["lnenc"] == 1 and env["v"] == 1
    assert set(env) == {"lnenc", "v", "iv", "ct"}
    for needle in ("qPrompt0", "tPrompt0", "iPrompt0", "sPrompt0", "choiceX",
                   "introSentinel", "aliasZ", "kpW", '"ans"', "rubric",
                   "max_points"):
        assert needle not in html, needle


def test_envelope_decrypts_to_sanitized_object(tmp_path, monkeypatch):
    rc, out = _run(tmp_path, monkeypatch)
    assert rc == 0, out
    key_bytes = base64.b64decode(
        (tmp_path / "build" / "key" / "unlock.key")
        .read_text(encoding="ascii").strip())
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    safe = _decrypt(_envelope(html), key_bytes)
    assert safe["intro"] == "introSentinel"
    assert len(safe["items"]) == 20
    assert safe["items"][0] == {"type": "mc", "prompt": "qPrompt0",
                                "choices": ["choiceX", "b", "c", "d"]}
    assert safe["items"][10] == {"type": "tf", "prompt": "tPrompt0"}
    assert safe["items"][14] == {"type": "id", "prompt": "iPrompt0"}
    assert safe["items"][18] == {"type": "sa", "prompt": "sPrompt0"}
    assert "ans" not in json.dumps(safe)


def test_key_file_created_once_and_reused(tmp_path, monkeypatch):
    rc, out = _run(tmp_path, monkeypatch)
    assert rc == 0, out
    kf = tmp_path / "build" / "key" / "unlock.key"
    first = kf.read_text(encoding="ascii")
    html1 = (tmp_path / "out.html").read_text(encoding="utf-8")
    (tmp_path / "out.html").unlink()
    rc, out = _run(tmp_path, monkeypatch)
    assert rc == 0, out
    assert kf.read_text(encoding="ascii") == first
    env = _envelope((tmp_path / "out.html").read_text(encoding="utf-8"))
    _decrypt(env, base64.b64decode(first.strip()))


def test_env_key_wins_and_file_is_not_written(tmp_path, monkeypatch):
    monkeypatch.delenv("LN_UNLOCK_KEY", raising=False)
    monkeypatch.setenv("LN_UNLOCK_KEY", ENV_KEY_B64)
    skel = make_skel(tmp_path, components=("assignment",))
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(_workdir(tmp_path))])
    assert rc == 0, buf.getvalue()
    assert not (tmp_path / "build" / "key" / "unlock.key").exists()
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    safe = _decrypt(_envelope(html), base64.b64decode(ENV_KEY_B64))
    assert safe["items"][0]["prompt"] == "qPrompt0"


def test_damaged_key_file_fails_build(tmp_path, monkeypatch):
    (tmp_path / "build" / "key").mkdir(parents=True)
    (tmp_path / "build" / "key" / "unlock.key").write_text(
        "not-base64-!!", encoding="ascii")
    rc, out = _run(tmp_path, monkeypatch)
    assert rc == 1
    assert "unlock.key" in out


def test_env_key_wrong_length_fails_build(tmp_path, monkeypatch):
    monkeypatch.delenv("LN_UNLOCK_KEY", raising=False)
    monkeypatch.setenv("LN_UNLOCK_KEY",
                       base64.b64encode(b"x" * 16).decode("ascii"))
    skel = make_skel(tmp_path, components=("assignment",))
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(_workdir(tmp_path))])
    assert rc == 1
    assert "unlock.key" in buf.getvalue() or "LN_UNLOCK_KEY" in buf.getvalue()
