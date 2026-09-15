---
name: interactive-lesson-notebook
version: 1.9
description: Convert a lesson PDF, text, or slide deck into a single
  self-contained interactive HTML notebook. Use when the user supplies
  course material and asks for an interactive, learn-by-doing version.
  Produces one .html file with no external dependencies, a visual design
  derived from the lesson's own subject matter, live calculators,
  self-check activities, and a hard situational quiz. Do NOT use for
  marketing pages, dashboards, or content without pedagogical intent.
---

# Interactive Lesson Notebook

## Purpose

Turn a linear lesson (PDF, doc, slide deck) into a single self-contained
`.html` file that a student can open offline. The transformation follows two
rules:

1. **Every concept gets an interaction** — a calculator, a sorter, a
   scenario, or a decision. Never produce a wall of accordions.
2. **The design comes from the lesson.** A lesson about a bakery feels like
   a bakery. A lesson about circuits feels like a drafting table. Never ship
   the same look twice.

## When to use

Trigger when ALL are true:
- User supplies lesson / course material (not raw data, not a request for a web app).
- The material has concepts, definitions, examples, or calculations to teach.
- User asks for "interactive", "notebook", "self-contained", or similar.

Do NOT trigger for: marketing landing pages, admin dashboards, chat widgets,
single-topic explainers with no pedagogical content.

## Inputs required

Collect before building. If missing, apply the default and announce it.

| Input | Default if unspecified |
|---|---|
| Lesson source | required |
| Visual design | **Designed by you from the lesson's subject** (§1.1). Falls back to a warm ruled notebook only if the source has no derivable setting. |
| Assessment type | True/False, hard & situational, self-check (ungraded) |
| Numeric entry | allow currency symbols, commas, decimals, with tolerance |
| Currency symbol | infer from source (₱, $, €) |
| Output size | scale to source (see §2.3) |

## Output contract

Exactly ONE `.html` file:
- No CDN links, no external fonts, no build step.
- Opens by double-click, works fully offline.
- Vanilla JS (ES6). No frameworks.
- SVG drawn inline (never canvas) for any charts.
- **All colours flow through CSS custom properties** so the whole skin is
  one `:root` block, not a find-and-replace.
- Mobile-friendly, keyboard-accessible, respects `prefers-reduced-motion`.
- Print stylesheet so the recap prints cleanly.

---

## Part 1 — Design system

### 1.1 Designing the skin (do this first, before any CSS)

The design is not decoration. It is a memory hook: students recall the
break-even formula faster when the page looks like the bakery the formula
came from.

**Five-step derivation. Run it before writing markup.**

**Step 1 — Find the anchor.**
Scan the source for the concrete setting or artefact. Usually it is stated
outright: *"Maria's bakery"*, *"a t-shirt printing shop"*, *"the school
canteen"*, *"a rice farm in Nueva Ecija"*. If the source is abstract, use
the **artefact the practitioner actually works on**: an accountant reads
ledger paper, an engineer reads blueprints, a programmer reads a terminal,
a literature student reads a bound book.

**Step 2 — Extract the palette from that anchor.**
Name the object behind each colour. Flour white, crust brown, oven-char
black, tomato red. Blueprint cyan on navy. Ledger green bars. Do not invent
a palette from a mood board — if you cannot say "this colour is the colour
of X in the source", cut it.

**Step 3 — Choose one surface treatment.**
A single repeating motif that reads as the anchor's material: ruled lines,
graph grid, dot grid, ledger columns, scanlines, paper grain, plain matte.
One. Not three.

**Step 4 — Choose the display voice.**
The type personality for headings and margin notes (handwritten, mono,
serif, tight sans, wide-tracked caps). Plus one sheet-edge motif: punched
holes, tape, binder clip, spiral, title block, staple, seal.

**Step 5 — Sanity-check it.**
- Body text ≥ 4.5:1 on the surface. Display text, chart strokes, borders ≥ 3:1.
- The five `--sec-*` tints stay pale enough that sticky notes and `--surface-2`
  cards still pop on top of them (§1.3).
- The design does not fight the content's seriousness. A lesson on terminal
  illness is not styled as a candy shop. A lesson on bankruptcy is not styled
  as a party.
- Every choice is traceable to a noun in the source.

**Write the anchor down.** In the opening message you will state
`Design: <one-line description> — from "<anchor noun from the source>"`.
If no anchor exists, say so, and fall back to a warm ruled notebook.

**Design once, then freeze.** Commit to the token block before writing
markup. Retro-fitting a skin is a find-and-replace nightmare.

**Do not reuse a design you have shipped before.** The point of this step is
that each lesson looks like its own world. If you catch yourself reaching
for a familiar combination, re-derive.

### 1.2 Design tokens (semantic layer — copy verbatim)

These are **roles**, not colours. Fill in the values per §1.1. The component
CSS never changes; only this block does.

