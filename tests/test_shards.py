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
    out, errs, _ = build.assemble(wd, skel)
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
    o_m, e_m, _ = build.assemble(mono, skel)
    o_s, e_s, _ = build.assemble(wd, skel)
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

# ---------- Task 4: --lint per-shard writer self-check ----------

def lint(tmp_path, shard_id="1", extra=None, plan_mut=None):
    wd = shard_wd(tmp_path, extra=extra)
    if plan_mut:
        plan = json.loads((wd / "plan.json").read_text(encoding="utf-8"))
        plan_mut(plan)
        (wd / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    return wd, build.lint_shard(wd, shard_id)

def test_lint_clean(tmp_path):
    _, errs = lint(tmp_path)
    assert errs == [], [str(e) for e in errs]

def test_lint_cli_ok_exit0(tmp_path, capsys):
    wd, _ = lint(tmp_path)
    assert build.main([str(wd), "--lint", "1"]) == 0
    assert "LINT OK - shard 1 clean" in capsys.readouterr().out

def test_lint_cli_bad_exit1_writes_nothing(tmp_path, capsys):
    wd, errs = lint(tmp_path, extra={"sections/1-a.html":
        '<section class="block" id="s1.a" style="color:#f00"></section>'})
    assert build.main([str(wd), "--lint", "1"]) == 1
    assert not (wd / "out.html").exists()
    assert "hex" in [e.rule for e in errs]
    out = capsys.readouterr().out
    assert "hex" in out and "FAIL - lint shard 1: 1 problem(s)" in out

def test_lint_unknown_shard(tmp_path):
    _, errs = lint(tmp_path, shard_id="9")
    assert "plan" in [e.rule for e in errs]

def test_lint_catches_wrong_prefix(tmp_path):
    _, errs = lint(tmp_path, extra={"sections/1-a.html":
        '<section class="block" id="bad.x"></section>'})
    assert "prefix" in [e.rule for e in errs]

def test_lint_catches_foreign_mount(tmp_path):
    def mut(plan):
        plan["shards"][0]["components"] = []
    _, errs = lint(tmp_path, plan_mut=mut)
    assert "plan" in [e.rule for e in errs]

def test_lint_catches_close_tag_js(tmp_path):
    _, errs = lint(tmp_path, extra={"data/1-a.js": "LN.data.s1k={t:'</b>'};"})
    assert "js" in [e.rule for e in errs]

def test_lint_ignores_global_and_palette_rules(tmp_path):
    # duplicate id within one shard, bad contrast, missing print: all pass lint,
    # fail the full build only (spec 7 split)
    dup = {'sections/1-a.html':
        '<section class="block" id="s1.a"></section>'
        '<section class="block" id="s1.a"></section>'}
    wd, errs = lint(tmp_path, extra=dup)
    assert errs == [], [str(e) for e in errs]
    _, _, rules = assembled(tmp_path, wd)
    assert "ids" in rules

def test_lint_tolerates_missing_sibling_shards(tmp_path):
    # writer self-checks shard 1 while shard 2's files are not yet on disk
    wd, errs = lint(tmp_path, shard_id="1")
    (wd / "sections/2-b.html").unlink()
    (wd / "data/2-b.js").unlink()
    assert build.lint_shard(wd, "1") == [], "target lint must ignore absent siblings"
    # ...but the target's OWN missing file is still caught:
    (wd / "data/1-a.js").unlink()
    assert "plan" in [e.rule for e in build.lint_shard(wd, "1")]

def test_lint_catches_external(tmp_path):
    _, errs = lint(tmp_path, extra={"sections/1-a.html":
        '<section class="block" id="s1.a"><img src="http://x/y.png"></section>'})
    assert "external" in [e.rule for e in errs]

def test_lint_catches_unbalanced_fragment(tmp_path):
    _, errs = lint(tmp_path, extra={"sections/1-a.html":
        '<section class="block" id="s1.a"><div></section>'})
    assert "wellformed" in [e.rule for e in errs]

def test_lint_catches_key_defined_in_wrong_shard(tmp_path):
    # shard 2 mounts a key that only exists in shard 1's data file
    def mut(plan):
        plan["shards"][1]["components"] = ["demo"]  # legitimize the mount itself
    _, errs = lint(tmp_path, shard_id="2", plan_mut=mut,
                   extra={"sections/2-b.html":
        '<section class="block" id="s2.b"><div data-component="demo" data-key="s1k"></div></section>',
        "data/2-b.js": "LN.data.s2k={};"})
    assert "data" in [e.rule for e in errs] and any("s1k" in e.msg for e in errs)
