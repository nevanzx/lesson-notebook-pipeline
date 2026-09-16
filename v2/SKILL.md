---
name: interactive-lesson-notebook
version: 2.1
description: Convert a lesson PDF, text, or slide deck into a single
  self-contained interactive HTML notebook. Use when the user supplies
  course material and asks for an interactive, learn-by-doing version.
  Produces one .html file with no external dependencies, a visual design
  derived from the lesson's own subject matter, live calculators,
  self-check activities, and a hard situational quiz. For long lessons it
  fans out per-section subagent writers via plan.json + sharded parts;
  monolith v2.0 workdirs still build unchanged. Do NOT use for
  marketing pages, dashboards, or content without pedagogical intent.
---

# Interactive Lesson Notebook (v2.1 — component pipeline + fan-out)

## Purpose

Turn a linear lesson into one self-contained `.html` file a student opens offline.
Two rules still govern everything:

1. **Every concept gets an interaction** — a calculator, a sorter, a scenario, or a decision.
2. **The design comes from the lesson** — pick the pack closest to the subject and retune
   it with the lesson's own nouns. Never ship a pack untuned; never ship the same look twice.

What v2.0 changes: the mechanics (shell, component code, print rules, parsers, validators)
are **shipped assets**. You write only lesson content — four small files — and a Python
assembler builds and mechanically QA-checks the notebook.

What v2.1 adds: **fan-out authorship**. On long lessons one agent's context goes
description-first and quality drifts; so a whole-lesson planner (the orchestrator)
scripts the outline, hand-offs and glossary up front, and one **section writer per
shard** authors just its section from a brief + its slice of the source. Mechanics
still live in assets; `build.py` now also validates the plan and can lint a single
shard. The monolith flow below (4A) is unchanged and still the default for ≤3 pages
or harnesses without subagents.

## When to use

Trigger when ALL are true: user supplies lesson/course material with concepts to teach,
and asks for "interactive", "notebook", "self-contained", or similar.
Do NOT trigger for marketing pages, dashboards, single-topic explainers without pedagogy.

## Inputs required

| Input | Default if unspecified |
|---|---|
| Lesson source | required |
| Visual design | **you pick a theme pack + tune it** from the source's subject (§1.2) |
| Assessment | True/False, hard & situational, self-check (ungraded) |
| Numeric entry | currency symbols, commas, decimals, with tolerance (shipped in LN.num) |
| Currency symbol | infer from source (₱, $, €) |
| Output size | scale to source (§2.3) |

## Part 1 — The pipeline (read once per lesson)

### 1.1 The four files you write

Workdir: `build/<lesson-slug>/`. Create exactly:

| File | Contents |
|---|---|
| `build.json` | title, theme, components list, output name (+ optional extra_css/extra_js) |
| `tune.css` | `:root{ --token: value; }` overrides only — colours, display voice. 10–25 lines |
| `sections.html` | all teaching content: `section.block` bodies, prose, `.def`/`.mini`/`.note`, component mounts |
| `data.js` | every interactive element's content: `LN.data.<key> = { ... };` |

**Fan-out layout** (instead of `sections.html` + `data.js`, with a `plan.json` —
`build.json`, `tune.css` unchanged): `sections/<stem>.html` + `data/<stem>.js` per
section (`00-overview`, `0G-glossary`, `1-concepts`, …), filename-sorted into one
stream. `build.py` auto-detects the layout; mixing monolith + shards is an error.
Each shard owns ids `sN.*` and data keys `sN*` (prefixes from the plan) — enforced.

Then run: `python <skill>/build.py build/<lesson-slug>` — it assembles the single
`.html` and refuses to write it unless every mechanical check passes (exit 1 +
itemized report: rule, file, line, fix). Loop: fix the parts, rerun, until `OK`.

`build.json` schema:

```json
{
  "title": "Week 4 — Feasibility Analysis",
  "theme": "receipt",
  "components": ["sort-statement", "break-even-lab", "true-false", "flipcards"],
  "output": "Week4-Notebook.html",
  "extra_css": "optional/extra.css",
  "extra_js": "optional/extra.js"
}
```

### 1.2 Pick + tune the theme

Six business-focused packs (`skeleton/themes/`):

