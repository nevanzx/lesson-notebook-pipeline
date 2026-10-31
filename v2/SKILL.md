---
name: interactive-lesson-notebook
version: 2.39
description: Convert a lesson PDF, text, or slide deck into a single
  self-contained interactive HTML notebook. Use when the user supplies
  course material and asks for an interactive, learn-by-doing version.
  Produces one .html file with no external dependencies (the assignment's
  optional trusted-time lookup is the sole exception), a visual design
  derived from the lesson (layout pinned to `app`), live calculators, one
  medium-difficulty 10-item comprehension-check activity per teaching
  section (MCQ, true/false, identification, sorter, ranking, or scenario
  match), and a graded collect-only assignment (10 multiple-choice, 8
  true-or-false, and 2 multi-select items by default; error-check, flat,
  DAG, and graph decks on request) with an encrypted submission file.
  Carries APA-7 in-text citations plus a References section drawn from
  real, recent published works — never the handout or syllabus. Do NOT
  use for marketing pages, dashboards, or content without pedagogical
  intent.
---

# Interactive Lesson Notebook (v2.39 — content-kind colour coding)

## Purpose

Turn a linear lesson into one self-contained `.html` file a student opens offline; the
assignment's trusted-time gate needs the worldtimeapi.org lookup (its sole exception).
Three rules still govern everything:

1. **Every concept gets an interaction** — a calculator, a sorter, a scenario, or a decision.
2. **The design comes from the lesson** — pick the pack closest to the subject and retune
   it with the lesson's own nouns. Never ship a pack untuned; never ship the same look twice.
3. **The outline is fixed before any content is written** — every source section title is
   inventoried verbatim into `outline.json` first; each notebook section is then built by
   its own agent from only its own source slice. build.py rejects any section not in the
   outline, any outline section not shipped, and any heading that drifted. No phantom sections.

What v2.3 changes: content is no longer written in one sitting from memory of the whole
source. The mechanical files remain, but `sections.html`/`data.js` are now **assembled
from per-section parts** (`parts/NN-<id>.sections.html` + `parts/NN-<id>.data.js`), each
written by a dispatched agent that saw only its own slice. The main session writes the
outline, never the prose — its context stays small and the contract stays checkable.
v2.3 also hardens the Week 5 failures into **Part 9** (source-only rule): nothing ships
that the source does not contain, and every source number is recomputed.

What v2.2 adds: **calculation emphasis (§2.4)** — every worked calculation, procedure,
and formula from the source must sit in the section prose; mounted widgets only practise
the same numbers. A Week 5 lesson shipped its math inside a step-solver and a lab and
had to be rebuilt by hand; this is the failure v2.2 closes.

What v2.4 adds: the finished notebook is written to the directory the build command runs
in (the `.html` **only** — work files stay in the workdir), and **figure emphasis (§2.5)**
— a section whose concept is inherently a graph gets that graph drawn from the source's
own numbers even when the source carries no figure for it.

What v2.5 adds: **the assignment** replaces the graded-to-nowhere self-check.
Every content section's interactive element is now labelled an *Activity* — a
comprehension check — via a `data-activity="comprehension check"` attribute on
the mount (the shell renders the tag; `data-activity="none"` opts out). Section
7 ships 18 fixed + 2 or more situational items (10 mc · 4 tf · 4 id · 2+ sa)
inside a hidden fullscreen slide deck (`assignment` component, §3). Correct
answers live only in the data's `ans` / `aliases` / `key_points` / `rubric` / `max_points` fields (per-SA scoring criteria + point ceiling; 2 or more SA items per assignment) — the
student HTML never carries them, and build.py derives the teacher's grading key
from there into `<run dir>/build/key/<output stem>-key.json`. The teacher
keypair is created once on first build and persisted inside that same
`-key.json` (`teacher_key_pem`) — one file per lesson, no `keys.pem` is
generated (a pre-existing `build/key/keys.pem` is still honoured). Guard the
`-key.json` like a private key (never share, never embed in student HTML;
`build/` is gitignored). Submission
downloads an RSA-OAEP-256 + AES-GCM encrypted `.json` named
`Lastname, Firstname - Week N - Subject.json` (week + subject are baked in as
`ln:week` / `ln:subject` meta tags from build.json, which must now carry both
when the assignment mounts; the teacher decrypts with
`v2/tools/decrypt.py --key build/key/<output stem>-key.json`).
Inside `enc`, each submitted answer row carries
`{q, type, prompt, answer}` — `answer` is the per-row answer key for every
question type (mc index, tf boolean, or typed text).

What v2.6 adds: **the question harness** — `skeleton/question-craft.md` defines
"situational" for the graded assignment (a new situation may be invented; a
hidden dependency may not), sets the per-type difficulty profile
(mc easy · tf hard · id medium · sa split per question-craft: computation+analysis + analysis-only when the lesson has calculations, else both analysis), the MILO blueprint rule
(≥2 items per MILO, none >30% of the deck), and the copy test. build.py
enforces the countable subset (MC choices within ±1 word; tf never
all-true/all-false); §9.1's source-only ban is scoped to the lesson body.

What v2.7 adds: **the SA split** — in a calculation lesson one SA is
computation + analysis (compute, then defend / combine / explain the verdict)
and the other stays analysis-only; no-calculation lessons keep both SA
analysis-only (`skeleton/question-craft.md`).

Also in v2.7: **DAG assignment mode** — `build.json` may set
`"assignment": "dag"` (+ `"dag": {"levels": 2..5, "max_nodes": …}`) so Section 7
ships one multi-layer branching scenario instead of the flat 20-item deck.
Authoring is per-level fan-out (author agent → reviewer agent, level 0..L-1,
serial) under `skeleton/dag-craft.md`; `build.py` validates the graph, strips
`points` from student HTML, and writes `dag.optimal` into the teacher key.
Same mount, same identity gate, same encryption; the deck walks forward-only.
(v2.13 makes this mode the default — see below; superseded by v2.33.)

What v2.8 adds: **the assignment time lock** — when `build.json` mounts the
assignment, the Begin card is gated to a weekday window fetched from
`worldtimeapi.org` (trusted time, never the device clock), defaulting to
Wednesday `Asia/Manila` and settable via `"window": {"day": …, "tz": …}`. The
gate fails closed; the trusted time is stamped into the encrypted submission as
`submitted_at` + `submitted_time_source`, and the checker exports a
`Time Submitted` column. The lock deters casual clock tampering only — the
client HTML is never tamper-proof (see the design spec §1.1).

What v2.9 adds: **assignment ciphertext at rest + app-only unlock**. Every
assignment build ships `LN.data.<key>` as an AES-256-GCM envelope (`{lnenc,v,iv,ct}`)
of the sanitized object — no question text exists in the file, so opening it in
a browser, another viewer, or an AI yields nothing. One universal key lives in
`build/key/unlock.key` (gitignored; `LN_UNLOCK_KEY` env overrides) and as the
Worker secret `UNLOCK_KEY`; the Worker releases it only on Wednesday
(Asia/Manila, server clock) to the app origin, unless the deployment sets the
Worker var `UNLOCK_DAY=any` to release it every day (origin still enforced). The deck decrypts only inside the
HTML Viewer's iframe channel (or the teacher-only `teacher-viewer.html`, which
loads the key at runtime — the key never enters a served file), and every
failure is fail-closed to a locked card. Teacher preview stubs trusted time
for legacy builds so any day behaves like the lesson's window day.

What v2.10 adds: **the layout axis** — structure/navigation lives in
`skeleton/layouts/` (`desk`, `app`, `feed`, `sheet`). Any layout works with any theme;
v2.12 pins it: **every build ships `app`** (thumb bottom-bar, one section at a
time; horizontal swipe is disabled because it fought sideways table scrolling —
navigation is the bottom bar, the contents menu, and the arrow keys).
`build.json > layout` must be `"app"` or omitted (omitted defaults
to `app`); any other value fails the build. There is no auto-select.

What v2.11 adds: **layout containment (§1.5)** — a box must grow with its text, so
stacked faces are content-sized (grid-stack), never `position:absolute` inside a fixed
`min-height`. A Week 9 recap shipped flip tiles whose absolute faces overflowed the tile
by 14–37px: the answer text spilled outside the card, and long answers spilled further.
Every build now passes a rendered-overflow gate, `tools/layout_smoke.js` (§5), before OK.

What v2.13 adds: **DAG is the default assignment**. Omitting `"assignment"` in
`build.json` now selects the branching DAG scenario (v2.7) instead of the flat
20-item deck; the flat deck is the explicit opt-in `"assignment": "flat"` and keeps
`skeleton/question-craft.md`. The `"dag"` block is optional: omit it and Section 7
builds against the maxed-out budget `{"levels": 5, "max_nodes": 16}`; supply it to
override either value (unknown keys still rejected). The resolved budget is recorded
in the teacher key. Existing flat lessons must pin `"assignment": "flat"` to keep
building as flat (the shipped samples do).

What v2.14 adds: **no swipe navigation**. The `app` layout no longer binds
`touchstart`/`touchend` on `.stage`, so a horizontal thumb-swipe no longer changes
section — students move with the bottom bar (`<` / `Next >`), the Contents drawer,
or the left/right arrow keys. The `sx`/`sy` gesture state, the `formTarget` guard
and the shell's global `.swipe-hint` rule were removed with it; the hint is now
scoped to the shared `.cmp-wrap` wrapper that renders it. Nothing else about
`app` changed: one section at a time, the progress bar, and the Reset button are as
they were.

What v2.15 adds: **`teaching` vs `specification` sources**. A source is now
classified in the first minute. Default is unchanged (`teaching` — a handout that
contains the lesson). A `specification` source is a syllabus or course outline that
names the week's outcomes and content titles but carries **no teaching body**:
there is nothing to extract, so the week's content is authored into `src/full.txt`
first, with a `CITATIONS` block whose every fact group resolves to a real external
document. The four rules in §Source types then govern — outcomes become the
spine (every section traces to one), the syllabus's *Suggested Learning
Activities* and *Course Assignments* columns are dropped by default because the
mounted components are the activities, and the opening message declares the gap
and the standards. Part 5's formula audit swaps **Source** for **Citation** on
such a build, and a citation pointing back at the assistant's own prose scores ✗.

What v2.16 adds: **presentation tags**. Every teaching section marks its
presentable content with `data-present="N"` (N = bullet depth); the shell's
`LN.present` engine keeps only marked content and reflows it into a nested
outline, triggered by the `app` bar's Present button or the HTML Viewer's
Present toggle (via postMessage). See §2.0b.

What v2.17 adds: **in-flow present titles + calculations in present mode**. Every
teaching section's `<h2>` carries `data-present="0"` so it survives the outline
filter; it stays in normal flow, exactly as it reads outside present mode — the
shell does not pin it and reserves no offset for it. All formulas and worked
examples must now be tagged, so a projected lesson keeps its arithmetic. The HTML
Viewer's present mode pins the lesson iframe to the viewport and hides its
footer, so the lesson's navigation bar no longer drifts with the host page. See
§2.0b.

What v2.18 adds: **fresh-number activities, practice sets, calculation objectives, and a
per-section reviewer**. Activities no longer reuse the lesson's example numbers — the prose
matches the source, the activities get their own values (§2.4). Every calculation section
ships a 4–6 problem **practice set** with answers rounded to 2 dp (§2.4b). Each formula and
worked block opens with an **Objective** note and a named situation (§2.4). Part 5 adds an
activity-freshness audit and a reviewer agent per section; `tools/activity_numbers.py` helps
flag reused numbers. Justified body text is now the shell default.

What v2.19 adds: **definition + bullet content shape, and no metaphor labels**. Teaching
content is definition-first: a 1–2 sentence definition followed by hierarchical bullets
(§2.1c), never a long paragraph; a bare definition outside the glossary is boxed. Concepts
are named with their proper classification, not a figure of speech — "hats" → functions,
"ladder" → the two-level system, "bites" → affects (only the *lab* keeps its name). See §2.1c.

What v2.20 adds: **the MILO is the sole contract for content shape**. The learning
outcomes decide whether a week is computational or analytical, and this binds **both source
types** — a `teaching` PDF and a `specification` (no-source) build. A calculation outcome
(compute/calculate/build/derive/solve) unlocks the Lab only when `"labs": true` (labs are
opt-in), plus Worked Examples, practice sets, and `step-solver`; an analysis outcome
(assess/judge/audit/identify/evaluate/critique/recommend/
compare) forbids all of them — a number may be quoted as evidence, but the student is never
asked to compute one. A calculation section no outcome demands is a phantom and is dropped.
See Part 2 and §2.2.

What v2.21 adds: **no build-provenance narration.** A notebook teaches the subject and
never narrates its own construction. No part may state where or how its text was authored
(`source: specification`/`teaching`, "authored", "not extracted", "carried no teaching
body", "written against the standards…", a `Sourcing.` box) — for **both** source types.
The `specification` declaration lives in the `SOURCE:` header of `src/full.txt` and the
opening message only (§Source types rule 4). Naming a real law/circular/textbook as the
source of a fact stays permitted. Backstopped by build.py's `provenance` rule (this prose
rule is the primary contract); see §9.1.

What v2.22 adds: **APA-7 citations and a References section in every build.**
Every fact, definition, or number that comes from a document carries an APA-7
in-text citation — `(Author, Year)`, `Author (Year)`, `(Author, Year, p. 12)`,
`(Author et al., Year)` — and every build ships a generated `references`
section (last, id `references`, `.refs` hanging-indent list) whose entries are
APA-7. Each section agent writes inline citations plus a sidecar
`parts/NN-<id>.refs.json`; `build.py` merges the sidecars (or a monolith
`refs.json`), renders the block from the mandatory `outline.json` entry, and
fails the build when an in-text citation has no entry, an entry is never cited,
or no citations exist. A plain-text DOI/URL is allowed **only** inside the
generated References block; a URL anywhere else still fails. See §2.7.

