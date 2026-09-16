import json
from pathlib import Path

import build

REPO = Path(__file__).resolve().parents[1]
SKEL = REPO / "v2" / "skeleton"

MINI_SHELL = (
    "<!DOCTYPE html><html><head><title>__TITLE__</title><style>"
    "/*__THEME__*/"
    "/*__TUNE__*/"
    "body{color:var(--ink)}"
    "/*HEXOK*/@media print{body{color:#000}}/*ENDHEX*/"
    "/*__COMPONENT_CSS__*/"
    "</style></head><body>"
    "<!--__SECTIONS__-->"
    "<script>window.LN={data:{},components:{},boot:function(){}};"
    "/*__DATA__*/"
    "/*__COMPONENT_JS__*/"
    "</script></body></html>"
)

MINI_THEME = (
    ":root{"
    "--bg:#d9dfe6;--surface:#fffdf7;--surface-2:#ffffff;--grid:#e4e9ef;--grid-strong:#d3dbe4;"
    "--edge-line:#c96a5c;--decor:#43704f;--ink:#232a23;--ink-soft:#54605a;--ink-faint:#68707a;"
    "--accent:#2f6b4f;--accent-deep:#204c37;--accent-2:#8a6d3b;--highlight:rgb(255 233 163);"
    "--green:#2f8f5b;--green-bg:#e6f6ec;--amber:#b8791a;--amber-bg:#fdf3e0;--red:#c0432f;--red-bg:#fdecea;"
    "--note-yellow:#fff8c9;--note-green:#d9f2e2;--note-blue:#dceafa;--note-pink:#fbdcdc;"
    "--sec-1:hsl(42 75% 72% / .26);--sec-2:hsl(150 40% 58% / .22);--sec-3:hsl(210 55% 68% / .24);"
    "--sec-4:hsl(350 55% 72% / .22);--sec-5:hsl(185 45% 58% / .22);"
    "--chart-rev:var(--accent);--chart-cost:var(--accent-2);--chart-profit:var(--green);--chart-loss:var(--red);"
    "--chart-axis:var(--ink-faint);--chart-grid:var(--grid-strong);--chart-label:var(--ink-soft);"
    "--radius:12px;--shadow-sm:0 1px 2px rgba(30,40,60,.07);--shadow:0 1px 2px rgba(30,40,60,.06);"
    "--shadow-lg:0 2px 6px rgba(30,40,60,.08);"
    "--hand:cursive;--sans:sans-serif;--mono:monospace;--serif:serif;"
    "--display:var(--hand);--display-tracking:0;--display-transform:none;}"
    ".sheet{background:var(--surface);}"
    ".decor{background:transparent;}"
)

MINI_CSS = ".demo{border:1px solid var(--grid-strong)}"
MINI_JS = "LN.components['demo']={init:function(root,d){root.appendChild(LN.h('b',{text:'ok'}));}};"


def make_skel(tmp_path, shell=None, components=("demo",)):
    skel = tmp_path / "skel"
    (skel / "themes").mkdir(parents=True)
    (skel / "components").mkdir(parents=True)
    (skel / "shell.html").write_text(shell or MINI_SHELL, encoding="utf-8")
    (skel / "themes" / "mini.css").write_text(MINI_THEME, encoding="utf-8")
    for c in components:
        cd = skel / "components" / c
        cd.mkdir(exist_ok=True)
        (cd / "component.css").write_text(MINI_CSS, encoding="utf-8")
        (cd / "component.js").write_text(MINI_JS, encoding="utf-8")
    return skel


def make_workdir(tmp_path, theme="mini", components=("demo",), files=None):
    wd = tmp_path / "wd"
    wd.mkdir(exist_ok=True)
    cfg = {"title": "T", "theme": theme, "components": list(components),
           "output": "out.html"}
    defaults = {
        "build.json": json.dumps(cfg),
        "tune.css": ":root{--accent:#33608f;}",
        "sections.html": '<section class="block" id="s1"><h2>S</h2>'
                         '<div data-component="demo" data-key="gl"></div></section>',
        "data.js": "LN.data.gl={items:[1]};",
    }
    defaults.update(files or {})
    for name, text in defaults.items():
        (wd / name).write_text(text, encoding="utf-8")
    return wd


def run(tmp_path, **kw):
    skel = make_skel(tmp_path, shell=kw.get("shell"),
                     components=kw.get("components", ("demo",)))
    wd = make_workdir(tmp_path, theme=kw.get("theme", "mini"),
                      components=kw.get("components", ("demo",)),
                      files=kw.get("files"))
    return build.assemble(wd, skel)


def rules(errs):
    return [e.rule for e in errs]


def test_good_build(tmp_path):
    out, errs = run(tmp_path)
    assert errs == [], [str(e) for e in errs]
    assert "__TITLE__" not in out and "/*__" not in out and "<!--__" not in out
    assert "LN.boot();" in out


