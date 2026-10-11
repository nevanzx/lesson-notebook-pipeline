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
