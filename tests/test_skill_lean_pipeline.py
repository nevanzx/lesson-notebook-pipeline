from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / "v2" / "SKILL.md"


def test_version_is_232():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "version: 2.32" in text
    assert "v2.32" in text


def test_labs_are_opt_in_in_the_brief():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert '"labs": true' in text
    assert "OFF by default" in text


def test_dag_track_is_parallel_and_section7_does_not_own_nodes():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "parallel" in text
    assert "does **not** write `data.js`" in text


def test_review_loop_is_capped():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "Max 2 retries" in text


def test_shared_refs_pool_is_documented():
    text = NOTEBOOK.read_text(encoding="utf-8")
    assert "refs.json" in text
    assert "ref_signature" in text
