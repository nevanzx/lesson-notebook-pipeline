#!/usr/bin/env python3
"""Deterministic pacing lint: does the lesson's content fit the class hour?

Only the **lesson content** is budgeted. Activities and the assignment are
reported for the teacher's planning but never consume the budget, and they are
never cut to make the content fit.

  ordinary prose      130 words/min - a teacher talking it through with pauses
  calculation prose   half weight - formulas, Where: lists, and Worked steps
                      are walked through and skimmed, not read aloud

Fails (they block the build):
  lesson_over_budget   content minutes past the budget
  section_over_budget  one section's weighted words past its cap

Reviews (judgement, they never block):
  lesson_under_budget  under 75% of the budget used
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

LESSON_MINUTES = 60
DISCUSSION_WPM = 130
CALC_WEIGHT = 0.5

# Weighted-word caps. A teaching section at the cap is ~11.5 min of content.
TEACHING_WORDS = 1500
BOOKEND_WORDS = 450

# A lesson that uses less than this share of the hour is too thin to fill it.
UNDER_RATIO = 0.75
# Rounding grace so a 60.2-min estimate is not treated as an overrun.
OVER_GRACE = 0.5

EXEMPT_IDS = {"assignment", "assign", "references"}
BOOKEND_IDS = {"overview", "glossary", "selfcheck", "self-check", "recap"}

# Activity costs are reported, never budgeted.
ACTIVITY_MINUTES = {
    "milo-list": 2,
    "glossary": 2,
    "sort-statement": 3,
    "true-false": 3,
    "mcq": 3,
    "ranked-statements": 3,
    "case-match": 4,
    "feasibility-gate": 4,
    "step-solver": 5,
    "comparison-table": 0,
    "flipcards": 2,
    "assignment": 12,
}
LAB_MINUTES = 6
DEFAULT_ACTIVITY_MINUTES = 3

MOUNT_RE = re.compile(r'data-component\s*=\s*["\']([a-z0-9-]+)["\']', re.I)
WHERE_RE = re.compile(r"\bwhere\s*:", re.I)
CALC_BOXES = {"def", "mini", "card"}


def activity_minutes(name):
    """Minutes a mounted component costs in class (reported, not budgeted)."""
    name = (name or "").lower()
    if name in ACTIVITY_MINUTES:
        return ACTIVITY_MINUTES[name]
    if name.endswith("-lab"):
        return LAB_MINUTES
    return DEFAULT_ACTIVITY_MINUTES


def is_calculation(unit):
    """True for prose that carries arithmetic: MathML, a Where: gloss, Worked."""
    raw = (unit.get("raw") or "").lower()
    if "<math" in raw:
        return True
    if (unit.get("box") or "") in CALC_BOXES and WHERE_RE.search(unit.get("text") or ""):
        return True
    return (unit.get("tag") or "").lower().startswith("worked")


def _cap(sid):
    if sid in EXEMPT_IDS:
        return None
    if sid in BOOKEND_IDS:
        return BOOKEND_WORDS
    return TEACHING_WORDS


def estimate(text, minutes=LESSON_MINUTES, wpm=DISCUSSION_WPM):
    """Per-section and total content minutes for assembled sections HTML."""
    rows = []
    for sec in paragraphs.split_sections(text):
        sid = sec["id"]
        exempt = sid in EXEMPT_IDS
        units = sec["paragraphs"]
        words = 0 if exempt else sum(u["words"] for u in units)
        calc_words = 0 if exempt else sum(
            u["words"] for u in units if is_calculation(u))
        weighted = words - calc_words * (1.0 - CALC_WEIGHT)
        mounts = MOUNT_RE.findall(sec.get("body") or "")
        rows.append({
            "id": sid,
            "heading": sec.get("heading", ""),
            "words": words,
            "calc_words": calc_words,
            "weighted_words": round(weighted, 1),
            "cap_words": _cap(sid),
            "prose_minutes": round(weighted / float(wpm), 2),
            "activity_minutes": sum(activity_minutes(m) for m in mounts),
            "mounts": mounts,
        })
    content = sum(r["prose_minutes"] for r in rows)
    activity = sum(r["activity_minutes"] for r in rows)
    return {
        "budget": minutes,
        "wpm": wpm,
        "calc_weight": CALC_WEIGHT,
        "total_minutes": round(content, 1),
        "over_minutes": round(content - minutes, 1),
        "activity_minutes": activity,
        "class_minutes": round(content + activity, 1),
        "words": sum(r["words"] for r in rows),
        "calc_words": sum(r["calc_words"] for r in rows),
        "weighted_words": round(sum(r["weighted_words"] for r in rows), 1),
        "sections": rows,
    }


def _finding(rule, severity, section, detail, fix):
    return {
        "rule": rule,
        "severity": severity,
        "section": section,
        "detail": detail,
        "fix": fix,
    }


def lint_text(text, minutes=LESSON_MINUTES, wpm=DISCUSSION_WPM):
    est = estimate(text, minutes=minutes, wpm=wpm)
    fails, review = [], []

    for row in est["sections"]:
        cap = row["cap_words"]
        if cap is not None and row["weighted_words"] > cap:
            if row["id"] in BOOKEND_IDS:
                fix = ("cut %d weighted words — the Overview, Glossary, and Recap "
                       "are maps of the lesson, not summaries"
                       % (row["weighted_words"] - cap))
            else:
                fix = ("cut %d weighted words, or move a concept into its own "
                       "section (§2.3)" % (row["weighted_words"] - cap))
            fails.append(_finding(
                "section_over_budget", "fail", row["id"],
                "%d words (%d calculation = %d weighted); the cap is %d weighted "
                "words (%.1f min of content)"
                % (row["words"], row["calc_words"], row["weighted_words"], cap,
                   cap / float(wpm)),
                fix))

    total, budget = est["total_minutes"], est["budget"]
    if total > budget + OVER_GRACE:
        over = total - budget
        fails.append(_finding(
            "lesson_over_budget", "fail", "-",
            "estimated %.1f min of content (budget %d; %.1f min over)"
            % (total, budget, over),
            "trim about %d weighted words of content (§2.3); activities and the "
            "assignment are not part of the budget"
            % int(over * wpm + 0.5)))
    elif total < budget * UNDER_RATIO:
        review.append(_finding(
            "lesson_under_budget", "review", "-",
            "estimated %.1f min of content (budget %d; %.1f min short)"
            % (total, budget, budget - total),
            "deepen the lesson content (worked steps, a figure, a case); "
            "activities and the assignment are unaffected"))

    return {"fails": fails, "review": review, "estimate": est}


def _print_report(report):
    est = report["estimate"]
    total, budget = est["total_minutes"], est["budget"]
    if total > budget:
        verdict = "%.1f min over" % (total - budget)
    else:
        verdict = "%.1f min spare" % (budget - total)
    print("Pacing: %.1f min of content used, budget %d min (%s)"
          % (total, budget, verdict))
    print("  %-16s %6s %7s %6s %6s %5s %6s"
          % ("section", "words", "calc", "wtd", "min", "act", "cap"))
    for row in est["sections"]:
        cap = row["cap_words"] if row["cap_words"] is not None else "-"
        print("  %-16s %6d %7d %6.1f %6.1f %5d %6s"
              % (row["id"], row["words"], row["calc_words"],
                 row["weighted_words"], row["prose_minutes"],
                 row["activity_minutes"], cap))
    print("  activity time (reported, not budgeted): %d min"
          % est["activity_minutes"])
    for f in report["fails"]:
        print("FAIL   %-24s %s  %s" % (f["rule"], f["section"], f["detail"]))
        print("       -> %s" % f["fix"])
    for f in report["review"]:
        print("REVIEW %-24s %s  %s" % (f["rule"], f["section"], f["detail"]))
        print("       -> %s" % f["fix"])


def main(argv):
    ap = argparse.ArgumentParser(
        description="Estimate a lesson notebook's content discussion time.")
    ap.add_argument("html")
    ap.add_argument("--minutes", type=int, default=LESSON_MINUTES,
                    help="content budget in minutes (default %d)" % LESSON_MINUTES)
    ap.add_argument("--wpm", type=int, default=DISCUSSION_WPM,
                    help="discussion pace in words/min (default %d)"
                    % DISCUSSION_WPM)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    try:
        text = Path(args.html).read_text(encoding="utf-8")
    except OSError as exc:
        print("cannot read %s: %s" % (args.html, exc), file=sys.stderr)
        return 2
    report = lint_text(text, minutes=args.minutes, wpm=args.wpm)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        _print_report(report)
    return 1 if report["fails"] else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
