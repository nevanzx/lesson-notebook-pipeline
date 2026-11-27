#!/usr/bin/env python
"""Tests for the v2.54 plain-language rule (prose_lint.py).

Run:  python v2/tools/test_plain_lint.py
Exit 0 = every case behaved; exit 1 = at least one failure.

The rule: every teaching sentence names a concrete actor and a concrete
action. The deterministic seam catches the high-confidence cases (process
phrases and hidden actors) and sends the rest to the C2 Plain lens.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import prose_lint  # noqa: E402


def section(*paragraphs):
    body = "".join("<p>%s</p>" % p for p in paragraphs)
    return '<section class="block" id="t"><h2>Test</h2>%s</section>' % body


def rules(report):
    return [f["rule"] for f in report["fails"] + report["review"]]


def fails(report):
    return [f["rule"] for f in report["fails"]]


def review(report):
    return [f["rule"] for f in report["review"]]


def main():
    failures = []

    def check(name, ok, detail=""):
        print(("ok   " if ok else "FAIL ") + name
              + (("  -- " + detail) if detail and not ok else ""))
        if not ok:
            failures.append(name)

    # 1. Process scaffolding: "the process by which" hides the plain verb.
    r = prose_lint.lint_text(section(
        "The process by which people infer their own attitudes from their own "
        "behavior is unclear."))
    check("'the process by which' fails as plain_process_phrase",
          "plain_process_phrase" in fails(r), str(rules(r)))

    # 2. Hidden actor: "is treated as" does not say who treats it.
    r = prose_lint.lint_text(section(
        "The behavior still has to be treated as a signal of intent."))
    check("'be treated as' fails as plain_hidden_actor",
          "plain_hidden_actor" in fails(r), str(rules(r)))

    # 3. Passive voice goes to the reviewer shortlist.
    r = prose_lint.lint_text(section(
        "The behavior still has to be carried out, and carrying it out needs "
        "a plan."))
    check("'be carried out' is flagged as plain_passive",
          "plain_passive" in review(r), str(rules(r)))

    # 4. Nominalization: the verb is hiding inside the noun.
    r = prose_lint.lint_text(section(
        "The interpretation of a setback is a judgment about the person."))
    check("'interpretation of' is flagged as plain_nominalization",
          "plain_nominalization" in review(r), str(rules(r)))

    # 5. Abstract subject: a frame cannot protect anything.
    r = prose_lint.lint_text(section(
        "The frame protects the person's self-image by refusing the test."))
    check("'The frame protects' is flagged as plain_abstract_subject",
          "plain_abstract_subject" in review(r), str(rules(r)))

    # 6. The plain rewrite must pass cleanly.
    r = prose_lint.lint_text(section(
        "How people figure out their own attitudes from their own behavior, "
        "especially when the attitude is unclear."))
    plain_rules = [x for x in rules(r) if x.startswith("plain_")]
    check("plain rewrite has no plain_* findings", not plain_rules,
          str(plain_rules))

    # 7. A 30-plus word sentence is a review finding, not a hard fail.
    r = prose_lint.lint_text(section(
        "This sentence is deliberately written with a large number of short "
        "words so that it runs past the twenty five word target without "
        "reaching the forty five word hard cap at all."))
    check("30-plus word sentence is flagged as plain_long_sentence",
          "plain_long_sentence" in review(r), str(rules(r)))

    # 8. Academic density is a grade-level review finding.
    r = prose_lint.lint_text(section(
        "The conceptualization of entrepreneurial propensity necessitates "
        "the operationalization of multidimensional constructs."))
    check("academic sentence is flagged as plain_grade",
          "plain_grade" in rules(r), str(rules(r)))

    # 9. A state adjective is not a passive verb.
    r = prose_lint.lint_text(section(
        "The room is clean, and the plan is fixed."))
    check("state adjective 'is fixed' does not fail as plain_hidden_actor",
          "plain_hidden_actor" not in fails(r), str(rules(r)))

    # 10. Glossary definitions are checked from data.js, not the section HTML.
    old_gloss = ('LN.data.gl = { groups: [ { name: "x", terms: [ '
                 '{ t: "self-perception", d: "The process by which people '
                 'infer their own attitudes from their own behavior." } ] } ] };')
    r = prose_lint.lint_glossary_text(old_gloss)
    check("glossary 'process by which' fails as plain_process_phrase",
          "plain_process_phrase" in fails(r), str(rules(r)))

    plain_gloss = ('LN.data.gl = { groups: [ { name: "x", terms: [ '
                   '{ t: "self-perception", d: "How people figure out their '
                   'own attitudes from their own behavior." } ] } ] };')
    r = prose_lint.lint_glossary_text(plain_gloss)
    plain_rules = [x for x in rules(r) if x.startswith("plain_")]
    check("plain glossary definition has no plain_* findings",
          not plain_rules, str(plain_rules))

    print()
    if failures:
        print("FAILED: %d case(s): %s" % (len(failures), ", ".join(failures)))
        return 1
    print("all plain-language cases behaved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
