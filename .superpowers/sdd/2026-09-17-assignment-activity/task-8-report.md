# Task 8 Report — lesson-demo ships the assignment (E2E)

## Status: DONE

## Commit
`673409f` — `feat(v2.5): lesson-demo carries the 20-item assignment; e2e asserts build + key file` (brief Step 6 verbatim)

## Files (5 changed; brief assumed parts/ but sample verified to be monolith)
- `tests/test_e2e_lesson.py` — added `test_demo_builds_assignment_and_key` (imports: contextlib, io, json added to header)
- `v2/sample/lesson-demo/build.json` — `assignment` added to components; `"week": 4`, `"subject": "Management Science"`
- `v2/sample/lesson-demo/sections.html` — new `<section class="block" id="assignment">` with `<h2>6 &nbsp;Assignment</h2>` + mount `data-component="assignment" data-key="assign7"` (no data-activity; card self-labels); selfcheck/recap h2 renumbered 7/8
- `v2/sample/lesson-demo/outline.json` — new section entry `{"id":"assignment","title":"6  Assignment","from":[]}`; selfcheck→"7  Self-Check", recap→"8  Recap" (headings match verbatim modulo nbsp per norm_heading)
- `v2/sample/lesson-demo/data.js` — `LN.data.assign7`, strict JSON, 20 items exactly 10 mc + 4 tf + 4 id + 2 sa

## Resolution notes (brief-vs-reality reconciliations)
1. Sample was a monolith (`sections.html`/`data.js`), NOT parts/ — creating parts/ would have triggered merge_parts "both monolith and parts" errors. Kept monolith; appended the assignment section/data there instead.
2. outline.json has NO "REVIEW QUESTIONS" source title and `dropped: []` — assignment entry added with `"from": []`; no dropped[] edit possible.
3. The resolution's guessed numbers (FC 3,500 / VC 38 / P 85) do not appear anywhere in the sample; the sample's own slice is FC 45,000 / P 160 / VC 80 / vol 750 / BEP 562.5 / CM 80 / MoS 25%. All 20 items use ONLY those numbers and the sample's existing records (rainy-month 520 plates, charcoal VC 95 preset, sari-sari wholesale-rate note, helper festival-month wage, stove-repair April time-lag, printed-wraps binning, rice-truck branch no-go, price-cut 140 scenario). No invented businesses.
4. Duplicate "6" avoided by renumbering selfcheck→7 and recap→8 in both outline.json and sections.html (ids and from[] untouched).

## TDD evidence
- Failing first: new test failed on `data-component="assignment"` before changes (1 failed, 2 passed).
- After: `tests/test_e2e_lesson.py` 3 passed.
- Gate: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → **63 passed, 2 deselected** (62 baseline + 1 new).
- Manual CLI build into a temp run dir: `OK - wrote Week4-Demo-Notebook.html (1947 lines)` + `OK - wrote build/key/Week4-Demo-Notebook-key.json`.

## Concerns
- None blocking. Note: `'"ans"' not in html` passes because sanitize_assignment_data strips ans/aliases/key_points; verified against the real skeleton (no "ans" literals in skeleton JS).

---

## Fix Round 1 (commit b564b05)

- **[CRITICAL] recap7 6th card restored** — my original edit's oldString consumed the last recap card, leaving LN.data.recap7 with an unterminated array. The card { q: "Where the method goes dark", ... } plus closing ]/}; back in place.
- **JS validity verification**: 
ode --check v2/sample/lesson-demo/data.js → OK (node v24.16.0 available). Additionally executed the file in node (stubs LN.data) and asserted programmatically: 6 recap cards, card 6 = "Where the method goes dark", 20 assignment items, mix {mc:10, tf:4, id:4, sa:2}.
- **E2e test extended** — ssert "Where the method goes dark" in html added to test_demo_builds_assignment_and_key; existing assertions ('"ans"' absence, key file, week/subject, 20 items) untouched.
- **sa item 1 key_points trimmed to 3** — dropped "skills: one person already runs the cart's logistics" (weakest of the four; market/cost/timing kept, all traceable to gate2's branch case).
- Re-verify: tests/test_e2e_lesson.py 3 passed; gate 63 passed, 2 deselected; clean CLI rebuild into fresh temp dir emitted both OK lines (1949-line HTML + key JSON).
