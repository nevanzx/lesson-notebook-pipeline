---
name: average-student-checker
description: >
  Use when reviewing the teaching prose of a lesson notebook or lesson HTML for
  how an average college student will actually read it — right after a notebook
  is generated, or when updating an existing lesson. Triggers on requests to
  check for dense paragraphs, walls of text, run-on explanations, or content an
  average student cannot follow; also use as a clarity QA pass before a lesson
  ships, or to check that key terms are bolded on first use. Triggers on
  "check the clarity", "is this clear", "review the lesson prose", or "are the
  terms bold".
---

# Average Student Checker

A reviewer, not an editor. Its reader is the notional **average student** who
skims the page and revises from it. It reads teaching prose **one paragraph at a
time** and reports every paragraph that fails.

**Core principle: one paragraph, two clarity lenses, a formatting check, a
visual cure.**

## Follow this skill exactly

This skill is a **contract, not a menu.** Run the two clarity lenses and the
formatting check over the tool's paragraphs and nothing else. Do not add
findings, sections, appendices, or analysis it does not call for; do not rewrite
the notebook; never read or decrypt the assignment payload. Violating the letter
of this skill is violating its spirit.

Only your human partner can widen the scope, and only by **naming the wider
scope directly** ("also review the glossary", "check the citations too"). A
general "be thorough", "don't miss anything", or "flag anything else that's
wrong" does **not** widen it — stay in the two clarity lenses and the formatting
check. When a scope is named, do exactly that and nothing more, and label it as a
deviation.

| Excuse | Reality |
|---|---|
| "The assignment has prose too" | Out of scope; the tool omits it. Do not read or decrypt it. |
| "I'll add one note about the citation / the number / the heading" | Another pass owns it. Name the lens and the visual, or say nothing. |
| "I'll fix the paragraph while I'm here" | This skill **reports**; it never edits. |
| "They said 'flag anything else that's wrong'" | A general ask is not a named scope. Stay in the two clarity lenses and the formatting check. |
| "I'll add a scope note to explain what I skipped" | Output is the finding list and the verdict. Nothing else. |

**Red flags — STOP:** adding an appendix; decrypting or reading assignment data;
naming a wrong number, citation, or heading; rewriting prose; reporting at section
level instead of paragraph level; adding a finding outside the two clarity lenses
and the formatting check.

## The unit — a paragraph, with a start and a stop

A built notebook collapses each section onto one long HTML line, so source line
numbers are useless and a heading is too coarse. Get exact paragraph units with:

```
python tools/paragraphs.py <built.html>
python tools/paragraphs.py <built.html> --section <id> --min-words 40
python tools/paragraphs.py <built.html> --max-words 40 --max-sentence-words 30
```

The `--max-words` / `--max-sentence-words` flags are the prose-budget lint (a long
sentence is paired with the visual that would carry its structure); they are for the
author or a budget check, not for this skill's two lenses. See `v2/SKILL.md` §2.1e.

Each row gives the **section id**, its heading, the paragraph **ordinal (¶N)**
inside the section, the box it sits in (`.def`/`.mini`/`.note`/`.card` + its tag),
the word count, and the text — plus the paragraph's **bold** and *italic* spans.
Anchor every finding as **section id + ¶N + the first few and last few words** —
that span is stable no matter how the file is stored. The tool also lists the
notebook's **glossary terms**, which the formatting check needs.

Read the paragraph units the tool emits: `<p>` elements, plus prose held directly
in a `.def`/`.mini`/`.note`/`.card`. Headings, lists, component mounts, and bare
formula or label lines are not teaching paragraphs — skip them.

**The assignment and the references section are never reviewed.** They are not
teaching prose — the assignment's readability is governed by the assignment
craft, and it stays hidden until the student begins. The tool omits both by
default: do not pass `--include-exempt`, and do not review the assignment even if
you happen to see it.

## The two clarity lenses

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

## The formatting check

The notebook bolds each **key term** — a term that has a glossary entry — the
first time it appears **inside a content section**, so a skimming student can
find it. The tool prints the notebook's glossary terms, and prints each
paragraph's `bold:` spans, so this is mechanical: a key term that is used for
the first time in a section and is **not** among that paragraph's `bold:` spans
is a finding.

