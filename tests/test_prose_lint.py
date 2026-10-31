import importlib.util
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TOOL = REPO / "v2" / "tools" / "prose_lint.py"
_spec = importlib.util.spec_from_file_location("prose_lint", TOOL)
prose_lint = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(prose_lint)


def _section(body, sid="s1", heading="1 Sec"):
    return '<section class="block" id="%s"><h2>%s</h2>%s</section>' % (sid, heading, body)


def _words(n, word="word"):
    return " ".join([word] * n)


def test_dense_paragraph_over_budget_is_a_fail():
    report = prose_lint.lint_text(_section("<p>%s</p>" % _words(41)))
    assert [f["rule"] for f in report["fails"]] == ["dense_over_budget"]
    assert report["fails"][0]["section"] == "s1"


def test_long_sentence_under_paragraph_budget_is_a_fail():
    report = prose_lint.lint_text(_section("<p>%s. Short.</p>" % _words(31)))
    assert "dense_over_budget" in [f["rule"] for f in report["fails"]]


def test_formula_gloss_is_exempt_from_dense():
    body = ('<div class="def" data-kind="concept"><span class="tag">Formula</span>%s '
            '<math><mi>x</mi></math> Where: x is the input; y is the output.</div>'
            % _words(45))
    report = prose_lint.lint_text(_section(body))
    assert "dense_over_budget" not in [f["rule"] for f in report["fails"]]


def test_unformatted_first_term_is_a_fail():
    report = prose_lint.lint_text(_section("<p>Fixed cost matters here.</p>"),
                                  glossary=["Fixed cost"])
    assert "unformatted_term" in [f["rule"] for f in report["fails"]]


def test_bolded_first_term_passes():
    report = prose_lint.lint_text(
        _section("<p><strong>Fixed cost</strong> matters here.</p>"),
        glossary=["Fixed cost"])
    assert "unformatted_term" not in [f["rule"] for f in report["fails"]]


def test_later_unbolded_use_passes():
    html = _section("<p><strong>Fixed cost</strong> matters.</p>"
                    "<p>Fixed cost again.</p>")
    report = prose_lint.lint_text(html, glossary=["Fixed cost"])
    assert "unformatted_term" not in [f["rule"] for f in report["fails"]]


def test_math_box_without_gloss_is_a_fail():
    body = ('<div class="def" data-kind="concept"><span class="tag">Formula</span>'
            'The ratio is <math><mi>r</mi></math> and it matters here.</div>')
    report = prose_lint.lint_text(_section(body))
    assert "symbol_no_gloss" in [f["rule"] for f in report["fails"]]


def test_math_box_with_gloss_passes():
    body = ('<div class="def" data-kind="concept"><span class="tag">Formula</span>'
            'The ratio is <math><mi>r</mi></math> here. Where: r is the ratio; '
            'x is the input.</div>')
    report = prose_lint.lint_text(_section(body))
    assert "symbol_no_gloss" not in [f["rule"] for f in report["fails"]]


def test_vague_referent_is_review_only():
    report = prose_lint.lint_text(
        _section("<p>This split matters for every later number in the lesson.</p>"))
    assert "vague_referent" in [r["rule"] for r in report["review"]]
    assert "vague_referent" not in [f["rule"] for f in report["fails"]]


def test_sequence_without_budget_breach_is_review_only():
    report = prose_lint.lint_text(
        _section("<p>First we count the cost, then we split it, next we check it.</p>"))
    assert "dense_signals" in [r["rule"] for r in report["review"]]


def test_term_before_definition_is_review_only():
    html = _section("<p>Fixed cost matters.</p>"
                    '<div class="def" data-kind="concept"><span class="tag">Fixed cost</span>'
                    "A cost that does not move with volume.</div>")
    report = prose_lint.lint_text(html, glossary=["Fixed cost"])
    assert "term_before_definition" in [r["rule"] for r in report["review"]]


