# Design — Week 10 replacement (Market Structures) + assignment "graph" mode

Date: 2026-10-18
Author: main session (brainstormed with Daneve S. Obero)
Status: awaiting approval — nothing built yet

## 1. Why this exists

The BACC100 syllabus was revised twice on 2026-10-18. Week 10 changed from
*Monopoly, with MR = MC computation* to *the four market structures, described
and compared*. The shipped `Week10-Notebook.html` (built 15:17 today) was built
from `BACC100_SYLLABUS 10-18 Revision (calculations reduced).docx`, **a file
that no longer exists on disk**. Week 10 as shipped is now wrong for the week.

The instruction is: **replace** Week 10, not revise it. Nothing from the
monopoly build is carried forward. Week 11 is explicitly out of scope.

## 2. What the new Week 10 must teach (verbatim from the syllabus)

Source: `BACC100_SYLLABUS 10-18 Revision (market structures consolidated).docx`,
Week 10 rows. `BACC100_SYLLABUS AY 2027-2028.docx` carries the identical Week 10
(the two files differ in other weeks only), so Week 10 is unambiguous.

Outcomes (MILO):

- **a.** describe the four market structures (perfect competition, monopoly,
  monopolistic competition, and oligopoly) in terms of the number of sellers,
  product differentiation, barriers to entry, and price-setting power
- **b.** compare the four market structures in terms of price-setting power,
  efficiency, and market outcomes, and assess the policy responses to market power