What v2.23 adds: **citations come from real, recent published works, never the
handout or syllabus.** Every cited work must be a real, published work by a real author,
located and verified by **web search** (search/fetch is allowed). The lesson
source document, the input handout, "Course handout", "Course syllabus", the syllabus /
course outline / specification source, and the notebook's own
`src/` prose are never reference entries. Cited works must be **2021 or newer**,
except (a) a primary legal/standards document cited in its current in-force
version and (b) the foundational work that introduced a theory or concept (its
originator and original year). When no real work can be found for a fact,
definition, or number, the claim is rewritten or the item dropped — no citation
means it does not ship. See §2.7.

What v2.24 adds: **the local-context anchor (§2.8).** Every generated or converted
lesson ships in a Philippine setting by default: peso (₱) amounts in the prose, worked
examples, activities, and practice sets; real Philippine institutions and scenarios; and
**government agencies, statutes, regulations, and official statistics always Philippine**
(BSP, SEC, BIR, DOH, DepEd, CHED, PhilHealth, PSA). Cited works outside that
government/legal class may be by any author of any nationality. The setting is written as
the unmarked default — never "in the Philippines" — and the anchor **yields to the MILO**:
when the lesson's subject is itself a foreign system, keep the real subject and flag the
conflict in the opening message (§8).

What v2.25 adds: **the clarity gate (Part 5).** The `average-student-checker`
skill reads a build's teaching prose **one paragraph at a time** for an average
student, through two lenses — **Dense** (too much packed into one paragraph) and
**Unclear** (a term undefined, a prerequisite missing, an unresolvable referent,
an abstraction with nothing concrete) — and for each flagged paragraph names a
fitting **visual** that reduces it (bullet hierarchy, mindmap/concept map,
comparison table, figure/graph/timeline, flow diagram, card split, annotated
diagram). Its tool, `paragraphs.py <built.html>`, prints each paragraph's
section id, ¶ordinal, box, and word count so a finding points at an exact span; a
built notebook puts each section on one line, so line numbers are not anchors.
The skill runs **standalone on any built lesson `.html`** (including the old
lessons being updated) and as the pipeline's clarity QA pass. It reports; it
never edits — the fix is applied on request.

What v2.26 added: **the per-section clarity review (Part 4, step C2).** The
`average-student-checker` ran as a **separate reviewer agent per content
section**, after the section agents wrote their parts and **before assembly** —
never the author, never the main session. One reviewer per section, seeing only
that section's own part, returned the checker's report (two lenses, a visual cure,
a verdict). A `Dense` or `Unclear` paragraph went back to the section's **own
author** to apply the fix, then was re-checked, until the section was a `CLARITY
PASS`; only then did the build assemble. This historical pass is superseded by
v2.32: there is no LLM clarity sweep, `prose_lint.py` owns the mechanical gate,
and the term checks run in C2 with the glossary.

What v2.27 added: **bold key terms, and a formatting check.** A key term — a term
with a glossary entry — is **bold on its first use inside each content
section** (§2.1d), so a skimming student has a landmark; *italic* marks a term
being defined, emphasis, a foreign phrase, or an APA title, and **underline is
banned**. The section-agent brief carries the rule, and the `average-student-checker`
gained a **formatting check** alongside its two clarity lenses: its tool printed
each paragraph's bold/italic spans and the notebook's glossary terms, and an
**UNFORMATTED** finding named a key term used for the first time in a section but
not bold. In v2.26 that check needed the assembled file and ran after the Part 5
pass. v2.32 supersedes that placement: the term checks now run in C2, with the
glossary data file passed to `prose_lint.py`.

What v2.28 adds: **the syllabus is never cited and never referenced.** On a
`specification` (syllabus/outline) build the syllabus names the outcomes and
content titles but carries no teaching body, so it is not a source of any
fact, definition, or number. No in-text citation may point to the syllabus,
course outline, week plan, "Course syllabus", or the input specification
document, and no such document may appear as an entry in the generated
`references` section. Citations resolve only to the real, recent external
works the content was authored against (§2.7). The syllabus is named in the
opening message and the `SOURCE:` header only — never in the notebook prose,
never in `refs.json`.

What v2.29 added: **write short first, and a lighter final pass.**
The **prose budget** (§2.1e) made the section agent write the clarity reviewer's cure
into the first draft — one idea per paragraph, a sentence under ~30 words, no
definition + example + caveat stack, and a visual rendered at the moment the content
enumerates, compares, or sequences — so the per-section C2 review confirmed the shape
instead of requesting it. Because C2 had already run **both** lenses on every content
section, the Part 5 pass over the assembled file no longer re-ran the **Dense** lens
(re-flagging density there only re-opened a section C2 already cleared); it kept
**Unclear** and the bold-term **formatting check**. v2.32 retires that final pass
outright: there is no LLM clarity sweep, `prose_lint.py` owns the mechanical gate, and
the term checks run in C2 with the glossary. Two `paragraphs.py` flags still lint the
budget before a human reads it: `--max-words N` lists over-budget paragraphs, and
`--max-sentence-words N` pairs each long sentence with the **visual** that carries its
structure — the visual replaces the words, so the fix is a picture, not a longer split.

What v2.30 adds: **the graph-reading assignment (`"assignment": "graph"`).** A fourth
assignment mode beside the default mixed deck, the flat deck, and the DAG: **ten multiple-choice items,
each pairing a short written situation with the diagram it asks about.** The diagrams
live in the deck's own `figures` bank, so one drawing is defined once and named by the
items that read it, and **every drawing carries a legend** — a `{label, token, mark}`
key rendered as HTML under the figure (`.lna-legend`), not baked into the SVG, because
text inside a drawing scaled to the column shrinks out of legibility on a phone. The
component renders the situation, then the figure, then the legend, then the question,
and the exported row carries `situation` + `figure` so the teacher sees what the
student was shown. `build.py` validates the mode (10 items, all `mc`, every `figure`
naming a bank entry, each bank entry an object with a valid inline `<svg viewBox>` **and
a non-empty legend** whose tokens come from the chart family and whose labels are unique
and non-empty, ≥3 distinct figures read, four distinct choices within ±1 word, `ans`
0..3, no answer position over 4×, no "all of the above"), strips `ans` from the student
data, and writes the deck — figures and legends included — into the teacher key.
Authoring law is `skeleton/graph-craft.md`, whose defining rule is the **graph-reading
test**: delete the figure and the item must become unanswerable, or it is prose recall
wearing a picture. Its blueprint adapts the flat rule because 10 items and 2 MILOs make
"≥2 per MILO, none >30%" arithmetically impossible: **≥3 items per MILO, none above 7.**
Because a figure is a box that can overflow with text in it, the mode ships with a
rendered gate: `deck_layout_smoke.js` now measures the graph deck — legend wrapping
included — at desktop, tablet and phone widths, and `assignment_smoke.js` walks it. The
flat and DAG decks are untouched.

What v2.31 adds: **honest citations.** A note that failed the Week 7 citation pass
produced four rules now enforced. (1) **No self-reference** — a lesson/handout/course
code is never cited as its own source; for a `teaching` source that names no work,
each standard concept is attributed to the real published work that owns it, or the
citation is omitted (the old "cite the lesson source document" fallback is deleted).
(2) **Attribution is earned** — a citation attaches only to a statement its author
actually made, never to a chain paragraph or a lesson-invented example. (3) **Route to
the owner** — cardinal TU/MU and the MU-per-dollar rule → a cardinal-utility text;
ordinal/cardinal + surplus + deadweight loss → intermediate micro; value in use/
exchange → Smith (1776). (4) **Placement** — citations live only in teaching sections
plus one per glossary term; never in Overview, Recap, Assignment, or activity data.
`build.py` now decodes HTML entities in the citation scan (so `&amp;` cannot hide a
citation) and fails an in-text citation found in an exempt section. See §2.7.

What v2.32 adds: **lean orchestration.** Labs are opt-in (`"labs": true`); the
default build uses practice sets and activities. A deterministic
`tools/prose_lint.py` owns the Dense budget, the bold key term, and the
`Where:` gloss; `build.py` fails on those. One merged reviewer per qualifying
section replaces the separate clarity and numeric reviewers, and it runs only
when the lint emits a review shortlist or the section carries math. The final
LLM clarity sweep is gone. A shared `refs.json` pool is built once and merged by
`ref_signature`. The DAG track runs in parallel with the content authors, and
Section 7 no longer authors `nodes[]` twice.

What v2.33 adds: **the error-check + multi-select assignment (`"assignment": "error"`).** An opt-in Section 7 deck of 12 error-check items (`err`: pick the verbatim span that makes a statement false) plus 8 multi-select items (`multi`: check every option a prompt names), with no short-answer items. Authoring law is `skeleton/error-craft.md`; every `err` choice is a whole-word span copied from its statement, at least three correct spans run 4+ words, and the correct span is the unique longest in at most 4 of 12 items. The deck is a single author — no level fan-out.

What v2.34 adds: **comprehension-check activities only, ten items, medium difficulty.**
Every teaching section ships exactly one activity labelled
`data-activity="comprehension check"`. The label is allowed only on `mcq`,
`true-false`, `identification`, `sort-statement`, `ranked-statements`, or
`case-match`, and each mount carries exactly 10 items at medium difficulty.
`feasibility-gate` and any PASS / MARGINAL / FAIL judgment are removed from the
skill and must never ship. Calculators (`*-lab`), `step-solver` practice sets,
`comparison-table`, `glossary`, `milo-list`, and `flipcards` remain teaching
visuals: they never carry the Activity label.

What v2.35 adds: **display formulas fit the phone column.** A wide MathML equation
used to sit in its own scroll box, so on a phone it looked cut off with no cue. The
app layout now runs a `fitMath` pass on load, section change, resize, and present
reflow: it shrinks an over-wide display equation until the whole formula is visible
(floor 10.5px), and only a formula that still cannot fit pans, marked
`.ln-math-scroll`. Paragraphs carrying MathML are set left, so justifying a line no
longer stretches the words around an inline formula into rivers. `layout_smoke.js`
now fails a formula that is silently truncated inside its own box.

What v2.36 adds: **the 60-minute content budget.** Every lesson's teaching content is sized for one 60-minute class by default. `tools/pacing_lint.py` prices the content — ordinary prose at 130 words/min, calculation blocks (MathML, `Where:` lists, `Worked —` steps) at half weight — and never budgets mounted activities or the assignment deck; `build.py` fails a build whose content estimate exceeds the budget and writes `pacing-review.json` next to `prose-review.json`. Per-section caps are 1,500 weighted words (teaching) and 450 (Overview, Glossary, Recap). A genuinely longer class pins `"minutes"` in `build.json`. See §2.3.

What v2.37 adds: **the mixed objective assignment (`"assignment": "mixed"`), now the default.** Section 7 is 10 multiple-choice items (`mc`) + 8 true-or-false items (`tf`) + 2 multi-select items (`multi`), 20 in all, with no short-answer items. Authoring law is `skeleton/mixed-craft.md`: `mc` choices sit within ±1 word of each other and no answer position is used more than 3 times; `tf` statements are single-flip near-misses with at least 3 true and 3 false; each `multi` prompt names its target and its correct set never dominates the option lengths. Omitting `"assignment"` now selects mixed; the error-check (`"error"`), DAG (`"dag"`), flat (`"flat"`), and graph (`"graph"`) decks are opt-in. A lesson written for the v2.33 error default must now pin `"assignment": "error"`.

What v2.38 adds: **the citation-search caps.** All reference web-searching happens once, at Wave 0: the orchestrator builds one `refs.json` pool of verified works — at most 6 searches, capped at 12 distinct works — and section agents cite from the pool without searching. An author whose claim's true owner is missing from the pool gets at most 2 fallback searches, with anything found landing in that section's own sidecar. `build.py` now fails a build whose pool exceeds 12 works, whose section sidecar carries more than 6 refs, or whose sidecar holds more than 2 out-of-pool works. See §2.7 and Part 4 Wave 0.

What v2.39 adds: **content-kind colour coding.** Every `.def` now carries `data-kind` (`concept`, `formula`, `example`, `caution`, `insight`, or `neutral`). The shell maps each kind to one fixed pastel fill, spine, and tag colour, so the same hue means the same thing in every lesson and every theme. Notes follow the same semantics: CAUTION/limitation is amber-red, TRY IT/application is clay, INSIGHT/NEXT is green. `build.py` fails a `.def` with a missing or unknown kind. See `skeleton/shell.html` (palette and print rules) and the hard rules in Part 2.

## When to use

Trigger when ALL are true: user supplies lesson/course material with concepts to teach,
and asks for "interactive", "notebook", "self-contained", or similar.
Do NOT trigger for marketing pages, dashboards, single-topic explainers without pedagogy.

## Inputs required

### Source types — name the kind before you build

A source is either **`teaching`** or **`specification`**. They need different
handling, and guessing wrong is the one error no mechanical check catches: the
whole of Part 9 rests on "this fact came from the source", and for a
specification source *you* are the source. Decide in the first minute, and say so
in the opening message (§8).

| | `teaching` | `specification` |
|---|---|---|
| What it looks like | a handout, PDF, slides, or chapter **that contains the lesson** | a syllabus, course outline, or week plan that **names what the week must cover but carries no teaching content** |
| Tell | prose you can slice per subsection | outcome statements + a list of content titles, and no body |
| Part 9 evidence | the source text itself | **your citations** (below) |
| Default | yes | only when the source really is a syllabus/outline |

**`teaching`** — nothing changes. Extract, slice, and Part 9 reads as written.

**`specification`** — four rules.

1. **The outcomes are the spine.** Each outcome statement (MILO / CLO / intended
   learning outcome) goes into `source_titles` verbatim, alongside the syllabus's
   content titles. Every notebook section must trace to at least one of them in
   `from[]`, and a title that is neither mapped nor dropped fails the outline
   contract exactly as it would for a teaching source. An outcome with no section
   and no drop is an untaught outcome — a hard stop.
