from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / "v2" / "SKILL.md"


def text():
    return NOTEBOOK.read_text(encoding="utf-8")


def region(start, end):
    body = text()
    assert start in body, f"missing start anchor: {start!r}"
    assert end in body, f"missing end anchor: {end!r}"
    return body[body.index(start):body.index(end)]


def test_version_is_232():
    body = text()
    assert "version: 2.32" in body
    assert "v2.32" in body


def test_labs_are_opt_in_in_the_brief():
    body = text()
    assert '"labs": true' in body
    assert "OFF by default" in body


def test_part2_compute_bullet_gates_labs_behind_the_flag():
    bullet = region("- A **calculation** outcome", "- An **analysis** outcome")
    assert '"labs": true' in bullet
    assert "only when" in bullet
    assert "break-even-lab" in bullet


def test_dag_track_is_parallel_and_section7_does_not_own_nodes():
    track = region("**D2. DAG assignment track", "**E. Judgment QA")
    assert "parallel" in track
    assert "does **not** write `data.js`" in track
    assert "does **not** author `nodes[]`" in track


def test_section7_brief_does_not_author_nodes():
    brief = region(
        "- If your section mounts `assignment`",
        "- Only when `build.json` has",
    )
    assert "do **not** author `nodes[]`" in brief
    assert "parts/<NN>-assignment.data.js" in brief
    assert '"mode": "dag"' not in brief
    assert "Write `\"mode\": \"dag\"`" not in brief


def test_prose_budget_points_at_the_deterministic_lint():
    budget = region("### 2.1e The prose budget", "### 2.2 If no MILO")
    assert "tools/prose_lint.py" in budget
    assert "--max-words 40" in budget
    assert "--max-sentence-words 30" in budget
    assert "python tools/paragraphs.py" not in text()


def test_editing_mode_uses_the_merged_shortlist_reviewer():
    editing = region("**Editing an existing notebook (v2.18).**", "`outline.json` schema")
    assert "shortlist reviewer" in editing
    assert "There is no separate per-section" in editing
    assert "numeric reviewer" in editing
    assert "reviewer agent per section for numeric freshness" not in editing


def test_part4_documents_the_shared_refs_pool_wave():
    part4 = region("## Part 4", "## Part 5")
    assert "Wave 0" in part4
    assert "refs.json" in part4
    assert "before any author dispatches" in part4.lower()


def test_review_loop_is_capped():
    assert "Max 2 retries" in text()


def test_shared_refs_pool_is_documented():
    body = text()
    assert "refs.json" in body
    assert "ref_signature" in body
