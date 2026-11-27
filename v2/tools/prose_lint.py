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

_TOOLS_DIR = Path(__file__).resolve().parent
if str(_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_TOOLS_DIR))

import paragraphs  # noqa: E402

EXEMPT_SECTIONS = {"assignment", "assign", "references"}
TERM_EXEMPT_SECTIONS = {"glossary"}
DEF_BOXES = {"def", "mini"}
MATH_DENSE_BOXES = {"def", "mini", "card"}
DEMONSTRATIVES = re.compile(
    r"(?:^|[.!?]\s+)(?:This|These|That|Those|It|The above)\b")
SEQUENCE_RE = re.compile(r"\b(?:first|then|next|finally|afterwards)\b", re.I)
LI_RE = re.compile(r"<li\b[^>]*>(.*?)</li>", re.S | re.I)
GLOSS_DEF_RE = re.compile(
    r'\{\s*t:\s*"([^"]*)"\s*,\s*d:\s*"([^"]*)"\s*\}', re.S)

# v2.54 plain-language rule (SKILL.md §2.1h). High-confidence scaffolding and
# hidden-actor phrases fail the build; passive voice, nominalizations, abstract
# subjects, long sentences, and a high grade level feed the C2 Plain lens.
PLAIN_RULES = [
    ("plain_process_phrase", "fail",
     r"\bthe (?:process|way|fact|extent|degree) (?:by|in|through|to) which\b"
     r"|\bthe fact that\b",
     "scaffolding phrase hides the plain verb",
     "say 'how' or use the verb directly"),
    ("plain_hidden_actor", "fail",
     r"\b(?:is|are|was|were|be|been|being)\s+"
     r"(?:treated|seen|described|defined|considered|expected|required|used|"
     r"studied|made|given|taken)\s+as\b",
     "passive hides who does the action",
     "name the actor and use an active verb"),
    ("plain_passive", "review",
     r"\b(?:is|are|was|were|be|been|being)\s+"
     r"(?:\w+ed|made|done|given|taken|shown|held|found|built|kept|left|set|"
     r"put|read)\b",
     "passive or state verb hides the actor",
     "name the actor and use an active verb"),
    ("plain_nominalization", "review",
     r"\b(?:interpretation|evaluation|judgment|assessment|analysis|observation|"
     r"recognition|consideration|development|implementation|application|"
     r"identification|classification|comparison|description|explanation|"
     r"definition)\s+(?:of|about)\b",
     "abstract noun where the verb works",
     "use the verb: 'how a person reads a setback'"),
    ("plain_abstract_subject", "review",
     r"\bthe (?:frame|evaluation|attitude|mindset|behavior|claim|evidence|"
     r"information|process|judgment|practice|orientation)\s+"
     r"(?:decides|carries|answers|shapes|selects|records|makes|becomes|"
     r"arrives|works|tells|says|shows|gives|protects|hides|refuses)\b",
     "abstract subject acts like a person",
     "name the person who does the action"),
]
WHERE_RE = re.compile(r"\bwhere\s*:", re.I)
BLOCK_MATH_RE = re.compile(
    r"<math\b[^>]*\bdisplay\s*=\s*[\"']block[\"']", re.I)

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
    return "<math" in raw or bool(WHERE_RE.search(unit["text"]))


def _is_block_math(unit):
    raw = unit.get("raw") or ""
    return "<math" in raw.lower() and bool(BLOCK_MATH_RE.search(raw))


def _dense_exempt(unit, previous=None):
    raw = (unit.get("raw") or "").lower()
    if _is_block_math(unit):
        return True
    if unit.get("box") in MATH_DENSE_BOXES:
        if "<math" in raw or WHERE_RE.search(unit["text"]):
            return True
    if (previous is not None and _is_block_math(previous)
            and WHERE_RE.search(unit["text"])):
        return True
    return False


def _term_re(term):
    return re.compile(r"(?<!\w)%s(?!\w)" % re.escape(term), re.I)


def _next_unit(paras, unit):
    i = unit["index"]
    return paras[i] if i < len(paras) else None


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


def _syllables(word):
    word = re.sub(r"[^a-z]", "", word.lower())
    if not word:
        return 0
    vowels = "aeiouy"
    count = 0
    previous_was_vowel = False
    for ch in word:
        is_vowel = ch in vowels
        if is_vowel and not previous_was_vowel:
            count += 1
        previous_was_vowel = is_vowel
    if word.endswith("e") and not word.endswith(("le", "ee")) and count > 1:
        count -= 1
    return max(1, count)


def _fk_grade(text):
    """Flesch-Kincaid grade level for one paragraph unit."""
    sentences = [s for s in paragraphs.split_sentences(text) if s.strip()]
    words = re.findall(r"[A-Za-z]+", text)
    if not sentences or not words:
        return 0.0
    syllables = sum(_syllables(word) for word in words)
    return (0.39 * (len(words) / len(sentences))
            + 11.8 * (syllables / len(words)) - 15.59)