- A key term is **in the tool's glossary list**. Ordinary words are not key terms.
- Only the **first occurrence inside a section** must be bold; a later use of the
  same term in the same section is fine unbolded. Judge "first" by the paragraph
  ordinals (¶N), in order, within one section.
- Match case-insensitively, and allow a leading article or modifier ("the current
  ratio", "its contribution margin").
- If the tool prints **no glossary terms** (a part-level review before assembly
  has no glossary section), the check does not apply — say nothing about it.
- The glossary section's own terms are rendered bold by the component and are not
  paragraphs; never flag them, and never require the glossary intro to bold
  anything.
- Not your finding: a missing or wrong *italic*, a heading, a tag, or a term that
  is bold where it need not be. Those are other passes.

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
- **Lens** — DENSE · UNCLEAR · BOTH · UNFORMATTED
- **Why** — one sentence: the load it puts on the student, or what it fails to
  supply; for UNFORMATTED, that the term is used for the first time in this
  section and is not bold
- **Reduce** — the visual, and the one-line change; for UNFORMATTED, the term to
  bold (a formatting fix, not a visual)

Output **exactly these fields and the verdict — nothing else**: no scope notes,
no summary of what you skipped, no fixes applied. End with the verdict —
**`CLARITY PASS`** when nothing is flagged, otherwise **`NOT A CLARITY PASS`**
followed by the list. A pass has no flags; never write both. Flag a paragraph once
per cause; do not repeat a cause.

## Stay in your lane

Two clarity lenses, plus the bold-term formatting check. Nothing else. These are
**other passes' findings, not yours**:

| Not your finding | Owner |
|---|---|
| a wrong number, arithmetic, or a missing formula | the formula review |
| a wrong citation, or section numbering | the content review |
| a typo, label, or tag that does not change meaning | a copy edit |
| a missing or wrong *italic*, or a term bolded where it need not be | a copy edit |
| navigation, layout, or the assignment | build.py / other reviewers |

Phrases that mean you have drifted out of lane: *"worth a build-side look"*,
*"also worth noting"*, *"the citation is wrong"*, *"section numbering skips…"*,
*"the formula is missing"*, *"this should be renamed"*. Those belong to another
pass — name the lens and the visual, or say nothing.

**In the lesson-notebook pipeline only**, the merged shortlist reviewer also
checks numeric freshness and arithmetic for the section's prose worked examples.
That is the single in-pipeline exception to the lane above. A standalone run
stays two lenses + formatting.

## Common mistakes

- Reporting at **section** level. The unit is the paragraph.
- Anchoring by **HTML line number**. Use section id + ¶N + first/last words.
- Naming a lens with **no visual**, or proposing "simplify" with no change.
- Flagging a hard word that **the same sentence defines** ("Normalized — with
  one-off items removed — means…" is clear).
- Flagging a key term's **later** occurrences — only its **first** use inside a
  section must be bold.
- Running the formatting check when the tool printed **no glossary terms** (a
  part-level review) — say nothing about formatting there.

## Where it runs

**Standalone** — point it at any built lesson `.html` (the old lessons you are
updating): run the tool, then apply the two clarity lenses and the formatting
check. The tool prints each paragraph's bold spans and the notebook's glossary
terms, so the formatting check needs the **assembled** file (the one that carries
the glossary section).

**In the lesson-notebook pipeline** — v2.32 runs it as a **shortlist reviewer**:
in the pipeline, `prose_lint.py` owns the Dense budget, the bold key term, and the
`Where:` gloss mechanically, so this skill is dispatched only for paragraphs the
lint flags plus sections that carry math. The standalone skill still runs its two
lenses and the formatting check. This is one merged reviewer per qualifying
section, reporting clarity and numeric findings (numeric is the single in-pipeline
exception, see **Stay in your lane**) before assembly. There is no final LLM
clarity sweep over the assembled file; `build.py` runs the mechanical gate
instead.

It **reports**; it does not edit. Apply the fix on request.
