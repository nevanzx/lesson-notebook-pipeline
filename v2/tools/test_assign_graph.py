#!/usr/bin/env python
"""Tests for the `graph` assignment mode (build.py) - written before the code.

Run:  python v2/tools/test_assign_graph.py
Exit 0 = every case behaved; exit 1 = at least one failure.

Covers the three seams a `graph` deck passes through:
  * validate_assign_cfg      - build.json accepts "graph", rejects a stray dag block
  * _validate_assignment_graph - the item/figure rule set (design 2026-10-18 §5.4)
  * sanitize_assignment_data - answers stripped, situation+figure kept
"""
import importlib.util
import json
import sys
from pathlib import Path

BUILD_PY = Path(__file__).resolve().parent.parent / "build.py"


def load_build():
    spec = importlib.util.spec_from_file_location("nb_build", BUILD_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 200">'
       '<path d="M0 0"/></svg>')
CHOICES = ["Perfect competition", "Monopoly", "Monopolistic competition",
           "Oligopoly"]

# A bank entry is an object: the drawing plus the legend that reads it. Every graph
# carries a legend, so a bare <svg> string is no longer a legal bank entry.
def bank_entry(mark_extra=None):
    legend = [
        {"label": "Demand", "token": "chart-rev"},
        {"label": "Marginal revenue", "token": "chart-label", "mark": "dashed"},
        {"label": "Deadweight loss", "token": "chart-loss", "mark": "block"},
    ]
    if mark_extra:
        legend.append(mark_extra)
    return {"svg": SVG, "legend": legend}


def item(fig="price-taker", ans=0, sit="Nena sells camote in the Carbon market.",
         prompt="Which market structure does the diagram describe?",
         choices=None):
    return {"type": "mc", "situation": sit, "figure": fig, "prompt": prompt,
            "choices": list(choices if choices is not None else CHOICES),
            "ans": ans}


def good_data():
    """A deck that satisfies every rule: 10 items, 3 figures, ans spread."""
    figs = {"price-taker": bank_entry(), "monopolist": bank_entry(),
            "payoff": bank_entry()}
    names = ["price-taker", "monopolist", "payoff"]
    return {"mode": "graph", "intro": "Read each diagram, then answer.",
            "figures": figs,
            "items": [item(fig=names[i % 3], ans=i % 4) for i in range(10)]}