```css
:root{
  /* ---- surface ---- */
  --bg:#e9eef4;            /* page behind the sheet */
  --surface:#fffdf8;       /* the sheet itself */
  --surface-2:#ffffff;     /* cards sitting on the sheet */
  --grid:#eef4fa;          /* repeating texture lines */
  --grid-strong:#dde7f2;   /* major gridline every 5th, if the motif wants one */
  --edge-line:#e9a6a6;     /* vertical accent stroke; use transparent if N/A */
  --decor:#e6d9c2;         /* holes, tape, clips, binding */

  /* ---- ink ---- */
  --ink:#23272f;
  --ink-soft:#5c6472;
  --ink-faint:#8b93a1;

  /* ---- accents ---- */
  --accent:#2f6fb5;        /* primary: links, revenue line, active tabs */
  --accent-deep:#1d4f8a;
  --accent-2:#c9622f;      /* secondary: cost line, alternate series */
  --highlight:#ffe9a3;     /* section-title highlighter strip */

  /* ---- semantic feedback. Hue family is FIXED. See §1.4. ---- */
  --green:#2f8f5b; --green-bg:#e6f6ec;
  --amber:#b8791a; --amber-bg:#fdf3e0;
  --red:#c0432f;   --red-bg:#fdecea;

  /* ---- note tints (keep all four distinguishable) ---- */
  --note-yellow:#fff8c9; --note-green:#d9f2e2;
  --note-blue:#dceafa;   --note-pink:#fbdcdc;

  /* ---- section tints: one pastel per section, cycled (§1.3).
     Translucent so the sheet texture shows through; pale enough
     that --surface-2 cards and the four sticky notes still pop
     against them. Alpha ≤ .35. ---- */
  --sec-1:hsl(42 75% 72% / .26);   /* honey  */
  --sec-2:hsl(150 40% 58% / .22);  /* sage   */
  --sec-3:hsl(210 55% 68% / .24);  /* sky    */
  --sec-4:hsl(350 55% 72% / .22);  /* rose   */
  --sec-5:hsl(185 45% 58% / .22);  /* teal   */

  /* ---- chart. Every SVG stroke/fill reads from these. ---- */
  --chart-rev:var(--accent);
  --chart-cost:var(--accent-2);
  --chart-profit:var(--green);
  --chart-loss:var(--red);
  --chart-axis:var(--ink-faint);
  --chart-grid:var(--grid-strong);
  --chart-label:var(--ink-soft);

  /* ---- form ---- */
  --radius:12px;
  --shadow-sm:0 1px 2px rgba(30,40,60,.07);
  --shadow:0 1px 2px rgba(30,40,60,.06), 0 10px 26px rgba(30,40,60,.08);
  --shadow-lg:0 2px 6px rgba(30,40,60,.08), 0 22px 48px rgba(30,40,60,.12);

  /* ---- type primitives ---- */
  --hand:"Segoe Print","Bradley Hand","Chalkboard SE","Comic Sans MS",cursive;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:"SFMono-Regular",Menlo,Consolas,"Liberation Mono",monospace;
  --serif:Georgia,"Iowan Old Style","Times New Roman",serif;

  /* ---- type role (you set this per §1.1 step 4) ---- */
  --display:var(--hand);
  --display-tracking:0;
  --display-transform:none;
}
```

**No hex may appear outside this block** and its texture/decoration rules
in §1.3. A component that hard-codes a colour breaks the moment you change
your mind about the skin — and you will.

### 1.3 Surface and decoration

Three things carry the skin: the sheet background, the optional edge stroke,
and the `.decor` motif. Style them with pure CSS — gradients, borders, and
pseudo-elements only. No image URLs, no icon fonts, no SVG sprite files.

```css
/* Example: a ruled-paper skin. Replace with your §1.1 derivation. */
.sheet{
  background:
    repeating-linear-gradient(to bottom, transparent 0 31px, var(--grid) 31px 32px),
    var(--surface);
}
.sheet::before{                       /* vertical edge stroke */
  content:""; position:absolute; inset:0 auto 0 92px; width:2px;
  background:var(--edge-line); opacity:.75;
}

/* .decor = one absolutely-positioned, aria-hidden motif element.
   Each skin styles it with pseudo-elements: punched holes, a tape strip,
   a binder clip, a title block, a spiral, a wax seal, a staple. */
.decor{
  position:absolute; inset:0; pointer-events:none;
  /* ...per-skin rules... */
}
```

If your derivation produces no natural edge line, set `--edge-line:transparent`
and either drop `.sheet::before` or repurpose it. If it produces no natural
motif, give `.decor` a minimal treatment (a subtle inner border, a corner
fold) rather than inventing one — an empty motif is better than a fake one.

**Section tints are mandatory, not optional.** A reader scrolling a long sheet
must feel where each section begins before they read its heading. Every
`section.block` wears one pastel from the `--sec-*` cycle, assigned by
position — never hand-tinted per section, so any skin change stays a
`:root`-only edit:

```css
section.block{
  background:var(--sec-1);
  border-radius:var(--radius);
  padding:22px 26px; margin-bottom:26px;
}
section.block:nth-of-type(5n+2){background:var(--sec-2)}
section.block:nth-of-type(5n+3){background:var(--sec-3)}
section.block:nth-of-type(5n+4){background:var(--sec-4)}
section.block:nth-of-type(5n+5){background:var(--sec-5)}
```

Tints are **translucent** (the sheet texture must show through) and **paler
than the four sticky-note tints** — a note and its section can never be the
same colour family at the same strength, or the note disappears into its own
background. Cards keep `--surface-2`, which now does double duty: it reads as
“card on tinted section” for free.

### 1.4 Rules the design must obey

