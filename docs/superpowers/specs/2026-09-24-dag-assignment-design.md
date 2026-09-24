# DAG Assignment — multi-layer branching MC as an alternative assignment format

Date: 2026-09-24 · Status: draft for review

## 1. Context

The `interactive-lesson-notebook` skill (v2, `v2/`) ships a collect-only flat
assignment: 20 items (10 mc · 4 tf · 4 id · 2+ sa) in a fullscreen deck,
answers stripped from student HTML, teacher key in `build/key/`, submissions
encrypted RSA-OAEP-256 + AES-GCM, graded manually or by `checker/`.

NotesLM (`D:\Programming\NotesLM`) has a proven decision-graph (DAG)
activity: nodes with situation-first questions, 2–4 choices each carrying
hidden points 0–10, edges that strictly increase level (acyclic), converging
paths, one strictly-best gold path, forward-only player, path+points scoring
(`src/modules/activities/decision-tree-service.js`).

Request: add a **DAG multiple choice** mode to the lesson assignment — several
layers of choices, authored entirely in opencode (no editor UI) — with the
per-lesson choice between DAG and the current flat assignment.

## 2. Goals / non-goals

Goals:

- (a) Per-lesson binary choice: flat (default, unchanged) **or** one pure-DAG
  scenario assignment, selected in `build.json`.
- (b) Configurable DAG size (`levels`, `max_nodes`), asked of the user during
  authoring and written into `build.json`.
- (c) Path + points grading (NotesLM model): points never ship to the
  student; teacher key carries full graph + precomputed optimal path/max;
  student submits only the choice path.
- (d) Same student chrome as flat: identity gate, fullscreen guards,
  watermark, encrypted submit envelope — zero churn on decrypt/roster paths.
- (e) Forward-only DAG walk (no Back), collect-only (no reveal, no
  student-visible score).
- (f) Agent-driven authoring: one authoring agent per level + one reviewer
  per level, orchestrated by the skill.
- (g) `checker/` auto-scores DAG submissions (path points vs max) and exports
  a DAG column; mixed flat+dag multi-assignment runs supported.

Non-goals:

- No Editor UI (all authoring in opencode).
- No SA/tf/id items in dag mode (pure DAG only).
- No Section/email identity fields (flat gate fields only).
- No Worker/LLM changes (dag never calls `/grade`).
- No drag-reparent/graph editor, no restart/change-identity mid-assign.

## 3. Mode selection & config (`build.json`)

```json
{
  "title": "…", "theme": "…", "components": ["…", "assignment"],
  "output": "…", "week": 4, "subject": "…",
  "assignment": "dag",
  "dag": { "levels": 3, "max_nodes": 12 }
}
```

- `assignment`: optional, `"flat"` (default) or `"dag"`. Absent → flat.
- When `"dag"`: `dag` object required, exactly keys `levels`/`max_nodes`.
  `levels` int 2–5; `max_nodes` int, `levels + 1 ≤ max_nodes ≤ 16`. The
  `+1` forces at least one branching layer — a pure chain is not a DAG
  assignment and is rejected.
- Unknown `dag` keys rejected (same treatment as unknown build.json keys).
- Stray `dag` key while `assignment` is flat/absent → error (never ignored).
- Author writes `"mode": "dag"` inside `LN.data.assign*`; build cross-checks
  data mode == config mode (mismatch → error).
- Component selection is unchanged: one
  `<div data-component="assignment" data-key="…">` mount; the component
  branches on the student data shape (`mode`/`nodes` vs `items`).

## 4. Data model

### 4.1 Student-facing data (post-sanitize), dag mode

```json
{
  "intro": "…",
  "mode": "dag",
  "title": "…",
  "scenario": "…",
  "nodes": [
    { "id": "n0", "level": 0, "isLeaf": false,
      "question": "…", "outcome": null,
      "choices": [
        { "label": "A", "text": "…", "nextNodeId": "n1" },
        { "label": "B", "text": "…", "nextNodeId": "n2" }
      ] },
    { "id": "n7", "level": 3, "isLeaf": true,
      "question": "…", "outcome": "…",
      "choices": [], "finalOutcome": "…" }
  ]
}
```

