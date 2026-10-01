---
name: interactive-lesson-notebook
version: 2.15
description: Convert a lesson PDF, text, or slide deck into a single
  self-contained interactive HTML notebook. Use when the user supplies
  course material and asks for an interactive, learn-by-doing version.
  Produces one .html file with no external dependencies (the assignment's
  optional trusted-time lookup to worldtimeapi.org is the sole exception,
  assignment builds only), a visual design
  derived from the lesson's own subject matter and a navigation layout
  (pinned to `app`), live calculators,
  activity labels, and a graded collect-only assignment (a branching DAG
  scenario by default; a flat item deck on request) with an
  encrypted submission file. Do NOT use for
  marketing pages, dashboards, or content without pedagogical intent.
  Layout is pinned to `app` (v2.12) — no auto-select.
---

# Interactive Lesson Notebook (v2.15 — outline-first, one agent per section)

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
class-discussion check — via a `data-activity="class discussion"` attribute on
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
(v2.13 makes this mode the default — see below.)

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
time, arrow keys). `build.json > layout` must be `"app"` or omitted (omitted defaults
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
   could look up. A citation that points back at your own prose is not a citation.
   Those references are what Part 9 now audits instead of the source text.
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

The MILO-blueprint rules in the assignment (`question-craft.md`, `dag-craft.md`)
are unaffected: in a specification source the outcomes are the *only* blueprint you
have, so map layers to outcomes deliberately.

| Input | Default if unspecified |
|---|---|
| Lesson source | required — and **say which kind it is** (§Source types): `teaching` (default) or `specification` |
| Visual design | **you pick a theme pack + tune it** from the source's subject (§1.2) |
| Assessment | Encrypted collect-only assignment, **DAG by default** — Section 7 is one multi-layer branching scenario (`dag-craft.md`), budget defaulting to `{"levels": 5, "max_nodes": 16}` and overridable via a `dag` block. Flat (`"assignment": "flat"`): 18 fixed + 2 or more situational items (10 mc · 4 tf · 4 id · 2+ sa) authored per `skeleton/question-craft.md` (mc easy · tf hard · id medium · sa split). Marked by the teacher from the decrypted key file; time-locked to a weekday window (default Wednesday Asia/Manila; "window" in build.json). |
| Numeric entry | currency symbols, commas, decimals, with tolerance (shipped in LN.num) |
| Currency symbol | infer from source (₱, $, €) |
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
| `parts/NN-<id>.data.js` | that section's activity content (`LN.data.<key> = {...};`) | its section agent |

Then run: `python <skill>/build.py build/<lesson-slug>` — it merges `parts/` in filename
order into the sections/data slots (monolith `sections.html`/`data.js` still accepted as an
alternative; never both), checks the outline contract, and refuses to write the output
unless every mechanical check passes (exit 1 + itemized report: rule, file, line, fix).
**Run it from the folder where the notebook belongs**: the finished `.html` (and only it)
lands in the current directory, never in the workdir — work files (`build.json`, `tune.css`,
`outline.json`, `parts/`) stay under `build/<slug>/`. Loop: fix the parts, rerun, until `OK`.

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
  "output": "Week4-Notebook.html",
  "extra_css": "optional/extra.css",
  "extra_js": "optional/extra.js"
}
```

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
| `app` | thumb bottom-bar, one section at a time, arrow keys | **pinned — always use this** |
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
section at a time, arrow keys) regardless of section count, labs, or density.
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

Every lesson gets this structure unless the source clearly demands otherwise:

| # | Section | Always includes | Interactive element |
|---|---|---|---|
| 0 | Overview & Outcomes | title, "how to use", MILO list | `milo-list` |
| G | Glossary (§2.0) — between Overview and Section 1 | one-line definition of every technical term used anywhere | `glossary` |
| 1 | Concept A vs Concept B | definitions, purpose, comparison | `sort-statement` + `comparison-table` |
| 2 | Framework / Domains | one definition box + case per domain | `feasibility-gate` |
| 3 | The Calculator / Lab | formula + `Where:` list, components, method (§2.4) | `break-even-lab` (centrepiece) |
| 4 | Worked Examples | every numeric example from the source, **worked in prose** (§2.4) | `step-solver` (practises the same numbers) |
| 5 | Sensitivity | operating leverage, what-if | lives inside `break-even-lab` |
| 6 | Limitations | where the technique fails | `ranked-statements` / `case-match` |
| 7 | **Assignment** | Dag (the default; `"dag"` block optional, budget defaults to levels 5 / max_nodes 16): one branching scenario per `skeleton/dag-craft.md`, level-fanout authoring. Flat (`"assignment":"flat"`): 20 situational items per `skeleton/question-craft.md` (mc easy·tf hard·id medium·sa split). Hidden until begun; no reveal. | `assignment` |
| 8 | Recap | 6 flip cards + closing note | `flipcards` |

Each content-section mount also carries `data-activity="class discussion"` so
the shell prints the Activity tag; Section 7 is the *Assignment* (collect-only,
never scored in-page).

**Section 3 is the centrepiece.** Give it the most space and the best interaction.

### 2.0 The Glossary section (mandatory)
Its own block right after §0, linked from the TOC (number it `0G`). A term earns a line if
it is *technical* and appears **anywhere** — exposition, prompts, feedback, quiz. Keep the
source's own phrasing, edited only for length. The `.def`/`.mini` boxes remain the
teaching exposition; the glossary is the lookup. Duplication is intentional.

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

### 2.2 If the lesson has no calculation
Skip Sections 3/4; replace with ONE of: `ranked-statements` (ordering), `sort-statement`
as an argument sorter (supports/contradicts), `feasibility-gate` with criteria as domains,
or `case-match`. Sections 5/6 may compress into the recap. Preserve 0, G, 1, 7, 8.

### 2.3 Scaling to lesson size
≤3 pages → sections 0, 1, core activity, 7, 8. 4–15 pages → full build. 16–40 → expand
the case bank; the flat assignment always carries its full set (18 fixed + 2 or more sa). **>40 pages → ask the user
before proceeding.** Never pad short lessons with empty sections.

### 2.4 The prose carries the math (calculation emphasis)
Every calculation, procedure, and formula in the source must appear **in the section
prose** — in `.def`/`.mini` boxes — not only inside a widget. Mounted components
(step-solver, labs) *practise the same numbers*; they never stand in for the exposition.
**Why:** students read, print, and skim notebooks, and they skip activities — a calc that
exists only inside a widget is simply missing from the lesson. And when a number lives in
exactly one place there is nothing to cross-check; prose and widget carrying the *same*
values is what the Part 5 formula check audits (prose and widget disagreeing is the worst
outcome: a student finds the mismatch mid-quiz). Use these two shapes:

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
`<mrow class="hl">` gives a visible checkpoint to verify against, and `.cmp-wrap` keeps
wide tables from blowing out the sheet on small screens. A step that previously read
`<code>TC = </code><span class="hl">190</span>` becomes one expression —
`<math><mi>TC</mi><mo>=</mo><mrow class="hl"><mn>190</mn></mrow></math>` — so the highlight
lands on the number instead of dangling after a bare equals sign.

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
font-metric artifact there, so it checks column escape and clipping instead. Note that
MathML reports a lowercase `tagName` and lives in its own namespace (like SVG), so any tool
that inspects it must match `namespaceURI`/`localName` — never the string `"MATH"`.

## Part 3 — Components: registry-first

**Before writing any interactive element, read `skeleton/components/registry.md`.**
If a row fits, mount it and put the content in `data.js`. Schemas, mount examples, and
when-to-use notes live there (and in each component's README).

Three rules every component already enforces, keep honouring in the data you write:
one-way answer locks (sort, gate, true-false), scoreboards divide by the TOTAL,
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
Create `build/<slug>/`, write `build.json`, `tune.css`, `outline.json`, and
`parts/00-head.sections.html` (the `<header class="lesson-head">` block — main session only).
Split the extracted text per mapping into `src/<id>.txt` slices so agents read just one file.

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
Create exactly two files (write nothing else, change nothing else):
  parts/<NN>-<id>.sections.html    parts/<NN>-<id>.data.js

<slice>
Your SOURCE SLICE — teach ONLY from this text; never invent names, numbers, or examples that are not in it (the Section 7
assignment is exempt — dag-craft.md / question-craft.md govern its inventions):
<paste src/<id>.txt here; for derived sections paste the full source text instead>
</slice>

Your section: <title>   ← the ONLY <h2>, written verbatim, "&nbsp;" after the number ok
Hand in: one chain paragraph (2–4 sentences) continuing from <previous section's close>.
Hand off: close by leading into <next section's one-line purpose>.
Plan: <what this block teaches + which components mount, chosen from Part 2's architecture>

Hard rules (mechanically checked; violations fail the build):
- File starts <section class="block" id="<id>"> ends </section>. Exactly one <h2>.
  Subsection titles NEVER become headings — bold lead-ins inside boxes only.
- Classes available (no CSS to write): .def (box with <span class="tag">Name</span>),
  .mini (labelled mini box), .note y|g|b|p, .grid2, .hl (highlighted result),
  .cmp-wrap + table.tbl (wide table), MathML for formulas (§2.6), standard HTML.
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
  Its content goes in the .data.js file as: LN.data.<key> = {...};
  Read <skill-dir>/skeleton/components/registry.md for your components' schemas
  (that file only). Keys must start with your section id: <id>1, <id>2, ...
- If your section mounts `assignment`: the mode comes from `build.json`.
  **Default (no `"assignment"` key, or `"assignment": "dag"`):** read
  `<skill-dir>/skeleton/dag-craft.md` — it is your authoring law. Write
  `"mode": "dag"`, `title`, `scenario`, and `nodes[]` into `LN.data.<key>`
  (points included; build strips them). The orchestrator fans out one author
  agent per level with one independent reviewer per level before assembly —
  never write the whole graph in one pass.
- Only when `build.json` has `"assignment": "flat"`: do **not** author a graph.
  Read `<skill-dir>/skeleton/question-craft.md` first — it is your authoring law
  for every item (situational stems, per-type difficulty, ±1-word MC choices,
  single-flip tf, MILO blueprint ≥2 per MILO and none >30%). Author correct answers ONLY inside the
  data object (`ans` for mc/tf, `aliases` for id, `key_points` for sa, plus `rubric` (string) and `max_points` (positive integer)) — the
  build strips them from the shipped HTML (never rely on hiding) and derives
  the teacher's grading key from them. Every data item is a strict JSON object
  (the extractor `json.loads` the file). No feedback/score UI.
- No hex colours, no URLs, no @import, no <style>/<script> tags, no inline CSS.
- In the .data.js file never write a literal "</" followed by a letter — escape <\/.
- Keep the source's own phrasing in definitions and cases; edit for length only.
- When both files are written, reply exactly: done <key1> <key2> ...
```