def _plain_findings(sid, unit, text, max_sentence_words, context=None):
    """Plain-language findings for one paragraph or bullet unit."""
    fails, review = [], []
    for rule, severity, pattern, detail, fix in PLAIN_RULES:
        if not re.search(pattern, text, re.I):
            continue
        target = fails if severity == "fail" else review
        target.append(_finding(rule, severity, sid, unit, detail, fix, context))
    long_plain = [
        len(s.split())
        for s in paragraphs.split_sentences(text)
        if 25 < len(s.split()) <= max_sentence_words
    ]
    if long_plain:
        review.append(_finding(
            "plain_long_sentence", "review", sid, unit,
            "sentence is %d words" % max(long_plain),
            "split it or render the structure as a visual", context))
    grade = _fk_grade(text)
    if grade > 12:
        review.append(_finding(
            "plain_grade", "review", sid, unit,
            "Flesch-Kincaid grade %.1f" % grade,
            "use shorter sentences and plain verbs", context))
    return fails, review


def lint_glossary_text(text):
    """Plain-language findings for `{ t: term, d: definition }` entries.

    The glossary is rendered from data.js, so the section lint never sees it.
    This keeps the same high-confidence gate on the definitions a student reads.
    """
    fails, review = [], []
    count = 0
    for count, match in enumerate(GLOSS_DEF_RE.finditer(text), 1):
        term = match.group(1).strip()
        definition = match.group(2).strip()
        unit = {
            "index": count,
            "head": term,
            "tail": " ".join(definition.split()[-8:]),
            "text": definition,
            "raw": definition,
            "words": len(definition.split()),
            "box": "glossary",
        }
        pf, pr = _plain_findings("glossary", unit, definition, 45, None)
        fails.extend(pf)
        review.extend(pr)
    return {
        "fails": fails,
        "review": review,
        "sections": {"glossary": {"paragraphs": count}},
    }


def lint_text(text, glossary=None, max_words=120, max_sentence_words=45):
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

        for i, unit in enumerate(paras):
            previous = paras[i - 1] if i else None
            if _dense_exempt(unit, previous):
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

        # v2.54 plain language: high-confidence phrase patterns fail, the
        # judgement calls go to the C2 Plain lens through the review list.
        for unit in paras:
            raw = (unit.get("raw") or "").lower()
            if _is_formula_gloss(unit) or "<math" in raw:
                continue
            pf, pr = _plain_findings(
                sid, unit, unit["text"], max_sentence_words,
                _context(paras, unit))
            fails.extend(pf)
            review.extend(pr)

        # The prose budget exempts bullets, but the plain-language rule does
        # not: a hidden actor or a nominalization in an explain bullet is just
        # as hard to read as one in a paragraph.
        for i, lm in enumerate(LI_RE.finditer(body), 1):
            text = paragraphs.clean(lm.group(1))
            if not text:
                continue
            unit = {
                "index": len(paras) + i,
                "head": " ".join(text.split()[:8]),
                "tail": " ".join(text.split()[-8:]),
                "text": text,
                "raw": lm.group(1),
                "words": len(text.split()),
                "box": "li",
            }
            pf, pr = _plain_findings(
                sid, unit, text, max_sentence_words, None)
            fails.extend(pf)
            review.extend(pr)

        term_checks = sid not in TERM_EXEMPT_SECTIONS
        if glossary and term_checks:
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
                    if not _term_re(t).search(bold):
                        fails.append(_finding(
                            "unformatted_term", "fail", sid, unit,
                            "first use of glossary term %r in this section "
                            "is not bold" % term,
                            "wrap the term in <strong>"))

        spans = _unit_spans(body)
        boxes = _box_blocks(body)
        for i, unit in enumerate(paras):
            raw = (unit.get("raw") or "").lower()
            block_math = _is_block_math(unit)
            in_scope = block_math or (
                unit.get("box") in MATH_DENSE_BOXES and "<math" in raw)
            if not in_scope:
                continue
            offset = spans[i][0] if i < len(spans) else None
            enclosing = next(
                (box for box in boxes
                 if offset is not None
                 and box["start"] <= offset < box["end"]), None)
            gloss = bool(WHERE_RE.search(unit["text"]))
            if (enclosing and enclosing["box"] in MATH_DENSE_BOXES
                    and WHERE_RE.search(enclosing["text"])):
                gloss = True
            if block_math and enclosing is None and not gloss:
                nxt = _next_unit(paras, unit)
                gloss = bool(nxt and WHERE_RE.search(nxt["text"]))
            if gloss:
                continue
            fails.append(_finding(
                "symbol_no_gloss", "fail", sid, unit,
                "MathML unit has no Where: symbol gloss",
                "add a Where: list, one symbol per line"))

        for box in boxes:
            if "<math" not in box["raw"].lower():
                continue
            if (box["box"] not in MATH_DENSE_BOXES
                    and not BLOCK_MATH_RE.search(box["raw"])):
                continue
            if WHERE_RE.search(box["text"]):
                continue
            represented = any(
                box["start"] <= offset < box["end"]
                and "<math" in raw.lower() for offset, raw in spans)
            if represented:
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
            seq_marks = SEQUENCE_RE.findall(low)
            if (not _is_formula_gloss(unit) and unit["words"] <= max_words
                    and (len(seq_marks) >= 2
                         or (unit["text"].count(",") >= 3
                             and unit["words"] > 20))):
                review.append(_finding(
                    "dense_signals", "review", sid, unit,
                    "enumerates or sequences inside one paragraph",
                    "render the list/sequence as a visual", context))
            if term_checks:
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
    ap.add_argument("--max-words", type=int, default=120)
    ap.add_argument("--max-sentence-words", type=int, default=45)
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
