# Task 4 Report — assignment component deck

Status: DONE

## Done
- TDD: `tests/test_assignment_deck.py` written first (2 tests verbatim from brief Step 4 finalized form), confirmed RED (component files missing), then GREEN.
- `v2/skeleton/components/assignment/component.css` — verbatim from brief (tokens only, `@media print{.lna{display:none!important}}` included, minmax(0,Nfr) grids).
- `v2/skeleton/components/assignment/component.js` — verbatim from brief, plus the resolutions:
  - top: `var LNpub = "__PUBKEY__", LNkeyId = "__KEYID__";` immediately followed by `window.LN.pub = window.LN.pub || LNpub; window.LN.keyId = window.LN.keyId || LNkeyId;`
  - inside `init`: `window.LN.pub = window.LN.pub || LNpub; window.LN.keyId = window.LN.keyId || LNkeyId;`
  - `_export` is a stub; message contains "stub".
  - no `</` + letter sequences (all `<` literals are class-char regex or unicode escapes).
- `v2/skeleton/components/assignment/README.md` verbatim.
- `v2/skeleton/components/registry.md` — `assignment` row appended after glossary (before Conventions footer).
- Built HTML contains all required needles (lna-begin, lna-watermark, user-select:none, PrintScreen, visibilitychange, lna-cover, requestFullscreen) and no `"ans"` / `'ans'` / `key_points` / `aliases`.

## Change beyond the Task 4 file list (build.py)
`tests/test_deck_ships_without_leak` failed on green component files because `/*__DATA__*/` embedded `parts["data"]` raw, leaking `ans`/`aliases`/`key_points`. Added two minimal pieces to `v2/build.py`:
- `sanitize_assignment_data(data_text, key, data)` — balanced-brace rewrite of the `LN.data.<key>` object to a student-safe copy (`intro` + items shaped `{type, prompt[, choices]}`).
- In `assemble()`: `ka` initialized to `None`; when the assignment key and validated data exist and keys are present, the sanitized `data_out` replaces `/*__DATA__*/` (the raw text is used for `check_js`/`scan`/key file as before).

Without this helper, the brief's own leak-oriented test cannot pass; build.py is untouched otherwise.

## Tests
`python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` — 56 passed (54 baseline + 2 new), 2 deselected (pre-existing).

## Concerns
- build.py modification was not in this task's file list but is required by the task's leak assertion; flag for review of the plan split.
- `LNpub`/`LNkeyId` are published at module-load time; the component JS is glued before Task 3's replacement only when assignment data is valid — markers reaching Task 5's `_export` in that case are real values since builds error out otherwise.

---

# Task 4 Fix Round 1

Status: DONE

## Fixes
1. (Critical) `this._export` in the submit addEventListener handler — module restructured to `var api = {...}; return api;` (init + `_export` share one object); submit now calls `api._export(...)`.
2. (Important, fullscreen) Begin handler now always calls `fallbackOpen()` (request attempt → overlay-open class is set regardless of resolve/reject); a `fullscreenchange` listener re-applies `fallbackOpen()` when exiting fullscreen while opened, so the deck can never silently disappear on Esc. requestFullscreen behavior kept.
3. (Minor) submit completeness condition simplified to `missing.length > 0`.

## Test added
`test_sanitize_assignment_data_strips_answer_material` in tests/test_assignment_contract.py: prompts containing the substring "ans" ("answer"), ans/aliases/key_points fields present; asserts sanitized object keeps prompts intact, mc choices, keys ⊆ {type, prompt, choices}, and `key_points`/`aliases` absent from the rewritten text; surrounding statements preserved.

## Tests
- tests/test_assignment_deck.py — 2 passed
- Gate: 57 passed, 2 deselected (54 baseline + 2 deck + 1 new sanitize test).
