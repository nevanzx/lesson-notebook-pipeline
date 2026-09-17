import json
import pytest
import build


def v20():
    items = []
    items += [{"type": "mc", "prompt": "q%d" % i,
               "choices": ["a", "b", "c", "d"], "ans": i % 4} for i in range(10)]
    items += [{"type": "tf", "prompt": "t%d" % i, "ans": i % 2 == 0}
              for i in range(4)]
    items += [{"type": "id", "prompt": "i%d" % j,
               "aliases": ["variable cost"]} for j in range(4)]
    items += [{"type": "sa", "prompt": "s%d" % j,
               "key_points": ["contribution margin"]} for j in range(2)]
    return {"intro": "i", "items": items}


def test_valid_mix_and_key_file(tmp_path):
    run = tmp_path / "run"
    run.mkdir()
    errs = []
    data = v20()
    build.validate_assignment(data, errs)
    assert not errs, [str(e) for e in errs]
    keys = build.ensure_teacher_keys(run / "build" / "key")
    kf = build.write_key_file(run, {"title": "T", "output": "Week4-Notebook.html",
                                    "week": 4, "subject": "Mgmt"}, data, keys)
    assert kf.name == "Week4-Notebook-key.json"
    assert kf.parent.name == "key"
    body = json.loads(kf.read_text(encoding="utf-8"))
    assert body["week"] == 4 and body["key_id"] == keys["id"]
    assert len(body["items"]) == 20
    assert body["items"][0]["ans"] == 0 and body["items"][0]["choices"][3] == "d"
    assert body["items"][10]["ans"] is True
    assert body["items"][14]["aliases"] == ["variable cost"]
    assert body["items"][19]["key_points"] == ["contribution margin"]
    assert "decrypt.py" in body["decrypt"]


def test_bad_mix_named(tmp_path):
    errs = []
    data = v20()
    data["items"][0]["type"] = "sa"
    build.validate_assignment(data, errs)
    assert errs and errs[-1].rule == "assign" and "expected 10" in errs[-1].msg


def test_field_checks(tmp_path):
    data = v20()
    data["items"][0]["choices"] = ["a", "b", "c"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("choices" in e.msg for e in errs)
    data = v20(); data["items"][0]["ans"] = 7
    errs = []
    build.validate_assignment(data, errs)
    assert any("ans" in e.msg for e in errs)
    data = v20(); del data["items"][18]["key_points"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("key_points" in e.msg for e in errs)
    data = v20(); del data["items"][10]["ans"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("ans" in e.msg for e in errs)
    data = v20(); data["items"][5]["prompt"] = " "
    errs = []
    build.validate_assignment(data, errs)
    assert any("prompt" in e.msg for e in errs)


def test_extract_from_mount(tmp_path):
    sec = '<div data-component="assignment" data-key="assign7"></div>'
    dat = "LN.data.assign7 = " + json.dumps(v20()) + ";\nLN.data.other = 1;"
    errs = []
    ka, dd = build.extract_assignment(sec, dat, errs)
    assert ka == "assign7" and dd and len(dd["items"]) == 20 and not errs


def test_extract_missing_object():
    errs = []
    ka, dd = build.extract_assignment(
        '<div data-component="assignment" data-key="zz9"></div>',
        "LN.data.other = 1;", errs)
    assert ka == "zz9" and dd is None and errs


def test_extract_unparsable_object():
    errs = []
    ka, dd = build.extract_assignment(
        '<div data-component="assignment" data-key="zz9"></div>',
        'LN.data.zz9 = {items: [,]};', errs)   # trailing comma → JSONDecodeError
    assert dd is None and errs


def test_sanitize_assignment_data_strips_answer_material():
    data = v20()
    data["items"][0]["prompt"] = "Sketch the answer flow, then answer fully."
    data["items"][9]["prompt"] = "One answer span must cite the lesson."
    dat = ('LN.data.xx = "keep me";\nLN.data.assign7 = '
           + json.dumps(data) + ";\n")
    out = build.sanitize_assignment_data(dat, "assign7", data)
    assert out.index('LN.data.xx = "keep me";') < out.index("LN.data.assign7")
    obj = json.loads(out.split("LN.data.assign7 = ", 1)[1].split(";", 1)[0])
    for i, it in enumerate(obj["items"]):
        assert it["prompt"] == data["items"][i]["prompt"]
        if it["type"] == "mc":
            assert it["choices"] == ["a", "b", "c", "d"]
        assert set(it) <= {"type", "prompt", "choices"}
        assert "ans" not in it and "aliases" not in it and "key_points" not in it
    assert "key_points" not in out and "aliases" not in out
    assert out.count("LN.data.xx") == 1
