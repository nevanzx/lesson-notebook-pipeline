# Question Harness (v2.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define and enforce the craft rules that make the graded Section 7 assignment situational, challenging, and fair — per-type difficulty (mc easy · tf hard · id medium · sa analysis), ±1-word MC choices, blueprint coverage — plus student-facing wrong-pick reasoning for activity components.

**Architecture:** A new authoring spec `v2/skeleton/question-craft.md` carries the doctrine; `v2/build.py`'s existing `validate_assignment` gains the two countable checks; `v2/SKILL.md` bumps to 2.6 and wires the spec into the section-agent brief, Part 5 QA, and a §9.1 carve-out; `sort-statement` and `case-match` gain an optional per-item `e` field rendered on wrong picks, verified by a new node smoke tool.

**Tech Stack:** Python 3.13 + pytest (validator, tests), Node (smoke tool, no deps), Markdown (skill/spec files).

**Spec:** `docs/superpowers/specs/2026-09-20-question-harness-design.md`

## Global Constraints

- Assignment item mix: exactly 10 mc · 4 tf · 4 id · 2+ sa (constant `ASSIGN_FIXED = {"mc": 10, "tf": 4, "id": 4}`, `ASSIGN_SA_MIN = 2` at `v2/build.py:608-609`).
- MC choices: exactly 4, all within **±1 word** (word = whitespace-delimited token).
- TF answers: never all-true or all-false across the 4.
- Teacher key schema unchanged (no `why_wrong`/difficulty metadata on assignment items).
- Assembled `.html` outputs are read-only products — fix parts/data, rebuild.
- No hex colours, no URLs, no `@import` in shipped content (existing build rules still apply to anything added).
- `node tools/assignment_smoke.js` must still print `SMOKE OK` (assignment component untouched).
- `python build.py sample/lesson-demo` from `v2/` must print `OK` after every task (build it in a temp dir; never commit generated `.html`).
- Run the test suite from the repo root: `python -m pytest tests -q`. **Known pre-existing baseline: 36 failed / 79 passed** — `test_shards`, `test_e2e_fanout`, `test_themes_matrix` fail on master because they expect unlanded features (`build.lint_shard`, pack-name change); verified pre-existing at 64f1ef6. Gate = "exactly 36 failed, none in harness-touched files", not "all pass".

---

### Task 1: Create `question-craft.md` (the authoring spec)

**Files:**
- Create: `v2/skeleton/question-craft.md`

**Interfaces:**
- Produces: `v2/skeleton/question-craft.md` — referenced by name in Task 3's SKILL.md edits and Task 4's README notes.

- [ ] **Step 1: Write the file with exactly this content**

```markdown
# Question craft — the graded assignment

Governs the Section 7 `assignment` items only. In-section activities have their
own (lighter) rules at the bottom. The invention ban in SKILL.md §9.1 is a
**lesson-body rule**: assignment situations may invent actors, numbers, and
twists freely — *a new situation is allowed, a hidden dependency is not.*

## The three words

**Situational.** Every stem places the student in a scene: someone proposes,
misreads, decides, or asks "what happens if." An item answerable by lifting one
sentence from the notebook prose fails the **copy test** — rejected. "Define X"
is never an item.

**Challenging** — by type, never by trickery:

| Type | Count | Difficulty | Craft rules |
|---|---|---|---|
| mc | 10 | easy | one taught concept, fresh situation; distractors are believable student slips (right formula wrong input, direction flip, unit confusion), not obscure trivia; **all four choices within ±1 word of each other** (enforced); no answer position used more than 4× across the ten; never "all of the above" |
| tf | 4 | hard | single-flip near-misses: the statement reads true until exactly one mutated element breaks it; never all-true or all-false across the four (enforced); balance follows the traps, not a quota |
| id | 4 | medium | the stem IS a mini-scenario; the student names the term the situation calls for; `aliases` generous enough that a correct student cannot be stranded |
| sa | 2+ | analysis | defend / combine / explain-a-verdict; `key_points` are facts the notebook teaches; `rubric` sums exactly to `max_points` |

**Fair.**

- Every concept needed to solve an item was taught somewhere (prose, activity
  explanation, or glossary); every fact or number needed sits **inside the
  stem** — ≤60 words, no "refer back to Section 3."
- Exactly one defensible answer per item — no MC distractor a careful student
  could argue for.
- Every invented mc/tf/id answer is **recomputed independently in QA**
  (assignment extension of §9.2): a wrong key, unlike wrong prose, is invisible
  to students.

## The blueprint (before any item)

List the MILOs and map each to the items covering it. Author only then.
QA rejects: any MILO with <2 items, or any single MILO holding >30% of the deck.
Record the mapping in your build notes — it is authoring scaffolding, never
shipped student data.

## Activities (in-section, not graded)

Activities stay **easy→medium** — the hard tier is the assignment's job.
Where a component renders reasoning, the wrong-pick feedback must name the
slip: `true-false`'s `e` field is the model; `sort-statement` and `case-match`
accept an optional per-item `e` shown on a wrong pick. Authoring may mark
item difficulty with an optional `d: "easy" | "medium"` field; components
ignore it, QA reads it — an activity item never exceeds medium.
```

