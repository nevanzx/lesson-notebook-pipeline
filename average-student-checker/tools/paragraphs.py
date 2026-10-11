#!/usr/bin/env python3
"""Extract the teaching prose of a built lesson notebook, paragraph by paragraph.

The unit of review for the average-student checker is ONE PARAGRAPH. A built
notebook collapses each section onto a single long HTML line, so source line
numbers are useless as anchors. This tool emits, for every teaching paragraph:
the section id, the section heading, the paragraph ordinal inside the section,
the box it sits in (a .def / .mini / .note / .card, with its .tag label), the
word count, the paragraph text, and its **bold** and *italic* spans (so the
checker can see which key terms are already marked). The ordinal + the
first/last words are a stable span the checker can quote back.

It also emits the notebook's **glossary terms** (from every
`LN.data.<key> = { groups: [...] }` object), so the checker can tell a key term
from ordinary prose.

Usage:
    python tools/paragraphs.py <built.html>
    python tools/paragraphs.py <built.html> --section abc
    python tools/paragraphs.py <built.html> --min-words 60
    python tools/paragraphs.py <built.html> --max-words 40
    python tools/paragraphs.py <built.html> --max-sentence-words 30
    python tools/paragraphs.py <built.html> --json

--min-words hides paragraphs shorter than N; --max-words shows ONLY paragraphs
longer than N, an over-budget lint for the prose budget (v2/SKILL.md §2.1e).
--max-sentence-words flags every sentence longer than N and pairs it with the visual
that would carry its structure — the visual replaces the words, so the fix is a picture,
not just a split.

Only <section class="block" id="..."> blocks are read. <p> elements are the
paragraphs; headings, component mounts, and lists are not.

JSON output is an object: {"glossary": [...terms...], "sections": [...]}.

The **assignment** and **references** sections are NOT teaching prose and are
omitted by default — pass --include-exempt to list them anyway.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

SECTION_RE = re.compile(
    r'<section\s+class="block"[^>]*\bid="([^"]+)"[^>]*>(.*?)</section>',
    re.S,
)
H2_RE = re.compile(r"<h2\b[^>]*>(.*?)</h2>", re.S)
P_RE = re.compile(r"<p\b[^>]*>(.*?)</p>", re.S)
BOX_RE = re.compile(r'<div\s+class="(def|mini|note|card)\b[^"]*"')
TAG_RE = re.compile(r'<span\s+class="tag"[^>]*>(.*?)</span>', re.S)
TAG_ANY_RE = re.compile(r"<[^>]+>")
BOLD_RE = re.compile(r"<(?:strong|b)\b[^>]*>(.*?)</(?:strong|b)>", re.S | re.I)
ITAL_RE = re.compile(r"<(?:em|i)\b[^>]*>(.*?)</(?:em|i)>", re.S | re.I)
DATA_OBJ_RE = re.compile(r"LN\.data\.([A-Za-z0-9_]+)\s*=\s*\{")
TERM_RE = re.compile(r'\bt\s*:\s*"((?:[^"\\]|\\.)*)"')
DIV_TOKEN_RE = re.compile(r"<div\b|</div>")
BLOCK_IN_BOX_RE = re.compile(r"<(p|ol|ul|table|div|svg)\b.*?</\1>", re.S | re.I)

# Sections whose prose is not student-facing teaching prose.
EXEMPT_SECTIONS = {"assignment", "assign", "references"}

# A loose text run inside a box must reach this many words to count as a paragraph.
MIN_LOOSE_WORDS = 6

# Sentence lint (--max-sentence-words). A paragraph split into sentences, then every
# sentence over budget paired with the visual that would carry its structure — the
# checker's cure table, keyed by the words that signal each shape. A visual REPLACES the
# words; splitting is only the fallback when no shape fits.
SENT_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
SENTENCE_VISUALS = [
    (r"\b(first|then|next|finally|afterwards|process|procedure|followed by|begins|proceeds)\b",
     "flow / process diagram"),
    (r"\b(versus|vs|compared|comparing|whereas|while|than|unlike|differs|greater than|less than|higher than|lower than)\b",
     "comparison table"),
    (r"\b(increase|increases|increased|decrease|decreases|decreased|rise|rises|rose|fall|falls|fell|grow|grows|grew|decline|declines|declined|trend|percent|proportion|distribution)\b",
     "figure / graph / timeline"),
    (r"\b(consists|consist|comprises|comprise|composed|includes|include|such as|categories|category|types|type|kinds|kind|elements|element|components|component|factors|factor)\b",
     "bullet hierarchy"),
    (r"\b(relates|relate|depends|depend|affects|affect|influences|influence|drives|drive|determines|determine)\b",
     "mindmap / concept map"),
]
DEFAULT_SENTENCE_VISUAL = "card split (split the bundled ideas across cards)"


def clean(fragment: str) -> str:
    text = TAG_ANY_RE.sub(" ", fragment)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def spans(fragment: str, regex: re.Pattern) -> list[str]:
    """The cleaned inner text of every inline span matching `regex`, in order."""
    out = []
    for m in regex.finditer(fragment):
        text = clean(m.group(1))
        if text:
            out.append(text)
    return out


def balanced_braces(text: str, open_idx: int) -> str:
    """`text[open_idx:]` up to and including the `}` that closes the `{` at open_idx."""
    depth = 0
    in_str = False
    esc = False
    for i in range(open_idx, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[open_idx : i + 1]
    return text[open_idx:]


def glossary_terms(text: str) -> list[str]:
    """Term strings from every `LN.data.<key> = { groups: [...] }` object."""
    terms = []
    for m in DATA_OBJ_RE.finditer(text):
        body = balanced_braces(text, m.end() - 1)
        if "groups" not in body:
            continue
        for t in TERM_RE.finditer(body):
            term = clean(t.group(1))
            if term:
                terms.append(term)
    return terms


def div_end(body: str, start: int) -> int:
    """Index of the </div> matching the <div at `start`."""
    depth = 0
    for m in DIV_TOKEN_RE.finditer(body, start):
        depth += -1 if m.group().startswith("</") else 1
        if depth == 0:
            return m.start()
    return len(body)


def loose_fragment(box_html: str) -> str:
    """Markup directly inside a box, excluding its .tag and nested block elements."""
    stripped = TAG_RE.sub(" ", box_html, count=1)
    return BLOCK_IN_BOX_RE.sub(" ", stripped)


def loose_text(box_html: str) -> str:
    """Text directly inside a box, excluding its .tag and nested block elements."""
    return clean(loose_fragment(box_html))


def box_context(body: str, p_start: int) -> tuple[str | None, str]:
    """The innermost open def/mini/note/card before this <p>, and its .tag."""
    last_close = body.rfind("</div>", 0, p_start)
    seg = body[last_close + 6 if last_close != -1 else 0 : p_start]
    m = None
    for m in BOX_RE.finditer(seg):
        pass
    if not m:
        return None, ""
    tag_m = TAG_RE.search(seg[m.start() :])
    return m.group(1), (clean(tag_m.group(1)) if tag_m else "")


def make_unit(offset: int, fragment: str, box: str | None, tag: str) -> dict:
    content = clean(fragment)
    words = content.split()
    return {
        "offset": offset,
        "box": box,
        "tag": tag,
        "words": len(words),
        "head": " ".join(words[:8]),
        "tail": " ".join(words[-8:]),
        "text": content,
        "bold": spans(fragment, BOLD_RE),
        "italic": spans(fragment, ITAL_RE),
    }


def keep_words(words: int, min_words: int, max_words: int) -> bool:
    """True when a paragraph passes the --min-words / --max-words window."""
    if words < min_words:
        return False
    if max_words and words <= max_words:
        return False
    return True


def split_sentences(text: str) -> list[str]:
    """A paragraph's sentences, in order."""
    return [s.strip() for s in SENT_SPLIT_RE.split(text) if s.strip()]