def main():
    failures = []

    def check(name, cond, detail=""):
        if cond:
            print("ok   %s" % name)
        else:
            print("FAIL %s%s" % (name, (" - " + detail) if detail else ""))
            failures.append(name)

    try:
        mod = load_build()
    except Exception as exc:  # pragma: no cover
        print("FAIL could not import build.py: %r" % (exc,))
        return 1

    def errs_for(data, fn="_validate_assignment_graph"):
        errors = []
        f = getattr(mod, fn, None)
        if f is None:
            errors.append(mod.Err("assign", "data.js", None,
                                  "MISSING: %s is not implemented" % fn))
            return errors
        f(data, errors)
        return errors

    print("-- baseline: the good deck must pass --")
    ok_msgs = [str(e) for e in errs_for(good_data())]
    check("valid graph deck has no errors", not ok_msgs, "; ".join(ok_msgs))

    print("-- validate_assign_cfg --")
    cfg = {"components": ["assignment"], "assignment": "graph"}
    cfgerr = []
    mod.validate_assign_cfg(cfg, cfgerr)
    check("build.json accepts assignment=graph", not cfgerr,
          "; ".join(str(e) for e in cfgerr))
    cfg2 = {"components": ["assignment"], "assignment": "graph",
            "dag": {"levels": 3, "max_nodes": 6}}
    cfgerr2 = []
    mod.validate_assign_cfg(cfg2, cfgerr2)
    check("build.json rejects a dag block on a graph assignment", bool(cfgerr2))

    print("-- _validate_assignment_graph rule set --")
    cases = []

    d = good_data(); d["items"] = d["items"][:9]
    cases.append(("needs exactly 10 items (9 given)", d))

    d = good_data(); d["items"] = d["items"] + [item()]
    cases.append(("needs exactly 10 items (11 given)", d))

    d = good_data(); d["items"][3]["type"] = "tf"
    cases.append(("every item must be mc", d))

    d = good_data(); d["items"][2]["situation"] = "   "
    cases.append(("empty situation is rejected", d))

    d = good_data(); d["items"][2]["figure"] = "not-in-the-bank"
    cases.append(("figure must name a bank entry", d))

    d = good_data(); d["figures"]["price-taker"] = "just a caption"
    cases.append(("a bank value must be an <svg>", d))

    d = good_data(); d["figures"]["price-taker"]["svg"] = "just a caption"
    cases.append(("a bank entry's svg must be an <svg>", d))

    d = good_data(); d["figures"]["price-taker"]["svg"] = SVG.replace("viewBox=", "")
    cases.append(("a bank value needs a viewBox", d))

    d = good_data(); del d["figures"]["price-taker"]["legend"]
    cases.append(("every graph needs a legend", d))

    d = good_data(); d["figures"]["price-taker"]["legend"] = []
    cases.append(("an empty legend is rejected", d))

    d = good_data(); d["figures"]["price-taker"]["legend"][0]["token"] = "brand-pink"
    cases.append(("a legend token must be a chart token", d))

    d = good_data(); d["figures"]["price-taker"]["legend"][1].pop("token")
    cases.append(("a legend entry needs a token", d))

    d = good_data(); d["figures"]["price-taker"]["legend"][2]["label"] = "  "
    cases.append(("a legend entry needs a label", d))

    d = good_data(); d["figures"]["price-taker"]["legend"][1]["mark"] = "sparkle"
    cases.append(("a legend mark must be line/dashed/block", d))

    d = good_data(); d["figures"]["price-taker"]["legend"].append(
        {"label": "Marginal revenue", "token": "chart-label"})
    cases.append(("a legend may not repeat a label", d))

    d = good_data(); d["items"][1]["choices"] = ["A", "B", "C"]
    cases.append(("four choices are required", d))

    d = good_data()
    d["items"][1]["choices"] = ["Perfect competition", "Monopoly",
                                "Monopolistic competition",
                                "Oligopoly in a small city market today"]
    cases.append(("choices must stay within one word of each other", d))

    d = good_data()
    d["items"][1]["choices"] = ["Monopoly", "Monopoly", "Oligopoly",
                                "Perfect competition"]
    cases.append(("choices must be distinct", d))

    d = good_data(); d["items"][1]["ans"] = 4
    cases.append(("ans must be 0..3", d))

    d = good_data()
    for i in range(5):
        d["items"][i]["ans"] = 1
    cases.append(("no answer position used more than 4x", d))

    d = good_data(); d["items"][0]["choices"] = CHOICES[:3] + ["All of the above"]
    cases.append(("no 'all of the above' choice", d))

    d = good_data()
    d["figures"] = {"price-taker": SVG}
    d["items"] = [item(fig="price-taker") for _ in range(10)]
    cases.append(("at least 3 distinct figures must be used", d))

    d = good_data(); del d["figures"]
    cases.append(("a figures bank is required", d))

    d = good_data(); d["items"][0]["prompt"] = ""
    cases.append(("empty prompt is rejected", d))

    for label, data in cases:
        got = [str(e) for e in errs_for(data)]
        check(label, bool(got))

    print("-- sanitize_assignment_data strips answers, keeps figures --")
    text = ("LN.data.gassign =\n%s;\n" % json.dumps(good_data()))
    try:
        safe_text = mod.sanitize_assignment_data(text, "gassign", good_data())
        safe = json.loads(safe_text.split("=", 1)[1].strip().rstrip(";"))
        check("sanitized deck keeps mode", safe.get("mode") == "graph")
        check("sanitized deck keeps the figure bank",
              isinstance(safe.get("figures"), dict) and "price-taker" in safe["figures"])
        sit0 = safe["items"][0]
        check("sanitized item keeps situation+figure+choices",
              sit0.get("situation") and sit0.get("figure") and
              len(sit0.get("choices") or []) == 4)
        check("sanitized item drops ans", "ans" not in sit0)
        check("sanitized text has no ans anywhere",
              '"ans"' not in safe_text and "'ans'" not in safe_text)
    except Exception as exc:
        check("sanitize_assignment_data handles graph mode", False, repr(exc))

    print()
    if failures:
        print("FAILED %d case(s): %s" % (len(failures), ", ".join(failures)))
        return 1
    print("ALL GRAPH-MODE TESTS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