2. **Author the teaching text first, and cite it.** Before any section agent runs,
   write the lesson's actual content into `src/full.txt` and split it per mapping
   into the `src/<id>.txt` slices. That file is *authored*, not extracted — so it
   carries a `CITATIONS` block, and **every fact group gets a real external
   reference**: a circular number, a standard clause, a regulation section, a
   statute, a page of a textbook. Something that resolves to a document a student
   could look up, found and verified by web search, per §2.7 (real author, 2021+
   with the primary-source and foundational-theory exceptions; the searching
   itself is the lesson's one Wave 0 pool build — §2.7, Part 4). A citation that
   points back at your own prose is not a citation. The syllabus itself is never cited (v2.28).
   Those references are what Part 9 now audits instead of the source text.
   They also reach the shipped HTML as APA-7 entries in the generated
   `references` section (§2.7).
3. **Suppress the source's activity columns.** A syllabus normally prescribes
   Suggested Learning Activities and Course Assignments/Assessments. These
   **conflict with the skill's component model** and are dropped by default: the
   mounted components are the activities. Keep them only if the user asks. Record
   the drop in the opening message. (A syllabus's *Learning Evidence* /
   *performance-based* columns are different — those are graded deliverables, not
   in-class activities; cite them in the assignment section, do not build them.)
4. **Flag the gap in the opening message.** One line: the source named the week's
   coverage and carried no body, so the content was authored against the standards
   the outcomes name. Never present authored content as if the syllabus supplied it.
   The flag lives in the opening message only — **never inside the notebook**: no part
   (`sections.html` / `data.js`) may state where or how the content was authored.

The MILO-blueprint rules in the assignment (`mixed-craft.md`, `question-craft.md`, `error-craft.md`, `dag-craft.md`, `graph-craft.md`)
are unaffected: in a specification source the outcomes are the *only* blueprint you
have, so map layers to outcomes deliberately.

| Input | Default if unspecified |
|---|---|
| Lesson source | required — and **say which kind it is** (§Source types): `teaching` (default) or `specification` |
| Visual design | **you pick a theme pack + tune it** from the source's subject (§1.2) |
| Assessment | Encrypted collect-only assignment, **10 mc + 8 tf + 2 multi-select by default** (`"assignment": "mixed"` or omitted) — Section 7 is 20 objective items (10 multiple-choice, 8 true-or-false, 2 multi-select), no SA, per `skeleton/mixed-craft.md`. Opt-in: error-check (`"assignment": "error"`, 12 `err` items (pick the verbatim span that makes a statement false) + 8 `multi` items per `skeleton/error-craft.md`); DAG (`"assignment": "dag"`, one branching scenario per `skeleton/dag-craft.md`, budget defaulting to `{"levels": 5, "max_nodes": 16}` and overridable via a `dag` block); flat (`"assignment": "flat"`, 18 fixed + 2 or more situational items — 10 mc · 4 tf · 4 id · 2+ sa — per `skeleton/question-craft.md`); graph (`"assignment": "graph"`, 10 figure-reading mc items per `skeleton/graph-craft.md`). A lesson written for the v2.33 error default must pin `"assignment": "error"` in build.json. Marked by the teacher from the decrypted key file; time-locked to a weekday window (default Wednesday Asia/Manila; "window" in build.json). |
| Numeric entry | currency symbols, commas, decimals, with tolerance (shipped in LN.num) |
| Currency symbol | **₱ peso** by default (local-context anchor, §2.8); follow the source only when the lesson is inherently non-Philippine |
| Output size | scale to source (§2.3) |

## Part 1 — The pipeline (read once per lesson)

### 1.1 The contract and the parts

Workdir: `build/<lesson-slug>/`. The main session writes exactly:

| File | Contents | Written by |
|---|---|---|
| `build.json` | title, theme, layout, components list, output name (+ optional extra_css/extra_js) | main |
| `tune.css` | `:root{ --token: value; }` overrides only — colours, display voice. 10–25 lines | main |
| `outline.json` | **the anti-phantom contract**: verbatim source titles + notebook sections | main |
| `parts/NN-<id>.sections.html` | one notebook section's teaching content + mounts | its section agent |
| `parts/NN-<id>.data.js` | that section's activity content (`LN.data.<key> = {...};`) | content sections: its section agent; a DAG assignment section: the parallel D2 track (Part 4) |
| `parts/NN-<id>.refs.json` | that section's cited works (`{"refs":[{"key","text"}]}`, APA-7) | its section agent |

Then run: `python <skill>/build.py build/<lesson-slug>` — it merges `parts/` in filename
order into the sections/data slots (monolith `sections.html`/`data.js` still accepted as an
alternative; never both), checks the outline contract, and refuses to write the output
unless every mechanical check passes (exit 1 + itemized report: rule, file, line, fix).
**Run it from the folder where the notebook belongs**: the finished `.html` (and only it)
lands in the current directory, never in the workdir — work files (`build.json`, `tune.css`,
`outline.json`, `parts/`) stay under `build/<slug>/`. Loop: fix the parts, rerun, until `OK`.

**Editing an existing notebook (v2.18).** To revise a lesson that is already built, never
touch the assembled `.html`. Audit `parts/` and the `src/` slices, author the change into the
owning `parts/NN-<id>.*` files (fresh activity numbers, practice sets, figures —
§2.4/§2.4b/§2.5), then rebuild from the same workdir. Verify with `layout_smoke.js` (desktop
**and** `--width 390`), `assignment_smoke.js`, and the Part 5 judgments — including the
merged shortlist reviewer (Part 4, C2): one independent reviewer per qualifying section
checks clarity, numeric freshness, and arithmetic. There is no separate per-section
numeric reviewer.

`outline.json` schema — `source_titles` is every section/subsection title copied **verbatim**
from the source before any writing; every title must land in some section's `from[]` or in
`dropped[]`; a section's `title` is exactly what its `<h2>` must say:

```json
{
  "source": "Week 4.pdf",
  "source_titles": ["INTRODUCTION", "Fixed and Variable Costs", "Break-Even Analysis", "..."],
  "sections": [
    {"id": "overview", "title": "0  Overview & Outcomes", "from": ["INTRODUCTION"]},
    {"id": "stack",    "title": "1  Building the Quoted Rate",
     "from": ["Fixed and Variable Costs", "Break-Even Analysis"]}
  ],
  "dropped": ["REVIEW QUESTIONS"]
}
```

Enforced by build.py: no shipped `section.block` whose id is not in `outline.sections`
(phantom), no outlined id missing from the build (dropped), one `<h2>` per block and its
text must equal the outline title (drift), every `from`/`dropped` string must be verbatim
from `source_titles` (phantom source), full source-title coverage, unique `LN.data` keys.

`build.json` schema:


```json
{
  "title": "Week 4 — Feasibility Analysis",
  "theme": "parchment",
  "layout": "sheet",
  "components": ["sort-statement", "break-even-lab", "true-false", "flipcards"],
  "labs": true,
  "minutes": 60,
  "output": "Week4-Notebook.html",
  "extra_css": "optional/extra.css",
  "extra_js": "optional/extra.js"
}
```

`minutes` is the **content** budget the pacing gate (§2.3) measures against: default
`60`, so omit it for a normal class. Mounted activities and the assignment are not
part of it. Pin `"minutes": 90` only when the user says the session is longer — never
to make over-written content fit.

### 1.2 Pick the theme and pick the layout

Four visual packs (`skeleton/themes/`):

| Pack | Reads as | Good for |
|---|---|---|
| `parchment` | aged manuscript, sepia ink, folio numerals | history, law, philosophy, theology, literature, heritage |
| `opal` | airy wellness app, rounded cards, teal-coral | nursing, health, education, soft skills, intro business |
| `studio` | editorial magazine spread, serif display, one accent | analytics, marketing, finance, design, everything data-flavoured |
| `ledger` | green-bar ledger paper, red margin rule, tabular | accounting, finance, bookkeeping, audit |

**Layout packs** (`skeleton/layouts/`), orthogonal to the theme. All four
shells still ship, but every build uses `app`:

| Layout | Reads as | Status |
|---|---|---|
| `app` | thumb bottom-bar, one section at a time (swipe disabled) | **pinned — always use this** |
| `desk` | sidebar + section tabs, wide sheet | retired (kept in skeleton only) |
| `feed` | section hub of cards | retired (kept in skeleton only) |
| `sheet` | continuous reader + bottom-sheet lab | retired (kept in skeleton only) |

Record `"layout": "app"` in `build.json`. If omitted, `app` is used; any other
value fails the build.

`parchment` is the default pick; otherwise choose the closest pack. Then
in `tune.css` retune **token values only** from the
lesson's own nouns (accent from the anchor's colour, display voice, tracking).
Textures and `.decor` motifs stay the pack's. `tune.css` containing any structural rule
(`.card{...}`) is rejected by the build.

No subject fits (e.g. an unusual lesson)? Derive a skin by hand into `tune.css` — set
every colour token, nothing structural — and note in the opening message that the result
is a candidate for a 5th pack (§3.3).

### 1.2b Layout is pinned to `app`

No auto-select. Every lesson ships the `app` shell (thumb bottom-bar, one
section at a time; swipe disabled) regardless of section count, labs, or density.
Record `"layout": "app"` plus the one-line reason `pinned per v2.12` in the
opening message (Part 8). The old shape signals (lab → `sheet`, ≥8 sections →
`feed`, text-dense → `desk`, else `app`) are retired.

In the retired `sheet` shell the lab was a screen-only affordance: hidden at print.
(`app` prints the reading content normally.)

### 1.3 The mount pattern

Components render themselves from data. You never write their HTML or JS:

```html
<div data-component="sort-statement" data-key="week4sort"></div>
```

```js
LN.data.week4sort = { left: "Fixed cost", right: "Variable cost", items: [ ... ] };
```

Hard rules (all enforced by build.py):
- No hex colours in `sections.html` / `data.js` / component CSS — colours are tokens.
- No `http(s)://`, `@import`, or non-gradient `url()` anywhere. Textures are pure CSS.
- Every `section.block` has a unique `id`; no lesson id starts with `ln` (shell chrome).
- `data-key` names start with your section id (e.g. `stack` → `stacksort1`, `stackq2`) —
  keys must be unique across all parts; a duplicate is a parts collision.
- Inside `data.js`/`extra.js` never write a literal `</` + letter (breaks the script tag);
  escape as `<\/` or pass plain text and let components use textContent.
- Mount only registered components (list in build.json; schemas in the registry).
- In component/extra CSS every grid `fr` track must be clamped as `minmax(0, Nfr)`
  (and grid children given `min-width:0`): a bare `1fr` track refuses to shrink below
  its child's min-content (svg, `min-width` table) and blows out of the sheet. Enforced.

Shell-owned chrome you must NOT write: sidebar TOC, scroll-spy, progress bar, mobile
drawer, reset button, error banner, print stylesheet. They appear automatically from the
`section.block` + `data-component` conventions.

### 1.4 Shell marker reference (do not read shell.html beyond this table)

| Marker | Injected with |
|---|---|
| `__TITLE__` | title from build.json (HTML-escaped) |
| `/*__THEME__*/` | chosen pack, verbatim |
| `/*__TUNE__*/` | your tune.css, after the theme |
| `/*__COMPONENT_CSS__*/` | selected components' CSS only |
| `<!--__SECTIONS__-->` | your `sections.html`, or `parts/*.sections.html` merged in |
| `/*__DATA__*/` | your `data.js`, or `parts/*.data.js` merged in |
| `/*__COMPONENT_JS__*/` | selected components' JS + init glue |
| `/*__LAYOUT_CSS__*/` | `layouts/<layout>/layout.css` |
| `<!--__LAYOUT_CHROME__-->` | `layouts/<layout>/chrome.html` |
| `/*__LAYOUT_JS__*/` | `layouts/<layout>/layout.js` |
| `__LAYOUT__` | layout name, into `<body data-layout="…">` |

The assembled file is a **read-only product**: fixes go to the parts, then rebuild.

### 1.5 Layout containment — a box grows with its text

Text must never escape or be clipped by its box. Size every container to its content;
`min-height` is a floor, never the height. This governs component CSS (`skeleton/components/*/component.css`)
and any §3.3 hand-written element or `extra.css`.

**Stacked faces → grid-stack, not absolute.** When two or more faces share one box
(front/back of a card, an overlay that carries text), lay them in one grid cell so the
container sizes to the tallest face:

```css
/* faces overlap in one cell; the box grows to fit the longest */
.box-inner{display:grid}
.box-face{grid-area:1/1;min-width:0}
```

**Why:** `position:absolute;inset:0` faces take the container's size and contribute no
height, so a fixed `min-height` becomes the ceiling — the longest text spills out. The
Week 9 recap shipped exactly that: `.fl-face{position:absolute;inset:0}` in a
`min-height:110px` box, answers overflowing 14–37px past the tile. `overflow:hidden`
is not the fix — it hides the text instead of showing it. Content-sized stacking is.

**Overlays that must bleed** (a decorative watermark, a full-bleed cover with no flowing
text) are the one exception; they carry no text that can be cut off.

## Part 2 — Section architecture (content judgment — unchanged from v1.9)

**The MILO is the sole contract (v2.20).** The learning outcomes (MILO / CLO /
intended outcomes) decide the *shape* of the notebook before any content is written,
and this holds for **both source types** — a `teaching` PDF and a `specification`
(no-source) build alike. Read each outcome's verb:

- A **calculation** outcome (`compute`, `calculate`, `build`, `derive`, `solve`,
  `reconcile`, `work out`) → the week is computational: include the **Practice /
  Worked Method** section (§2.4), the Worked Examples (§4), and a `step-solver`
  practice set (§2.4b) as the default. Mount `break-even-lab` or any other
  `*-lab` **only when `build.json` has `"labs": true`** — labs are opt-in and off
  by default.
- An **analysis** outcome (`assess`, `judge`, `audit`, `identify`, `evaluate`, `critique`,
  `recommend`, `compare`, `describe`) → the week is analytical: **no formula, no worked
  arithmetic, no calculator, no `step-solver`, no practice set.** A number may be quoted as
  evidence, but the student is never asked to compute one.

