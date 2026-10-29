# Graph craft — the graph-reading graded assignment

Governs Section 7 **only in graph mode** (`build.json` `"assignment": "graph"`).
The default assignment is governed by `mixed-craft.md`; flat mode by
`question-craft.md`; the branching DAG (`"assignment": "dag"`) by `dag-craft.md`. The lesson-body invention ban (SKILL.md §9.1) is a **lesson-body
rule**: a graph item may invent a firm, a place, and a situation freely — *a new
situation is allowed, a hidden dependency is not.*

## What the deck is

Ten multiple-choice items. Each one shows the student a short written situation,
**the diagram it is about**, and a question with four choices. The diagrams come
from the deck's own `figures` bank; an item names its figure.

```js
LN.data.<key> = {
  mode: "graph",
  intro: "…one short paragraph, shown on the Begin card…",
  figures: { "monopolist": "<svg …>", … },
  items: [
    { type: "mc", situation: "…the scene, ≤60 words…", figure: "monopolist",
      prompt: "…the question…",
      choices: ["…", "…", "…", "…"], ans: 1 }
  ]
}
```

## The graph-reading test (the rule that defines this mode)

**An item passes only if the answer requires the diagram.** Delete the figure and
read the situation alone: if a student who knows the week can still answer it,
the item is prose recall wearing a picture, and it fails. The figure is not
decoration — it carries at least one fact the situation does not state.

Corollary: every figure in the bank must be a drawing **the lesson actually
taught** (§2.5) — same shapes, same labelled axes, same numbers. The deck never
introduces a drawing the student has not seen.

## The three words, adapted

**Situational.** Every stem places the student in a scene and hands them a
diagram: someone prices, someone enters, someone is deciding whether to keep
producing. Self-contained — every fact needed sits in the situation or the
figure, and the situation stays **≤60 words**. Never "refer back to Section 3".

**Challenging — by reading, never by trickery.** The difficulty comes from the
diagram, so the distractors are **misreadings of it**, each one a believable
slip:

- naming the price where MR = MC instead of where the demand curve sits;
- reading the marginal-cost curve as the average-total-cost curve;
- reading the deadweight-loss triangle as the profit rectangle;
- reading the short-run position as the long-run one (entry has not happened yet);
- reading a payoff-matrix cell from the wrong player's row.

Never an obscure term, never a figure detail too small to see, never "all of the
above" (rejected by the build).

**Fair.**

- Every concept needed was taught somewhere in the lesson (prose, an activity's
  explanation, or the glossary), and the figure shown is one of the lesson's own.
- Exactly one defensible answer. No distractor a careful student could argue for.
- All four choices stay **within ±1 word** of each other (enforced by the build);
  with the four structure names this falls out naturally, which is why a
  structure-identification item is cheap and a misreading item needs care.
- No single answer position is used more than **4 times** across the ten
  (enforced).
- Every invented answer is **recomputed independently in QA** — a wrong key,
  unlike wrong prose, is invisible to the student. For a graph item the check is:
  read the figure yourself, then confirm the marked choice.

## The blueprint (before any item)

List the MILOs and map each to the items covering it. Author only then. QA
rejects any MILO with **fewer than 3 items**, or any single MILO holding **more
than 7** of the ten.

**Why not the flat rule.** `question-craft.md` requires ≥2 items per MILO and no
MILO above 30%. On a ten-item deck that is arithmetically impossible: 30% of ten
is three, so two MILOs could hold at most 6 of the 10 items. The graph deck's
numbers (≥3, ≤7) are the flat rule made satisfiable.

Record the mapping in the build notes — authoring scaffolding, never shipped
student data.

## Figures

- Inline SVG only, `var(--chart-*)` tokens for every colour (no hex, no URL).
- `viewBox` present so the drawing scales; labelled axes; the drawing agrees with
  the lesson prose and figures.
- At least **3 distinct** figures must be read across the ten items (enforced):
  one drawing repeated ten times is not graph reading.
- Numbers on a figure trace to the lesson (which traces to its citations). Never
  invent a data point.

## The legend — every graph carries one

A bank entry is an object, not a bare drawing:

```js
"figures": {
  "monopolist": {
    "svg": "<svg …>",
    "legend": [
      { "label": "Demand", "token": "chart-rev" },
      { "label": "Marginal revenue — below demand", "token": "chart-label", "mark": "dashed" },
      { "label": "Deadweight loss — shaded", "token": "chart-loss", "mark": "block" }
    ]
  }
}
```

- `label` — the words a student reads, naming what that colour and shape carry.
- `token` — one of the theme's chart tokens: `chart-rev`, `chart-cost`,
  `chart-profit`, `chart-loss`, `chart-axis`, `chart-grid`, `chart-label`.
- `mark` — `line` (a curve), `dashed` (an auxiliary curve or a limit), `block`
  (a shaded area, a coloured marker such as a dot or a bar, or a colour carried by
  values such as a matrix's numbers). Default `line`.

Rules:

- **The legend is rendered as HTML under the drawing, never baked into the SVG.** Text
  inside a drawing that is scaled to the column shrinks out of legibility on a phone.
- **Every row must be true of that drawing.** Trace the figure's own elements before
  writing a row. Where two curves share one colour and shape, give them one row naming
  both — the drawing's own labels name each curve. Never invent a distinction the
  drawing does not make (the build cannot catch a legend that lies).
- **No row repeats a label** (enforced).
- **The lesson's figure and the deck's copy of it carry the same legend**, because the
  deck reads the drawing the lesson taught. Colour the drawing to support the legend:
  a reader should be able to get from a legend row to the thing it names.
- Axes, frames and guide lines stay out of the legend; it keys what carries meaning.
  A marker whose colour simply repeats its curve's token (a dot on a guide line, say)
  needs no row of its own — the row for that curve covers it.

## Answer-side rules (non-negotiable)

Correct answers live **only** in `ans`, and `ans` never reaches the student file:
the build strips it from the shipped data and writes it to
`build/key/<output stem>-key.json`. Never write a hint of the answer into a
situation, a prompt, a choice, or a figure.

## Verification

- `node tools/assignment_smoke.js` — walks the graph deck: every item renders its
  figure container, Next recomputes after each pick, all ten advance, Submit
  unhides at the last item, and the export carries ten rows with `situation` and
  `figure` and no answer.
- `node tools/deck_layout_smoke.js` — renders the real component against a real
  theme at desktop, tablet and phone widths and fails if a figure spills its box.
- `python tools/test_assign_graph.py` — the build.py rule set.