| Pack | Reads as | Good for |
|---|---|---|
| `ledger` | green-bar ledger paper | accounting, finance |
| `receipt` | thermal receipt | entrepreneurship, retail |
| `contract` | stamped agreement, wax seal | law, taxation |
| `filecard` | punched index card / manila file | HR, office admin |
| `boardmemo` | taped board memo | management, marketing strategy |
| `graph-paper` | squared graph pad | economics, statistics |

Procedure: pick the closest pack → in `tune.css` retune **token values only** from the
lesson's own nouns (accent from the anchor's colour, display voice, tracking).
Textures and `.decor` motifs stay the pack's. `tune.css` containing any structural rule
(`.card{...}`) is rejected by the build.

No pack fits (e.g. a lesson on circuits)? Derive a skin by hand into `tune.css` — set
every colour token, nothing structural — and note in the opening message that the result
is a candidate for promotion to a 7th pack (§3.3).

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
- Inside `data.js`/`extra.js` never write a literal `</` + letter (breaks the script tag);
  escape as `<\/` or pass plain text and let components use textContent.
- Mount only registered components (list in build.json; schemas in the registry).

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
| `<!--__SECTIONS__-->` | your sections.html |
| `/*__DATA__*/` | your data.js |
| `/*__COMPONENT_JS__*/` | selected components' JS + init glue |

The assembled file is a **read-only product**: fixes go to the parts, then rebuild.

## Part 2 — Section architecture (content judgment — unchanged from v1.9)

Every lesson gets this structure unless the source clearly demands otherwise:

| # | Section | Always includes | Interactive element |
|---|---|---|---|
| 0 | Overview & Outcomes | title, "how to use", MILO list | `milo-list` |
| G | Glossary (§2.0) — between Overview and Section 1 | one-line definition of every technical term used anywhere | `glossary` |
| 1 | Concept A vs Concept B | definitions, purpose, comparison | `sort-statement` + `comparison-table` |
| 2 | Framework / Domains | one definition box + case per domain | `feasibility-gate` |
| 3 | The Calculator / Lab | formula, components, method | `break-even-lab` (centrepiece) |
| 4 | Worked Examples | every numeric example from the source | `step-solver` |
| 5 | Sensitivity | operating leverage, what-if | lives inside `break-even-lab` |
| 6 | Limitations | where the technique fails | `ranked-statements` / `case-match` |
| 7 | Self-Check | 7–12 hard situational items | `true-false` |
| 8 | Recap | 6 flip cards + closing note | `flipcards` |

**Section 3 is the centrepiece.** Give it the most space and the best interaction.

### 2.0 The Glossary section (mandatory)
Its own block right after §0, linked from the TOC (number it `0G`). A term earns a line if
it is *technical* and appears **anywhere** — exposition, prompts, feedback, quiz. Keep the
source's own phrasing, edited only for length. The `.def`/`.mini` boxes remain the
teaching exposition; the glossary is the lookup. Duplication is intentional.

### 2.1 Melding outlined sources
When the source is Lesson → Section → Subsection with content only under subsections:
the **section is the unit of exposition** — one melded block per source section;
subsection titles never become notebook headings (bold lead-ins at most). Build the MILO
dependency list (per outcome verb: which terms, definitions, numbers, comparisons it
needs), cut everything not on a list, keep every listed fact intact.
**Default to `.def`/`.mini` (definition + labelled example) over flowing narrative**;
reserve prose for the connective tissue: every melded section opens with a two-to-four-
sentence chain paragraph leading from the previous answer to this question and closes
by handing off. **Terseness inside boxes, connection between them.** Hard floor: if a cut
leaves any MILO untaught or unexercised, restore content. Record the `Outline map` and
`MILO coverage` lines for the opening message (§8).

**Definition-first worked pair** (canonical bad → canonical good):

> BAD: *"Plot yields against time to maturity — same credit class, same currency — and
> the stack becomes a line: the term structure of interest rates."* (metaphor before
> concept; the definition is buried in a scene)
>
> GOOD: `<div class="def"><b>Term structure of interest rates</b> — a plot of yields
> against time to maturity for same-credit, same-currency bonds.</div>` then each
> shape (`normal`, `inverted`, `flat`) and each theory (`expectations`, `liquidity
> premium`, `market segmentation`) defined in the same way; metaphor and mnemonic
> ("a bank's licence to borrow short, lend long") may appear only *after* the `.def`.