A calculation section that no outcome demands is a phantom section and is dropped, exactly
as an unmapped source title is. If the outcomes mix both, ship the calculation machinery
**only for the outcome that names it**. The MILO wins over the source: a source full of
formulas still ships analytical if no outcome asks the student to compute.

Every lesson gets the structure below, but rows 3–5 exist **only when a MILO requires
computation**:

| # | Section | Always includes | Interactive element |
|---|---|---|---|
| 0 | Overview & Outcomes | title, "how to use", MILO list | `milo-list` |
| G | Glossary (§2.0) — between Overview and Section 1 | one-line definition of every technical term used anywhere | `glossary` |
| 1 | Concept A vs Concept B | definitions, purpose, comparison | `sort-statement` (10 items) + `comparison-table` |
| 2 | Framework / Domains | one definition box + case per domain | `mcq` / `true-false` / `identification` (10 items) |
| 3 | The Practice / Worked Method | formula + `Where:` list, method (§2.4) | `step-solver` practice set + one comprehension check (labs opt-in) |
| 4 | Worked Examples | every numeric example from the source, **worked in prose** (§2.4) | `step-solver` (practises the same numbers) + one comprehension check (10 items) |
| 5 | Sensitivity | operating leverage, what-if | prose + one comprehension check (10 items); optional lab |
| 6 | Limitations | where the technique fails | `ranked-statements` / `case-match` (10 items) |
| 7 | **Assignment** | Mixed (the default; no `"assignment"` key or `"assignment":"mixed"`): 10 mc + 8 tf + 2 multi-select items per `skeleton/mixed-craft.md` — each `mc` has four equal-length choices, `tf` is a single-flip verdict, each `multi` prompt names what to check; no SA. Opt-in: error-check (`"assignment":"error"`): 12 error-check items + 8 multi-select items per `skeleton/error-craft.md`; flat (`"assignment":"flat"`): 18 fixed + 2+ sa (20+ total) per `skeleton/question-craft.md` (mc easy·tf hard·id medium·sa split); DAG (`"assignment":"dag"`): one branching scenario per `skeleton/dag-craft.md`, level-fanout authoring; graph (`"assignment":"graph"`): 10 figure-reading items per `skeleton/graph-craft.md`. Hidden until begun; no reveal. | `assignment` |
| 8 | Recap | 6 flip cards + closing note | `flipcards` |
| 9 | **References** | one APA-7 entry per cited work, alphabetical, hanging indent | (generated — no mount) |

Each teaching section ships **one comprehension check**: a single mount of `mcq`,
`true-false`, `identification`, `sort-statement`, `ranked-statements`, or
`case-match`, carrying `data-activity="comprehension check"`, exactly **10 items**,
and written at **medium difficulty** (§2.4c). The shell prints the
**Comprehension check activity** tag; `data-activity="none"` opts out. Section 7 is the *Assignment* (collect-only,
never scored in-page).

**Section 3 is the centrepiece.** Give it the most space and the best practice
set (or an opt-in `"labs": true` calculator).

### 2.0 The Glossary section (mandatory)
Its own block right after §0, linked from the TOC (number it `0G`). A term earns a line if
it is *technical* and appears **anywhere** — exposition, prompts, feedback, quiz. Keep the
source's own phrasing, edited only for length. The `.def`/`.mini` boxes remain the
teaching exposition; the glossary is the lookup. Duplication is intentional.

### 2.0b Presentation tags (`data-present`)

Every teaching section (all except the canonical exempt ids `overview`,
`glossary`, `selfcheck` (also accept `self-check`), `assignment` (also accept
`assign`), `recap`, and `references`) marks the content a teacher would project with
`data-present="N"`. Two forms:

- `data-present="0"` on the section's `<h2>` — the **section title**. Present
  mode keeps it in normal flow (it is not pinned, sticky, or offset) and it is
  *not* a bullet; it does not count toward the depth sequence. Every teaching
  section must carry exactly one.
- `data-present="N"` (N ≥ 1) on content — the bullet depth (1 = the section's
  core concept/definition/formula, 2 = its key explanations/examples, 3+ = deeper
  support). The marker may sit on an inline `<span>`, a whole block (`.def`,
  `.mini`, `.card`, a table, a figure), or a component mount; a tagged element is
  kept whole, everything untagged hides in presentation mode.

**Every calculation must be tagged.** Tag each formula block (the `.def`/`.card`
carrying the formula and its `Where:` list) and each worked example (the
`Worked — <topic>` `.def` with numbered steps, and any tabular computation) at its
natural depth, so the arithmetic survives into the projected view.

`0` is only valid on the title `<h2>`. Depth may not skip a level; markers never
nest; the section root is never tagged. build.py fails a teaching section that
lacks its title marker or any content marker. See
`docs/superpowers/specs/2026-10-02-presentation-tags-v2.17-design.md`.

### 2.1 Melding outlined sources
When the source is Lesson → Section → Subsection with content only under subsections:
the **section is the unit of exposition** — one melded block per source section;
subsection titles never become notebook headings (bold lead-ins at most). Record the
mapping as each notebook section's `from` list in `outline.json` (every subsection title
the block draws on, copied verbatim from `source_titles`). Build the MILO
dependency list (per outcome verb: which terms, definitions, numbers, comparisons it
needs), cut everything not on a list, keep every listed fact intact.
**Default to `.def`/`.mini` (definition + labelled example) over flowing narrative**;
reserve prose for the connective tissue: every melded section opens with a two-to-four-
sentence chain paragraph leading from the previous answer to this question and closes
by handing off. **Terseness inside boxes, connection between them.** Hard floor: if a cut
leaves any MILO untaught or unexercised, restore content. Record the `Outline map` and
`MILO coverage` lines for the opening message (§8).

### 2.1c Content shape: definition + hierarchical bullets

Teaching content is **definition-first, then bullets** — never a long paragraph. For any
term or concept that needs *both* a definition and an explanation:

- Open with a **1–2 sentence definition** (a `<p>`).
- Follow with **bullets** that carry the explanation, in a **hierarchy that mirrors the
  concept** (function → category → item). A top bullet is a full sentence; a nested bullet
  is the item it lists.
- A bare definition with no explanation does **not** get bullets: put it in a box
  (`.def`/`.mini`) as a plain sentence. Keep flowing prose for the 1–2 sentence connective
  tissue only (the chain paragraph, the hand-off).

**Why:** source paragraphs are written for reading, not for memorising; students revise
from bullet hierarchies, and a wall of prose hides the classification the lesson is actually
teaching. Applies to prose, `.def`/`.mini`/`.note` bodies, the glossary, and quiz feedback
alike.

**No metaphor as a label.** Where the source (or a previous build) names a concept with a
figure of speech, replace it with the **proper classification** — the term a regulator,
standard, or textbook uses. "The BSP's two hats" → "The BSP's two functions: monetary policy
and financial supervision"; "the ladder" → the two-level system (standard-setter vs
supervisor); "where the framework bites" → "where the framework affects the bank"; "the
buffers are a cushion" → "buffers against a downturn". Keep a metaphor only where the
artifact is literally named for it — the **lab** (calculator) keeps its name. A metaphor may
illustrate in passing; it may never be a section title, a `.tag`, a glossary term, or a
component label. Sweep all four surfaces when converting: section prose/headings, box tags,
`data.js` content, and component copy.

### 2.1d Emphasis: bold a key term, italic for the rest

**Bold** a *key term* — a term with a **glossary entry** — the **first time it appears
inside a content section**, so the student's eye has a landmark to navigate by. Use
`<strong>` (`<b>` is equivalent). *Italic* (`<em>`) marks a term at the moment it is
being **defined**, genuine **emphasis**, a **foreign phrase**, a word used as a word, and
an APA **title/volume** (§2.7). **Never underline** — on screen it reads as a hyperlink.
The rule applies to prose, `.def`/`.mini`/`.note` bodies, glossary definitions, and quiz
feedback alike; the bold lead-ins of §2.1 stay bold. Only the **first** use in a section
is bold — later uses in the same section stay plain. **Why:** a wall of text hides its own
vocabulary; a bold term is what the skimming student finds, and it is the mark the
`prose_lint.py` gate and the shortlist reviewer verify is present.

### 2.1e The prose budget (write short first, then visualize)

Density is a property of the **paragraph**, and it is the one thing that sends a section
back through clarity review. Write to the budget the first time, so the per-section
review confirms the shape instead of requesting it (Part 4, C2):

- **One idea per paragraph.** A second distinct idea is a second paragraph — split it,
  never lengthen it. Two ideas in one block is the Dense signature the reader must
  untangle.
- **A sentence stays under ~30 words.** Past that, do **not** just split it — a sentence
  runs long because it is carrying a structure (a list, a contrast, a sequence). Give the
  over-budget sentence the **visual** that explains it (see the visual rule below): the
  picture replaces the words instead of rearranging them. Splitting at the conjunction
  (`and`, `but`, `while`, `so`) is the fallback only when no visual fits.
- **Never stack** a definition + an explanation + an example + a caveat in one block.
  Give the definition its sentence (or its box), the example its own, the caveat its own.
- **Render the shape, don't narrate it.** When a paragraph would enumerate items, compare
  two or more things, or walk a sequence/procedure, reach for the visual **while writing** —
  bullets for a list, a `comparison-table` for a comparison, a figure or flow for a
  sequence (§2.5, Part 3). The visual carries the structure; the prose only introduces it.
  This is the shortlist reviewer's **cure** table applied upstream.

**Why:** a paragraph with two ideas, a 40-word sentence, or a stacked
definition–example–caveat is what a skimming student re-reads and a projecting teacher
cannot show — and the fix is the same whether it is written now or flagged later. The
budget binds prose, `.def`/`.mini`/`.note` bodies, the glossary, and quiz feedback alike.
`python tools/prose_lint.py <built.html> --max-words 40` lists the paragraphs over budget
and `python tools/prose_lint.py <built.html> --max-sentence-words 30` pairs every long
sentence with the visual that replaces it, before a reviewer reads them.

The section as a whole has its own weighted-word cap (§2.3): **1,500** of teaching
prose, **450** in the Overview, Glossary, or Recap, with calculation blocks counting
half. The paragraph budget shapes each unit; the section cap keeps one section from
eating the content hour.

**Migrating an existing lesson (v2.32).** An existing workdir must pass
`tools/prose_lint.py` once before it can rebuild: split over-budget paragraphs and
bold the first use of each glossary term in every section (pass the glossary data
file in C2). The build fails until those checks pass. There is no bypass flag.

### 2.2 If no MILO asks for a calculation
Decided by the outcome verbs, not by whether the source carries numbers (Part 2).
Skip Sections 3/4; replace with ONE comprehension check from `ranked-statements`
(ordering), `sort-statement` (supports/contradicts), `case-match`, `mcq`,
`true-false`, or `identification` — 10 items, medium difficulty (§2.4c). Sections
5/6 may compress into the recap. Preserve 0, G, 1, 7, 8.
**Delete the calculation machinery outright** — no formula blocks, no `Worked —` steps,
no lab, no `step-solver`, no practice set, and no glossary term that exists only to support
a formula. A number may appear as evidence; the student is never asked to compute one.

### 2.3 The 60-minute budget — size the lesson content, not the activities

**Default: 60 minutes of lesson content.** The budget covers the teaching prose a
class reads and discusses — nothing else. Mounted activities and the assignment are
**not budgeted**: they never consume the hour, and they are never cut to make the
content fit. Budget the content at step B (Part 4), before any section agent runs,
and write each section its share in the brief.

Source-size guard (unchanged): ≤3 pages → sections 0, 1, core activity, 7, 8.
4–15 pages → full build. 16–40 → expand the case bank; the flat assignment always
carries its full set (18 fixed + 2 or more sa). **>40 pages → ask the user before
proceeding.** Never pad short lessons with empty sections.

How the content is priced (`tools/pacing_lint.py`; `build.py` enforces the total):

| What | Cost |
|---|---|
| Ordinary prose | **130 words/min** — a teacher talking it through with pauses |
| Calculation content | **half weight** — formulas, `Where:` lists, and `Worked —` steps are walked through and skimmed, not read aloud |
| Any mounted activity | **0** — reported for planning, never budgeted |
| The assignment deck | **0** — never budgeted, in every mode |

Per-section weighted-word caps: **1,500** in a teaching section, **450** in Overview,
Glossary, and Recap. Assignment and References prose is not counted at all.

A full calculation lesson spends the content hour roughly like this (59 min; the
word counts are **weighted** words, so a calculation block's raw words are double):

| Section | Content min | Weighted words |
|---|---|---|
| 0 Overview | 4 | 520 |
| G Glossary | 3 | 390 |
| 1 Concept A vs B | 11 | 1,430 |
| 2 Framework | 11 | 1,430 |
| 3 Practice / Method | 10 | 1,300 (calculation counts half) |
| 4 Worked Examples | 8 | 1,040 (calculation counts half) |
| 5 Sensitivity | 5 | 650 |
| 6 Limitations | 4 | 520 |
| 8 Recap | 3 | 390 |

An analytical lesson (§2.2) drops Sections 3–5 and gives the saved content time to
Sections 1, 2, and 6 — depth in the concepts the MILOs name, never extra sections.

**Over budget — cut content in this order and stop as soon as it fits:**
1. Prose the visual already carries (§2.1e): a table, figure, or bullet list that
   repeats the paragraph.
2. A whole section no MILO needs (§2.2) — the phantom section goes.
3. Worked examples beyond the source's own.
4. Prose that restates a definition the section has already given.
**Never cut to save minutes:** a mounted activity or the assignment deck. They are
outside the budget; cutting them does not buy content time.

**Under 75% of the hour — do not pad.** Deepen the lesson content the MILOs name
(worked steps, the missing figure §2.5, a case). An empty section or a longer
paragraph is not depth, and the fix is never an extra activity.

**Check it before announcing OK.** `python tools/pacing_lint.py <built.html>` prints
the per-section table, the content total, and the activity time it reports but does
not budget; `build.py` fails the build on the same estimate and writes
`pacing-review.json` beside `prose-review.json`. The two blocking rules are
`lesson_over_budget` (the content hour is full) and `section_over_budget` (one
section is too long); `lesson_under_budget` is a review to weigh. For a class that
really is longer than an hour (a double period, a workshop), pin it in `build.json`
— `"minutes": 90`. Only the user can ask for that; never raise the budget to fit
content you wrote.

### 2.4 The prose carries the math (calculation emphasis)
Every calculation, procedure, and formula in the source must appear **in the section
prose** — in `.def`/`.mini` boxes — not only inside a widget. Mounted activities never
stand in for the exposition. **Why:** students read, print, and skim notebooks, and they
skip activities — a calc that exists only inside a widget is simply missing from the
lesson. The prose is the cross-check against the source: recompute every worked example
and confirm the prose agrees with the source's numbers (a prose↔source mismatch is the
worst outcome: a student finds it mid-quiz).