def test_exempt_section_is_skipped():
    report = prose_lint.lint_text(_section("<p>%s</p>" % _words(50), sid="assignment"))
    assert report["fails"] == []
    assert report["sections"] == {}


def test_math_box_glossed_in_separate_paragraph_passes():
    body = ('<div class="def" data-kind="concept"><p>The ratio is <math><mi>r</mi></math>.</p>'
            '<p>Where: r is the ratio.</p></div>')
    report = prose_lint.lint_text(_section(body))
    assert "symbol_no_gloss" not in [f["rule"] for f in report["fails"]]


def test_inline_math_paragraph_is_still_dense_checked():
    body = "<p>%s <math><mi>x</mi></math></p>" % _words(45)
    report = prose_lint.lint_text(_section(body))
    assert "dense_over_budget" in [f["rule"] for f in report["fails"]]


def test_term_first_seen_in_formula_gloss_is_not_unformatted():
    body = ('<div class="def" data-kind="concept"><span class="tag">Formula</span>'
            'Fixed cost is <math><mi>F</mi></math> Where: F is fixed cost.</div>')
    report = prose_lint.lint_text(_section(body), glossary=["Fixed cost"])
    assert "unformatted_term" not in [f["rule"] for f in report["fails"]]


def test_term_in_formula_gloss_does_not_mark_it_seen():
    body = ('<div class="def" data-kind="concept"><span class="tag">Formula</span>'
            '<strong>Fixed cost</strong> is <math><mi>F</mi></math> '
            'Where: F is fixed cost.</div>'
            "<p>Fixed cost again.</p>")
    report = prose_lint.lint_text(_section(body), glossary=["Fixed cost"])
    assert "unformatted_term" in [f["rule"] for f in report["fails"]]


def test_definition_check_uses_word_boundaries():
    html = _section("<p>Cost matters.</p>"
                    '<div class="def" data-kind="concept"><span class="tag">Costing</span>'
                    "An accounting method for tracking spend.</div>")
    report = prose_lint.lint_text(html, glossary=["cost"])
    assert "term_before_definition" not in [r["rule"] for r in report["review"]]


def test_review_findings_carry_context():
    html = _section("<p>Alpha beta.</p>"
                    "<p>This split matters.</p>"
                    "<p>Omega end.</p>")
    report = prose_lint.lint_text(html)
    vague = [r for r in report["review"] if r["rule"] == "vague_referent"]
    assert vague
    assert vague[0]["context"] == {"before": "Alpha beta.", "after": "Omega end."}


def test_cli_json_and_exit_code(tmp_path, capsys):
    p = tmp_path / "x.html"
    p.write_text(_section("<p>%s</p>" % _words(45)), encoding="utf-8")
    assert prose_lint.main([str(p), "--json"]) == 1
    data = json.loads(capsys.readouterr().out)
    assert data["fails"][0]["rule"] == "dense_over_budget"


def test_cli_clean_file_exits_zero(tmp_path, capsys):
    p = tmp_path / "x.html"
    p.write_text(_section("<p>Short and clear.</p>"), encoding="utf-8")
    assert prose_lint.main([str(p)]) == 0
    assert "FAIL" not in capsys.readouterr().out


def test_cli_glossary_data_file_enables_term_check(tmp_path, capsys):
    p = tmp_path / "x.html"
    p.write_text(_section("<p>Fixed cost matters here.</p>"), encoding="utf-8")
    g = tmp_path / "glossary.data.js"
    g.write_text('LN.data.gl = { groups: [{ terms: [{ t: "Fixed cost", '
                 'd: "A cost that does not move with volume." }] }] };',
                 encoding="utf-8")
    assert prose_lint.main([str(p), "--glossary", str(g), "--json"]) == 1
    data = json.loads(capsys.readouterr().out)
    assert "unformatted_term" in [f["rule"] for f in data["fails"]]


