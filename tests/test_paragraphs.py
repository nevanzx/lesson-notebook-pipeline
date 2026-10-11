import importlib.util
import json
from pathlib import Path

TOOL = (
    Path(__file__).resolve().parents[1]
    / "average-student-checker"
    / "tools"
    / "paragraphs.py"
)
_spec = importlib.util.spec_from_file_location("paragraphs_tool", TOOL)
paragraphs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(paragraphs)


def _section(body: str) -> str:
    return f'<section class="block" id="s1"><h2>1 Sec</h2>{body}</section>'


def test_paragraph_reports_bold_spans():
    html = _section("<p><strong>Total revenue</strong> minus explicit costs only.</p>")
    para = paragraphs.split_sections(html)[0]["paragraphs"][0]
    assert para["bold"] == ["Total revenue"]


def test_paragraph_reports_italic_spans():
    html = _section("<p>We call this <em>strategic cost analysis</em> here.</p>")
    para = paragraphs.split_sections(html)[0]["paragraphs"][0]
    assert para["italic"] == ["strategic cost analysis"]
    assert para["bold"] == []


def test_paragraph_without_markup_has_empty_spans():
    html = _section("<p>Total revenue minus explicit costs only.</p>")
    para = paragraphs.split_sections(html)[0]["paragraphs"][0]
    assert para["bold"] == []
    assert para["italic"] == []


GLOSSARY_SCRIPT = """
<script>
LN.data.gloss1 = {
  groups: [
    {
      name: "Statements & ratios",
      terms: [
        {t: "Balance sheet", d: "Assets, liabilities and equity at a point in time."},
        {t: "Current ratio", d: "Current Assets / Current Liabilities."}
      ]
    }
  ]
};
LN.data.statements1 = {left: "L", right: "R", items: [{t: "Not a glossary term", a: "left"}]};
</script>
"""


def test_glossary_terms_extracted():
    html = _section("<p>Body.</p>") + GLOSSARY_SCRIPT
    assert paragraphs.glossary_terms(html) == ["Balance sheet", "Current ratio"]


def test_glossary_terms_empty_without_glossary():
    assert paragraphs.glossary_terms(_section("<p>Body.</p>")) == []


def test_cli_json_includes_glossary_and_bold(capsys, tmp_path):
    html = _section("<p><strong>Total revenue</strong> is a term.</p>") + GLOSSARY_SCRIPT
    p = tmp_path / "built.html"
    p.write_text(html, encoding="utf-8")
    assert paragraphs.main([str(p), "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert data["glossary"] == ["Balance sheet", "Current ratio"]
    assert data["sections"][0]["paragraphs"][0]["bold"] == ["Total revenue"]


def test_cli_text_shows_bold_and_glossary(capsys, tmp_path):
    html = _section("<p><strong>Total revenue</strong> is a term.</p>") + GLOSSARY_SCRIPT
    p = tmp_path / "built.html"
    p.write_text(html, encoding="utf-8")
    assert paragraphs.main([str(p)]) == 0
    out = capsys.readouterr().out
    assert "Total revenue" in out
    assert "Balance sheet" in out


def test_keep_words_min_and_max_window():
    assert paragraphs.keep_words(45, 0, 40) is True
    assert paragraphs.keep_words(40, 0, 40) is False
    assert paragraphs.keep_words(10, 0, 40) is False
    assert paragraphs.keep_words(10, 0, 0) is True
    assert paragraphs.keep_words(5, 6, 0) is False


def test_cli_max_words_lints_over_budget(capsys, tmp_path):
    body = (
        "<p>" + " ".join(["short"] * 10) + ".</p>"
        + "<p>" + " ".join(["long"] * 45) + ".</p>"
    )
    p = tmp_path / "built.html"
    p.write_text(_section(body), encoding="utf-8")
    assert paragraphs.main([str(p), "--json", "--max-words", "40"]) == 0
    data = json.loads(capsys.readouterr().out)
    paras = data["sections"][0]["paragraphs"]
    assert len(paras) == 1
    assert paras[0]["words"] == 45


def test_sentence_visual_maps_shape_signals():
    assert "flow" in paragraphs.sentence_visual("First total the assets, then divide.")
    assert "comparison table" in paragraphs.sentence_visual(
        "Assets are current, while liabilities fall due sooner."
    )
    assert "figure" in paragraphs.sentence_visual("Margins increased over the period.")
    assert "bullet hierarchy" in paragraphs.sentence_visual(
        "It includes cash, receivables, and inventories."
    )


def test_sentence_visual_falls_back_to_card_split():
    assert "card split" in paragraphs.sentence_visual("Valuation matters a great deal.")


def test_long_sentences_flags_and_pairs_visual():
    text = "Short one. " + " ".join(["word"] * 40) + "."
    flagged = paragraphs.long_sentences(text, 30)
    assert len(flagged) == 1
    assert flagged[0]["index"] == 2
    assert flagged[0]["words"] == 40
    assert flagged[0]["visual"]


def test_cli_max_sentence_words_pairs_visual(capsys, tmp_path):
    html = _section(
        "<p>First gather the inputs, then compute the ratio when the period closes.</p>"
    )
    p = tmp_path / "built.html"
    p.write_text(html, encoding="utf-8")
    assert paragraphs.main([str(p), "--json", "--max-sentence-words", "5"]) == 0
    data = json.loads(capsys.readouterr().out)
    flagged = data["sections"][0]["paragraphs"][0]["long_sentences"]
    assert len(flagged) == 1
    assert "flow" in flagged[0]["visual"]
