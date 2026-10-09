# No Build-Provenance Narration in the Notebook HTML — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop build-provenance/sourcing narration from ever reaching the student-facing notebook HTML, enforce it mechanically, and remove the one leaked instance (Week 10).

**Architecture:** Three independent changes: (1) a `check_provenance()` guard in `v2/build.py` plus unit tests; (2) the corresponding rule text in `v2/SKILL.md` plus a skill-content test; (3) remediation of the existing Week 10 build in the course workspace using the new guard.

**Tech Stack:** Python 3.13, `re` (stdlib), pytest 8.3, Node 24 (layout smoke), git on `master`.

## Global Constraints

- Repo: `D:\Python\lesson-notebook-pipeline`, branch `master`. Work directly on master — no worktree, no feature branch.
- Runtime: `python` is 3.13.11, `pytest` is 8.3.0, `node` is v24.11.1. No new dependencies.
- Target skill version: **v2.21**.
- The provenance marker set is exactly the seven alternatives in the spec §5 (case-insensitive). Do not widen or narrow it without a new spec.
- `src/*.txt` files are build inputs and are **never** scanned — the `SOURCE:` header there is required and correct.
- Only merged `parts/*.sections.html` and `parts/*.data.js` are scanned.
- The workspace at `G:\.shortcut-targets-by-id\1QV9Y5VHjGjiNrKFPhC-Bc7BYyOJ0358P\DANEVE OBERO\FM102\Lessons and Question` is **not** a git repo: files there are edited/regenerated but never committed.
- A pre-existing uncommitted change exists: `v2/SKILL.md` carries v2.19/v2.20 edits on top of a v2.17 HEAD. Commit it as a baseline before feature work (Task 0).
- Assessment/graded-deliverable framing ("what this week is rehearsing for") is **out of scope** and stays.

---

### Task 0: Baseline commits (spec + pending SKILL.md v2.20)

**Files:**
- Add: `docs/superpowers/specs/2026-10-09-no-provenance-in-notebook-design.md` (already written)
- Add: `docs/superpowers/plans/2026-10-09-no-provenance-in-notebook.md` (this file)
- Commit existing: `v2/SKILL.md` (uncommitted v2.19/v2.20 edits)

**Interfaces:**
- Consumes: nothing.
- Produces: a clean working tree so later commits contain only feature diffs.

- [ ] **Step 1: Commit the pending v2.19/v2.20 SKILL.md state**

```bash
git add v2/SKILL.md
git commit -m "docs(skill): land v2.19/v2.20 content-shape and MILO rules"
```

- [ ] **Step 2: Commit the design spec and this plan**

```bash
git add docs/superpowers/specs/2026-10-09-no-provenance-in-notebook-design.md docs/superpowers/plans/2026-10-09-no-provenance-in-notebook.md
git commit -m "docs: add no-provenance-in-notebook design spec and plan"
```

- [ ] **Step 3: Verify the tree is clean**

Run: `git status --porcelain`
Expected: no output (clean).

---

### Task 1: `check_provenance()` in build.py + tests

**Files:**
- Create: `tests/test_provenance_build.py`
- Modify: `v2/build.py` — add `PROVENANCE_RE` after `NAME_RE` (currently line 82); add `check_provenance()` after `check_practice()` (currently ends line 370); wire the call in `assemble()` immediately after `check_present(parts["sections"], errors)` (currently line 1656).

**Interfaces:**
- Consumes: existing `scan(text, regex, rule, fname, msg, hint)` and `Err` in `v2/build.py`.
- Produces: module-level `PROVENANCE_RE` (`re.Pattern`); `check_provenance(sections_text: str, data_text: str, errors: list) -> None` appending `Err(rule="provenance", …)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_provenance_build.py`:

```python
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "v2" / "build.py"

VALID_SECTIONS = (
    '<section class="block" id="costs"><h2 data-present="0">1 Costs</h2>'
    '<div class="def" data-present="1"><p>Fixed cost...</p></div>'
    '<p><span data-present="2">Rises with volume</span> and other words.</p>'
    "</section>")


def _run(tmp_path, sections, data="LN.data.m0={items:[]};"):
    wd = tmp_path / "wd"
    wd.mkdir()
    (wd / "build.json").write_text(json.dumps({
        "title": "T", "theme": "parchment", "layout": "app",
        "components": ["milo-list"], "output": "Out.html"}), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--accent:#123456}", encoding="utf-8")
    (wd / "sections.html").write_text(sections, encoding="utf-8")
    (wd / "data.js").write_text(data, encoding="utf-8")
    return subprocess.run([sys.executable, str(BUILD), str(wd)],
                          capture_output=True, text=True, cwd=str(tmp_path))


def test_clean_build_passes(tmp_path):
    r = _run(tmp_path, VALID_SECTIONS)
    assert r.returncode == 0, r.stdout + r.stderr


def test_provenance_in_sections_fails(tmp_path):
    sections = VALID_SECTIONS.replace(
        "Fixed cost...", "The syllabus carried no teaching body, so this is authored.")
    r = _run(tmp_path, sections)
    assert r.returncode == 1
    assert "provenance" in (r.stdout + r.stderr)


def test_provenance_in_data_fails(tmp_path):
    r = _run(tmp_path, VALID_SECTIONS,
             data='LN.data.m0={items:[{s:"source: specification"}]};')
    assert r.returncode == 1
    assert "provenance" in (r.stdout + r.stderr)


def test_factual_citation_passes(tmp_path):
    sections = VALID_SECTIONS.replace(
        "Fixed cost...", "Under BSP Circular 808, the bank must hold capital.")
    r = _run(tmp_path, sections)
    assert r.returncode == 0, r.stdout + r.stderr
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_provenance_build.py -v`
Expected: `test_provenance_in_sections_fails` and `test_provenance_in_data_fails` FAIL (build currently returns 0 because no provenance check exists); the other two pass.

- [ ] **Step 3: Add `PROVENANCE_RE`**

In `v2/build.py`, after `NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")` (line 82), insert:

```python
# Build-provenance guard (v2.21). Narrating where the notebook's text came from
# must never reach a part; the source-type declaration lives in src/full.txt and
# the opening message only. Specific enough that a real "Source: BSP Circular 808"
# fact citation does not match.
PROVENANCE_RE = re.compile(
    r"carried\s+no\s+(?:teaching\s+)?body"
    r"|authored\s+teaching\s+text"
    r"|\bnot\s+extracted\b"
    r"|source\s*:\s*(?:specification|teaching)\b"
    r"|written\s+against\s+the\s+standards"
    r"|this\s+week'?s\s+text\s+is\s+written"
    r"|authored\s+against\s+the\s+standards",
    re.I)
```

- [ ] **Step 4: Add `check_provenance()`**

In `v2/build.py`, immediately after the `check_practice()` function (after line 370, before `class Balance`), insert:

```python
def check_provenance(sections_text, data_text, errors):
    """Build-provenance narration must never reach a part (SKILL §9.1, v2.21):
    no statement of where the notebook's text came from or how it was authored.
    The source-type declaration lives in src/full.txt and the opening message
    only, never in a shipped section or its data."""
    hint = ("remove build-provenance narration — the source-type declaration "
            "belongs in the opening message and src/full.txt, never in a part")
    errors.extend(scan(sections_text, PROVENANCE_RE, "provenance",
                       "sections.html", "build-provenance narration", hint))
    errors.extend(scan(data_text, PROVENANCE_RE, "provenance",
                       "data.js", "build-provenance narration", hint))
```

- [ ] **Step 5: Wire the call into `assemble()`**

In `v2/build.py`, find:

```python
    check_present(parts["sections"], errors)
```

and replace with:

```python
    check_present(parts["sections"], errors)
    check_provenance(parts["sections"], parts["data"], errors)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_provenance_build.py -v`
Expected: all 4 pass.

- [ ] **Step 7: Run the existing build test suite to check for regressions**

Run: `python -m pytest tests/test_build.py tests/test_skill_present.py -v`
Expected: all pass (the shipped samples carry no provenance markers).

- [ ] **Step 8: Commit**

```bash
git add v2/build.py tests/test_provenance_build.py
git commit -m "feat(build): fail on build-provenance narration in notebook parts"
```

---

### Task 2: Document the rule in SKILL.md + skill-content test

**Files:**
- Create: `tests/test_skill_provenance.py`
- Modify: `v2/SKILL.md` — front matter version (line 3), H1 version (line 19), a "What v2.21 adds" paragraph (after line 201), §Source types rule 4 (lines 251–253), the section-agent brief hard rules (before line 827), §9.1 (after line 1042), §9.5 (line 1088).

**Interfaces:**
- Consumes: nothing from Task 1 at runtime; documents the same rule.
- Produces: `SKILL.md` declaring v2.21 and the no-provenance rule; a test asserting that documentation exists.