- [ ] **Step 2: Verify**

Run: `python -c "t=open('v2/skeleton/question-craft.md',encoding='utf-8').read(); assert 'copy test' in t and '±1 word' in t and 'blueprint' in t and len(t) > 1500; print('OK')"`
(from repo root) Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add v2/skeleton/question-craft.md
git commit -m "docs(skill): question-craft spec for the graded assignment (v2.6 harness)"
```

---

### Task 2: build.py mechanical checks + recraft the sample demo

Adds the two countable checks to the existing `validate_assignment`
(`v2/build.py:710-778`) — composition, choice count, `ans` index, `aliases`,
`rubric`/`max_points` are **already enforced there; do not re-implement them**.
The demo sample violates the new word-uniformity rule, so this task also
recrafts its 10 MC items (items 1,2,3,5,6,7,8 change; 4,9,10 already pass).

**Files:**
- Modify: `v2/build.py:732-741` (mc branch) and after the item loop (~line 771)
- Modify: `tests/test_assignment_contract.py` (new tests at end)
- Modify: `tests/test_assignment_deck.py:29` (fixture tf must vary)
- Modify: `v2/sample/lesson-demo/data.js` (mc item choices)

**Interfaces:**
- Consumes: `Err(rule, file, line, msg, hint)` and `ASSIGN_FIXED` from build.py.
- Produces: `validate_assignment(data, errors)` rejecting non-uniform choices
  and uniform tf blocks; sample demo passing the new rules; used by Task 4's
  full-suite run.

- [ ] **Step 1: Write the failing tests** — append to `tests/test_assignment_contract.py`:

```python
def test_mc_choices_must_be_word_uniform():
    data = v20()
    data["items"][0]["choices"] = ["a", "b", "c", "d one two three"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("word" in e.msg for e in errs)
    data = v20()
    data["items"][0]["choices"] = ["a b c", "b c", "c d", "d e f"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("word" in e.msg for e in errs)
    data["items"][0]["choices"] = ["a b c", "b c", "c", "d e f"]
    errs = []
    build.validate_assignment(data, errs)
    assert not any("word" in e.msg for e in errs)


def test_tf_must_not_be_uniform():
    for flag in (True, False):
        data = v20()
        for j in range(10, 14):
            data["items"][j]["ans"] = flag
        errs = []
        build.validate_assignment(data, errs)
        assert any("all-" in e.msg for e in errs), flag
```

Fix the deck fixture: in `tests/test_assignment_deck.py:29` replace
`"ans": True` with `"ans": i % 2 == 0`.

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest tests/test_assignment_contract.py tests/test_assignment_deck.py -q`
Expected: the two new tests FAIL (`assert any(...)` false); deck test still passes
(its fixture change is compatibility-only).

- [ ] **Step 3: Implement in `validate_assignment`**

In the mc branch, immediately after the existing `ans 0..3` check
(`v2/build.py:737-741`), inside the `if t == "mc":` block:

```python
            wc = [len(str(c).split()) for c in ch]
            if len(ch) == 4 and max(wc) - min(wc) > 1:
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d choices vary by %d words — keep all four "
                                  "within 1 word (question-craft.md)"
                                  % (n, max(wc) - min(wc)),
                                  "trim or pad choices so they match in length"))
```

After the `for n, it in enumerate(items, 1):` loop, before the final type-mix
`for t, want in sorted(ASSIGN_FIXED.items()):` block:

```python
    tf_bool = [it.get("ans") for it in items
               if it.get("type") == "tf" and isinstance(it.get("ans"), bool)]
    if len(tf_bool) == ASSIGN_FIXED["tf"] and len(set(tf_bool)) == 1:
        errors.append(Err("assign", "data.js", None,
                          "tf block is all-%s — single-flip traps need both verdicts"
                          % ("true" if tf_bool[0] else "false"),
                          "author at least one true and one false statement"))
```

- [ ] **Step 4: Recraft the demo MC choices** in `v2/sample/lesson-demo/data.js`
(`LN.data.assign7`, items 1–3 and 5–8). Replace only the `choices` arrays with
these (correct answer keeps its current `ans` index; meaning unchanged):

| item | new `choices` (in order) |
|---|---|
| 1 (ans 1) | `["It falls to about 521 plates", "It rises to exactly 750 plates", "It stays near 563 plates", "It jumps past any reachable count"]` |
| 2 (ans 2) | `["Stays at 562.5 plates", "Rises to exactly 750 plates", "Rises to about 692 plates", "There is no break-even anymore"]` |
| 3 (ans 0) | `["Volume can fall 25% before the cart starts losing money", "25% of the plates sold are always miscounted by staff", "Price can drop 25% per plate with no effect", "Profit equals 25% of the revenue earned each month"]` |
| 5 (ans 1) | `["Raise fixed cost for a bigger cart", "Cut the variable cost per plate", "Promise a far higher expected volume", "Print extra banana-leaf wraps each morning"]` |
| 6 (ans 1) | `["Both stalls carry equal risk because BEPs are equal", "Stall A is riskier — volume sits on its break-even", "Stall B is riskier — more volume, more variable cost", "Risk cannot be discussed at all with these numbers"]` |
| 7 (ans 1) | `["Break-even rises but stays computable", "No volume ever covers fixed cost", "Break-even lands exactly at fixed cost", "Break-even falls at once to zero"]` |
| 8 (ans 1) | `["It breaks even, since the gap is under ten percent", "It loses; each short plate still adds its 80-peso margin", "It profits, because fixed cost is spread out thinner", "The model refuses to judge a month under 600"]` |

Math spot-checks: item 1: 45000/(140−80)=750 ✓; item 2: 45000/(160−95)=692.3 ✓.

- [ ] **Step 5: Run everything green**

Run: `python -m pytest tests -q` → Expected: **36 failed / 79 passed, exactly
the pre-existing baseline** — zero failures in `test_assignment_*` or
`test_e2e_lesson` (e2e builds the sample; it is the first consumer of the demo fix).
If any harness file fails, the count of 36 may still match — compare the FAILED
list, not just the number.
Run: `python build.py sample/lesson-demo` from `v2/` → Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add v2/build.py tests/test_assignment_contract.py tests/test_assignment_deck.py v2/sample/lesson-demo/data.js
git commit -m "feat(build): enforce mc ±1-word choices and tf variety; recraft demo options"
```

---

### Task 3: Wire v2.6 into `v2/SKILL.md`

Doc-only. Six precise edits; keep everything else untouched.

**Files:**
- Modify: `v2/SKILL.md` (lines 3, 14, 82, 222, 389-393, 407-442, 483-488)

**Interfaces:**
- Consumes: `v2/skeleton/question-craft.md` (Task 1).
- Produces: version "2.6" strings checked by no test; the brief line every
  future assignment agent reads.

- [ ] **Step 1: Version + change note.** Line 3: `version: 2.5` → `version: 2.6`.
Line 14 heading: `# Interactive Lesson Notebook (v2.5 — outline-first, one agent per section)` →
`# Interactive Lesson Notebook (v2.6 — outline-first, one agent per section)`.
After the v2.5 paragraph (ends line 68), insert:

```markdown
What v2.6 adds: **the question harness** — `skeleton/question-craft.md` defines
"situational" for the graded assignment (a new situation may be invented; a
hidden dependency may not), sets the per-type difficulty profile
(mc easy · tf hard · id medium · sa analysis), the MILO blueprint rule
(≥2 items per MILO, none >30% of the deck), and the copy test. build.py
enforces the countable subset (MC choices within ±1 word; tf never
all-true/all-false); §9.1's source-only ban is scoped to the lesson body.
```

- [ ] **Step 2: Inputs table (line 82).** Replace the Assessment row's cell text
`Encrypted collect-only assignment — 20 situational items (10 mc · 4 tf · 4 id · 2 sa), marked by the teacher from the decrypted key file`
with
`Encrypted collect-only assignment — 20 situational items (10 mc · 4 tf · 4 id · 2 sa), marked by the teacher from the decrypted key file, authored per \`skeleton/question-craft.md\` (mc easy · tf hard · id medium · sa analysis)`.

- [ ] **Step 3: §2 table row 7 (line 222).** Replace
`| 7 | **Assignment** | 20 situational items (10 mc·4 tf·4 id·2 sa), hidden until begun; no reveal | \`assignment\` |`
with
`| 7 | **Assignment** | 20 situational items per \`skeleton/question-craft.md\` (mc easy·tf hard·id medium·sa analysis), hidden until begun; no reveal | \`assignment\` |`.

- [ ] **Step 4: Part 4-C brief.** In the brief template block, the bullet
starting `- If your section mounts \`assignment\`:` (line 389) gains a new
first sentence before "author correct answers":

```
Read `<skill-dir>/skeleton/question-craft.md` first — it is your authoring law
for every item (situational stems, per-type difficulty, ±1-word MC choices,
single-flip tf, MILO blueprint ≥2 per MILO and none >30%).
```

- [ ] **Step 5: §9.1 carve-out (after line 488's bullet list intro).** Insert
as the first bullet of §9.1:

```markdown
- **Lesson-body scope.** This ban governs the teaching content. The Section 7
  assignment is exempt: situational items may invent actors, numbers, and
  scenarios — their constraint is *answerability*, governed by
  `skeleton/question-craft.md` (every concept needed was taught; every fact
  needed sits in the stem). SA `key_points` remain facts the notebook teaches.
```

- [ ] **Step 6: Part 5 QA.** Extend the **Interactivity semantics** bullet with:

```
Activity items stay easy→medium (the hard tier is the assignment's job):
where a component renders reasoning (true-false `e`; sort-statement and
case-match optional `e`), wrong-pick feedback names the slip.
```

And extend the **Assignment integrity** bullet after the smoke-test sentence with:

```
Then judge every item against `skeleton/question-craft.md`: the copy test (no
stem answerable by lifting a sentence of prose), tf single-flip quality, stems
≤60 words and self-contained, MC answer position used ≤4×, and the blueprint
(every MILO ≥2 items, none >30% of the deck). Recompute every invented item's
answer independently — a wrong key is invisible to students (assignment
extension of §9.2).
```

- [ ] **Step 7: Verify + commit.**

Run: `python -m pytest tests -q` (SKILL.md is not parsed by build; suite must
stay unchanged) → Expected: the baseline 36 failed / 79 passed, no harness-file
failure added.

```bash
git add v2/SKILL.md
git commit -m "docs(skill): v2.6 — question harness wired into brief, QA, and §9.1 carve-out"
```

---

### Task 4: Activity wrong-pick reasoning (`e` field) + smoke tool

**Files:**
- Modify: `v2/skeleton/components/sort-statement/component.js:39-41`
- Modify: `v2/skeleton/components/case-match/component.js:25`
- Create: `v2/tools/activity_smoke.js`
- Modify: `v2/skeleton/components/sort-statement/README.md`, `case-match/README.md`, `registry.md` (schema cells)

**Interfaces:**
- Consumes: components register as `LN.components[name]` with `init(root, d)`.
- Produces: optional `it.e` / `s.e` rendered in wrong-pick feedback (absent `e`
  = byte-identical previous behaviour); `node tools/activity_smoke.js` prints
  `SMOKE OK`.

- [ ] **Step 1: Write the failing smoke tool** — create `v2/tools/activity_smoke.js`:

```javascript
#!/usr/bin/env node
/* Activity reasoning smoke — an optional per-item `e` must surface in the
 * wrong-pick feedback of sort-statement and case-match. Absent `e` must not
 * change behaviour. Exit 0 = both contracts hold. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function El(tag) {
  this.tag = tag; this.children = []; this.listeners = {}; this.attrs = {};
  this.className = ""; this.textContent = ""; this.value = "";
  this.hidden = false; this.disabled = false; this.style = {}; this.offsetWidth = 1;
  var self = this;
  this.classList = {
    add: function (c) { var s = self.className.split(/\s+/).filter(Boolean);
      if (s.indexOf(c) < 0) s.push(c); self.className = s.join(" "); },
    remove: function (c) { self.className = self.className.split(/\s+/)
      .filter(function (x) { return x && x !== c; }).join(" "); },
    contains: function (c) { return self.className.split(/\s+/).indexOf(c) >= 0; }
  };
}
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) {
  return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
};
El.prototype.addEventListener = function (t, f) {
  (this.listeners[t] = this.listeners[t] || []).push(f);
};
El.prototype.fire = function (t) {
  (this.listeners[t] || []).forEach(function (f) { f({ preventDefault: function () {} }); });
};
El.prototype.click = function () { this.fire("click"); if (this.onclickFn) this.onclickFn(); };
Object.defineProperty(El.prototype, "innerHTML", {
  set: function () { this.children = []; },
  get: function () { return ""; }
});
function walk(el, pred, out) {
  out = out || [];
  if (pred(el)) out.push(el);
  el.children.forEach(function (c) { walk(c, pred, out); });
  return out;
}
function h(tag, attrs, kids) {
  var e = new El(tag), k;
  if (attrs) for (k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "text") e.textContent = attrs[k];
    else if (k === "onclick") e.onclickFn = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (kids) kids.forEach(function (c) { if (c) e.appendChild(c); });
  return e;
}
function load(name) {
  const sb = { console: console, LN: { components: {}, h: h } };
  vm.createContext(sb);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "skeleton", "components", name, "component.js"), "utf8"),
    sb, { filename: name + ".js" });
  return sb;
}
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("ok   " + name);
  else { console.log("FAIL " + name + (extra ? " — " + extra : "")); failures++; }
}

/* sort-statement: wrong pick must append it.e */
{
  const sb = load("sort-statement");
  const root = new El("div");
  sb.LN.components["sort-statement"].init(root, {
    left: "Fixed", right: "Variable",
    items: [{ t: "Rent for the shop", a: "left", e: "Rent never moves with volume." }]
  });
  const wrong = walk(root, function (e) {
    return e.tag === "button" && e.textContent === "Variable";
  })[0];
  check("sort: wrong-bucket button found", !!wrong);
  if (wrong) {
    wrong.click();
    const fbs = walk(root, function (e) {
      return (e.className || "").indexOf("fb") >= 0 && e.textContent.length > 0;
    });
    const hit = fbs.some(function (f) {
      return f.textContent.indexOf("Rent never moves with volume.") >= 0;
    });
    check("sort: wrong pick shows the e reason", hit,
      "fb texts=" + JSON.stringify(fbs.map(function (f) { return f.textContent; })));
  }
}
/* case-match: wrong pick must append s.e */
{
  const sb = load("case-match");
  const root = new El("div");
  sb.LN.components["case-match"].init(root, {
    concepts: ["Moral hazard", "Adverse selection"],
    scenarios: [{ text: "A driver parks less carefully after insuring.",
                  answer: "Moral hazard", e: "Behaviour changes only after the deal closes." }]
  });
  const sel = walk(root, function (e) { return e.tag === "select"; })[0];
  check("case: select found", !!sel);
  if (sel) {
    sel.value = "Adverse selection";
    sel.fire("change");
    const fb = walk(root, function (e) {
      return (e.className || "").indexOf("mt-fb") >= 0;
    })[0];
    check("case: wrong pick shows the e reason",
      !!fb && fb.textContent.indexOf("after the deal closes") >= 0,
      "fb=" + (fb && fb.textContent));
    sel.value = "Moral hazard";
    sel.fire("change");
    check("case: correct pick still locks",
      !!fb && fb.textContent === "Correct" && sel.disabled === true);
  }
}
if (failures) { console.log("SMOKE FAIL — " + failures + " check(s) failed."); process.exit(1); }
console.log("SMOKE OK — wrong-pick reasoning surfaces in both components.");
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tools/activity_smoke.js` from `v2/`
Expected: `FAIL sort: wrong pick shows the e reason` and
`FAIL case: wrong pick shows the e reason`, exit 1.

- [ ] **Step 3: Implement the two one-line component changes**

`sort-statement/component.js` — replace lines 39-41

```javascript
            fb.className = "fb show " + (ok ? "ok" : "no");
            fb.textContent = (ok ? "Correct. " : "Not quite \u2014 the dashed outline marks the right bucket. ")
              + done + " of " + total + " answered.";
```

with

```javascript
            fb.className = "fb show " + (ok ? "ok" : "no");
            fb.textContent = (ok ? "Correct. " : "Not quite \u2014 the dashed outline marks the right bucket. ")
              + (ok || !it.e ? "" : it.e + " ")
              + done + " of " + total + " answered.";
```

`case-match/component.js` — replace line 25

```javascript
          fb.textContent = "Not quite \u2014 try again";
```

with

```javascript
          fb.textContent = "Not quite \u2014 try again" + (s.e ? ": " + s.e : "");
```

- [ ] **Step 4: Verify**

Run: `node tools/activity_smoke.js` from `v2/` → Expected: `SMOKE OK — wrong-pick reasoning surfaces in both components.`
Run: `node tools/assignment_smoke.js` from `v2/` → Expected: `SMOKE OK`
Run: `python -m pytest tests -q` → Expected: baseline 36 failed / 79 passed,
no new failures (none in harness files)
Run: `python build.py sample/lesson-demo` in a temp dir → Expected: `OK`

- [ ] **Step 5: Document the optional field.**

- `sort-statement/README.md`: in the data block, add `e` to one item
  (`{ t: "Gas for deliveries", a: "right", e: "Gas rises with every added trip." }`)
  and append the line:
  `Optional per-item \`e\`: shown in the wrong-pick feedback — name the slip, not just the bucket.`
- `case-match/README.md`: add `e` to the example scenario and the line:
  `Optional per-scenario \`e\`: appended to "Not quite — try again" — one clause naming the slip.`
- `registry.md` rows: sort-statement schema `items:[{t, a, e?}]`;
  case-match `scenarios:[{text, answer, e?}]`.

- [ ] **Step 6: Commit**

```bash
git add v2/skeleton/components/sort-statement/component.js v2/skeleton/components/sort-statement/README.md v2/skeleton/components/case-match/component.js v2/skeleton/components/case-match/README.md v2/skeleton/components/registry.md v2/tools/activity_smoke.js
git commit -m "feat(components): optional wrong-pick reasoning for sort/case-match + smoke tool"
```

---

### Task 5: Full verification pass

- [ ] **Step 1:** `python -m pytest tests -q` → baseline 36 failed / 79 passed;
  FAILED list contains only `test_shards` / `test_e2e_fanout` / `test_themes_matrix`
  entries (the pre-existing unlanded-feature set) — no harness file failing.
- [ ] **Step 2:** from `v2/`: `node tools/assignment_smoke.js` → `SMOKE OK`; `node tools/activity_smoke.js` → `SMOKE OK`.
- [ ] **Step 3:** from `v2/`: `python build.py sample/lesson-demo` → `OK`.
- [ ] **Step 4:** Read `v2/SKILL.md` lines touched by Task 3 end-to-end once — the brief, the §9.1 carve-out, and Part 5 must agree with `question-craft.md` word-for-word on the invariants (±1 word, single-flip, ≥2-per-MILO, ≤30%).
- [ ] **Step 5:** If any fix commits land, `git status --short` must be clean at the end; no stray output `.html` committed outside its usual tracked location.