1. **Semantics are not designable.** `--green` stays green-family, `--red`
   stays red-family, `--amber` stays amber-family. You may shift hue,
   saturation, and lightness to fit the skin — you may not make "correct"
   purple or "incorrect" teal. Colour-blind students and the colour-alone
   accessibility rule (§5.5) both depend on this.
2. **Contrast floor.** Body text ≥ 4.5:1 on `--surface` **and on every
   section tint** (check against the darkest `--sec-*` composite). Display
   text, chart strokes, and borders ≥ 3:1. Check `--ink-faint` against
   `--grid` too — it is used for axis ticks.
3. **No external assets.** Textures are pure CSS. No URLs, no `@import`,
   no `url()` with a non-gradient argument.
4. **Design the chrome, not the content.** A skin changes surface, texture,
   type, accent, and the `.decor` motif. It never adds clipart, emoji,
   illustrations, or decorative text that is not in the source. That is how
   this format turns into a marketing page.
5. **Dark skins are opt-in and expensive.** If the anchor genuinely lives on
   a dark screen (a terminal, a night lab, a stage), a dark skin is correct —
   but it requires re-tinted chart colours (already handled if the SVG reads
   the `--chart-*` vars), reworked `--shadow`, and the print override below.
   Do not reach for dark because it looks modern.
6. **One skin per file.** Bake it in. No theme switcher — that is a
   dashboard feature, not a study tool.

### 1.5 Layout skeleton

```
.app  (flex)
├── .sidebar   (sticky, 274px)   → brand, TOC, progress bar, reset button
└── .stage
    └── .sheet  (designed surface)
        ├── .decor   (motif: holes | tape | clip | spiral | title block | …)
        └── .content (padding-left 116px to clear the edge line)
```

The sidebar carries the same skin — it is not a separate white panel. Use
`--surface-2` for it, with a `--shadow` and a `--grid` divider.

**Responsive:** sidebar becomes an off-canvas drawer under 1024px with a
floating ☰ button and a scrim overlay. Under 600px, drop `.content`'s left
padding and hide `.decor` — the motif crowds small screens. Any table with
4+ columns must sit in an `overflow-x:auto` wrapper (`.cmp-wrap`) with a
`min-width` under ~640px — squashed one-word-per-line cells are the most
common phone failure — plus a "swipe the table" hint that is
`display:none` by default and revealed only inside that media query.

### 1.6 Typography rules

- Section headings: `font-family:var(--display)` with `letter-spacing:var(--display-tracking)`
  and `text-transform:var(--display-transform)`, plus a skewed
  `var(--highlight)` strip behind the text via `::after`.
- Body: sans, 16px, line-height 1.62.
- Numbers, formulas, chips, TOC counters: mono, always.
- `.hl` = highlight span; `.hl-g` = green highlight span.

### 1.7 Print override (mandatory)

```css
@media print{
  :root{
    --bg:#fff; --surface:#fff; --surface-2:#fff;
    --grid:transparent; --grid-strong:transparent;
    --sec-1:transparent; --sec-2:transparent; --sec-3:transparent;
    --sec-4:transparent; --sec-5:transparent;
    --ink:#000; --ink-soft:#333; --ink-faint:#555;
    --shadow:none; --shadow-sm:none; --shadow-lg:none;
  }
  .sheet{ background:#fff !important; }
  .sheet::before, .decor, .sidebar, .no-print{ display:none !important; }
}
```

### 1.8 Content vocabulary (reusable classes)

| Class | Purpose |
|---|---|
| `section.block` | One teaching section. **Wears one pastel tint from the `--sec-*` cycle (§1.3)** — positional, never hand-picked |
| `.def` | Accent-bordered definition box with `Definition` tag. **Default unit of exposition** — definition + a labelled example, not a paragraph restating the same term (§2.1) |
| `.gloss` | Term/definition list for the mandatory Glossary section (§2.0) |
| `.note.y / .g / .b / .p` | Sticky-note callout (yellow/green/blue/pink) |
| `.card` | Neutral `--surface-2` card for worked content |
| `.mini` | Small grid card (used in 2- and 4-column grids) |
| `.grid2` / `.grid4` | Responsive 2- or 4-column card grid |
| `.data-strip` + `.chip` | Horizontal row of mono chips for inputs |
| `.step` | One numbered solver step |
| `.fb.ok / .no / .info` | Feedback banner (green/red/blue) |

---

## Part 2 — Section architecture

Every lesson gets this structure unless the source clearly demands otherwise:

| # | Section | Always includes | Interactive element |
|---|---|---|---|
| 0 | Overview & Outcomes | Lesson title, "how to use", learning outcomes list | Click-to-tick MILO list with progress ring |
| G | Glossary (§2.0) — between Overview and Section 1 | One-line definition of every technical term used anywhere in the notebook | (static lookup) |
| 1 | Concept A vs Concept B | Definitions, purpose, comparison table | Sort-the-statement game |
| 2 | Framework / Domains | One definition box + case application per domain | Feasibility gate (multi-domain judgment → verdict) |
| 3 | The Calculator / Lab | Formula, components, 6-step method | Live sliders + SVG chart + plain-language readout |
| 4 | Worked Examples | Every numeric example from the source | Step-checked solver per example |
| 5 | Sensitivity | Operating leverage, what-if reasoning | Live ±10% sensitivity table |
| 6 | Limitations | Where the technique fails | Extended case showing the gap |
| 7 | Self-Check | 10 True/False, hard, situational | Per-question explanation + running score |
| 8 | Recap | 6 flip-cards + closing note | (static, print-friendly) |

