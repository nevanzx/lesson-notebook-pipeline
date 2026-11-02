#!/usr/bin/env python
"""Tests for the activity folds and the MCQ Situational shape (build.py).

Run:  python v2/tools/test_situational.py
Exit 0 = every case behaved; exit 1 = at least one failure.

Covers check_activities (SKILL §2.4c/§2.4d):
  * a folded, well-formed MCQ Situational block passes;
  * an unfolded standard activity mount fails;
  * a legacy label (pre-v2.40) stays exempt;
  * each shape rule fails on its own: item count, stem word cap, term-choice
    length, five-word choices, answer position, missing feedback;
  * a practice set is never mistaken for an MCQ Situational block.
"""
import importlib.util
import sys
from pathlib import Path

BUILD_PY = Path(__file__).resolve().parent.parent / "build.py"


def load_build():
    spec = importlib.util.spec_from_file_location("nb_build", BUILD_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def mount(comp="mcq", key="sit1", label="mcq situational",
          collapse="MCQ Situational \u2014 10 items"):
    attrs = ['data-component="%s"' % comp, 'data-key="%s"' % key]
    if label is not None:
        attrs.append('data-activity="%s"' % label)
    if collapse is not None:
        attrs.append('data-collapse="%s"' % collapse)
    return '<div %s></div>' % " ".join(attrs)


def section(mounts):
    return ('<section class="block" id="costs">'
            '<h2 data-present="0">1 &nbsp;Costs</h2>'
            '<p data-present="1">Fixed cost sits still.</p>%s</section>' % mounts)


def item(q, choices, ans=0, e="The slip named here."):
    body = 'q: "%s", choices: [%s], ans: %d' % (
        q, ", ".join('"%s"' % c for c in choices), ans)
    if e is not None:
        body += ', e: "%s"' % e
    return "{ %s }" % body


TERMS = ["Fixed cost", "Variable cost", "Contribution", "Break-even point"]
FIVE = ["Rent never moves with sales",
        "Rent moves with every plate",
        "Rent ignores the plates sold",
        "Rent falls as plates multiply"]


def deck(overrides=None, count=10):
    """A compliant 10-item object; `overrides` maps 1-based index -> item body."""
    overrides = overrides or {}
    items = []
    for i in range(1, count + 1):
        if i in overrides:
            items.append(overrides[i])
            continue
        if i <= 5:
            items.append(item("A cart owner separates rent from ingredients.", TERMS, (i - 1) % 4))
        else:
            items.append(item("A cart owner reclassifies rent as a per-plate cost.",
                              FIVE, (i - 1) % 4))
    return "LN.data.sit1 = { items: [%s] };\nLN.data.other = 1;\n" % ", ".join(items)


def run(mod, sections, data):
    errors = []
    mod.check_activities(sections, data, errors)
    return [e.msg for e in errors]


def main():
    mod = load_build()
    failures = 0

    def check(name, cond, detail=""):
        nonlocal failures
        if cond:
            print("ok   " + name)
        else:
            print("FAIL " + name + (" — " + detail if detail else ""))
            failures += 1

    def clean(name, sections, data):
        errs = run(mod, sections, data)
        check(name, not errs, "; ".join(errs))

    def fails(name, sections, data, needle):
        errs = run(mod, sections, data)
        hit = [e for e in errs if needle in e]
        check(name, bool(hit), "errors=" + "; ".join(errs) if errs else "no error raised")

    clean("compliant block passes", section(mount()), deck())

    def sq(s):
        return "'" + s.replace("'", "\\'") + "'"

    def deck_single():
        items = []
        for i in range(1, 11):
            ch = TERMS if i <= 5 else FIVE
            items.append("{ q: %s, choices: [%s], ans: %d, e: %s }" % (
                sq("A cart owner separates rent from ingredients."),
                ", ".join(sq(c) for c in ch), (i - 1) % 4,
                sq("The slip named here.")))
        return ("LN.data.sit1 = { items: [%s] };\nLN.data.other = 1;\n"
                % ", ".join(items))

    clean("single-quoted data passes too", section(mount()), deck_single())
    clean("legacy label without a fold stays exempt",
          section(mount(label="class discussion", collapse=None)), deck())
    clean("'none' label is not an activity",
          section(mount(label="none", collapse=None)), deck())
    clean("practice set fold is untouched",
          section(mount(comp="step-solver", key="prac1", label=None,
                        collapse="Practice set \u2014 5 problems")),
          "LN.data.prac1 = [ { title: 'Practice 1', story: 'x', steps: "
          "[{ q: 'q', a: 1.00, tol: 0.01 }], solution: 'y' } ];\n"
          "LN.data.other = 1;\n")

    fails("unfolded comprehension check is rejected",
          section(mount(label="comprehension check", collapse=None)), deck(),
          "not folded")
    fails("unfolded MCQ Situational is rejected",
          section(mount(collapse=None)), deck(), "not folded")
    fails("nine items is rejected", section(mount()), deck(count=9),
          "has 9 item(s)")
    fails("a 36-word stem is rejected", section(mount()), deck({
        1: item("A cart owner sorts every cost the cart pays in one week into two "
                "piles before deciding whether the plan can survive on real "
                "numbers rather than hope alone today and tomorrow, then checks "
                "the margin again.", TERMS)}),
        "max 35")
    fails("a term item with a sentence choice is rejected", section(mount()), deck({
        2: item("A cart owner separates rent from ingredients.",
                ["Fixed cost", "Variable cost", "Contribution",
                 "Break-even point per plate"])}),
        "term choices must be 1-3 words")
    fails("a four-word choice in the five-word half is rejected", section(mount()), deck({
        7: item("A cart owner reclassifies rent as a per-plate cost.",
                ["Rent never moves with sales",
                 "Rent moves with every plate",
                 "Rent ignores the plates sold",
                 "Rent falls with plates"])}),
        "exactly five")
    fails("the same answer position four times is rejected", section(mount()), deck({
        1: item("A cart owner separates rent from ingredients.", TERMS, 0),
        2: item("A cart owner separates rent from ingredients.", TERMS, 0),
        3: item("A cart owner separates rent from ingredients.", TERMS, 0),
        4: item("A cart owner separates rent from ingredients.", TERMS, 0),
        5: item("A cart owner separates rent from ingredients.", TERMS, 0)}),
        "answer position A used")
    fails("a missing e is rejected", section(mount()), deck({
        3: item("A cart owner separates rent from ingredients.", TERMS, 2, e=None)}),
        "no e feedback")
    fails("three choices are rejected", section(mount()), deck({
        4: item("A cart owner separates rent from ingredients.",
                ["Fixed cost", "Variable cost", "Contribution"])}),
        "3 choice(s)")
    fails("a missing data object is rejected",
          section(mount()), "LN.data.other = 1;\n", "has no LN.data.sit1")

    if failures:
        print("\nFAILED — %d case(s)." % failures)
        return 1
    print("\nOK — activity folds and the MCQ Situational shape hold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
