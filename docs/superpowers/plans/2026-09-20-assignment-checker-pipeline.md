# Assignment Checker — Plan 1: Pipeline Rubric Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `v2/build.py` that SA items carry `rubric` + `max_points`, allow 2+ SA items per assignment, and ship both into the teacher key file while keeping them out of the student HTML.

**Architecture:** Pure `build.py` validation/key/stripper edits plus pytest coverage and SKILL.md/registry doc updates; no new dependencies, no Worker/SPA work (Plans 2–3).

**Tech Stack:** Python 3.6+ stdlib-only (`v2/build.py`), pytest + `cryptography` (tests), Node (unchanged smoke script, run to confirm green).

## Global Constraints

- `v2/build.py` stays stdlib-only (assembler + validators); dev tests use `pytest`.
- Full suite gate per README: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → 65 green.
- Fixed mix stays exact: mc 10, tf 4, id 4; SA count is variable, minimum 2.
- SA `max_points` is a positive integer (booleans rejected); `rubric` is a non-empty string.
- Answer material (`ans`/`aliases`/`key_points`/`rubric`/`max_points`) never reaches the student HTML; key file is the only carrier.
- Section-agent brief (SKILL.md Part 4C) must tell agents to author `rubric` + `max_points` inside the data object only.

---

### Task 1: Variable SA count + rubric/max_points validation

**Files:**
- Modify: `v2/build.py:567-568` (constants)
- Modify: `v2/build.py:669-720` (`validate_assignment`)
- Test: `tests/test_assignment_contract.py` (extend `v20()` helper + add tests)

**Interfaces:**
- Consumes: `ASSIGN_SIZE`, `ASSIGN_MIX_ORDER` (replaced — see Step 1).
- Produces: `ASSIGN_FIXED = {"mc": 10, "tf": 4, "id": 4}`, `ASSIGN_SA_MIN = 2`; `validate_assignment(data, errors)` signature unchanged, new error messages containing `"rubric"`, `"max_points"`, `"at least 2 sa"`.

- [ ] **Step 1: Find every consumer of the old constants**

Run: `rg -n "ASSIGN_SIZE|ASSIGN_MIX_ORDER" v2 tests docs --glob '!__pycache__'`
Expected: hits only in `v2/build.py` (lines ~567, ~671, ~674, ~714). If any other file references them, that file joins this task's Files list.

- [ ] **Step 2: Write the failing tests**

Append to `tests/test_assignment_contract.py`:

```python
def sa_item(i):
    return {"type": "sa", "prompt": "s%d" % i,
            "key_points": ["contribution margin"],
            "rubric": "2 pts: names direction (1) + cause (1)",
            "max_points": 2}


def test_sa_needs_rubric_and_max_points():
    data = v20()
    data["items"][18] = sa_item(0)
    data["items"][19] = sa_item(1)
    del data["items"][18]["rubric"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("rubric" in e.msg for e in errs)
    data["items"][18] = sa_item(0)
    data["items"][18]["max_points"] = 0
    errs = []
    build.validate_assignment(data, errs)
    assert any("max_points" in e.msg for e in errs)
    data["items"][18]["max_points"] = True
    errs = []
    build.validate_assignment(data, errs)
    assert any("max_points" in e.msg for e in errs)


def test_three_sa_items_validate():
    data = v20()
    data["items"][18] = sa_item(0)
    data["items"][19] = sa_item(1)
    data["items"].append(sa_item(2))
    errs = []
    build.validate_assignment(data, errs)
    assert not errs, [str(e) for e in errs]


def test_one_sa_item_rejected():
    data = v20()
    data["items"][18] = sa_item(0)
    del data["items"][19]
    errs = []
    build.validate_assignment(data, errs)
    assert any("at least 2 sa" in e.msg for e in errs)
```