**Activities use independent numbers (v2.18).** A *comprehension check* — one of the
answerable mounts (`mcq`, `true-false`, `identification`, `sort-statement`,
`ranked-statements`, `case-match`) — must **not reuse the lesson's example numbers**.
Any `step-solver` example or practice set obeys the same independence rule. Give each activity its own
parameter set, distinct from the prose and figures, so the student applies the method
instead of recalling the example (the Part 5 audit checks this). This supersedes the older
"practise the same numbers" rule: the *prose* matches the source, the *activities* do not
match the prose's numbers. Use these two shapes in the prose:

**Formula shape** — `<p>` with `<math display="block">FORMULA</math></p>`, then
`<p><strong>Where:</strong><br><math><mi>sym</mi></math> = definition;<br>…</p>` — one symbol
per line, semicolon-terminated, period on the last entry.
**Why:** symbols buried in a running sentence never map back to the formula; the
one-per-line list is the source textbook's own convention and is scannable at review time.
A formula set on its own line is `display="block"`; a formula inside a sentence or a
`Where:` line is plain `<math>`. Formulas are MathML, never `<code>` — see §2.6.

**Worked shape** — `<div class="def"><span class="tag">Worked — <topic></span>` with
numbered steps as `<p><strong>n. Step name</strong> — …</p>`, math in `<math>`, each
result wrapped as `<mrow class="hl">…</mrow>` *inside* the `<math>`, and tabular computations
in `<div class="cmp-wrap"><table class="tbl">`.
**Why:** students reproduce steps, not answers — the intermediate arithmetic (PV rows,
weighted dates) is exactly where mistakes happen and what a one-line result hides;
`<mrow class="hl">` gives a visible checkpoint to verify against, and `.cmp-wrap` sizes a
wide table to the screen: it sets `min-width:250px`, and on phones (`max-width:600px`)
the table fills the column with `table-layout:fixed` so cells wrap instead of forcing a
sideways scrollbar. A step that previously read
`<code>TC = </code><span class="hl">190</span>` becomes one expression —
`<math><mi>TC</mi><mo>=</mo><mrow class="hl"><mn>190</mn></mrow></math>` — so the highlight
lands on the number instead of dangling after a bare equals sign.

