# APA 7 Citations + References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every notebook `build.py` produces carries APA-7 in-text citations and a
generated, machine-checked `References` section.

**Architecture:** Section agents write inline APA citations plus a per-part
`parts/NN-<id>.refs.json`; the assembler merges those sidecars, renders the
`references` section from the `outline.json` contract, appends it after the last
section, and fails the build when in-text citations and reference entries disagree.

**Tech Stack:** Python 3.6+ stdlib only (`v2/build.py`, `json`, `re`, `html`);
`pytest` for tests; plain HTML/CSS in `v2/skeleton/shell.html`.

## Global Constraints

- Python 3.6+ stdlib only — no new third-party runtime dependencies.
- Refs ASCII-safe: non-ASCII operators written literally, never `&#…;` (build.py `HEX_RE` would flag them).
- No hard-coded colours; the shell CSS must use `var(--token)` only.
- External assets stay banned — `EXTERNAL_RE` keeps full force except a plain-text DOI/URL inside the generated References block (never fetched, never linked).
- The `references` section id is exempt from `data-present` markers.
- The references contract is enforced only when the workdir has an `outline.json` (real builds always do; the minimal test fixtures do not).
- Follow existing code style: `Err(rule, file, line, msg, hint)` for every failure; `scan()` for regex trips.

---

### Task 1: Shell `.refs` vocabulary CSS

**Files:**
- Modify: `v2/skeleton/shell.html` (append after the `.mini{…}` rule at ~line 104)
- Test: `tests/test_references.py` (new; first assertions)

**Interfaces:**
- Produces: `.refs` and `.refs li` classes available to generated references markup.

- [ ] **Step 1: Write the failing test**

Create `tests/test_references.py`:

```python
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SHELL = REPO / "v2" / "skeleton" / "shell.html"


def test_shell_has_refs_class():
    css = SHELL.read_text(encoding="utf-8")
    assert ".refs{" in css.replace(" ", "")
    assert "text-indent:-1.6em" in css.replace(" ", "")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_references.py::test_shell_has_refs_class -q`
Expected: FAIL (assertion error — no `.refs` class).

- [ ] **Step 3: Add the CSS**

In `v2/skeleton/shell.html`, immediately after the `.mini{...}` declaration, add:

```css
.refs{margin:0;padding-left:0;list-style:none}
.refs li{margin:.35em 0;padding-left:1.6em;text-indent:-1.6em}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_references.py::test_shell_has_refs_class -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add v2/skeleton/shell.html tests/test_references.py
git commit -m "feat(shell): add .refs hanging-indent list class"
```

---

### Task 2: Merge reference sidecars + render the block

**Files:**
- Modify: `v2/build.py` (add helpers near `merge_parts`, ~line 502)
- Test: `tests/test_references.py`

**Interfaces:**
- Produces:
  - `ref_signature(text) -> (author_norm: str, year: str)`
  - `load_ref_file(path, errors) -> list[dict]` (`{"key","text"}`)
  - `merge_refs(workdir, errors) -> list[dict]` — sorted by `ref_signature`
  - `render_references(title, refs) -> str` — a `<section class="block" id="references">` block
  - `references_title(workdir, errors) -> str | None` — the `outline.json` title for id `references`; appends an error and returns `None` when the outline lacks it; returns `None` silently when there is no outline.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_references.py`:

```python
import json

import build


def _skel_wd(tmp_path, *, outline, refs, section_html=None, components=("demo",)):
    from test_build import make_skel, make_workdir
    skel = make_skel(tmp_path, components=components)
    files = {
        "sections.html": section_html or (
            '<section class="block" id="s1"><h2 data-present="0">S</h2>'
            '<p data-present="1">Cost rises (Reyes, 2020).</p>'
            '<div data-component="demo" data-key="gl"></div></section>'),
    }
    wd = make_workdir(tmp_path, components=components, files=files)
    if outline is not None:
        (wd / "outline.json").write_text(json.dumps(outline), encoding="utf-8")
    if refs is not None:
        (wd / "refs.json").write_text(json.dumps(refs), encoding="utf-8")
    return skel, wd


def _outline(refs_section=True):
    secs = [{"id": "s1", "title": "S", "from": ["RECAP"]}]
    if refs_section:
        secs.append({"id": "references", "title": "9  References", "from": []})
    return {"source": "x", "source_titles": ["RECAP"], "sections": secs, "dropped": []}


