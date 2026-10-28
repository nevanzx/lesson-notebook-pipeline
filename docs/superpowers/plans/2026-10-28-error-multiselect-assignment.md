# Error-checking + multi-select assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `error` assignment mode (12 error-check + 8 multi-select items) as the pipeline default, with build validation, notebook rendering, checker scoring, exports, docs, and tests.

**Architecture:** `build.py` validates and sanitizes a new `mode: "error"` object; the shared `assignment` component renders two new slide types; the checker adds two objective scorers and two export columns. Existing `flat`, `dag`, and `graph` paths are untouched except where the default mode name is resolved.

**Tech Stack:** Python 3 stdlib (`build.py`, pytest), browser ES modules + Node test runner (checker), vanilla JS component + Node smoke harness.

## Global Constraints

- Student HTML must never carry `ans`; only `build/key/*-key.json` may.
- No hex colours, external URLs, or structural CSS in components.
- Every deck is 12 `err` + 8 `multi`, 20 items total, no SA.
- Error choices are verbatim whole-word spans, each appearing exactly once.
- Multi choices are 4–8, with 2+ correct and never all.
- Length-cue caps: correct unique-longest in >4/12 `err` fails; correct-set mean length dominance in >4/8 `multi` fails.
- Default `build.json` assignment mode is `"error"`; existing modes stay opt-in.

---

### Task 1: Build validation, sanitization, key, and default mode

**Files:**
- Modify: `v2/build.py` (constants near line 1059; `sanitize_assignment_data` ~1277; `validate_assignment` ~1348; new `_validate_assignment_error`; `validate_assign_cfg` ~1840; `write_key_file` ~1898; `assemble` ~2117)
- Test: `tests/test_assignment_error.py` (create)

**Interfaces:**
- Consumes: `Err`, `_wc`, existing `validate_assignment(data, errors, expected_mode=None, dag_cfg=None)`.
- Produces: `_validate_assignment_error(data, errors)`; `data_mode` accepts `"error"`; `build.json` default `"error"`.

- [ ] **Step 1: Write failing tests**

```python
import json
import build


def _err(i, statement, choices, ans):
    return {"type": "err", "statement": statement, "choices": choices, "ans": ans}


def _multi(i, prompt, choices, ans):
    return {"type": "multi", "prompt": prompt, "choices": choices, "ans": ans}


def _deck():
    items = []
    stmt = "Alpha rises while beta falls because gamma is constant."
    choices = ["Alpha rises", "beta falls", "because gamma is constant", "is constant"]
    ans_cycle = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]
    for i in range(12):
        items.append(_err(i, stmt, choices, ans_cycle[i]))
    for i in range(8):
        items.append(_multi(i, "Select all types.", ["A", "B", "C", "D"], [0, 1]))
    return {"mode": "error", "intro": "i", "items": items}


def test_error_deck_validates():
    errs = []
    build.validate_assignment(_deck(), errs, expected_mode="error")
    assert not errs, [str(e) for e in errs]


def test_error_deck_counts():
    data = _deck()
    data["items"].pop()
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("12 err" in e.msg or "8 multi" in e.msg for e in errs)


def test_err_choices_must_be_verbatim_and_unique_in_statement():
    data = _deck()
    data["items"][0]["choices"] = ["Alpha", "rises", "beta", "gamma"]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("verbatim" in e.msg for e in errs)


def test_multi_ans_bounds():
    data = _deck()
    data["items"][12]["ans"] = [0]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("ans" in e.msg for e in errs)
    data = _deck()
    data["items"][12]["ans"] = [0, 1, 2, 3]
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("ans" in e.msg for e in errs)


def test_longest_cap():
    data = _deck()
    for i in range(5):
        data["items"][i]["choices"] = ["Alpha", "rises", "beta", "falls now"]
        data["items"][i]["ans"] = 3
        data["items"][i]["statement"] = "Alpha rises while beta falls now."
    errs = []
    build.validate_assignment(data, errs, expected_mode="error")
    assert any("longest" in e.msg for e in errs)


def test_sanitize_strips_ans():
    data = _deck()
    text = "LN.data.x = " + json.dumps(data) + ";"
    out = build.sanitize_assignment_data(text, "x", data)
    obj = json.loads(out.split("LN.data.x = ", 1)[1].rstrip(";"))
    assert "ans" not in json.dumps(obj)
    assert obj["items"][0]["statement"]
    assert obj["items"][12]["prompt"]


def test_default_config_mode_is_error():
    errs = []
    build.validate_assign_cfg({"components": ["assignment"]}, errs)
    assert not errs, [str(e) for e in errs]
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/test_assignment_error.py -q`
Expected: FAIL with unknown mode / missing validator.

- [ ] **Step 3: Add constants and validator**

