---
name: average-student-checker
description: >
  Use when reviewing the teaching prose of a lesson notebook or lesson HTML for
  how an average college student will actually read it — right after a notebook
  is generated, or when updating an existing lesson. Triggers on requests to
  check for dense paragraphs, walls of text, run-on explanations, or content an
  average student cannot follow; also use as a clarity QA pass before a lesson
  ships.
---

# Average Student Checker

A reviewer, not an editor. Its reader is the notional **average student** who
skims the page and revises from it. It reads teaching prose **one paragraph at a
time** and reports every paragraph that fails.

**Core principle: one paragraph, two lenses, a visual cure.**

## Follow this skill exactly

This skill is a **contract, not a menu.** Run the two lenses over the tool's
paragraphs and nothing else. Do not add findings, sections, appendices, or
analysis it does not call for; do not rewrite the notebook; never read or decrypt
the assignment payload. Violating the letter of this skill is violating its
spirit.

Only your human partner can widen the scope, and only by **naming the wider
scope directly** ("also review the glossary", "check the citations too"). A
general "be thorough", "don't miss anything", or "flag anything else that's
wrong" does **not** widen it — stay in the two lenses. When a scope is named, do
exactly that and nothing more, and label it as a deviation.

| Excuse | Reality |
|---|---|
| "The assignment has prose too" | Out of scope; the tool omits it. Do not read or decrypt it. |
| "I'll add one note about the citation / the number / the heading" | Another pass owns it. Name the lens and the visual, or say nothing. |
| "I'll fix the paragraph while I'm here" | This skill **reports**; it never edits. |
| "They said 'flag anything else that's wrong'" | A general ask is not a named scope. Stay in the two lenses. |
| "I'll add a scope note to explain what I skipped" | Output is the finding list and the verdict. Nothing else. |

**Red flags — STOP:** adding an appendix; decrypting or reading assignment data;
naming a wrong number, citation, or heading; rewriting prose; reporting at section
level instead of paragraph level.

## The unit — a paragraph, with a start and a stop

A built notebook collapses each section onto one long HTML line, so source line
numbers are useless and a heading is too coarse. Get exact paragraph units with:

```
python tools/paragraphs.py <built.html>
python tools/paragraphs.py <built.html> --section <id> --min-words 40
```

Each row gives the **section id**, its heading, the paragraph **ordinal (¶N)**
inside the section, the box it sits in (`.def`/`.mini`/`.note`/`.card` + its tag),
the word count, and the text. Anchor every finding as **section id + ¶N + the
first few and last few words** — that span is stable no matter how the file is
stored.

Read the paragraph units the tool emits: `<p>` elements, plus prose held directly
in a `.def`/`.mini`/`.note`/`.card`. Headings, lists, component mounts, and bare
formula or label lines are not teaching paragraphs — skip them.

**The assignment and the references section are never reviewed.** They are not
teaching prose — the assignment's readability is governed by the assignment
craft, and it stays hidden until the student begins. The tool omits both by
default: do not pass `--include-exempt`, and do not review the assignment even if
you happen to see it.

## The two lenses

**Dense** — the paragraph makes the student hold more than one load at once.
Signals: two or more distinct ideas in one block; a sentence past ~35 words or
~2 rendered lines; a comma/"and" list of items; definition + explanation +
example + caveat stacked together; a dependency chain the reader must track.

**Unclear** — the student cannot follow it. Signals: a term used before it is
defined; a prerequisite the lesson has not taught (or teaches later); a referent
with no clear noun ("this", "these", "the above"); an abstract claim with nothing
concrete; a symbol with no `Where:` gloss.

Before you call a term undefined, confirm it is **not** already defined in the
Glossary, in this section's earlier paragraphs, or in the same sentence.

A paragraph may fail both. Judge each on its own — a long paragraph can be
clear; a short one, unclear.

## The cure — a visual from the toolbox

Every finding proposes one or two visuals that carry the paragraph's own
structure. Match the visual to the failure:

| Visual | Use when the paragraph… |
|---|---|
| Bullet hierarchy | enumerates items or steps |
| Mindmap / concept map | describes parts of a whole, or how terms relate |
| Comparison table | compares two or more things on the same attributes |
| Figure / graph / timeline | holds a trend, a distribution, or a sequence |
| Flow / process diagram | is a procedure, or a cause → effect chain |
| Card split | bundles unrelated ideas that do not belong together |
| Annotated diagram | an abstract structure with named parts |

Do not default to bullets. Name the visual and say what it would carry — which
items, which axis, which branches — and which prose it replaces.

## The report

For each flagged paragraph, give these fields, in this order:

- **Section** — id + heading
- **Paragraph** — ¶N + first…last words
- **Lens** — DENSE · UNCLEAR · BOTH
- **Why** — one sentence: the load it puts on the student, or what it fails to supply
- **Reduce** — the visual, and the one-line change

Output **exactly these fields and the verdict — nothing else**: no scope notes,
no summary of what you skipped, no fixes applied. End with a verdict:
`CLARITY PASS` (nothing flagged) or the list. Flag a paragraph once per cause; do
not repeat a cause.

## Stay in your lane

Two lenses only. These are **other passes' findings, not yours**:

| Not your finding | Owner |
|---|---|
| a wrong number, arithmetic, or a missing formula | the formula review |
| a wrong citation, or section numbering | the content review |
| a typo, label, or tag that does not change meaning | a copy edit |
| navigation, layout, or the assignment | build.py / other reviewers |

Phrases that mean you have drifted out of lane: *"worth a build-side look"*,
*"also worth noting"*, *"the citation is wrong"*, *"section numbering skips…"*,
*"the formula is missing"*, *"this should be renamed"*. Those belong to another
pass — name the lens and the visual, or say nothing.

## Common mistakes

- Reporting at **section** level. The unit is the paragraph.
- Anchoring by **HTML line number**. Use section id + ¶N + first/last words.
- Naming a lens with **no visual**, or proposing "simplify" with no change.
- Flagging a hard word that **the same sentence defines** ("Normalized — with
  one-off items removed — means…" is clear).

## Where it runs

**Standalone** — point it at any built lesson `.html` (the old lessons you are
updating): run the tool, then apply the two lenses.

**In the lesson-notebook pipeline** — it is the clarity gate: run it after a
build, and dispatch it as the per-section reviewer for a new or heavily edited
lesson.

It **reports**; it does not edit. Apply the fix on request.