def test_references_block_rendered(tmp_path):
    refs = {"refs": [{"key": "reye2020",
                      "text": "Reyes, A. (2020). Cost accounting. Manila Press."}]}
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=refs)
    out, errs, _ = build.assemble(wd, skel)
    assert errs == [], [str(e) for e in errs]
    assert '<section class="block" id="references">' in out
    assert '<h2>9  References</h2>' in out
    assert "Cost accounting. Manila Press." in out


def test_sidecar_refs_merged_and_deduped(tmp_path):
    from test_build import make_skel, make_workdir
    skel = make_skel(tmp_path)
    files = {
        "sections.html": ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
                          '<p data-present="1">A (Reyes, 2020).</p>'
                          '<div data-component="demo" data-key="gl"></div></section>'),
    }
    wd = make_workdir(tmp_path, files=files)
    (wd / "outline.json").write_text(json.dumps(_outline()), encoding="utf-8")
    (wd / "parts").mkdir()
    (wd / "parts" / "01-a.refs.json").write_text(json.dumps(
        {"refs": [{"key": "r", "text": "Reyes, A. (2020). Cost. P."}]}), encoding="utf-8")
    (wd / "parts" / "02-b.refs.json").write_text(json.dumps(
        {"refs": [{"key": "r", "text": "Reyes, A. (2020). Cost. P."}]}), encoding="utf-8")
    out, errs, _ = build.assemble(wd, skel)
    assert errs == [], [str(e) for e in errs]
    assert out.count("Reyes, A. (2020)") == 1


def test_duplicate_key_conflict_errors(tmp_path):
    from test_build import make_skel, make_workdir
    skel = make_skel(tmp_path)
    files = {
        "sections.html": ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
                          '<p data-present="1">A (Reyes, 2020).</p>'
                          '<div data-component="demo" data-key="gl"></div></section>'),
    }
    wd = make_workdir(tmp_path, files=files)
    (wd / "outline.json").write_text(json.dumps(_outline()), encoding="utf-8")
    (wd / "parts").mkdir()
    (wd / "parts" / "01-a.refs.json").write_text(json.dumps(
        {"refs": [{"key": "r", "text": "Reyes, A. (2020). One."}]}), encoding="utf-8")
    (wd / "parts" / "02-b.refs.json").write_text(json.dumps(
        {"refs": [{"key": "r", "text": "Reyes, A. (2020). Two."}]}), encoding="utf-8")
    _, errs, _ = build.assemble(wd, skel)
    assert "references" in [e.rule for e in errs]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_references.py -q`
Expected: FAIL (`AttributeError`/missing block — helpers not defined).

- [ ] **Step 3: Implement the helpers**

In `v2/build.py`, after `merge_parts` (ends line 501), add:

```python
def norm_author(s):
    s = s.lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\b(and|et|al|the)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def ref_signature(text):
    """(normalized author, year) parsed from an APA-7 reference entry."""
    ym = re.search(r"\((\d{4}[a-z]?|n\.d\.)\)", text)
    if ym:
        return norm_author(text[:ym.start()].strip().rstrip(".")), ym.group(1)
    return norm_author(text), ""


def load_ref_file(path, errors):
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError) as exc:
        errors.append(Err("references", path.name, None,
                          "unreadable/invalid JSON: %s" % exc, ""))
        return []
    items = data.get("refs") if isinstance(data, dict) else data
    if not isinstance(items, list):
        errors.append(Err("references", path.name, None,
                          'must be a list or {"refs":[...]}',
                          'use {"refs":[{"key":"...","text":"..."}]}'))
        return []
    out = []
    for i, it in enumerate(items):
        if not isinstance(it, dict) or not str(it.get("key", "")).strip() \
                or not str(it.get("text", "")).strip():
            errors.append(Err("references", path.name, None,
                              "ref #%d needs non-empty key and text" % (i + 1), ""))
            continue
        out.append({"key": str(it["key"]).strip(), "text": str(it["text"]).strip()})
    return out