- Exactly one `level: 0` node = root.
- `nextNodeId` stays in student data (structure, not answer material — the
  client needs it to walk the graph).
- **Stripped: `points`** — the only answer-bearing field. The choice *is*
  the answer, recorded as the path.
- Leaves: `isLeaf: true`, `choices: []`, non-empty `finalOutcome`.
- Non-leaves: 2–4 choices, no `finalOutcome`.

### 4.2 Teacher key (`build/key/*-key.json`), dag mode

Replaces flat `items` rows:

```json
{
  "lesson": "…", "output": "…", "week": 4, "subject": "…",
  "key_id": "…", "public_key_b64": "…", "teacher_key_pem": "…",
  "decrypt": "python v2/tools/decrypt.py --key build/key/… <submissions…>",
  "mode": "dag",
  "dag": {
    "levels": 3, "max_nodes": 12,
    "title": "…", "scenario": "…",
    "nodes": [ /* full nodes: choices include points + nextNodeId; leaves carry finalOutcome */ ],
    "optimal": {
      "path": [ { "node": "n0", "label": "B", "points": 10 }, … ],
      "max_score": 27
    }
  }
}
```

`optimal` is precomputed at build time (`_dag_optimal`, §5.4) so the checker
never re-derives it. Envelope fields (`lesson/output/week/subject/key_id/
pub/pem/decrypt`) identical to flat.

### 4.3 Submission envelope

Crypto envelope unchanged (`enc: {v:1, k:"RSA-OAEP-256+A256GCM", iv, ct, wk}`).
Decrypted body, dag mode:

```json
{
  "title": "…", "subject": "…", "week": 4,
  "student": { "name": "…", "id": "…" },
  "submitted_at": "…",
  "mode": "dag",
  "path": [ { "node": "n0", "label": "B" }, … ],
  "final_outcome": "…"
}
```

No points, no echoed prompts — the path is self-describing against the key.

## 5. Build pipeline (`v2/build.py`)

### 5.1 Config validation

In `assemble`, beside the existing component-cfg checks: when `"assignment"
in components`, read `cfg.get("assignment", "flat")` — must be `"flat"` or
`"dag"`. If `"dag"`: `cfg["dag"]` required with exactly `levels`/`max_nodes`
per §3 ranges. Errors are `Err(...)` with fix hints, like existing config
errors. Flat mode: today's behavior; stray `dag` key → error.

### 5.2 `validate_assignment` — mode branch

Branch on `data.get("mode")` (cross-checked against `cfg["assignment"]`).
Flat path: **untouched** (all existing tests must pass). Dag path validates:

1. `title`, `scenario` non-empty strings; `intro` optional string.
2. `nodes` non-empty array. Every node: `id` matches `/^n\d+$/`, unique;
   `level` int `0 ≤ level < levels`; **exactly one node with `level === 0`**
   (the root; `parentId` is not part of the student schema).
3. `isLeaf` boolean; `question` non-empty on every node (rendered above
   choices / finalOutcome). Non-leaf: `choices` length 2–4; `finalOutcome`
   absent/null. Leaf: `choices` length 0; `finalOutcome` non-empty string.
4. Each choice: `label === "ABCD"[i]` (sequential from A); `text` non-empty;
   `points` int 0–10; `nextNodeId` references an existing node with
   `level > this.level` (single rule ⇒ acyclic + forward progress).
5. `outcome`: null on the root; non-empty string on every other node.
6. **Reachability:** every node reachable from the root via `nextNodeId`
   edges. Unreachable → error (no silent prune; author fixes data).
