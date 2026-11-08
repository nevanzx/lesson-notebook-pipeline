#!/usr/bin/env python
"""Tests for the v2.44 prose-budget defaults (prose_lint.py).

Run:  python v2/tools/test_prose_budget.py
Exit 0 = every case behaved; exit 1 = at least one failure.

The readable-paragraph rule itself is a human judgment; this test covers the
mechanical seam: the default budget must accept a 3-sentence card paragraph
and reject a paragraph that is genuinely over budget, and an explicit
per-lesson budget must override the default.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import prose_lint  # noqa: E402


def section(*paragraphs):
    body = "".join("<p>%s</p>" % p for p in paragraphs)
    return ('<section class="block" id="t"><h2>Test</h2>%s</section>' % body)


def words(n, stem="word"):
    return " ".join("%s%d" % (stem, i) for i in range(n))


def fails(report):
    return [f for f in report["fails"] if f["rule"] == "dense_over_budget"]


def main():
    failures = []

    def check(name, ok, detail=""):
        print(("ok   " if ok else "FAIL ") + name + (("  -- " + detail) if detail and not ok else ""))
        if not ok:
            failures.append(name)

    # 3 sentences, 90 words: accepted at the 110-word default.
    p90 = "%s. %s. %s." % (words(30, "a"), words(30, "b"), words(30, "c"))
    check("90-word / 3-sentence paragraph passes the default budget",
          not fails(prose_lint.lint_text(section(p90))))

    # 130 words: over the 110 default, accepted by an explicit 130 budget.
    p130 = "%s. %s. %s. %s." % (words(33, "a"), words(33, "b"), words(32, "c"), words(32, "d"))
    check("130-word paragraph fails the default budget",
          bool(fails(prose_lint.lint_text(section(p130)))))
    check("130-word paragraph passes an explicit max_words=130",
          not fails(prose_lint.lint_text(section(p130), max_words=130)))

    # A 50-word sentence is over the 45-word default; a 40-word one is not.
    s50 = words(50, "s") + "."
    s40 = words(40, "t") + "."
    check("50-word sentence fails the default sentence cap",
          bool(prose_lint.lint_text(section(s50))["fails"]))
    check("40-word sentence passes the default sentence cap",
          not prose_lint.lint_text(section(s40))["fails"])

    print()
    if failures:
        print("FAILED: %d case(s): %s" % (len(failures), ", ".join(failures)))
        return 1
    print("all prose-budget cases behaved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
