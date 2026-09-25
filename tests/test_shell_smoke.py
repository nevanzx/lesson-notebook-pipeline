import shutil
from pathlib import Path

import build
from test_build import MINI_THEME, make_skel, make_workdir

REPO = Path(__file__).resolve().parents[1]
SKEL = REPO / "v2" / "skeleton"


def test_real_shell_builds_clean(tmp_path):
    skel = make_skel(tmp_path)
    (skel / "shell.html").write_text(
        (SKEL / "shell.html").read_text(encoding="utf-8"), encoding="utf-8")
    (skel / "layouts").mkdir(exist_ok=True)
    for d in (SKEL / "layouts").iterdir():
        if d.is_dir():
            shutil.copytree(d, skel / "layouts" / d.name, dirs_exist_ok=True)
    wd = make_workdir(tmp_path)
    out, errs, _ = build.assemble(wd, skel)
    assert errs == [], [str(e) for e in errs]
    for marker in ("/*__", "<!--__", "__TITLE__"):
        assert marker not in out
    assert "@media print" in out
    assert "LN.boot();" in out
    assert "Reset all activities" in out
    assert "lnErrors" in out
