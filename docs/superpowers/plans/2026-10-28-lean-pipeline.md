# Lean Pipeline (v2.32) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut lesson-build agent invocations roughly in half by making prose clarity mechanical, merging the two per-section reviewers, removing the duplicate sweep, fixing Section 7, and making lab components opt-in.

**Architecture:** A new stdlib `prose_lint.py` turns the Dense/formatting rules into build gates and emits a short list of paragraphs that still need judgement. One merged reviewer per qualifying section replaces the clarity + numeric reviewers. The author brief loses lab components and the duplicate DAG authoring. `build.py` gains a `labs` gate, signature-based reference dedupe, and the lint gate.

**Tech Stack:** Python 3.6+ stdlib (`build.py`, `tools/prose_lint.py`, `tools/paragraphs.py`); pytest for tests; Node smoke tools unchanged.

## Global Constraints

- Python 3.6+ stdlib only for `build.py` and the new tool; no new dependencies.
- `labs` defaults to **false** when absent from `build.json`; `"labs": true` opts in.
- Prose budget thresholds: **40 words per paragraph**, **30 words per sentence**.
- Version strings become **2.32** in `v2/SKILL.md` frontmatter and title.
- Assignment and references sections are never linted or reviewed.
- Do **not** run any `git commit` step unless the user has explicitly approved commits.
- Keep every existing test green; run `python -m pytest tests -q` at the end of each code task.

---

### Task 1: Expose raw paragraph fragments and section bodies

**Files:**
- Modify: `average-student-checker/tools/paragraphs.py` (`make_unit`, `split_sections`)
- Test: `tests/test_paragraphs.py`

**Interfaces:**
- Produces: each paragraph dict gains `"raw"` (the uncleaned HTML fragment); each section dict gains `"body"` (its HTML body). No existing key changes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_paragraphs.py`:

```python
def test_paragraph_exposes_raw_fragment():
    html = _section('<p>The ratio is <math><mi>x</mi></math>.</p>')
    para = paragraphs.split_sections(html)[0]["paragraphs"][0]
    assert "<math>" in para["raw"]