def test_bare_formula_with_following_where_list_passes():
    body = ('<p><math display="block"><mi>x</mi></math></p>'
            '<p><strong>Where:</strong> x is the input.</p>')
    report = prose_lint.lint_text(_section(body))
    assert report["fails"] == []


def test_card_formula_with_where_passes():
    body = ('<div class="card"><p><math display="block"><mi>x</mi></math></p>'
            '<p><strong>Where:</strong> x is the input.</p></div>')
    report = prose_lint.lint_text(_section(body))
    assert report["fails"] == []


def test_long_where_list_is_not_dense():
    body = ('<p><math display="block"><mi>x</mi></math></p>'
            '<p><strong>Where:</strong> %s</p>' % _words(60))
    report = prose_lint.lint_text(_section(body))
    assert "dense_over_budget" not in [f["rule"] for f in report["fails"]]


def test_bare_formula_without_where_fails_symbol_no_gloss():
    body = ('<p><math display="block"><mi>x</mi></math></p>'
            '<p>Ordinary prose follows.</p>')
    report = prose_lint.lint_text(_section(body))
    assert "symbol_no_gloss" in [f["rule"] for f in report["fails"]]


def test_elsewhere_is_not_a_where_gloss():
    body = ('<p><math display="block"><mi>x</mi></math></p>'
            '<p>Elsewhere: the symbol is explained.</p>')
    report = prose_lint.lint_text(_section(body))
    assert "symbol_no_gloss" in [f["rule"] for f in report["fails"]]


def test_glossary_section_skips_unformatted_term():
    report = prose_lint.lint_text(
        _section("<p>Fixed cost matters here.</p>", sid="glossary"),
        glossary=["Fixed cost"])
    assert "unformatted_term" not in [f["rule"] for f in report["fails"]]


def test_glossary_section_still_checks_dense():
    report = prose_lint.lint_text(
        _section("<p>%s</p>" % _words(41), sid="glossary"))
    assert "dense_over_budget" in [f["rule"] for f in report["fails"]]


def test_bold_longer_word_does_not_mask_the_term():
    report = prose_lint.lint_text(
        _section("<p><strong>Costing</strong> matters for cost.</p>"),
        glossary=["cost"])
    assert "unformatted_term" in [f["rule"] for f in report["fails"]]


def test_one_sequence_marker_is_not_dense_noise():
    report = prose_lint.lint_text(
        _section("<p>First we count the cost of the split today.</p>"))
    assert "dense_signals" not in [r["rule"] for r in report["review"]]


def test_inline_math_in_plain_paragraph_needs_no_gloss():
    body = ("<p>The cart sells 750 plates at <math><mn>80</mn></math> "
            "pesos margin.</p>")
    report = prose_lint.lint_text(_section(body))
    assert "symbol_no_gloss" not in [f["rule"] for f in report["fails"]]


def test_def_formula_accepts_a_bullet_where_list():
    body = ('<div class="def" data-kind="concept"><p>Margin is <math><mn>80</mn></math> pesos.</p>'
            '<ul><li><strong>Where:</strong> 80 is the margin.</li></ul></div>')
    report = prose_lint.lint_text(_section(body))
    assert "symbol_no_gloss" not in [f["rule"] for f in report["fails"]]


def test_worked_def_accepts_one_where_list_for_several_math_steps():
    body = ('<div class="def" data-kind="concept"><p><strong>1. Read</strong> the price is '
            '<math><mn>80</mn></math>.</p>'
            '<p><strong>2. Multiply</strong> by <math><mn>750</mn></math>.</p>'
            '<p><strong>Where:</strong> 80 is the margin; 750 is the volume.</p>'
            '</div>')
    report = prose_lint.lint_text(_section(body))
    assert "symbol_no_gloss" not in [f["rule"] for f in report["fails"]]


def test_plain_where_paragraph_is_still_dense_checked():
    body = "<p>%s where: the margin is a per-plate value.</p>" % _words(45)
    report = prose_lint.lint_text(_section(body))
    assert "dense_over_budget" in [f["rule"] for f in report["fails"]]