```python
ASSIGN_ERROR_ERR = 12
ASSIGN_ERROR_MULTI = 8
ASSIGN_ERROR_MAX_POS = 4
ASSIGN_ERROR_MAX_LONGEST = 4
ASSIGN_ERROR_MIN_LONG_SPANS = 3
ASSIGN_ERROR_MAX_CHOICES = 8
```

Implement `_validate_assignment_error` with exact counts, verbatim span checking
(`re.escape` + whole-word lookarounds, whitespace-normalized), `ans` bounds,
position cap, long-span floor, and both length-cue caps.

- [ ] **Step 4: Wire mode through**

- `validate_assignment`: accept `"error"`; call the new validator.
- `sanitize_assignment_data`: add the `"error"` branch keeping
  `{type, statement, prompt, choices}`.
- `validate_assign_cfg`: default `"error"`; accept all four modes; require the
  component for `error`.
- `write_key_file`: add the `"error"` branch with `body["mode"] = "error"` and
  rows carrying `n`, `type`, `prompt`, `choices`, `ans`, plus `statement`.
- `assemble`: `expected_mode=cfg.get("assignment", "error")`.

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_assignment_error.py -q`
Expected: PASS.

---

### Task 2: Notebook rendering and smoke

**Files:**
- Modify: `v2/skeleton/components/assignment/component.js` (`answered` ~12; `render` ~122; submit ~668)
- Modify: `v2/skeleton/components/assignment/component.css`
- Modify: `v2/tools/assignment_smoke.js`
- Test: `v2/tools/assignment_smoke.js`

**Interfaces:**
- Consumes: sanitized `mode: "error"` items.
- Produces: `err` radio slides, `multi` checkbox slides, export rows with
  `statement` and array answers.

- [ ] **Step 1: Update `answered`**

```js
function answered(it, a) {
  if (a === null || a === undefined) return false;
  if (it.type === "multi") return Array.isArray(a) && a.length > 0;
  if (it.type === "id" || it.type === "sa") return String(a).trim() !== "";
  return true;
}
```

- [ ] **Step 2: Render the two slide types**

In the non-DAG item loop:

```js
if (it.type === "err") {
  s.appendChild(LN.h("div", { class: "lna-stmt", text: it.statement }));
  s.appendChild(LN.h("div", { class: "lna-q",
    text: "Q" + (i + 1) + " - Which part of the statement makes it false?" }));
  (it.choices || []).forEach(function (c) {
    var r = LN.h("input", { type: "radio", name: "a" + i });
    r.addEventListener("click", function () { state.answers[i] = c; bump(); });
    s.appendChild(LN.h("label", { class: "lna-opt" }, [r, LN.h("span", { text: c })]));
  });
} else if (it.type === "multi") {
  s.appendChild(LN.h("div", { class: "lna-q",
    text: "Q" + (i + 1) + " - " + it.prompt }));
  var boxes = [];
  (it.choices || []).forEach(function (c) {
    var r = LN.h("input", { type: "checkbox", name: "a" + i });
    boxes.push({ input: r, text: c });
    r.addEventListener("click", function () {
      state.answers[i] = boxes.filter(function (b) { return b.input.checked; })
        .map(function (b) { return b.text; });
      bump();
    });
    s.appendChild(LN.h("label", { class: "lna-opt" }, [r, LN.h("span", { text: c })]));
  });
}
```

- [ ] **Step 3: Fix progress and export**

- Progress dots test `answered(items[j], state.answers[j])`.
- Submit row adds `statement: items[i].statement` for `err`; `answer` already
  carries text or array.
- Intro fallback for `isError`.

- [ ] **Step 4: Add CSS**

```css
.lna-stmt{border:1px solid var(--grid-strong);border-left:4px solid var(--accent);
  border-radius:10px;background:var(--surface-2);padding:14px;margin:0 0 12px;
  font:15px/1.6 var(--sans);color:var(--ink);min-width:0;overflow-wrap:anywhere}
