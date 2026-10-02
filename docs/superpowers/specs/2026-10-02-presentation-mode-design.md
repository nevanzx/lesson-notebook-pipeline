# Presentation Mode — numeric-depth highlights in the HTML Viewer

Date: 2026-10-02 · Status: draft for review

## 1. Context

A generated notebook (`v2/skeleton/shell.html`, `app` layout) is a student reading +
activity tool. A teacher also projects the same lesson in class, but the shipped lesson
is word-heavy: chain prose, activity prompts, assignment framing, and feedback all crowd
the screen. A teacher wants a **presentation view** of the *same file* that shows only
the concepts, definitions, examples, and labs — the highlights — and drops the word
clutter.

Two constraints shape the design:

1. **Two ways the file is opened.** The teacher may open the `.html` directly, or open it
   through the **HTML Viewer** (`checker/app/viewer.html`), an app page that renders the
   lesson in an iframe. The Viewer is *not* only a student tool — it is the presentation
   host.
2. **Less AI burden at generation.** Producing a *separate* presentation file would double
   the writing. Instead the lesson is annotated with one lightweight marker while it is
   already being written; the presentation view is a **view transform** of the same DOM.

This design defines the marker, the generation rules, the viewer/shell mechanics, the
animation, and the validation.

## 2. Goals / non-goals

Goals:

- (a) One new attribute in the lesson marks what to **keep**; everything else hides at
  present time.
- (b) Present mode **replaces the section visually** with a nested bullet outline built
  from the marked content, in numeric-depth order.
- (c) The transform is **non-destructive**: the original DOM is preserved and exiting
  restores it instantly; live components (labs) keep their state and event handlers.
- (d) The engine lives in the **lesson shell**, so it works when the file is opened
  directly *and* when it is loaded by the Viewer (same-origin and cross-origin alike).
- (e) The AI's new job is only to place the marker while authoring — no second artifact.

Non-goals:

- No slideshow, no card-by-card deck, no new layout. Present mode reuses the existing
  `app` one-section-at-a-time navigation.
- No change to what a section *contains* in reading mode.
- No new tagged "presentation" output file.
- No change to the encrypted assignment data, the unlock flow, or the checker.
- No auto-detection by class: the marker is the single source of truth.

## 3. Markup contract

### 3.1 The marker

`data-present="N"` may sit on **any** element. `N` is a positive integer depth
(1 = root bullet, 2 = child, 3 = grandchild, …).

**Semantics: "keep this element whole — its entire subtree."** Any content that is not
inside a `[data-present]` element is hidden in present mode. There is no remove-tag and
no structural auto-detection; tagged is the only rule.

```html
<p><strong>Cat</strong></p>
<p>
  Cats have lived alongside humans for thousands of years, and few animals have
  earned such a beloved place in our homes. People around the world admire them
  for their grace, mystery, and quiet companionship.
  <span data-present="1">A cat is a small, carnivorous mammal (Felis catus) that
    has been domesticated and is commonly kept as a pet or for controlling pests.</span>
  <span data-present="2">Cats are known for their soft fur, retractable claws, and
    sharp night vision, which make them skilled hunters even in low light.</span>
  <span data-present="2">They communicate through purring, meowing, and body
    language, and they spend much of the day grooming or sleeping.</span>
  <span data-present="3">Purring can signal contentment or self-soothing.</span>
  <span data-present="2">Although independent by nature, many cats form deep bonds
    with their owners and show affection in their own subtle ways.</span>
</p>
```

The marker can be placed on:

- an inline `<span>` wrapping one phrase or sentence inside a paragraph;
- a whole block — `.def`, `.mini`, `.card`, `.note`, a table, a figure;
- a component mount `<div data-component="…">` (keeps the live lab).

### 3.2 The outline join rule

Per section, collect all `[data-present]` elements in **document order**. Each becomes a
node in a nested outline:

- Each node nests under the **most recent node of depth `N − 1`**.
- Depth 1 starts a new top-level bullet.
- A depth may not skip a level (a `3` is illegal unless a `2` precedes it in the same
  group).

Example render:

