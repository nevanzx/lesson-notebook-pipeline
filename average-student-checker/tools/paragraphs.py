#!/usr/bin/env python3
"""Extract the teaching prose of a built lesson notebook, paragraph by paragraph.

The unit of review for the average-student checker is ONE PARAGRAPH. A built
notebook collapses each section onto a single long HTML line, so source line
numbers are useless as anchors. This tool emits, for every teaching paragraph:
the section id, the section heading, the paragraph ordinal inside the section,
the box it sits in (a .def / .mini / .note / .card, with its .tag label), the
word count, and the paragraph text. The ordinal + the first/last words are a
stable span the checker can quote back.

Usage:
    python tools/paragraphs.py <built.html>
    python tools/paragraphs.py <built.html> --section abc
    python tools/paragraphs.py <built.html> --min-words 60
    python tools/paragraphs.py <built.html> --json

Only <section class="block" id="..."> blocks are read. <p> elements are the
paragraphs; headings, component mounts, and lists are not paragraphs.
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
DIV_TOKEN_RE = re.compile(r"<div\b|</div>")
BLOCK_IN_BOX_RE = re.compile(r"<(p|ol|ul|table|div|svg)\b.*?</\1>", re.S | re.I)

# Sections whose prose is not student-facing teaching prose.
EXEMPT_SECTIONS = {"assignment", "assign", "references"}

# A loose text run inside a box must reach this many words to count as a paragraph.
MIN_LOOSE_WORDS = 6


def clean(fragment: str) -> str:
    text = TAG_ANY_RE.sub(" ", fragment)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def div_end(body: str, start: int) -> int:
    """Index of the </div> matching the <div at `start`."""
    depth = 0
    for m in DIV_TOKEN_RE.finditer(body, start):
        depth += -1 if m.group().startswith("</") else 1
        if depth == 0:
            return m.start()
    return len(body)


def loose_text(box_html: str) -> str:
    """Text directly inside a box, excluding its .tag and nested block elements."""
    stripped = TAG_RE.sub(" ", box_html, count=1)
    stripped = BLOCK_IN_BOX_RE.sub(" ", stripped)
    return clean(stripped)


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


def make_unit(offset: int, content: str, box: str | None, tag: str) -> dict:
    words = content.split()
    return {
        "offset": offset,
        "box": box,
        "tag": tag,
        "words": len(words),
        "head": " ".join(words[:8]),
        "tail": " ".join(words[-8:]),
        "text": content,
    }


def split_sections(text: str) -> list[dict]:
    out = []
    for m in SECTION_RE.finditer(text):
        sid = m.group(1)
        body = m.group(2)
        h2 = H2_RE.search(body)
        heading = clean(h2.group(1)) if h2 else ""
        units = []
        for pm in P_RE.finditer(body):
            content = clean(pm.group(1))
            if not content:
                continue
            box, tag = box_context(body, pm.start())
            units.append(make_unit(pm.start(), content, box, tag))
        # Prose held directly in a .def/.mini/.note/.card with no <p> wrapper.
        for bm in BOX_RE.finditer(body):
            end = div_end(body, bm.start())
            inner = body[bm.start() : end]
            content = loose_text(inner)
            if len(content.split()) < MIN_LOOSE_WORDS:
                continue
            tag_m = TAG_RE.search(inner)
            tag = clean(tag_m.group(1)) if tag_m else ""
            units.append(make_unit(bm.start(), content, bm.group(1), tag))
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

    if args.json:
        for s in sections:
            s["paragraphs"] = [p for p in s["paragraphs"] if p["words"] >= args.min_words]
        print(json.dumps(sections, ensure_ascii=False, indent=2))
        return 0

    total = 0
    for s in sections:
        paras = [p for p in s["paragraphs"] if p["words"] >= args.min_words]
        if not paras:
            continue
        flag = "  [exempt: not student teaching prose]" if s["exempt"] else ""
        print(f"\n== {s['id']} — {s['heading']}{flag} ==")
        for p in paras:
            total += 1
            where = f"{p['box']}:{p['tag']}" if p["box"] else "-"
            print(f"\n  ¶{p['index']}  [{p['words']}w · {where}]")
            print(f"    {p['text']}")
    print(f"\n({total} paragraphs)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
