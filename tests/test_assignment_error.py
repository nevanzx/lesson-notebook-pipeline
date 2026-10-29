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


def _error_work(tmp_path):
    w = tmp_path / "w"
    w.mkdir()
    (w / "build.json").write_text(json.dumps(
        {"title": "T", "theme": "mini", "components": ["assignment"],
         "output": "o.html", "week": 4, "subject": "S",
         "assignment": "error"}), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="assign"><h2>6 Assignment</h2>'
        '<p data-present="1">A.</p>'
        '<div data-component="assignment" data-key="assign7"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text(
        "LN.data.assign7 = " + json.dumps(_deck()) + ";", encoding="utf-8")
    return w


def _err(i, statement, choices, ans):
    return {"type": "err", "statement": statement, "choices": choices, "ans": ans}


def _multi(i, prompt, choices, ans):
    return {"type": "multi", "prompt": prompt, "choices": choices, "ans": ans}


def _deck():
    items = []
    stmt = "Alpha rises while beta falls because gamma is constant."
    choices = ["Alpha rises", "beta falls", "because gamma is constant", "is constant"]
    ans_cycle = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]
    for i in range(12):
        items.append(_err(i, stmt, choices, ans_cycle[i]))
    for i in range(8):
        items.append(_multi(i, "Select all types.", ["A", "B", "C", "D"], [0, 1]))
    return {"mode": "error", "intro": "i", "items": items}


def test_error_deck_validates():
    errs = []
    build.validate_assignment(_deck(), errs, expected_mode="error")
    assert not errs, [str(e) for e in errs]


def test_error_deck_counts():
    data = _deck()
    data["items"].pop()
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("12 err" in e.msg or "8 multi" in e.msg for e in errs)


def test_unknown_type_and_sa_rejected():
    data = _deck()
    data["items"][12] = {"type": "sa", "prompt": "x"}
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("unknown type" in e.msg for e in errs)