def merge_refs(workdir, errors):
    files = []
    root = workdir / "refs.json"
    if root.exists():
        files.append(root)
    pdir = workdir / "parts"
    if pdir.is_dir():
        files.extend(sorted(pdir.glob("*.refs.json")))
    refs, by_key = [], {}
    for f in files:
        for r in load_ref_file(f, errors):
            if r["key"] in by_key:
                if by_key[r["key"]]["text"] != r["text"]:
                    errors.append(Err("references", f.name, None,
                                      "duplicate ref key %r with different text"
                                      % r["key"], "give each work a unique key"))
                continue
            by_key[r["key"]] = r
            refs.append(r)
    refs.sort(key=lambda r: ref_signature(r["text"]))
    return refs


def _ref_text_html(text):
    out = html.escape(text, quote=False)
    return out.replace("&lt;em&gt;", "<em>").replace("&lt;/em&gt;", "</em>")


def render_references(title, refs):
    lis = "\n".join("    <li>%s</li>" % _ref_text_html(r["text"]) for r in refs)
    return ('<section class="block" id="references">\n'
            '  <h2>%s</h2>\n'
            '  <ul class="refs">\n%s\n  </ul>\n</section>'
            % (html.escape(title, quote=False), lis))


def references_title(workdir, errors):
    opath = workdir / "outline.json"
    if not opath.exists():
        return None
    try:
        outline = json.loads(opath.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError):
        return None
    secs = outline.get("sections") if isinstance(outline, dict) else None
    if not isinstance(secs, list):
        return None
    for s in secs:
        if isinstance(s, dict) and str(s.get("id")) == "references":
            return str(s.get("title", "References"))
    errors.append(Err("references", "outline.json", None,
                      "outline has no references section",
                      'add {"id":"references","title":"N  References","from":[]}'))
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_references.py -q`
Expected: The three new tests still FAIL until Task 3 wires `references_title`
and rendering into `assemble`. If they pass now, stop and check the wiring is
actually happening (it should not be yet). Keep the helpers; proceed to Task 3.

- [ ] **Step 5: Commit**

```bash
git add v2/build.py tests/test_references.py
git commit -m "feat(build): merge refs sidecars and render references block"
```

---

### Task 3: `check_references` rule + wire into `assemble`

**Files:**
- Modify: `v2/build.py` (`PRESENT_EXEMPT` line 595; new `check_references`; `assemble` lines 1683, 1686, 1714, 1827, 1839)
- Test: `tests/test_references.py`

**Interfaces:**
- Consumes: `merge_refs`, `references_title`, `render_references`, `ref_signature`, `norm_author` (Task 2).
- Produces: `in_text_citations(sections_text) -> set[(author_norm, year)]`;
  `check_references(sections_text, refs, errors) -> None`;
  `append_references(workdir, sections_text, errors) -> str` (returns
  `sections_text + generated block`, or `sections_text` unchanged when there is
  no outline).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_references.py`:

```python
def test_missing_references_section_fails(tmp_path):
    refs = {"refs": [{"key": "r", "text": "Reyes, A. (2020). Cost. P."}]}
    skel, wd = _skel_wd(tmp_path, outline=_outline(refs_section=False), refs=refs)
    _, errs, _ = build.assemble(wd, skel)
    assert "references" in [e.rule for e in errs]


def test_no_refs_fails(tmp_path):
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=None)
    _, errs, _ = build.assemble(wd, skel)
    assert "references" in [e.rule for e in errs]


def test_unmatched_citation_fails(tmp_path):
    refs = {"refs": [{"key": "r", "text": "Reyes, A. (2020). Cost. P."}]}
    sec = ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
           '<p data-present="1">X (Ghost, 1999).</p>'
           '<div data-component="demo" data-key="gl"></div></section>')
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=refs, section_html=sec)
    _, errs, _ = build.assemble(wd, skel)
    assert any(e.rule == "references" and "no matching reference" in e.msg for e in errs)


def test_orphan_reference_fails(tmp_path):
    refs = {"refs": [
        {"key": "r", "text": "Reyes, A. (2020). Cost. P."},
        {"key": "x", "text": "Cruz, B. (2019). Never cited. Q."},
    ]}
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=refs)
    _, errs, _ = build.assemble(wd, skel)
    assert any(e.rule == "references" and "never cited" in e.msg for e in errs)


def test_doi_in_references_allowed(tmp_path):
    refs = {"refs": [{"key": "r",
                      "text": "Reyes, A. (2020). Cost. P. https://doi.org/10.1000/xyz"}]}
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=refs)
    out, errs, _ = build.assemble(wd, skel)
    assert errs == [], [str(e) for e in errs]
    assert "https://doi.org/10.1000/xyz" in out


def test_url_outside_references_still_fails(tmp_path):
    refs = {"refs": [{"key": "r", "text": "Reyes, A. (2020). Cost. P."}]}
    sec = ('<section class="block" id="s1"><h2 data-present="0">S</h2>'
           '<p data-present="1">See https://example.com (Reyes, 2020).</p>'
           '<div data-component="demo" data-key="gl"></div></section>')
    skel, wd = _skel_wd(tmp_path, outline=_outline(), refs=refs, section_html=sec)
    _, errs, _ = build.assemble(wd, skel)
    assert "external" in [e.rule for e in errs]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_references.py -q`