### 2.2 If the lesson has no calculation
Skip Sections 3/4; replace with ONE of: `ranked-statements` (ordering), `sort-statement`
as an argument sorter (supports/contradicts), `feasibility-gate` with criteria as domains,
or `case-match`. Sections 5/6 may compress into the recap. Preserve 0, G, 1, 7, 8.

### 2.3 Scaling to lesson size
≤3 pages → sections 0, 1, core activity, 7, 8. 4–15 pages → full build. 16–40 → expand
case bank and quiz to 15–20 items **and use the fan-out flow (4B)**. **>40 pages → ask
the user before proceeding.**
Never pad short lessons with empty sections.

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

## Part 4 — Build order

### 4A — Monolith (default)

1. Read the source; run the §2.1 meld decision and the §1.2 pack pick.
2. Create `build/<slug>/`; write `build.json` and `tune.css`.
3. Write `sections.html` — headings + vocabulary classes + mounts only (no CSS).
4. Write `data.js` — all activity content, using the lesson's own numbers and names.
5. `python build.py build/<slug>` → read the report → fix parts → rerun until `OK`.
6. Judgment QA pass (Part 5). Then hand over, and propose any promotions (§3.3).

### 4B — Fan-out (lessons ≥ 4 pages or 16–40 pages, per §2.3)

1. Read the whole source once. Run the §2.1 meld decision and the §1.2 pack pick.
   Stage normalized source text at `build/<slug>/source/<slug>.txt` with line numbers.
2. Write `build/<slug>/plan.json`: `title`, `theme`, `glossary_terms` (locked list:
   every technical term + one-line source-phrased def), and one shard entry per
   notebook section — `id` (`0`, `G`, `1`…`8`), `section`, `files`
   (`sections/NN-slug.html`, `data/NN-slug.js`), `components` (registry names),
   `key_prefix` (`sN`), scripted `open_handoff` / `close_handoff` sentences,
   `must_teach` (facts pulled from the MILO dependency list), `source_excerpt`
   pointer (`source/<slug>.txt#lines=A-B`).
3. **Plan approval gate:** present the §8 opening message — it *is* the announced
   outline map; get user approval before dispatch.
4. Dispatch one writer per shard (harness subagent tooling). No subagents? Run the
   identical briefs serially yourself, one shard per turn, touching only that shard's
   two files until all are written.
5. Writer (per brief, Appendix A): reads **only** the brief + its `source_excerpt`,
   writes its two files, runs `python <skill>/build.py <workdir> --lint <shard-id>`,
   fixes, reruns until `LINT OK`. Returns: shard paths + lint confirmation.
6. Orchestrator runs the full build. Cross-cutting failures (id collisions, plan ↔
   build.json, contrast, markers) → fix yourself. Concentrated shard failures →
   re-dispatch a **fix brief** (itemized report lines + original brief + the shard's
   current text). Loop until `OK`. The assembled file stays read-only.
7. Judgment QA (Part 5, incl. definition-first + glossary stragglers).
8. Hand over; propose promotions (§3.3) as usual.

## Part 5 — QA pass (judgment only; mechanical checks are owned by build.py)

Mechanical, and therefore already enforced: marker hygiene, hex containment, external
assets, id uniqueness/section ids, mount/data-key integrity, well-formed HTML, WCAG
contrast floors, semantic hue lock, tune-token rule, print block.

Still yours to verify — build.py cannot read intent:
- **Formulas (§5.1).** Write each calculation, compare to source text; recompute every
  worked example by hand; confirm lab, presets, solvers and sensitivity agree on the same
  inputs. Multi-product presets use the **weighted-average** P and VC, never one product.
  Report as *Formula · Code · Source · ✓/✗*.
- **Interactivity semantics.** Every activity's data actually teaches its concept; T/F
  items are situational near-misses, not trivia; explanations name the trap.
- **Meld/MILO (§2.1).** Dependency-list facts all survive; every MILO taught AND exercised;
  no subsection-heading leakage; shipped file matches the announced Outline map.
- **Design fit.** The pack+tune reads as the lesson's world and respects the subject's
  seriousness (bankruptcy is not a party). A tuned pack must not land visually on top of
  a previous lesson's output; packs are never shipped untuned.
- **Voice.** The source's own phrasing kept in definitions and cases, edited only for length.
- **Definition-first (§6.2).** Every load-bearing term in the shipped file maps to a
  `.def` that appears before first use in its section; prose that defines is rewritten
  to reference.