- **A cat is a small, carnivorous mammal (Felis catus) …**
  - Cats are known for their soft fur, retractable claws …
  - They communicate through purring, meowing, and body language …
    - Purring can signal contentment or self-soothing.
  - Although independent by nature, many cats form deep bonds …

## 4. Generation rules

The marker is applied **by the section agent, while writing its part** — tagging is part
of authoring, so it adds no separate AI pass. The skill (`SKILL.md`) gains the rules; the
section brief gains the marker instruction.

### 4.1 Depth assignment

| Depth | What goes here |
|---|---|
| 1 | The section's core concept/definition — its `.def` box, or the defining sentence in flat prose |
| 2 | Its key explanations / examples / properties — `.mini` boxes or explanation sentences |
| 3+ | Deeper support under a specific point |

### 4.2 What to tag, by source shape

- **Structured source** (boxes already exist): put `data-present="1"` on the `.def` and
  `data-present="2"` on each `.mini`/example box. One attribute per box — near-zero
  burden.
- **Flat source** (a blended paragraph, the cat example): the agent splits — chain prose
  stays untagged, the definition is wrapped at `1`, its explanations at `2`.
- **Labs:** the section's anchor lab mount gets `data-present="1"` (or its natural depth).
- **Never tagged:** activity-only mounts (sorters, gates, true-false), the assignment
  mount, the glossary mount, and the remaining chain prose. These hide at present time.

### 4.3 Policy

- **Mandatory:** every *teaching* section must carry at least one `[data-present]`;
  `build.py` fails a lesson otherwise.
- **Exempt sections:** the canonical ids `overview`, `glossary`, `selfcheck` (also accept
  `self-check`), `assignment` (also accept `assign`), and `recap` need no tags (they drop
  out of the present deck automatically).
- **Single rule:** classes are never auto-kept; `.def`/`.mini`/labs must carry the
  attribute like everything else.
- The marker is inlined in the shipped file (like all lesson markup); reading mode
  ignores it entirely.

## 5. Mechanics

### 5.1 Where the engine lives

The transform engine (`LN.present`) lives in the **lesson shell** (`skeleton/shell.html`),
not the Viewer. Rationale: only a shell-resident engine reaches a lesson loaded by a link
cross-origin (the Viewer cannot script into a cross-origin iframe — the same wall the
unlock relay already works around). It also lets the file present itself when opened
standalone. The Viewer stays a thin host: it detects the same-origin lesson and tells it
to enter or exit present mode by `postMessage`.

### 5.2 Triggers

- **Standalone (file opened directly):** the shell exposes an always-available **Present**
  entry (a bottom-bar button in the `app` chrome, default-on).
- **Via the Viewer:** the Viewer shows a **Present** toggle. On enter it hides its own
  header/cards and expands the iframe to fill the viewport, then sends
  `{type:"ln-present", on:true}` to the same-origin iframe. On exit it sends `on:false`
  and restores its chrome.
- **Exit:** a Viewer-owned floating **Exit** button (works even if the lesson cannot be
  scripted) plus `Esc` inside the lesson.

### 5.3 The present deck

Present mode walks only the `section.block`s that contain at least one `[data-present]`;
`overview`, `glossary`, `selfcheck` (or `self-check`), `assignment` (or `assign`), and
`recap` have none and drop out.
The `app` bottom bar (`‹` / Next) steps sections exactly as in reading mode — no
slideshow.

### 5.4 Transform (strip in place)

