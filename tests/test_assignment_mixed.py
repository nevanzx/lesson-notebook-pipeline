import contextlib
import io
import json
from pathlib import Path

import build
from test_build import make_skel

ASSIGN_COMP = (Path(__file__).resolve().parents[1]
               / "v2" / "skeleton" / "components" / "assignment")


def _skel(tmp_path):
    skel = make_skel(tmp_path, components=("assignment",))
    cd = skel / "components" / "assignment"
    for name in ("component.css", "component.js"):
        (cd / name).write_text(
            (ASSIGN_COMP / name).read_text(encoding="utf-8"), encoding="utf-8")
    return skel


def _mixed_work(tmp_path):
    w = tmp_path / "w"
    w.mkdir()
    (w / "build.json").write_text(json.dumps(
        {"title": "T", "theme": "mini", "components": ["assignment"],
         "output": "o.html", "week": 4, "subject": "S"}), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="assign"><h2>6 Assignment</h2>'
        '<p data-present="1">A.</p>'
        '<div data-component="assignment" data-key="assign7"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text(
        "LN.data.assign7 = " + json.dumps(_deck()) + ";", encoding="utf-8")
    return w


def _mc(i, ans):
    return {"type": "mc", "prompt": "Which term fills blank %d?" % (i + 1),
            "choices": ["alpha", "beta", "gamma", "delta"], "ans": ans}


def _tf(i, ans):
    return {"type": "tf", "prompt": "Statement %d is true." % (i + 1),
            "ans": ans}


def _multi(i):
    return {"type": "multi", "prompt": "Select all the correct options.",
            "choices": ["Alpha", "Beta", "Gamma", "Delta"], "ans": [0, 1]}


def _deck():
    items = []
    for i, ans in enumerate([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]):
        items.append(_mc(i, ans))
    for i, ans in enumerate([True, False, True, False,
                             True, False, True, False]):
        items.append(_tf(i, ans))
    for i in range(2):
        items.append(_multi(i))
    return {"mode": "mixed", "intro": "i", "items": items}


def _msgs(errs):
    return [e.msg for e in errs]


def test_mixed_deck_validates():
    errs = []
    build.validate_assignment(_deck(), errs, expected_mode="mixed")
    assert not errs, _msgs(errs)


def test_mixed_deck_counts():
    data = _deck()
    data["items"].pop()
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("expected exactly" in e.msg for e in errs), _msgs(errs)


def test_mixed_rejects_sa_and_unknown_types():
    data = _deck()
    data["items"][0] = {"type": "sa", "prompt": "x"}
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("unknown type" in e.msg for e in errs), _msgs(errs)


def test_mixed_rejects_missing_mode():
    data = _deck()
    data.pop("mode")
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("!= build.json assignment" in e.msg for e in errs), _msgs(errs)


def test_mc_ans_bounds():
    for bad in (-1, 4, "1", True):
        data = _deck()
        data["items"][0]["ans"] = bad
        errs = []
        build.validate_assignment(data, errs, expected_mode="mixed")
        assert any("mc item 1 needs ans 0..3" in e.msg for e in errs), (
            bad, _msgs(errs))


def test_mc_answer_position_cap():
    data = _deck()
    for it in data["items"][:10]:
        it["ans"] = 0
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("answer position 0" in e.msg for e in errs), _msgs(errs)