**Rule:** Section 3 is always the centrepiece. Give it the most space and
the best interaction. If the lesson has no calculation, apply §2.2.

### 2.0 The Glossary section (mandatory, before the teaching sections)

Every notebook ships a Glossary between the Overview and Section 1, so the
student meets each technical term once, in plain sight, before the lesson
starts using it in arguments and exercises.

- **Placement.** Its own numbered block directly after §0, linked from the
  sidebar TOC. Number it `0G` (keeps the §-references in body prose stable)
  or renumber every teaching section +1 — if so, update every in-text
  cross-reference such as "(§03)".
- **Coverage rule.** A term earns a glossary line if it is *technical* and
  appears **anywhere** in the notebook: exposition, exercise prompts, answer
  feedback, or the quiz. The glossary is the lookup; the `.def`/`.mini`
  boxes remain the teaching exposition. Duplication is intentional — never
  drop a glossary line because the term is defined elsewhere, and never drop
  a `.def` box because the term is in the glossary.
- **Shape.** A `<dl class="gloss">` per theme group (systems, mechanism,
  failure types, instruments, case) in the lesson's own order. Each entry:
  a `<dt>` term in mono and a `<dd>` of one to two lines, in the source's
  own phrasing edited only for length.
- **Static and print-friendly.** No interaction is required here; spend the
  interaction budget on the teaching sections.

```css
.gloss{ margin:12px 0 16px; }
.gloss > div{ display:grid; grid-template-columns:190px 1fr; gap:12px;
              padding:7px 10px; border-bottom:1px dashed var(--grid-strong); }
.gloss dt{ font-family:var(--mono); font-size:13px; color:var(--accent-deep); }
.gloss dd{ margin:0; font-size:14.5px; color:var(--ink-soft); }
@media (max-width:600px){ .gloss > div{ grid-template-columns:1fr; gap:2px; } }
```

```html
<dl class="gloss">
  <div><dt>Term</dt><dd>One-line definition from the source.</dd></div>
</dl>
```

### 2.1 Melding outlined sources

**When this applies:** the source is outlined Lesson → Section →
Subsection and the content lives only under the subsections. Run this
before building any section content. Otherwise skip to §2.2.

**Step 1 — The section is the unit of exposition.** One melded exposition
block per source section. Subsection titles do NOT become headings — they
reappear at most as bold lead-in words inside the running text, or vanish
entirely. A notebook heading that reproduces a source subsection title is a
defect.

**Step 2 — Build the MILO dependency list.** Each MILO verb (explain X,
analyze Y, evaluate Z) names what the student must be able to do. List, per
MILO, the facts that depend on it: terms, definitions, numbers, comparisons,
and causal relations the verb requires.

**Step 3 — Cut everything not on a dependency list.** Keep every listed fact
(numbers, named cases, table rows) intact; drop restatements, connective
filler, generic prefaces, and elaborations that serve no MILO. An interaction
surface (sort game, gate, solver, T/F bank) may carry a listed fact instead of
a prose paragraph repeating it.

**Default to definition + example, not flowing narrative.** Unless the
source's own reasoning chain is itself something a MILO requires the student
to follow (e.g. a multi-step causal argument), render each concept as a
`.def` box — a one- or two-sentence definition, tag included — immediately
followed by a labelled `**Example:**` line pulled from the source's own case.
Group closely related concepts (2–4 of them) into a `.grid2`/`.grid4` of
`.mini` cards, each with the same short shape: a bolded term, a one-line
definition, an example. Reserve full prose paragraphs for the connective
tissue between concepts — why one leads to the next — not for restating a
single definition at length. A paragraph that only unpacks one term across
several sentences should almost always become a `.def`/`.mini` box instead.

**Terseness inside boxes, connection between them.** The default above
governs *inside* the definition boxes; it does not license deleting the
connective tissue *between* them. The §2.0 Glossary is the precondition for
this flow — terms are pre-taught there, so connective prose carries the
problem-to-answer chain instead of stopping to introduce vocabulary. Every
melded section opens with a two- to four-sentence chain paragraph — the
source's own reasoning that carries the student from the previous section's
answer to this section's question — before the first box appears, and closes
with a sentence or two that reads off the table or grid and hands off to what
comes next. A section that begins directly with a definition box or a card
grid is a defect even when every box is terse: the student meets the term
without ever meeting the problem the term answers. Likewise, a source list
that carries per-item reasoning (numbered procedures, multi-part
classifications, cause chains) keeps its numbered structure — compress the
wording of each item, never the count of items, and never end a `.def` on a
dangling colon pointing at the cards below it.

**Hard floor:** if a cut leaves any MILO untaught (no block or component
carries its facts) or unexercised (no interaction touches its verb), the cut
went too far. Restore content until every MILO is both taught and exercised.

The melded section content then fills the architecture table above — the
8-section template is unchanged. Record the result as the mandatory
`Outline map` and `MILO coverage` lines in the opening message (§8).

### 2.2 If the lesson has no calculation

Some lessons teach frameworks, chronology, or arguments — no numbers.

