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
    assert r["path_count"] == 4          # A-A and A-B etc. through the chain
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


def test_dag_levels_inference_survives_non_dict_nodes():
    errs = []
    build.validate_assignment(dag_data([None]), errs, expected_mode="dag")
    assert errs, "malformed nodes must report Err, not raise"
    errs = []
    build.validate_assignment(
        dag_data([{"id": "n0", "level": "high"}]), errs, expected_mode="dag")
    assert errs, "non-int level must report Err, not raise"


def test_dag_bad_choice_count_still_checks_outcome():
    nodes = chain_nodes()
    nodes[1]["choices"] = []
    nodes[1]["outcome"] = ""
    errs = []
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("2-4 choices" in e.msg for e in errs)
    assert any("needs a non-empty outcome" in e.msg for e in errs)


def test_dag_non_list_choices_survives_reachability_walk():
    nodes = chain_nodes()
    nodes[0]["choices"] = "AB"  # truthy non-list survives count check via error
    errs = []
    build.validate_assignment(dag_data(nodes), errs, expected_mode="dag",
                              dag_cfg={"levels": 3, "max_nodes": 8})
    assert any("2-4 choices" in e.msg for e in errs)


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
