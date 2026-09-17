import json
from pathlib import Path

import build

REPO = Path(__file__).resolve().parents[1]
SKEL = REPO / "v2" / "skeleton"

DATA = {
    "milo-list": ("milo0", {"title": "Outcomes", "items": [{"t": "Define fixed and variable cost",
                   "note": "with own examples"}, {"t": "Compute BEP in units"}]}),
    "sort-statement": ("sort1", {"left": "Fixed cost", "right": "Variable cost",
                    "items": [{"t": "Rent for the shop", "a": "left"},
                              {"t": "Gas for deliveries", "a": "right"},
                              {"t": "Owner salary drawn both ways", "a": "both"}]}),
    "comparison-table": ("cmp1", {"left": "Fixed", "right": "Variable",
                     "rows": [{"label": "Definition", "l": "Unchanged by volume", "r": "Moves with volume"}]}),
    "feasibility-gate": ("gate2", {"cases": [{"id": "cart", "name": "Food cart",
                                 "domains": [{"d": "Market", "fact": "Students queue daily."},
                                             {"d": "Cost", "fact": "Cart is affordable."}],
                                 "lessonVerdict": "go", "outcome": "The lesson approved the cart."}]}),
    "break-even-lab": ("lab3", {"money": "$", "unit": "cups", "init": {"fc": 12000, "p": 90, "vc": 40, "vol": 400},
                   "ranges": {"fc": [1000, 40000, 500], "p": [40, 200, 5], "vc": [10, 80, 5], "vol": [0, 1500, 10]},
                   "presets": [{"label": "Campus cart", "fc": 12000, "p": 90, "vc": 40, "vol": 400}]}),
    "step-solver": ("ex4", {"title": "Worked example", "story": "Setup prose.", "unit": "cups",
               "steps": [{"q": "Contribution margin", "a": 50, "pre": "$"},
                         {"q": "Break-even quantity", "a": 240, "unit": "cups", "tol": 1}],
               "solution": "CM = 90 - 40 = 50; BEP = 12000 / 50 = 240."}),
    "true-false": ("tf7", {"items": [{"s": "Lowering price lowers BEP.", "a": False,
                         "e": "It raises BEP because CM shrinks."}]}),
    "ranked-statements": ("rank6", {"prompt": "Order these steps.", "direction": "first to last",
                       "items": [{"t": "Estimate demand", "rank": 3}, {"t": "Find CM", "rank": 2},
                                 {"t": "List FC", "rank": 1}]}),
    "case-match": ("match6", {"concepts": ["Economies of scale", "Diminishing returns"],
                 "scenarios": [{"text": "Bigger bakery cuts cost per loaf.", "answer": "Economies of scale"}]}),
    "flipcards": ("flip8", {"title": "Recap", "cards": [{"q": "BEP formula?", "a": "FC divided by CM."}]}),
    "glossary": ("gl", {"groups": [{"terms": [{"t": "CM", "d": "Price minus variable cost."}]}]}),
}


def make_real_wd(tmp_path, components, theme="parchment"):
    wd = tmp_path / "wd"
    wd.mkdir(parents=True, exist_ok=True)
    (wd / "build.json").write_text(json.dumps({
        "title": "Matrix build", "theme": theme, "components": components,
        "output": "out.html"}), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--highlight:#ffe9a3;}", encoding="utf-8")
    mounts = "\n".join(
        '<div data-component="%s" data-key="%s"></div>' % (c, DATA[c][0]) for c in components)
    (wd / "sections.html").write_text(
        '<section class="block" id="s1"><h2>Matrix</h2>%s</section>' % mounts, encoding="utf-8")
    (wd / "data.js").write_text("\n".join(
        "LN.data.%s = %s;" % (DATA[c][0], json.dumps(DATA[c][1])) for c in components),
        encoding="utf-8")
    return wd


ALL = sorted(DATA)


def test_registry_lists_every_component():
    reg = (SKEL / "components" / "registry.md").read_text(encoding="utf-8")
    for c in ALL:
        assert "`%s`" % c in reg, "registry.md missing row for " + c


def test_every_component_mounts(tmp_path):
    for c in ALL:
        wd = make_real_wd(tmp_path / ("one-" + c), [c])
        out, errs, _ = build.assemble(wd, SKEL)
        assert errs == [], (c, [str(e) for e in errs])
        assert "LN.components[\"%s\"]" % c in out
        assert "LN.boot();" in out


def test_all_components_together(tmp_path):
    wd = make_real_wd(tmp_path / "all", ALL)
    out, errs, _ = build.assemble(wd, SKEL)
    assert errs == [], [str(e) for e in errs]