Skip Section 3 (Lab) and Section 4 (Worked Examples). Replace them with ONE
of the following, chosen by the content type:

- **Ranked statements.** Student drags or clicks 6–8 claims into a correct
  order (e.g. most → least important, earliest → latest).
- **Argument sorter.** Two-column classification: "supports the thesis" vs.
  "contradicts the thesis" — same mechanics as §3.1 Sort-the-Statement.
- **Prose scenario gate.** Same as §3.2 Feasibility Gate, but each "domain"
  becomes a criterion or perspective from the lesson.
- **Case-match.** Show 4 short scenarios; student matches each to the
  correct concept. Implement as four dropdowns with instant feedback.

Sections 5 (Sensitivity) and 6 (Limitations) can also be omitted or
compressed into the recap. Preserve Sections 0, G, 1, 7, 8 regardless.

### 2.3 Scaling to lesson size

| Source length | Target output | Sections to include |
|---|---|---|
| ≤ 3 pages | 600–900 lines | 0, 1, core activity, 7, 8 |
| 4–15 pages | 1 500–2 500 lines | All applicable; full 8-section build |
| 16–40 pages | 2 500–4 000 lines | All sections; expand case bank and quiz to 15–20 items |
| > 40 pages | split into two skills | Ask the user before proceeding |

Do not pad short lessons with empty sections.

---

## Part 3 — Component library

Six core components. Reuse these verbatim; vary content only. **Every
colour below resolves through a token** — never hard-code a hex in a
component, or the skin stops working.

### 3.1 Sort-the-Statement

**Purpose:** Distinguish two commonly confused concepts.

```js
const SORT_ITEMS = [
  { t: 'Statement text…', a: 'left' },   // a ∈ {'left','right','both'}
  // 8–12 items, roughly balanced
];
```

**Behaviour:** 3 buttons per item. On click, disable all buttons, mark the
picked one green/red, add a dashed green outline to the correct answer if
the pick was wrong. Update a live score chip. Reset button rebuilds state.

**Pitfall:** never allow a second click on an answered item.

### 3.2 Feasibility / Decision Gate

**Purpose:** Turn an abstract framework into a personal go/no-go judgment.

```js
const GATES = [{
  id: 'slug', name: 'Case name',
  lessonVerdict: 'go' | 'nogo',
  domains: [
    { d:'Domain', fact:'One-sentence finding from the source', v:'pass'|'marginal'|'fail' },
    // one per domain (usually 4)
  ],
  outcome: 'What the lesson concluded…'
}];
```

**Behaviour:** Tabs to switch cases. Each domain gets Pass/Marginal/Fail
buttons (colour-shifted when selected). "Submit" requires all domains
answered — otherwise shows an amber "judge all first" state. Verdict logic:

```
if any 'fail'      → NO-GO (red)
else if 'marginal' → CONDITIONAL GO (amber)
else               → GO (green)
```

Then reveal what the lesson actually concluded and whether the user matched.

**Pitfall:** persist answers per case, not globally — users switch tabs.

### 3.3 Live Calculator / Lab

**Purpose:** The anchor interaction. Let the student *feel* the formula.

**Layout:**
- Left column: 3–4 sliders (FC, P, VC, expected volume) + preset chips.
- Right column: inline SVG chart + results strip + plain-language readout.

**Formula handling:**

```js
const cm  = p - vc;
const cmr = p > 0 ? cm / p : 0;

if (cm <= 0) {
  // guard: show "no break-even possible", clear chart, wipe sensitivity
  return;
}
const bep    = fc / cm;
const bepRev = bep * p;
const mos    = exp > 0 ? (exp - bep) / exp : NaN;
```

**The plain-language readout is non-negotiable.** Never just show numbers.
Compose a sentence from the results, e.g.:

> *"You must sell **563 units** per month — roughly **18.8 per day** —
> to cover all costs. At your expected 750 units you clear break-even by
> 187 units — a comfortable margin of safety."*

Branch on `mos`:
- `mos < 0` → warn (red card)
- `0 ≤ mos < 0.15` → neutral, mention thin margin
- `mos ≥ 0.15` → good (green card)

**Axis-scaling helper** (include verbatim before the chart drawing code):

```js
// Picks a visually pleasing axis maximum: 1, 1.5, 2, 2.5, 3, 4, 5, 7.5 or 10 × 10ⁿ.
function niceMax(v){
  if (v <= 0) return 10;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / e;
  const m = n <= 1   ? 1   : n <= 1.5 ? 1.5 : n <= 2   ? 2
          : n <= 2.5 ? 2.5 : n <= 3   ? 3   : n <= 4   ? 4
          : n <= 5   ? 5   : n <= 7.5 ? 7.5 : 10;
  return m * e;
}
```

**SVG chart spec** (drawn fresh on every input):
- ViewBox `0 0 560 340`. Margins L78 R22 T22 B52.
- `niceMax()` picks axis maxima.
- Loss triangle: `(0,0) (BEPx, BEPy) (0, FC)` filled `var(--chart-loss)` at 14% opacity.
- Profit triangle: `(BEPx, BEPy) (xMax, P·xMax) (xMax, FC+VC·xMax)` filled `var(--chart-profit)` at 14% opacity.
- Revenue line: `stroke="var(--chart-rev)"`, 2.6px, from origin.
- Total-cost line: `stroke="var(--chart-cost)"`, from `(0, FC)`.
- Dashed FC horizontal line, `stroke="var(--chart-axis)"`, labelled `"FC ₱…"` at the right edge.
- BEP marker: dot + dashed guides + `"BEP 563"` label, `fill="var(--chart-label)"`.
- Axis titles `"Units sold per month"` and `"₱"` (rotated), `fill="var(--chart-label)"`.
- Legend top-left: Revenue / Total cost.
- Empty state (`cm ≤ 0`): solid `var(--surface)` + `var(--chart-loss)` message text, no axes.