def test_cli_writes_only_on_success(tmp_path):
    skel = make_skel(tmp_path)
    wd = make_workdir(tmp_path)
    rc = build.main([str(wd), "--skeleton", str(skel)])
    assert rc == 0
    assert (wd / "out.html").exists()


def test_cli_fail_writes_nothing(tmp_path):
    skel = make_skel(tmp_path)
    wd = make_workdir(tmp_path, files={"sections.html":
        '<section class="block" id="s1"><h2>A</h2>'
        '<div data-component="demo" data-key="ghost"></div></section>'})
    rc = build.main([str(wd), "--skeleton", str(skel)])
    assert rc == 1
    assert not (wd / "out.html").exists()


def test_leftover_marker(tmp_path):
    shell = MINI_SHELL.replace("/*__TUNE__*/", "/*__TUNE_X__*/")
    _, errs = run(tmp_path, shell=shell)
    assert "markers" in rules(errs)


def test_unknown_theme_lists_options(tmp_path):
    _, errs = run(tmp_path, theme="nope")
    assert "theme" in rules(errs)
    assert any("mini" in e.msg for e in errs)


def test_unknown_component_lists_options(tmp_path):
    skel = make_skel(tmp_path)
    wd = make_workdir(tmp_path)
    (wd / "build.json").write_text(json.dumps({
        "title": "T", "theme": "mini", "components": ["ghost"], "output": "out.html"}), encoding="utf-8")
    _, errs = build.assemble(wd, skel)
    assert "component" in rules(errs)
    assert any("demo" in e.msg for e in errs)


def test_bad_component_name_shape(tmp_path):
    skel = make_skel(tmp_path)
    cd = skel / "components" / "BadName"
    cd.mkdir()
    (cd / "component.css").write_text("", encoding="utf-8")
    (cd / "component.js").write_text("", encoding="utf-8")
    wd = make_workdir(tmp_path)
    (wd / "build.json").write_text(json.dumps({
        "title": "T", "theme": "mini", "components": ["BadName"], "output": "out.html"}), encoding="utf-8")
    _, errs = build.assemble(wd, skel)
    assert "component" in rules(errs)


def test_hex_outside_allowed_spans(tmp_path):
    skel = make_skel(tmp_path)
    (skel / "components" / "demo" / "component.css").write_text(
        ".demo{background:#ff0000}\n.other{color:var(--ink)}", encoding="utf-8")
    wd = make_workdir(tmp_path)
    _, errs = build.assemble(wd, skel)
    assert "hex" in rules(errs)
    hit = [e for e in errs if e.rule == "hex"][0]
    assert "component.css" in hit.file and hit.line == 1


def test_hex_in_sections_flagged(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block" id="s1" style="background:#abc">'
        '<div data-component="demo" data-key="gl"></div></section>'})
    assert "hex" in rules(errs)


def test_external_assets(tmp_path):
    _, errs = run(tmp_path, files={"tune.css":
        ':root{--accent:#33608f;}\n.sheet{background:url(http://x/y.png);}'})
    assert "external" in rules(errs)


def test_gradient_url_allowed(tmp_path):
    tune = (':root{--accent:#33608f;}\n'
            '.sheet{background:repeating-linear-gradient(45deg,var(--grid) 0 2px,transparent 2px 4px);}')
    _, errs = run(tmp_path, files={"tune.css": tune})
    assert "external" not in rules(errs)


def test_ids_unique_and_required(tmp_path):
    dup = ('<section class="block" id="x"><h2>A</h2></section>'
           '<section class="block" id="x"><h2>B</h2></section>')
    _, errs = run(tmp_path, files={"sections.html": dup})
    assert "ids" in rules(errs)