**D. Assemble + loop.** `python build.py build/<slug>` — merges `parts/` in filename
order, enforces the outline contract (phantom/missing/drift/coverage/duplicate keys)
plus all other mechanical rules. Line numbers refer to the merged file; fixes go to the
owning `parts/NN-<id>.*` file, never to a hand-written combined file. Rerun until `OK`.

**D2. DAG assignment fan-out (the default; skip only when `assignment: "flat"`).**
Before D, build the graph level by level:

1. If `build.json` omits the `dag` block, Section 7 defaults to the maxed-out
   budget (`levels: 5, max_nodes: 16`). Ask the user only if they want a smaller
   graph, then write `"dag": {"levels": 2..5, "max_nodes": levels+1..16}`.
2. Blueprint: map MILOs → layers; draft the gold path; reserve ids for later
   layers; track remaining `max_nodes`.
3. For `level = 0 .. levels-1` (serial — later levels need earlier ids):
   - **Author agent** (`task`, general): lesson slice + gold-path state +
     reserved ids + remaining budget + `dag-craft.md` → strict JSON nodes at
     this level only.
   - **Reviewer agent** (separate, skeptical, sees only this level's diff +
     `dag-craft.md` + lesson slice): checklist in dag-craft.md → `pass` or
     `fail` + rewrite list. `fail` → same author rewrites (max 2 retries, then
     ask the user).
