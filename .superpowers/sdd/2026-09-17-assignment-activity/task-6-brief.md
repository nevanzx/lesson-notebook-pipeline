### Task 6: Activity labels — `data-activity` convention + shell wrapper

**Files:**
- Modify: `v2/skeleton/shell.html` (CSS for `.ln-act-tag`; `LN._initOne` wrap logic)
- Modify: `v2/sample/lesson-demo/sections.html` (the sample is monolith-style: add `data-activity="class discussion"` to the sort-statement, comparison-table, and step-solver mounts)
- Create: `tests/test_activity_labels.py`

**Interfaces:**
- Produces: mounts carrying `data-activity="<label>"` render with a preceding `Activity — <label>` tag; `"none"` opts out (assignment self-labels).

- [ ] **Step 1: Write the failing test** — `tests/test_activity_labels.py`:

```python
import re
from pathlib import Path


def test_shell_carries_wrapper():
    shell = Path("v2/skeleton/shell.html").read_text(encoding="utf-8")
    assert "ln-act-tag" in shell and "data-activity" in shell


def test_sample_mounts_labelled():
    sec = Path("v2/sample/lesson-demo/sections.html").read_text(encoding="utf-8")
    hits = len(re.findall(r'data-activity="class discussion"', sec))
    assert hits >= 3, hits
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_activity_labels.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement**

1. `v2/skeleton/shell.html` — CSS after `.chip`:

```css
.ln-act-tag{display:block;font:700 10.5px/1 var(--mono);letter-spacing:.12em;
  text-transform:uppercase;color:var(--accent-deep);
  border-bottom:1px dashed var(--grid-strong);padding-bottom:4px;margin:18px 0 2px}
.ln-act-wrap{margin:18px 0}
```

2. Final `LN._initOne` (wrap-safe across resetAll):

```js
  LN._initOne = function (m) {
    try {
      m.el.innerHTML = "";
      var lbl = (m.el.getAttribute && m.el.getAttribute("data-activity")) || "";
      if (lbl && lbl !== "none" && !m.holder) {
        m.holder = LN.h("div", { class: "ln-act-wrap" });
        m.el.parentNode.replaceChild(m.holder, m.el);
      }
      if (m.holder) {
        m.holder.innerHTML = "";
        m.holder.appendChild(LN.h("span", { class: "ln-act-tag",
          text: "Activity — " + lbl }));
        m.holder.appendChild(m.el);
      }
      m.C.init(m.el, LN.data[m.key]);
    } catch (e) {
      LN.banner("component " + m.name + " failed: " + (e && e.message));
    }
  };
```

(The assignment components' mounts in section agents' parts get `data-activity="none"` via the skill contract; sample: the assignment mount in Task 8 carries no attribute change — its own card handles the label.)

3. `v2/sample/lesson-demo/sections.html`: add `data-activity="class discussion"` to the `sort-statement` mount, the `comparison-table` mount, and the `step-solver` mount(s).

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_activity_labels.py -q`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `python -m pytest tests -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add v2/skeleton/shell.html v2/sample/lesson-demo tests/
git commit -m "feat(v2.5): data-activity labels — 'Activity — class discussion' tag via shell wrapper"
```

---

