import json
from pathlib import Path

import build
from test_build import MINI_SHELL, make_skel, MINI_THEME  # reuse fixtures

def shard_wd(tmp_path, split=True, extra=None, plan_over=None, monolith=False):
    wd = tmp_path / "wd"
    (wd / "sections").mkdir(parents=True)
    (wd / "data").mkdir(parents=True)
    cfg = {"title": "T", "theme": "mini", "components": ["demo"], "output": "out.html"}
    (wd / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--accent:#33608f;}", encoding="utf-8")
    (wd / "sections/1-a.html").write_text(
        '<section class="block" id="s1.a"><h2>A</h2>'
        '<div data-component="demo" data-key="s1k"></div></section>', encoding="utf-8")
    (wd / "data/1-a.js").write_text("LN.data.s1k={items:[1]};", encoding="utf-8")
    (wd / "sections/2-b.html").write_text(
        '<section class="block" id="s2.b"><h2>B</h2></section>', encoding="utf-8")
    (wd / "data/2-b.js").write_text("LN.data.s2k={items:[2]};", encoding="utf-8")
    if plan_over != "none":
        plan = {"title": "T", "theme": "mini", "shards": [
            {"id": "1", "section": "A", "key_prefix": "s1",
             "files": ["sections/1-a.html", "data/1-a.js"],
             "components": ["demo"], "open_handoff": "o", "close_handoff": "c",
             "must_teach": ["def a"]},
            {"id": "2", "section": "B", "key_prefix": "s2",
             "files": ["sections/2-b.html", "data/2-b.js"],
             "components": [], "open_handoff": "o", "close_handoff": "c",
             "must_teach": ["def b"]}]}
        plan.update(plan_over or {})
        (wd / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    for name, text in (extra or {}).items():
        (wd / name).parent.mkdir(parents=True, exist_ok=True)
        (wd / name).write_text(text, encoding="utf-8")
    return wd

def assembled(tmp_path, wd):
    skel = make_skel(tmp_path)
    out, errs = build.assemble(wd, skel)
    return out, errs, [e.rule for e in errs]

def test_shard_build_ok(tmp_path):
    out, errs, rules = assembled(tmp_path, shard_wd(tmp_path))
    assert errs == [], [str(e) for e in errs]
    assert 'id="s1.a"' in out and 'LN.data.s2k' in out

def test_shard_sections_order(tmp_path):
    out, _, _ = assembled(tmp_path, shard_wd(tmp_path))
    assert out.index("s1.a") < out.index("s2.b")

def test_shard_equals_monolith_output(tmp_path):
    # split parity (spec 3): monolith == "\n".join(shard texts), byte-identical output
    mono = tmp_path / "mono"
    mono.mkdir()
    wd = shard_wd(tmp_path)
    sec = "\n".join(p.read_text(encoding="utf-8")
                    for p in sorted((wd / "sections").glob("*.html")))
    dat = "\n".join(p.read_text(encoding="utf-8")
                    for p in sorted((wd / "data").glob("*.js")))
    for f in ("build.json", "tune.css"):
        (mono / f).write_text((wd / f).read_text(encoding="utf-8"), encoding="utf-8")
    (mono / "sections.html").write_text(sec, encoding="utf-8")
    (mono / "data.js").write_text(dat, encoding="utf-8")
    skel = make_skel(tmp_path)
    o_m, e_m = build.assemble(mono, skel)
    o_s, e_s = build.assemble(wd, skel)
    assert e_m == [] and e_s == []
    assert o_m == o_s

def test_shards_without_plan_rejected(tmp_path):
    wd = shard_wd(tmp_path, plan_over="none")
    _, _, rules = assembled(tmp_path, wd)
    assert "plan" in rules

def test_plan_without_shard_dirs_rejected(tmp_path):
    wd = tmp_path / "wd-planonly"  # distinct name: shard_wd hardcodes tmp_path/"wd"
    wd.mkdir()
    shard_src = shard_wd(tmp_path)
    for f in ("build.json", "tune.css", "plan.json"):
        (wd / f).write_text((shard_src / f).read_text(encoding="utf-8"), encoding="utf-8")
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("no sections/" in e.msg for e in errs)

def test_monolith_alongside_shards_ambiguous(tmp_path):
    wd = shard_wd(tmp_path, extra={"sections.html": "<p>x</p>"})
    _, _, rules = assembled(tmp_path, wd)
    assert "files" in rules

def test_unclaimed_shard_file(tmp_path):
    wd = shard_wd(tmp_path, extra={"sections/3-c.html":
        '<section class="block" id="s3.c"><h2>C</h2></section>'})
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("3-c" in e.msg for e in errs)

def test_bad_plan_shape(tmp_path):
    wd = shard_wd(tmp_path, plan_over={"shards": [{"id": "1"}]})
    _, _, rules = assembled(tmp_path, wd)
    assert "plan" in rules

def test_shard_file_missing(tmp_path):
    wd = shard_wd(tmp_path)
    (wd / "data/2-b.js").unlink()
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("2-b.js" in e.msg for e in errs)

def test_plan_theme_mismatch(tmp_path):
    wd = shard_wd(tmp_path, plan_over={"theme": "ghost"})
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("ghost" in e.msg for e in errs)

def test_plan_declares_unknown_component(tmp_path):
    wd = shard_wd(tmp_path, plan_over={})  # shard 1 declares demo; add a shard with ghost
    plan = json.loads((wd / "plan.json").read_text(encoding="utf-8"))
    plan["shards"][1]["components"] = ["ghost"]
    (wd / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    _, _, rules = assembled(tmp_path, wd)
    assert "plan" in rules

def test_prefix_section_id_violation(tmp_path):
    wd = shard_wd(tmp_path, extra={"sections/1-a.html":
        '<section class="block" id="wrong.a"><h2>A</h2></section>'})
    _, errs, rules = assembled(tmp_path, wd)
    assert "prefix" in rules and any(e.file == "sections/1-a.html" for e in errs)

def test_prefix_data_key_violation(tmp_path):
    wd = shard_wd(tmp_path, extra={"data/2-b.js": "LN.data.bogus={};"})
    _, errs, rules = assembled(tmp_path, wd)
    assert "prefix" in rules and any("bogus" in e.msg for e in errs)

def test_mount_key_not_local(tmp_path):
    wd = shard_wd(tmp_path, extra={"sections/2-b.html":
        '<section class="block" id="s2.b"><div data-component="demo" data-key="s1k"></div></section>'})
    _, errs, rules = assembled(tmp_path, wd)
    assert "data" in rules and any("s1k" in e.msg for e in errs)

def test_duplicate_data_key_cross_shard(tmp_path):
    wd = shard_wd(tmp_path, extra={"data/2-b.js": "LN.data.s1k={};",
        "sections/2-b.html": '<section class="block" id="s2.b">'
        '<div data-component="demo" data-key="s1k"></div></section>'})
    _, errs, rules = assembled(tmp_path, wd)
    assert "data" in rules and any("duplicate" in e.msg for e in errs)

def test_monolith_duplicate_key_caught(tmp_path):
    import test_build as tb
    _, errs = tb.run(tmp_path, files={"data.js": "LN.data.gl={};LN.data.gl={};"})
    assert "data" in [e.rule for e in errs] and any("duplicate" in e.msg for e in errs)

def replan(wd, fn):
    plan = json.loads((wd / "plan.json").read_text(encoding="utf-8"))
    fn(plan)
    (wd / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    return wd

def test_bad_shard_id_rejected(tmp_path):
    wd = replan(shard_wd(tmp_path), lambda p: p["shards"][0].update({"id": "x"}))
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("bad shard id" in e.msg for e in errs)

def test_duplicate_shard_id_rejected(tmp_path):
    wd = replan(shard_wd(tmp_path), lambda p: p["shards"][1].update({"id": "1"}))
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("duplicate shard id" in e.msg for e in errs)

def test_bad_key_prefix_rejected(tmp_path):
    wd = replan(shard_wd(tmp_path), lambda p: p["shards"][0].update({"key_prefix": "S1"}))
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("bad key_prefix" in e.msg for e in errs)

def test_file_stem_mismatch_rejected(tmp_path):
    wd = replan(shard_wd(tmp_path),
                lambda p: p["shards"][0].update({"files": ["sections/1-a.html", "data/1-z.js"]}))
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("stems differ" in e.msg for e in errs)

def test_file_claimed_twice_rejected(tmp_path):
    wd = replan(shard_wd(tmp_path),
                lambda p: p["shards"][1].update(
                    {"files": ["sections/1-a.html", "data/1-a.js"]}))
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("claimed twice" in e.msg for e in errs)

def test_plan_title_mismatch_rejected(tmp_path):
    wd = shard_wd(tmp_path, plan_over={"title": "Other"})
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("title" in e.msg for e in errs)