Content titles (the syllabus's own bullets):

- Market Structures: Perfect Competition, Monopoly, Monopolistic Competition, and Oligopoly
- Defining features: number of sellers, type of product, barriers to entry, and price-setting power
- Perfect competition: price takers, the shut-down decision, and long-run entry and exit
- Monopoly: barriers to entry, price making, and deadweight loss
- Monopolistic competition: product differentiation, branding, and excess capacity
- Oligopoly: mutual interdependence, strategic behavior, and collusion
- Comparing market outcomes and policy responses (regulation and antitrust)

**Source type: `specification`.** The syllabus names the week's coverage and
carries no teaching body, so the lesson's content is authored into
`src/full.txt` with a `CITATIONS` block, every fact group resolving to a real
external document (web-searched, 2021+, with the primary-source and
foundational-theory exceptions). The syllabus is named in the opening message
and the `SOURCE:` header only — never cited, never an entry in `references`.

**Dropped, by default (v2 rule 3):** the syllabus's *Suggested Learning
Activities* and *Course Assignments and Assessments* columns. The notebook's
mounted components are the activities. Recorded in the opening message.

## 3. The consequence of two analytical outcomes: no calculation machinery

Both outcomes use `describe` and `compare`. Under §2.20 of the pipeline that
makes the week analytical: **no formula block, no worked arithmetic, no
calculator lab, no `step-solver`, no practice set**. A number may be quoted as
evidence; the student is never asked to compute one. The syllabus agrees in its
own words — its suggested assessment is a *"Conceptual market-structure
classification exercise (no calculation)"*.

So the monopoly build's Monopoly Lab, step-solver, practice set and MR = MC
prose are all removed, not retuned. Deadweight loss, the shut-down decision and
excess capacity survive as things a student **reads off a figure**.

## 4. Goals, non-goals, anti-goals

**Goals**

1. A Week 10 notebook that matches the new syllabus: one self-contained `.html`,
   `app` layout, no external assets.
2. Graph reading as the spine: each of the four structures gets its own figure,
   plus one figure that compares all four, plus a read-only oligopoly payoff matrix.
3. In-section activities = **sorting Philippine firms** (the user's ask).
4. The graded assignment = **graph reading**: 10 multiple-choice questions, each
   pairing a written situation with the figure it asks about.
5. The pipeline gains the ability to ship a graph-carrying assignment deck, so
   every later graph-reading week reuses it.

**Non-goals**

- Week 11 (`Midterm Review (Weeks 1–10)`), and the drift in other weeks.
- Reusing any prose, figure, skin or DAG from the monopoly build.
- Changing the flat or DAG decks' behaviour in any way.

**Anti-goals** (would make this a failure even if it builds)

- An answer key or a figure's answer readable in the shipped student file.
- Shipping a four-bucket drag sorter as if the library supported one.
- Breaking any existing lesson: every currently shipped notebook must still
  build unchanged and still pass its smoke gates.
- A graph deck whose figures spill out of their box, or that cannot be read on
  a phone.

## 5. Pipeline change — assignment mode `"graph"`

### 5.1 Where the decisions came from

Decided by the user: the graded assignment must carry graphs; 10 questions; each
with choices; each accompanied by a situation. Decided by me (flagged in §10):
the mode name, the schema, the figure bank, and the adapted blueprint rule.

### 5.2 The shape

`build.json`:

```json
{ "assignment": "graph" }
```

`parts/NN-assignment.data.js`:

```js
LN.data.<key> = {
  mode: "graph",
  intro: "…one short paragraph…",
  figures: {
    "continuum":   "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 420 200\">…<\/svg>",
    "price-taker": "<svg …>",
    "monopolist":  "<svg …>",
    "excess-cap":  "<svg …>",
    "payoff":      "<svg …>"
  },
  items: [
    { type: "mc",
      situation: "Nena sells camote in the Carbon market…",
      figure: "price-taker",
      prompt: "Which market structure does the diagram describe?",
      choices: ["Perfect competition", "Monopoly", "Monopolistic competition", "Oligopoly"],
      ans: 0 }
  ]
}
```

**Every figure lives in the `figures` bank and is referenced by name.** An item
carries a *name*, never an inline 3 KB SVG, so the same drawing is not pasted
ten times and the bank is checkable as a whole. The SVG string is inline
(there is no external-asset allowance) and uses `var(--chart-*)` tokens only —
the deck renders inside the same document, so the tokens resolve.

### 5.3 build.py changes

| Function | Change |
|---|---|
| `validate_assign_cfg` (~L1622) | accept `"graph"` alongside `"flat"`/`"dag"`; reject a `dag` block when mode is `graph` |
| `validate_assignment` (~L1283) | route `data_mode == "graph"` to the new `_validate_assignment_graph` |
| `_validate_assignment_graph` (new) | the rules in §5.4 |
| `sanitize_assignment_data` (~L1224) | `graph` branch: keep `mode`, `intro`, `figures`, and per item `type`/`situation`/`figure`/`prompt`/`choices`; drop `ans` |
| `write_key_file` (~L1707) | `graph` branch: teacher key carries `mode:"graph"`, the figure bank, and per row `situation`, `figure`, `prompt`, `choices`, `ans` |

### 5.4 Validation rules for `graph` mode (all fail the build)

1. exactly **10** items.
2. every item is `type: "mc"`.
3. every item has non-empty `situation`, `figure`, `prompt`.
4. `figure` names a key that exists in `figures`.
5. each `figures` value is a non-empty string beginning `<svg`, containing
   `viewBox=`, and closing `</svg>`.
6. the deck uses **at least 3 distinct figures** (a deck of one repeated
   drawing is not graph reading).
7. exactly 4 non-empty, distinct `choices`; all four within ±1 word of each
   other (the existing flat rule — with structure names this passes naturally:
   "Monopoly" 1, "Oligopoly" 1, "Perfect competition" 2, "Monopolistic
   competition" 2).
8. `ans` is an int 0..3.
9. **no answer position used more than 4 times** across the ten (mirrors the
   flat rule).
10. no `"all of the above"` / `"none of the above"` choice.

### 5.5 The blueprint rule, adapted

`question-craft.md` requires ≥2 items per MILO and no MILO holding >30% of the
deck. **That is unsatisfiable for a 10-item, 2-MILO deck**: 2 × 3 = 6 < 10. The
graph deck therefore gets its own rule, written into a new
`skeleton/graph-craft.md`:

- every MILO carries **≥3 items**;
- **no MILO carries >7** of the 10;
- every item passes the copy test (no stem answerable by lifting a sentence);
- every item's situation is self-contained (≤60 words, no "refer back to §3");
- every invented answer is recomputed independently in QA.

`graph-craft.md` also records what makes an item *graph reading* rather than
prose recall: the answer must require the figure — if the student could answer
from the situation text alone, the item fails.

### 5.6 component.js / component.css changes

In the flat renderer (~L290) the slide gains, before the question line:

```js
if (it.situation) s.appendChild(LN.h("p", { class: "lna-sit", text: it.situation }));
if (it.figure) {
  var fig = LN.h("div", { class: "lna-fig", "data-figure": it.figure });
  fig.innerHTML = figures[it.figure] || "";
  s.appendChild(fig);
}
```

- `data-figure` is the hook the smoke test asserts on, so the gate does not need
  an SVG parser.
- The export row gains `situation` and `figure` (the teacher sees which figure
  the student was shown); `ans` comparison is unchanged.
- New CSS, tokens only: `.lna-sit` (situation paragraph) and `.lna-fig`
  (`svg` sized `width:100%; height:auto; max-width:100%`, `min-width:0`, a
  hairline frame). The slide already scrolls inside `.lna-over{overflow:auto}`,
  so a tall figure scrolls rather than spills.

### 5.7 Test + gate changes

- `tools/assignment_smoke.js` — add a `graph` fixture (10 items, 2+ figures) and
  assert: every slide built; a `.lna-fig` with the right `data-figure` per item;
  Next gating walks all ten; typed/selected state recomputes the button; the
  export carries 10 rows with `situation`+`figure`.
- `tools/deck_layout_smoke.js` — add the graph deck to the plaintext harness it
  already renders (desktop/tablet/phone), which is the gate for a tall figure
  spilling its box (v2.11 containment).
- A direct validator test: import `build.py`, feed `_validate_assignment_graph`
  good and deliberately malformed data (9 items, 3 choices, unknown figure name,
  5× one answer position), assert accept/reject. This is the red-then-green test
  for the rule set; it runs before the component work.

## 6. The figures (and who reads them)

Each is a static inline SVG in the section's `sections.html`, drawn from the
lesson's own numbers and labelled axes (§2.5), tokens only.

| # | Figure | Section | What the student reads |
|---|---|---|---|
| F1 | the structure continuum | §1 | sellers many → one; price-setting power rises across it |
| F2 | the price taker | §2 | horizontal demand at market price; long-run equilibrium at min ATC; where the shut-down point sits |
| F3 | the monopolist | §3 | demand with MR below it; MR = MC at Q\*; P\* above MC; the shaded deadweight-loss triangle |
| F4 | excess capacity | §4 | demand tangent to ATC left of min ATC; the gap = excess capacity |
| F5 | the payoff matrix | §5 | a 2×2 duopoly matrix read, not solved; mutual interdependence and collusion |
| F6 | the four side by side | §6 | price vs MC and efficiency across the four; where policy intervenes |

The assignment's `figures` bank is drawn from the same six drawings, so the quiz
reads the figures the lesson taught.

## 7. Notebook outline (specification build)

`source_titles` = the 2 outcomes + the 7 content titles, verbatim (§2).

| # | id | section title (exact `<h2>`) | `from[]` |
|---|---|---|---|
| 0 | `overview` | 0&nbsp; Overview & Outcomes | MILO a, MILO b |
| 0G | `glossary` | 0G&nbsp; Glossary | all 7 content titles |
| 1 | `structures` | 1&nbsp; What Makes a Market Structure | Market Structures: …; Defining features: … |
| 2 | `perfect` | 2&nbsp; Perfect Competition: Price Takers | Perfect competition: … |
| 3 | `monopoly` | 3&nbsp; Monopoly: Barriers and Price Making | Monopoly: … |
| 4 | `monocomp` | 4&nbsp; Monopolistic Competition: Differentiation and Excess Capacity | Monopolistic competition: … |
| 5 | `oligopoly` | 5&nbsp; Oligopoly: Interdependence and Collusion | Oligopoly: … |
| 6 | `compare` | 6&nbsp; Comparing the Four and the Policy Response | Comparing market outcomes and policy responses …; MILO b |
| 7 | `assignment` | 7&nbsp; Assignment | MILO a, MILO b |
| 8 | `recap` | 8&nbsp; Recap | MILO a, MILO b |
| 9 | `references` | 9&nbsp; References | (generated) |

Every content title is mapped; `dropped` is empty (the activity columns are not
titles). MILO coverage: **a** → §1–§5 teaching, exercised by their `case-match`
activities; **b** → §6 teaching (the 4×4 matrix), exercised by the §6
`ranked-statements` (price-setting power), the §6 `case-match` (policy
response) and the matrix (efficiency), and by the assignment.

## 8. Activities — sorting Philippine firms

The library's `sort-statement` is a **two-bucket** component (`left`/`right`), so
it cannot sort four structures. The component that fits is **`case-match`**:
four-plus concepts, one scenario at a time, dropdown, instant feedback with an
optional `e` clause naming the slip. My call, and the reason:

| Section | Mount | Content |
|---|---|---|
| §1 | `case-match` | 8 Philippine firms/markets → the four structures (the flagship sort) |
| §1 | authored `.tbl` | the four features: Feature → what to look for (2 columns) |
| §2 | `case-match` | is this seller a price taker? (palay farmer, public-market vendor of identical fish vs. a branded stall) |
| §3 | `true-false` | deadweight loss and price making past the efficient output |
| §4 | `case-match` | which of these are monopolistically competitive (milk tea, pharmacy, sari-sari) |
| §5 | `true-false` | interdependence, collusion and the temptation to cheat |
| §6 | authored `.tbl` | the 4 structures × 4 features matrix (the week's core artefact) |
| §6 | `ranked-statements` | six market situations, least → most price-setting power |
| §6 | `case-match` | which policy response fits which market power (regulation vs. antitrust) |
| §8 | `flipcards` | six recap cards |

Plus `milo-list` in §0 and `glossary` in §0G. `build.json > components` =
`milo-list`, `glossary`, `case-match`, `true-false`, `ranked-statements`,
`flipcards`, `assignment`. If the user wants a genuine four-bucket drag sorter
instead, that is a new component and a separate promotion decision (§3.3) —
deliberately **not** bundled into this job.

**Two component limits found by the builder check, and how they are settled.**

1. **`comparison-table` is a two-column A-vs-B widget** (`{left, right, rows}`
   only). It cannot render four structures as four columns, so the 4×4 matrix is
   **authored as a real table** — `<div class="cmp-wrap"><table class="tbl">` in
   the section's `sections.html`, which §2.1e wants anyway ("render the shape,
   don't narrate it"). `comparison-table` is therefore **not** in `build.json`.
   The `cmp-wrap` wrapper is what carries the phone-swipe hint and the fixed
   table layout at 600 px.
2. **`ranked-statements` ranks one lineup by one criterion, 6–8 claims.** One
   mount cannot order the four by price-setting power *and* by efficiency. §6
   therefore ships **one** `ranked-statements` mount with **six distinct market
   situations**, direction `least → most price-setting power`, so all six ranks
   are unique (two perfect-competition or two monopolistic-competition claims
   would tie and break the rank rule). Efficiency is carried by the 4×4 matrix
   and by the §6 `case-match`, so all three MILO-b facets are exercised without
   inventing a second ranking widget.

## 9. The assignment (graph mode)

- 10 MC items, each = a written situation + one figure from the bank + a prompt
  + four equal-length choices.
- Blueprint (§5.5): MILO a ≥3 items, MILO b ≥3 items, neither above 7.
- Every answer recomputed independently in QA.
- Window unchanged: Wednesday, `Asia/Manila`; encrypted at rest; answers only in
  `build/key/`.
- Student file carries no question text at all (the whole object is an
  AES-256-GCM envelope), so the figure bank is not readable either.

## 10. Design calls I made (check these while reading)

1. **Mode name `"graph"`** and the figure-bank schema (§5.2) — my call.
2. **Blueprint adaptation** for a 10-item deck (§5.5) — my call; the flat rule is
   arithmetically impossible here.
3. **`case-match` instead of a four-bucket sorter** (§8) — my call.
4. **Theme: base pack `ledger`, retuned.** The lesson's core artefact is a
   four-column feature comparison, which is a ruled grid; `ledger` is the
   tabular pack and is not on top of another lesson once retuned (`week8` is the
   other `ledger`, in kraft brown + ledger green; I would move to graphite ink +
   structural teal + a signal amber, and read the pack's red margin rule as the
   boundary between the competitive and concentrated ends of the continuum).
   `week5` parchment, `week7`/`week10-old` studio, `week9`/`week11` opal. My
   call — redirect me if you want a different pack.
5. **Section split**: six teaching sections, one per syllabus content bullet
   (§7) — my call.
6. **`assignment_smoke.js` gets a graph fixture rather than a new tool** — my call.
7. **The 4×4 structure matrix and the §1 feature table are authored as real
   tables, not the `comparison-table` widget** (which is two-column) — my call,
   forced by the component (§8).
8. **§6 ships one six-claim `ranked-statements`** (price-setting power) rather
   than a two-criterion ranking, which the widget cannot do (§8) — my call.

## 10b. Builder check

A fresh builder agent read this document against `build.py`, the component
sources and the existing Week 10 build. It raised two questions, both resolved
above as calls 7 and 8 and written into §8; it found nothing else it would have
to guess that mattered, and confirmed the tooling, `data.js` escaping, theme
tokens and `source_titles` handling are all decidable from the pipeline.

## 11. Deliverables and gates

Deliverables

1. `build.py` + `skeleton/components/assignment/{component.js,component.css}` +
   `skeleton/graph-craft.md` updated in `D:\Python\lesson-notebook-pipeline\v2`.
2. `build/week10/` rebuilt from scratch; the monopoly work archived to
   `build/week10-monopoly-DEPRECATED-2026-10-18/`, its notebook to
   `Deprecated/Week10-Notebook.monopoly-2026-10-18.html`.
3. `Week10-Notebook.html` in the lesson folder, plus
   `build/key/Week10-Notebook-key.json`.

Gates (all must pass before I announce done)

- `python build.py build/week10` → OK, from the lesson folder.
- `paragraphs.py --max-words 40` → 0 except formula glosses;
  `--max-sentence-words 30` → visual-carrying only.
- per-section clarity reviewer → `CLARITY PASS` each; then the Part 5 sweep
  (Unclear + bold-term formatting) → `CLARITY PASS`.
- `node tools/layout_smoke.js <file>` → `LAYOUT OK`, and again `--width 390`.
- `node tools/deck_layout_smoke.js` → every run OK (now including the graph deck).
- `node tools/assignment_smoke.js` → SMOKE OK (now including the graph deck).
- `python tools/activity_numbers.py <file>` → no activity reusing a lesson number.
- validator test for `graph` mode → accept good, reject each malformed case.
- references: every entry real, 2021+, cited at least once, none the syllabus.
- `grep` the built file: no "in the Philippines" label, no hex colours in parts,
  no `"ans"` string in the shipped assignment object.

## 12. Left to the builder

- The exact prose of every section (authored against the cited standards).
- The exact Philippine firms in each `case-match` bank.
- The exact wording and numbers of the 10 assignment items.
- The figure geometry.
- The `tune.css` token values themselves.