**Skin note:** the chart must re-tint automatically if you revise the
palette. The only way that happens is if every `stroke`/`fill` above is
written as a `var()` — including the axis and label colours. Do not use
`currentColor` for the series lines; they must stay distinguishable from
each other.

**Pitfall (we hit this):** if you offer presets, each preset must produce
the same BEP the lesson's text states. For a multi-product preset, use the
**weighted-average** P and VC, not one product's values:

```
avgP  = Σ(mixᵢ × Pᵢ)
avgVC = Σ(mixᵢ × VCᵢ)
```

### 3.4 Sensitivity Table

Derived from the current lab state. Rows:

```
Base case
Price −10% / +10%
Variable cost −10% / +10%
Fixed cost −10% / +10%
```

Columns: *Scenario · Contribution Margin · BEP · Change vs. base*.
Row class `.up` (red) or `.down` (green) colour-codes the BEP column.
Those two classes read `--red` / `--green`, so they survive any skin.

### 3.5 Step-Checked Solver (Worked Examples)

**Purpose:** Verify each *step*, not just the final number.

```js
const EXAMPLE = {
  title: 'Example N — Name',
  story: 'Prose setup…',
  fc, p, vc, unit: 'loaves',
  steps: [
    { q:'Contribution margin', a: 80, pre:'₱', tol: 0.5 },
    { q:'Break-even quantity', a: 562.5, unit:'loaves', tol: 1 }
  ],
  solution: '<p>Full reasoning…</p>'
};
```

**Behaviour:** each step is a numbered row with a text input. "Check my
answers" marks each input `.ok` or `.bad` independently; only reports all-correct
if every step passes. "Show full solution" toggles a hidden info banner.

**Numeric parser** (accepts currency symbols, commas, decimals, percent):

```js
// Parses "₱45,000", "45,000", "45000", "45000.5", "45%", "$1,200".
// Limitation: assumes English/PH convention (comma = thousands,
// period = decimal). For European locales, adjust the replace() set
// or normalise the input before calling.
function num(s){
  if (typeof s === 'number') return s;
  const v = parseFloat(String(s).replace(/[₱$€£¥,\s%]/g, ''));
  return isNaN(v) ? NaN : v;
}
function close(a, b, tol){
  if (isNaN(a) || isNaN(b)) return false;
  const t = tol != null ? tol : Math.max(0.6, Math.abs(b) * 0.012);
  return Math.abs(a - b) <= t;
}
```

**Pitfall (we hit this):** if you skip marking empty fields `.bad`, the
"look for red outlines" message lies. Either mark empties as bad, or change
the message to "some answers are missing or incorrect." Prefer the latter.

### 3.6 True/False Self-Check (hard, situational)

**Purpose:** Calibration, not grading. Every question should *tempt* a
wrong answer. Avoid trivia; aim for near-miss reasoning.

```js
const TF = [{
  s: 'The statement…',
  a: true | false,
  e: 'Explanation that names the trap and the correct principle.'
}];
```

**Behaviour:** two big TRUE / FALSE buttons. On click: disable both, colour
the picked one green/red, dim the other, reveal an explanation banner. No
retry. Running scoreboard pinned at the bottom.

**Scoreboard denominator must be `TF.length`**, not the count answered —
otherwise it reads "0 / 0" on load.

**Writing guidance for questions:** each item should be a *situation* a
student might get wrong, e.g. "If a venture's BEP is 500 but only 400 are
obtainable, the fix is to lower price." (FALSE — lowering price raises BEP.)

---

## Part 4 — Build order

Follow this sequence; do not skip ahead.

1. **Design.** Run the §1.1 derivation. Write down the anchor and a
   one-line description of the skin. Fill the token block and the surface
   rules. Do this before any markup.
2. **Shell.** Sidebar TOC, sheet layout, `.decor` motif, progress bar,
   mobile drawer. Verify scroll-spy works before adding content.
3. **Glossary.** Build the §2.0 Glossary section before any teaching
   content — the term list falls out of the source's own definitions.
4. **Sections 1–2.** Text, definition boxes, notes, comparison table,
   sort game, feasibility gate.
5. **Section 3.** Lab + SVG chart + readout + sensitivity table. This is
   the biggest single chunk — test with a known formula before moving on.
6. **Sections 4–5.** Worked examples and sensitivity writeup.
7. **Sections 6–7.** Limitations case, True/False bank.
8. **Section 8.** Recap flip-cards, closing note, footer.
9. **Polish.** Contrast pass; responsive pass under 900px and 600px;
   keyboard focus outlines; `prefers-reduced-motion`; print stylesheet;
   global reset.

---

## Part 5 — QA pass (mandatory)

Run **every** item before handing the file back. Report findings as a short
table.

### 5.1 Formula verification

