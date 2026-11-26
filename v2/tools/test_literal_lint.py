#!/usr/bin/env python3
"""Regression tests for the literal-English lint (SKILL.md §2.1g)."""
import unittest

import literal_lint


def page(body, sid="demo"):
    return '<section class="block" id="%s"><p>%s</p></section>' % (sid, body)


class LiteralLintTests(unittest.TestCase):
    def test_plain_sentence_passes(self):
        rep = literal_lint.lint_text(
            page("The student failed the quiz and asked which step to change."))
        self.assertEqual(rep["fails"], [])

    def test_idioms_fail(self):
        rep = literal_lint.lint_text(
            page("The plan fell short, and the stance sits beside the frame."))
        matches = {f["match"] for f in rep["fails"]}
        self.assertIn("fell short", matches)
        self.assertIn("sits beside", matches)

    def test_structural_metaphors_fail(self):
        rep = literal_lint.lint_text(
            page("The loop has two directions, and the lens selects what registers."))
        matches = {f["match"] for f in rep["fails"]}
        self.assertIn("loop", matches)
        self.assertIn("lens", matches)

    def test_dispose_false_friend_fails(self):
        rep = literal_lint.lint_text(
            page("The stance disposes a response without forcing it."))
        self.assertTrue(any("dispos" in f["match"] for f in rep["fails"]))

    def test_review_only_does_not_fail(self):
        rep = literal_lint.lint_text(
            page("The claim survives the test, and the finding reads as support."))
        self.assertEqual(rep["fails"], [])
        self.assertGreater(len(rep["review"]), 0)

    def test_references_and_assignment_are_skipped(self):
        text = page("It fell short.", sid="references") + \
            page("It fell short.", sid="assignment")
        rep = literal_lint.lint_text(text)
        self.assertEqual(rep["total"], 0)


if __name__ == "__main__":
    unittest.main()