def test_section_exposes_body():
    html = _section("<p>Body.</p>")
    sec = paragraphs.split_sections(html)[0]
    assert "Body." in sec["body"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_paragraphs.py -q`
Expected: FAIL with `KeyError: 'raw'` / `KeyError: 'body'`.

- [ ] **Step 3: Add the keys**

In `average-student-checker/tools/paragraphs.py`, inside `make_unit`, add `"raw": fragment,` next to `"text": content,`:

```python
    return {
        "offset": offset,
        "box": box,
        "tag": tag,
        "words": len(words),
        "head": " ".join(words[:8]),
        "tail": " ".join(words[-8:]),
        "text": content,
        "raw": fragment,
        "bold": spans(fragment, BOLD_RE),
        "italic": spans(fragment, ITAL_RE),
    }
```

In `split_sections`, add `"body": body,` to the section dict:

```python
        out.append(
            {
                "id": sid,
                "heading": heading,
                "exempt": sid in EXEMPT_SECTIONS,
                "body": body,
                "paragraphs": paragraphs,
            }
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_paragraphs.py -q`
Expected: PASS (all paragraphs tests).

- [ ] **Step 5: Commit (only with explicit approval)**

```bash
git add average-student-checker/tools/paragraphs.py tests/test_paragraphs.py
git commit -m "feat(prose): expose raw paragraph fragments and section bodies"
```

---

### Task 2: Add the deterministic prose lint

**Files:**
- Create: `v2/tools/prose_lint.py`
- Test: `tests/test_prose_lint.py`

**Interfaces:**
- Consumes: `paragraphs.split_sections`, `paragraphs.split_sentences`, `paragraphs.glossary_terms` from Task 1.
- Produces:
  - `lint_text(text: str, glossary: list[str] | None = None, max_words: int = 40, max_sentence_words: int = 30) -> dict` with keys `fails`, `review`, `sections`.
  - Each finding: `{rule, severity, section, paragraph, head, tail, detail, fix}`; `review` findings also carry `context` when available.
  - `main(argv: list[str]) -> int`; exit 1 when `fails` is non-empty, else 0.
  - Re-export `glossary_terms = paragraphs.glossary_terms`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_prose_lint.py`:

```python
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
    body = ('<div class="def"><span class="tag">Formula</span>%s '
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
    body = ('<div class="def"><span class="tag">Formula</span>'
            'The ratio is <math><mi>r</mi></math> and it matters here.</div>')
    report = prose_lint.lint_text(_section(body))
    assert "symbol_no_gloss" in [f["rule"] for f in report["fails"]]


def test_math_box_with_gloss_passes():
    body = ('<div class="def"><span class="tag">Formula</span>'
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
                    '<div class="def"><span class="tag">Fixed cost</span>'
                    "A cost that does not move with volume.</div>")
    report = prose_lint.lint_text(html, glossary=["Fixed cost"])
    assert "term_before_definition" in [r["rule"] for r in report["review"]]


def test_exempt_section_is_skipped():
    report = prose_lint.lint_text(_section("<p>%s</p>" % _words(50), sid="assignment"))
    assert report["fails"] == []
    assert report["sections"] == {}


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_prose_lint.py -q`
Expected: FAIL on import (`FileNotFoundError` for `prose_lint.py`).

- [ ] **Step 3: Write the implementation**

Create `v2/tools/prose_lint.py`:

```python
#!/usr/bin/env python3
"""Deterministic prose lint for lesson parts and built notebooks.

Two severities:
  fail   - objective, countable, blocks the build
  review - needs judgement; feeds the section reviewer shortlist
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

_CHECKER_TOOLS = (Path(__file__).resolve().parents[2]
                  / "average-student-checker" / "tools")
if str(_CHECKER_TOOLS) not in sys.path:
    sys.path.insert(0, str(_CHECKER_TOOLS))

import paragraphs  # noqa: E402

EXEMPT_SECTIONS = {"assignment", "assign", "references"}
DEF_BOXES = {"def", "mini"}
DEMONSTRATIVES = re.compile(
    r"(?:^|[.!?]\s+)(?:This|These|That|Those|It|The above)\b")
SEQUENCE_RE = re.compile(r"\b(?:first|then|next|finally|afterwards)\b", re.I)

glossary_terms = paragraphs.glossary_terms


def _finding(rule, severity, section, unit, detail, fix, context=None):
    found = {
        "rule": rule,
        "severity": severity,
        "section": section,
        "paragraph": unit["index"],
        "head": unit["head"],
        "tail": unit["tail"],
        "detail": detail,
        "fix": fix,
    }
    if context is not None:
        found["context"] = context
    return found


def _is_formula_gloss(unit):
    raw = unit.get("raw", "").lower()
    return "<math" in raw or "where:" in unit["text"].lower()


def _term_re(term):
    return re.compile(r"(?<!\w)%s(?!\w)" % re.escape(term), re.I)


def lint_text(text, glossary=None, max_words=40, max_sentence_words=30):
    glossary = glossary or []
    sections = paragraphs.split_sections(text)
    fails, review, meta = [], [], {}

    for sec in sections:
        sid = sec["id"]
        if sid in EXEMPT_SECTIONS:
            continue
        body = sec.get("body", "")
        paras = sec["paragraphs"]
        meta[sid] = {
            "has_math": "<math" in body.lower(),
            "paragraphs": len(paras),
        }

        for unit in paras:
            if _is_formula_gloss(unit):
                continue
            long_sents = [
                (i, len(s.split()))
                for i, s in enumerate(paragraphs.split_sentences(unit["text"]), 1)
                if len(s.split()) > max_sentence_words
            ]
            if unit["words"] > max_words or long_sents:
                detail = "%d words" % unit["words"]
                if long_sents:
                    i, n = long_sents[0]
                    detail += "; sentence %d is %d words" % (i, n)
                fails.append(_finding(
                    "dense_over_budget", "fail", sid, unit, detail,
                    "split the paragraph; render the list/sequence as a visual"))

        if glossary:
            seen = set()
            for unit in paras:
                low = unit["text"].lower()
                bold = " | ".join(unit["bold"]).lower()
                for term in glossary:
                    t = term.lower()
                    if t in seen or not _term_re(t).search(low):
                        continue
                    seen.add(t)
                    if t not in bold:
                        fails.append(_finding(
                            "unformatted_term", "fail", sid, unit,
                            "first use of glossary term %r is not bold" % term,
                            "wrap the term in <strong>"))

        for unit in paras:
            if unit.get("box") not in DEF_BOXES:
                continue
            if "<math" not in unit.get("raw", "").lower():
                continue
            if "where:" not in unit["text"].lower():
                fails.append(_finding(
                    "symbol_no_gloss", "fail", sid, unit,
                    "MathML box has no Where: symbol gloss",
                    "add a Where: list, one symbol per line"))

        flagged_terms = set()
        for unit in paras:
            low = unit["text"].lower()
            if DEMONSTRATIVES.search(unit["text"]):
                review.append(_finding(
                    "vague_referent", "review", sid, unit,
                    "demonstrative opener: %r" % unit["head"][:40],
                    "name the noun this refers to"))
            if (not _is_formula_gloss(unit) and unit["words"] <= max_words
                    and (unit["text"].count(",") >= 3
                         or SEQUENCE_RE.search(low))):
                review.append(_finding(
                    "dense_signals", "review", sid, unit,
                    "enumerates or sequences inside one paragraph",
                    "render the list/sequence as a visual"))
            for term in glossary:
                t = term.lower()
                if t in flagged_terms or not _term_re(t).search(low):
                    continue
                flagged_terms.add(t)
                def_idx = [
                    d["index"] for d in paras
                    if d.get("box") in DEF_BOXES
                    and t in (d.get("tag", "") + " " + d["text"]).lower()
                ]
                if def_idx and unit["index"] < min(def_idx):
                    review.append(_finding(
                        "term_before_definition", "review", sid, unit,
                        "term %r is used before its definition" % term,
                        "introduce or define the term first"))

    return {"fails": fails, "review": review, "sections": meta}


def _print_report(report):
    for f in report["fails"]:
        print("FAIL   %-24s %s ¶%d  %s"
              % (f["rule"], f["section"], f["paragraph"], f["detail"]))
        print("       %s … %s" % (f["head"], f["tail"]))
        print("       -> %s" % f["fix"])
    for f in report["review"]:
        print("REVIEW %-24s %s ¶%d  %s"
              % (f["rule"], f["section"], f["paragraph"], f["detail"]))
        print("       -> %s" % f["fix"])


def main(argv):
    ap = argparse.ArgumentParser(
        description="Deterministic prose lint for lesson parts and notebooks.")
    ap.add_argument("html")
    ap.add_argument("--glossary", help="assembled file to read glossary terms from")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--max-words", type=int, default=40)
    ap.add_argument("--max-sentence-words", type=int, default=30)
    args = ap.parse_args(argv)
    try:
        text = Path(args.html).read_text(encoding="utf-8")
    except OSError as exc:
        print("cannot read %s: %s" % (args.html, exc), file=sys.stderr)
        return 2
    if args.glossary:
        try:
            gtext = Path(args.glossary).read_text(encoding="utf-8")
        except OSError as exc:
            print("cannot read %s: %s" % (args.glossary, exc), file=sys.stderr)
            return 2
        glossary = paragraphs.glossary_terms(gtext)
    else:
        glossary = paragraphs.glossary_terms(text)
    report = lint_text(text, glossary, args.max_words, args.max_sentence_words)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        _print_report(report)
    return 1 if report["fails"] else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_prose_lint.py -q`
Expected: PASS (15 tests).

- [ ] **Step 5: Run the existing parser tests**

Run: `python -m pytest tests/test_paragraphs.py -q`
Expected: PASS.

- [ ] **Step 6: Commit (only with explicit approval)**

```bash
git add v2/tools/prose_lint.py tests/test_prose_lint.py
git commit -m "feat(prose): deterministic lint for budget, terms, and glosses"
```

---

### Task 3: Gate lab components behind `"labs": true`

**Files:**
- Modify: `v2/build.py` (allowed keys at ~1968-1975; new check after the unknown-key block)
- Modify: `tests/test_components_matrix.py` (`make_real_wd` must set `"labs": true`)
- Test: `tests/test_build_labs.py`

**Interfaces:**
- Consumes: `build.assemble(workdir, skeleton)` and the existing `test_build.make_skel` / `make_workdir`.
- Produces: `build.json` accepts `"labs"` (boolean, default false); a false value rejects any `components` entry ending in `-lab`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_build_labs.py`:

```python
import json

import build
from test_build import make_skel, make_workdir


def _cfg(**extra):
    cfg = {
        "title": "T",
        "theme": "mini",
        "components": ["demo", "break-even-lab"],
        "output": "out.html",
    }
    cfg.update(extra)
    return json.dumps(cfg)


def _run(tmp_path, cfg):
    comps = ("demo", "break-even-lab")
    skel = make_skel(tmp_path, components=comps)
    wd = make_workdir(tmp_path, components=comps, files={"build.json": cfg})
    return build.assemble(wd, skel)


def test_labs_off_by_default_rejects_lab_component(tmp_path):
    _, errs, _ = _run(tmp_path, _cfg())
    assert any("is a lab" in e.msg for e in errs)


def test_labs_true_allows_lab_component(tmp_path):
    _, errs, _ = _run(tmp_path, _cfg(labs=True))
    assert not any("is a lab" in e.msg for e in errs)


def test_labs_must_be_boolean(tmp_path):
    _, errs, _ = _run(tmp_path, _cfg(labs="yes"))
    assert any("labs must be true or false" in e.msg for e in errs)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_build_labs.py -q`
Expected: FAIL — the default build does not reject the lab, and the string value is not validated.

- [ ] **Step 3: Add `labs` to the allowed keys**

In `v2/build.py`, replace the allowed-key block at `assemble`:

```python
        unknown = set(cfg) - {"title", "theme", "components", "output",
                              "extra_css", "extra_js", "week", "subject",
                              "assignment", "dag", "window", "layout", "labs"}
        if unknown:
            errors.append(Err("build.json", "build.json", None,
                              "unknown keys: %s" % ", ".join(sorted(unknown)),
                              "allowed: title, theme, components, output, extra_css, "
                              "extra_js, week, subject, assignment, dag, window, layout, labs"))
```

- [ ] **Step 4: Add the gate**

After that `unknown` block and before `if "assignment" in cfg.get("components", [])`, insert:

```python
        labs = cfg.get("labs", False)
        if not isinstance(labs, bool):
            errors.append(Err("build.json", "build.json", None,
                              "labs must be true or false",
                              'use "labs": true to opt into lab components'))
        elif not labs:
            for comp in cfg.get("components", []):
                if isinstance(comp, str) and comp.endswith("-lab"):
                    errors.append(Err(
                        "build.json", "build.json", None,
                        "%r is a lab, but labs are off by default" % comp,
                        'set "labs": true in build.json, or mount a practice '
                        "set/activity instead"))
```

- [ ] **Step 5: Keep the component matrix and the samples building**

In `tests/test_components_matrix.py`, `make_real_wd` writes the config; add `"labs": True`:

```python
    (wd / "build.json").write_text(json.dumps({
        "title": "Matrix build", "theme": theme, "components": components,
        "labs": True, "output": "out.html"}), encoding="utf-8")
```

The seven sample workdirs also mount `break-even-lab`; add `"labs": true` to each
(do this now so the end-to-end test stays green):

```powershell
python -c "import json,pathlib
for p in pathlib.Path('v2/sample').glob('*/build.json'):
    d=json.loads(p.read_text(encoding='utf-8-sig')); d['labs']=True
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')"
```

- [ ] **Step 6: Run the tests**

Run: `python -m pytest tests/test_build_labs.py tests/test_components_matrix.py tests/test_themes_matrix.py tests/test_e2e_lesson.py -q`
Expected: PASS.

- [ ] **Step 7: Commit (only with explicit approval)**

```bash
git add v2/build.py tests/test_build_labs.py tests/test_components_matrix.py v2/sample
git commit -m "feat(build): labs off by default; opt in with labs:true"
```

---

### Task 4: Dedupe references by work signature

**Files:**
- Modify: `v2/build.py` (`merge_refs`, ~544-564)
- Test: `tests/test_references.py`

**Interfaces:**
- Consumes: `ref_signature(text)` (already defined at `v2/build.py:512`).
- Produces: `merge_refs` collapses identical works and errors when the same author+year carries different text.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_references.py`:

```python
def test_duplicate_work_under_two_keys_is_rejected(tmp_path):
    from test_build import make_workdir
    skel = _mini_skel(tmp_path)
    files = {
        "sections.html": ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
                          '<p data-present="1">Cost (Reyes, 2020).</p>'
                          '<div data-component="demo" data-key="gl"></div></section>'),
    }
    wd = make_workdir(tmp_path, files=files)
    (wd / "outline.json").write_text(json.dumps(_outline()), encoding="utf-8")
    (wd / "parts").mkdir()
    (wd / "parts" / "01-a.refs.json").write_text(json.dumps(
        {"refs": [{"key": "a", "text": "Reyes, A. (2020). Cost. P."}]}),
        encoding="utf-8")
    (wd / "parts" / "02-b.refs.json").write_text(json.dumps(
        {"refs": [{"key": "b", "text": "Reyes, A. (2020). Costing. Q."}]}),
        encoding="utf-8")
    _, errs, _ = build.assemble(wd, skel)
    assert any("duplicate work" in e.msg for e in errs)


def test_duplicate_work_identical_text_collapses(tmp_path):
    from test_build import make_workdir
    skel = _mini_skel(tmp_path)
    files = {
        "sections.html": ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
                          '<p data-present="1">Cost (Reyes, 2020).</p>'
                          '<div data-component="demo" data-key="gl"></div></section>'),
    }
    wd = make_workdir(tmp_path, files=files)
    (wd / "outline.json").write_text(json.dumps(_outline()), encoding="utf-8")
    (wd / "parts").mkdir()
    text = "Reyes, A. (2020). Cost. P."
    (wd / "parts" / "01-a.refs.json").write_text(json.dumps(
        {"refs": [{"key": "a", "text": text}]}), encoding="utf-8")
    (wd / "parts" / "02-b.refs.json").write_text(json.dumps(
        {"refs": [{"key": "b", "text": text}]}), encoding="utf-8")
    out, errs, _ = build.assemble(wd, skel)
    assert errs == [], [str(e) for e in errs]
    assert out.count(text) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_references.py -q`
Expected: FAIL — the duplicate work is either accepted twice (`test_duplicate_work_identical_text_collapses` sees 2) or no error is raised (`test_duplicate_work_under_two_keys_is_rejected`).

- [ ] **Step 3: Replace `merge_refs`**

Replace the body of `merge_refs` in `v2/build.py` with:

```python
def merge_refs(workdir, errors):
    files = []
    root = workdir / "refs.json"
    if root.exists():
        files.append(root)
    pdir = workdir / "parts"
    if pdir.is_dir():
        files.extend(sorted(pdir.glob("*.refs.json")))
    refs, by_key, by_sig = [], {}, {}
    for f in files:
        for r in load_ref_file(f, errors):
            if r["key"] in by_key:
                if by_key[r["key"]]["text"] != r["text"]:
                    errors.append(Err("references", f.name, None,
                                      "duplicate ref key %r with different text"
                                      % r["key"], "give each work a unique key"))
                continue
            sig = ref_signature(r["text"])
            if sig in by_sig:
                if by_sig[sig]["text"] != r["text"]:
                    errors.append(Err(
                        "references", f.name, None,
                        "duplicate work %r (same author/year) with different text"
                        % r["key"],
                        "keep one entry under a shared key and cite it"))
                by_key.setdefault(r["key"], r)
                continue
            by_key[r["key"]] = r
            by_sig[sig] = r
            refs.append(r)
    refs.sort(key=lambda r: ref_signature(r["text"]))
    return refs
```

- [ ] **Step 4: Run the reference tests**

Run: `python -m pytest tests/test_references.py -q`
Expected: PASS.

- [ ] **Step 5: Commit (only with explicit approval)**

```bash
git add v2/build.py tests/test_references.py
git commit -m "feat(refs): dedupe by work signature, not key alone"
```

---

### Task 5: Wire the lint into `build.py`

**Files:**
- Modify: `v2/build.py` (imports; call after `check_provenance`, ~2067)
- Test: `tests/test_build.py`

**Interfaces:**
- Consumes: `prose_lint.lint_text`, `prose_lint.glossary_terms` from Task 2.
- Produces: build errors with `rule` equal to the lint rule; writes `<workdir>/prose-review.json` for the orchestrator.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_build.py`:

```python
def test_build_rejects_over_budget_paragraph(tmp_path):
    long = " ".join(["word"] * 45)
    html = ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
            '<p data-present="1">%s</p>'
            '<div data-component="demo" data-key="gl"></div></section>' % long)
    out, errs, _ = run(tmp_path, files={"sections.html": html})
    assert any(e.rule == "dense_over_budget" for e in errs)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_build.py::test_build_rejects_over_budget_paragraph -q`
Expected: FAIL — the build passes the long paragraph.

- [ ] **Step 3: Add the import**

At the top of `v2/build.py`, after `from pathlib import Path`, add:

```python
_TOOLS_DIR = Path(__file__).resolve().parent / "tools"
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))