def test_mc_choices_within_one_word():
    data = _deck()
    data["items"][0]["choices"] = ["alpha", "beta", "gamma", "a longer delta"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("vary by 2 words" in e.msg for e in errs), _msgs(errs)


def test_mc_banned_choice():
    data = _deck()
    data["items"][0]["choices"] = ["alpha", "beta", "gamma", "All of the above"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("uses 'All of the above'" in e.msg for e in errs), _msgs(errs)


def test_mc_duplicate_choices_rejected():
    data = _deck()
    data["items"][0]["choices"] = ["alpha", "beta", "gamma", "Gamma!"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("equal after normalization" in e.msg for e in errs), _msgs(errs)


def test_tf_ans_must_be_boolean():
    data = _deck()
    data["items"][10]["ans"] = "true"
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("needs a boolean ans" in e.msg for e in errs), _msgs(errs)


def test_tf_balance():
    data = _deck()
    for it in data["items"][10:18]:
        it["ans"] = True
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("at least 3 of each" in e.msg for e in errs), _msgs(errs)


def test_multi_rules_shared_with_error_mode():
    data = _deck()
    data["items"][18]["choices"] = ["A", "B", "C"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("needs 4-8 non-empty choices" in e.msg for e in errs), _msgs(errs)

    data = _deck()
    data["items"][18]["ans"] = [0, 1, 2, 3]
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("selects all choices" in e.msg for e in errs), _msgs(errs)


def test_multi_mean_length_cap():
    data = _deck()
    for it in data["items"][18:]:
        it["choices"] = ["a b c", "d e f", "g", "h"]
        it["ans"] = [0, 1]
    errs = []
    build.validate_assignment(data, errs, expected_mode="mixed")
    assert any("mean length" in e.msg for e in errs), _msgs(errs)


def test_sanitize_strips_ans():
    data = _deck()
    text = "LN.data.x = " + json.dumps(data) + ";"
    out = build.sanitize_assignment_data(text, "x", data)
    obj = json.loads(out.split("LN.data.x = ", 1)[1].rstrip(";"))
    assert obj["mode"] == "mixed"
    for it in obj["items"]:
        assert "ans" not in it
    assert obj["items"][0]["choices"] == data["items"][0]["choices"]
    assert "choices" not in obj["items"][10]  # tf carries no options
    assert obj["items"][18]["choices"] == data["items"][18]["choices"]


def test_key_file_mixed_branch(tmp_path):
    data = _deck()
    run = tmp_path / "run"
    run.mkdir()
    keys = build.ensure_teacher_keys(run / "build" / "key")
    kf = build.write_key_file(
        run, {"title": "T", "output": "Week1-Notebook.html",
              "week": 1, "subject": "S"}, data, keys)
    body = json.loads(kf.read_text(encoding="utf-8"))
    assert body["mode"] == "mixed"
    assert len(body["items"]) == 20
    row = body["items"][0]
    assert row["n"] == 1 and row["type"] == "mc"
    assert row["choices"] == data["items"][0]["choices"]
    assert row["ans"] == data["items"][0]["ans"]
    trow = body["items"][10]
    assert trow["n"] == 11 and trow["type"] == "tf"
    assert "choices" not in trow
    assert trow["ans"] == data["items"][10]["ans"]
    mrow = body["items"][18]
    assert mrow["n"] == 19 and mrow["type"] == "multi"
    assert mrow["choices"] == data["items"][18]["choices"]
    assert mrow["ans"] == data["items"][18]["ans"]


def test_default_config_mode_is_mixed():
    errs = []
    build.validate_assign_cfg({"components": ["assignment"]}, errs)
    assert not errs, _msgs(errs)
    assert build.validate_assign_cfg({"components": ["assignment"], "assignment": "mixed"},
                                     []) is None


def test_mixed_mode_builds_end_to_end(tmp_path, monkeypatch):
    skel = _skel(tmp_path)
    w = _mixed_work(tmp_path)
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(w)])
    out = buf.getvalue()
    assert rc == 0, out

    html = (tmp_path / "o.html").read_text(encoding="utf-8")
    assert '"lnenc": 1' in html
    assert '"ans"' not in html and "'ans'" not in html
    assert "Which term fills blank" not in html

    kf = tmp_path / "build" / "key" / "o-key.json"
    assert kf.exists()
    body = json.loads(kf.read_text(encoding="utf-8"))
    assert body["mode"] == "mixed"
    assert len(body["items"]) == 20
    types = [row["type"] for row in body["items"]]
    assert types.count("mc") == 10
    assert types.count("tf") == 8
    assert types.count("multi") == 2
    for row in body["items"]:
        assert "ans" in row
