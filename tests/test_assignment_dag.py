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