Expected: FAIL — no `references`/`external` rules wired yet.

- [ ] **Step 3: Add `PRESENT_EXEMPT` entry**

In `v2/build.py` line 595, change:

```python
PRESENT_EXEMPT = {"overview", "glossary", "selfcheck", "assignment", "recap",
                  "self-check", "assign", "references"}
```

- [ ] **Step 4: Add the citation/extraction helpers**

After `references_title` (Task 2), add:

```python
IN_TEXT_PAREN_RE = re.compile(r"\(([^()]{0,200})\)")
CITE_PART_RE = re.compile(
    r"^([A-Za-z][\w'’\-.\s&]*(?:et al\.)?)\s*,\s*(\d{4}[a-z]?|n\.d\.)")
NARRATIVE_RE = re.compile(
    r"\b([A-Z][\w'’\-]+(?:\s+(?:et al\.|and\s+[A-Z][\w'’\-]+"
    r"|&\s+[A-Z][\w'’\-]+))?)\s+\((\d{4}[a-z]?|n\.d\.)\)")


def in_text_citations(sections_text):
    cites = set()
    for m in IN_TEXT_PAREN_RE.finditer(sections_text):
        for part in m.group(1).split(";"):
            cm = CITE_PART_RE.match(part.strip())
            if cm:
                cites.add((norm_author(cm.group(1)), cm.group(2)))
    for m in NARRATIVE_RE.finditer(sections_text):
        cites.add((norm_author(m.group(1)), m.group(2)))
    return cites


def _cites_match(cite, sig):
    author, year = cite
    ra, ry = sig
    if year != ry:
        return False
    if author in ra or ra in author:
        return True
    return author.split()[:1] == ra.split()[:1]


def check_references(sections_text, refs, errors):
    cites = in_text_citations(sections_text)
    if not cites:
        errors.append(Err("references", "sections.html", None,
                          "no in-text APA citation found",
                          "cite each fact, e.g. (Author, Year)"))
    sigs = [ref_signature(r["text"]) for r in refs]
    for cite in sorted(cites):
        if not any(_cites_match(cite, s) for s in sigs):
            errors.append(Err("references", "sections.html", None,
                              "in-text citation (%s, %s) has no matching reference"
                              % cite, "add it to a refs.json, or fix the surname/year"))
    for r, sig in zip(refs, sigs):
        if not any(_cites_match(cite, sig) for cite in cites):
            errors.append(Err("references", "refs.json", None,
                              "reference %r is never cited" % r["key"],
                              "cite it in text, or remove it"))


def append_references(workdir, sections_text, errors):
    if not (workdir / "outline.json").exists():
        return sections_text
    title = references_title(workdir, errors)
    refs = merge_refs(workdir, errors)
    if not refs:
        errors.append(Err("references", "refs.json", None,
                          "no reference entries found",
                          "write refs.json or parts/*.refs.json"))
    if title is None:
        return sections_text
    check_references(sections_text, refs, errors)
    return sections_text + "\n" + render_references(title, refs)
```

- [ ] **Step 5: Wire into `assemble`**

In `v2/build.py`:

After `parts` are populated (after line 1655), add:

```python
    sections_full = append_references(workdir, parts["sections"], errors)
```

Change line 1683 to use `sections_full`:

```python
    check_outline(workdir, sections_full, errors)
```

Change line 1686:

```python
    check_present(sections_full, errors)
```

Change line 1714:

```python
    check_wellformed(sections_full, "sections.html", errors)
```

Change line 1827:

```python
    out = out.replace("<!--__SECTIONS__-->", sections_full)
```

Change line 1839:

```python
    check_ids(out, sections_full, errors)
```

Leave `check_provenance(parts["sections"], parts["data"], errors)` (line 1687)
and the HEX/EXTERNAL scans on `parts["sections"]` / `parts["data"]` unchanged —
that is what keeps a DOI legal inside the generated block while a URL anywhere
else still fails.

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_references.py -q`
Expected: PASS (all Task 1–3 tests).

- [ ] **Step 7: Run the full suite**

Run: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"`
Expected: only `test_e2e_lesson` / `test_e2e_dag` fail, because the sample
`lesson-demo` has no refs yet (fixed in Task 5). Everything else PASS.

- [ ] **Step 8: Commit**

```bash
git add v2/build.py tests/test_references.py
git commit -m "feat(build): enforce APA in-text citations vs references entries"
```

---

### Task 4: Skip `references` in the activity-freshness scan + README

**Files:**
- Modify: `v2/tools/activity_numbers.py:53`
- Modify: `README.md` (build-gates bullet list, ~line 29-39)
- Test: `tests/test_references.py`

