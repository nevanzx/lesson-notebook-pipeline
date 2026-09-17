### Task 1: build.json `week`/`subject` + `__META__` head injection

**Files:**
- Modify: `v2/build.py` (allowed-keys set ~line 544; required-key loop ~line 539; `MARKERS` line 32; substitution chain ~line 663)
- Modify: `v2/skeleton/shell.html` (head, right after line 7 `<title>`)
- Modify: `tests/test_build.py` `MINI_SHELL` (add `__META__` after `<title>__TITLE__</title>`)
- Create: `tests/test_assignment_meta.py`

**Interfaces:**
- Produces: `<meta name="ln:week" content="…">` + `<meta name="ln:subject" content="…">` exactly once in `<head>` whenever assignment builds run; later tasks read them with `document.querySelector('meta[name="ln:week"]')`.

- [ ] **Step 1: Write the failing tests** — create `tests/test_assignment_meta.py` exactly:

```python
import io
import json
import contextlib
import build
from test_build import make_skel, MINI_SHELL


def build_run(skel, work, cwd, monkeypatch):
    monkeypatch.chdir(cwd)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(work)])
    return rc, buf.getvalue()


def assign_skel(tmp_path):
    skel = make_skel(tmp_path, components=("assignment",))
    cd = skel / "components" / "assignment"
    (cd / "component.js").write_text(
        'LN.components["assignment"]={init:function(root,d){'
        'root.textContent="deck";}};', encoding="utf-8")
    (skel / "shell.html").write_text(
        MINI_SHELL.replace("<title>__TITLE__</title>", "<title>__TITLE__</title>\n__META__"),
        encoding="utf-8")
    return skel


def assign_work(tmp_path, cfg=None):
    w = tmp_path / "w"
    w.mkdir()
    c = {"title": "T", "theme": "mini", "components": ["assignment"],
         "output": "out.html", "week": 4, "subject": "Management Science"}
    c.update(cfg or {})
    (w / "build.json").write_text(json.dumps(c), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="assign"><h2>6 Assignment</h2>'
        '<div data-component="assignment" data-key="assign7"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text(
        'LN.data.assign7 = {"intro":"i","items":'
        + json.dumps(DUMMY) + "};", encoding="utf-8")
    return w


DUMMY = [{"type": "tf", "prompt": "p", "ans": True}]

def DUMMY_items():
    return DUMMY


def test_week_subject_baked_as_meta(tmp_path, monkeypatch):
    skel = assign_skel(tmp_path)
    w = assign_work(tmp_path)
    w_cfg = json.loads((w / "build.json").read_text(encoding="utf-8"))
    w_cfg["components"] = ["assignment"]
    (w / "build.json").write_text(json.dumps(w_cfg), encoding="utf-8")
    # assignment mount data must satisfy the (later) contract until Task 3;
    # Task 1 uses an assignment-less mini build for meta checks:
    w2 = tmp_path / "w2"
    w2.mkdir()
    (w2 / "build.json").write_text(json.dumps(
        {"title": "T", "theme": "mini", "components": ["demo"],
         "output": "out.html"}), encoding="utf-8")
    rc, out = build_run(skel, w2, tmp_path, monkeypatch)
    assert rc == 0, out
```

Stop — that scaffolding fights the Task 1 scope. **Replace Steps 1–3 of this task definition with the cleaner extraction below** (the meta injection is independent of the assignment data contract because Task 3 adds the data; therefore Task 1 tests a `demo` build whose build.json declares week/subject, asserting injection happens whenever the keys are present):

Final `tests/test_assignment_meta.py`:

```python
import io
import json
import contextlib
import build
from test_build import make_skel, MINI_SHELL


def build_run(skel, work, cwd, monkeypatch):
    monkeypatch.chdir(cwd)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(work)])
    return rc, buf.getvalue()


def workdir(tmp_path, cfg):
    w = tmp_path / "w"
    w.mkdir()
    (w / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="x"><h2>A B</h2>'
        '<div data-component="demo" data-key="x1"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text("LN.data.x1 = {};", encoding="utf-8")
    return w


def test_week_subject_injected_as_meta(tmp_path, monkeypatch):
    skel = make_skel(tmp_path)
    w = workdir(tmp_path, {"title": "T", "theme": "mini",
                           "components": ["demo"], "output": "out.html",
                           "week": 4, "subject": "Management Science"})
    rc, out = build_run(skel, w, tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert '<meta name="ln:week" content="4">' in html
    assert '<meta name="ln:subject" content="Management Science">' in html


def test_meta_html_escaped(tmp_path, monkeypatch):
    skel = make_skel(tmp_path)
    w = workdir(tmp_path, {"title": "T", "theme": "mini",
                           "components": ["demo"], "output": "out.html",
                           "week": 12, "subject": 'Oil & "Drills"'})
    rc, out = build_run(skel, w, tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert 'content="Oil &amp; &quot;Drills&quot;">' in html


def test_absent_keys_no_meta(tmp_path, monkeypatch):
    skel = make_skel(tmp_path)
    w = workdir(tmp_path, {"title": "T", "theme": "mini",
                           "components": ["demo"], "output": "out.html"})
    rc, out = build_run(skel, w, tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    assert "ln:week" not in html and "ln:subject" not in html
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_meta.py -q`
Expected: 3 FAIL (no meta present in shell → `__META__` unresolved errors also appear).

- [ ] **Step 3: Implement**

1. `v2/build.py` — line ~544 allowed-keys:

```python
        unknown = set(cfg) - {"title", "theme", "components", "output",
                              "extra_css", "extra_js", "week", "subject"}
```

2. Add to `MARKERS` (line 32): `"__META__"`.
3. In the substitution chain after `title = html.escape(...)`:

```python
    if "week" in cfg or "subject" in cfg:
        meta = ('<meta name="ln:week" content="%s">\n'
                '<meta name="ln:subject" content="%s">\n'
                % (html.escape(str(cfg.get("week", "?")), quote=True),
                   html.escape(str(cfg.get("subject", "")), quote=True)))
    else:
        meta = ""
    out = shell.replace("__META__", meta)
```

(Injection is unconditional-when-present, so non-assignment demo builds with week/subject also bake them — harmless and useful.)

4. `tests/test_build.py` `MINI_SHELL`: add `__META__` in `<head>` right after `<title>__TITLE__</title>` so the new marker check passes for all existing fixtures.
5. `v2/skeleton/shell.html`: insert `__META__` on its own line right after `<title>__TITLE__</title>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_assignment_meta.py tests/test_build.py -q`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `python -m pytest tests -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add v2/build.py v2/skeleton/shell.html tests/
git commit -m "feat(v2.5): bake ln:week/ln:subject meta tags from build.json"
```

---

