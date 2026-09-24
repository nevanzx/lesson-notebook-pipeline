# DAG Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure multi-layer DAG multiple-choice mode as a per-lesson alternative to the flat 20-item assignment — `build.json` picks the mode, build validates/sanitizes/writes a dag key, the assignment component walks the graph forward-only, the skill authors it via per-level author+reviewer agents, and `checker/` auto-scores path points vs the precomputed max.

**Architecture:** Dual-mode on the existing `assignment` component (one mount; student data shape `mode:"dag"`+`nodes[]` vs `items[]` selects the body). `build.py` gains `_dag_optimal` (path enumeration), a dag validation branch, a points-stripping sanitize branch, and a key-file branch that embeds `dag.optimal`. The checker scores decrypted `path` steps against key nodes (no AI, no Worker). Authoring law ships as `v2/skeleton/dag-craft.md` + SKILL.md §7 wiring (serial level agents, each with its own reviewer).

**Tech Stack:** Python 3.13 + pytest (build pipeline), vanilla JS + Node DOM-stub smoke (component), Node `node --test` (checker), Markdown (skill/docs).

**Spec:** `docs/superpowers/specs/2026-09-24-dag-assignment-design.md`

## Global Constraints

- Mode flag: `build.json` `"assignment": "flat"` (default) | `"dag"`; dag requires `"dag": {"levels": int 2–5, "max_nodes": int, levels+1 ≤ max_nodes ≤ 16}` — exactly those two keys.
- Student dag data: `{intro?, mode:"dag", title, scenario, nodes:[{id, level, isLeaf, question, outcome, choices[{label,text,nextNodeId}], finalOutcome?}]}` — **`points` must never appear in shipped student HTML**.
- Teacher key dag: `mode:"dag"` + `dag:{levels, max_nodes, title, scenario, nodes(full), optimal:{path, max_score}}`; flat keys keep today's shape (**no `mode` key** — backward compatible).
- Submission dag body: `{title, subject, week, student, submitted_at, mode:"dag", path:[{node,label}], final_outcome}`; crypto envelope unchanged.
- Graph rules: unique `/^n\d+$/` ids; exactly one `level===0` root; `0 ≤ level < levels`; edges only to strictly higher `level` (⇒ acyclic); every node reachable from root; non-leaf 2–4 choices with `label==="ABCD"[i]`; leaf `choices:[]` + non-empty `finalOutcome`; `points` int 0–10; `outcome` null on root else non-empty; question non-empty everywhere, ≥15 words on non-leaves; choice texts at one node each ≥3 words and within ±25% (`min*4 >= max*3`); gold path: exactly one max-total path AND on that path each chosen edge strictly highest-points at its node.
- Component: forward-only (no Back in dag mode); shared identity gate/guards/encryption; `show()` remains the sole recompute point for Next-disabled + layer meter; every choice listener calls `bump()`.
- No Editor UI; no SA/tf/id in dag mode; Worker untouched; flat sample `lesson-demo` stays flat.
- Assembled `.html` outputs are read-only products — fix parts/data, rebuild.
- No hex colours, no URLs, no `@import` in shipped content (existing build rules apply to anything added).
- `node tools/assignment_smoke.js` from `v2/` must print `SMOKE OK` after Task 5 (flat walk + new dag walk).
- `python build.py sample/lesson-demo` from `v2/` must still print `OK` after every task (run in a temp dir; never commit generated `.html`).
- Run Python tests from the repo root: `python -m pytest tests -q`. **Known pre-existing baseline (verified this session): 36 failed / 79 passed** — failures only in `test_shards`, `test_e2e_fanout`, `test_themes_matrix` (unlanded features on master). Gate = "exactly 36 failed, none in files this plan touches", not "all pass".
- Checker tests: `node --test test/*.test.js` from `checker/app` — **baseline 24 pass / 0 fail**; must stay green.
- **Uncommitted WIP:** `checker/app/app.js` + `checker/app/teacher.html` currently carry stepper-navigation changes (not in git). Task 7 must edit on top of the working tree and must not revert them; do not commit those two files as part of dag work unless the user asks (stage only what you intentionally changed if partial staging is needed — prefer committing the whole checker task state together with a message that notes the stepper WIP rides along, or ask the user first).

---

### Task 1: `_dag_optimal` — pure path enumerator

**Files:**
- Modify: `v2/build.py` (new function after `ASSIGN_SA_MIN` block, ~line 609)
- Test: `tests/test_assignment_dag.py` (new file)

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `build._dag_optimal(nodes: list[dict]) -> dict` with keys `path: list[{node,label,points}]`, `max_score: int`, `max_count: int`, `path_count: int`, `node_level_ok: bool`. Task 2 calls `max_count===1` + `node_level_ok` + `path_count>=1`; Task 4 writes `path`/`max_score` into the key file.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_assignment_dag.py`:

```python
import json
import build


def chain_nodes():
    """n0 → n1 → n2 leaf; unique gold path; strict node-level highs."""
    return [
        {"id": "n0", "level": 0, "isLeaf": False, "question": "Q " * 16,
         "outcome": None, "finalOutcome": None,
         "choices": [
             {"label": "A", "text": "alpha move here now", "points": 10, "nextNodeId": "n1"},
             {"label": "B", "text": "beta move here now", "points": 5, "nextNodeId": "n1"},
         ]},
        {"id": "n1", "level": 1, "isLeaf": False, "question": "Q " * 16,
         "outcome": "Arrived.", "finalOutcome": None,
         "choices": [
             {"label": "A", "text": "second step choice", "points": 8, "nextNodeId": "n2"},
             {"label": "B", "text": "other step choice", "points": 3, "nextNodeId": "n2"},
         ]},
        {"id": "n2", "level": 2, "isLeaf": True, "question": "End of line",
         "outcome": "Done arriving.", "finalOutcome": "Scenario closed."},
    ]


def diamond_nodes():
    """n0 → (n1 | n2) → n3 leaf — two complete paths, distinct totals."""
    return [
        {"id": "n0", "level": 0, "isLeaf": False, "question": "Q " * 16,
         "outcome": None, "finalOutcome": None,
         "choices": [
             {"label": "A", "text": "path one goes here", "points": 10, "nextNodeId": "n1"},
             {"label": "B", "text": "path two goes here", "points": 4, "nextNodeId": "n2"},
         ]},
        {"id": "n1", "level": 1, "isLeaf": False, "question": "Q " * 16,
         "outcome": "Took upper road.", "finalOutcome": None,
         "choices": [
             {"label": "A", "text": "meet at junction", "points": 7, "nextNodeId": "n3"},
             {"label": "B", "text": "miss the junction", "points": 2, "nextNodeId": "n3"},
         ]},
        {"id": "n2", "level": 1, "isLeaf": False, "question": "Q " * 16,
         "outcome": "Took lower road.", "finalOutcome": None,
         "choices": [
             {"label": "A", "text": "meet at junction", "points": 9, "nextNodeId": "n3"},
             {"label": "B", "text": "miss the junction", "points": 1, "nextNodeId": "n3"},
         ]},
        {"id": "n3", "level": 2, "isLeaf": True, "question": "End of line",
         "outcome": "Paths met.", "finalOutcome": "Both roads end here."},
    ]


def test_linear_chain_unique_max():
    r = build._dag_optimal(chain_nodes())
    assert r["path_count"] == 2          # A-A and A-B etc. through the chain
    assert r["max_count"] == 1
    assert r["max_score"] == 18          # 10 + 8
    assert r["node_level_ok"] is True
    assert r["path"] == [
        {"node": "n0", "label": "A", "points": 10},
        {"node": "n1", "label": "A", "points": 8},
    ]


def test_diamond_finds_best_total():
    r = build._dag_optimal(diamond_nodes())
    # paths: A/A=17, A/B=12, B/A=13, B/B=5
    assert r["path_count"] == 4
    assert r["max_count"] == 1
    assert r["max_score"] == 17
    assert r["path"][0]["label"] == "A" and r["path"][1]["label"] == "A"
    assert r["node_level_ok"] is True


def test_tied_max_paths_reported():
    nodes = diamond_nodes()
    # force a tie: n2's A-edge also totals 17 (4+13) — set n2/A points to 13
    for n in nodes:
        if n["id"] == "n2":
            n["choices"][0]["points"] = 13
    r = build._dag_optimal(nodes)
    # paths A/A=17 and B/A=17
    assert r["max_score"] == 17
    assert r["max_count"] == 2


def test_empty_and_rootless():
    assert build._dag_optimal([])["path_count"] == 0
    nodes = chain_nodes()
    nodes[0]["level"] = 1  # no level-0 root
    r = build._dag_optimal(nodes)
    assert r["path_count"] == 0


