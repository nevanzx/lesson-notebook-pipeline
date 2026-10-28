#!/usr/bin/env python3
"""Deterministic prose lint for lesson parts and built notebooks.

Two severities:
  fail   - objective, countable, blocks the build
  review - needs judgement; feeds the section reviewer shortlist
"""
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
    if unit.get("box") not in DEF_BOXES:
        return False
    raw = (unit.get("raw") or "").lower()
    return "<math" in raw or "where:" in unit["text"].lower()


def _term_re(term):
    return re.compile(r"(?<!\w)%s(?!\w)" % re.escape(term), re.I)


def _unit_spans(body):
    """(offset, raw) for every paragraph unit split_sections would emit, in order."""
    items = []
    for pm in paragraphs.P_RE.finditer(body):
        if not paragraphs.clean(pm.group(1)):
            continue
        items.append((pm.start(), pm.group(1)))
    for bm in paragraphs.BOX_RE.finditer(body):
        end = paragraphs.div_end(body, bm.start())
        fragment = paragraphs.loose_fragment(body[bm.start():end])
        if len(paragraphs.clean(fragment).split()) < paragraphs.MIN_LOOSE_WORDS:
            continue
        items.append((bm.start(), fragment))
    items.sort(key=lambda item: item[0])
    return items


def _box_blocks(body):
    """Every def/mini/note/card box with its span and cleaned text."""
    boxes = []
    for bm in paragraphs.BOX_RE.finditer(body):
        start = bm.start()
        end = paragraphs.div_end(body, start)
        inner = body[start:end]
        boxes.append({
            "box": bm.group(1),
            "start": start,
            "end": end,
            "raw": inner,
            "text": paragraphs.clean(inner),
        })
    return boxes


def _anchor_unit(paras, spans, box):
    """The first paragraph unit inside this box, in the box when it has none."""
    for i, (offset, _raw) in enumerate(spans):
        if box["start"] <= offset < box["end"] and i < len(paras):
            return paras[i]
    words = box["text"].split()
    return {
        "index": 1,
        "head": " ".join(words[:8]),
        "tail": " ".join(words[-8:]),
    }


def _context(paras, unit):
    i = unit["index"] - 1
    before = paras[i - 1]["head"] if i - 1 >= 0 else ""
    after = paras[i + 1]["head"] if i + 1 < len(paras) else ""
    return {"before": before, "after": after}


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
                if _is_formula_gloss(unit):
                    continue
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
                            "first use of glossary term %r in this section "
                            "is not bold" % term,
                            "wrap the term in <strong>"))

        spans = _unit_spans(body)
        for box in _box_blocks(body):
            if box["box"] not in DEF_BOXES:
                continue
            if "<math" not in box["raw"].lower():
                continue
            if "where:" in box["text"].lower():
                continue
            unit = _anchor_unit(paras, spans, box)
            fails.append(_finding(
                "symbol_no_gloss", "fail", sid, unit,
                "MathML box has no Where: symbol gloss",
                "add a Where: list, one symbol per line"))

        flagged_terms = set()
        for unit in paras:
            low = unit["text"].lower()
            context = _context(paras, unit)
            if DEMONSTRATIVES.search(unit["text"]):
                review.append(_finding(
                    "vague_referent", "review", sid, unit,
                    "demonstrative opener: %r" % unit["head"][:40],
                    "name the noun this refers to", context))
            if (not _is_formula_gloss(unit) and unit["words"] <= max_words
                    and (unit["text"].count(",") >= 3
                         or SEQUENCE_RE.search(low))):
                review.append(_finding(
                    "dense_signals", "review", sid, unit,
                    "enumerates or sequences inside one paragraph",
                    "render the list/sequence as a visual", context))
            for term in glossary:
                t = term.lower()
                if t in flagged_terms or not _term_re(t).search(low):
                    continue
                flagged_terms.add(t)
                def_idx = [
                    d["index"] for d in paras
                    if d.get("box") in DEF_BOXES
                    and _term_re(t).search(
                        d.get("tag", "") + " " + d["text"])
                ]
                if def_idx and unit["index"] < min(def_idx):
                    review.append(_finding(
                        "term_before_definition", "review", sid, unit,
                        "term %r is used before its definition" % term,
                        "introduce or define the term first", context))

    return {"fails": fails, "review": review, "sections": meta}


def _print_report(report):
    for f in report["fails"]:
        print("FAIL   %-24s %s \u00b6%d  %s"
              % (f["rule"], f["section"], f["paragraph"], f["detail"]))
        print("       %s \u2026 %s" % (f["head"], f["tail"]))
        print("       -> %s" % f["fix"])
    for f in report["review"]:
        print("REVIEW %-24s %s \u00b6%d  %s"
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
