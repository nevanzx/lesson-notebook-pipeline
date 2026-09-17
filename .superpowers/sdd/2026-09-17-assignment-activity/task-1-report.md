# Task 1 Report: build.json `week`/`subject` + `__META__` head injection

Branch: `feature/v2.5-assignment` · Commit: `a0c81ab`

## What changed

### `v2/build.py`
1. **Allowed keys** (~line 544): added `"week"`, `"subject"` to the allowed-keys set; updated the error hint string to list them.
2. **`MARKERS`** (line 32): added `"__META__"` so the assembler validates exactly-once presence in any shell.
3. **Substitution chain** (after `title = html.escape(...)` ~line 663): when either `week` or `subject` is present in `cfg`, builds two meta tags with `html.escape(..., quote=True)` and replaces `__META__`; otherwise substitutes an empty string (so absent keys leave no trace in output).

### `v2/skeleton/shell.html`
- Inserted `__META__` on its own line right after `<title>__TITLE__</title>` inside `<head>`.

### `tests/test_build.py`
- `MINI_SHELL`: added `__META__` right after `<title>__TITLE__</title>` so the new MARKERS exactly-once check passes for all existing fixtures.

### `tests/test_assignment_meta.py` (new)
Implemented the **final** version from the brief (the messy scaffolding draft was superseded per corrections). Three tests:
- `test_week_subject_injected_as_meta` — build.json with `week: 4`, `subject: "Management Science"` produces `<meta name="ln:week" content="4">` and `<meta name="ln:subject" content="Management Science">` in output.
- `test_meta_html_escaped` — `subject: 'Oil & "Drills"'` is escaped to `content="Oil &amp; &quot;Drills&quot;">`.
- `test_absent_keys_no_meta` — no `ln:week`/`ln:subject` strings appear when keys are absent.

## TDD sequence
1. Wrote `tests/test_assignment_meta.py` first → ran `python -m pytest tests/test_assignment_meta.py -q` → **2 failed, 1 passed** (failures: `unknown keys: subject, week`; the absent-keys test passed trivially pre-implementation, as expected since no meta machinery existed).
2. Implemented the three build.py edits + shell/MINI_SHELL marker additions.
3. `python -m pytest tests/test_assignment_meta.py tests/test_build.py -q` → **34 passed, 2 failed** — the 2 failures are the pre-existing stale `build.Parts` tests (`test_parts_where_and_where_line`, `test_scan_reports_parts_coords`), unrelated to this task and excluded by the gate.
4. Full gate: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → **42 passed, 2 deselected** (baseline 39 + 3 new tests).

## Commit
```
a0c81ab feat(v2.5): bake ln:week/ln:subject meta tags from build.json
```
Files: `v2/build.py`, `v2/skeleton/shell.html`, `tests/test_build.py`, `tests/test_assignment_meta.py`.

## Notes
- Injection is unconditional-when-present per the brief: any build with week/subject keys bakes the metas (harmless/useful for non-assignment builds).
- Generated HTML output was never hand-edited; all changes flow through the assembler.

---

## Fix Round 1 (review: no week/subject value validation)

### Fix (`v2/build.py`, cfg validation block after allowed-keys check)
- When `"assignment" in cfg.get("components", [])`: for each of `week`/`subject`, if `not cfg.get(k)` append `Err("build.json", "build.json", None, "assignment builds need %r" % k, "assignment components require week + subject")`.
- Week value validation whenever the key is present: `not isinstance(w, int) or isinstance(w, bool) or w < 1` → `Err("build.json", ..., "week must be an integer >= 1, got %r", "set week to a positive integer")` (bool guard added since `bool` subclasses `int`).
- Meta injection when keys present is unchanged (validation only errors out the build; a valid assignment build still bakes both metas).

### New tests (`tests/test_assignment_meta.py`)
- `test_assignment_missing_subject_fails` — assignment build with `week: 4` only → rc 1, error names `subject`.
- `test_assignment_week_string_fails` — `week: "4"` → rc 1, error names `week`.
- `test_assignment_week_zero_fails` — `week: 0` → rc 1, error names `week`.
- Stub `assignment` component registered via `make_skel(tmp_path, components=("assignment",))` (uses the shared MINI_CSS/MINI_JS 1-liners; `check_mounts` satisfied with an `assignment` mount + `LN.data.a1`).

### TDD sequence / commands
1. `python -m pytest tests/test_assignment_meta.py -q` → 3 failed, 3 passed (new tests red).
2. Implemented validation → `python -m pytest tests/test_assignment_meta.py -q` → 6 passed.
3. Gate: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → 45 passed, 2 deselected (42 prior + 3 new).