- [ ] **Step 1: Write the failing skill-content test**

Create `tests/test_skill_provenance.py`:

```python
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1] / "v2" / "SKILL.md"


def test_skill_documents_no_provenance_rule():
    text = SKILL.read_text(encoding="utf-8")
    assert "build-provenance" in text


def test_skill_rule_gap_in_opening_message_only():
    text = SKILL.read_text(encoding="utf-8")
    assert "never inside the notebook" in text


def test_skill_version_is_2_21():
    text = SKILL.read_text(encoding="utf-8")
    assert "v2.21" in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_skill_provenance.py -v`
Expected: all 3 FAIL (none of the strings exist yet).

- [ ] **Step 3: Bump the version**

Edit `v2/SKILL.md` line 3:

old: `version: 2.20`
new: `version: 2.21`

Edit `v2/SKILL.md` line 19:

old: `# Interactive Lesson Notebook (v2.20 — outline-first, one agent per section)`
new: `# Interactive Lesson Notebook (v2.21 — outline-first, one agent per section)`

- [ ] **Step 4: Add the "What v2.21 adds" paragraph**

In `v2/SKILL.md`, after the v2.20 paragraph that ends `See Part 2 and §2.2.` and before `## When to use`, insert:

```markdown
What v2.21 adds: **no build-provenance narration.** A notebook teaches the subject and
never narrates its own construction. No part may state where or how its text was authored
(`source: specification`/`teaching`, "authored", "not extracted", "carried no teaching
body", "written against the standards…", a `Sourcing.` box) — for **both** source types.
The `specification` declaration lives in the `SOURCE:` header of `src/full.txt` and the
opening message only (§Source types rule 4). Naming a real law/circular/textbook as the
source of a fact stays permitted. Enforced by build.py's `provenance` rule; see §9.1.
```

- [ ] **Step 5: Tighten §Source types rule 4**

In `v2/SKILL.md`, find:

```
   coverage and carried no body, so the content was authored against the standards
   the outcomes name. Never present authored content as if the syllabus supplied it.
```

and replace with:

```
   coverage and carried no body, so the content was authored against the standards
   the outcomes name. Never present authored content as if the syllabus supplied it.
   The flag lives in the opening message only — **never inside the notebook**: no part
   (`sections.html` / `data.js`) may state where or how the content was authored.
```

- [ ] **Step 6: Add the brief hard-rule bullet**

In `v2/SKILL.md`, find the last hard-rule line of the section-agent brief:

```
- When both files are written, reply exactly: done <key1> <key2> ...
```

and insert this bullet immediately before it:

```
- No self-reference. Never state where this notebook's text came from or how it was
  authored — no `source: specification`, "authored"/"not extracted", "Sourcing…",
  "the syllabus carried no teaching body". Teach the subject; name a real
  law/circular/textbook only as the source of a fact.
```

- [ ] **Step 7: Add the §9.1 bullet**

In `v2/SKILL.md`, find the end of the §9.1 encoding bullet:

```
  use ASCII-only anchors so a display artifact can never corrupt the match.
```

and insert this bullet immediately after it (before `### 9.2`):