4. Assemble the stitched `nodes[]` into `data.js`, then run D (build.py is the
   final mechanical gate; feed any `assign` errors back to author+reviewer for
   the failing nodes only).

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
  desktop theme margins and unclamped grids squeezing inputs at phone widths.
  A pass with the shipped components is expected; any new
  §3.3 element or component edit must be re-checked here (both widths).
  If the tool reports no Chrome/Edge (prints `LAYOUT SKIP`), install one or set
  `LN_CHROME` and re-run — a skip is not a pass.
- **Formulas (§2.4).** Write each calculation, compare to source text; recompute every
  worked example by hand; confirm lab, presets, solvers and sensitivity agree on the same
  inputs, **and that every calc also appears in the section prose — a number that lives
  only inside a widget fails QA**. Multi-product presets use the **weighted-average** P
  and VC, never one product. Report as *Formula · Code · Source · ✓/✗*. On a
  **`specification`** source the **Source** column becomes **Citation** — and the test
  is stricter, not looser: the citation must name a document the student could
  look up (Circular No. 781, Appendix 59, Basel Framework RBC30 / CRE20.4, a
  statute, a textbook page), and a reference back to your own `src/` prose is a
  ✗. When you cannot produce a real citation for a number, the number does not
  ship — same as a source-only violation.
- **Figures (§2.5).** Every plotted point traces to a source number (or, on a
  `specification` source, to a cited one); axes labelled; the picture agrees with
  the prose.