- **Glossary stragglers (§2.0).** Terms that made it into shards but not the locked
  plan list are added to the glossary block and `data.js` glossary entry (one targeted
  edit, rebuild).

## Part 6 — Content principles (unchanged from v1.9)

1. Use the lesson's own numbers and names; never invent parallel examples.
2. **Definition-first.** A named thing may not *appear* before it is *defined*. Every
   concept gets a `.def` line — genus + differentia, one sentence — before any prose,
   mnemonic, or scenario touches it. Chain paragraphs, `.mini` examples, and component
   readouts may only *reference* defined terms; they never carry load-bearing
   definitions. Writer self-test: *"could a student write the exam answer using only
   my `.def`/`.mini` boxes?"* Then the example — short. `.def`/`.mini` by default,
   prose only to connect.
3. Use the lesson's own world for the design (the pack pick, then the tune).
4. Interaction before explanation: let the student find the number, then show the reasoning.
5. Plain-language readout: never leave a student staring at `BEP = 562.5`.
6. Sensitivity over single answers.
7. Refuse to grade: self-checks are calibration; say so.
8. Preserve the source's voice.

## Part 7 — Reference implementation

The skeleton **is** the reference: `skeleton/shell.html` (chrome, vocabulary CSS, LN
runtime), `skeleton/themes/` (six packs), `skeleton/components/` (registry + 11
components, each with README). `build.py` is both assembler and validator; running it
without arguments prints usage. A complete worked example ships at `sample/lesson-demo/`
(Week 4 break-even lesson, receipt pack tuned to "tumba-tapa") — build it with
`python build.py sample/lesson-demo` from this skill folder. The assembled output is
read-only; never hand-edit it.

## Part 8 — Opening message

Open with the plan, then build immediately. Ask only if a formula is ambiguous, a
required input is missing, or the source exceeds §2.3 limits.

```
Reading: <filename>
Theme: <pack> tuned — "<anchor noun from the source>"   (or "derived — <why no pack fits>")
Outline map: <source section → notebook §N> [REQUIRED for outlined sources]
MILO coverage: <MILO letter → teaching section + exercising component> [REQUIRED]
Components: <list from registry, or NEW via extra files>
Sections: [0–8 you will build]
Formulas to verify: [list]
Building now.
```

In fan-out mode the opening message doubles as the plan approval gate (4B step 3):
add `Shards: <count> (one per section) — approve before dispatch.`

## Appendix A — Section-writer Brief (self-contained; writers never read SKILL.md)

    You are the SECTION WRITER for "<section title>" of "<lesson title>".
    Write exactly two files and nothing else:
      <workdir>/sections/<stem>.html   — one <section class="block" id="<key_prefix>.x"> … </section>
      <workdir>/data/<stem>.js          — only LN.data.<key_prefix>… assignments
    Read your source ONLY from: <source_excerpt pointer> (read those lines).
    Plan entry for your shard (authoritative — do not widen it):
      components: <json list>   key_prefix: <sN>   id prefix: <sN>.
    OPENING (first paragraph, near-verbatim): <open_handoff>
    CLOSING (last sentence, near-verbatim): <close_handoff>
    MUST TEACH (every line lands in a .def/.mini/mount): <must_teach list>
    LOCKED GLOSSARY (use these terms; do not define your own competitors):
      <term — def lines>
    HARD RULES: no hex colours anywhere; no http/@import/non-gradient url(); every
    mount is <div data-component="NAME" data-key="<key_prefix>NAME"></div> using only
    your components list, with the key defined in YOUR data file; never write "</ +
    letter in JS (escape <\/ or pass plain text); component content goes in data.js,
    never inline HTML.
    DEFINITION-FIRST CONTRACT: a named thing may not appear before it is defined;
    every concept gets a .def line (genus + differentia, one sentence) before any
    prose, mnemonic, or scenario touches it; chain paragraphs and readouts only
    reference defined terms. Self-test: could a student write the exam answer using
    only your .def/.mini boxes?
    BAD (metaphor before concept): "…the stack becomes a line: the term structure…"
    GOOD: <div class="def"><b>Term structure of interest rates</b> — a plot of yields
    against time to maturity for same-credit, same-currency bonds.</div> then shapes,
    then theories, each defined before used; colour prose only after the .def.
    SELF-CHECK until clean, then stop:
      python <skill>/build.py <workdir> --lint <shard-id>
    Report which .def/.mini carries each must_teach line.
