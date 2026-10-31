import importlib.util
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TOOL = REPO / "v2" / "tools" / "pacing_lint.py"
_spec = importlib.util.spec_from_file_location("pacing_lint", TOOL)
pacing_lint = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pacing_lint)


def _section(body, sid="s1", heading="1 Sec"):
    return '<section class="block" id="%s"><h2>%s</h2>%s</section>' % (sid, heading, body)


def _words(n, word="word"):
    return " ".join([word] * n)


def _teaching(n_words, mounts=()):
    html = "<p>%s</p>" % _words(n_words)
    for i, comp in enumerate(mounts):
        html += '<div data-component="%s" data-key="k%d"></div>' % (comp, i)
    return html


def _calc(n_words, tag="Worked — Costing"):
    return ('<div class="def" data-kind="concept"><span class="tag">%s</span>'
            '<p>%s <math><mi>x</mi></math></p></div>' % (tag, _words(n_words)))


def _lesson(sections=5, words=1324):
    """A content-only lesson that uses the hour: 60.0 min at the defaults."""
    parts = [
        _section(_teaching(400, ["milo-list"]), "overview", "0 Overview"),
        _section(_teaching(390, ["glossary"]), "glossary", "0G Glossary"),
    ]
    for i in range(sections):
        parts.append(_section(_teaching(words, ["sort-statement"]),
                              "s%d" % i, "%d Section" % (i + 1)))
    parts.append(_section('<div data-component="assignment" data-key="a1"></div>',
                          "assignment", "7 Assignment"))
    parts.append(_section(_teaching(390, ["flipcards"]), "recap", "8 Recap"))
    return "".join(parts)


def test_content_is_priced_at_discussion_pace():
    report = pacing_lint.lint_text(_section(_teaching(260)))
    sec = report["estimate"]["sections"][0]
    assert sec["words"] == 260
    assert sec["prose_minutes"] == 2.0
    assert report["estimate"]["total_minutes"] == 2.0


def test_calculation_content_counts_half():
    report = pacing_lint.lint_text(_section(_calc(260)))
    sec = report["estimate"]["sections"][0]
    assert sec["calc_words"] == sec["words"]
    assert sec["weighted_words"] == sec["words"] / 2
    assert sec["prose_minutes"] == 1.0


def test_formula_gloss_in_a_box_counts_half():
    body = ('<div class="mini"><p>%s Where: x is the rate; y is the base.</p></div>'
            % _words(260))
    sec = pacing_lint.lint_text(_section(body))["estimate"]["sections"][0]
    assert sec["calc_words"] == sec["words"]


def test_mixed_section_weights_only_the_math():
    body = _teaching(260) + _calc(260)
    sec = pacing_lint.lint_text(_section(body))["estimate"]["sections"][0]
    assert sec["calc_words"] < sec["words"] < 2 * sec["calc_words"]
    assert sec["prose_minutes"] == 3.0


def test_activities_are_reported_but_not_budgeted():
    report = pacing_lint.lint_text(_section(_teaching(130, ["sort-statement",
                                                           "step-solver"])))
    est = report["estimate"]
    assert est["activity_minutes"] == 8
    assert est["total_minutes"] == 1.0
    assert report["fails"] == []


def test_a_full_deck_of_activities_never_overruns_the_budget():
    mounts = ["case-match"] * 20
    report = pacing_lint.lint_text(_section(_teaching(130, mounts)))
    assert report["estimate"]["activity_minutes"] == 80
    assert report["estimate"]["total_minutes"] == 1.0
    assert "lesson_over_budget" not in [f["rule"] for f in report["fails"]]


def test_assignment_costs_no_budget():
    report = pacing_lint.lint_text(_section(
        "%s<div data-component=\"assignment\" data-key=\"a1\"></div>"
        % _teaching(400), "assignment", "7 Assignment"))
    est = report["estimate"]
    assert est["total_minutes"] == 0
    assert est["words"] == 0
    assert est["activity_minutes"] == 12
    assert "section_over_budget" not in [f["rule"] for f in report["fails"]]


def test_teaching_section_over_1500_weighted_words_fails():
    report = pacing_lint.lint_text(_section(_teaching(1600)))
    rules = [f["rule"] for f in report["fails"]]
    assert rules == ["section_over_budget"]
    assert "1600" in report["fails"][0]["detail"]


def test_calculation_words_can_push_a_section_past_the_cap():
    body = _teaching(800) + _calc(1200)
    report = pacing_lint.lint_text(_section(body))
    assert "section_over_budget" not in [f["rule"] for f in report["fails"]]
    body = _teaching(1000) + _calc(1600)
    report = pacing_lint.lint_text(_section(body))
    assert "section_over_budget" in [f["rule"] for f in report["fails"]]


def test_bookend_section_over_450_weighted_words_fails():
    report = pacing_lint.lint_text(_section(_teaching(460), "overview", "0 Overview"))
    assert [f["rule"] for f in report["fails"]] == ["section_over_budget"]


def test_lesson_over_budget_fails_with_the_overrun():
    report = pacing_lint.lint_text(_lesson(sections=7))
    fails = [f for f in report["fails"] if f["rule"] == "lesson_over_budget"]
    assert len(fails) == 1
    assert "budget 60" in fails[0]["detail"]
    assert "over" in fails[0]["detail"]
    assert "not part of the budget" in fails[0]["fix"]


def test_lesson_at_the_budget_passes():
    report = pacing_lint.lint_text(_lesson())
    assert report["estimate"]["total_minutes"] == 60.0
    assert report["fails"] == []


def test_minutes_option_raises_the_budget():
    assert pacing_lint.lint_text(_lesson(sections=7), minutes=120)["fails"] == []


def test_short_lesson_is_a_review_not_a_fail():
    report = pacing_lint.lint_text(_section(_teaching(100, ["milo-list"])))
    assert report["fails"] == []
    assert [f["rule"] for f in report["review"]] == ["lesson_under_budget"]


def test_estimate_lists_every_section_in_order():
    report = pacing_lint.lint_text(_lesson())
    ids = [s["id"] for s in report["estimate"]["sections"]]
    assert ids == ["overview", "glossary", "s0", "s1", "s2", "s3", "s4",
                   "assignment", "recap"]
    assert report["estimate"]["budget"] == 60
    assert report["estimate"]["activity_minutes"] == 2 + 2 + 15 + 12 + 2


def test_report_prints_the_budget_line(tmp_path, capsys):
    path = tmp_path / "lesson.html"
    path.write_text(_lesson(sections=7), encoding="utf-8")
    pacing_lint.main([str(path)])
    out = capsys.readouterr().out
    assert "budget 60" in out
    assert "not budgeted" in out


def test_cli_fails_over_budget_and_passes_with_a_longer_class(tmp_path):
    path = tmp_path / "lesson.html"
    path.write_text(_lesson(sections=7), encoding="utf-8")
    assert pacing_lint.main([str(path)]) == 1
    assert pacing_lint.main([str(path), "--minutes", "120"]) == 0


def test_cli_json_reports_the_estimate(tmp_path, capsys):
    path = tmp_path / "lesson.html"
    path.write_text(_lesson(sections=7), encoding="utf-8")
    pacing_lint.main([str(path), "--json"])
    payload = json.loads(capsys.readouterr().out)
    assert payload["estimate"]["budget"] == 60
    assert payload["estimate"]["total_minutes"] > 60
