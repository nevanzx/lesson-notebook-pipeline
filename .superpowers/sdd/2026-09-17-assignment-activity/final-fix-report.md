# Final whole-branch review — fix wave (v2.5 assignment)

## Fix 1 (critical): export envelope carries no plaintext answers
- `v2/skeleton/components/assignment/component.js` `_export`: removed
  `answers: body.answers` from the `full = {...}` envelope object literal.
  Answers now exist ONLY inside `enc` (`enc.wk`/`enc.ct` wrap the body,
  which still contains `answers`) — matches spec §2/§3. Decrypt path
  untouched: decrypt.py decrypts `enc` and still sees `answers`.
- Guard test `test_export_body_carries_no_plaintext_answers` in
  `tests/test_assignment_deck.py`: regex-extracts `var full = {…};` and
  asserts no `answers` key and `enc:`/`wk:` present.

## Fix 2: second assignment mount escape hatch
- `v2/build.py` `extract_assignment`: when more than one
  `<div data-component="assignment">` mount exists in sections_text, appends
  Err rule `assign`: "assignment appears N times — exactly one assignment
  section per build" and returns no data (extra un-sanitized `$LN.data`
  assignments never ship).
- Test `test_only_one_assignment_mount` in `tests/test_assignment_contract.py`.

## Ride-along minors
3. component.js name validation now `/^[^,]+,\s*\S/` (comma + non-space after), replacing `indexOf(",") < 1`.
4. decrypt.py docstring: ==> headers go to stderr; tf answers normalised to `"true"`/`"false"`.
5. README.md gate count 62 → 63 green.
6. v2/SKILL.md: noted the submitted payload row shape `{q, type, prompt, answer}` (shared `answer` key for every type).

## Verification
- Gate: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → 65 passed, 2 deselected.
- Scratch rebuild of v2/sample/lesson-demo: OK; no `"ans"`/`'ans'`, no `key_points`/`aliases`, no plan-update; `build/key/keys.pem` + `Week4-Demo-Notebook-key.json` written. Only `answers` occurrences in HTML are the runtime state and the `enc` payload (required by contract).
