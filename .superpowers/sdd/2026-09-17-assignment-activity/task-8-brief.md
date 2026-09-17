### Task 8: lesson-demo ships the assignment (E2E)

**Files:**
- Modify: `v2/sample/lesson-demo/build.json`
- Modify: `v2/sample/lesson-demo/outline.json`
- Create: `v2/sample/lesson-demo/parts/70-assignment.sections.html`
- Create: `v2/sample/lesson-demo/parts/70-assignment.data.js`
- Modify: `tests/test_e2e_lesson.py` (add one test)

- [ ] **Step 1: Write the failing test** — append to `tests/test_e2e_lesson.py` (match the module's existing imports — `build`, `REPO`, `Path`, plus `json`, `contextlib`, `io`, `subprocess.skip` not needed):

```python
def test_demo_builds_assignment_and_key(tmp_path, monkeypatch):
    import json as json_
    sk = REPO / "v2" / "sample" / "lesson-demo"
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main([str(sk)])
    assert rc == 0, buf.getvalue()
    html = (tmp_path / "Week4-Demo-Notebook.html").read_text(encoding="utf-8")
    assert "ASSIGNMENT — TO BE SUBMITTED" in html
    assert '"ans"' not in html
    kf = tmp_path / "build" / "key" / "Week4-Demo-Notebook-key.json"
    assert kf.exists()
    body = json.loads(kf.read_text(encoding="utf-8"))
    assert len(body["items"]) == 20 and body["week"] == 4
    assert body["subject"] == "Management Science"
```

(reconcile imports with the file's existing header — add `json`, `io`, `contextlib` at top if absent.)

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_e2e_lesson.py -q`
Expected: FAIL — no assignment in the sample.

- [ ] **Step 3: Write the sample assignment**

`build.json`: add `"assignment"` to `components`; add `"week": 4` and `"subject": "Management Science"`; keep every other key.

`outline.json`: move `"REVIEW QUESTIONS"` from `dropped[]` into a new section entry `{"id": "assignment", "title": "6  Assignment", "from": ["REVIEW QUESTIONS"]}` (verify the current file first; keep every other entry untouched).

`parts/70-assignment.sections.html`:

```html
<section class="block" id="assignment">
<h2>6&nbsp; Assignment</h2>
<div data-component="assignment" data-key="assign7"></div>
</section>
```

`parts/70-assignment.data.js` — 20 items drawn ONLY from the Week 4 slice (the cart lesson: FC 3,500 / P 85 / VC 38 / volume 150 quotes and gate cases), in strict JSON (the extractor parses with `json.loads`). Author the items now — the mix is exactly 10 mc + 4 tf + 4 id + 2 sa, every item situational (near-miss scenarios, not trivia), every mc carrying four labelled options, every id carrying its alias bank, sa carrying two-three key points. Content rules: reuse the slice's own numbers (3,500 / 38 / 85 / 150), no invented parallel businesses, prompts phrased from the source's own example set (tapa cart, quoted rate, market-day costs).

- [ ] **Step 4: Run the e2e suite**

Run: `python -m pytest tests/test_e2e_lesson.py -q`
Expected: PASS including the new test; sample build prints OK twice (HTML + key file).

- [ ] **Step 5: Full suite**

Run: `python -m pytest tests -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add v2/sample/lesson-demo tests/
git commit -m "feat(v2.5): lesson-demo carries the 20-item assignment; e2e asserts build + key file"
```

---