For each calculation in the source:

- [ ] Write the formula in code and compare to the source text.
- [ ] Recompute every worked example by hand.
- [ ] Confirm the Lab, presets, worked examples, and sensitivity table all
      agree when given the same inputs.
- [ ] Multi-product cases: verify WACM and composite BEP match the source.

Present results as: *Formula · Code · Source · ✓/✗*.

### 5.2 Interactivity verification

For each interactive element:

- [ ] Click every button; confirm state transitions are one-way where
      they should be (e.g. sort game cannot be re-answered).
- [ ] Reset buttons restore initial state.
- [ ] Scoreboards show correct denominator on first paint.
- [ ] Empty inputs do not produce misleading feedback.
- [ ] Division-by-zero guarded in every calculator branch.
- [ ] Sliders update all dependent outputs (numbers, chart, readout,
      sensitivity table) on every `input` event.

### 5.3 Design verification

- [ ] The anchor is named and traceable to the source. If you cannot name
      it, the skin is arbitrary — re-derive.
- [ ] Body text ≥ 4.5:1 on `--surface`. Check `--ink-faint` on `--grid`
      too (axis ticks and rule lines).
- [ ] Every `section.block` wears a pastel tint from the `--sec-*` cycle,
      assigned by position; adjacent sections never share a tint; body text
      stays ≥ 4.5:1 on the darkest tint composite; sticky notes remain
      clearly stronger than the section behind them; print flattens all
      tints to transparent.
- [ ] `--green` / `--amber` / `--red` are still recognisably
      green / amber / red. Correct/incorrect must never rely on a subtle
      hue shift.
- [ ] The SVG chart re-tints if you change `--accent` / `--accent-2` —
      proof that no component hard-codes a colour.
- [ ] **Grep the file for hex codes.** Every hit must fall inside the
      `:root` block or the surface/decoration rules. A hex anywhere else
      is a bug.
- [ ] No external asset: grep for `http`, `@import`, and `url(` with a
      non-gradient argument.
- [ ] `.decor` is `aria-hidden="true"` and does not overlap text at any
      breakpoint (it is hidden under 600px).
- [ ] Tables of 4+ columns scroll sideways on phones (`.cmp-wrap` wrapper,
      §1.5) instead of squashing their cells.
- [ ] Print preview: textures gone, decor gone, sidebar gone, black on white.
- [ ] Dark skins only: shadows reworked, print override present, and a
      contrast re-check against the dark surface.
- [ ] The design does not resemble a previously shipped lesson's design.
- [ ] **No paragraph silently re-explains one term.** Scan each exposition
      block: if a paragraph's only job is to define and illustrate a single
      concept, it belongs in a `.def` box or `.mini` grid (§2.1, Part 6 #2),
      not left as prose. Prose survives only where it's genuinely connecting
      two or more concepts.

### 5.4 Known pitfalls (from the Week 4 build)

1. **Preset / lesson mismatch.** A single-product preset for a
   multi-product example will disagree with the lesson's stated BEP. Use
   weighted-average values.
2. **Lying feedback.** If you skip empty inputs when marking bad, don't
   tell the user to look for red outlines — they aren't there.
3. **Zero-denominator scoreboards.** Always show `x / total`, not `x / answered`.
4. **Hard-coded hex in a component.** It looks fine until you revise the
   palette and one line stays notebook-blue on a parchment sheet. Nothing
   but the `:root` block and the surface rules may contain a hex code.
5. **Design drift into decoration.** Clipart, emoji bullets, and illustrated
   mascots are not a design. If the source has no such imagery, neither
   does the page.
6. **Skinning too early.** Writing components before the token block is
   final means every later change is a find-and-replace. Design first,
   freeze, then build.
8. **Over-written exposition (from the Week 5 build).** The first draft of a
   melded section, written as flowing paragraphs, over-explains each term —
   a full sentence of setup, the definition, then a sentence of restatement,
   then the example woven into more narrative. It reads fine but is 2-3x
   longer than the student needs. Catch this at first draft, not after
   shipping: write each concept as `.def`/`.mini` (definition line + example
   line) from the start, and save prose for the sentence that transitions
   from one concept to the next.
9. **Subsection transcription.** The source's outline is not the notebook's
   outline. Rendering every subsection as its own heading with its original
   paragraphs re-emits the PDF with 3× the headings. Meld per §2.1.
10. **Over-compressed exposition (from the Week 5 ship).** The inverse
   failure of #8: fixing over-writing by compressing into boxes can swing the
   draft into truncation. The Week 5 notebook shipped with a definition that
   ended mid-thought ("Four recurring causes:" — pointing at a card grid,
   never completing the sentence), a five-step source procedure flattened
   into a one-line arrow chain that dropped each step's judgment (estimate
   the divergence, choose by severity and enforcement capacity, target
   without overshooting, monitor compliance, evaluate unintended
   consequences), the shortage → price → equilibrium correction sequence
   reduced to a parenthetical, and terms like *adverse selection*,
   *deadweight loss*, *internalize*, and *moral hazard* appearing only inside
   quiz feedback without ever being defined. Symptoms to catch at first
   draft: a section with no prose at all before its first box; a `.def` that
   cannot stand alone; source enumerations surviving only as `a → b → c`
   lines; a term exercised in an interaction but defined nowhere in the
   exposition. The rule is in §2.1 — terse inside boxes, connected between
   them.