def test_err_choice_must_be_verbatim():
    data = _deck()
    data["items"][0]["choices"] = ["Alpha", "rise", "beta", "gamma"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("verbatim" in e.msg for e in errs)


def test_err_choice_must_be_unique_in_statement():
    data = _deck()
    data["items"][0]["statement"] = (
        "Alpha rises while beta rises because gamma is constant.")
    data["items"][0]["choices"] = [
        "Alpha rises", "beta rises", "because gamma is constant", "rises"]
    data["items"][0]["ans"] = 0
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("verbatim" in e.msg and "exactly once" in e.msg for e in errs)


def test_err_duplicate_choices_rejected():
    data = _deck()
    data["items"][0]["choices"] = [
        "Alpha rises", "Alpha rises", "beta falls", "is constant"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("repeats a choice" in e.msg for e in errs)


def test_err_normalized_duplicate_choices_rejected():
    data = _deck()
    data["items"][0]["statement"] = "Price rises then price falls."
    data["items"][0]["choices"] = ["Price", "price", "rises", "falls"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("normaliz" in e.msg for e in errs), [str(e) for e in errs]


def test_err_punctuation_only_choice_rejected():
    data = _deck()
    data["items"][0]["choices"] = [
        "Alpha rises", "beta falls", "\u2014", "is constant"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("no letters or digits" in e.msg for e in errs), [str(e) for e in errs]


def test_multi_normalized_duplicate_choices_rejected():
    data = _deck()
    data["items"][12]["choices"] = ["Price", "price", "C", "D"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("normaliz" in e.msg for e in errs), [str(e) for e in errs]


def test_multi_punctuation_only_choice_rejected():
    data = _deck()
    data["items"][12]["choices"] = ["A", "B", "\u2014", "D"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("no letters or digits" in e.msg for e in errs), [str(e) for e in errs]


def test_err_ans_bounds():
    data = _deck()
    data["items"][0]["ans"] = 7
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("ans 0..3" in e.msg for e in errs)


def test_err_position_cap():
    data = _deck()
    for i in (1, 3, 5, 9):
        data["items"][i]["ans"] = 0
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("position 0 used" in e.msg and "cap" in e.msg for e in errs)


def test_long_span_floor():
    data = _deck()
    for it in data["items"][:12]:
        it["ans"] = 0
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("4+ words" in e.msg for e in errs)


def test_four_sentence_statement_rejected():
    data = _deck()
    data["items"][0]["statement"] = "One. Two. Three. Four."
    data["items"][0]["choices"] = ["One", "Two", "Three", "Four"]
    data["items"][0]["ans"] = 0
    assert build._sentence_count(data["items"][0]["statement"]) == 4
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("sentences" in e.msg for e in errs)


def test_abbreviation_sentences_do_not_overcount():
    data = _deck()
    data["items"][0]["statement"] = "Dr. Smith went home. He slept."
    assert build._sentence_count(data["items"][0]["statement"]) == 2
    data["items"][0]["choices"] = ["Dr. Smith", "went home", "He slept", "home"]
    data["items"][0]["ans"] = 2
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert not errs, [str(e) for e in errs]


def test_dotted_abbreviation_sentences_do_not_overcount():
    data = _deck()
    data["items"][0]["statement"] = (
        "The U.S. economy grows. Prices rise. Wages fall.")
    assert build._sentence_count(data["items"][0]["statement"]) == 3
    data["items"][0]["choices"] = [
        "The U.S. economy grows", "Prices rise", "Wages fall", "economy grows"]
    data["items"][0]["ans"] = 2
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert not errs, [str(e) for e in errs]


def test_quoted_terminator_counts_as_sentence_end():
    data = _deck()
    data["items"][0]["statement"] = 'He said "stop." Then he left.'
    assert build._sentence_count(data["items"][0]["statement"]) == 2
    data["items"][0]["choices"] = ["He said", "stop", "Then he left", "he left"]
    data["items"][0]["ans"] = 2
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert not errs, [str(e) for e in errs]


def test_multi_ans_bounds():
    data = _deck()
    data["items"][12]["ans"] = [0]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("ans" in e.msg for e in errs)
    data = _deck()
    data["items"][12]["ans"] = [0, 1, 2, 3]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("ans" in e.msg for e in errs)


def test_err_empty_statement_rejected():
    data = _deck()
    data["items"][0]["statement"] = "  "
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("empty statement" in e.msg for e in errs), [str(e) for e in errs]


def test_multi_empty_prompt_rejected():
    data = _deck()
    data["items"][12]["prompt"] = ""
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("prompt" in e.msg for e in errs), [str(e) for e in errs]


def test_multi_nine_choices_rejected():
    data = _deck()
    data["items"][12]["choices"] = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("4-8" in e.msg or "choices" in e.msg for e in errs), [str(e) for e in errs]


def test_err_choice_count_must_be_four():
    for n in (3, 5):
        data = _deck()
        data["items"][0]["choices"] = ["Alpha", "rises", "beta falls", "gamma", "constant"][:n]
        errs = []
        build.validate_assignment(data, errs, expected_mode="error")
        assert any("exactly 4" in e.msg or "choices" in e.msg for e in errs), (
            n, [str(e) for e in errs])


def test_longest_cap():
    data = _deck()
    for i in range(5):
        data["items"][i]["choices"] = ["Alpha", "rises", "beta", "falls now"]
        data["items"][i]["ans"] = 3
        data["items"][i]["statement"] = "Alpha rises while beta falls now."
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("longest" in e.msg for e in errs)


def test_multi_mean_length_cap():
    data = _deck()
    for i in range(12, 17):
        data["items"][i]["choices"] = ["a b c", "d e f", "g", "h"]
        data["items"][i]["ans"] = [0, 1]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("mean length" in e.msg for e in errs)


def test_sanitize_strips_ans():
    data = _deck()
    text = "LN.data.x = " + json.dumps(data) + ";"
    out = build.sanitize_assignment_data(text, "x", data)
    obj = json.loads(out.split("LN.data.x = ", 1)[1].rstrip(";"))
    for it in obj["items"]:
        assert "ans" not in it
    assert obj["items"][0]["statement"]
    assert obj["items"][0]["choices"] == data["items"][0]["choices"]
    assert obj["items"][12]["prompt"]
    assert obj["items"][12]["choices"] == data["items"][12]["choices"]


def test_key_file_error_branch(tmp_path):
    data = _deck()
    run = tmp_path / "run"
    run.mkdir()
    keys = build.ensure_teacher_keys(run / "build" / "key")
    kf = build.write_key_file(
        run, {"title": "T", "output": "Week1-Notebook.html",
              "week": 1, "subject": "S"}, data, keys)
    body = json.loads(kf.read_text(encoding="utf-8"))
    assert body["mode"] == "error"
    assert len(body["items"]) == 20
    row = body["items"][0]
    assert row["n"] == 1 and row["type"] == "err"
    assert row["statement"] == data["items"][0]["statement"]
    assert row["choices"] == data["items"][0]["choices"]
    assert row["ans"] == data["items"][0]["ans"]
    mrow = body["items"][12]
    assert mrow["n"] == 13 and mrow["type"] == "multi"
    assert "statement" not in mrow
    assert mrow["prompt"] == data["items"][12]["prompt"]
    assert mrow["choices"] == data["items"][12]["choices"]
    assert mrow["ans"] == data["items"][12]["ans"]


def test_explicit_error_config_validates():
    errs = []
    build.validate_assign_cfg(
        {"components": ["assignment"], "assignment": "error"}, errs)
    assert not errs, [str(e) for e in errs]


def test_error_mode_builds_end_to_end(tmp_path, monkeypatch):
    skel = _skel(tmp_path)
    w = _error_work(tmp_path)
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(w)])
    out = buf.getvalue()
    assert rc == 0, out

    html = (tmp_path / "o.html").read_text(encoding="utf-8")
    assert '"lnenc": 1' in html
    assert '"ans"' not in html and "'ans'" not in html
    assert "Alpha rises while beta falls" not in html
    assert "Select all types." not in html

    kf = tmp_path / "build" / "key" / "o-key.json"
    assert kf.exists()
    body = json.loads(kf.read_text(encoding="utf-8"))
    assert body["mode"] == "error"
    assert len(body["items"]) == 20
    types = [row["type"] for row in body["items"]]
    assert types.count("err") == 12 and types.count("multi") == 8
    for row in body["items"]:
        assert "ans" in row
        if row["type"] == "err":
            assert isinstance(row["ans"], int) and not isinstance(row["ans"], bool)
            assert row["statement"]
        else:
            assert isinstance(row["ans"], list) and row["ans"]
            assert row["prompt"]
