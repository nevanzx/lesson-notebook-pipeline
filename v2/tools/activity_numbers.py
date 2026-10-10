#!/usr/bin/env python3
"""Activity-freshness helper (SKILL v2.18, Part 5).

Flags answerable-activity numbers that also appear in their section's prose or
figure labels. Because a data key is prefixed with its section id (SKILL §1.3),
each `LN.data.<key>` is compared against section `id`'s teaching text (HTML tags
and attributes stripped, so SVG/coordinate noise is ignored).

This is ADVISORY, not a proof: it also reports incidental matches (unit indices,
prices). A reviewer must judge each hit. Exit 0 = no candidate collisions.

Usage: python tools/activity_numbers.py <built.html>
"""
import re
import sys


def numbers(text):
    return set(re.findall(r"-?\d+(?:\.\d+)?", text))


def _meaningful(n):
    """A value worth comparing: a decimal, or an integer >= 10. Drops the
    single-digit unit indices that appear in almost every prose passage."""
    if "." in n:
        return True
    try:
        return abs(int(n)) >= 10
    except ValueError:
        return False


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    with open(argv[1], encoding="utf-8") as fh:
        s = fh.read()

    sections = {}
    for m in re.finditer(r'<section class="block" id="([^"]+)">(.*?)</section>', s, re.S):
        # keep element text (figure labels) but drop tag names + attributes
        sections[m.group(1)] = re.sub(r"<[^>]+>", " ", m.group(2))

    assignments = []
    for m in re.finditer(r"LN\.data\.([A-Za-z0-9_]+)\s*=\s*", s):
        key = m.group(1)
        start = m.end()
        nxt = re.search(r"LN\.data\.[A-Za-z0-9_]+", s[start:])
        end = start + (nxt.start() if nxt else len(s) - start)
        assignments.append((key, s[start:end]))

    skip_sections = {"overview", "glossary", "assignment", "recap", "references"}
    flagged = 0
    for key, val in assignments:
        sec = next((sid for sid in sections if key.startswith(sid)), None)
        if not sec or sec in skip_sections:
            continue
        hits = sorted((n for n in (numbers(val) & numbers(sections[sec]))
                       if _meaningful(n)), key=lambda x: (len(x), x))
        if hits:
            flagged += 1
            print("%-22s (section %-9s) candidate reuse: %s"
                  % (key, sec, ", ".join(hits)))

    if flagged:
        print("\n%d data key(s) share numbers with their section's prose/figure labels - "
              "review each (Part 5 activity freshness)." % flagged)
        return 1
    print("OK - no activity number found in its section's prose or figure labels.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