NOTE: `v20()` as committed builds SA items with only `key_points`, so after
the implementation lands the *unmodified* `v20()` items must FAIL validation
(missing rubric/max_points). That is intentional — see Step 4.

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_contract.py::test_sa_needs_rubric_and_max_points tests/test_assignment_contract.py::test_three_sa_items_validate tests/test_assignment_contract.py::test_one_sa_item_rejected -v`
Expected: FAIL — `validate_assignment` knows nothing of `rubric`/`max_points` and rejects the 21-item mix.

- [ ] **Step 4: Implement — constants + validation in `v2/build.py`**

Replace lines 567–568:

```python
ASSIGN_FIXED = {"mc": 10, "tf": 4, "id": 4}
ASSIGN_SA_MIN = 2
```

Replace the size/mix block (old lines 670–720) with:

```python
    items = (data or {}).get("items") or []
    n_sa = sum(1 for it in items if it.get("type") == "sa")
    if n_sa < ASSIGN_SA_MIN:
        errors.append(Err("assign", "data.js", None,
                          "assignment needs at least %d sa items, found %d"
                          % (ASSIGN_SA_MIN, n_sa),
                          "author 2 or more situational short-answer items"))
        return
    if len(items) != sum(ASSIGN_FIXED.values()) + n_sa:
        errors.append(Err("assign", "data.js", None,
                          "assignment needs exactly %d fixed items + %d sa, found %d total"
                          % (sum(ASSIGN_FIXED.values()), n_sa, len(items)),
                          "author 10 mc, 4 tf, 4 id, and 2 or more sa"))
        return
```

Keep the per-item loop, but require exact fixed counts and add SA checks —
inside the `elif t == "sa":` branch after the existing `key_points` check:

```python
            rb = it.get("rubric")
            if not isinstance(rb, str) or not rb.strip():
                errors.append(Err("assign", "data.js", None,
                                  "sa item %d needs a non-empty rubric string" % n,
                                  "rubric = the scoring criteria shipped to the key file"))
            mp = it.get("max_points")
            if not isinstance(mp, int) or isinstance(mp, bool) or mp <= 0:
                errors.append(Err("assign", "data.js", None,
                                  "sa item %d needs a positive integer max_points" % n,
                                  "max_points = the SA item's point ceiling"))
```

And replace the trailing mix loop with an exact-count check over fixed types:

```python
    for t, want in sorted(ASSIGN_FIXED.items()):
        got = counts.get(t, 0)
        if got != want:
            errors.append(Err("assign", "data.js", None,
                              "type mix has %d %s, expected exactly %d"
                              % (got, t, want),
                              "author 10 mc, 4 tf, 4 id, and 2 or more sa"))
```

Then update the committed `v20()` helper in `tests/test_assignment_contract.py`
so the *valid* fixture carries the new fields:

```python
    items += [{"type": "sa", "prompt": "s%d" % j,
               "key_points": ["contribution margin"],
               "rubric": "2 pts: names direction (1) + cause (1)",
               "max_points": 2} for j in range(2)]
