# Task 2 Report — Teacher keys

**Status:** COMPLETE
**Commit:** `c392b58` — `feat(v2.5): teacher keypair in run-dir build/key + key id + filename sanitizer`
**Branch:** `feature/v2.5-assignment`

## Deliverables
- `v2/tools/__init__.py` — empty package marker.
- `v2/tools/make_keys.py` — `generate_pem(pem_path)`: RSA-3072 keypair, PKCS8 + SPKI PEM, header comment with key id + timestamp, written to keys.pem.
- `v2/build.py`:
  - Top imports: added `base64`, `hashlib` (alphabetized with existing imports).
  - After `read_text` (v2/build.py:523): `PUB_RE`, `PRV_RE`, `key_id_for`, `sanitize_filename`, `ensure_teacher_keys` verbatim from brief.
  - Resolution per agent instructions: lazily import `tools.make_keys` inside the not-exists branch with `sys.path` nudge (`if str(Path(__file__).resolve().parent) not in sys.path: sys.path.append(...)`) so `python v2/build.py` resolves the module.
- `tests/test_assignment_keys.py` — 3 tests verbatim from brief.

## Test results
- `tests/test_assignment_keys.py`: 3 passed.
- Gate: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → **48 passed, 2 deselected** (45 baseline + 3 new).

## TDD
Red verified first: 3 AttributeError failures before implementation; then green.

## ⚠️ Deviation from brief (needs reviewer attention)
Brief's verbatim `sanitize_filename` **failed the brief's own verbatim test**:
- Input `'José<>:"/\\|?*'` under brief code → `'José_________'`, but test expects `'José.'`.
The test was treated as source of truth. Fix: added one line to substitute runs of 2+ replacement underscores with a single dot:
```python
s = re.sub(r"_{2,}", ".", s)
```
This passes all five assertions (`'Reyes / Co'` → `'Reyes _ Co'` unaffected since `/` is a single-char run). Edge case: real names containing run-of-2+ literal underscores would also collapse to `.` — flagging in case the planner intended different semantics.

## Out of scope (Task-1 deferred minor, registered)
- Task-1 deferred minor in build.py's cfg area was NOT touched (scope kept). Passing to coordinator to register for a later fix pass.

## Notes
- No comments added beyond the brief's docstrings.
- Baseline gate count: 45→48 exactly as expected; no regressions elsewhere.

## Fix round 1

**Ruling:** each forbidden/control char -> `_`, then runs of 2+ `_` collapse to a single `_`.
**Change:** `sanitize_filename` now `re.sub(r"_+", "_", s)` after per-char replacement; test expectation updated to `'José' + '_'` (`'José_'`).
**Commit:** `e58d664` — fix(v2.5): sanitize_filename collapses __-runs to _ per human ruling
**Tests:** tests/test_assignment_keys.py 3 passed; full gate 48 passed, 2 deselected.
**Note:** Task-3+ student filename builder must treat consecutive mangling as one `_` (e.g. `'José<>:"/\|?*'` -> `'José_'`).
