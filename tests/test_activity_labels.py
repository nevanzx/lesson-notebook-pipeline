import re
from pathlib import Path


def test_shell_carries_wrapper():
    shell = Path("v2/skeleton/shell.html").read_text(encoding="utf-8")
    assert "ln-act-tag" in shell and "data-activity" in shell


def test_sample_mounts_labelled():
    sec = Path("v2/sample/lesson-demo/sections.html").read_text(encoding="utf-8")
    hits = len(re.findall(r'data-activity="class discussion"', sec))
    assert hits >= 3, hits