import prose_lint  # noqa: E402
```

- [ ] **Step 4: Run the lint at assembly**

After `check_provenance(parts["sections"], parts["data"], errors)`, insert:

```python
    prose_report = prose_lint.lint_text(
        parts["sections"],
        glossary=prose_lint.glossary_terms(parts["data"]))
    (workdir / "prose-review.json").write_text(
        json.dumps(prose_report, ensure_ascii=False, indent=2),
        encoding="utf-8")
    for finding in prose_report["fails"]:
        errors.append(Err(
            finding["rule"], "sections.html", None,
            "%s ¶%d: %s" % (finding["section"], finding["paragraph"],
                            finding["detail"]),
            finding["fix"]))
```

- [ ] **Step 5: Run the test and the surrounding suite**

Run: `python -m pytest tests/test_build.py -q`
Expected: PASS.

- [ ] **Step 6: Bring `sample/lesson-demo` up to the new floor**

The sample predates the lint. Check it:

```powershell
python v2/tools/prose_lint.py v2/sample/lesson-demo/sections.html --glossary v2/sample/lesson-demo/data.js
```

Expected findings (measured on v2.31): one `dense_over_budget` paragraph
(`gate` ¶1, 41 words) and five `unformatted_term` findings (`CM ratio`,
`break-even point (BEP)`, `margin of safety`, `sensitivity`, `feasibility gate`).
Split the 41-word paragraph at its sentence boundary and wrap each listed term
in `<strong>` at its first use in its section. Re-run the command until it exits
0.

- [ ] **Step 7: Run the full suite**

Run: `python -m pytest tests -q`
Expected: PASS (including `test_e2e_lesson.py`).

- [ ] **Step 8: Commit (only with explicit approval)**

```bash
git add v2/build.py tests/test_build.py v2/sample/lesson-demo
git commit -m "feat(build): enforce deterministic prose lint at assembly"
```

---

### Task 6: Rewrite the skill orchestration

**Files:**
- Modify: `v2/SKILL.md` (frontmatter/title; manifest; Part 2 table; Part 4 C/C2/D2; Part 5 clarity; tools list; final checklist)
- Test: `tests/test_skill_prose_budget.py`, new `tests/test_skill_lean_pipeline.py`

**Interfaces:**
- Produces: skill text that dispatches one merged reviewer only for shortlisted/arithmetic sections, runs the DAG track in parallel, and removes the final LLM sweep.

- [ ] **Step 1: Write the failing tests**

Replace `tests/test_skill_prose_budget.py::test_final_sweep_drops_dense_lens` and `::test_checker_pipeline_final_sweep_is_unclear_only` with:

```python
def test_pipeline_documents_mechanical_prose_gate():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "prose_lint.py" in text
    assert "no LLM clarity sweep" in text