To keep labs live, tagged nodes are **never moved or cloned** (a clone would lose the
lab's event handlers and state). Instead:

1. Compute every element that **contains a tagged descendant** and keep it; an element
   with none is hidden.
2. Hide untagged text nodes (the clutter) — except inside a kept `[data-present]` subtree,
   which stays whole.
3. Give each `[data-present]` node a depth class so depth 1/2/3 render as an indented
   nested bullet outline (bullets supplied by CSS pseudo-elements).
4. Suppress the `Activity — …` tag (`.ln-act-tag`) in present mode.

The original DOM stays in place throughout; layout is switched by a body class
(`ln-present`) plus per-element `hidden`. Exiting removes the class and unhides
everything — instant and lossless.

### 5.5 Animation

Respecting `prefers-reduced-motion` (instant fallback, per the shell's existing pattern):

- **Enter:** untagged text/elements fade and collapse out, staggered in document order;
  indentation eases in.
- **Exit:** reverse — clutter expands back, indentation removed.

## 6. Validation / QA

### 6.1 `build.py` (mechanical, build fails on violation)

- Every teaching section (all sections except the exempt list) carries ≥1 `[data-present]`.
- Every `data-present` value is a positive integer.
- No depth skipping within a section (a `3` requires a preceding `2` in the same group).
- No nested `[data-present]` (a marker inside another marker is an error).
- A tagged element has non-empty text, or is a component mount.
- `[data-present]` is not allowed on the `section.block` root.

### 6.2 Judgment QA (Part 5)

- The tagged set reads as a coherent def → points outline, not scattered sentences.
- Depth 1 is the concept/definition; deeper levels are supports.

### 6.3 New tool — `tools/present_smoke.js`

Headless-build a lesson and toggle present on, asserting:

- Only tagged content is visible; no tagged node is hidden.
- Nesting/indent matches each node's depth.
- `.ln-act-tag` is suppressed.
- Exiting restores every original text run.

Extend `layout_smoke.js` with a `--present` pass (outline view at desktop **and**
`--width 390`); the outline indentation and markers must not spill.

## 7. Edge cases

| Case | Behavior |
|---|---|
| Untagged `<li>` in a list | Hidden; no orphan bullet |
| Tagged `<li>` / `<ol>` | Original markers off (`list-style:none`); outline markers used; numbering comes from the outline, not the source |
| Tagged `.def` / `.mini` / `.card` / table / figure | Kept whole (subtree) |
| Tagged MathML | Tag the containing box, not the `<math>` itself |
| Tagged component mount (lab) | Kept; its `Activity — …` tag suppressed in present mode |
| Cross-origin link-loaded lesson | Works via `postMessage` to the shell engine |
| Assignment | Never tagged; its section drops out of the deck (begin/lock untouched) |
| Encrypted data | Untouched |
| Print | Unaffected — the print stylesheet ignores the present class |
| `prefers-reduced-motion` | Instant, no animation |
| Phone (390 px) | Indent + markers must fit; `layout_smoke --present --width 390` gate |

## 8. Files touched

- `v2/skeleton/shell.html` — add `LN.present` engine (scope collection, strip-in-place
  transform, animation), a "present" body class, present CSS, and the `message`
  listener.
- `v2/skeleton/layouts/app/chrome.html` — add the default-on **Present** button.
- `v2/skeleton/layouts/app/layout.js` — wire the button (and/or a `LN.nav` hook) to
  `LN.present`.
- `v2/SKILL.md` — Part 2/Part 4: the marker, depth rules, mandatory tagging, exempt
  sections; the section brief template gains the marker instruction.
- `v2/build.py` — the six mechanical checks in §6.1.
- `v2/tools/present_smoke.js` — new.
- `v2/tools/layout_smoke.js` — add the `--present` pass.
- `checker/app/viewer.html` — the Present toggle + iframe expand + `postMessage`, and a
  floating Exit button.
- `checker/app/README.md` — document the present flow.
- Built lessons/samples — regenerated on next build; existing shipped `.html` files keep
  the old output until rebuilt.

## 9. Rollout

1. Shell engine + present CSS + `app` Present button; a lesson toggles present standalone.
2. Viewer toggle + `postMessage` + floating Exit.
3. `build.py` checks green; update `SKILL.md` and the brief template.
4. `present_smoke.js` and `layout_smoke --present` green at desktop and 390 px.
5. Regenerate the sample lesson; eyeball enter/exit, nesting, lab liveness, and exit
   restoration in all four themes.

## 10. Open questions

- None. Decisions: keep-tag `data-present="N"`; numeric depth; mandatory with the
  `overview`/`glossary`/`selfcheck` (`self-check`)/`assignment` (`assign`)/`recap` exemptions; single rule (no
  class auto-detection); engine in the lesson shell; Viewer as thin trigger; replace the
  section **visually** via strip-in-place; non-destructive and lab-live; animation with a
  reduced-motion fallback.
