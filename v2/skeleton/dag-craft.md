# DAG craft — the branching assignment

Governs Section 7 when `build.json` carries `"assignment": "dag"`. The flat
20-item deck keeps `question-craft.md`; this file is the dag twin. §9.1's
source-only ban is still a **lesson-body rule** — dag situations may invent
actors, numbers, and twists freely; a hidden dependency may not.

## What a dag assignment is

One scenario, `levels` layers of decisions (layer = `level` 0..levels-1),
`2..4` choices per non-leaf node, edges only to a **strictly higher level**
(the graph is a DAG — no cycles, no sideways hops). Paths may **converge**:
several choices can point at the same later node; reuse nodes instead of
copying them so the budget (`max_nodes` in build.json, ≤16) holds.

There is **no** tf/id/sa in dag mode. The choice path is the answer.

## JSON schema (author into `LN.data.<key>`)

    {
      "intro": "…optional…",
      "mode": "dag",
      "title": "…",
      "scenario": "…single root case narrative…",
      "nodes": [
        { "id": "n0", "level": 0, "isLeaf": false,
          "question": "…", "outcome": null,
          "choices": [
            { "label": "A", "text": "…", "points": 10, "nextNodeId": "n1" },
            { "label": "B", "text": "…", "points": 5,  "nextNodeId": "n2" }
          ] },
        { "id": "n7", "level": 3, "isLeaf": true,
          "question": "…", "outcome": "…",
          "choices": [],
          "finalOutcome": "…" }
      ]
    }

- ids: unique `n0`,`n1`,… ; exactly one node with `"level": 0` (the root).
- `outcome`: `null` on the root; everywhere else the consequence of the
  incoming choice (the learner's new situation when the card opens).
- Non-leaf: 2–4 choices, `label` must be `A`/`B`/`C`/`D` in order, `points`
  int 0–10, `nextNodeId` → an existing node with a **greater** level.
- Leaf: `choices: []`, non-empty `finalOutcome`, no `points` edges.
- `build.py` strips `points` from the student HTML; they exist only for the
  teacher key and grading. The student never sees points or correctness.

## Craft (author + reviewer enforce every line)

- **SITUATION-FIRST:** every non-leaf `question` ≥15 words: restate who/where
  and the key facts implied by `outcome`, then ask the decision. Never a bare
  "What next?" Root embeds the setup (the `scenario` frames it).
- **LENGTH PARITY:** at one node, every choice text ≥3 words and within ±25%
  word count of the longest sibling (build enforces `min*4 >= max*3`).
  Parallel grammar; the highest-points choice is never the longest.
- **NEAR-MISS DISTRACTORS:** each wrong choice is a plausible action a decent
  learner might pick, failing on exactly ONE subtle point (wrong sequence,
  outdated threshold, right move for a different case). No absurd throwaways,
  no one-word options, no "all of the above".
- **GRADUATED POINTS:** gold edge 9–10; plausible near-miss 5–7; weak-but-real
  1–4. Along the gold path the chosen edge is **strictly** higher than every
  sibling at that node, and the gold path's total is **strictly** higher than
  every other complete path (no ties — build rejects them).
- **CONVERGENCE:** prefer recycling a later node over minting a twin; two
  parents into one node is the point of the DAG.

## Blueprint before nodes

Map MILOs → layers; draft the gold path (root → leaf) first; reserve ids for
later layers; decrement `max_nodes` as each layer lands so early layers cannot
starve late ones. Record the mapping in build notes — scaffolding, never
shipped student data.

## Reviewer checklist (per level, independent of the author)

1. question ≥15 words, situation-first, matches `outcome` facts
2. choices 2–4, labels sequential, texts ≥3 words and ±25% parity
3. distractors near-miss only; gold edge strictly highest; points graduated
4. `nextNodeId` targets exist or are reserved; levels strictly increase
5. budget: nodes used so far ≤ `max_nodes`
Verdict: `pass` or `fail` + line-precise rewrite list (max 2 retries → user).
