#!/usr/bin/env python3
"""Literal-English lint for lesson notebooks (SKILL.md §2.1g).

Flags the high-confidence cases that make a lesson unreadable to a student who
takes English literally: idioms, phrasal verbs, metaphors used as technical
terms, stacked names for one concept, and Philippine-English false friends.

Usage:
    python tools/literal_lint.py <built.html|sections.html> [--json] [--strict]

Exit 0 when no FAIL-severity finding is present (REVIEW findings alone do not
fail). --strict also fails on REVIEW findings. build.py imports lint_text() and
fails the build on the FAIL list.
"""
import argparse
import html
import json
import re

SECTION_RE = re.compile(
    r'<section\b[^>]*\bid="([^"]+)"[^>]*>(.*?)</section>', re.S | re.I)
UNIT_RE = re.compile(r'<(p|li|figcaption)\b[^>]*>(.*?)</\1>', re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
SKIP_IDS = {"references", "assignment"}

# (rule, severity, pattern, detail, fix)
RULES = [
    ("idiom", "fail", r"\bfell short\b",
     "idiom: fell short", "say what failed"),
    ("idiom", "fail", r"\bsits? beside\b",
     "idiom: sits beside", "say 'happen at the same time'"),
    ("idiom", "fail", r"\bread off\b",
     "phrasal verb: read off", "say 'tell from'"),
    ("idiom", "fail", r"\bleaves? open\b",
     "idiom: leave open", "say 'does not decide'"),
    ("idiom", "fail", r"\bstops? short\b",
     "idiom: stops short", "say 'is not yet'"),
    ("idiom", "fail", r"\bcarries it\b",
     "idiom: carries it", "name the connection"),
    ("idiom", "fail", r"\bfails? quietly\b",
     "idiom: fails quietly", "say 'can fail in ways that are easy to miss'"),
    ("idiom", "fail", r"\bstart where the block is\b",
     "metaphor: the block", "say 'begin at the point that is stopping you'"),
    ("metaphor", "fail", r"\bupstream\b",
     "metaphor: upstream", "say 'comes first'"),
    ("metaphor", "fail", r"\bbandwidth\b",
     "metaphor: bandwidth", "say 'attention'"),
    ("metaphor", "fail", r"\bdecorative\b",
     "metaphor: decorative", "say 'just a word'"),
    ("nominalization", "fail", r"\bthe doing\b",
     "nominalization: the doing", "say 'what the person does'"),
    ("metaphor", "fail", r"\bloop\b",
     "metaphor used as a term: loop", "say 'cycle' and define it once"),
    ("metaphor", "fail", r"\blens(?:es)?\b",
     "metaphor used as a term: lens", "say 'part'"),
    ("false-friend", "fail", r"\bdispos(e|es|ed|ing)\b",
     "false friend in Philippine English: dispose",
     "say 'makes a response more or less likely'"),
    ("label-stack", "fail", r"\b(growth|fixed|open|closed) reading\b",
     "stacked label for one concept", "use 'growth mindset' / 'fixed mindset'"),
    ("idiom", "fail", r"\bnarrows? (the )?claim\b",
     "metaphor: narrows the claim", "say 'makes the claim smaller and more exact'"),
    ("idiom", "fail", r"\bpays? off\b",
     "phrasal verb: pays off", "say 'helps'"),
    ("idiom", "fail", r"\brefus(es|ed) to move\b",
     "idiom: refuses to move", "say 'does not change'"),
    ("idiom", "fail", r"\bleaves? the question\b",
     "idiom: leaves the question", "say 'the next question is'"),
    ("idiom", "fail", r"\bkeeps? it open\b",
     "idiom: keeps it open", "say 'keeps the decision open'"),
    ("metaphor", "fail", r"\bnames? a heading\b",
     "metaphor: names a heading", "say 'names a direction'"),
    ("metaphor", "fail", r"\bscans?\b",
     "metaphor: scan (for attention)", "say 'looks for'"),
    ("idiom", "review", r"\bfiled as\b",
     "idiom: filed as", "say 'treated as'"),
    ("idiom", "review", r"\breads? as\b",
     "compressed: reads as", "say 'is seen as'"),
    ("metaphor", "review", r"\bsurviv\w*\b",
     "metaphor: survives", "say 'remains' / 'holds' / 'gets through'"),
    ("metaphor", "review", r"\bverdict\b",
     "courtroom metaphor", "keep only with a plain gloss, or say 'judgment'"),
    ("metaphor", "review", r"\bthe work\b",
     "possible vague subject", "name the task or the person"),
]


def clean(fragment):
    return WS_RE.sub(" ", html.unescape(TAG_RE.sub(" ", fragment))).strip()


def lint_text(text):
    """Return {fails, review, sections, total} for the teaching prose."""
    fails, review = [], []
    sections = {}
    for sm in SECTION_RE.finditer(text):
        sid = sm.group(1)
        if sid in SKIP_IDS:
            continue
        body = sm.group(2)
        base = sm.start(2)
        units = list(UNIT_RE.finditer(body))
        sections[sid] = {"paragraphs": len(units), "findings": 0}
        for pno, um in enumerate(units, 1):
            txt = clean(um.group(2))
            if not txt:
                continue
            for rule, sev, pat, detail, fix in RULES:
                m = re.search(pat, txt, re.I)
                if not m:
                    continue
                line = text.count("\n", 0, base + um.start(2)) + 1
                item = {
                    "rule": rule,
                    "severity": sev,
                    "section": sid,
                    "paragraph": pno,
                    "line": line,
                    "match": m.group(0),
                    "detail": detail,
                    "fix": fix,
                    "head": txt[:90],
                }
                (fails if sev == "fail" else review).append(item)
                sections[sid]["findings"] += 1
    return {
        "fails": fails,
        "review": review,
        "sections": sections,
        "total": len(fails) + len(review),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("file")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()
    text = open(a.file, encoding="utf-8-sig").read()
    rep = lint_text(text)
    if a.json:
        print(json.dumps(rep, indent=2, ensure_ascii=False))
    else:
        for it in rep["fails"] + rep["review"]:
            print("%-6s %-12s %s p%d  %r  -> %s"
                  % (it["severity"].upper(), it["rule"], it["section"],
                     it["paragraph"], it["match"], it["fix"]))
        print("%d fail, %d review" % (len(rep["fails"]), len(rep["review"])))
    bad = bool(rep["fails"]) or (a.strict and bool(rep["review"]))
    raise SystemExit(1 if bad else 0)


if __name__ == "__main__":
    main()
