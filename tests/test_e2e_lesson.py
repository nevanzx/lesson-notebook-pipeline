import shutil
from pathlib import Path

import build

REPO = Path(__file__).resolve().parents[1]
FIX = REPO / "tests" / "fixtures" / "lesson-demo"


def test_demo_fixture_builds_via_cli(tmp_path):
    wd = tmp_path / "lesson"
    shutil.copytree(FIX, wd)
    rc = build.main([str(wd)])
    assert rc == 0
    out = (wd / "Week4-Demo-Notebook.html").read_text(encoding="utf-8")
    assert "562.5" in out                      # lab math carried from the lesson
    assert "LN.components[\"break-even-lab\"]" in out
    for marker in ("__TITLE__", "/*__", "<!--__"):
        assert marker not in out
    # the whole lesson content survived injection
    for token in ("Tumba", "feasibility-gate", "data-key=\"tf6\"", "@media print"):
        assert token in out, token


def test_demo_fixture_output_is_self_contained(tmp_path):
    wd = tmp_path / "lesson"
    shutil.copytree(FIX, wd)
    build.main([str(wd)])
    out = (wd / "Week4-Demo-Notebook.html").read_text(encoding="utf-8")
    assert "http://" not in out.replace("http://www.w3.org/2000/svg", "")
    assert "https://" not in out
    assert "@import" not in out