**Objective + situation (v2.18).** Each formula/worked block is opened by a short
**Objective** note: what the number measures and why it is computed (e.g. "MU tells us when
total utility stops rising"; "MU per dollar puts goods of different prices on one footing").
Every abstract example also gets a named **situation** so its numbers mean something. Naming
an illustrative context is allowed; inventing *numbers* is not — §9.1 still binds the values.

### 2.4b Practice sets (calculation lessons)
Every section that teaches a calculation ships a **practice set**: 4–6 independent numeric
problems, practice-only (never graded), mounted as one `step-solver` whose data is an
**array of examples**. A practice set is a teaching tool, not the section's comprehension
check: it carries no Activity label.

```js
LN.data.<key> = [
  { title: "Practice 1 - …", story: "…the situation…",
    steps: [{ q: "…", a: <number>, tol: 0.01, pre: "$", unit: "units" }],
    solution: "…the worked answer…" }, …
];
```

Rules: answers **rounded to two decimal places** with `tol: 0.01`; the numbers are
independent of the lesson's examples (and varied across problems); each `solution` shows the
arithmetic. For optimal-bundle items choose a budget that lands on a ratio equality point,
or word the check so indivisible units do not break it. See `skeleton/practice-craft.md`.

### 2.4c Comprehension checks (one per section, 10 items, medium)

Every teaching section (all except `overview`, `glossary`, `assignment`, `recap`,
`references`) ships **exactly one** comprehension check. It is the section's
Activity and it obeys four hard rules:

| Rule | What ships |
|---|---|
| Allowed components | `mcq`, `true-false`, `identification`, `sort-statement`, `ranked-statements`, `case-match` |
| Count | **exactly 10 items** (`mcq` questions, T/F statements, identification prompts, sorter placements, ranked claims, matched scenarios) |
| Difficulty | **medium** for every item — not easy recall, not the assignment's hard tier |
| Label | `data-activity="comprehension check"` on the mount |

**Banned:** `feasibility-gate`, and any activity that asks the class to render a
PASS / MARGINAL / FAIL verdict. Do not mount it, do not relabel it, do not
hand-write an equivalent judgment widget in `extra.js`.

The three quiz formats are interchangeable per section: pick the one that fits
the concept. `mcq` tests recognition of the right rule, `true-false` tests a
situational near-miss, and `identification` asks the student to name the term
from its description. Sorters, rankings, and scenario matchers are also
comprehension checks — they test classification, ordering, and recognition.

**Medium, not easy.** An item is medium when the student must apply the section's
idea to a fresh situation or discriminate between two near-miss options — not
when it asks for a definition copied from the prose, and not when it requires the
assignment's multi-step or edge-case reasoning. Every wrong pick's feedback names
the slip (the `e` field where the component supports it).

**One mount, ten items.** Do not split a section's check across two components
(a 5-item MCQ plus a 5-item T/F is two activities, not one). Do not pad a
7-item set with trivia to reach ten; write ten medium items that each test the
section's MILO. A section with fewer than ten teachable points is a signal the
section is too thin, not a licence to ship fewer items.

**Teaching visuals stay unlabelled.** Calculators (`*-lab`), `step-solver`
practice sets, `comparison-table`, `glossary`, `milo-list`, and `flipcards`
support the lesson but are **not** comprehension checks: they never carry
`data-activity="comprehension check"`. A section may mount both a teaching visual
and its one comprehension check.

### 2.5 Draw the missing figure
When a section's concept is inherently a graph — a curve (yield, term structure), a
cost/volume/profit line, a distribution, a payoff or timeline — and the **source has no
figure for it, draw one.** The graph plots the source's own numbers only: points come from
the source's tables or from values computed by the source's formulas in §2.4, on labelled
axes; the picture must agree with the prose.
**How:** static figure → inline `<svg xmlns="http://www.w3.org/2000/svg" viewBox="…">` in
sections.html; colours only as token references in presentation attributes
(`stroke="var(--chart-axis)"`, `var(--chart-grid)`, `var(--chart-label)`,
`var(--chart-rev/-cost/-profit/-loss)` — no hex, no `<style>`); axis tick labels are
`<text>` elements. Interactive figure → a hand-written component via §3.3, rendered from
`LN.data`.
**Why:** the handout's missing picture is exactly the sketch students must reproduce in
exams; §9.1 bans inventing *numbers*, not depicting the numbers already taught.

### 2.6 Formulas are MathML, not `<code>`
Every formula, symbol reference, and computed intermediate is hand-authored MathML. A
`<code>` span renders monospace ASCII (`MC = ΔTC / Δq`) and is not typeset math; build.py
does **not** convert plain text to MathML, so a lesson written with `<code>` formulas ships
with no MathML at all. Weeks 7 and 8 ship MathML and are the reference.

**Vocabulary — no other elements.** `<mi>` identifier (a multi-letter symbol like `AFC`,
`TC`, `TVC` goes in **one** `<mi>`), `<mn>` number, `<mo>` operator, `<mtext>` prose inside
math, `<mfrac>` fraction, `<msub>`/`<msup>`/`<msubsup>` scripts, `<mrow>` grouping,
`<mrow class="hl">` highlighted result. Banned: `mathvariant`, `mstyle`, `semantics`,
`annotation`, `msqrt`, `mtable`, `mfenced`, `mspace`, `munder`, `mover`.

A slash is always a real stacked fraction, and **any fraction or script argument with more
than one token must be wrapped in `<mrow>`** or the bar will not span it:

    AFC = TFC / q     ->  <math><mi>AFC</mi><mo>=</mo><mfrac><mi>TFC</mi><mi>q</mi></mfrac></math>
    MC = ΔTC / Δq     ->  <math><mi>MC</mi><mo>=</mo><mfrac><mrow><mi>Δ</mi><mi>TC</mi></mrow>
                                <mrow><mi>Δ</mi><mi>q</mi></mrow></mfrac></math>
    TC_q              ->  <math><msub><mi>TC</mi><mi>q</mi></msub></math>
    TVC_(q-1)         ->  <math><msub><mi>TVC</mi><mrow><mi>q</mi><mo>−</mo><mn>1</mn></mrow></msub></math>

`display="block"` for a formula that is alone on its line; plain `<math>` inside a sentence
or a `Where:` line. One `=`/`≈` per line — never a chain (§9, "One equality per line").

**Two traps that each cost a debugging cycle.**

1. **Write non-ASCII operators literally, not as numeric character references.** `&#916;`
   (Δ), `&#8722;` (−), `&#8776;` (≈) and `&#215;` (×) are 3–4 hex digits after a `#`, which
   is exactly the shape of a hex colour. Use the characters themselves: `Δ` `−` `≈` `×`
   (build.py's `HEX_RE` now ignores `&`-prefixed refs, but literal characters are what
   Weeks 7–8 ship and cannot be misread).
2. **Do not put `<math` in a CSS comment.** Layout and theme CSS is inlined verbatim into
   the notebook, so the literal tag text ends up in the shipped HTML and corrupts any tool
   that counts elements. Write "MathML", not "<math>".

**Verifying a conversion.** `<code>` and `<math>` counts, and every digit preserved. Strip
all math from the built HTML and diff the remaining prose against the pre-conversion build:
a pure notation change shows **zero** prose differences. A real parser check is better than
counting tags — feed each `<math>…</math>` to an XML parser and confirm it is well-formed
and correctly nested. `tools/layout_smoke.js` measures MathML specially: self-overflow is a
font-metric artifact there, so it checks column escape, clipping, and silent truncation
inside the formula's own scroll box. The app layout's `fitMath` pass shrinks a display
formula to the column at phone width; if it still cannot fit at the 10.5px floor the host
is marked `.ln-math-scroll` and pans, which is a signal to split the formula across lines
rather than ship it. Note that MathML reports a lowercase `tagName` and lives in its own
namespace (like SVG), so any tool that inspects it must match `namespaceURI`/`localName` —
never the string `"MATH"`.

### 2.7 Citations and References (APA 7th edition)

Every build cites its sources, for **both** source types.

- **In-text.** A fact, definition, or number drawn from a document carries an
  APA-7 in-text citation at the point of use: `(Author, Year)`,
  `Author (Year)`, `(Author & Author, Year)`, `(Author et al., Year)`, and
  `(Author, Year, p. 12)` for a quote. Write the ampersand as the literal
  character `&` inside parentheses (and `and` in narrative), **never** as the
  entity `&amp;`; add `a`/`b` for the same author and year.
- **No self-reference.** Never cite the lesson, its handout, the course code,
  or the notebook itself — a work cannot be its own source. For a `teaching`
  source that names no external work, attribute each standard concept to the
  real published work that owns it; if a concept has no citable owner, omit
  that citation rather than invent an author or point back at the lesson.
- **Attribution is earned.** A citation attaches only to a statement the cited
  author actually made. Never park a citation on the notebook's own connective
  prose (a chain paragraph, a hand-off) or on the lesson's invented or
  course-specific examples. Put the marker on the canonical principle or
  definition the work itself states.
- **Route each concept to its owner.** Do not default every economics concept
  to one famous textbook. The same idea has different owners by treatment:
  cardinal total/marginal utility and the MU-per-dollar equalization rule → a
  text that presents utility cardinally (e.g., OpenStax *Principles of
  Economics* or McConnell & Brue); ordinal vs cardinal utility, consumer/producer
  surplus, deadweight loss, price ceilings → an intermediate microeconomics text
  (e.g., Pindyck & Rubinfeld); value in use vs value in exchange → Smith (1776).
  Mankiw's *Principles* teaches consumer choice with indifference curves
  (ordinal), so it is **not** the owner of cardinal MU / MU-per-dollar content.
  Verify the owner before citing.
- **Placement.** In-text citations live only in the teaching content sections,
  plus one per glossary term. They never appear in Overview, Recap, the
  Assignment, or any answerable activity's data.
- **References.** A `references` section ships last, id `references`, its
  `<h2>` matching the mandatory `outline.json` entry, with one APA-7 entry per
  cited work, alphabetical by author, hanging indent (`.refs`), sentence-case
  titles, italic titles/volumes.
- **Where the works come from — real, recent, never the handout or syllabus.** Every cited
  work is a real, published work by a real author (a person, or an organisation
  that is the work's author, such as a standards body). **All searching happens
  once, in Wave 0**: the orchestrator finds and verifies each work
  (web search/fetch is allowed there) and writes it into a shared `refs.json`
  pool — capped at **12 distinct works** and **6 web searches** — before any
  section agent dispatches (Part 4). Section agents cite from the pool and never
  search the web; only an author whose claim's true owner is genuinely missing
  from the pool may run **at most 2 fallback searches**, writing anything found
  into its own section's sidecar. `teaching`: the real external works behind the lesson's facts — **never**
  the lesson source document itself. `specification`: the real standards the
  content was authored against (the existing `CITATIONS` block's references now
  reach the HTML) — **never the syllabus, course outline, week plan, or input
  specification document itself**. The input handout, "Course handout", "Course
  syllabus", and the notebook's own
  `src/` prose are **not** valid reference entries. Never invent a work.
- **Jurisdiction of the legal/standards class.** A statute, circular, regulation,
  standard, or official-statistics work you cite is **Philippine** (§2.8) — BSP, SEC,
  BIR, DOH, DepEd, CHED, PhilHealth, PSA and their in-force issuances — unless the
  lesson's subject is itself that foreign system. The other classes (papers, textbooks,
  the foundational theory) may be by any author, of any nationality.
- **Recency.** A cited work must be **2021 or newer**, with two exceptions:
  (a) a primary legal or standards document (a statute, circular, regulation,
  standard, or official statistics release) cited in its current in-force
  version; and (b) the foundational work that introduced a theory or concept,
  cited by its originator and original year. Prefer the most recent
  authoritative edition of every other work.
- **No source, no content.** If the agent cannot find a real, citable work for a
  fact, definition, or number after checking the pool (and, if granted, its
  2-search fallback), it rewrites the claim to one it
  can support or drops the item. A number or definition never ships without a
  citation.
- **Production.** Each content section writes `parts/NN-<id>.refs.json`
  (monolith builds: `refs.json`) with `{"key", "text"}` entries — `text` a
  complete APA-7 entry, `<em>` allowed for italics. `build.py` merges, dedups,
  sorts, and renders the block; it fails on an uncited entry, an unresolved
  citation, an empty list, a pool over 12 works, a sidecar over 6 refs, or a
  sidecar holding more than 2 out-of-pool works.
- **URLs.** A plain-text DOI/URL is legal only inside the generated References
  block (never fetched, never linked); a URL elsewhere still fails the
  external-asset check.

### 2.8 The local-context anchor (Philippines)

Every lesson ships in a Philippine setting. This is the default frame, applied the way a
local teacher would naturally write it — not a theme, a flag, or a caveat.

- **Money is the peso (₱).** Use peso amounts in the prose, worked examples, activities,
  and practice sets (§2.4). A worked figure never carries a bare foreign currency symbol.
- **Places, people, and scenarios are local.** Name real Philippine institutions, places,
  and situations that fit the subject (a universal bank, a cooperative, an SME, a
  barangay, a jeepney route, a government office) rather than neutral or foreign ones.
- **Government agencies, statutes, regulations, and official statistics are always
  Philippine** — BSP, SEC, BIR, DOH, DepEd, CHED, PhilHealth, PSA, and the Republic Acts,
  circulars, and issuances that govern them, cited in their current in-force version
  (§2.7). Never substitute a foreign regulator or statute (the US SEC, FDIC, CFPB, TILA,
  or the UK FCA) for a Philippine one.
- **International authors are fine for everything else.** A cited work outside the
  government/legal/statistics class may be by any author, of any nationality — a
  peer-reviewed paper, a textbook, the foundational theory work. Only the government,
  legal, and official-statistics references are fixed to the Philippines.
- **Do not label the setting.** Write the local context as the unmarked default — name the
  agency or the peso amount directly ("Under BSP Circular No. 808 …", "A ₱50,000 loan …")
  instead of announcing the country ("In the Philippines …"). The phrase "in the
  Philippines" is a sign the anchor is being narrated rather than applied; drop it and name
  the specific thing.
- **The anchor yields to the MILO.** When the lesson's subject is itself a foreign system —
  foreign law, foreign history, a jurisdiction-specific process — keep the lesson's real
  subject and do not force a Philippine frame onto it. Apply the anchor only where it fits
  (a Philippine comparison, a converted figure) and **tell the user in the opening message**
  which MILO or subject title conflicts with the anchor and how you handled it (§8). Never
  resolve the conflict silently.

## Part 3 — Components: registry-first

**Before writing any interactive element, read `skeleton/components/registry.md`.**
If a row fits, mount it and put the content in `data.js`. Schemas, mount examples, and
when-to-use notes live there (and in each component's README).

Three rules every component already enforces, keep honouring in the data you write:
one-way answer locks (mcq, true-false, identification, sorter, ranking), scoreboards divide by the TOTAL,
plain-language readouts not bare numbers.

### 3.3 Nothing fits? Hand-write, then propose promotion
Put the element in `extra.css`/`extra.js` following the mount convention (register into
`LN.components["name"]`, render from `LN.data[key]`, zero content strings, real
`<button>`/`<input>`, token colours only). After the build passes QA, ASK the user:
*"Promote `<name>` to the library?"* Only on approval create `components/<name>/` + a
registry row. No silent auto-adds; the same rule covers a hand-derived skin promoted to
a 7th pack.

## Part 4 — Build order (inventory → outline → per-section agents → assemble)

**Never write teaching content in one sitting from memory of the whole source.**
The outline is the contract; agents fill it one section at a time.

**A. Inventory (main session).** Classify the source first (§Source types). For a
**`teaching`** source, extract it to plain text once (`pdftotext`, pypdf, paste).
Copy **every section/subsection title verbatim** into `outline.json` →
`source_titles` before writing any content. Not one title may be invented,
renamed, or merged at this step; later steps only *map* titles, never add them.

For a **`specification`** source there is nothing to extract — inventory the
syllabus row instead: the outcome statements and the content titles, both copied
verbatim into `source_titles`. Then author the week's teaching text into
`src/full.txt` with its `CITATIONS` block, *before* any section agent runs. From
that point the pipeline is identical; only the Part 9 evidence differs.

**B. Map + scaffold (main session).** Run the §2.1 meld decision: assign every source
title to exactly one notebook section's `from[]` (or `dropped[]` — justify drops in the
opening message). Write the `title` each section's `<h2>` must carry. Pick the pack (§1.2).
**Budget the hour here (§2.3):** give every section its minutes so the total stays
inside `build.json`'s `minutes` (60 by default) — prose at 130 words/min plus each
mount's activity cost — and copy that section's share into its brief.
Create `build/<slug>/`, write `build.json`, `tune.css`, `outline.json`, and
`parts/00-head.sections.html` (the `<header class="lesson-head">` block — main session only).
Split the extracted text per mapping into `src/<id>.txt` slices so agents read just one file.

**Wave 0 — the shared refs pool (the only place the pipeline searches).** Before any author dispatches,
the main session runs the whole lesson's reference search in
batched queries — at most **6 web searches** — writing one `refs.json` pool of
verified, real, recent works for the lesson, capped at **12 distinct works**
(`build.py` fails a bigger pool). Agents cite from that pool alone, and
`build.py` merges it by `ref_signature`; an author whose claim lacks a pool
owner reports it back instead of searching (fallback: at most 2 searches per
author, their finds landing in that section's own sidecar).

**C. Section agents — one per notebook section.** Dispatch one agent per section
(parallel batches of 3–4; a failure re-runs only its own part pair). Content sections
read ONLY their `src/<id>.txt` slice; derived sections (0 Overview, G Glossary, 7
Assignment, 8 Recap) legitimately need the whole source — give them the full text file
and nothing else. No agent ever sees `outline.json` titles it isn't assigned, other
sections' parts, or this skill file; the brief below carries every rule. Agents write
files directly and return only one line — content never passes through the main session.

Brief template (fill the `<…>` slots; keep everything else verbatim):

```
Write ONE section of an interactive HTML lesson notebook. Everything you need is here.

Section id: <id>            Workdir: <abs path to build/<slug>/>
Create exactly three files (write nothing else, change nothing else):
  parts/<NN>-<id>.sections.html    parts/<NN>-<id>.data.js    parts/<NN>-<id>.refs.json
Exception — only a DAG assignment (`"assignment": "dag"`) writes just
  parts/<NN>-assignment.sections.html and parts/<NN>-assignment.refs.json;
  the parallel D2 track owns parts/<NN>-assignment.data.js.

<slice>
Your SOURCE SLICE — teach ONLY from this text; never invent names, numbers, or examples that are not in it (the Section 7
assignment is exempt — mixed-craft.md / error-craft.md / dag-craft.md / question-craft.md / graph-craft.md govern its inventions):
<paste src/<id>.txt here; for derived sections paste the full source text instead>
</slice>

Your section: <title>   ← the ONLY <h2>, written verbatim, "&nbsp;" after the number ok
Hand in: one chain paragraph (2–4 sentences) continuing from <previous section's close>.
Hand off: close by leading into <next section's one-line purpose>.
Plan: <what this block teaches + which components mount, chosen from Part 2's architecture>
Clarity: write for an average student; the prose budget is mechanically checked
(paragraph > 40 words or sentence > 30 words fails the build). A shortlist
reviewer reads only flagged paragraphs.
Pacing (one-hour content lesson: <N> min for this section, §2.3): about <W> weighted
words of prose — calculation blocks (MathML, `Where:`, `Worked —`) count half. A
teaching section over 1,500 weighted words fails the build, and the lesson content must
stay inside 60 minutes. Activities and the assignment are not budgeted, so never
overflow now expecting to trim by removing them.
Labs: OFF by default. Do not mount any `*-lab` component unless build.json has
"labs": true. Use a practice set (`step-solver`) or an activity.
Prose shape (write to this budget first, §2.1e): ONE idea per paragraph — split, never
lengthen; a sentence under ~30 words (past that, render the structure as a visual — bullets
/ a comparison-table / a figure or flow — not a longer split); never stack definition +
explanation + example + caveat in one block; when the content enumerates, compares, or
walks a sequence, render it as the visual while writing.
Emphasis: bold (<strong>) a key term — one with a glossary entry — the first time it
appears in this section; use <em> only for a term being defined, emphasis, or a foreign
phrase. Never underline.

Hard rules (mechanically checked; violations fail the build):
- File starts <section class="block" id="<id>"> ends </section>. Exactly one <h2>.
  Subsection titles NEVER become headings — bold lead-ins inside boxes only.
- Classes available (no CSS to write): .def (box with <span class="tag">Name</span> and data-kind="..."),
  .mini (labelled mini box), .note y|g|b|p, .grid2, .hl (highlighted result),
  .cmp-wrap + table.tbl (wide table), MathML for formulas (§2.6), standard HTML.
- Every `.def` carries `data-kind="concept|formula|example|caution|insight|neutral"`.
  concept = definition/concept; formula = formula/calculation/method; example =
  Worked/Case/Position/Practice/Sensitivity; caution = failure/limit/trap/bias/error;
  insight = Why/What/Reading/takeaway; neutral = knowledge check/activity. Missing or
  unknown kinds fail the build, and the shell maps each kind to one fixed pastel, so a
  hue never means two things. `.mini` and `.card` stay neutral: they mix concepts,
  cases, and summaries, so colouring them would break that one-hue-one-meaning rule.
- Prose carries the math: every formula gets a Where: list (one symbol per line,
  semicolon-terminated, period on the last); every worked calc in your slice gets a
  Worked — .def block (numbered steps, math in MathML per §2.6, results in `<mrow class="hl">`,
  tabular math in .cmp-wrap). Derivation lines keep the formula's shape: work term by
  term in formula order, open each step with its symbolic label, show micro-steps
  explicitly, and keep the left-hand side (e.g. `σp² =`) on every continuation line.
  The mounted widget practises the same numbers — it never
  replaces the prose.
- If your slice's concept is inherently a graph (curve, line, distribution, timeline)
  and the source carries no figure for it, draw it: inline
  <svg xmlns="http://www.w3.org/2000/svg">, points computed from your slice's own
  numbers only, colours only var(--chart-*) tokens, labelled axes. Invented data
  points fail the review.
- Components render from data. In sections.html a mount is ONLY:
  <div data-component="<name>" data-key="<key>"></div>
  Its content goes in the .data.js file as: LN.data.<key> = {...}; except a DAG
  assignment section in `"assignment": "dag"` builds (D2 writes it).
  Read <skill-dir>/skeleton/components/registry.md for your components' schemas
  (that file only). Keys must start with your section id: <id>1, <id>2, ...
- If your section mounts `assignment`: the mode comes from `build.json`.
  **Default (`"assignment": "mixed"` or omitted):** write
  `parts/<NN>-assignment.data.js` with the full 10 `mc` + 8 `tf` + 2 `multi`
  deck per `<skill-dir>/skeleton/mixed-craft.md`; also write the mount and intro
  in `parts/<NN>-assignment.sections.html` and your cited works in
  `parts/<NN>-assignment.refs.json`. This is a single-author deck — there is no
  level fan-out. Every answer lives only in `ans`; the build strips it from the
  student HTML.
- **Only when `build.json` has `"assignment": "error"`:** write the 12 `err` +
  8 `multi` deck per `<skill-dir>/skeleton/error-craft.md`, with every `err`
  answer kept only in `ans`.
- **Only when `build.json` has `"assignment": "dag"`:** write only the
  mount and the intro in `parts/<NN>-assignment.sections.html`, and your cited
  works in `parts/<NN>-assignment.refs.json`. Do **not** write
  `parts/<NN>-assignment.data.js` and do **not** author `nodes[]` — the parallel
  D2 track (Part 4) owns that file and the graph; read
  `<skill-dir>/skeleton/dag-craft.md` to understand the contract it follows. The
  orchestrator fans out one author agent per level with one independent reviewer
  per level before assembly — never write the whole graph in one pass.
- **Only when `build.json` has `"assignment": "flat"`:** do **not** author a graph.
  Read `<skill-dir>/skeleton/question-craft.md` first — it is your authoring law
  for every item (situational stems, per-type difficulty, ±1-word MC choices,
  single-flip tf, MILO blueprint ≥2 per MILO and none >30%). Author correct answers ONLY inside the
  data object (`ans` for mc/tf, `aliases` for id, `key_points` for sa, plus `rubric` (string) and `max_points` (positive integer)) — the
  build strips them from the shipped HTML (never rely on hiding) and derives
  the teacher's grading key from them. Every data item is a strict JSON object
  (the extractor `json.loads` the file). No feedback/score UI.
- **Only when `build.json` has `"assignment": "graph"`:** author the
  `figures` bank (inline SVG + legend) and the 10-item `items[]` per
  `<skill-dir>/skeleton/graph-craft.md`; author correct answers only in `ans`,
  and keep every figure's legend in the data (the build ships it to the student
  and the teacher key).
- Mark the section's presentable content. Put data-present="0" on the section's
  <h2>. Tag every calculation at its natural depth: data-present="1" on the
  definition/formula (.def or .card), data-present="2" on each key explanation,
  worked example, and the practice-set mount (use "1" for the practice set only
  when it is the section's first content marker). Exempt sections (overview, glossary,
  selfcheck [also accept self-check], assignment [also accept assign], recap,
  references)
  need no markers. data-present="0" is valid only on the <h2>; depth never skips
  a level, markers never nest, and the section root is never tagged.
- No hex colours, no URLs, no @import, no <style>/<script> tags, no inline CSS.
- In the .data.js file never write a literal "</" followed by a letter — escape <\/.
- Keep the source's own phrasing in definitions and cases; edit for length only.
- No self-reference. Never state where this notebook's text came from or how it was
  authored — no `source: specification`, "authored"/"not extracted", "Sourcing…",
  "the syllabus carried no teaching body". Teach the subject; name a real
  law/circular/textbook only as the source of a fact.
- Cite your sources (APA 7) — real, recent published works, never the
  handout or syllabus. Do NOT search the web: cite only the verified pool in
  `refs.json` (fallback: at most 2 searches if a claim's true owner is missing
  there). Every fact, definition, or number gets an in-text citation:
  (Author, Year). Write the works you cited to parts/<NN>-<id>.refs.json as
  {"refs":[{"key":"slug","text":"full APA-7 entry"}]} (<em> for italics; no
  other markup; the sidecar is capped at 6 refs, at most 2 outside the pool). Cite a real author's work — never the lesson source document,
  the input handout, "Course handout", "Course syllabus", the syllabus / course outline /
  specification source, or this notebook's own text. Works must
  be 2021 or newer, except a primary legal/standards document cited in its
  current in-force version and the foundational work that introduced a theory
  (its originator and year). Never invent a work; if you cannot find a real
  source, rewrite the claim or drop the number/definition — no citation means it
  does not ship.
- Local-context anchor (§2.8). Ship in a Philippine setting: peso (₱) amounts in the
  prose, worked examples, activities, and practice sets; real Philippine institutions
  and scenarios. Government agencies, statutes, and regulations are Philippine (BSP,
  SEC, BIR, DOH, DepEd, CHED, PhilHealth, PSA) — a foreign regulator or statute is
  wrong unless the slice's subject is itself that foreign system. Never write "in the
  Philippines": name the specific agency, place, or amount instead.
- Honest attribution (v2.31). Never cite the lesson, its handout, or the course code
  itself. Cite the real published work that owns each standard concept; if none does,
  omit the citation. Attach a citation only to a statement that work actually makes —
  never to a chain paragraph or a lesson-invented example. Do not default every
  concept to one famous textbook; route by treatment (cardinal MU / MU-per-dollar →
  a cardinal-utility text, not Mankiw's *Principles*, which is ordinal). In-text
  citations go only in teaching content (plus one per glossary term), never in an
  activity's data or the assignment. Write a two-author cite with a literal &
  (not &amp;).
- When both files are written, reply exactly: done <key1> <key2> ...
```

**C2. Shortlist review (one merged reviewer per qualifying section).** Run the
deterministic lint first:

```
python tools/prose_lint.py build/<slug>/parts/NN-<id>.sections.html --glossary build/<slug>/parts/<glossary-id>.data.js --json
```

Dispatch a reviewer only when the report has a non-empty `review` list or
`sections.<id>.has_math` is true. That one independent agent (never the author)
sees only the flagged paragraphs with their context, the section's MathML /
worked-example blocks, and the `average-student-checker` contract inlined in the
brief. It returns clarity findings, numeric findings (recompute every worked
example), and a verdict. A finding goes back to the same author; re-lint; review
again only if the shortlist is still non-empty or numerics remain. **Max 2 retries**, then ask the user.

**D. Assemble + loop.** `python build.py build/<slug>` — merges `parts/` in filename
order, enforces the outline contract (phantom/missing/drift/coverage/duplicate keys)
plus all other mechanical rules. Line numbers refer to the merged file; fixes go to the
owning `parts/NN-<id>.*` file, never to a hand-written combined file. Rerun until `OK`.

**D2. DAG assignment track (parallel; runs ONLY when `build.json` has
`"assignment": "dag"`; skip for mixed/error/flat/graph).** Start once the outline and
MILO blueprint exist, concurrently with the content authors. The Section 7
author writes only the mount and intro
(`parts/<NN>-assignment.sections.html` + `parts/<NN>-assignment.refs.json`); it
does **not** write `data.js` and does **not** author `nodes[]`. This track owns
`parts/<NN>-assignment.data.js`. Mixed mode (the default) is a single author:
Section 7 writes the whole 10 `mc` + 8 `tf` + 2 `multi` deck itself; there is no
level fan-out. Error mode (`"assignment": "error"`) is likewise a single author
with its 12 `err` + 8 `multi` deck.

1. In dag mode, if `build.json` omits the `dag` block, Section 7 defaults to the
   maxed-out budget (`levels: 5, max_nodes: 16`).
2. Blueprint: map MILOs → layers; draft the gold path; reserve ids for later
   layers; track remaining `max_nodes`.
3. For `level = 0 .. levels-1` (serial — later levels need earlier ids):
   - **Author agent**: lesson slice + gold-path state + reserved ids + remaining
     budget + `dag-craft.md` → strict JSON nodes at this level only.
   - **Reviewer agent** (separate; sees only this level's diff + `dag-craft.md`
     + lesson slice): checklist → `pass` or `fail` + rewrite list. `fail` → the
     same author rewrites (**max 2 retries**, then ask the user).
4. Write the full `{"mode": "dag", "title": …, "scenario": …, "nodes": [...]}`
   object into `parts/<NN>-assignment.data.js`, then run D. The Section 7 author
   supplies the title/intro intent in its brief if needed.

**E. Judgment QA (Part 5),** then hand over and propose any promotions (§3.3).

## Part 5 — QA pass (judgment only; mechanical checks are owned by build.py)

Mechanical, and therefore already enforced: parts merge, outline contract (phantom /
missing / heading drift / source-title coverage / one-h2-per-block), marker hygiene, hex
containment, external assets, id uniqueness/section ids, mount/data-key integrity
(including duplicate keys across parts), well-formed HTML, WCAG contrast floors,
semantic hue lock, tune-token rule, print block.

Still yours to verify — build.py cannot read intent:
- **Layout containment (§1.5).** REQUIRED for every build: run
  `node tools/layout_smoke.js <built.html>` from this skill folder and require
  `LAYOUT OK` before announcing OK, **and repeat with `--width 390` for the
  phone viewport** (needs Node 22+; `--dump-dom` floors near 500px and cannot
  see phone-only squeezes). It renders the notebook in headless Chrome, forces
  every section visible, and fails if any text box spills (content wider/taller than its
  box while overflow is visible) or clips (overflow hidden with text). This is the gate
  that catches the Week 9 flip-tile class — absolute faces in a fixed `min-height`
  overflowing by 14–37px — and it also fails a bad `overflow:hidden` "fix" (which clips
  the answer instead). The `--width 390` run catches the Week 8 class instead:
  desktop theme margins and unclamped grids squeezing inputs at phone widths, and a
  display formula silently truncated inside its own scroll box — the app layout's
  `fitMath` pass must have sized it to the column, and only a formula at the 10.5px
  floor may pan (marked `.ln-math-scroll`). A pass with the shipped components is
  expected; any new §3.3 element or component edit must be re-checked here (both
  widths).
  If the tool reports no Chrome/Edge (prints `LAYOUT SKIP`), install one or set
  `LN_CHROME` and re-run — a skip is not a pass.
- **Formulas (§2.4).** Write each calculation, compare to source text; recompute every
  worked example by hand; confirm the prose, lab, presets, solvers and sensitivity all
  agree with the **source's** numbers, and that every calc also appears in the section
  prose — a number that lives only inside a widget fails QA. Multi-product presets use the
  **weighted-average** P and VC, never one product. Report as *Formula · Code · Source ·
  ✓/✗*. On a
  **`specification`** source the **Source** column becomes **Citation** — and the test
  is stricter, not looser: the citation must name a real published work the student
  could look up (Circular No. 781, Appendix 59, Basel Framework RBC30 / CRE20.4, a
  statute, a textbook page), never the syllabus, handout, or your own `src/` prose — a
  reference back to your own prose is a ✗. Apply §2.7's recency rule (2021+, with
  the primary-source and foundational-theory exceptions). When you cannot produce a
  real citation for a number, the number does not ship — same as a source-only
  violation.
- **Figures (§2.5).** Every plotted point traces to a source number (or, on a
  `specification` source, to a cited one); axes labelled; the picture agrees with
  the prose.
- **Comprehension-check semantics (§2.4c).** Every teaching section has exactly one
  `data-activity="comprehension check"` mount, using one of `mcq`, `true-false`,
  `identification`, `sort-statement`, `ranked-statements`, or `case-match`, with
  **exactly 10 items at medium difficulty**. No `feasibility-gate` and no
  PASS / MARGINAL / FAIL judgment anywhere in the lesson. Tests are situational
  near-misses, not trivia; explanations name the trap. Where a component renders
  reasoning (`mcq`/`identification`/`true-false` `e`; sorter/scenario optional
  `e`), wrong-pick feedback names the slip. Teaching visuals carry no Activity
  label.
- **Meld/MILO (§2.1).** The `from[]` mapping is honest — a section's content actually
  traces to its cited source titles (mechanics prove the titles exist; only you can spot
  an agent that copied a sibling's topic). Dependency-list facts all survive; every MILO
  taught AND exercised; shipped file matches the announced Outline map.
- **Design fit.** The pack+tune reads as the lesson's world and respects the subject's
  seriousness (bankruptcy is not a party). A tuned pack must not land visually on top of
  a previous lesson's output; packs are never shipped untuned.
- **Voice.** The source's own phrasing kept in definitions and cases, edited only for length.
- **Assignment integrity.** No answer material (`ans`/`aliases`/`key_points`/
  `points`) readable anywhere in the student file; the Begin → fullscreen → walk
  flow works; `build/key/` received the key file. Then run
  `node tools/assignment_smoke.js` from this skill folder and require SMOKE OK
  before announcing OK — it walks flat, dag, graph, error, and mixed decks and fails if
  any type strands the student with Next disabled (the Week 7 id/sa class: typed
  answers updated state without refreshing the nav, because `show()` is the sole
  recompute point for `next.disabled` and the progress dots).
  **Mixed (the default):** confirm the deck is exactly 10 `mc` + 8 `tf` +
  2 `multi` items with no SA; every `mc` has four choices within ±1 word and no
  answer position used more than 3×; the `tf` block has at least 3 true and 3
  false; every `multi` prompt names its target, has 4–8 options, 2..n−1 correct,
  and does not put the longest mean length on the correct set. Student HTML has
  no `ans`; `build/key/*-key.json` has `mode:"mixed"` with `ans` for every type.
  Authoring law: `skeleton/mixed-craft.md`.
  **Error (`"assignment": "error"`, opt-in):** confirm the deck is exactly 12 `err` + 8 `multi`
  items with no SA; every `err` choice is a verbatim whole-word span occurring
  exactly once in its statement; at least 3 correct spans are 4+ words; no
  answer position is used more than 4×; the correct span is the unique longest
  in at most 4 of 12, and the correct set dominates mean length in at most 4 of
  8 multi items. Student HTML has no `ans`; `build/key/*-key.json` has
  `mode:"error"` with `ans` for both types (`statement` on `err` rows).
  Authoring law: `skeleton/error-craft.md`.
  **Flat (`"assignment": "flat"`, opt-in):** judge every item against
  `skeleton/question-craft.md`: 20 items in the 10/4/4/2 mix, the copy test (no
  stem answerable by lifting a sentence of prose), tf single-flip quality, stems
  ≤60 words and self-contained, MC answer position used ≤4×, and the blueprint
  (every MILO ≥2 items, none >30% of the deck). Recompute every invented item's
  answer independently — a wrong key is invisible to students (assignment
  extension of §9.2).
  **DAG (`"assignment": "dag"`, opt-in):** confirm student HTML contains **no**
  `"points"` string inside the assignment object, `build/key/*-key.json` has
  `mode:"dag"` + the resolved `levels`/`max_nodes` + `optimal.max_score`, and
  every node passes dag-craft's reviewer checklist (spot-check one node per
  level).
  **Graph (`"assignment": "graph"`, opt-in):** every item is `mc` with a
  `situation`, a banked `figure`, and a visible legend; no `ans` in the student
  file, and the teacher key carries the answers.
- **Activity freshness (§2.4 / §2.4c).** No comprehension check or practice set may reuse
  the lesson's example numbers. Scan each section's activity data against the section prose
  and figures (a helper: `python tools/activity_numbers.py <built.html>`); any value that
  also appears in the prose in the same role is a ✗ — replace it. Recompute every activity
  answer independently. A practice set is 4–6 problems with answers rounded to 2 dp.
- **Citations & references (v2.23, v2.28).** Every attribution carries an APA-7
  in-text citation; every entry in the generated `references` section is cited
  at least once and is a real, correctly-formed APA-7 entry for its type. Every
  entry is a real, published work by a real author, verified in the Wave 0 pool
  (the pipeline's single, capped search per lesson) — **never** the handout, the lesson source document, "Course handout",
  "Course syllabus", the syllabus / course outline / specification source,
  or the notebook's own text. Works are **2021 or newer**, except a primary
  legal/standards document in its current in-force version and the foundational
  work that introduced a theory (its originator and year). An invented work, an
  out-of-date work outside those exceptions, or a number with no citable source,
  does not ship.
  **Attribution propriety (v2.31):** no citation points at the lesson/handout/
  course itself; every citation sits on a statement its author actually made
  (not on a chain paragraph or a lesson-invented example); each concept is
  routed to the work that owns it; citations appear only in teaching sections +
  glossary, never in Overview/Recap/Assignment/activities.
- **Local context (§2.8).** Worked figures carry ₱ (peso); government/legal citations
  are Philippine; the built HTML contains no "in the Philippines" label (grep it — the
  anchor is applied, not announced). A non-Philippine subject is the only exception, and
  it is one the opening message named as a conflict.
- **Clarity.** The per-section lint and shortlist review already cleared every
  content section, and `build.py` enforces the mechanical floor (budget, bold
  key term, `Where:` gloss) at assembly. There is no LLM clarity sweep over the
  assembled file. Run the standalone `average-student-checker` (both lenses)
  only when asked to review an existing lesson.
- **Pacing (§2.3).** `build.py` fails a notebook whose **content** estimate exceeds
  the budget; read `build/<slug>/pacing-review.json` before announcing OK. The
  per-section table must show the content hour going to the MILOs: no section over
  its weighted-word cap, and at least 45 of the 60 content minutes actually used.
  A total far under the hour is a thin lesson — deepen the content rather than ship
  it. Activity time is listed separately and is never part of the gate.

## Part 6 — Content principles (unchanged from v1.9)

1. Use the lesson's own numbers and names; never invent parallel examples in the
   lesson body. Exempt: Section 7 assignment items (§9.1's lesson-body scope;
   error-craft.md / dag-craft.md / question-craft.md / graph-craft.md govern their invention rules) **and answerable
   activities/practice sets (§2.4–§2.4c), which invent their own numbers precisely so they
   do not reuse the lesson examples**.
2. Definition, then example — short. `.def`/`.mini` by default, prose only to connect.
   Every `.def` names its kind in `data-kind`; colour follows content, never the week
   or the theme.
3. Use the lesson's own world for the design (the pack pick, then the tune).
4. Interaction before explanation: let the student find the number, then show the reasoning.
5. Plain-language readout: never leave a student staring at `BEP = 562.5`.
6. Sensitivity over single answers.
7. The assignment collects; it never reveals. Feedback lives in `build/key/`.
8. Preserve the source's voice.
9. Ship in the Philippine local-context anchor (§2.8): pesos, local institutions,
   Philippine agencies/legal — unless the lesson's subject is itself a foreign system,
   in which case keep the subject and flag the conflict.

## Part 7 — Reference implementation

The skeleton **is** the reference: `skeleton/shell.html` (chrome, vocabulary CSS, LN
runtime), `skeleton/themes/` (six packs), `skeleton/components/` (registry + 23
registered components, each with README, plus `port-lab` pending promotion (§9.4)). `build.py` is both assembler and validator; running it
without arguments prints usage. A complete worked example ships at `sample/lesson-demo/`
(Week 4 break-even lesson, parchment pack tuned to "tumba-tapa"; flat assignment pinned
with `"assignment": "flat"`; monolith sections/data plus
a valid `outline.json` showing the contract). The sample predates v2.34: its
activity labels, item counts, and `feasibility-gate` mount are historical — build
new lessons to §2.4c. Build it with
`python build.py sample/lesson-demo` from this skill folder; the notebook lands in the
current directory. The assembled output is
read-only; never hand-edit it.

Tools in `tools/`: `assignment_smoke.js` (deck walkthrough), `activity_smoke.js`
(activity feedback), `layout_smoke.js` (rendered overflow/clip gate, §1.5),
`deck_layout_smoke.js` (the same gate over the real flat/DAG/graph/error/mixed deck, desktop +
tablet + phone), `test_assign_graph.py` (the graph-mode rule set),
`prose_lint.py` (deterministic prose gate — `python tools/prose_lint.py
<built.html> --json`), and `activity_numbers.py` (activity-freshness scan — `python tools/activity_numbers.py
<built.html>`) — `node tools/<name>.js` for the JS ones. `layout_smoke.js` needs Chrome or
Edge; point `LN_CHROME` at the executable if it is not in a standard location. Append
`--width 390` for the phone-viewport pass (Node 22+, true 390 CSS px via device emulation).

Authoring references beside the registry: `skeleton/practice-craft.md` (practice sets,
§2.4b), and `skeleton/mixed-craft.md`, `skeleton/error-craft.md`,
`skeleton/question-craft.md`, `skeleton/dag-craft.md` and
`skeleton/graph-craft.md` (Section 7 — mixed default, error-check, flat, DAG,
and graph modes).

**Sample note (v2.18):** `sample/lesson-demo` predates the fresh-number rule — its
activities mirror the lesson's numbers. Treat it as a pipeline/outline example, not a
numeric-freshness model.

## Part 8 — Opening message

Open with the plan, then build immediately. Ask only if a formula is ambiguous, a
required input is missing, or the source exceeds §2.3 limits.

```
Reading: <filename>   (source: teaching | specification)
Inventory: <N> source titles captured (verbatim) → <M> notebook sections; dropped: <list or none>
Theme: <pack> tuned — "<anchor noun from the source>"   (or "derived — <why no pack fits>")
Layout: app — pinned per v2.12
Context: Philippine anchor — peso (₱), local institutions; agencies/legal cited: <list>
Context conflict: none   (or: MILO "<letter/title>" is about a non-Philippine system — anchor applied only where it fits)
Assignment: mixed — 10 mc + 8 tf + 2 multi (default; pin "error" / "dag" / "flat" / "graph" only if requested, or pin "error" for a lesson written for the v2.33 error default)
Pacing: <N> min of content — <M> teaching sections; activities and the assignment are not budgeted   (60 unless the user named a longer class)
Outline map: <source title → notebook §N> [REQUIRED — the outline.json mapping]
MILO coverage: <MILO letter → teaching section + exercising component> [REQUIRED]
Components: <list from registry, or NEW via extra files>
Citations: <N> works cited (APA 7) -> generated References section
Formulas to verify: [list]
Dispatching <M> section agents.
```

On a **`specification`** source, add these two lines and put them first — the
student is owed the fact that the content was authored, not supplied:

```
Source: specification — the syllabus named this week's coverage and carried no body.
Content authored against: <the standards the outcomes name, e.g. BSP Circular 781 / MORB Appendix 59; Basel Framework RBC30, CRE20.4>
Dropped: the syllabus's Suggested Learning Activities and Course Assignments columns (the notebook's components are the activities) — say so explicitly.
```

## Part 9 — Source-only rule (hardening from the Week 5 build)

Every mistake below actually happened; each is now a hard rule. build.py enforces the
mechanical subset, but the judgment side is still on the main session and agents.

### 9.1 Nothing in the notebook that is not in the source (invention class)
- **Lesson-body scope.** This ban governs the teaching content. **Exempt:**
  (a) the Section 7 assignment — situational items may invent actors, numbers, and
  scenarios; their constraint is *answerability*, governed by `skeleton/mixed-craft.md`
  (default mixed), `skeleton/error-craft.md` (`"assignment": "error"`),
  `skeleton/dag-craft.md` (`"assignment": "dag"`),
  `skeleton/question-craft.md` (flat), or `skeleton/graph-craft.md` (graph),
  and flat SA `key_points` remain
  facts the notebook teaches; and (b) **answerable activities and practice sets
  (§2.4–§2.4c), which invent their own numbers so they do not reuse the lesson
  examples**, and the named *situation* attached to an abstract example (a context name is
  allowed; the values are not).
- **Source-only formulas.** Never add algebra (rewrites, closed forms, derived
  shortcuts) the source does not contain. p1 (Week 5) shipped a closed-form
  `σp = 20%×√(0.5+0.5ρ)` that Week 5 never derives — invented. §2.4's "prose carries
  the math" means the source's math; it does not license new derivations. If a value in
  the source is only a table, ship the table — §2.5 lets you *plot* that table's own
  values, nothing more.
- **Source-only data.** When adapting a component to a new topic, delete the default
  data slots the source does not support (Week 5 shipped a lab widget with a
  expected-return row for BDO 10%/Puregold 12% — numbers invented to fill the schema).
- **Source-only feedback.** Solution/explanation strings obey the same rule: a feedback
  string once quoted `w1 = σ2/(σ1+σ2)`, a derivation absent from the source. Feedback
  prose may only use the source's own form (Week 5's `σp = |w1σ1 − w2σ2|` at given
  weights is legitimate; an untaught optimal-weight formula is not).
- **Normalize the slice before writing.** PDF extraction mojibake (σ→`I?`, −→`�^'`,
  ×→`A·`) must be repaired *before* slicing so agents never see wrong symbols, and
  agents must never emit numeric character references (`&#772;`, `&#8242;`) — the hex
  detector treats them as colours, and mojibake U+FFFD must never reach the output.
- **Verify encoding by bytes, not by eye.** The read tool and the PowerShell console can
  render valid UTF-8 (`Δ`, `−`, `×`, `λ`, `∫`) as cp1252 garbage (`I"`, `A-`, `�^'`). Before
  "repairing" apparent mojibake, decode the file as bytes in Python and check for U+FFFD;
  if the bytes are clean UTF-8 the file is fine and the *display* was lying. When editing,
  use ASCII-only anchors so a display artifact can never corrupt the match.
- **No build-provenance narration (self-reference class).** The notebook teaches the
  subject; it never narrates its own construction. Forbidden in any
  `parts/*.sections.html` or `parts/*.data.js`, for **both** `teaching` and
  `specification` sources: (a) source-type declarations (`source: specification`,
  `source: teaching`); (b) authored-vs-extracted statements ("authored", "not
  extracted", "carried no teaching body", "sections 1–N of this file are authored
  teaching text", "written against the standards the outcomes name"); and (c) a
  `Sourcing.` / provenance note box that explains where the week's text came from.
  The declaration lives in exactly two places, nowhere else: the `SOURCE:` header of
  `src/full.txt` and the **opening message** (§Source types rule 4; Part 8).
  **Permitted:** naming a real law, circular, standard clause, or textbook *as the
  source of a fact being taught* ("Under BSP Circular 808 …") — that is subject
  matter, not provenance. Backstopped by `check_provenance()` (build.py, rule
  `provenance`); this prose rule is the primary contract.

### 9.2 Recompute every source number before shipping (wrong-number class)
- **Verify source tables against the source's own formula.** Week 5's handout had an
  internally inconsistent table (TEL/MWC, ρ=0 → 15.6%, correct is √0.02925 = 17.1%);
  prose, widget, and source all agreed *with each other and were all wrong*, and build.py
  cannot see it. The QA formula check must recompute every source table entry, not just
  check prose↔widget agreement. Fix silently-with-footnote; do not ship a wrong number.
- **Never anchor a result in the brief.** The section agent, being told "confirm the
  15.6% from the table", fabricated `√0.02925 = 0.156` to match it. Briefs must say
  *derive*, never *confirm*: paste the inputs, never the expected answer.

### 9.3 Brief and format hygiene (agent-brief class)
- **Hand in / Hand off are agent instructions, never student-facing.** An agent rendered
  its "Hand in: one chain paragraph" instructions as visible notes to the student. The
  brief must state that no agent-instruction text reaches the shipped section; the HTML
  carries only student-facing content.
- **One equality per line.** §2.4's Worked shape previously allowed `A = B = C` chains in
  a single line (user: "it should be one line per equal"). Every MathML derivation step
  carries exactly one `=`/`≈`; split chains onto separate `<br>`-separated lines.
- **Derivation lines keep the formula's shape.** Work a formula term by term in formula
  order (Term 1, Term 2, cross term): each step opens with its symbolic label
  (`w1²σ1² = (0.5)² × (0.20)²`), hidden micro-steps are shown explicitly
  (`(0.5)² = 0.25`, `(0.20)² = 0.04`) rather than jumped over, and every continuation
  line keeps its left-hand side (`σp² = 0.01 + 0.01 + 0.02`, `σp² = 0.04`) — never bare
  arithmetic. Each table row then reads as the same substituted formula with only the
  scenario input changing. (Week 5: the first draft hid both squarings in one jump and
  dropped the `σp² =` label on later lines; the user flagged both as confusing.)
- **Weighted-average discipline** (repeat of Part 5): multi-asset presets use weighted
  average P/VC or the matrix form; never one product's numbers.

### 9.4 Extra-component deadlock (build-system class)
- **§3.3's sanctioned path cannot currently build.** Mounts whose component is not in
  `build.json > components` are rejected, yet §3.3's approval-first flow keeps it out.
  Until build.py accepts `components_extra: [...]`, the working arrangement is: put the
  proposed component under `skeleton/components/<name>/` (css+js only), add its name to
  `build.json > components`, **ask for promotion approval in the closing message**, and
  on refusal remove the component dir + registry row. Week 5 shipped `port-lab` this way
  (pending promotion).

### 9.5 Resume checklist
Before announcing OK, mechanically scan for each failure class: formulas-only-from-source
(grep for `√(0.5`, closed forms), no `μ`/scheme slots the source lacks, feedback strings,
recomputed tables, no "confirm the N%" in briefs, no Hand in/Hand off leaks in output,
no `= … = … =` chains in shipped HTML, LHS label on every derivation line with
term-order mapping, no `&#…;` refs, no build-provenance narration (the `provenance` rule),
no U+FFFD (verify by **byte-level decode, not by eye** —
§9.1), **no activity or practice number that reuses a lesson example (Part 5 activity
freshness; `python tools/activity_numbers.py <built.html>`), every practice set 4–6 problems
with answers rounded to 2 dp**, the local-context anchor holds (₱ in worked figures,
government/legal citations Philippine, no "in the Philippines" string in the built HTML —
§2.8), and `node tools/layout_smoke.js <built.html>` prints
`LAYOUT OK` at desktop width **and** with `--width 390` (no spill, no clip, no
truncated display formula — §1.5, §2.6),
and the references rule is green (≥1 in-text citation, every entry cited, every
entry a real, recent (2021+) published work — never the handout or syllabus, §2.7, and the
`references` section generated), and the **clarity gate** is green (`python tools/prose_lint.py <built.html>`
exits 0; every content section either had an empty shortlist or passed its
shortlist reviewer).