7. **Gold-path uniqueness** (run `_dag_optimal`): enumerate every
   root-to-leaf path (budget ≤16 nodes, branch ≤4, depth ≤5 ⇒ ≤1024 paths —
   trivial). Require (a) at least one complete path exists; (b) the maximum
   path total is achieved by **exactly one** path (any tie → error); (c) on
   that winning path, each chosen edge is **strictly** the highest-points
   edge at its node (equal-point siblings → error). This is NotesLM's rule —
   gold strictly highest at its node, full path strictly highest overall —
   both enforced, no DP second-best subtleties.
8. **Craft checks (mechanical floor):** every non-leaf question ≥ 15 words;
   every node's choice texts within ±25% word count of each other, each ≥ 3
   words (floor prevents ratio gaming). Violations point at
   `skeleton/dag-craft.md`.

### 5.3 `sanitize_assignment_data` — mode branch

Dag branch rebuilds the student object as
`{intro, mode:"dag", title, scenario, nodes}` keeping per node
`id, level, isLeaf, question, outcome, finalOutcome` and per choice
`label, text, nextNodeId` — **drops `points`**. Assertable invariant: the
rewritten student JSON contains no `"points"` key anywhere. Flat branch
untouched. `extract_assignment` unchanged (mode lives inside the data
object).

### 5.4 `_dag_optimal(nodes)` — new pure helper

DFS enumeration of all root-to-leaf paths (bounded by §5.2.7):

- Walk from the single `level === 0` root; at each non-leaf, branch over
  choices whose `nextNodeId` exists (validation guarantees targets are
  higher-level; this helper assumes validated input for path building but
  still skips dangling targets defensively); accumulate `[{node, label,
  points}]` and a running total; a path completes at any `isLeaf` node.
- Returns `{path, max_score, max_count, node_level_ok}` where `path`/
  `max_score` describe a maximum-total path, `max_count` is how many
  distinct paths achieve `max_score` (validation requires `=== 1`), and
  `node_level_ok` reports whether the winning path's edges are strictly
  highest-points at each of their nodes. Also returns `path_count` (≥1
  required). ~40 lines; simplification of NotesLM `computeOptimalPath`
  (enumeration instead of DP — fine at this budget).

### 5.5 `write_key_file` — mode branch