```

Create `tests/test_skill_lean_pipeline.py`:

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / "v2" / "SKILL.md"


def test_version_is_232():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "version: 2.32" in text
    assert "v2.32" in text


def test_labs_are_opt_in_in_the_brief():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert '"labs": true' in text
    assert "OFF by default" in text


def test_dag_track_is_parallel_and_section7_does_not_own_nodes():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "parallel" in text
    assert "does **not** write `data.js`" in text


def test_review_loop_is_capped():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "Max 2 retries" in text


def test_shared_refs_pool_is_documented():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "refs.json" in text
    assert "ref_signature" in text
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_skill_prose_budget.py tests/test_skill_lean_pipeline.py -q`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Update the version and manifest**

In `v2/SKILL.md`:

```yaml
version: 2.32
```

```markdown
# Interactive Lesson Notebook (v2.32 — lean orchestration)
```

Insert after the v2.31 paragraph (before `## When to use`):

```markdown
What v2.32 adds: **lean orchestration.** Labs are opt-in (`"labs": true`); the
default build uses practice sets and activities. A deterministic
`tools/prose_lint.py` owns the Dense budget, the bold key term, and the
`Where:` gloss; `build.py` fails on those. One merged reviewer per qualifying
section replaces the separate clarity and numeric reviewers, and it runs only
when the lint emits a review shortlist or the section carries math. The final
LLM clarity sweep is gone. A shared `refs.json` pool is built once and merged by
`ref_signature`. The DAG track runs in parallel with the content authors, and
Section 7 no longer authors `nodes[]` twice.
```

