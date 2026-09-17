# Task 7 Report — SKILL.md contract update (v2.5)

Status: DONE
Commit: 99cdb23 "docs(v2.5): assignment + activity-label contract in the skill"

## What changed

- `v2/SKILL.md`:
  - Frontmatter `version: 2.5`; description tail mentions activity labels + graded collect-only assignment with encrypted submission.
  - Title heading → v2.5.
  - Added "What v2.5 adds" paragraph after the v2.4 paragraph: data-activity labels (`data-activity="class discussion"`, `data-activity="none"` opts out), assignment 20 items 10 mc·4 tf·4 id·2 sa hidden deck, answers only in `ans`/`aliases`/`key_points`, teacher key at `build/key/<output stem>-key.json` via persistent keypair `build/key/keys.pem`, RSA-OAEP-256 + AES-GCM encrypted submission named `Lastname, Firstname - Week N - Subject.json`, `ln:week`/`ln:subject` metas from build.json, decrypt via `v2/tools/decrypt.py`.
  - Part 2 section-7 row now `**Assignment**` / `assignment` component; added activity-label note below the table.
  - Part 4C: derived-sections list says "7 Assignment"; brief template gained the assignment bullet (answers ONLY in data object, build strips them from shipped HTML — never rely on hiding, no feedback/score UI, items are strict JSON objects parsed with `json.loads`).
  - Part 5 QA: added "Assignment integrity" bullet (10/4/4/2 mix, no answer material readable, Begin→fullscreen→slide flow, `build/key/` received the key file).
  - Part 6 principle 7 → "The assignment collects; it never reveals. Feedback lives in `build/key/`."
- `README.md`: replaced stale test-count line ("40 green; 37 shard-era pending migration") with the actual gate command and "62 green".

## Verification

Gate: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → 62 passed, 2 deselected in 3.71s.

## Notes / concerns

- Unfiltered pytest run shows 2 known failures (`test_parts_where_and_where_line`, `test_scan_reports_parts_coords`) outside the specified gate — pre-existing Task-1-6 territory, not touched here.
- Also touched "7 Self-Check" → "7 Assignment" in Part 4C's derived-section paragraph for naming consistency.

## Fix round 1

Commit: c4b3db4 "docs(v2.5): reconcile stale self-check-era lines in the skill"
- "Inputs required" Assessment row -> encrypted collect-only assignment (20 items 10/4/4/2), marked by the teacher from the decrypted key file.
- �2.3: dropped "quiz to 15�20 items"; the assignment always carries its full 20 items (case bank may expand).
- Part 7: 12 -> 13 registered components (assignment registered; port-lab pending mention kept).
Gate: 62 passed, 2 deselected.