**Interfaces:**
- Produces: `activity_numbers.py` treats the `references` section as non-activity.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_references.py`:

```python
def test_activity_scan_skips_references():
    import importlib.util
    p = REPO / "v2" / "tools" / "activity_numbers.py"
    spec = importlib.util.spec_from_file_location("activity_numbers", p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert "references" in mod.skip_sections
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_references.py::test_activity_scan_skips_references -q`
Expected: FAIL.

- [ ] **Step 3: Add to the skip set**

`v2/tools/activity_numbers.py` line 53:

```python
    skip_sections = {"overview", "glossary", "assignment", "recap", "references"}
```

- [ ] **Step 4: Update README**

In `README.md`, add one line to the build-gates bullet list (after the
"mandatory print stylesheet present" bullet):

```markdown
- mandatory APA-7 References section generated from `refs.json` / `parts/*.refs.json`,
  with every in-text citation matched to an entry (under the `outline.json` contract)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_references.py::test_activity_scan_skips_references -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add v2/tools/activity_numbers.py README.md tests/test_references.py
git commit -m "feat(tools): skip references in activity scan; note APA gate in README"
```

---

### Task 5: Update every sample to the references contract

**Files:**
- Modify: `v2/sample/lesson-demo/outline.json`, `v2/sample/lesson-demo/sections.html`
- Create: `v2/sample/lesson-demo/refs.json`
- Modify: `v2/sample/demo-{app,feed,opal,parchment,sheet,studio}/outline.json` + each `sections.html`
- Create: `v2/sample/demo-{app,feed,opal,parchment,sheet,studio}/refs.json`

**Interfaces:**
- Consumes: the `references` outline entry contract and generated block (Tasks 2–3).

- [ ] **Step 1: Add the outline entry to all 7 samples**

In each `v2/sample/*/outline.json`, add as the final element of `"sections"`,
numbered one past that sample's Recap title:

```json
    {"id": "references", "title": "9  References", "from": []}
```

`lesson-demo`'s last section is `recap` = `8  Recap` → `9  References`. The
`demo-*` packs end at `recap` = `7  Recap` → `8  References`. Use the number
that follows each sample's own Recap; keep `source_titles` and `dropped`
unchanged.

- [ ] **Step 2: Create `refs.json` in each sample**

`v2/sample/<name>/refs.json` (no URL — the e2e self-containment test requires it):

```json
{
  "refs": [
    {"key": "garrison2018",
     "text": "Garrison, R. H., Noreen, E. W., & Brewer, P. C. (2018). <em>Managerial accounting</em> (16th ed.). McGraw-Hill Education."}
  ]
}
```

- [ ] **Step 3: Add one in-text citation to each sample's `sections.html`**

In the `costs` (fixed vs. variable cost) section body, after the opening
paragraph, insert:

```html
  <p>Fixed and variable costs separate by whether they move with volume (Garrison et al., 2018).</p>
```

The `(Garrison et al., 2018)` citation must appear verbatim so
`in_text_citations` matches it.

- [ ] **Step 4: Build the sample and verify the references block ships**

Run (from repo root): `python v2/build.py v2/sample/lesson-demo`
Expected: `OK`; `Week4-Demo-Notebook.html` in the CWD contains
`<section class="block" id="references">` and `Managerial accounting`.

- [ ] **Step 5: Run the e2e tests**

Run: `python -m pytest tests/test_e2e_lesson.py tests/test_e2e_dag.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add v2/sample
git commit -m "feat(samples): add APA references to every demo build"
```

---

### Task 6: Document the rule in SKILL.md (v2.22)

**Files:**
- Modify: `v2/SKILL.md` (frontmatter, changelog, §2.7, architecture table, §2.0b, Part 4 file table + brief, Part 5, Part 8, Part 9.5)

**Interfaces:**
- Produces: the prose contract every future build follows; no code interface.

- [ ] **Step 1: Bump the version and description**

Frontmatter: `version: 2.21` → `version: 2.22`. In the `description` block,
append: `Carries APA-7 in-text citations and a generated References section
(every build).`

- [ ] **Step 2: Add the changelog paragraph**

Change the H1 to `# Interactive Lesson Notebook (v2.22 — APA 7 citations +
references)`. After the "What v2.21 adds" paragraph (ends line 210), add:

```markdown
What v2.22 adds: **APA-7 citations and a References section in every build.**
Every fact, definition, or number that comes from a document carries an APA-7
in-text citation — `(Author, Year)`, `Author (Year)`, `(Author, Year, p. 12)`,
`(Author et al., Year)` — and every build ships a generated `references`
section (last, id `references`, `.refs` hanging-indent list) whose entries are
APA-7. Each section agent writes inline citations plus a sidecar
`parts/NN-<id>.refs.json`; `build.py` merges the sidecars (or a monolith
`refs.json`), renders the block from the mandatory `outline.json` entry, and
fails the build when an in-text citation has no entry, an entry is never cited,
or no citations exist. A plain-text DOI/URL is allowed **only** inside the
generated References block; a URL anywhere else still fails. See §2.7.
```

- [ ] **Step 3: Add §2.7**

After §2.6 (ends line 716), add:

```markdown
### 2.7 Citations and References (APA 7th edition)

Every build cites its sources, for **both** source types.

- **In-text.** Every fact, definition, or number drawn from a document carries
  an APA-7 in-text citation at the point of use: `(Author, Year)`,
  `Author (Year)`, `(Author & Author, Year)`, `(Author et al., Year)`, and
  `(Author, Year, p. 12)` for a quote. Use `&` inside parentheses and `and`
  in narrative; add `a`/`b` for the same author and year.
- **References.** A `references` section ships last, id `references`, its
  `<h2>` matching the mandatory `outline.json` entry, with one APA-7 entry per
  cited work, alphabetical by author, hanging indent (`.refs`), sentence-case
  titles, italic titles/volumes.
- **Where the works come from.** `teaching`: the external works the lesson
  draws on; if it names none, the lesson source document. `specification`: the
  standards the content was authored against (the existing `CITATIONS` block's
  references now reach the HTML). Never invent a work.
- **Production.** Each content section writes `parts/NN-<id>.refs.json`
  (monolith builds: `refs.json`) with `{"key", "text"}` entries — `text` a
  complete APA-7 entry, `<em>` allowed for italics. `build.py` merges, dedups,
  sorts, and renders the block; it fails on an uncited entry, an unresolved
  citation, or an empty list.
- **URLs.** A plain-text DOI/URL is legal only inside the generated References
  block (never fetched, never linked); a URL elsewhere still fails the
  external-asset check.
```

- [ ] **Step 4: Add the architecture row**

In the §2 table (line 496), after the `8 | Recap` row, add:

```markdown
| 9 | **References** | one APA-7 entry per cited work, alphabetical, hanging indent | (generated — no mount) |
```

- [ ] **Step 5: Extend the exempt lists**

Line 513-515 (§2.0b) and line 831-833 (brief template): add `references` to the
canonical exempt ids. In §2.0b change the list to ``overview`, `glossary`,
`selfcheck` (also accept `self-check`), `assignment` (also accept `assign`),
`recap`, and `references``. In the brief template change `Exempt sections
(overview, glossary, selfcheck [also accept self-check], assignment [also
accept assign], recap)` to include `, references`.

- [ ] **Step 6: Add the sidecar to the Part 4 contract**

In the Part 1.1 contract table (line 285-291) and Part 4 file notes, add a row:
`parts/NN-<id>.refs.json` — that section's cited works (`{"key","text"}`).
Then in the Part 4 brief template (after the "No self-reference…" bullet, line
838-841) add:

```markdown
- Cite your sources (APA 7). Every fact, definition, or number you take from a
  document gets an in-text citation: (Author, Year). Write your cited works to
  parts/<NN>-<id>.refs.json as {"refs":[{"key":"slug","text":"full APA-7 entry"}]}
  (<em> for italics; no other markup). Never invent a work; cite the lesson's
  own source document only when it names no external work.
```

- [ ] **Step 7: Add the Part 5 QA bullet**

After the "Activity freshness" bullet (ends line 947), add:

```markdown
- **Citations & references (v2.22).** Every attribution carries an APA-7
  in-text citation; every entry in the generated `references` section is cited
  at least once and is a real, correctly-formed APA-7 entry for its type. An
  invented work, or a number with no citable source, does not ship.
```

- [ ] **Step 8: Add the Part 8 opening-message line**

In the opening-message block (line 1000-1011), add after the `Components:` line:

```
Citations: <N> works cited (APA 7) -> generated References section
```

- [ ] **Step 9: Add to the §9.5 resume checklist**

Line 1119-1121: append `and the references rule green (≥1 in-text citation,
every entry cited, `references` section generated)`.

- [ ] **Step 10: Commit**

```bash
git add v2/SKILL.md
git commit -m "docs(skill): land v2.22 APA citations + references rule"
```

---

### Task 7: Regenerate the committed demo HTMLs

**Files:**
- Modify (regenerated): `Week4-Demo-Notebook.html`, `app-demo.html`,
  `opal-demo.html`, `parchment-demo.html`, `studio-demo.html`

**Note:** `demo-feed` (`"layout": "feed"`) and `demo-sheet` (`"layout":
"sheet"`) are retired — the v2.12 layout gate fails any non-`app` value — so
their sample files are updated for consistency in Task 5, but their committed
`feed-demo.html` / `sheet-demo.html` are **not** regenerated.

**Interfaces:**
- Consumes: the updated samples (Task 5) and the wired build (Tasks 2–3).

- [ ] **Step 1: Rebuild each buildable committed demo from its sample**

From the repo root: `python v2/build.py v2/sample/lesson-demo` (writes
`Week4-Demo-Notebook.html`; it is the intended buildable packaged demo), etc.
Each command's output name comes from the sample's `build.json > output`. If a
sample build fails on the layout gate, skip it and note it.

- [ ] **Step 2: Verify each carries a references section**

Run: `Select-String -Path Week4-Demo-Notebook.html,app-demo.html,opal-demo.html,parchment-demo.html,studio-demo.html -Pattern 'id="references"'`
Expected: a hit in every rebuilt demo.

- [ ] **Step 3: Run the rendered-overflow gate on the rebuilt lesson**

Run: `node v2/tools/layout_smoke.js Week4-Demo-Notebook.html` then
`node v2/tools/layout_smoke.js Week4-Demo-Notebook.html --width 390`
Expected: `LAYOUT OK` both times.

- [ ] **Step 4: Commit**

```bash
git add Week4-Demo-Notebook.html app-demo.html opal-demo.html parchment-demo.html studio-demo.html
git commit -m "chore(demos): rebuild with APA references section"
```

---

### Task 8: Final verification

**Files:**
- Verify only.

- [ ] **Step 1: Full test suite**

Run: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"`
Expected: all PASS.

- [ ] **Step 2: Sample e2e builds**

Run: `python v2/build.py v2/sample/lesson-demo` from the repo root.
Expected: `OK`, and the output contains the references block.

- [ ] **Step 3: Confirm the loop is closed**

Confirm the reason the change exists: grep the built lesson for both an in-text
citation and the References section.

Run: `Select-String -Path Week4-Demo-Notebook.html -Pattern "Garrison et al., 2018|id=\"references\""`
Expected: both present.