- [ ] **Step 4: Update the Part 2 table and centrepiece line**

Replace the Section 3 and 5 rows:

```markdown
| 3 | The Practice / Worked Method | formula + `Where:` list, method (§2.4) | `step-solver` practice set + one activity (labs opt-in) |
```

```markdown
| 5 | Sensitivity | operating leverage, what-if | prose + activity (or an opt-in lab) |
```

Replace the centrepiece line:

```markdown
**Section 3 is the centrepiece.** Give it the most space and the best practice
set (or an opt-in `"labs": true` calculator).
```

- [ ] **Step 5: Update the author brief**

Replace the `Clarity:` line in the brief with:

```markdown
Clarity: write for an average student; the prose budget is mechanically checked
(paragraph > 40 words or sentence > 30 words fails the build). A shortlist
reviewer reads only flagged paragraphs.
Labs: OFF by default. Do not mount any `*-lab` component unless build.json has
"labs": true. Use a practice set (`step-solver`) or an activity.
```

- [ ] **Step 6: Replace C2**

Replace the C2 block (the paragraph beginning `**C2. Per-section clarity review` through `... Only then run D.`) with:

```markdown
**C2. Shortlist review (one merged reviewer per qualifying section).** Run the
deterministic lint first:

```
python tools/prose_lint.py build/<slug>/parts/NN-<id>.sections.html --json
```

Dispatch a reviewer only when the report has a non-empty `review` list or
`sections.<id>.has_math` is true. That one independent agent (never the author)
sees only the flagged paragraphs with their context, the section's MathML /
worked-example blocks, and the `average-student-checker` contract inlined in the
brief. It returns clarity findings, numeric findings (recompute every worked
example), and a verdict. A finding goes back to the same author; re-lint; review
again only if the shortlist is still non-empty or numerics remain. **Max 2 retries**, then ask the user.
```

