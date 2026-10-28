import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
V2 = REPO / "v2"
CHECKER_PARAGRAPHS = REPO / "average-student-checker" / "tools" / "paragraphs.py"


def test_vendored_paragraphs_is_byte_identical():
    assert (V2 / "tools" / "paragraphs.py").read_bytes() == \
        CHECKER_PARAGRAPHS.read_bytes()


def test_v2_only_copy_builds_the_sample(tmp_path):
    v2_copy = tmp_path / "v2"
    shutil.copytree(V2, v2_copy, ignore=shutil.ignore_patterns("__pycache__"))
    workdir = v2_copy / "sample" / "lesson-demo"
    run_dir = tmp_path / "run"
    run_dir.mkdir()

    result = subprocess.run(
        [sys.executable, str(v2_copy / "build.py"), str(workdir)],
        cwd=run_dir, capture_output=True, text=True, encoding="utf-8")
    assert result.returncode == 0, result.stdout + result.stderr
    assert (run_dir / "Week4-Demo-Notebook.html").exists()


def test_v2_only_copy_runs_the_lint_cli(tmp_path):
    v2_copy = tmp_path / "v2"
    shutil.copytree(V2, v2_copy, ignore=shutil.ignore_patterns("__pycache__"))
    sections = v2_copy / "sample" / "lesson-demo" / "sections.html"

    result = subprocess.run(
        [sys.executable, str(v2_copy / "tools" / "prose_lint.py"),
         str(sections)],
        cwd=v2_copy, capture_output=True, text=True, encoding="utf-8")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "ModuleNotFoundError" not in result.stderr