def sentence_visual(sentence: str) -> str:
    """The visual that would carry this sentence's structure (its shape signals)."""
    low = sentence.lower()
    for pattern, visual in SENTENCE_VISUALS:
        if re.search(pattern, low):
            return visual
    if low.count(",") >= 2:
        return "bullet hierarchy"
    return DEFAULT_SENTENCE_VISUAL


def long_sentences(text: str, max_words: int) -> list[dict]:
    """Every sentence over max_words, each paired with its suggested visual."""
    out = []
    for i, sentence in enumerate(split_sentences(text), start=1):
        words = len(sentence.split())
        if words > max_words:
            out.append(
                {
                    "index": i,
                    "words": words,
                    "text": sentence,
                    "visual": sentence_visual(sentence),
                }
            )
    return out


def split_sections(text: str) -> list[dict]:
    out = []
    for m in SECTION_RE.finditer(text):
        sid = m.group(1)
        body = m.group(2)
        h2 = H2_RE.search(body)
        heading = clean(h2.group(1)) if h2 else ""
        units = []
        for pm in P_RE.finditer(body):
            if not clean(pm.group(1)):
                continue
            box, tag = box_context(body, pm.start())
            units.append(make_unit(pm.start(), pm.group(1), box, tag))
        # Prose held directly in a .def/.mini/.note/.card with no <p> wrapper.
        for bm in BOX_RE.finditer(body):
            end = div_end(body, bm.start())
            inner = body[bm.start() : end]
            fragment = loose_fragment(inner)
            if len(clean(fragment).split()) < MIN_LOOSE_WORDS:
                continue
            tag_m = TAG_RE.search(inner)
            tag = clean(tag_m.group(1)) if tag_m else ""
            units.append(make_unit(bm.start(), fragment, bm.group(1), tag))
        units.sort(key=lambda u: u["offset"])
        paragraphs = []
        for i, u in enumerate(units, start=1):
            u.pop("offset")
            u["index"] = i
            paragraphs.append(u)
        out.append(
            {
                "id": sid,
                "heading": heading,
                "exempt": sid in EXEMPT_SECTIONS,
                "paragraphs": paragraphs,
            }
        )
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("html", help="path to a built notebook (.html)")
    ap.add_argument("--section", help="only this section id")
    ap.add_argument("--min-words", type=int, default=0, help="hide paragraphs shorter than this")
    ap.add_argument(
        "--max-words",
        type=int,
        default=0,
        help="show only paragraphs longer than this (over-budget lint; 0 = no cap)",
    )
    ap.add_argument(
        "--max-sentence-words",
        type=int,
        default=0,
        help="flag sentences longer than this and pair each with a visual (0 = off)",
    )
    ap.add_argument(
        "--include-exempt",
        action="store_true",
        help="also list the assignment and references sections (off by default)",
    )
    ap.add_argument("--json", action="store_true", help="emit JSON instead of the listing")
    args = ap.parse_args(argv)

    try:
        with open(args.html, encoding="utf-8") as fh:
            text = fh.read()
    except OSError as exc:
        print(f"cannot read {args.html}: {exc}", file=sys.stderr)
        return 2

    sections = split_sections(text)
    if args.section:
        sections = [s for s in sections if s["id"] == args.section]
    if not args.include_exempt:
        sections = [s for s in sections if not s["exempt"]]

    if args.json:
        for s in sections:
            s["paragraphs"] = [
                p
                for p in s["paragraphs"]
                if keep_words(p["words"], args.min_words, args.max_words)
            ]
            if args.max_sentence_words:
                for p in s["paragraphs"]:
                    p["long_sentences"] = long_sentences(p["text"], args.max_sentence_words)
        print(json.dumps({"glossary": glossary_terms(text), "sections": sections}, ensure_ascii=False, indent=2))
        return 0

    total = 0
    for s in sections:
        paras = [
            p
            for p in s["paragraphs"]
            if keep_words(p["words"], args.min_words, args.max_words)
        ]
        if not paras:
            continue
        flag = "  [exempt: not student teaching prose]" if s["exempt"] else ""
        print(f"\n== {s['id']} — {s['heading']}{flag} ==")
        for p in paras:
            total += 1
            where = f"{p['box']}:{p['tag']}" if p["box"] else "-"
            print(f"\n  ¶{p['index']}  [{p['words']}w · {where}]")
            print(f"    {p['text']}")
            if p["bold"]:
                print(f"    bold: {'; '.join(p['bold'])}")
            if p["italic"]:
                print(f"    italic: {'; '.join(p['italic'])}")
            if args.max_sentence_words:
                for ls in long_sentences(p["text"], args.max_sentence_words):
                    print(f"    ! sentence {ls['index']} [{ls['words']}w] -> visual: {ls['visual']}")
                    print(f"      {ls['text']}")
    terms = glossary_terms(text)
    if terms:
        print(f"\n== Glossary terms ({len(terms)}) ==")
        for t in terms:
            print(f"  - {t}")
    print(f"\n({total} paragraphs)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