- [ ] **Step 7: Replace D2**

Replace the D2 block (from `**D2. DAG assignment fan-out` through step 4) with:

```markdown
**D2. DAG assignment track (parallel; skip for flat/graph).** Start once the
outline and MILO blueprint exist, concurrently with the content authors. The
Section 7 author writes only the mount and intro
(`parts/<NN>-assignment.sections.html` + `parts/<NN>-assignment.refs.json`); it
does **not** write `data.js` and does **not** author `nodes[]`. This track owns
`parts/<NN>-assignment.data.js`.

1. If `build.json` omits the `dag` block, Section 7 defaults to the maxed-out
   budget (`levels: 5, max_nodes: 16`).
2. Blueprint: map MILOs → layers; draft the gold path; reserve ids for later
   layers; track remaining `max_nodes`.
3. For `level = 0 .. levels-1` (serial — later levels need earlier ids):
   - **Author agent**: lesson slice + gold-path state + reserved ids + remaining
     budget + `dag-craft.md` → strict JSON nodes at this level only.
   - **Reviewer agent** (separate; sees only this level's diff + `dag-craft.md`
     + lesson slice): checklist → `pass` or `fail` + rewrite list. `fail` → the
     same author rewrites (**max 2 retries**, then ask the user).
4. Write the stitched `nodes[]` into the section's `data.js`, then run D.
```

