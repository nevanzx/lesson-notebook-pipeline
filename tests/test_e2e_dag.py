import contextlib
import io
import json
import shutil
from pathlib import Path

import build

REPO = Path(__file__).resolve().parents[1]
FIX = REPO / "v2" / "sample" / "lesson-demo"


def _patch_fixture(tmp_path, monkeypatch):
    """Copy lesson-demo; swap assignment to a validated dag; return workdir."""
    wd = tmp_path / "lesson"
    shutil.copytree(FIX, wd)

    # build.json → dag mode
    bj = json.loads((wd / "build.json").read_text(encoding="utf-8-sig"))
    bj["assignment"] = "dag"
    bj["dag"] = {"levels": 3, "max_nodes": 8}
    (wd / "build.json").write_text(json.dumps(bj, indent=1), encoding="utf-8")

    # replace LN.data.assign7 block via brace matching
    data_path = wd / "data.js"
    text = data_path.read_text(encoding="utf-8")
    marker = "LN.data.assign7"
    start = text.index(marker)
    brace = text.index("{", start)
    depth, end, instr, esc = 0, -1, False, False
    for k in range(brace, len(text)):
        c = text[k]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
        elif c == '"':
            instr = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = k
                break
    assert end > 0, "assign7 object not closed"
    dag = {
        "intro": "Walk the cart's decision.",
        "mode": "dag",
        "title": "One week, three decisions",
        "scenario": "Aling Nena must pick a path through a hard week.",
        "nodes": [
            {"id": "n0", "level": 0, "isLeaf": False,
             "question": "Monday opens with rain and half the usual crowd; "
                         "the ledger shows 45,000 fixed cost still due. Which move?",
             "outcome": None,
             "choices": [
                 {"label": "A", "text": "Hold price and cut charcoal waste today",
                  "points": 10, "nextNodeId": "n1"},
                 {"label": "B", "text": "Slash the plate price to pull a crowd",
                  "points": 4, "nextNodeId": "n2"},
             ]},
            {"id": "n1", "level": 1, "isLeaf": False,
             "question": "Waste is down and the noon crowd returned steady; "
                         "a supplier offers charcoal at wholesale but asks cash up front. Decide.",
             "outcome": "Holding the line kept contribution margin intact.",
             "choices": [
                 {"label": "A", "text": "Take wholesale with cash discipline",
                  "points": 9, "nextNodeId": "n3"},
                 {"label": "B", "text": "Delay the order until Friday's rush",
                  "points": 5, "nextNodeId": "n3"},
             ]},
            {"id": "n2", "level": 1, "isLeaf": False,
             "question": "The cheaper plates brought volume but the margin thinned; "
                         "charcoal now costs more per plate. Choose the correction.",
             "outcome": "Volume rose while contribution margin fell.",
             "choices": [
                 {"label": "A", "text": "Restore price and renegotiate supply",
                  "points": 8, "nextNodeId": "n3"},
                 {"label": "B", "text": "Keep low price and sell plates",
                  "points": 3, "nextNodeId": "n3"},
             ]},
            {"id": "n3", "level": 2, "isLeaf": True,
             "question": "Friday closes: books balanced or books bruised?",
             "outcome": "Both roads arrive at the same closing ledger.",
             "choices": [],
             "finalOutcome": "The week ends with the path you chose written in the ledger."},
        ],
    }
    text = (text[:start] + marker + " = " + json.dumps(dag, ensure_ascii=False)
            + ";" + text[end + 1:])
    data_path.write_text(text, encoding="utf-8")
    return wd


def test_dag_fixture_builds_clean(tmp_path, monkeypatch):
    wd = _patch_fixture(tmp_path, monkeypatch)
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main([str(wd)])
    assert rc == 0, buf.getvalue()
    html = (tmp_path / "Week4-Demo-Notebook.html").read_text(encoding="utf-8")
    assert 'data-component="assignment"' in html
    # stricter: the serialized assignment object has no points key
    import re
    m = re.search(r"LN\.data\.assign7\s*=\s*(\{.*?\});", html, re.S)
    assert m, "assign7 not in output"
    body = json.loads(m.group(1))
    assert body["mode"] == "dag"
    assert "points" not in json.dumps(body)
    assert body["nodes"][0]["choices"][0]["nextNodeId"] == "n1"

    kf = tmp_path / "build" / "key" / "Week4-Demo-Notebook-key.json"
    assert kf.exists()
    key = json.loads(kf.read_text(encoding="utf-8"))
    assert key["mode"] == "dag"
    assert key["dag"]["optimal"]["max_score"] == 19  # 10+9
    assert key["dag"]["optimal"]["path"][0]["label"] == "A"
    assert len(key["dag"]["nodes"]) == 4
    assert "items" not in key