- **Interactivity semantics.** Every activity's data actually teaches its concept; T/F
  items are situational near-misses, not trivia; explanations name the trap.
  Activity items stay easy→medium (the hard tier is the assignment's job):
  where a component renders reasoning (true-false `e`; sort-statement and
  case-match optional `e`), wrong-pick feedback names the slip.
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
  before announcing OK — it walks both decks (flat and dag) and fails if any
  type strands the student with Next disabled (the Week 7 id/sa class: typed
  answers updated state without refreshing the nav, because `show()` is the sole
  recompute point for `next.disabled` and the progress dots).
  **Dag (the default):** confirm student HTML contains **no** `"points"` string
  inside the assignment object, `build/key/*-key.json` has `mode:"dag"` + the
  resolved `levels`/`max_nodes` + `optimal.max_score`, and every node passes
  dag-craft's reviewer checklist (spot-check one node per level).
  **Flat (`"assignment": "flat"`):** judge every item against
  `skeleton/question-craft.md`: 20 items in the 10/4/4/2 mix, the copy test (no
  stem answerable by lifting a sentence of prose), tf single-flip quality, stems
  ≤60 words and self-contained, MC answer position used ≤4×, and the blueprint
  (every MILO ≥2 items, none >30% of the deck). Recompute every invented item's
  answer independently — a wrong key is invisible to students (assignment
  extension of §9.2).

## Part 6 — Content principles (unchanged from v1.9)

1. Use the lesson's own numbers and names; never invent parallel examples in the
   lesson body — Section 7 assignment items are exempt (§9.1's lesson-body
   scope; dag-craft.md / question-craft.md govern their invention rules).
2. Definition, then example — short. `.def`/`.mini` by default, prose only to connect.
3. Use the lesson's own world for the design (the pack pick, then the tune).
4. Interaction before explanation: let the student find the number, then show the reasoning.
5. Plain-language readout: never leave a student staring at `BEP = 562.5`.
6. Sensitivity over single answers.
7. The assignment collects; it never reveals. Feedback lives in `build/key/`.
8. Preserve the source's voice.

## Part 7 — Reference implementation

The skeleton **is** the reference: `skeleton/shell.html` (chrome, vocabulary CSS, LN
runtime), `skeleton/themes/` (six packs), `skeleton/components/` (registry + 23
registered components, each with README, plus `port-lab` pending promotion (§9.4)). `build.py` is both assembler and validator; running it
without arguments prints usage. A complete worked example ships at `sample/lesson-demo/`
(Week 4 break-even lesson, parchment pack tuned to "tumba-tapa"; flat assignment pinned
with `"assignment": "flat"`; monolith sections/data plus
a valid `outline.json` showing the contract) — build it with
`python build.py sample/lesson-demo` from this skill folder; the notebook lands in the
current directory. The assembled output is
read-only; never hand-edit it.

Tools in `tools/`: `assignment_smoke.js` (deck walkthrough), `activity_smoke.js`
(activity feedback), and `layout_smoke.js` (rendered overflow/clip gate, §1.5) —
`node tools/<name>.js` each. `layout_smoke.js` needs Chrome or Edge; point `LN_CHROME`
at the executable if it is not in a standard location. Append `--width 390`
for the phone-viewport pass (Node 22+, true 390 CSS px via device emulation).

## Part 8 — Opening message

Open with the plan, then build immediately. Ask only if a formula is ambiguous, a
required input is missing, or the source exceeds §2.3 limits.

```
Reading: <filename>   (source: teaching | specification)
Inventory: <N> source titles captured (verbatim) → <M> notebook sections; dropped: <list or none>
Theme: <pack> tuned — "<anchor noun from the source>"   (or "derived — <why no pack fits>")
Layout: app — pinned per v2.12
Assignment: dag — levels <L>, max_nodes <M> (default 5/16; flat only if requested)
Outline map: <source title → notebook §N> [REQUIRED — the outline.json mapping]
MILO coverage: <MILO letter → teaching section + exercising component> [REQUIRED]
Components: <list from registry, or NEW via extra files>
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
- **Lesson-body scope.** This ban governs the teaching content. The Section 7
  assignment is exempt: situational items may invent actors, numbers, and
  scenarios — their constraint is *answerability*, governed by
  `skeleton/dag-craft.md` (default dag) or `skeleton/question-craft.md` (flat):
  every concept needed was taught; every fact needed sits in the stem. Flat SA
  `key_points` remain facts the notebook teaches.
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
term-order mapping, no `&#…;` refs, no U+FFFD, and `node tools/layout_smoke.js
<built.html>` prints `LAYOUT OK` at desktop width **and** with `--width 390`
(no spill, no clip — §1.5).
