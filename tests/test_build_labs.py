import json

import build
from test_build import make_skel, make_workdir


def _cfg(**extra):
    cfg = {
        "title": "T",
        "theme": "mini",
        "components": ["demo", "break-even-lab"],
        "output": "out.html",
    }
    cfg.update(extra)
    return json.dumps(cfg)


def _run(tmp_path, cfg):
    comps = ("demo", "break-even-lab")
    skel = make_skel(tmp_path, components=comps)
    wd = make_workdir(tmp_path, components=comps, files={"build.json": cfg})
    return build.assemble(wd, skel)


def test_labs_off_by_default_rejects_lab_component(tmp_path):
    _, errs, _ = _run(tmp_path, _cfg())
    assert any("is a lab" in e.msg for e in errs)


def test_labs_true_allows_lab_component(tmp_path):
    _, errs, _ = _run(tmp_path, _cfg(labs=True))
    assert not any("is a lab" in e.msg for e in errs)


def test_labs_must_be_boolean(tmp_path):
    _, errs, _ = _run(tmp_path, _cfg(labs="yes"))
    assert any("labs must be true or false" in e.msg for e in errs)