11. **Invisible sections (from the Week 5 ship).** Every section sat on the
   same undifferentiated sheet, and the reader could not tell where one
   section ended and the next began — scrolling past headings without
   feeling boundaries. The mandatory `--sec-*` tint cycle in §1.2–§1.3 fixes
   it. A skin may not skip the tints unless it proves an equally loud
   boundary device (and that trade must be stated in the opening message).

### 5.5 Accessibility spot-check

- [ ] Every interactive element is a real `<button>` or `<input>`.
- [ ] Feedback banners use an `aria-live` region OR appear adjacent to the
      triggering control (adjacent is acceptable for this format).
- [ ] No information conveyed by colour alone — always pair with text
      (e.g. "Correct" / "Not quite", not just green/red).
- [ ] Focus rings visible on all controls **against the chosen surface**
      (a blue ring on a navy sheet is invisible — use
      `outline:2px solid var(--accent-deep)` plus a light halo).
- [ ] `prefers-reduced-motion` disables all animations.

### 5.6 Meld & MILO verification (outlined sources, §2.1)

- [ ] The Glossary section exists between §0 and Section 1 (§2.0); every
      technical term used in exposition, exercise prompts, feedback, or the
      quiz has a one-line entry, and the lesson's own enumerated
      procedures still appear in full where the source gave them.
- [ ] No notebook heading reproduces a source subsection title; each source
      section reads as one fused exposition block.
- [ ] Every fact on the §2.1 dependency lists survives the meld —
      definitions, numbers, named cases, table rows.
- [ ] Every MILO is taught (content block or component) AND exercised
      (at least one interaction or quiz item hits its verb).
- [ ] The shipped file matches the `Outline map` and `MILO coverage` lines
      announced in the opening message.

---

## Part 6 — Content principles

These are what make the format work. Apply them even when the user doesn't
ask for them.

1. **Use the lesson's own numbers.** Students learn the formula faster when
   they recognise the bakery, the t-shirt printer, the food cart. Do not
   invent parallel examples.
2. **Definition, then example — keep it short.** A student scanning the page
   should be able to find each term's meaning and its worked case in two or
   three lines, not a paragraph. Default to `.def` boxes and `.mini` grids
   (§2.1); use full prose only to connect one concept to the next, never to
   re-explain a single term at length.
3. **Use the lesson's own world for the design.** The anchor for §1.1 comes
   from the source, not from a template gallery. A bakery lesson and a
   circuits lesson should not be recognisable as the same file.
4. **Interaction before explanation.** Where the source says "the BEP is X",
   let the student *find* X first, then show the source's reasoning.
5. **Plain-language readout.** Never leave a student staring at
   `BEP = 562.5`. Compose a sentence: *"About 19 loaves a day."*
6. **Sensitivity over single answers.** Show what changes when price, cost,
   or volume moves. This is where real understanding lives.
7. **Refuse to grade.** Self-checks are for calibration. Say so explicitly.
8. **Preserve the source's voice.** Keep the lesson's own phrasing in
   definition boxes and case applications — edit only for length.

---

## Part 7 — Reference implementation

If a `reference/notebook.html` ships alongside this skill, read it for
structure, not for skin — it is a canonical, verified build (a warm ruled
notebook skin, used for the Week 4 lesson on Feasibility Analysis &
Break-Even). Copy its shell, its component markup, and its JS. Do not copy
its palette — re-derive that from your own source per §1.1. If no reference
file is present, build from the specifications in this document alone; they
are complete on their own.

The reference contains:

- 8 sections, ~2 300 lines, one file, no external dependencies.
- Six interactive components (sort game, gate, lab, solvers, sensitivity,
  True/False).
- All formulas verified against the source lesson.
- Pitfalls documented in §5.4, all fixed in the shipped file.
- A fully tokenised palette — changing the `:root` values re-skins every
  component including the SVG chart.

When a new lesson arrives: derive the design (§1.1), copy the reference's
structure, swap the content, set your own tokens, re-verify the formulas,
re-run the QA pass.

### 7.1 Example user requests

Requests that SHOULD trigger this skill:
- "Turn Week 5.pdf into an interactive HTML notebook."
- "Make this lesson interactive, self-contained, no CDN."
- "Build a break-even lab from this reading."
- "Convert this slide deck into a study tool."
- "Make it feel like the bakery from the example."
- "Design it around the farm, not a generic notebook."

Requests that should NOT:
- "Make me a landing page for this product."
- "Build a dashboard for this CSV."
- "Explain this article to me." (no artifact requested)
- "Summarise these notes." (no interactivity requested)

---

## Part 8 — Opening message

Open your reply with a one-paragraph plan, then build immediately. Do not
ask for confirmation unless the source is ambiguous about a formula, the
user has not specified a required input, or no anchor for the design is
findable.

Opening format:

```
Reading: <filename>
Design: <one-line description> — from "<anchor noun in the source>"
Outline map: <source section (→ which subsections melded) → notebook §N> [REQUIRED for outlined sources, §2.1]
MILO coverage: <MILO letter → teaching section + exercising component> [REQUIRED]
Sections: [list the 0–8 you will build]
Interactive elements: [name each]
Formulas to verify: [list them]
Building now.
```

Then produce the file in the same response.