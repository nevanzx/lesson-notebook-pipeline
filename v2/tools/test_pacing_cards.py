#!/usr/bin/env python
"""Tests for the v2.52 concept-card cap (pacing_lint.py).

Run:  python v2/tools/test_pacing_cards.py
Exit 0 = every case behaved; exit 1 = at least one failure.

The cap is a structure rule, not a prose judgment: a teaching section may hold
at most seven concept cards (`.def` boxes). Overview, Glossary, and Recap are
maps of the lesson, not teaching sections, and are not capped. A section over
the cap fails the build so a lesson cannot ship with 51 ideas in an hour.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pacing_lint  # noqa: E402


def card(title):
    return ('<div class="def" data-kind="concept">'
            '<p class="sub-title"><strong>%s</strong></p>'
            '<p>%s is explained here in one sentence that carries the idea.</p>'
            '</div>' % (title, title))


def section(sid, cards, heading="Test"):
    return ('<section class="block" id="%s"><h2>%s</h2><p>%s</p>%s</section>'
            % (sid, heading, "A chain paragraph maps the cards in order. " * 2,
               "".join(card("Concept %d" % i) for i in range(1, cards + 1))))


def card_fails(report):
    return [f for f in report["fails"] if f["rule"] == "section_over_cards"]


def row(report, sid):
    return next(r for r in report["estimate"]["sections"] if r["id"] == sid)


def main():
    failures = []

    def check(name, ok, detail=""):
        print(("ok   " if ok else "FAIL ") + name
              + (("  -- " + detail) if detail and not ok else ""))
        if not ok:
            failures.append(name)

    seven = pacing_lint.lint_text(section("t", 7))
    check("7 cards in a teaching section pass the cap", not card_fails(seven))
    check("the report names the 7-card cap", row(seven, "t")["cap_cards"] == 7,
          "cap_cards=%r" % row(seven, "t").get("cap_cards"))

    eight = pacing_lint.lint_text(section("t", 8))
    check("8 cards in a teaching section fail the cap", bool(card_fails(eight)))
    check("the failure names the section and the count",
          bool(card_fails(eight))
          and card_fails(eight)[0]["section"] == "t"
          and "8" in card_fails(eight)[0]["detail"],
          str(card_fails(eight)))

    overview = pacing_lint.lint_text(section("overview", 9))
    check("Overview cards are not capped", not card_fails(overview))
    check("Overview reports no cap", row(overview, "overview")["cap_cards"] is None)

    exempt = pacing_lint.lint_text(section("assign", 9))
    check("Assignment cards are not capped", not card_fails(exempt))

    # A seven-card section with a full set of activities is not "too thin":
    # the hour is already spent, so the gate must not ask for more content.
    busy = section("t", 7).replace(
        "</section>", '<div data-component="mcq" data-key="k"></div>' * 15 + "</section>")
    busy_report = pacing_lint.lint_text(busy)
    check("activities count toward the under-budget review",
          not [f for f in busy_report["review"] if f["rule"] == "lesson_under_budget"],
          str(busy_report["review"]))

    thin = pacing_lint.lint_text(section("t", 7))
    check("a thin lesson with no activities is still flagged",
          bool([f for f in thin["review"] if f["rule"] == "lesson_under_budget"]))

    # One idea costs three minutes of class: 60 minutes holds 20 cards.
    def lesson(cards, minutes=60):
        parts, left = [], cards
        ids = ["a", "b", "c", "d"]
        i = 0
        while left > 0:
            take = min(7, left)
            parts.append(section(ids[i], take))
            left -= take
            i += 1
        return pacing_lint.lint_text("".join(parts), minutes=minutes)

    def over_cards(report):
        return [f for f in report["fails"] if f["rule"] == "lesson_over_cards"]

    check("20 cards fit a 60-minute class",
          not over_cards(lesson(20)))
    check("21 cards exceed a 60-minute class",
          bool(over_cards(lesson(21))))
    check("the lesson ceiling follows the budget",
          not over_cards(lesson(10, minutes=30))
          and bool(over_cards(lesson(11, minutes=30))))
    check("exempt sections do not count toward the lesson ceiling",
          not over_cards(pacing_lint.lint_text(
              section("a", 7) + section("b", 7) + section("c", 6)
              + section("assign", 9))))

    print()
    if failures:
        print("FAILED: %d case(s): %s" % (len(failures), ", ".join(failures)))
        return 1
    print("all concept-card cases behaved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
