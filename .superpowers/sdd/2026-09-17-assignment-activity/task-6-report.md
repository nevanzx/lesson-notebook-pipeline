# Task 6 Report — Activity labels (`data-activity` + shell wrapper)

**Status:** COMPLETE
**Commit:** a5b044a — `feat(v2.5): data-activity labels — 'Activity — class discussion' tag via shell wrapper`

## What was done

1. **tests/test_activity_labels.py** (new) — written first, verified failing (red): `test_shell_carries_wrapper` checks skeleton shell contains `ln-act-tag` + `data-activity`; `test_sample_mounts_labelled` requires >=3 `data-activity="class discussion"` matches in sample sections.html.
2. **v2/skeleton/shell.html**:
   - Added `.ln-act-tag` and `.ln-act-wrap` CSS (tokens only, no hex) immediately after the `.chip` rule.
   - Replaced `LN._initOne` with the wrap-safe version from the brief: holder div created once per mount (guarded by `m.holder`), `innerHTML` cleared each re-init, tag appended before the mount element, `init` called after wrap. `data-activity="none"` opts out (for assignment self-labels).
3. **v2/sample/lesson-demo/sections.html** — added `data-activity="class discussion"` to the sort-statement, comparison-table, and step-solver mounts (3 total; monolith layout confirmed — no parts/ dir consumed at HEAD).

## Gates

- `python -m pytest tests/test_activity_labels.py -q` → 2 failed (red), then 2 passed (green).
- Full gated suite: `pytest tests --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → **62 passed, 2 deselected** (baseline 60 + 2 new).
- `python -m pytest tests/test_e2e_lesson.py -q` → **2 passed** (sample still builds).
- Constraints verified: tokens-only CSS, no hex, no `</`+letter in JS, no alert/etc.

## Concerns

- None. Sample is monolith as briefed; parts-based section agents will set `data-activity="none"` via the assignment contract (Task 8).