```
- **No build-provenance narration (self-reference class).** The notebook teaches the
  subject; it never narrates its own construction. Forbidden in any
  `parts/*.sections.html` or `parts/*.data.js`, for **both** `teaching` and
  `specification` sources: (a) source-type declarations (`source: specification`,
  `source: teaching`); (b) authored-vs-extracted statements ("authored", "not
  extracted", "carried no teaching body", "sections 1–N of this file are authored
  teaching text", "written against the standards the outcomes name"); and (c) a
  `Sourcing.` / provenance note box that explains where the week's text came from.
  The declaration lives in exactly two places, nowhere else: the `SOURCE:` header of
  `src/full.txt` and the **opening message** (§Source types rule 4; Part 8).
  **Permitted:** naming a real law, circular, standard clause, or textbook *as the
  source of a fact being taught* ("Under BSP Circular 808 …") — that is subject
  matter, not provenance. Enforced by `check_provenance()` (build.py, rule
  `provenance`).
```

- [ ] **Step 8: Add the §9.5 resume-checklist item**

In `v2/SKILL.md`, find:

```
term-order mapping, no `&#…;` refs, no U+FFFD (verify by **byte-level decode, not by eye** —
```

and replace with:

```
term-order mapping, no `&#…;` refs, no build-provenance narration (the `provenance` rule),
no U+FFFD (verify by **byte-level decode, not by eye** —
```

- [ ] **Step 9: Run test to verify it passes**

Run: `python -m pytest tests/test_skill_provenance.py -v`
Expected: all 3 pass.

- [ ] **Step 10: Commit**

```bash
git add v2/SKILL.md tests/test_skill_provenance.py
git commit -m "docs(skill): ban build-provenance narration in notebook parts (v2.21)"
```

---

### Task 3: Remediate the existing Week 10 notebook

**Files:**
- Modify: `G:\.shortcut-targets-by-id\1QV9Y5VHjGjiNrKFPhC-Bc7BYyOJ0358P\DANEVE OBERO\FM102\Lessons and Question\build\week10-operations\parts\01-overview.sections.html` (remove lines 37–39)
- Regenerate: `G:\...\FM102\Lessons and Question\Week10-Notebook.html`

**Interfaces:**
- Consumes: `check_provenance()` from Task 1 (the build now fails while the box is present).
- Produces: a Week 10 notebook with no provenance narration; `LAYOUT OK` at desktop and phone widths.

- [ ] **Step 1: Confirm the new guard trips on the current build (red)**

Run from the workspace root:

```
python "D:\Python\lesson-notebook-pipeline\v2\build.py" "build/week10-operations"
```

Expected: `FAIL - … problem(s); no output written.` including a line whose rule is
`provenance` naming `sections.html`.

- [ ] **Step 2: Remove the leaked block**

In `build/week10-operations/parts/01-overview.sections.html`, delete exactly these three lines (the whole `<div>`):

```html
  <div class="note y">
    <p><strong>Sourcing.</strong> The course syllabus named what this week must cover and carried no teaching body, so this week's text is written against the standards its own outcomes name: the Philippine Anti-Money Laundering Act, Republic Act No. 9160 as amended, together with the Bangko Sentral ng Pilipinas circulars and memoranda on the National Retail Payment System and on the ML/TF Risk Assessment System; the United States Customer Identification Program and the suspicious-activity reporting rules at 31 CFR 1020.220 and 1020.320; and the bank-management textbooks already on this course's reading list. Every fact group in the lessons and the lab rests on one of those documents, and the ones that rest on none of them were left out.</p>
  </div>
```

Leave a single blank line between the surrounding blocks so the file stays well-formed.

- [ ] **Step 3: Rebuild (green)**

Run from the workspace root:

```
python "D:\Python\lesson-notebook-pipeline\v2\build.py" "build/week10-operations"
```

Expected:
```
OK - wrote G:\...\FM102\Lessons and Question\Week10-Notebook.html (N lines)
OK - wrote G:\...\FM102\Lessons and Question\build\key\Week10-Notebook-key.json
```

- [ ] **Step 4: Confirm the box is gone**

Run: `Select-String -LiteralPath "Week10-Notebook.html" -Pattern 'Sourcing\.|carried no teaching body|written against the standards'`
Expected: no matches.

- [ ] **Step 5: Run the mandatory layout gate**

Run from the workspace root:

```
node "D:\Python\lesson-notebook-pipeline\v2\tools\layout_smoke.js" "Week10-Notebook.html"
node "D:\Python\lesson-notebook-pipeline\v2\tools\layout_smoke.js" "Week10-Notebook.html" --width 390
```

Expected: `LAYOUT OK` for both.

- [ ] **Step 6: Confirm Weeks 5/7/8/9 are unaffected**

Run:

```
Select-String -LiteralPath "Week5-Notebook.html","Week7-Notebook.html","Week8-Notebook.html","Week9-Notebook.html" -Pattern 'Sourcing\.|carried no teaching body|written against the standards'
```

Expected: no matches. (No commit — the workspace is not a git repo.)

---

## Self-Review

**Spec coverage:** §3 rule contract → Task 2 Step 5–8; §4 SKILL.md changes → Task 2; §5 build.py validation → Task 1; §6 remediation → Task 3; §7 tests → Task 1 Step 1 + Task 2 Step 1; §8 files touched → all tasks. No gaps.

**Placeholder scan:** none — every step carries exact code, commands, and expected output.

**Type consistency:** `PROVENANCE_RE`, `check_provenance(sections_text, data_text, errors)`, rule id `"provenance"`, and the string `never inside the notebook` are used identically across tasks and tests.
