# Task 3 Report — Assignment data contract

Status: DONE (commit 43576e7 on feature/v2.5-assignment)

## Done
- `tests/test_assignment_contract.py` — 6 tests verbatim from brief (valid mix + key file, bad mix, field checks, extract from mount, extract missing object, unparsable strict-JSON).
- TDD: confirmed red (AttributeError) → implemented → green.
- `v2/build.py`: added `ASSIGN_SIZE`, `ASSIGN_MIX_ORDER`, `extract_assignment` (balanced-brace JSON scan), `validate_assignment` (20 items, 10/4/4/2, mc/tf/id/sa field checks, non-empty prompts), `write_key_file` (`<run>/build/key/<output stem>-key.json`; rows n/type/prompt + mc{choices,ans}/tf{ans}/id{aliases}/sa{key_points}; header lesson/output/week/subject/key_id/public_key_b64/decrypt).
- `assemble()` wiring: extract+validate+`ensure_teacher_keys(Path.cwd()/"build"/"key")` right after `check_mounts`; `__PUBKEY__`/`__KEYID__` substituted into the assignment's component JS (only when assignment mounted and keys present); error paths now `return None, errors, {}`; success returns `(out, errors, {"assign": data, "keys": keys})`.
- `main()`: unpacks 3-tuple; after the HTML write succeeds, writes the key file and prints `OK - wrote <kf>`. Key file never written on failed build.
- Existing test call sites updated mechanically to unpack the 3-tuple (`tests/test_build.py` 22 sites, matrix/shards/shell_smoke/themes 7 sites).

## Deviation from brief
- Mix loop reports deficits only (`got < want` instead of `got != want`): the brief's verbatim code made `test_bad_mix_named` fail because the surplus (sa=3, "expected 2") error sorted after the mc deficit. Since item total is fixed at 20, every surplus implies a symmetric deficit, so deficit-only reporting is complete and matches the test contract.

## Tests
`python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → 54 passed, 2 deselected (48 baseline + 6 new).

## Concerns
- Pre-existing `build.Parts` failures (`test_parts_where_and_where_line`, `test_scan_reports_parts_coords`) remain, gated out as before — another task's scope.
- `ensure_teacher_keys` in `assemble()` uses `Path.cwd()`, matching the run-dir convention; requires the build be invoked from the run dir.