```

And fix the pre-existing `test_bad_mix_named`, which the new total-first
validation would otherwise break (flipping mc→sa yields 20 items with 3 sa,
so the total-check fires without any "expected 10" text). Replace its body
with an id→mc flip that keeps the total valid:

```python
def test_bad_mix_named(tmp_path):
    errs = []
    data = v20()
    data["items"][14]["type"] = "mc"
    del data["items"][14]["aliases"]
    build.validate_assignment(data, errs)
    assert any(e.rule == "assign" and "expected exactly 4" in e.msg
               for e in errs)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_assignment_contract.py -v`
Expected: PASS (every test in the file, including the pre-existing mix/field/extract/sanitize tests).

- [ ] **Step 6: Commit**

```bash
git add v2/build.py tests/test_assignment_contract.py
git commit -m "feat(assignment): rubric + max_points validation, 2+ SA items"
```

### Task 2: Ship rubric/max_points in the teacher key file

**Files:**
- Modify: `v2/build.py:723-745` (`write_key_file`)
- Test: `tests/test_assignment_contract.py::test_valid_mix_and_key_file` (extend)

**Interfaces:**
- Consumes: Task 1's validated SA items (with `rubric: str`, `max_points: int`).
- Produces: key-file SA rows shaped `{"n", "type", "prompt", "key_points", "rubric", "max_points"}` — the exact shape the checker SPA (Plan 3) and Worker (Plan 2) will consume.

- [ ] **Step 1: Write the failing test**

Extend `test_valid_mix_and_key_file` with these asserts before the `"decrypt.py"` line:

```python
    assert body["items"][18]["rubric"].startswith("2 pts")
    assert body["items"][18]["max_points"] == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_assignment_contract.py::test_valid_mix_and_key_file -v`
Expected: FAIL with `KeyError: 'rubric'`.

- [ ] **Step 3: Write minimal implementation**

In `write_key_file`, replace the `else:` (SA) branch:

```python
        else:
            row.update(key_points=it["key_points"], rubric=it["rubric"],
                       max_points=it["max_points"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_assignment_contract.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add v2/build.py tests/test_assignment_contract.py
git commit -m "feat(assignment): key file carries SA rubric + max_points"
```

### Task 3: Prove rubric/max_points never leak to student HTML

**Files:**
- Test: `tests/test_assignment_contract.py::test_sanitize_assignment_data_strips_answer_material` (extend; no production change — `sanitize_assignment_data` allowlists `{"type", "prompt", "choices"}` by construction)

**Interfaces:**
- Consumes: Task 1's `v20()` (SA items now carry `rubric`/`max_points`).
- Produces: regression proof the checker can trust — student HTML holds zero AI-grading material.

- [ ] **Step 1: Write the failing test**

In `test_sanitize_assignment_data_strips_answer_material`, extend line 120–122's asserts:

```python
        assert set(it) <= {"type", "prompt", "choices"}
        assert "ans" not in it and "aliases" not in it and "key_points" not in it
        assert "rubric" not in it and "max_points" not in it
```

and after line 122 add:

```python
    assert "rubric" not in out and "max_points" not in out
```

- [ ] **Step 2: Run test to verify it passes as-is**

Run: `python -m pytest tests/test_assignment_contract.py::test_sanitize_assignment_data_strips_answer_material -v`
Expected: PASS on the first run (allowlist already drops the new fields) — this task locks the guarantee in, no `v2/build.py` change.

- [ ] **Step 3: Commit**

```bash
git add tests/test_assignment_contract.py
git commit -m "test(assignment): rubric + max_points stripped from student HTML"
```

### Task 4: Docs + smoke gate (SKILL.md, registry, full suite)

**Files:**
- Modify: `v2/SKILL.md` (v2.5 assignment paragraph ~lines 47–63; §2.3 ~line 254; brief template ~lines 384–388)
- Modify: `v2/skeleton/components/registry.md` (assignment row schema)
- Test: full README suite + `node v2/tools/assignment_smoke.js` (run-only gates)

**Interfaces:**
- Consumes: Tasks 1–3 behavior.
- Produces: agents author the new fields; reviewers know the new QA check.

- [ ] **Step 1: Update `v2/SKILL.md` (three precise edits)**

Edit A — v2.5 paragraph: after "`aliases` / `key_points` fields" add
"`rubric` / `max_points` (per-SA scoring criteria + point ceiling, 2 or more
SA items per assignment)". Edit B — §2.3: "the assignment always carries its
full 20 items" → "the assignment always carries its full set (18 fixed + 2 or
more sa)". Edit C — brief template SA bullet: after "`key_points` for sa"
add ", plus `rubric` (string) and `max_points` (positive integer)".

- [ ] **Step 2: Update `v2/skeleton/components/registry.md` assignment row**

Change the data schema cell to append: "SA items also carry
`rubric` (string) + `max_points` (positive int); 2+ SA items allowed."

- [ ] **Step 3: Run the full gates**

Run: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"`
Expected: 65 green.
Run: `node v2/tools/assignment_smoke.js` (from repo root)
Expected: `SMOKE OK`.

- [ ] **Step 4: Commit**

```bash
git add v2/SKILL.md v2/skeleton/components/registry.md
git commit -m "docs(assignment): SA rubric + max_points authoring contract"
```