Flat → today's `items` rows. Dag → emit `mode:"dag"` + `dag:{levels,
max_nodes, title, scenario, nodes, optimal}` (§4.2), `optimal` from
`_dag_optimal`. Envelope unchanged.

## 6. Component (`v2/skeleton/components/assignment/`)

### 6.1 Branch

`init(root, d)`: `var isDag = d.mode === "dag" && Array.isArray(d.nodes);`
Malformed dag data (`mode:"dag"` without usable `nodes`) → clear error card,
not an empty deck. Flat path untouched.

### 6.2 Shared chrome (unchanged code paths)

Entry card → fullscreen deck → identity gate (Lastname, Firstname + 8-digit
ID, same regexes) → `show()` refuses quiz until `state.identified`.
Watermark, blur/visibility/PrintScreen cover, context-menu block, Esc
re-lock, Close-only-after-submit, `_export` encryption — all reused as-is.

### 6.3 DAG body (replaces flat `slides[]` loop)

- State: `{ identified, submitted, cur: "n0", path: [], picked: null }` —
  no `ix`/`answers[]`.
- One node card at a time: `outcome` callout (when non-null: "What
  happened:") + `question` + choices as radio labels (A/B/C/D + text).
  Leaf renders `finalOutcome` instead of choices, with the Submit affordance.
- Progress: flat per-question dots become a **layer meter** — "Layer k of L"
  plus one dot per level visited. `L` derives from the student data as
  `max(node.level)` (student data does not carry the `levels` config);
  node count varies, levels do not.
- Pick → Next: selecting a choice enables Next (same `answered()` gate
  pattern). Next pushes `{node: cur, label}` onto `path`, follows
  `nextNodeId` (or stays at leaf), clears `picked` for the new node.
  **No Back** — `navA` renders only Next in dag mode; flat Back handler
  never wired.
- Maintainer invariant (same as flat README): `show()` is the sole
  recompute point for Next-disabled and the layer meter; every choice
  listener calls `bump()`.
- Submit gate: only reachable at `isLeaf`; re-validates identity; assembles
  the §4.3 body; calls existing `api._export` unchanged.
- Edge handling: unknown/missing `nextNodeId` mid-walk → err banner "This
  path is broken — contact your teacher", disable Next (belt-and-suspenders;
  build validation should make it impossible).

### 6.4 CSS

New `.lna-dag-*` classes (outcome callout, layer meter) in `component.css`,
tokens only. Flat markup/classes untouched.

### 6.5 README / smoke

README documents both modes + the dual-state invariant. `assignment_smoke.js`
gains a dag fixture walk (root → pick → Next → leaf → submit shape; asserts
Back absent, `path` length = layers traversed); flat fixture re-run as-is.

## 7. Authoring workflow (skill + agents)

DAG content creation is agent-driven: **one authoring agent per level + one
reviewer per level**, orchestrated by the `interactive-lesson-notebook`
skill. New `v2/skeleton/dag-craft.md` (craft law) + SKILL.md §7 dag branch.

1. **Ask the user** for `levels` (2–5) and `max_nodes` (≤16), plus optional
   scenario seed → write `build.json` (§3).
2. **Blueprint pass (orchestrator):** map MILOs → decision layers; define
   the gold-path skeleton first (root → leaf through the best decisions) so
   later levels converge toward a target; reserve placeholder ids for future
   levels; record in build notes (authoring scaffolding, never shipped).
3. **Level fan-out (serial by level):** for `level = 0 … L-1`:
   - **Author agent** (OpenCode `task`, `subagent_type: "general"`) receives:
     lesson prose slice, MILO-layer plan, gold-path state at this level
     (current node id + cumulative gold points), the node pool already
     created by prior levels (convergence targets), remaining `max_nodes`
     budget, and `dag-craft.md`. Returns strict JSON of nodes at this level
     only: `{id, level, question, outcome, choices[{label,text,points,
     nextNodeId}], isLeaf?}` — `nextNodeId` may target reserved future ids
     or existing higher-level nodes (convergence). Budget decremented per
     level so early levels cannot starve later ones.
   - **Reviewer agent** (separate; sees lesson slice + `dag-craft.md` +
     that level's author output only — never sibling levels, never under
     pressure to approve) checks: situation-first question ≥15 words,
     choice length parity ±25% (≥3 words each), near-miss quality (plausible
     single-subtle-point failures; no absurd/short throwaways), points
     discipline at this level's nodes (gold edge strictly highest here;
     graduated 9–10 / 5–7 / 1–4), labels A–D sequential, `nextNodeId`
     targets exist or are reserved, no level-decreasing edges. Verdict
     `pass` or `fail` + precise rewrite list.
   - **Fail → same author agent rewrites** with review notes; max 2 retries,
     then escalate to the user.
   - Levels run **serially** (`author(L0) → review(L0) → author(L1) → …`)
     because level *k* edges target level *>k* nodes; parallel levels would
     break convergence/back-reference integrity. Author and its reviewer do
     not overlap within a level (review starts after author returns).
4. **Assembly (orchestrator):** stitch reserved placeholders to real nodes,
   resolve dangling `nextNodeId`, then run the build —
   `validate_assignment` is the **final mechanical gate**; its errors feed
   one last repair round (author + reviewer on failing nodes only).
5. Reviewer independence: mirrors NotesLM's two-pass generate+verify
   pattern (skeptical role).

## 8. Checker app (`checker/`)

- **Key ingestion:** detect `body.mode === "dag"` (flat keys have no
  `mode`). Exposes `dag.nodes` (full, with points), `dag.optimal.{path,
  max_score}`, `dag.levels`.
- **Decrypt + roster join:** unchanged (ID exact → name fallback →
  Unmatched/Missing).
- **Auto-score (no AI):** walk `path` vs key nodes — per step find the
  choice matching `label` → sum `points` = `score`; missing node/label
  (corrupt/foreign key) → row error "path/key mismatch", never a silent 0.
  `pct = score / dag.optimal.max_score`.
- **Path fidelity (display-only):** does the student's label sequence equal
  `dag.optimal.path`? Render `path_match: true/false` + diverging step
  index — reading aid, not separately scored (points already encode it).
- **SA gate:** dag mode has no SA → gate skipped for that assignment
  (`hasSa = key.mode !== "dag"`); Worker→Go calls = 0.
- **Export:** per-assignment column groups already exist — dag assignment
  contributes `DAG Score | DAG Max | DAG %`; flat assignments in the same
  multi-assignment loop keep `MC | TF | ID | SA…`. Mixed flat+dag export
  works. `ReviewLog` gains optional `path_match:false` rows (teacher note);
  no AI rows for dag.
- **Worker:** no changes.
- **UI:** results table shows path ribbon (`A→B→A→…`) + score badge instead
  of per-item cells; detail modal per step: node question (key) | chosen
  label/text | points | vs gold label. Decrypt/quarantine UX reused.
- **Scale:** O(path length ≤ levels ≤ 5) per student; 50×70 load unchanged.

## 9. Files touched

- `v2/build.py` — config validation, `validate_assignment` dag branch,
  `sanitize_assignment_data` dag branch, `write_key_file` dag branch, new
  `_dag_optimal`.
- `v2/skeleton/components/assignment/component.js` — dual-mode branch + DAG
  body.
- `v2/skeleton/components/assignment/component.css` — `.lna-dag-*`.
- `v2/skeleton/components/assignment/README.md` — dual-mode docs.
- `v2/skeleton/components/registry.md` — assignment row notes dual schema.
- `v2/skeleton/dag-craft.md` — NEW: authoring craft law (ported NotesLM
  rules + points/gold-path invariants + JSON schema).
- `v2/SKILL.md` — §7 dag branch (ask user → blueprint → level fan-out →
  build) + validation notes.
- `v2/tools/assignment_smoke.js` — dag fixture walk.
- `checker/app/app.js` (and export module as structured) — dag scoring,
  gate skip, columns, UI.
- `tests/test_assignment_dag.py` — NEW.
- `tests/test_assignment_contract.py` — must pass untouched (regression).
- `tests/test_e2e_lesson.py` pattern — one hand-authored dag fixture e2e
  (new test file or extension).

No changes: `decrypt.py`, `make_keys.py` (envelope/pem logic), Worker,
flat sample `lesson-demo` (stays flat).

## 10. Testing

- **Unit/pytest:** `_dag_optimal` (linear chain, diamond convergence,
  strictly-higher enforcement — equal totals rejected; unreachable/level-edge
  failures); field checks (label/points/word-parity/level-budget); mode
  cross-check; config ranges (levels 1/6, max_nodes >16, stray `dag` key);
  sanitize strips all `points`; key carries `optimal.max_score` + full
  points; all pre-existing flat tests green.
- **Smoke:** `node tools/assignment_smoke.js` — dag walk asserts Back
  absent, path length, submit shape; flat fixture re-run.
- **Checker unit:** path scoring happy path + mismatch quarantine + missing
  label; mixed flat+dag export; SA gate skip; `path_match` divergence index.
- **E2E:** hand-authored dag fixture lesson (3 levels, ~9 nodes, diamond
  convergence) built via `build.py` — student HTML contains no `"points"`,
  key has `optimal`, component mounts (existing e2e pattern).
- **QA (skill):** MILO coverage + craft checks land in the per-level
  reviewer prompts; build validation is the final gate.

## 11. Rollout

1. `build.py` validate/sanitize/key + `_dag_optimal` + tests.
2. `component.js` dual-mode + smoke (+ CSS).
3. `dag-craft.md` + SKILL.md authoring wiring + registry/README.
4. Checker scoring/export.
5. Hand-authored fixture e2e.

Each step lands green before the next.

## 12. Open questions

None — approved through design sections 1–6; ready for implementation plan.