def test_node_level_ok_false_when_sibling_ties_or_beats_gold_edge():
    nodes = chain_nodes()
    # sibling edge at n0 with equal points to the gold edge (10)
    nodes[0]["choices"][1]["points"] = 10
    # still unique max by path? A-A=18, B-A=18 → max_count 2; also node_level fails
    r = build._dag_optimal(nodes)
    assert r["node_level_ok"] is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_dag.py -q`
Expected: FAIL with `AttributeError: module 'build' has no attribute '_dag_optimal'`

- [ ] **Step 3: Implement `_dag_optimal` in `v2/build.py`**

Insert after line 609 (`ASSIGN_SA_MIN = 2`):

```python
def _dag_optimal(nodes):
    """Enumerate every root-to-leaf path; report max, uniqueness, node-level rule.

    Budget is tiny (<=16 nodes, branch<=4, depth<=5) so full enumeration beats
    DP for the second-best / tie checks. Assumes higher-level edges only
    (validate_assignment enforces that before relying on this).
    """
    by_id = {n["id"]: n for n in (nodes or []) if isinstance(n, dict) and n.get("id")}
    roots = [n for n in by_id.values() if n.get("level") == 0]
    best_path, max_score = [], None
    max_count, path_count = 0, 0

    def walk(node_id, path, total):
        nonlocal best_path, max_score, max_count, path_count
        node = by_id[node_id]
        if node.get("isLeaf"):
            path_count += 1
            if max_score is None or total > max_score:
                max_score, max_count, best_path = total, 1, list(path)
            elif total == max_score:
                max_count += 1
            return
        for ch in (node.get("choices") or []):
            nxt = ch.get("nextNodeId")
            if nxt is None or nxt not in by_id:
                continue
            pts = ch.get("points") if isinstance(ch.get("points"), int) else 0
            walk(nxt, path + [{"node": node_id, "label": ch.get("label"),
                               "points": pts}], total + pts)

    if roots:
        walk(roots[0]["id"], [], 0)

    node_level_ok = True
    for step in best_path:
        node = by_id.get(step["node"])
        if not node:
            node_level_ok = False
            break
        chosen_pts = None
        for ch in (node.get("choices") or []):
            if ch.get("label") == step["label"]:
                chosen_pts = ch.get("points") if isinstance(ch.get("points"), int) else 0
                break
        if chosen_pts is None:
            node_level_ok = False
            break
        for ch in (node.get("choices") or []):
            if ch.get("label") == step["label"]:
                continue
            sib = ch.get("points") if isinstance(ch.get("points"), int) else 0
            if sib >= chosen_pts:
                node_level_ok = False
                break

    return {
        "path": best_path,
        "max_score": max_score if max_score is not None else 0,
        "max_count": max_count,
        "path_count": path_count,
        "node_level_ok": node_level_ok,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_assignment_dag.py -q`
Expected: 5 passed

- [ ] **Step 5: Confirm baseline intact**

Run: `python -m pytest tests -q --tb=no`
Expected: `37 failed, 84 passed` (36 pre-existing + this file's tests were already counted… actually baseline was 36F/79P before this file existed; after adding 5 passing tests: still **36 failed**, **84 passed**)

- [ ] **Step 6: Commit**

```bash
git add v2/build.py tests/test_assignment_dag.py
git commit -m "feat(build): _dag_optimal path enumerator for DAG assignments"
```

---

### Task 2: `validate_assignment` dag branch + mode cross-check

**Files:**
- Modify: `v2/build.py` (`validate_assignment` at :710 and new helpers)
- Test: `tests/test_assignment_dag.py`

**Interfaces:**
- Consumes: `build._dag_optimal` (Task 1).
- Produces: `build.validate_assignment(data, errors, expected_mode=None, dag_cfg=None)` — third/fourth args optional; `dag_cfg` is `{"levels": int, "max_nodes": int}` or `None` (infer levels from data, cap 16). Task 3's assemble call passes `expected_mode=cfg.get("assignment","flat")` and `dag_cfg=cfg.get("dag")`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_assignment_dag.py`:

```python
def dag_data(nodes=None, mode="dag"):
    return {
        "intro": "i", "mode": mode, "title": "T", "scenario": "S",
        "nodes": nodes if nodes is not None else chain_nodes(),
    }


def test_dag_valid_passes_with_cfg():
    errs = []
    build.validate_assignment(dag_data(), errs,
                              expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert not errs, [str(e) for e in errs]


def test_mode_mismatch_cfg_vs_data():
    errs = []
    build.validate_assignment(dag_data(), errs, expected_mode="flat")
    assert any("mode" in e.msg for e in errs)
    errs = []
    data = {"intro": "i", "items": []}
    build.validate_assignment(data, errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("mode" in e.msg for e in errs)


def test_dag_rejects_tie_and_node_level_violation():
    nodes = diamond_nodes()
    for n in nodes:
        if n["id"] == "n2":
            n["choices"][0]["points"] = 13  # ties gold at 17
    errs = []
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("gold" in e.msg or "strict" in e.msg for e in errs)


def test_dag_level_budget_and_edge_direction():
    errs = []
    nodes = chain_nodes()
    nodes[2]["level"] = 5  # >= levels(3)
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("level" in e.msg for e in errs)
    errs = []
    nodes = chain_nodes()
    # n0's A edge points BACKWARD to a fake lower-level target via n2 (level 2)
    nodes[0]["choices"][0]["nextNodeId"] = "n2"  # 0→2 is forward, ok;
    # instead make n1 point at n0 (backward)
    nodes[1]["choices"][0]["nextNodeId"] = "n0"
    nodes[1]["choices"][1]["nextNodeId"] = "n0"
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("level" in e.msg or "reach" in e.msg.lower() or "edge" in e.msg for e in errs)


def test_dag_unreachable_node_rejected():
    nodes = chain_nodes()
    nodes.append({"id": "n9", "level": 1, "isLeaf": True,
                  "question": "Orphan leaf", "outcome": "Ghost.",
                  "choices": [], "finalOutcome": "Nobody saw this."})
    errs = []
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("reach" in e.msg.lower() for e in errs)


def test_dag_max_nodes_cap():
    errs = []
    # 4 nodes but max_nodes=3 with levels=3 → needs >=4; set cap 3 impossible with levels 3
    # use levels=2, max_nodes=3, but 4 nodes present
    nodes = chain_nodes()  # 4 nodes? chain has 3 — add one via diamond
    nodes = diamond_nodes()  # 4 nodes
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 3})
    assert any("max_nodes" in e.msg for e in errs)


def test_dag_labels_choices_and_points():
    errs = []
    nodes = chain_nodes()
    nodes[0]["choices"][0]["label"] = "C"  # must be A at index 0
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("label" in e.msg for e in errs)
    errs = []
    nodes = chain_nodes()
    nodes[0]["choices"][0]["points"] = 11
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("points" in e.msg for e in errs)
    errs = []
    nodes = chain_nodes()
    nodes[0]["choices"].append({"label": "C", "text": "third option text",
                                "points": 1, "nextNodeId": "n1"})
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    # 3 choices is legal (2-4) — should NOT error on count
    assert not any("choices" in e.msg and "2-4" in e.msg for e in errs)


def test_dag_question_and_choice_word_floors():
    errs = []
    nodes = chain_nodes()
    nodes[0]["question"] = "Too short?"  # <15 words on non-leaf
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("15" in e.msg or "question" in e.msg for e in errs)
    errs = []
    nodes = chain_nodes()
    nodes[0]["choices"][0]["text"] = "tiny"
    nodes[0]["choices"][1]["text"] = "a much longer choice text here okay"
    # min=1, max=7 → parity fail and min<3
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("word" in e.msg for e in errs)


def test_dag_leaf_rules():
    errs = []
    nodes = chain_nodes()
    nodes[2]["finalOutcome"] = ""
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("finalOutcome" in e.msg for e in errs)
    errs = []
    nodes = chain_nodes()
    nodes[2]["choices"] = [{"label": "A", "text": "leaf should not choose",
                            "points": 1, "nextNodeId": None}]
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("leaf" in e.msg.lower() or "choices" in e.msg for e in errs)


def test_flat_mode_untouched_by_dag_rules():
    # reuse the flat fixture pattern from test_assignment_contract
    items = []
    items += [{"type": "mc", "prompt": "q%d" % i,
               "choices": ["a", "b", "c", "d"], "ans": i % 4} for i in range(10)]
    items += [{"type": "tf", "prompt": "t%d" % i, "ans": i % 2 == 0} for i in range(4)]
    items += [{"type": "id", "prompt": "i%d" % j, "aliases": ["x"]} for j in range(4)]
    items += [{"type": "sa", "prompt": "s%d" % j, "key_points": ["k"],
               "rubric": "2 pts: a + b", "max_points": 2} for j in range(2)]
    errs = []
    build.validate_assignment({"intro": "i", "items": items}, errs)
    assert not errs, [str(e) for e in errs]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_dag.py -q`
Expected: new tests FAIL (`TypeError: validate_assignment() got an unexpected keyword argument 'expected_mode'` or dag data silently validated as flat producing item-count errors)

- [ ] **Step 3: Implement the dag validation branch**

In `v2/build.py`, replace the whole `validate_assignment` function (starts line 710) with:

```python
def _wc(s):
    return len(str(s or "").split())


def validate_assignment(data, errors, expected_mode=None, dag_cfg=None):
    data = data or {}
    data_mode = data.get("mode", "flat")
    if data_mode not in ("flat", "dag"):
        errors.append(Err("assign", "data.js", None,
                          "unknown assignment mode %r" % (data_mode,),
                          "mode must be \"dag\" or omitted (flat)"))
        return
    if expected_mode is not None and data_mode != expected_mode:
        errors.append(Err("assign", "data.js", None,
                          "data mode %r != build.json assignment %r"
                          % (data_mode, expected_mode),
                          "set \"mode\": \"%s\" in the assignment data (or fix build.json)"
                          % expected_mode))
        return
    if data_mode == "dag":
        _validate_assignment_dag(data, errors, dag_cfg)
        return
    _validate_assignment_flat(data, errors)


def _validate_assignment_flat(data, errors):
    items = (data or {}).get("items") or []
    n_sa = sum(1 for it in items if it.get("type") == "sa")
    if n_sa < ASSIGN_SA_MIN:
        errors.append(Err("assign", "data.js", None,
                          "assignment needs at least %d sa items, found %d"
                          % (ASSIGN_SA_MIN, n_sa),
                          "author 2 or more situational short-answer items"))
        return
    if len(items) != sum(ASSIGN_FIXED.values()) + n_sa:
        errors.append(Err("assign", "data.js", None,
                          "assignment needs exactly %d fixed items + %d sa, found %d total"
                          % (sum(ASSIGN_FIXED.values()), n_sa, len(items)),
                          "author 10 mc, 4 tf, 4 id, and 2 or more sa"))
        return
    counts = {}
    for n, it in enumerate(items, 1):
        t = it.get("type")
        counts[t] = counts.get(t, 0) + 1
        if not str(it.get("prompt") or "").strip():
            errors.append(Err("assign", "data.js", None,
                              "item %d has an empty prompt" % n, ""))
        if t == "mc":
            ch = it.get("choices") or []
            if len(ch) != 4 or not all(str(c).strip() for c in ch):
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d needs exactly 4 non-empty choices" % n, ""))
            a = it.get("ans")
            if not isinstance(a, int) or not 0 <= a < 4:
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d needs ans 0..3" % n,
                                  "the answer key ships only to build/key/"))
            wc = [len(str(c).split()) for c in ch]
            if len(ch) == 4 and max(wc) - min(wc) > 1:
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d choices vary by %d words — keep all four "
                                  "within 1 word (question-craft.md)"
                                  % (n, max(wc) - min(wc)),
                                  "trim or pad choices so they match in length"))
        elif t == "tf":
            if not isinstance(it.get("ans"), bool):
                errors.append(Err("assign", "data.js", None,
                                  "tf item %d needs a boolean ans" % n, ""))
        elif t == "id":
            al = it.get("aliases") or []
            if not al or not all(isinstance(a, str) and a.strip() for a in al):
                errors.append(Err("assign", "data.js", None,
                                  "id item %d needs a non-empty aliases list" % n,
                                  "aliases = accepted answer variants for grading"))
        elif t == "sa":
            kp = it.get("key_points") or []
            if not kp or not all(isinstance(a, str) and a.strip() for a in kp):
                errors.append(Err("assign", "data.js", None,
                                  "sa item %d needs a non-empty key_points list" % n,
                                  "key_points = the objective marks for grading"))
            rb = it.get("rubric")
            if not isinstance(rb, str) or not rb.strip():
                errors.append(Err("assign", "data.js", None,
                                  "sa item %d needs a non-empty rubric string" % n,
                                  "rubric = the scoring criteria shipped to the key file"))
            mp = it.get("max_points")
            if not isinstance(mp, int) or isinstance(mp, bool) or mp <= 0:
                errors.append(Err("assign", "data.js", None,
                                  "sa item %d needs a positive integer max_points" % n,
                                  "max_points = the SA item's point ceiling"))
        else:
            errors.append(Err("assign", "data.js", None,
                              "item %d has unknown type %r" % (n, t),
                              "types: mc, tf, id, sa"))
    tf_bool = [it.get("ans") for it in items
               if it.get("type") == "tf" and isinstance(it.get("ans"), bool)]
    if len(tf_bool) == ASSIGN_FIXED["tf"] and len(set(tf_bool)) == 1:
        errors.append(Err("assign", "data.js", None,
                          "tf block is all-%s — single-flip traps need both verdicts"
                          % ("true" if tf_bool[0] else "false"),
                          "author at least one true and one false statement"))
    for t, want in sorted(ASSIGN_FIXED.items()):
        got = counts.get(t, 0)
        if got != want:
            errors.append(Err("assign", "data.js", None,
                              "type mix has %d %s, expected exactly %d"
                              % (got, t, want),
                              "author 10 mc, 4 tf, 4 id, and 2 or more sa"))


def _validate_assignment_dag(data, errors, dag_cfg):
    dag_cfg = dag_cfg or {}
    title = data.get("title")
    scenario = data.get("scenario")
    if not isinstance(title, str) or not title.strip():
        errors.append(Err("assign", "data.js", None,
                          "dag assignment needs a non-empty title", ""))
    if not isinstance(scenario, str) or not scenario.strip():
        errors.append(Err("assign", "data.js", None,
                          "dag assignment needs a non-empty scenario", ""))
    if "intro" in data and data["intro"] is not None and not isinstance(data["intro"], str):
        errors.append(Err("assign", "data.js", None, "intro must be a string", ""))
    nodes = data.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        errors.append(Err("assign", "data.js", None,
                          "dag assignment needs a non-empty nodes array", ""))
        return

    levels_cfg = dag_cfg.get("levels")
    max_nodes_cfg = dag_cfg.get("max_nodes")
    if not isinstance(levels_cfg, int) or isinstance(levels_cfg, bool):
        levels_cfg = max((n.get("level") or 0) for n in nodes
                         if isinstance(n, dict)) + 1
    if not isinstance(max_nodes_cfg, int) or isinstance(max_nodes_cfg, bool):
        max_nodes_cfg = 16

    if len(nodes) > max_nodes_cfg:
        errors.append(Err("assign", "data.js", None,
                          "dag has %d nodes, max_nodes is %d"
                          % (len(nodes), max_nodes_cfg),
                          "reuse nodes (convergence) or raise dag.max_nodes in build.json"))

    ids = set()
    for n in nodes:
        nid = n.get("id") if isinstance(n, dict) else None
        if not isinstance(nid, str) or not re.match(r"^n\d+$", nid):
            errors.append(Err("assign", "data.js", None,
                              "dag node id %r must match n0, n1, …" % (nid,), ""))
            return
        if nid in ids:
            errors.append(Err("assign", "data.js", None,
                              "duplicate dag node id %s" % nid, ""))
            return
        ids.add(nid)

    roots = [n for n in nodes if n.get("level") == 0]
    if len(roots) != 1:
        errors.append(Err("assign", "data.js", None,
                          "dag needs exactly one level-0 root, found %d" % len(roots),
                          "mark the start node level 0; all others level 1..levels-1"))
        return
    root_id = roots[0]["id"]

    for n in nodes:
        lvl = n.get("level")
        if not isinstance(lvl, int) or isinstance(lvl, bool) or not (0 <= lvl < levels_cfg):
            errors.append(Err("assign", "data.js", None,
                              "node %s level %r out of range 0..%d"
                              % (n.get("id"), lvl, levels_cfg - 1),
                              "fix dag.levels in build.json or the node's level"))
            return
        q = n.get("question")
        if not isinstance(q, str) or not q.strip():
            errors.append(Err("assign", "data.js", None,
                              "node %s has an empty question" % n.get("id"), ""))
        elif not n.get("isLeaf") and _wc(q) < 15:
            errors.append(Err("assign", "data.js", None,
                              "node %s question has %d words (<15) — situation-first "
                              "(dag-craft.md)" % (n.get("id"), _wc(q)),
                              "restate the learner's situation before the decision"))
        if n.get("isLeaf"):
            if n.get("choices"):
                errors.append(Err("assign", "data.js", None,
                                  "leaf %s must have choices: []" % n.get("id"), ""))
            if not str(n.get("finalOutcome") or "").strip():
                errors.append(Err("assign", "data.js", None,
                                  "leaf %s needs a non-empty finalOutcome" % n.get("id"), ""))
        else:
            if n.get("finalOutcome"):
                errors.append(Err("assign", "data.js", None,
                                  "non-leaf %s must not carry finalOutcome" % n.get("id"), ""))
            chs = n.get("choices")
            if not isinstance(chs, list) or not (2 <= len(chs) <= 4):
                errors.append(Err("assign", "data.js", None,
                                  "node %s needs 2-4 choices (got %s)"
                                  % (n.get("id"), len(chs) if isinstance(chs, list) else None), ""))
                continue
            lens = []
            for i, c in enumerate(chs):
                if c.get("label") != "ABCD"[i]:
                    errors.append(Err("assign", "data.js", None,
                                      "node %s choice %d label must be %r, got %r"
                                      % (n.get("id"), i, "ABCD"[i], c.get("label")), ""))
                txt = c.get("text")
                if not isinstance(txt, str) or not txt.strip():
                    errors.append(Err("assign", "data.js", None,
                                      "node %s choice %d has empty text"
                                      % (n.get("id"), i), ""))
                pts = c.get("points")
                if not isinstance(pts, int) or isinstance(pts, bool) or not (0 <= pts <= 10):
                    errors.append(Err("assign", "data.js", None,
                                      "node %s choice %d points must be int 0..10"
                                      % (n.get("id"), i), ""))
                nxt = c.get("nextNodeId")
                if nxt not in ids:
                    errors.append(Err("assign", "data.js", None,
                                      "node %s choice %d nextNodeId %r not found"
                                      % (n.get("id"), i, nxt),
                                      "point at an existing higher-level node"))
                else:
                    tgt = next(x for x in nodes if x["id"] == nxt)
                    if not (tgt.get("level", 0) > n.get("level", 0)):
                        errors.append(Err("assign", "data.js", None,
                                          "node %s → %s does not increase level "
                                          "(%s → %s) — DAG edges must go forward"
                                          % (n.get("id"), nxt, n.get("level"),
                                             tgt.get("level")),
                                          "re-wire the choice or fix levels"))
                lens.append(_wc(txt))
            if lens:
                mn, mx = min(lens), max(lens)
                if mn < 3 or mn * 4 < mx * 3:
                    errors.append(Err("assign", "data.js", None,
                                      "node %s choices vary %d..%d words — keep each ≥3 "
                                      "and within ±25%% (dag-craft.md)"
                                      % (n.get("id"), mn, mx),
                                      "rebalance choice texts at this node"))
        if n.get("level") == 0:
            if n.get("outcome") not in (None, ""):
                errors.append(Err("assign", "data.js", None,
                                  "root outcome must be null", ""))
        else:
            if not str(n.get("outcome") or "").strip():
                errors.append(Err("assign", "data.js", None,
                                  "node %s needs a non-empty outcome" % n.get("id"),
                                  "outcome = consequence of the incoming choice"))

    # reachability from root
    by_id = {n["id"]: n for n in nodes}
    seen = set()
    stack = [root_id]
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        for c in (by_id[cur].get("choices") or []):
            t = c.get("nextNodeId")
            if t in by_id and t not in seen:
                stack.append(t)
    unreachable = ids - seen
    if unreachable:
        errors.append(Err("assign", "data.js", None,
                          "unreachable dag node(s): %s"
                          % ", ".join(sorted(unreachable)),
                          "every node must be reachable from the root"))

    # gold-path rules (only if structure got this far cleanly enough to walk)
    if not unreachable and not any(
            "does not increase level" in e.msg or "not found" in e.msg for e in errors):
        opt = _dag_optimal(nodes)
        if opt["path_count"] < 1:
            errors.append(Err("assign", "data.js", None,
                              "dag has no complete root-to-leaf path",
                              "mark at least one reachable node as a leaf"))
        elif opt["max_count"] != 1:
            errors.append(Err("assign", "data.js", None,
                              "gold path is not unique — %d paths tie at %d points"
                              % (opt["max_count"], opt["max_score"]),
                              "one path must be strictly highest (dag-craft.md gold rule)"))
        elif not opt["node_level_ok"]:
            errors.append(Err("assign", "data.js", None,
                              "gold edge is not strictly highest at its node",
                              "gold choice must out-point every sibling on the path"))
```

Note: `re` is already imported in `build.py`. Keep the existing flat test expectations in `test_assignment_contract.py` green — the flat body is unchanged logic, just moved into `_validate_assignment_flat`.

- [ ] **Step 4: Run new + regression tests**

Run: `python -m pytest tests/test_assignment_dag.py tests/test_assignment_contract.py -q`
Expected: all pass

- [ ] **Step 5: Full suite baseline**

Run: `python -m pytest tests -q --tb=line`
Expected: `36 failed, 93 passed` (or nearby — **zero failures inside `test_assignment_dag.py` / `test_assignment_contract.py`**)

- [ ] **Step 6: Commit**

```bash
git add v2/build.py tests/test_assignment_dag.py
git commit -m "feat(build): validate_assignment dag branch with mode cross-check"
```

---

### Task 3: build.json config validation + assemble wiring

**Files:**
- Modify: `v2/build.py` (unknown-keys set ~:846, new `validate_assign_cfg`, call site ~:939-942)
- Test: `tests/test_assignment_dag.py`

**Interfaces:**
- Consumes: `validate_assignment(..., expected_mode=, dag_cfg=)` (Task 2).
- Produces: `build.validate_assign_cfg(cfg, errors)` — pure, testable; assemble always calls it when `cfg` is a dict and `"assignment" in components`. `cfg.get("assignment", "flat")` normalized for downstream.

- [ ] **Step 1: Write the failing tests**

Append:

```python
def test_assign_cfg_defaults_and_ranges():
    errs = []
    build.validate_assign_cfg({}, errs)  # no assignment key, no component — fine
    assert not errs

    errs = []
    build.validate_assign_cfg(
        {"components": ["assignment"], "assignment": "dag",
         "dag": {"levels": 3, "max_nodes": 8}}, errs)
    assert not errs, [str(e) for e in errs]

    errs = []
    build.validate_assign_cfg({"components": ["assignment"], "assignment": "DAG"}, errs)
    assert any("flat" in e.msg or "dag" in e.msg for e in errs)

    errs = []
    build.validate_assign_cfg(
        {"components": ["assignment"], "assignment": "dag",
         "dag": {"levels": 1, "max_nodes": 8}}, errs)
    assert any("levels" in e.msg for e in errs)

    errs = []
    build.validate_assign_cfg(
        {"components": ["assignment"], "assignment": "dag",
         "dag": {"levels": 6, "max_nodes": 8}}, errs)
    assert any("levels" in e.msg for e in errs)

    errs = []
    build.validate_assign_cfg(
        {"components": ["assignment"], "assignment": "dag",
         "dag": {"levels": 3, "max_nodes": 17}}, errs)
    assert any("max_nodes" in e.msg for e in errs)

    errs = []
    build.validate_assign_cfg(
        {"components": ["assignment"], "assignment": "dag",
         "dag": {"levels": 3, "max_nodes": 3}}, errs)  # need >= levels+1 = 4
    assert any("max_nodes" in e.msg for e in errs)

    errs = []
    build.validate_assign_cfg(
        {"components": ["assignment"], "dag": {"levels": 3, "max_nodes": 8}}, errs)
    assert any("build.json" in e.msg and "dag" in e.msg for e in errs)

    errs = []
    build.validate_assign_cfg(
        {"components": ["assignment"], "assignment": "dag"}, errs)
    assert any("dag" in e.msg for e in errs)

    errs = []
    build.validate_assign_cfg(
        {"components": ["milo-list"], "assignment": "dag",
         "dag": {"levels": 3, "max_nodes": 8}}, errs)
    assert any("assignment component" in e.msg for e in errs)

    errs = []
    build.validate_assign_cfg(
        {"components": ["assignment"], "assignment": "dag",
         "dag": {"levels": 3, "max_nodes": 8, "extra": 1}}, errs)
    assert any("unknown" in e.msg or "extra" in e.msg for e in errs)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_dag.py -q -k assign_cfg`
Expected: FAIL `AttributeError: ... validate_assign_cfg`

- [ ] **Step 3: Implement `validate_assign_cfg` + wire assemble**

3a. Add after `_validate_assignment_dag` in `v2/build.py`:

```python
def validate_assign_cfg(cfg, errors):
    """Validate build.json assignment/dag keys. cfg may be any dict (or empty)."""
    if not isinstance(cfg, dict):
        return
    comps = cfg.get("components") if isinstance(cfg.get("components"), list) else []
    mode = cfg.get("assignment", "flat")
    if mode not in ("flat", "dag"):
        errors.append(Err("build.json", "build.json", None,
                          "assignment must be \"flat\" or \"dag\", got %r" % (mode,),
                          "omit assignment for flat, or set \"dag\""))
        return
    if "dag" in cfg and mode != "dag":
        errors.append(Err("build.json", "build.json", None,
                          "dag config present but assignment is not \"dag\"",
                          "drop the dag key, or set \"assignment\": \"dag\""))
    if mode != "dag":
        return
    if "assignment" not in comps:
        errors.append(Err("build.json", "build.json", None,
                          "assignment: \"dag\" requires the assignment component",
                          "add \"assignment\" to components"))
    dag = cfg.get("dag")
    if not isinstance(dag, dict):
        errors.append(Err("build.json", "build.json", None,
                          "assignment: \"dag\" needs a dag object",
                          "add \"dag\": {\"levels\": 2..5, \"max_nodes\": …}"))
        return
    extra = set(dag) - {"levels", "max_nodes"}
    missing = {"levels", "max_nodes"} - set(dag)
    if extra or missing:
        bits = []
        if missing:
            bits.append("missing %s" % ", ".join(sorted(missing)))
        if extra:
            bits.append("unknown %s" % ", ".join(sorted(extra)))
        errors.append(Err("build.json", "build.json", None,
                          "dag keys invalid (%s)" % "; ".join(bits),
                          "allowed: levels, max_nodes"))
        return
    levels, max_nodes = dag.get("levels"), dag.get("max_nodes")
    levels_ok = isinstance(levels, int) and not isinstance(levels, bool) and 2 <= levels <= 5
    if not levels_ok:
        errors.append(Err("build.json", "build.json", None,
                          "dag.levels must be an integer 2..5, got %r" % (levels,),
                          "set levels between 2 and 5"))
    if not isinstance(max_nodes, int) or isinstance(max_nodes, bool):
        errors.append(Err("build.json", "build.json", None,
                          "dag.max_nodes must be an integer, got %r" % (max_nodes,),
                          "set max_nodes between levels+1 and 16"))
    elif levels_ok and not (levels + 1 <= max_nodes <= 16):
        errors.append(Err("build.json", "build.json", None,
                          "dag.max_nodes must satisfy %d <= max_nodes <= 16, got %d"
                          % (levels + 1, max_nodes),
                          "a pure chain is not a DAG assignment; budget ≤16"))
```

3b. Allow the two new top-level keys (line ~846):

```python
        unknown = set(cfg) - {"title", "theme", "components", "output",
                              "extra_css", "extra_js", "week", "subject",
                              "assignment", "dag"}
        if unknown:
            errors.append(Err("build.json", "build.json", None,
                              "unknown keys: %s" % ", ".join(sorted(unknown)),
                              "allowed: title, theme, components, output, extra_css, "
                              "extra_js, week, subject, assignment, dag"))
```

3c. Call it right after the unknown-keys block (still inside `if cfg is not None:`), before the week/subject assignment check:

```python
        if "assignment" in cfg.get("components", []) or "assignment" in cfg or "dag" in cfg:
            validate_assign_cfg(cfg, errors)
```

3d. Pass mode + dag cfg into validation (line ~939-942):

```python
    assign_data, keys, ka = None, None, None
    if "assignment" in cfg["components"]:
        ka, assign_data = extract_assignment(parts["sections"], parts["data"], errors)
        if assign_data is not None:
            validate_assignment(
                assign_data, errors,
                expected_mode=cfg.get("assignment", "flat"),
                dag_cfg=cfg.get("dag") if isinstance(cfg.get("dag"), dict) else None)
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_assignment_dag.py tests/test_assignment_contract.py -q`
Expected: all pass

- [ ] **Step 5: Flat sample still builds**

Run from `v2/` in a temp cwd:
```powershell
$tmp = "$env:TEMP\dag-plan-build"; New-Item -ItemType Directory -Force $tmp | Out-Null; Set-Location $tmp; python D:\Programming\lesson-notebook-pipeline\v2\build.py D:\Programming\lesson-notebook-pipeline\v2\sample\lesson-demo
```
Expected: `OK - wrote ...Week4-Demo-Notebook.html` (keys OK line too)

- [ ] **Step 6: Commit**

```bash
git add v2/build.py tests/test_assignment_dag.py
git commit -m "feat(build): validate build.json assignment/dag config keys"
```

---

### Task 4: sanitize + write_key_file dag branches

**Files:**
- Modify: `v2/build.py` (`sanitize_assignment_data` ~:673, `write_key_file` ~:795)
- Test: `tests/test_assignment_dag.py`

**Interfaces:**
- Consumes: `_dag_optimal` (Task 1); validated dag data shape (Task 2).
- Produces: student HTML text with **no `"points"` substring inside the rewritten assignment object**; key JSON body with `mode:"dag"` and `dag.optimal.{path,max_score}` for Task 7.

- [ ] **Step 1: Write the failing tests**

Append:

```python
def test_sanitize_dag_strips_points_keeps_structure():
    data = dag_data()
    dat = "LN.data.xx = \"keep\";\nLN.data.assign7 = " + json.dumps(data) + ";\n"
    out = build.sanitize_assignment_data(dat, "assign7", data)
    assert 'LN.data.xx = "keep"' in out
    body = out.split("LN.data.assign7 = ", 1)[1].split(";", 1)[0]
    obj = json.loads(body)
    assert obj["mode"] == "dag"
    assert obj["title"] == "T" and obj["scenario"] == "S"
    assert "points" not in body
    assert obj["nodes"][0]["choices"][0]["nextNodeId"] == "n1"
    assert obj["nodes"][0]["choices"][0]["label"] == "A"
    assert obj["nodes"][2]["finalOutcome"] == "Scenario closed."
    assert "points" not in json.dumps(obj)


def test_write_key_file_dag_block(tmp_path):
    run = tmp_path / "run"
    run.mkdir()
    errs = []
    data = dag_data()
    build.validate_assignment(data, errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert not errs, [str(e) for e in errs]
    keys = build.ensure_teacher_keys(run / "build" / "key")
    cfg = {"title": "T", "output": "Week9-Notebook.html", "week": 9,
           "subject": "Mgmt", "assignment": "dag",
           "dag": {"levels": 3, "max_nodes": 8}}
    kf = build.write_key_file(run, cfg, data, keys)
    body = json.loads(kf.read_text(encoding="utf-8"))
    assert body["mode"] == "dag"
    assert "items" not in body
    d = body["dag"]
    assert d["levels"] == 3 and d["max_nodes"] == 8
    assert len(d["nodes"]) == 3
    assert d["nodes"][0]["choices"][0]["points"] == 10
    assert d["optimal"]["max_score"] == 18
    assert d["optimal"]["path"][0] == {"node": "n0", "label": "A", "points": 10}
    assert body["week"] == 9 and "BEGIN PRIVATE KEY" in body["teacher_key_pem"]
    assert "decrypt.py" in body["decrypt"]


def test_write_key_file_flat_unchanged(tmp_path):
    run = tmp_path / "run"
    run.mkdir()
    items = []
    items += [{"type": "mc", "prompt": "q%d" % i,
               "choices": ["a", "b", "c", "d"], "ans": i % 4} for i in range(10)]
    items += [{"type": "tf", "prompt": "t%d" % i, "ans": True if i < 2 else False}
              for i in range(4)]
    items += [{"type": "id", "prompt": "i%d" % j, "aliases": ["x"]} for j in range(4)]
    items += [{"type": "sa", "prompt": "s%d" % j, "key_points": ["k"],
               "rubric": "2 pts", "max_points": 2} for j in range(2)]
    data = {"intro": "i", "items": items}
    keys = build.ensure_teacher_keys(run / "build" / "key")
    kf = build.write_key_file(
        run, {"title": "T", "output": "W.html", "week": 1, "subject": "S"},
        data, keys)
    body = json.loads(kf.read_text(encoding="utf-8"))
    assert "mode" not in body and len(body["items"]) == 20
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_dag.py -q -k "sanitize_dag or write_key"`
Expected: FAIL (sanitize still emits flat `{intro, items}`; key has `items` not `dag`)

- [ ] **Step 3: Implement sanitize dag branch**

In `sanitize_assignment_data`, replace the tail that builds `safe_items`/`safe` (from `safe_items = []` through `safe = {...}`) with:

```python
    if data.get("mode") == "dag":
        safe_nodes = []
        for n in (data.get("nodes") or []):
            row = {
                "id": n.get("id"),
                "level": n.get("level"),
                "isLeaf": bool(n.get("isLeaf")),
                "question": n.get("question", ""),
                "outcome": n.get("outcome"),
                "choices": [
                    {"label": c.get("label"), "text": c.get("text", ""),
                     "nextNodeId": c.get("nextNodeId")}
                    for c in (n.get("choices") or [])
                ],
            }
            if row["isLeaf"]:
                row["finalOutcome"] = n.get("finalOutcome", "")
            safe_nodes.append(row)
        safe = {"intro": data.get("intro", ""), "mode": "dag",
                "title": data.get("title", ""), "scenario": data.get("scenario", ""),
                "nodes": safe_nodes}
    else:
        safe_items = []
        for it in (data.get("items") or []):
            row = {"type": it.get("type"), "prompt": it.get("prompt")}
            if it.get("type") == "mc":
                row["choices"] = list(it.get("choices") or [])
            safe_items.append(row)
        safe = {"intro": data.get("intro", ""), "items": safe_items}
    return data_text[:i] + json.dumps(safe, ensure_ascii=False) + data_text[end + 1:]
```

- [ ] **Step 4: Implement write_key_file dag branch**

Replace the body of `write_key_file` after `rows = []` … through the `kf.write_text(json.dumps({...}))` with:

```python
    body = {
        "lesson": cfg["title"], "output": cfg["output"],
        "week": cfg["week"], "subject": cfg["subject"],
        "key_id": keys["id"], "public_key_b64": keys["pub_b64"],
        "teacher_key_pem": keys["pem_text"],
        "decrypt": "python v2/tools/decrypt.py --key build/key/%s <submissions…>"
                   % (Path(cfg["output"]).stem + "-key.json"),
    }
    if (data or {}).get("mode") == "dag":
        opt = _dag_optimal(data.get("nodes") or [])
        dagcfg = cfg.get("dag") if isinstance(cfg.get("dag"), dict) else {}
        body["mode"] = "dag"
        body["dag"] = {
            "levels": dagcfg.get("levels"),
            "max_nodes": dagcfg.get("max_nodes"),
            "title": data.get("title", ""),
            "scenario": data.get("scenario", ""),
            "nodes": data.get("nodes") or [],
            "optimal": {"path": opt["path"], "max_score": opt["max_score"]},
        }
    else:
        rows = []
        for n, it in enumerate(data["items"], 1):
            row = {"n": n, "type": it["type"], "prompt": it["prompt"]}
            if it["type"] == "mc":
                row.update(choices=it["choices"], ans=it["ans"])
            elif it["type"] == "tf":
                row.update(ans=it["ans"])
            elif it["type"] == "id":
                row.update(aliases=it["aliases"])
            else:
                row.update(key_points=it["key_points"], rubric=it["rubric"],
                           max_points=it["max_points"])
            rows.append(row)
        body["items"] = rows
    kf.write_text(json.dumps(body, ensure_ascii=False, indent=1), encoding="utf-8")
    return kf
```

(Keep the `kf = Path(...)`/`mkdir` preamble exactly as-is.)

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_assignment_dag.py tests/test_assignment_contract.py -q`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add v2/build.py tests/test_assignment_dag.py
git commit -m "feat(build): sanitize dag student data (strip points) + dag key file"
```

---

### Task 5: Component dual-mode + CSS + smoke

**Files:**
- Modify: `v2/skeleton/components/assignment/component.js`
- Modify: `v2/skeleton/components/assignment/component.css`
- Modify: `v2/tools/assignment_smoke.js`
- Test: smoke is the test

**Interfaces:**
- Consumes: sanitized student dag data shape (Task 4).
- Produces: decrypted submission body `{…, mode:"dag", path:[{node,label}], final_outcome}` consumed by Task 7's checker.

- [ ] **Step 1: Extend smoke with a dag walk (failing first)**

In `v2/tools/assignment_smoke.js`, replace the ending — the current last three lines are `if (failures) {…}` / `console.log("SMOKE OK — mc/tf/id/sa…")` — with the flat gate + dag walk below:

```javascript
if (failures) {
  console.log("SMOKE FAIL — " + failures + " flat check(s) failed.");
  process.exit(1);
}
console.log("ok   flat deck — mc/tf/id/sa all advance");

/* ---------- DAG mode walk ---------- */
const dagData = {
  intro: "smoke", mode: "dag", title: "T", scenario: "S",
  nodes: [
    { id: "n0", level: 0, isLeaf: false, question: "Q " + "word ".repeat(16),
      outcome: null,
      choices: [
        { label: "A", text: "take the upper road now", nextNodeId: "n1" },
        { label: "B", text: "take the lower road now", nextNodeId: "n2" }
      ] },
    { id: "n1", level: 1, isLeaf: false, question: "Q " + "word ".repeat(16),
      outcome: "You went upper.",
      choices: [
        { label: "A", text: "meet at the junction", nextNodeId: "n3" },
        { label: "B", text: "miss the junction way", nextNodeId: "n3" }
      ] },
    { id: "n2", level: 1, isLeaf: false, question: "Q " + "word ".repeat(16),
      outcome: "You went lower.",
      choices: [
        { label: "A", text: "meet at the junction", nextNodeId: "n3" },
        { label: "B", text: "miss the junction way", nextNodeId: "n3" }
      ] },
    { id: "n3", level: 2, isLeaf: true, question: "End of the line",
      outcome: "Paths met.", choices: [], finalOutcome: "Scenario closed." }
  ]
};
const root2 = new El("div");
sandboxLN.components["assignment"].init(root2, dagData);

const btns2 = walk(root2, function (e) { return e.tag === "button"; });
const begin2 = btns2.filter(function (b) {
  return (b.className || "").indexOf("lna-begin") >= 0;
})[0];
const next2 = btns2.filter(function (b) {
  return (b.className || "").indexOf("lna-next") >= 0 &&
    (b.textContent || "").indexOf("Next") === 0;
})[0];
const back2 = btns2.filter(function (b) {
  return (b.className || "").indexOf("lna-back") >= 0;
})[0];
const submit2 = btns2.filter(function (b) {
  return (b.textContent || "") === "Submit";
})[0];
check("dag: Begin + Next present", !!begin2 && !!next2);
check("dag: no Back button anywhere", !back2, "back found");
begin2.click();

const name2 = walk(root2, function (e) {
  return e.tag === "input" && (e.className || "").indexOf("lna-name") >= 0;
});
const id2 = walk(root2, function (e) {
  return e.tag === "input" && (e.className || "").indexOf("lna-id") >= 0;
});
const start2 = btns2.filter(function (b) {
  return (b.className || "").indexOf("lna-start") >= 0;
})[0];
name2[0].value = "Dela Cruz, Juan";
name2[0].fire("input");
id2[0].value = "20240012";
id2[0].fire("input");
start2.click();
check("dag: Next locked before pick", next2.disabled === true);

let radios2 = walk(root2, function (e) {
  return e.tag === "input" && e.attrs.type === "radio" &&
    e.attrs.name === "a_n0";
});
check("dag: root shows 2 choices", radios2.length === 2, "n=" + radios2.length);
radios2[0].click();
check("dag: pick enables Next", next2.disabled === false);
next2.click();

/* at n1: layer meter + still no back; filter by node radio name (hidden
 * slides keep their radios in the DOM — same trick the flat walk uses) */
const prog2 = walk(root2, function (e) {
  return e.tag === "span" && (e.className || "").indexOf("lna-prog") >= 0;
})[0];
check("dag: layer meter advances", (prog2.textContent || "").indexOf("Layer 2") === 0,
  prog2.textContent);
radios2 = walk(root2, function (e) {
  return e.tag === "input" && e.attrs.type === "radio" &&
    e.attrs.name === "a_n1";
});
check("dag: mid node shows 2 choices", radios2.length === 2, "n=" + radios2.length);
radios2[0].click();
next2.click();

/* leaf: component toggles submit/next .hidden in showDag */
check("dag: leaf unhides Submit", !!submit2 && submit2.hidden === false);
check("dag: leaf hides Next", !!next2 && next2.hidden === true);
check("dag: walk reached leaf without Back", !back2);

if (failures) {
  console.log("SMOKE FAIL — " + failures + " check(s) failed.");
  process.exit(1);
}
console.log("SMOKE OK — flat deck + dag walk both let the student advance.");
```

- [ ] **Step 2: Run smoke to verify dag checks fail (component not yet dual-mode)**

Run from `v2/`: `node tools/assignment_smoke.js`
Expected: FAIL — flat section may pass, dag checks fail (no `mode` branch → treats data as flat with empty items / crash). Exit 1.

- [ ] **Step 3: Implement dual-mode in `component.js`**

3a. At the top of `init`, replace:

```javascript
      var items = d.items || [];
      var week = metaOf("ln:week"), subj = metaOf("ln:subject");
      var state = { ix: 0, answers: [], identified: false, submitted: false };
      items.forEach(function () { state.answers.push(null); });
```

with:

```javascript
      var isDag = d.mode === "dag" && Array.isArray(d.nodes) && d.nodes.length > 0;
      if (d.mode === "dag" && !isDag) {
        var badBox = LN.h("div", { class: "lna" });
        var badCard = LN.h("div", { class: "lna-entry" });
        badCard.appendChild(LN.h("p", { text: "ASSIGNMENT UNAVAILABLE" }));
        badCard.appendChild(LN.h("p", {
          text: "This assignment failed to load. Contact your teacher — do not delete the file." }));
        badBox.appendChild(badCard);
        root.appendChild(badBox);
        return;
      }
      var items = isDag ? [] : (d.items || []);
      var nodes = isDag ? d.nodes : [];
      var nodeById = {};
      var maxLevel = 0;
      if (isDag) {
        nodes.forEach(function (n) {
          nodeById[n.id] = n;
          if (typeof n.level === "number" && n.level > maxLevel) maxLevel = n.level;
        });
      }
      var week = metaOf("ln:week"), subj = metaOf("ln:subject");
      var state = isDag
        ? { identified: false, submitted: false,
            cur: (nodes.filter(function (n) { return n.level === 0; })[0] || nodes[0] || {}).id,
            path: [], picked: null, broken: false }
        : { ix: 0, answers: [], identified: false, submitted: false };
      if (!isDag) items.forEach(function () { state.answers.push(null); });
```

3b. Dots creation — replace:

```javascript
      items.forEach(function () { dots.appendChild(LN.h("span", { class: "lna-dot" })); });
```

with:

```javascript
      if (isDag) {
        for (var di = 0; di <= maxLevel; di++)
          dots.appendChild(LN.h("span", { class: "lna-dot" }));
      } else {
        items.forEach(function () { dots.appendChild(LN.h("span", { class: "lna-dot" })); });
      }
```

3c. Slides build — replace the whole `var slides = []; items.forEach(function (it, i) { … });` block with:

```javascript
      var slides = [];
      if (isDag) {
        nodes.forEach(function (n) {
          var s = LN.h("div", { class: "lna-slide" });
          s.hidden = true;
          if (n.outcome)
            s.appendChild(LN.h("p", { class: "lna-dag-outcome",
              text: "What happened: " + n.outcome }));
          s.appendChild(LN.h("div", { class: "lna-q", text: n.question }));
          if (n.isLeaf) {
            s.appendChild(LN.h("p", { class: "lna-dag-final",
              text: n.finalOutcome || "" }));
          } else {
            (n.choices || []).forEach(function (c, ci) {
              var r = LN.h("input", { type: "radio", name: "a_" + n.id });
              r.addEventListener("click", function () {
                state.picked = ci; bump();
              });
              s.appendChild(LN.h("label", { class: "lna-opt" }, [
                r, LN.h("span", { text: c.label + ". " + c.text })]));
            });
          }
          slides.push(s);
          quiz.appendChild(s);
        });
      } else {
        items.forEach(function (it, i) {
          var s = LN.h("div", { class: "lna-slide" });
          s.hidden = true;
          s.appendChild(LN.h("div", { class: "lna-q",
            text: "Q" + (i + 1) + " — " + it.prompt }));
          if (it.type === "mc") {
            (it.choices || []).forEach(function (c) {
              var r = LN.h("input", { type: "radio", name: "a" + i });
              r.addEventListener("click", function () {
                state.answers[i] = c; bump();
              });
              s.appendChild(LN.h("label", { class: "lna-opt" }, [
                r, LN.h("span", { text: c })]));
            });
          } else if (it.type === "tf") {
            ["true", "false"].forEach(function (v) {
              var r = LN.h("input", { type: "radio", name: "a" + i });
              r.addEventListener("click", function () {
                state.answers[i] = (v === "true"); bump();
              });
              s.appendChild(LN.h("label", { class: "lna-opt" }, [
                r, LN.h("span", { text: v.toUpperCase() })]));
            });
          } else if (it.type === "id") {
            var t = LN.h("input", { class: "lna-txt", placeholder: "Your answer" });
            t.addEventListener("input", function () {
              state.answers[i] = t.value.trim();
              bump();
            });
            s.appendChild(t);
          } else {
            var ar = LN.h("textarea", { class: "lna-area",
              placeholder: "Name the fact or reason from the lesson." });
            ar.addEventListener("input", function () {
              state.answers[i] = ar.value.trim();
              bump();
            });
            s.appendChild(ar);
          }
          slides.push(s);
          quiz.appendChild(s);
        });
      }
```

3d. Nav rows — replace:

```javascript
      var navA = LN.h("div", { class: "lna-nav" }, [
        LN.h("div", { class: "lna-nf" }, [back, next])]);
      var navB = LN.h("div", { class: "lna-nav" }, [
        LN.h("div", { class: "lna-nf" }, [back, submit]),
        LN.h("span", { class: "lna-note",
          text: "Submission needs every question answered." })]);
```

with:

```javascript
      var navA = LN.h("div", { class: "lna-nav" }, [
        LN.h("div", { class: "lna-nf" }, isDag ? [next] : [back, next])]);
      var navB = LN.h("div", { class: "lna-nav" }, isDag
        ? [LN.h("div", { class: "lna-nf" }, [submit]),
           LN.h("span", { class: "lna-note",
             text: "Submission sends your path — answers are never revealed." })]
        : [LN.h("div", { class: "lna-nf" }, [back, submit]),
           LN.h("span", { class: "lna-note",
             text: "Submission needs every question answered." })]);
```

3e. `show()` — replace the opening of `function show(ix) {` body so dag short-circuits (keep flat body untouched below). Replace:

```javascript
      function show(ix) {
        if (!state.identified) { showIdent(); return; }
        ident.hidden = true;
        quiz.hidden = false;
        state.ix = Math.max(0, Math.min(items.length - 1, ix));
```

with:

```javascript
      function showDag() {
        var n = nodeById[state.cur];
        if (!n) {
          state.broken = true;
          errB.className = "lna-err show";
          errB.textContent = "This path is broken — contact your teacher.";
          next.disabled = true;
          return;
        }
        var si = 0, i;
        for (i = 0; i < nodes.length; i++)
          if (nodes[i].id === state.cur) { si = i; break; }
        for (i = 0; i < slides.length; i++) slides[i].hidden = (i !== si);
        prog.textContent = "Layer " + (n.level + 1) + " of " + (maxLevel + 1);
        var ds = dots.childNodes;
        for (i = 0; i < ds.length; i++)
          ds[i].className = "lna-dot" +
            (i < n.level ? " done" : "") +
            (i === n.level ? " on" : "");
        var atLeaf = !!n.isLeaf;
        navA.hidden = atLeaf;
        navB.hidden = !atLeaf;
        next.hidden = atLeaf;
        submit.hidden = !atLeaf;
        next.disabled = state.picked === null;
        if (state.broken) {
          errB.className = "lna-err show";
          errB.textContent = "This path is broken — contact your teacher.";
          next.disabled = true;
        } else {
          errB.className = "lna-err";
        }
      }
      function show(ix) {
        if (!state.identified) { showIdent(); return; }
        ident.hidden = true;
        quiz.hidden = false;
        if (isDag) { showDag(); return; }
        state.ix = Math.max(0, Math.min(items.length - 1, ix));
```

3f. Resume labels — replace both occurrences of:

```javascript
        begin.textContent = "Resume assignment (Q" + (state.ix + 1) + ")";
```

with:

```javascript
        begin.textContent = isDag ? "Resume assignment"
          : "Resume assignment (Q" + (state.ix + 1) + ")";
```

(There are exactly two — one in `begin` click, one in `start` click. Use `replaceAll` or edit both.)

3g. `back` click — guard:

```javascript
      back.addEventListener("click", function () {
        if (isDag) return;
        show(state.ix - 1);
      });
```

3h. `next` click — replace the body:

```javascript
      next.addEventListener("click", function () {
        if (isDag) {
          var n = nodeById[state.cur];
          if (!n || n.isLeaf) return;
          if (state.picked === null || state.broken) {
            errB.className = "lna-err show";
            errB.textContent = "Choose a path first — Next stays off until you pick.";
            return;
          }
          var ch = n.choices[state.picked];
          state.path.push({ node: n.id, label: ch.label });
          var nxt = ch.nextNodeId;
          if (!nxt || !nodeById[nxt]) {
            state.broken = true;
            showDag();
            return;
          }
          state.cur = nxt;
          state.picked = null;
          showDag();
          return;
        }
        if (!answered(items[state.ix], state.answers[state.ix])) {
          errB.className = "lna-err show";
          errB.textContent = "Answer Q" + (state.ix + 1) +
            " first — Next stays off until you do.";
          return;
        }
        show(state.ix + 1);
      });
```

3i. `submit` click — at the very start of the handler body insert a dag branch:

```javascript
      submit.addEventListener("click", function () {
        if (isDag) {
          var leaf = nodeById[state.cur];
          var dname = nam.value.trim(), did = idIn.value.trim();
          var dbad = [];
          if (!/^[^,]+,\s*\S/.test(dname))
            dbad.push("your name as Lastname, Firstname");
          if (!/^\d{8}$/.test(did)) dbad.push("an 8-digit student ID");
          if (!leaf || !leaf.isLeaf) dbad.push("a completed path to the end");
          if (dbad.length) {
            errB.className = "lna-err show";
            errB.textContent = "Still needed: " + dbad.join("; ") + ".";
            return;
          }
          api._export({
            title: document.title, subject: subj, week: Number(week),
            student: { name: dname, id: did },
            submitted_at: new Date().toISOString(),
            mode: "dag",
            path: state.path.slice(),
            final_outcome: leaf.finalOutcome || ""
          }, { errB: errB, cover: cover, submit: submit,
            onDone: function () {
              state.submitted = true;
              navC.hidden = false;
            } });
          return;
        }
        var i, missing = [];
        /* … existing flat body unchanged from here … */
```

(Keep the entire existing flat submit body after this insert.)

3j. Ensure `bump` still works for dag: `function bump() { show(state.ix); }` — with `state.ix` undefined on dag, `show(undefined)` hits `isDag` branch before using `ix`. **Leave as-is.**

- [ ] **Step 4: CSS — append to `component.css`**

```css
.lna-dag-outcome{background:var(--surface-2);border:1px solid var(--grid-strong);
  border-left:3px solid var(--accent);border-radius:8px;padding:10px 12px;
  margin:0 0 8px;font-size:14px;color:var(--ink-soft)}
.lna-dag-final{background:var(--note-yellow);border:1px solid var(--grid-strong);
  border-radius:8px;padding:12px 14px;margin:12px 0 0;font-size:15px;color:var(--ink)}
```

- [ ] **Step 5: Run smoke — must pass**

Run from `v2/`: `node tools/assignment_smoke.js`
Expected: `SMOKE OK — flat deck + dag walk both let the student advance.` exit 0

- [ ] **Step 6: Component syntax gate (build's check_js)**

Run from repo root: `python -m pytest tests/test_build.py tests/test_assignment_contract.py tests/test_assignment_dag.py -q`
Expected: pass (flat e2e paths that embed component.js stay green)

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/components/assignment/component.js v2/skeleton/components/assignment/component.css v2/tools/assignment_smoke.js
git commit -m "feat(assignment): dual-mode deck — forward-only DAG walk + layer meter"
```

---

### Task 6: Authoring docs — `dag-craft.md`, SKILL.md, registry, README

**Files:**
- Create: `v2/skeleton/dag-craft.md`
- Modify: `v2/SKILL.md`
- Modify: `v2/skeleton/components/registry.md`
- Modify: `v2/skeleton/components/assignment/README.md`

**Interfaces:**
- Consumes: validated data shape + config keys (Tasks 2–4) for the exact wording of rules.
- Produces: authoring law referenced by name in the skill's dag branch; registry documents the dual schema for section agents.

- [ ] **Step 1: Write `v2/skeleton/dag-craft.md` with exactly this content**

```markdown
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
```

- [ ] **Step 2: Verify the file**

Run: `python -c "t=open('v2/skeleton/dag-craft.md',encoding='utf-8').read(); assert 'mode' in t and 'GRADUATED POINTS' in t and 'Reviewer checklist' in t and len(t)>1500; print('OK')"`
Expected: `OK`

- [ ] **Step 3: SKILL.md edits**

3a. After the v2.6 blurb (line ~70-76), insert:

```markdown
What v2.7 adds: **DAG assignment mode** — `build.json` may set
`"assignment": "dag"` (+ `"dag": {"levels": 2..5, "max_nodes": …}`) so Section 7
ships one multi-layer branching scenario instead of the flat 20-item deck.
Authoring is per-level fan-out (author agent → reviewer agent, level 0..L-1,
serial) under `skeleton/dag-craft.md`; `build.py` validates the graph, strips
`points` from student HTML, and writes `dag.optimal` into the teacher key.
Same mount, same identity gate, same encryption; the deck walks forward-only.
```

3b. Section 7 table row (line ~230) — replace with:

```markdown
| 7 | **Assignment** | Flat: 20 situational items per `skeleton/question-craft.md` (mc easy·tf hard·id medium·sa analysis). Dag (`"assignment":"dag"`): one branching scenario per `skeleton/dag-craft.md`, level-fanout authoring. Hidden until begun; no reveal | `assignment` |
```

3c. Assessment inputs row (line ~90) — append after the existing sentence: ` With build.json "assignment":"dag", Section 7 is a pure DAG scenario instead (dag-craft.md).`

3d. In the section-agent brief, after the existing assignment bullet (lines ~397-403), insert:

```markdown
- If `build.json` has `"assignment": "dag"`: do **not** author flat items. Read
  `<skill-dir>/skeleton/dag-craft.md` — it is your authoring law. Write
  `"mode": "dag"`, `title`, `scenario`, and `nodes[]` into `LN.data.<key>`
  (points included; build strips them). The orchestrator fans out one author
  agent per level with one independent reviewer per level before assembly —
  never write the whole graph in one pass.
```

3e. New orchestration subsection — insert right after **D. Assemble + loop** paragraph (after line ~413) and before **E. Judgment QA**:

```markdown
**D2. DAG assignment fan-out (only when `assignment: "dag"`).** Before D, build the
graph level by level:

1. Ask the user for `levels` (2–5) and `max_nodes` (levels+1..16) if not already
   in `build.json`; write both keys.
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
```

3f. Part 5 **Assignment integrity** bullet (lines ~446-461) — after the existing flat checks, append:

```markdown
   If the build is dag mode: confirm student HTML contains **no** `"points"`
   string inside the assignment object, `build/key/*-key.json` has
   `mode:"dag"` + `optimal.max_score`, every node passes dag-craft's reviewer
   checklist (spot-check one node per level), and
   `node tools/assignment_smoke.js` still prints SMOKE OK (it walks both decks).
```

- [ ] **Step 4: registry.md assignment row — replace with**

```markdown
| Collect answers for the teacher (no reveal), encrypted submit | `assignment` | **Flat (default):** `{intro?, items:[18 fixed + 2+ sa: 10×{type:'mc',prompt,choices[4]}, 4×{type:'tf',prompt}, 4×{type:'id',prompt}, 2×{type:'sa',prompt}]}` — answers never in student data; SA also carry `rubric` + `max_points`. **Dag** (`build.json` `"assignment":"dag"`): `{intro?, mode:'dag', title, scenario, nodes:[{id,level,isLeaf,question,outcome,choices[{label,text,nextNodeId}],finalOutcome?}]}` — `points` stay author-side (build strips them); see `skeleton/dag-craft.md`. | `<div data-component="assignment" data-key="assign7"></div>` |
```

- [ ] **Step 5: assignment README — append**

```markdown

## Dag mode

When `build.json` sets `"assignment": "dag"`, the same mount renders a
forward-only graph walk instead of flat slides: identity gate and guards are
identical; there is no Back; the layer meter shows `Layer k of L`; Submit is
only enabled at a leaf and exports `{mode:"dag", path:[{node,label}],
final_outcome}`. Student data carries `nextNodeId` but never `points`.
Validate with `node tools/assignment_smoke.js` (walks flat **and** dag).
Authoring law: `../../dag-craft.md`.
```

- [ ] **Step 6: Sanity-read SKILL.md**

Run: `python -c "t=open('v2/SKILL.md',encoding='utf-8').read(); assert 'v2.7' in t and 'DAG assignment fan-out' in t and 'dag-craft.md' in t; print('OK')"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/dag-craft.md v2/SKILL.md v2/skeleton/components/registry.md v2/skeleton/components/assignment/README.md
git commit -m "docs(skill): dag-craft authoring law + v2.7 dag mode wiring"
```

---

### Task 7: Checker — `scoreDag`, app wiring, export columns

**Files:**
- Modify: `checker/app/lib/score.js`
- Modify: `checker/app/app.js` (**uncommitted stepper WIP lives here — edit on top, never revert**)
- Modify: `checker/app/lib/export-book.js`
- Test: `checker/app/test/score.test.js`, `checker/app/test/export-book.test.js`

**Interfaces:**
- Consumes: key `dag` block + decrypted `{mode:"dag", path, final_outcome}` (Task 4 / component Task 5).
- Produces: `scoreDag(dagKey, path)` return shape `{score, maxScore, pct, pathMatch, divergeAt, mismatch, steps, ribbon}` — `mismatch` is a non-empty string on corrupt path/key, else `""`.

- [ ] **Step 1: Write failing score tests**

Append to `checker/app/test/score.test.js`:

```javascript
import { scoreDag } from "../lib/score.js";

const dagKey = {
  levels: 3, max_nodes: 8,
  nodes: [
    { id: "n0", level: 0, isLeaf: false, question: "Q0", outcome: null,
      choices: [
        { label: "A", text: "gold", points: 10, nextNodeId: "n1" },
        { label: "B", text: "miss", points: 4, nextNodeId: "n2" },
      ] },
    { id: "n1", level: 1, isLeaf: false, question: "Q1", outcome: "o",
      choices: [
        { label: "A", text: "gold2", points: 8, nextNodeId: "n3" },
        { label: "B", text: "miss2", points: 3, nextNodeId: "n3" },
      ] },
    { id: "n2", level: 1, isLeaf: false, question: "Q2", outcome: "o",
      choices: [
        { label: "A", text: "ok", points: 5, nextNodeId: "n3" },
        { label: "B", text: "no", points: 1, nextNodeId: "n3" },
      ] },
    { id: "n3", level: 2, isLeaf: true, question: "End", outcome: "o",
      choices: [], finalOutcome: "Done." },
  ],
  optimal: {
    path: [
      { node: "n0", label: "A", points: 10 },
      { node: "n1", label: "A", points: 8 },
    ],
    max_score: 18,
  },
};

test("scoreDag sums path points and matches gold", () => {
  const r = scoreDag(dagKey, [
    { node: "n0", label: "A" },
    { node: "n1", label: "A" },
  ]);
  assert.equal(r.mismatch, "");
  assert.equal(r.score, 18);
  assert.equal(r.maxScore, 18);
  assert.equal(r.pct, 1);
  assert.equal(r.pathMatch, true);
  assert.equal(r.divergeAt, -1);
  assert.equal(r.ribbon, "A→A");
  assert.equal(r.steps.length, 2);
  assert.equal(r.steps[0].points, 10);
});

test("scoreDag partial path scores lower and reports divergence", () => {
  const r = scoreDag(dagKey, [
    { node: "n0", label: "A" },
    { node: "n1", label: "B" },
  ]);
  assert.equal(r.score, 13);
  assert.equal(r.pathMatch, false);
  assert.equal(r.divergeAt, 1);
});

test("scoreDag flags unknown node/label as mismatch, not silent zero", () => {
  const r = scoreDag(dagKey, [{ node: "n0", label: "Z" }]);
  assert.notEqual(r.mismatch, "");
  const r2 = scoreDag(dagKey, [{ node: "nX", label: "A" }]);
  assert.notEqual(r2.mismatch, "");
});
```

- [ ] **Step 2: Run to verify fail**

Run from `checker/app`: `node --test test/score.test.js`
Expected: FAIL `SyntaxError` / `scoreDag is not exported`

- [ ] **Step 3: Implement `scoreDag`**

Append to `checker/app/lib/score.js`:

```javascript
export function scoreDag(dagKey, path) {
  const nodes = (dagKey && dagKey.nodes) || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const maxScore = (dagKey && dagKey.optimal && dagKey.optimal.max_score) || 0;
  const gold = ((dagKey && dagKey.optimal && dagKey.optimal.path) || [])
    .map((p) => p.label);
  const steps = [];
  let score = 0;
  let mismatch = "";
  const labels = [];
  for (const step of path || []) {
    const node = byId.get(step.node);
    if (!node) { mismatch = `unknown node ${step.node}`; break; }
    const ch = (node.choices || []).find((c) => c.label === step.label);
    if (!ch) { mismatch = `unknown choice ${step.node}/${step.label}`; break; }
    const pts = typeof ch.points === "number" ? ch.points : 0;
    score += pts;
    labels.push(step.label);
    steps.push({ node: step.node, label: step.label, points: pts, text: ch.text || "" });
  }
  let pathMatch = false;
  let divergeAt = -1;
  if (!mismatch) {
    pathMatch = labels.length === gold.length
      && labels.every((l, i) => l === gold[i]);
    if (!pathMatch) {
      divergeAt = labels.findIndex((l, i) => l !== gold[i]);
      if (divergeAt < 0) divergeAt = Math.min(labels.length, gold.length);
    }
  }
  return {
    score: mismatch ? 0 : score,
    maxScore,
    pct: mismatch || maxScore <= 0 ? 0 : score / maxScore,
    pathMatch,
    divergeAt,
    mismatch,
    steps,
    ribbon: labels.join("→"),
  };
}
```

- [ ] **Step 4: Run score tests**

Run from `checker/app`: `node --test test/score.test.js`
Expected: all pass (old 2 + new 3)

- [ ] **Step 5: Export tests — write failing**

Append to `checker/app/test/export-book.test.js`:

```javascript
test("dag assignment exports DAG Score/Max/% columns and skips SA", () => {
  const wb = buildWorkbookData({
    roster: [],
    assignments: [{
      tag: "W9", mode: "dag", saNs: [],
      results: new Map([["1", {
        name: "N1", id: "1",
        dagScore: 17, dagMax: 18, dagPct: 17 / 18, total: 17,
      }]]),
      unmatched: [], missing: [], reviews: [],
    }],
  });
  const grades = wb.sheets.find((s) => s.name === "Grades");
  assert.deepEqual(grades.rows[0],
    ["Name", "ID", "W9 DAG Score", "W9 DAG Max", "W9 DAG %", "W9 Total",
     "GrandTotal", "Status"]);
  assert.equal(grades.rows[1][2], 17);
  assert.equal(grades.rows[1][4], 17 / 18);
  assert.equal(grades.rows[1][5], 17);
  assert.equal(grades.rows[1][6], 17);
});

test("mixed flat + dag assignments side by side", () => {
  const wb = buildWorkbookData({
    roster: [],
    assignments: [
      { tag: "A", mode: "flat", saNs: [],
        results: new Map([["1", {
          name: "N1", id: "1", mc: 5, tf: 2, idScore: 1,
          saScores: new Map(), total: 8,
        }]]),
        unmatched: [], missing: [], reviews: [] },
      { tag: "B", mode: "dag", saNs: [],
        results: new Map([["1", {
          name: "N1", id: "1", dagScore: 10, dagMax: 18, dagPct: 10 / 18,
          total: 10,
        }]]),
        unmatched: [], missing: [], reviews: [] },
    ],
  });
  const head = wb.sheets.find((s) => s.name === "Grades").rows[0];
  assert.deepEqual(head, [
    "Name", "ID", "A MC", "A TF", "A ID", "A Total",
    "B DAG Score", "B DAG Max", "B DAG %", "B Total",
    "GrandTotal", "Status",
  ]);
});

test("path divergence lands in ReviewLog", () => {
  const wb = buildWorkbookData({
    roster: [],
    assignments: [{
      tag: "W9", mode: "dag", saNs: [],
      results: new Map(),
      unmatched: [], missing: [],
      reviews: [{ saN: "path", ref: "N1", ai: "", reason: "diverged at step 1", final: "" }],
    }],
  });
  const rl = wb.sheets.find((s) => s.name === "ReviewLog");
  assert.equal(rl.rows[1][1], "path");
  assert.match(rl.rows[1][3], /diverged/);
});
```

- [ ] **Step 6: Run export tests to verify fail**

Run from `checker/app`: `node --test test/export-book.test.js`
Expected: new tests FAIL (headers still MC/TF/ID)

- [ ] **Step 7: Implement export-book dag columns**

In `checker/app/lib/export-book.js`:

7a. `perAssign` push gains mode:

```javascript
    perAssign.push({ tag: a.tag, saNs: a.saNs, mode: a.mode || "flat" });
```

7b. Header loop — replace:

```javascript
  for (const p of perAssign) {
    head.push(`${p.tag} MC`, `${p.tag} TF`, `${p.tag} ID`);
    for (const n of p.saNs) head.push(`${p.tag} SA${n}`);
    head.push(`${p.tag} Total`);
  }
```

with:

```javascript
  for (const p of perAssign) {
    if (p.mode === "dag") {
      head.push(`${p.tag} DAG Score`, `${p.tag} DAG Max`, `${p.tag} DAG %`);
    } else {
      head.push(`${p.tag} MC`, `${p.tag} TF`, `${p.tag} ID`);
      for (const n of p.saNs) head.push(`${p.tag} SA${n}`);
    }
    head.push(`${p.tag} Total`);
  }
```

7c. Matched-row cell loop — replace the `if (!r) { cells.push("", "", ""); for (const n of a.saNs) cells.push(""); cells.push(""); continue; }` and the success branch with:

```javascript
      const isDagA = (a.mode || "flat") === "dag";
      if (!r) {
        if (isDagA) cells.push("", "", "");
        else {
          cells.push("", "", "");
          for (const n of a.saNs) cells.push("");
        }
        cells.push("");
        continue;
      }
      if (isDagA) {
        cells.push(r.dagScore ?? "", r.dagMax ?? "", r.dagPct ?? "");
      } else {
        cells.push(r.mc, r.tf, r.idScore);
        for (const n of a.saNs) cells.push(r.saScores.get(n) ?? "");
      }
      cells.push(r.total);
      grand += Number(r.total) || 0;
```

7d. Unmatched-row cell loop — same branch pattern (`b.mode === "dag"` → three dag cells; else mc/tf/id + sa block), keeping `grand += r.total`.

- [ ] **Step 8: Run export tests**

Run from `checker/app`: `node --test test/export-book.test.js`
Expected: all pass

- [ ] **Step 9: Wire `app.js` (on top of stepper WIP)**

9a. Import: `import { scoreNonAI, scoreDag } from "./lib/score.js";`

9b. In `runAssignment`, after `const keyItems = keyJson.items || [];` add:

```javascript
  const isDag = keyJson.mode === "dag";
  const dagKey = isDag ? keyJson.dag : null;
```

9c. Replace `const saNs = keyItems.filter(...)...` with:

```javascript
  const saNs = isDag ? [] : keyItems.filter((k) => k.type === "sa").map((k) => k.n);
```

9d. `assignment` object gains `mode: isDag ? "dag" : "flat"` and `dagKey`.

9e. Matched scoring loop — branch:

```javascript
  for (const { roster, sub } of matched) {
    const key = studentKey(roster);
    if (isDag) {
      const r = scoreDag(dagKey, sub.path);
      assignment.scored.set(key, {
        name: roster.name, id: roster.id, dag: r,
      });
      continue;
    }
    const r = scoreNonAI(keyItems, sub.answers);
    const sa = new Map();
    for (const item of r.saItems) sa.set(item.n, { ai: null, reason: "", final: null });
    assignment.scored.set(key, {
      name: roster.name, id: roster.id, mc: r.mc, tf: r.tf, idScore: r.id,
      totalNonAI: r.totalNonAI, sa,
    });
  }
```

9f. Unmatched loop — same branch (`sub.path` vs `sub.answers`), storing `dag: r` (and `answers: sub.answers` only for flat).

9g. `renderResults` — at the top of the per-assignment loop:

```javascript
    if (a.mode === "dag") {
      html += `<h3>${escapeHtml(a.tag)}</h3><table><tr><th>Name</th><th>Path</th><th>Score</th><th>Max</th><th>%</th><th>Match</th></tr>`;
      for (const [, s] of a.scored) {
        const d = s.dag;
        if (d.mismatch) {
          html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(d.ribbon || "")}</td>` +
            `<td colspan="4">path/key mismatch: ${escapeHtml(d.mismatch)}</td><td>ERR</td></tr>`;
        } else {
          html += `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(d.ribbon)}</td>` +
            `<td>${d.score}</td><td>${d.maxScore}</td>` +
            `<td>${Math.round(d.pct * 100)}%</td>` +
            `<td>${d.pathMatch ? "gold" : `off@${d.divergeAt}`}</td></tr>`;
        }
      }
      html += "</table>";
      if (a.unmatchedScored && a.unmatchedScored.size) {
        html += `<h3>${escapeHtml(a.tag)} · Unmatched</h3><table><tr><th>File</th><th>Path</th><th>Score</th><th>Max</th><th>%</th><th>Match</th></tr>`;
        for (const [, s] of a.unmatchedScored) {
          const d = s.dag;
          html += `<tr><td>${escapeHtml(s.file)}</td><td>${escapeHtml(d.ribbon)}</td>` +
            (d.mismatch ? `<td colspan="4">ERR ${escapeHtml(d.mismatch)}</td><td>ERR</td>`
              : `<td>${d.score}</td><td>${d.maxScore}</td><td>${Math.round(d.pct * 100)}%</td><td>${d.pathMatch ? "gold" : `off@${d.divergeAt}`}</td>`) +
            `</tr>`;
        }
        html += "</table>";
      }
      if (a.missing.length) html += `<p class='note'>Missing: ${a.missing.map((m) => escapeHtml(m.name)).join(", ")}</p>`;
      continue; // skip flat table markup below
    }
    /* existing flat html += ... unchanged */
```

9h. `maybeUnlockSA` — after `if (!allScored()) return;`:

```javascript
  const anySA = state.assignments.some((a) => a.saNs.length > 0);
  if (!anySA) {
    $("saQueue").textContent = "No SA items in these assignments — continue to Export.";
    $("lockSA").disabled = false;
    return;
  }
```

9i. `initExport` mapping — branch before the flat per-student loop:

```javascript
      const assignments = state.assignments.map((a) => {
        const results = new Map();
        const unmatchedResults = new Map();
        if (a.mode === "dag") {
          for (const [key, s] of a.scored) {
            const d = s.dag;
            results.set(key, {
              name: s.name, id: s.id,
              dagScore: d.mismatch ? "" : d.score,
              dagMax: d.maxScore,
              dagPct: d.mismatch ? "" : d.pct,
              total: d.mismatch ? "" : d.score,
            });
          }
          if (a.unmatchedScored) {
            for (const [key, s] of a.unmatchedScored) {
              const d = s.dag;
              unmatchedResults.set(key, {
                name: `${s.file} (${s.claimed})`, id: s.id || "",
                dagScore: d.mismatch ? "" : d.score,
                dagMax: d.maxScore,
                dagPct: d.mismatch ? "" : d.pct,
                total: d.mismatch ? "" : d.score,
              });
            }
          }
          const reviews = [...(a.reviews || [])];
          for (const [key, s] of a.scored) {
            if (s.dag && !s.dag.mismatch && !s.dag.pathMatch) {
              reviews.push({ saN: "path", ref: key, ai: "",
                reason: `diverged at step ${s.dag.divergeAt}`, final: "" });
            }
          }
          return { tag: a.tag, mode: "dag", saNs: [], results, unmatchedResults,
            unmatched: a.unmatched, missing: a.missing, reviews };
        }
        /* existing flat mapping body unchanged, but return gains mode: a.mode || "flat" */
```

Ensure the flat return includes `mode: a.mode || "flat"` and still builds `saScores`/`total` as today. Remove the duplicate `const results`/`unmatchedResults` declarations if the flat path now shares them (restructure so flat path assigns into the same consts).

- [ ] **Step 10: Full checker suite**

Run from `checker/app`: `node --test test/*.test.js`
Expected: **all pass** (24 baseline + 3 score + 3 export = 30+)

- [ ] **Step 11: Commit** (coordinate with the stepper WIP)

```bash
git add checker/app/lib/score.js checker/app/lib/export-book.js checker/app/app.js checker/app/test/score.test.js checker/app/test/export-book.test.js
git commit -m "feat(checker): auto-score DAG path points + DAG export columns

Includes the pre-existing uncommitted stepper navigation WIP in app.js."
```

(If the user prefers to land the stepper WIP as its own commit first, do that before this step.)

---

### Task 8: End-to-end dag fixture build

**Files:**
- Test: `tests/test_e2e_dag.py` (new)

**Interfaces:**
- Consumes: full pipeline (Tasks 1–5). No production code changes expected — if this fails, fix the earlier task, do not special-case the test.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/test_e2e_dag.py`:

```python
import contextlib
import io
import json
import shutil
from pathlib import Path

import build

REPO = Path(__file__).resolve().parents[1]
FIX = REPO / "v2" / "sample" / "lesson-demo"


def _patch_fixture(tmp_path, monkeypatch):
    """Copy lesson-demo; swap assignment to a validated dag; return workdir."""
    wd = tmp_path / "lesson"
    shutil.copytree(FIX, wd)

    # build.json → dag mode
    bj = json.loads((wd / "build.json").read_text(encoding="utf-8-sig"))
    bj["assignment"] = "dag"
    bj["dag"] = {"levels": 3, "max_nodes": 8}
    (wd / "build.json").write_text(json.dumps(bj, indent=1), encoding="utf-8")

    # replace LN.data.assign7 block via brace matching
    data_path = wd / "data.js"
    text = data_path.read_text(encoding="utf-8")
    marker = "LN.data.assign7"
    start = text.index(marker)
    brace = text.index("{", start)
    depth, end, instr, esc = 0, -1, False, False
    for k in range(brace, len(text)):
        c = text[k]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
        elif c == '"':
            instr = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = k
                break
    assert end > 0, "assign7 object not closed"
    dag = {
        "intro": "Walk the cart's decision.",
        "mode": "dag",
        "title": "One week, three decisions",
        "scenario": "Aling Nena must pick a path through a hard week.",
        "nodes": [
            {"id": "n0", "level": 0, "isLeaf": False,
             "question": "Monday opens with rain and half the usual crowd; "
                         "the ledger shows 45,000 fixed cost still due. Which move?",
             "outcome": None,
             "choices": [
                 {"label": "A", "text": "Hold price and cut charcoal waste today",
                  "points": 10, "nextNodeId": "n1"},
                 {"label": "B", "text": "Slash the plate price to pull a crowd",
                  "points": 4, "nextNodeId": "n2"},
             ]},
            {"id": "n1", "level": 1, "isLeaf": False,
             "question": "Waste is down and the noon crowd returned steady; "
                         "a supplier offers charcoal at wholesale but asks cash up front. Decide.",
             "outcome": "Holding the line kept contribution margin intact.",
             "choices": [
                 {"label": "A", "text": "Take wholesale with cash discipline",
                  "points": 9, "nextNodeId": "n3"},
                 {"label": "B", "text": "Delay the order until Friday's rush",
                  "points": 5, "nextNodeId": "n3"},
             ]},
            {"id": "n2", "level": 1, "isLeaf": False,
             "question": "The cheaper plates brought volume but the margin thinned; "
                         "charcoal now costs more per plate. Choose the correction.",
             "outcome": "Volume rose while contribution margin fell.",
             "choices": [
                 {"label": "A", "text": "Restore price and renegotiate supply",
                  "points": 8, "nextNodeId": "n3"},
                 {"label": "B", "text": "Keep low price and sell more plates",
                  "points": 3, "nextNodeId": "n3"},
             ]},
            {"id": "n3", "level": 2, "isLeaf": True,
             "question": "Friday closes: books balanced or books bruised?",
             "outcome": "Both roads arrive at the same closing ledger.",
             "choices": [],
             "finalOutcome": "The week ends with the path you chose written in the ledger."},
        ],
    }
    text = (text[:start] + marker + " = " + json.dumps(dag, ensure_ascii=False)
            + ";" + text[end + 1:])
    data_path.write_text(text, encoding="utf-8")
    return wd


def test_dag_fixture_builds_clean(tmp_path, monkeypatch):
    wd = _patch_fixture(tmp_path, monkeypatch)
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main([str(wd)])
    assert rc == 0, buf.getvalue()
    html = (tmp_path / "Week4-Demo-Notebook.html").read_text(encoding="utf-8")
    assert 'data-component="assignment"' in html
    # stricter: the serialized assignment object has no points key
    import re
    m = re.search(r"LN\.data\.assign7\s*=\s*(\{.*?\});", html, re.S)
    assert m, "assign7 not in output"
    body = json.loads(m.group(1))
    assert body["mode"] == "dag"
    assert "points" not in json.dumps(body)
    assert body["nodes"][0]["choices"][0]["nextNodeId"] == "n1"

    kf = tmp_path / "build" / "key" / "Week4-Demo-Notebook-key.json"
    assert kf.exists()
    key = json.loads(kf.read_text(encoding="utf-8"))
    assert key["mode"] == "dag"
    assert key["dag"]["optimal"]["max_score"] == 19  # 10+9
    assert key["dag"]["optimal"]["path"][0]["label"] == "A"
    assert len(key["dag"]["nodes"]) == 4
    assert "items" not in key
```

Note: gold path check — n0/A(10)+n1/A(9)=19 vs n0/A(10)+n1/B(5)=15 vs n0/B(4)+n2/A(8)=12 vs n0/B(4)+n2/B(3)=7 → unique max 19, node-level strict (10>4, 9>5). Good.

- [ ] **Step 2: Run to verify**

Run: `python -m pytest tests/test_e2e_dag.py -q`
Expected: PASS if Tasks 1–5 are correct; if FAIL, fix the production task (do not weaken the test).

- [ ] **Step 3: Full suite gate**

Run: `python -m pytest tests -q --tb=line`
Expected: **36 failed** (pre-existing only), all `test_e2e_dag` / `test_assignment_dag` / `test_assignment_contract` / `test_e2e_lesson` green.

- [ ] **Step 4: Smoke + flat sample**

Run from `v2/`: `node tools/assignment_smoke.js` → `SMOKE OK …`
Run flat sample build in temp cwd (Task 3 Step 5 command) → `OK`

- [ ] **Step 5: Commit**

```bash
git add tests/test_e2e_dag.py
git commit -m "test(e2e): dag assignment fixture builds, strips points, writes optimal key"
```

---

## Self-Review (plan author)

1. **Spec coverage:** §3 config → Task 3; §4 data/key/submission → Tasks 4/5/7; §5 build → Tasks 1–4; §6 component → Task 5; §7 authoring agents → Task 6; §8 checker → Task 7; §9 files → all tasks; §10 testing → each task + Task 8; §11 rollout order matches task order. Gap check: mixed flat+dag export → Task 7 Step 5/7 tests cover it; SA gate skip → Task 7 Step 9h; ReviewLog path rows → Step 9i + export test.
2. **Placeholder scan:** no TBD/TODO; every code step has full code; docs steps have full markdown.
3. **Type consistency:** `_dag_optimal` keys match Task 2/4/7 usages; `validate_assignment` kwarg names match Task 3 call; `scoreDag` return keys match app.js/export usage; smoke class names match component (`lna-begin`, `lna-start`, `lna-nav`); key `dag.optimal.max_score` snake_case matches checker.