def test_section_missing_id(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block"><h2>A</h2></section>'})
    assert "ids" in rules(errs)


def test_reserved_id_prefix(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block" id="lnBad"><h2>A</h2></section>'})
    assert "ids" in rules(errs)


def test_missing_datakey(tmp_path):
    _, errs = run(tmp_path, files={"data.js": "LN.data.other={};"})
    assert "data" in rules(errs)


def test_mount_without_key(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block" id="s1"><div data-component="demo"></div></section>'})
    assert "data" in rules(errs)


def test_mount_component_not_in_build(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block" id="s1"><div data-component="demo" data-key="gl"></div>'
        '<div data-component="other" data-key="gl"></div></section>'})
    assert "data" in rules(errs)


def test_unclosed_tag(tmp_path):
    _, errs = run(tmp_path, files={"sections.html":
        '<section class="block" id="s1"><div data-component="demo" data-key="gl"></div></section2>'
        '<p>x</section>'})
    assert "wellformed" in rules(errs)


def test_close_tag_in_datajs_rejected(tmp_path):
    _, errs = run(tmp_path, files={"data.js": "LN.data.gl={t:'<b>x</b>'};"})
    assert "js" in rules(errs)


def test_print_block_required(tmp_path):
    shell = MINI_SHELL.replace("/*HEXOK*/@media print{body{color:#000}}/*ENDHEX*/", "")
    _, errs = run(tmp_path, shell=shell)
    assert "print" in rules(errs)


def test_missing_workdir_files(tmp_path):
    skel = make_skel(tmp_path)
    wd = tmp_path / "empty"
    wd.mkdir()
    _, errs = build.assemble(wd, skel)
    assert "build.json" in rules(errs)
    wd2 = tmp_path / "onlycfg"
    wd2.mkdir()
    (wd2 / "build.json").write_text(json.dumps(
        {"title": "T", "theme": "mini", "components": ["demo"], "output": "o.html"}),
        encoding="utf-8")
    _, errs2 = build.assemble(wd2, skel)
    assert "files" in rules(errs2)


def test_bad_build_json(tmp_path):
    _, errs = run(tmp_path, files={"build.json": '{"title":"T"}'})
    assert "build.json" in rules(errs)


def test_bad_marker_shell(tmp_path):
    _, errs = run(tmp_path, shell=MINI_SHELL.replace("<!--__SECTIONS__-->", "<!--__SECTIONS__"))
    assert "markers" in rules(errs)


def test_output_parent_created(tmp_path):
    skel = make_skel(tmp_path)
    wd = make_workdir(tmp_path)
    (wd / "build.json").write_text(json.dumps({
        "title": "T", "theme": "mini", "components": ["demo"],
        "output": "sub/out.html"}), encoding="utf-8")
    rc = build.main([str(wd), "--skeleton", str(skel)])
    assert rc == 0
    assert (wd / "sub" / "out.html").exists()


# ---------- Task 3: colour maths + contrast + tune contract ----------

def test_parse_color_forms():
    assert build.parse_color("#fff") == (1, 1, 1, 1)
    assert build.parse_color("#ff0000")[0] == 1
    assert build.parse_color("rgb(0 128 0 / .5)")[3] == 0.5
    hsl = build.parse_color("hsl(42 75% 72% / .26)")
    assert abs(hsl[3] - 0.26) < 1e-9
    assert build.parse_color("transparent") is None
    assert build.parse_color("var(--x)") is None


def test_over_composites_alpha():
    tint = (0.5, 0.5, 0.5, 0.5)
    surf = (1, 1, 1, 1)
    assert build.over(tint, surf)[:3] == (0.75, 0.75, 0.75)


def test_contrast_failures_reported():
    errs = []
    bad_tune = ":root{--ink:#8a94a3;}"
    build.check_contrast(MINI_THEME, bad_tune, errs)
    assert any(e.rule == "contrast" and "ink vs surface" in e.msg for e in errs)


def test_hue_family_lock():
    errs = []
    build.check_contrast(MINI_THEME, ":root{--green:#7a2fb5;}", errs)
    assert any(e.rule == "hue-family" for e in errs)


def test_tune_structural_rejected():
    errs = []
    build.check_tune(".card{color:red}", errs)
    assert any(e.rule == "tune" for e in errs)
    errs2 = []
    build.check_tune("/* c */ :root{ --accent:#33608f; --display-transform:uppercase; }", errs2)
    assert errs2 == []


def test_tune_comment_only_ok():
    errs = []
    build.check_tune("/* nothing overridden this lesson */", errs)
    assert errs == []


def test_parts_where_and_where_line():
    p = build.Parts([("a.html", "x1\nx2"), ("b.html", "y1")])
    assert p.text == "x1\nx2\ny1"
    assert p.where(0) == ("a.html", 1)
    assert p.where(3) == ("a.html", 2)      # offset 3 = 'x' of x2
    assert p.where(5) == ("b.html", 1)      # the joiner newline maps to the next span
    assert p.where(6) == ("b.html", 1)
    assert p.where(8) == ("b.html", 1)      # out of range falls back to last span
    assert p.where_line(1) == ("a.html", 1)
    assert p.where_line(3) == ("b.html", 1)
    assert p.where_line(99) == ("b.html", 1)

def test_scan_reports_parts_coords():
    p = build.Parts([("a.html", "clean"), ("b.html", "#abc")])
    errs = build.scan(p.text, build.HEX_RE, "hex", p, "hard-coded colour", "")
    assert len(errs) == 1 and errs[0].file == "b.html" and errs[0].line == 1

def test_scan_still_accepts_plain_name():
    errs = build.scan("#abc", build.HEX_RE, "hex", "x.html", "hard-coded colour", "")
    assert errs[0].file == "x.html" and errs[0].line == 1