.lna-opt input[type="checkbox"]{width:16px;height:16px}
```

- [ ] **Step 5: Extend the smoke walk**

Add one `err` and one `multi` item; assert Next enables after a radio click and
after one checkbox click; assert unchecking all disables Next; assert the export
body has `statement` and an array `answer`.

- [ ] **Step 6: Run smoke**

Run: `node v2/tools/assignment_smoke.js`
Expected: exit 0.

---

### Task 3: Checker scoring, display, and export

**Files:**
- Modify: `checker/app/lib/format.js`
- Modify: `checker/app/lib/score.js`
- Modify: `checker/app/app.js`
- Modify: `checker/app/lib/export-book.js`
- Test: `checker/app/test/score.test.js`, `checker/app/test/export-book.test.js`

**Interfaces:**
- Consumes: key rows `{n,type:"err",statement,choices,ans}` and
  `{n,type:"multi",prompt,choices,ans}`.
- Produces: `multiCorrect(answer, ans, choices)`; score fields `err`, `multi`;
  export columns `ERR`, `MULTI`.

- [ ] **Step 1: Add the set matcher**

```js
export function multiCorrect(answer, ans, choices) {
  const picked = Array.isArray(answer) ? answer : [];
  const want = (Array.isArray(ans) ? ans : [])
    .map((i) => (typeof i === "number" ? choices[i] : i))
    .map(normalize).sort();
  const got = picked
    .map((v) => (typeof v === "number" ? choices[v] : v))
    .map(normalize).filter(Boolean).sort();
  return want.length > 0 && got.length === want.length &&
    want.every((w, i) => w === got[i]);
}
```

- [ ] **Step 2: Score both types**

In `scoreNonAI`, add `let err = 0, multi = 0;` and branches:

```js
} else if (k.type === "err") {
  const ok = given !== undefined && mcCorrect(given, k.ans, k.choices);
  if (ok) err++;
  perQ.push({ n: k.n, type: "err", correct: ok, points: ok ? 1 : 0 });
} else if (k.type === "multi") {
  const ok = given !== undefined && multiCorrect(given, k.ans, k.choices);
  if (ok) multi++;
  perQ.push({ n: k.n, type: "multi", correct: ok, points: ok ? 1 : 0 });
}
```

Return `{ perQ, mc, tf, id, err, multi, totalNonAI: mc+tf+id+err+multi, saItems }`.

- [ ] **Step 3: Carry `mode` and counts in the app**

- `assignment.mode = keyJson.mode === "dag" ? "dag" :
  (keyJson.mode === "error" ? "error" : "flat")`.
- Scored rows carry `err: r.err, multi: r.multi`.
- `renderResults`: error deck header `Name · ERR · MULTI · Total (non-AI)`.
- Export map carries `mode: a.mode` and `err`/`multi`.

- [ ] **Step 4: Export columns**

In `buildWorkbookData`, add:

```js
if (p.mode === "dag") { ... }
else if (p.mode === "error") {
  head.push(`${p.tag} ERR`, `${p.tag} MULTI`);
} else { ...existing... }
```

and the matching cell writer for matched and unmatched rows.

- [ ] **Step 5: Tests and run**

Add score tests for exact set, order, extra pick, missing pick, empty; add an
export test expecting
`["Name","ID","W1 ERR","W1 MULTI","W1 Total","Time Submitted","GrandTotal","Status"]`.

Run: `node --test checker/app/test/`
Expected: PASS.

---

### Task 4: Authoring law and docs

**Files:**
- Create: `v2/skeleton/error-craft.md`
- Modify: `v2/SKILL.md`, `v2/skeleton/components/registry.md`,
  `v2/skeleton/components/assignment/README.md`,
  `v2/skeleton/question-craft.md`, `v2/skeleton/dag-craft.md` (cross-reference)

- [ ] **Step 1: Write `error-craft.md`**

Cover the one-error rule, verbatim span rule, span-size mix, no habitual
longest answer, multi-select prompt targets, 4–8 options, 2+ correct/never all,
MILO coverage, and the length-cue caps.

- [ ] **Step 2: Update the skill**

- v2.33 changelog entry.
- Section 7 table: default error mode with 12 err + 8 multi.
- Inputs table: default assessment = error.
- Replace the old DAG-default prose with error-default prose; state that old
  implicit-DAG lessons must pin `"assignment": "dag"`.
- Point Section 7 authoring at `error-craft.md`.

- [ ] **Step 3: Update registry and README**

Add the `error` data shape to the assignment row; document the two new item
types, checkbox rendering, and the export fields.

---

### Task 5: Full verification

- [ ] **Step 1: Python suite**

Run: `python -m pytest tests/ -q`
Expected: PASS.

- [ ] **Step 2: Checker suite**

Run from `checker/app`: `npm test` (or `node --test test/`)
Expected: PASS.

- [ ] **Step 3: Smoke**

Run: `node v2/tools/assignment_smoke.js`
Expected: exit 0.

- [ ] **Step 4: Build a sample error deck**

Create a temporary workdir with `components:["assignment"]`, `week`, `subject`,
and a valid deck; run `python v2/build.py <workdir>`.
Expected: OK; the output has no `"ans"`; the key has `mode:"error"`.

---

## Self-Review

- Spec §3 data model → Tasks 1, 2, 3.
- Spec §4 validation and length caps → Task 1.
- Spec §5 component → Task 2.
- Spec §6 checker → Task 3.
- Spec §7 default/migration → Tasks 1, 4.
- Spec §8 docs → Task 4.
- Spec §9 tests → Tasks 1, 2, 3, 5.
- Spec §10 acceptance → Task 5.