- [ ] **Step 8: Replace the Part 5 clarity bullet**

Replace the bullet beginning `- **Clarity (the average-student-checker skill)` through the "Per-section review (v2.18)" bullet with:

```markdown
- **Clarity.** The per-section lint and shortlist review already cleared every
  content section, and `build.py` enforces the mechanical floor (budget, bold
  key term, `Where:` gloss) at assembly. There is no LLM clarity sweep over the
  assembled file. Run the standalone `average-student-checker` (both lenses)
  only when asked to review an existing lesson.
```

- [ ] **Step 9: Update the tools list and final checklist**

In the tools paragraph, add `prose_lint.py`:

```markdown
`prose_lint.py` (deterministic prose gate — `python tools/prose_lint.py
<built.html> --json`), and `activity_numbers.py` ...
```

Replace the final clarity sentence with:

```markdown
and the **clarity gate** is green (`python tools/prose_lint.py <built.html>`
exits 0; every content section either had an empty shortlist or passed its
shortlist reviewer).
```

- [ ] **Step 10: Run the doc tests**

Run: `python -m pytest tests/test_skill_prose_budget.py tests/test_skill_lean_pipeline.py -q`
Expected: PASS.

- [ ] **Step 11: Commit (only with explicit approval)**

```bash
git add v2/SKILL.md tests/test_skill_prose_budget.py tests/test_skill_lean_pipeline.py
git commit -m "docs(skill): v2.32 lean orchestration and shortlist review"
```

---

### Task 7: Update the checker skill’s pipeline role

**Files:**
- Modify: `average-student-checker/SKILL.md` (`## Where it runs`, pipeline paragraph; `## Stay in your lane`, in-pipeline exception)
- Test: `tests/test_skill_prose_budget.py`

**Interfaces:**
- Produces: the checker documents shortlist mode, the mechanical Dense gate, and the single in-pipeline numeric exception.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_skill_prose_budget.py` (and re-add the `CHECKER` constant if a prior task removed it: `CHECKER = ROOT / "average-student-checker" / "SKILL.md"`):

```python
def test_checker_pipeline_documents_shortlist_mode():
    text = CHECKER.read_text(encoding="utf-8")
    assert "shortlist" in text
    assert "one merged reviewer" in text


def test_checker_names_the_in_pipeline_numeric_exception():
    text = CHECKER.read_text(encoding="utf-8")
    region = text[text.index("## Stay in your lane") :]
    assert "in-pipeline" in region
    assert "numeric" in region
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_skill_prose_budget.py -q`
Expected: FAIL on the new tests.

- [ ] **Step 3a: Add the in-pipeline exception to "Stay in your lane"**

In `average-student-checker/SKILL.md`, after the "Phrases that mean you have drifted out of lane" paragraph, add:

```markdown
**In the lesson-notebook pipeline only**, the merged shortlist reviewer also
checks numeric freshness and arithmetic for the section's prose worked examples.
That is the single in-pipeline exception to the lane above. A standalone run
stays two lenses + formatting.
```

Do not change standalone behavior: a standalone run stays two lenses + formatting.

- [ ] **Step 3b: Replace the pipeline paragraph**

In `average-student-checker/SKILL.md`, replace the paragraph beginning `**In the lesson-notebook pipeline**` with:

```markdown
**In the lesson-notebook pipeline** — v2.32 runs it as a **shortlist reviewer**:
in the pipeline, `prose_lint.py` owns the Dense budget, the bold key term, and the
`Where:` gloss mechanically, so this skill is dispatched only for paragraphs the
lint flags plus sections that carry math. The standalone skill still runs its two
lenses and the formatting check. This is one merged reviewer per qualifying
section, reporting clarity and numeric findings (numeric is the single in-pipeline
exception, see **Stay in your lane**) before assembly. There is no final LLM
clarity sweep over the assembled file; `build.py` runs the mechanical gate
instead.
```

- [ ] **Step 4: Run the checker doc test**

Run: `python -m pytest tests/test_skill_prose_budget.py -q`
Expected: PASS.

- [ ] **Step 5: Commit (only with explicit approval)**

```bash
git add average-student-checker/SKILL.md tests/test_skill_prose_budget.py
git commit -m "docs(checker): pipeline role is shortlist review"
```

---

### Task 8: Registry, samples, and README

**Files:**
- Modify: `v2/skeleton/components/registry.md` (top note)
- Modify: `README.md` (components list note; authoring step)
- Test: `tests/test_skill_lean_pipeline.py`

**Interfaces:**
- Produces: documentation and fixtures consistent with `labs` default false.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_skill_lean_pipeline.py`:

```python
def test_registry_marks_labs_opt_in():
    text = (ROOT / "v2" / "skeleton" / "components" / "registry.md").read_text(
        encoding="utf-8")
    assert "Labs are opt-in" in text
    assert '"labs": true' in text


def test_every_sample_opts_into_labs():
    import json
    for p in sorted((ROOT / "v2" / "sample").glob("*/build.json")):
        cfg = json.loads(p.read_text(encoding="utf-8"))
        assert cfg.get("labs") is True, p
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_skill_lean_pipeline.py -q`
Expected: FAIL on `test_registry_marks_labs_opt_in` (no note). The sample test
already passes from Task 3 — keep it as a regression guard.

- [ ] **Step 3: Mark labs opt-in in the registry**

Insert after the title block in `v2/skeleton/components/registry.md`:

```markdown
> **Labs are opt-in (v2.32).** A `*-lab` component mounts only when `build.json`
> sets `"labs": true`. The default build uses the activity set: `step-solver`,
> `mcq`, `true-false`, `sort-statement`, `case-match`, `comparison-table`,
> `ranked-statements`, `flipcards`, `glossary`, `milo-list`.
```

- [ ] **Step 4: Update the README**

Under “Authoring a lesson build”, add:

```markdown
0. Labs are opt-in: the default build uses practice sets and activities. Add
   `"labs": true` to `build.json` before mounting any `*-lab` component.
```

In the component-list paragraph (line ~94), add “lab components are opt-in (v2.32)”.

- [ ] **Step 5: Run the doc tests**

Run: `python -m pytest tests/test_skill_lean_pipeline.py -q`
Expected: PASS.

- [ ] **Step 6: Commit (only with explicit approval)**

```bash
git add v2/skeleton/components/registry.md tests/test_skill_lean_pipeline.py README.md
git commit -m "docs(samples): labs opt-in default; registry and README"
```

---

### Task 9: End-to-end verification

**Files:**
- Verify only; no production edits unless a check fails.

- [ ] **Step 1: Full test suite**

Run: `python -m pytest tests -q`
Expected: PASS (all tests, including the new ones).

- [ ] **Step 2: Build the sample**

Run: `python v2/build.py v2/sample/lesson-demo`
Expected: `OK - wrote Week4-Demo-Notebook.html (...)`.

- [ ] **Step 3: Run the prose lint on the built file**

Run: `python v2/tools/prose_lint.py Week4-Demo-Notebook.html`
Expected: exit 0 (the sample predates the rule; if it reports `dense_over_budget`, record it as a known sample mismatch and do not edit the sample).

- [ ] **Step 4: Smoke gates**

Run:

```powershell
node v2/tools/layout_smoke.js Week4-Demo-Notebook.html
node v2/tools/layout_smoke.js Week4-Demo-Notebook.html --width 390
node v2/tools/assignment_smoke.js
```

Expected: `LAYOUT OK` twice and `SMOKE OK`.

- [ ] **Step 5: Verify the no-labs path**

Create a temporary copy of `v2/sample/demo-app`, remove `"labs": true` and `break-even-lab` from `build.json` and the lab mount/data lines, then run `python v2/build.py <copy>`. Expected: `OK`, and the output contains no `LN.components["break-even-lab"]`.

- [ ] **Step 6: Verify the dispatch plan text**

Run: `Select-String -Path v2\SKILL.md -Pattern 'Max 2 retries|one merged reviewer|no LLM clarity sweep|concurrently with the content authors'`
Expected: every pattern appears.

- [ ] **Step 7: Record the win**

Count agent dispatches in the new Part 4 (authors = content sections; DAG = 2 per level; reviewers = qualifying sections only). Compare with ~38 in v2.31 and record both numbers in the PR/commit note.

- [ ] **Step 8: Commit (only with explicit approval)**

```bash
git add -A
git commit -m "test(v2.32): end-to-end verification of lean pipeline"
```

---

## Self-Review

**Spec coverage**

- Labs off by default → Task 3 (gate), Task 8 (samples/registry/README).
- `prose_lint.py` rules → Task 2; build integration → Task 5.
- One merged reviewer + shortlist dispatch → Task 6 (C2).
- Final sweep removed → Task 6 (Part 5 + checklist).
- Dispatch order / parallel DAG → Task 6 (D2).
- Shared refs pool + signature dedupe → Task 4 (signature), Task 6 (pool text).
- Section 7 duplication → Task 6 (D2).
- Prompt slimming → Task 6 (brief: labs + shortlist; registry rows selected in Wave 0).
- Tests → Tasks 1–8; end-to-end → Task 9.

**Placeholder scan:** no TBD/TODO; every code step carries code.

**Type consistency:** `lint_text(text, glossary=None, max_words=40, max_sentence_words=30)` is used identically in Tasks 2 and 5; `glossary_terms` is re-exported in Task 2 and called in Task 5; `finding` keys (`rule`, `section`, `paragraph`, `detail`, `fix`) match between Tasks 2 and 5.
