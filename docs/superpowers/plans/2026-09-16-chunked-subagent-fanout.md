# Chunked Per-Section Subagent Pipeline (v2.1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a lesson notebook be authored as one shard per notebook section — `plan.json` + `sections/NN-*.html` + `data/NN-*.js` assembled by `build.py`, with a per-shard `--lint` mode for subagent self-check — plus a hard definition-first content contract in the skill.

**Architecture:** `build.py` gains a shard layout (auto-detected via `plan.json` + `sections/`/`data/`), a `Parts` offset-mapping class so every existing rule reports real shard file+line, mechanical plan validation (prefixes, claimed files, mount↔key↔component consistency), and a `lint_shard()` entry point reusing the existing check functions scoped to one shard. SKILL.md gains a dual-mode build order (monolith / fan-out), a Brief Template appendix writers receive instead of SKILL.md, and the definition-first contract with a canonical bad/good example pair. Monolith v2.0 workdirs must still build to byte-identical output.

**Tech Stack:** Python 3 stdlib only (`build.py`); pytest (dev tests); vanilla HTML/CSS/ES6 — no runtime deps introduced.

**Spec:** `docs/superpowers/specs/2026-09-16-chunked-subagent-lessons-design.md` (§n below refers to it). Repo: skill assets in `v2/`, tests in `tests/`. The deployed copy under `~/.claude/skills/` is refreshed by the user after GREEN (manual, outside this plan).

## Global Constraints

- `build.py`: Python 3.6-compatible stdlib only (no walrus `:=`, no f-strings-only APIs; `%`-formatting as in existing code). Exit 0 = output written, exit 1 = itemized FAIL report, never partial output.
- Every v2.0 monolith workdir builds to **byte-identical** output as before this plan; all 38 existing tests stay green and unmodified. (Shard-aware error *coordinates* on the FAIL-report path — e.g. a malformed `sections.html` now cites a real line instead of `-` — are the intended improvement of this plumbing and are NOT a behavior change to the built output.)
- Existing rule names are reused where semantics match (`hex`, `external`, `js`, `wellformed`, `data`, `ids`, `markers`, `contrast`, `tune`, `files`, `component`, `theme`, `build.json`). New rule names: `plan` (plan.json problems), `prefix` (shard id/key violations).
- Shard layout: `sections/<stem>.html` + `data/<stem>.js` pairs sharing one stem; concatenation order = filename-sorted; joined with a single `\n` (spec §3). Shard id regex `^(?:[0-9]{1,2}G?|G)$`; `key_prefix` regex `^s[0-9A-Z][0-9A-Z-]*$`; section-block ids must start `<key_prefix>.`, data keys must start `<key_prefix>` (spec §3).
- `--lint` checks (spec §7): hex, external, js-tag, wellformed-fragment, mounts-vs-shard-components, data-key-locally-defined, prefix. Lint does NOT check: global id uniqueness, contrast, markers, TOC, print, tune.
- Definition-first contract wording and the term-structure bad/good example pair are copied verbatim from Tasks 5–6 below (spec §6).
- Dev pre-flight (once): `python -m pip install pytest` — the current interpreter has no pytest.

## File Structure

```
v2/build.py                  # Parts class, plan validation, shard assembly, prefix, lint (Tasks 1–4)
v2/SKILL.md                  # §6.2 definition-first (Task 5); Part 4 dual mode, Appendix A, v2.1 frontmatter (Task 6)
tests/test_build.py          # + Parts mapping unit tests (Task 1)
tests/test_shards.py         # new: plan/assembly/prefix/lint suites (Tasks 2–4)
tests/test_e2e_fanout.py     # new: sample lesson split into shards (Task 7)
README.md                    # v2.1 note (Task 7)
```

---

### Task 1: `Parts` offset mapping + shard-aware plumbing (output byte-identical; failure-report coordinates improve)

**Files:**
- Modify: `v2/build.py` (class region after `strip_comments` ~line 75; `scan` 78–83; `check_mounts` 261–283; `check_wellformed` 316–325; `assemble` 420–428, 456–462, 501–508)
- Test: `tests/test_build.py` (append `test_parts_*` cases; change NO existing test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `class Parts` with `.spans: list[(str, str)]`, `.text: str`, `.where(offset) -> (name, line)`, `.where_line(concat_line) -> (name, local_line)`; `scan(..., src, ...)` / `check_wellformed(text, src, errors)` / `check_mounts(sections_src, data_text, comp_names, errors, list_label="build.json")` / `check_ids(output_text, sections_src, errors)` all accept a `Parts` **or** a plain `str` filename in place of the old filename argument. Later tasks rely on: values of `parts["sections"]` and `parts["data"]` being `Parts` instances even in monolith mode.

- [ ] **Step 1: Write the failing tests** — append to `tests/test_build.py`:

```python
def test_parts_where_and_where_line():
    p = build.Parts([("a.html", "x1\nx2"), ("b.html", "y1")])
    assert p.text == "x1\nx2\ny1"
    assert p.where(0) == ("a.html", 1)
    assert p.where(3) == ("a.html", 2)      # offset 3 = 'x' of x2
    assert p.where(5) == ("b.html", 1)      # the joiner newline maps to the next span
    assert p.where(6) == ("b.html", 1)
    assert p.where(8) == ("b.html", 1)      # out of range falls back to last span
    assert p.where_line(1) == ("a.html", 1)
    assert p.where_line(3) == ("b.html", 1)
    assert p.where_line(99) == ("b.html", 1)

def test_scan_reports_parts_coords():
    p = build.Parts([("a.html", "clean"), ("b.html", "#abc")])
    errs = build.scan(p.text, build.HEX_RE, "hex", p, "hard-coded colour", "")
    assert len(errs) == 1 and errs[0].file == "b.html" and errs[0].line == 1

def test_scan_still_accepts_plain_name():
    errs = build.scan("#abc", build.HEX_RE, "hex", "x.html", "hard-coded colour", "")
    assert errs[0].file == "x.html" and errs[0].line == 1
```

- [ ] **Step 2: Run to verify failure** — `python -m pytest tests/test_build.py -q` → FAIL (`Parts` undefined).

- [ ] **Step 3: Implement.** Add after `strip_comments`:

```python
class Parts:
    """Concatenated part files with offset -> (file, line) mapping.
    spans: list of (relative_name, text), joined by single newlines."""

    def __init__(self, spans):
        self.spans = spans
        self.text = "\n".join(t for _, t in spans)

    def where(self, offset):
        pos = 0
        for name, t in self.spans:
            if offset < pos + len(t):
                return name, t.count("\n", 0, max(0, offset - pos)) + 1
            pos += len(t) + 1
        return self.spans[-1][0], 1

    def where_line(self, line):
        run = 1
        for name, t in self.spans:
            n = t.count("\n") + 1
            if line < run + n:
                return name, line - run + 1
            run += n
        return self.spans[-1][0], 1
```

Then make the four check functions accept `Parts | str` (identical behavior for `str`):

```python
def scan(text, regex, rule, src, msg, hint):
    errs = []
    for m in regex.finditer(text):
        if isinstance(src, Parts):
            f, ln = src.where(m.start())
        else:
            f, ln = src, text.count("\n", 0, m.start()) + 1
        errs.append(Err(rule, f, ln, "%s found: %r" % (msg, m.group(0)[:38]), hint))
    return errs
```

`check_mounts(sections_src, data_text, comp_names, errors, list_label="build.json")`: use `sections_src.text` for the regex loop; when reporting, if `isinstance(sections_src, Parts)` take `(f, ln) = sections_src.where(m.start())` else `("sections.html", <count>)`; message text becomes `"mount %r not in %s components" % (name, list_label)`. `check_wellformed(text, src, errors)`: for each `bal.problems` message, `m = re.search(r"line (\d+)", msg)`; if `src` is a `Parts` and `m`, map `(f, ln) = src.where_line(int(m.group(1)))`, else `(src, None)`. `check_ids(output_text, sections_src, errors)`: section-tag loop uses `sections_src.text`, coords via the same isinstance pattern.

In `assemble`, wrap the two monolith reads (lines 420–428): after the loop, set `parts["sections"] = Parts([("sections.html", parts["sections"])])` and `parts["data"] = Parts([("data.js", parts["data"])])`. Update uses: `check_mounts(parts["sections"], parts["data"].text, ...)`, `check_wellformed(parts["sections"], "sections.html" -> parts["sections"], ...)`, `check_js(parts["data"].text, ...)`, `scan(parts["sections"], ..., parts["sections"], ...)`, the external-scan list tuple entries, the two `out.replace(...)` calls (`parts["sections"].text` / `parts["data"].text`), `check_ids(out, parts["sections"], ...)`. `parts["tune"]` stays a plain string.

- [ ] **Step 4: Run** — `python -m pytest tests -q` → ALL existing 38 + 3 new tests PASS; `python -m pytest tests/test_e2e_lesson.py -q` green (byte behavior unchanged).

- [ ] **Step 5: Commit** — `git add v2/build.py tests/test_build.py; git commit -m "refactor(build): Parts offset mapping, shard-aware coordinates plumbing (no behavior change)"`

---

### Task 2: `plan.json` — loading, validation, shard assembly, layout detection, parity

**Files:**
- Modify: `v2/build.py` (new `load_plan`/`Shard`/`validate_plan`/`collect_parts` after `check_js`; `assemble` file-loading block from Task 1; docstring/version bump to v2.1)
- Test: `tests/test_shards.py` (create)

**Interfaces:**
- Consumes: `Parts` (Task 1); `KEY_RE`, `NAME_RE`-style regex constants; `Err`.
- Produces: `SHARD_ID_RE`, `KEY_PREFIX_RE`; `load_plan(workdir, errors) -> dict|None`; `class Shard(id, key_prefix, html_rel, js_rel, components, html, js)`; `validate_plan(plan, workdir, cfg, errors) -> list[Shard]` (also stores file text into `Shard.html/.js`, computes nothing else); `collect_parts(shards) -> (Parts, Parts)`; `assemble` returns `Parts` built from shards in shard mode and validates plan↔build.json consistency. `main` unchanged. Rule names added: `plan`.

- [ ] **Step 1: Write failing tests** — `tests/test_shards.py`:

```python
import json
from pathlib import Path

import build
from test_build import MINI_SHELL, make_skel, MINI_THEME  # reuse fixtures

def shard_wd(tmp_path, split=True, extra=None, plan_over=None, monolith=False):
    wd = tmp_path / "wd"
    (wd / "sections").mkdir(parents=True)
    (wd / "data").mkdir(parents=True)
    cfg = {"title": "T", "theme": "mini", "components": ["demo"], "output": "out.html"}
    (wd / "build.json").write_text(json.dumps(cfg), encoding="utf-8")
    (wd / "tune.css").write_text(":root{--accent:#33608f;}", encoding="utf-8")
    (wd / "sections/1-a.html").write_text(
        '<section class="block" id="s1.a"><h2>A</h2>'
        '<div data-component="demo" data-key="s1k"></div></section>', encoding="utf-8")
    (wd / "data/1-a.js").write_text("LN.data.s1k={items:[1]};", encoding="utf-8")
    (wd / "sections/2-b.html").write_text(
        '<section class="block" id="s2.b"><h2>B</h2></section>', encoding="utf-8")
    (wd / "data/2-b.js").write_text("LN.data.s2k={items:[2]};", encoding="utf-8")
    if plan_over != "none":
        plan = {"title": "T", "theme": "mini", "shards": [
            {"id": "1", "section": "A", "key_prefix": "s1",
             "files": ["sections/1-a.html", "data/1-a.js"],
             "components": ["demo"], "open_handoff": "o", "close_handoff": "c",
             "must_teach": ["def a"]},
            {"id": "2", "section": "B", "key_prefix": "s2",
             "files": ["sections/2-b.html", "data/2-b.js"],
             "components": [], "open_handoff": "o", "close_handoff": "c",
             "must_teach": ["def b"]}]}
        plan.update(plan_over or {})
        (wd / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    for name, text in (extra or {}).items():
        (wd / name).parent.mkdir(parents=True, exist_ok=True)
        (wd / name).write_text(text, encoding="utf-8")
    return wd

def assembled(tmp_path, wd):
    skel = make_skel(tmp_path)
    out, errs = build.assemble(wd, skel)
    return out, errs, [e.rule for e in errs]

def test_shard_build_ok(tmp_path):
    out, errs, rules = assembled(tmp_path, shard_wd(tmp_path))
    assert errs == [], [str(e) for e in errs]
    assert 'id="s1.a"' in out and 'LN.data.s2k' in out

def test_shard_sections_order(tmp_path):
    out, _, _ = assembled(tmp_path, shard_wd(tmp_path))
    assert out.index("s1.a") < out.index("s2.b")

def test_shard_equals_monolith_output(tmp_path):
    # split parity (spec 3): monolith == "\n".join(shard texts), byte-identical output
    mono = tmp_path / "mono"
    mono.mkdir()
    wd = shard_wd(tmp_path)
    sec = "\n".join(p.read_text(encoding="utf-8")
                    for p in sorted((wd / "sections").glob("*.html")))
    dat = "\n".join(p.read_text(encoding="utf-8")
                    for p in sorted((wd / "data").glob("*.js")))
    for f in ("build.json", "tune.css"):
        (mono / f).write_text((wd / f).read_text(encoding="utf-8"), encoding="utf-8")
    (mono / "sections.html").write_text(sec, encoding="utf-8")
    (mono / "data.js").write_text(dat, encoding="utf-8")
    skel = make_skel(tmp_path)
    o_m, e_m = build.assemble(mono, skel)
    o_s, e_s = build.assemble(wd, skel)
    assert e_m == [] and e_s == []
    assert o_m == o_s

def test_shards_without_plan_rejected(tmp_path):
    wd = shard_wd(tmp_path, plan_over="none")
    _, _, rules = assembled(tmp_path, wd)
    assert "plan" in rules

def test_plan_without_shard_dirs_rejected(tmp_path):
    wd = tmp_path / "wd"
    wd.mkdir()
    shard_src = shard_wd(tmp_path)
    for f in ("build.json", "tune.css", "plan.json"):
        (wd / f).write_text((shard_src / f).read_text(encoding="utf-8"), encoding="utf-8")
    _, _, rules = assembled(tmp_path, wd)
    assert "plan" in rules

def test_monolith_alongside_shards_ambiguous(tmp_path):
    wd = shard_wd(tmp_path, extra={"sections.html": "<p>x</p>"})
    _, _, rules = assembled(tmp_path, wd)
    assert "files" in rules

def test_unclaimed_shard_file(tmp_path):
    wd = shard_wd(tmp_path, extra={"sections/3-c.html":
        '<section class="block" id="s3.c"><h2>C</h2></section>'})
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("3-c" in e.msg for e in errs)

def test_bad_plan_shape(tmp_path):
    wd = shard_wd(tmp_path, plan_over={"shards": [{"id": "1"}]})
    _, _, rules = assembled(tmp_path, wd)
    assert "plan" in rules

def test_shard_file_missing(tmp_path):
    wd = shard_wd(tmp_path)
    (wd / "data/2-b.js").unlink()
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("2-b.js" in e.msg for e in errs)

def test_plan_theme_mismatch(tmp_path):
    wd = shard_wd(tmp_path, plan_over={"theme": "ghost"})
    _, errs, rules = assembled(tmp_path, wd)
    assert "plan" in rules and any("ghost" in e.msg for e in errs)

def test_plan_declares_unknown_component(tmp_path):
    wd = shard_wd(tmp_path, plan_over={})  # shard 1 declares demo; add a shard with ghost
    plan = json.loads((wd / "plan.json").read_text(encoding="utf-8"))
    plan["shards"][1]["components"] = ["ghost"]
    (wd / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    _, _, rules = assembled(tmp_path, wd)
    assert "plan" in rules
```

- [ ] **Step 2: Run** — `python -m pytest tests/test_shards.py -q` → FAIL (no `plan` rule, monolith-required error paths).

- [ ] **Step 3: Implement** in `v2/build.py`:

```python
SHARD_ID_RE = re.compile(r"^(?:[0-9]{1,2}G?|G)$")
KEY_PREFIX_RE = re.compile(r"^s[0-9A-Z][0-9A-Z-]*$")


def load_plan(workdir, errors):
    p = workdir / "plan.json"
    try:
        plan = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(Err("plan", "plan.json", getattr(exc, "lineno", None),
                          "cannot parse plan.json: %s" % exc, "fix the JSON"))
        return None
    if (not isinstance(plan, dict) or not isinstance(plan.get("shards"), list)
            or not plan["shards"]):
        errors.append(Err("plan", "plan.json", None,
                          "plan.json must be an object with a non-empty 'shards' list",
                          "see spec 2026-09-16 chunked-subagent design 4"))
        return None
    return plan


class Shard:
    def __init__(self, sid, key_prefix, html_rel, js_rel, components):
        self.id, self.key_prefix = sid, key_prefix
        self.html_rel, self.js_rel = html_rel, js_rel
        self.components = list(components or [])
        self.html, self.js = "", ""


def validate_plan(plan, workdir, cfg, errors):
    shards, claimed, seen_ids = [], {}, set()
    for ent in plan["shards"]:
        where = "plan.json shard %r" % (ent.get("id") if isinstance(ent, dict) else ent)
        if (not isinstance(ent, dict)
                or not all(k in ent for k in ("id", "files", "key_prefix", "components"))):
            errors.append(Err("plan", "plan.json", None,
                              "shard entry needs id, files, key_prefix, components: %s" % where, ""))
            continue
        sid, kp = ent["id"], ent["key_prefix"]
        if not isinstance(sid, str) or not SHARD_ID_RE.match(sid):
            errors.append(Err("plan", "plan.json", None,
                              "bad shard id %r (use 0, 1..8, G or e.g. 0G)" % sid, ""))
            continue
        if sid in seen_ids:
            errors.append(Err("plan", "plan.json", None, "duplicate shard id %r" % sid, ""))
            continue
        seen_ids.add(sid)
        if not isinstance(kp, str) or not KEY_PREFIX_RE.match(kp):
            errors.append(Err("plan", "plan.json", None,
                              "bad key_prefix %r for shard %s (s<UPPER_ALNUM>)" % (kp, sid), ""))
            continue
        files = ent["files"]
        if (not isinstance(files, list) or len(files) != 2
                or not any(str(f).startswith("sections/") and str(f).endswith(".html") for f in files)
                or not any(str(f).startswith("data/") and str(f).endswith(".js") for f in files)):
            errors.append(Err("plan", "plan.json", None,
                              "shard %s files must be [sections/X.html, data/X.js]" % sid, ""))
            continue
        hrel = next(f for f in files if str(f).startswith("sections/"))
        jrel = next(f for f in files if str(f).startswith("data/"))
        if Path(hrel).stem != Path(jrel).stem:
            errors.append(Err("plan", "plan.json", None,
                              "shard %s: file stems differ (%s / %s)" % (sid, hrel, jrel), ""))
            continue
        if hrel in claimed or jrel in claimed:
            errors.append(Err("plan", "plan.json", None, "file claimed twice: %s" % hrel, ""))
            continue
        texts = {}
        ok = True
        for rel in (hrel, jrel):
            f = workdir / rel
            if not f.is_file():
                errors.append(Err("plan", rel, None,
                                  "shard %s file missing in workdir" % sid, ""))
                ok = False
            else:
                texts[rel] = read_text(f, errors)
        if not ok:
            continue
        for c in ent["components"]:
            if c not in cfg.get("components", []):
                errors.append(Err("plan", "plan.json", None,
                                  "shard %s declares component %r absent from build.json"
                                  % (sid, c), "add it to build.json components"))
        claimed[hrel] = claimed[jrel] = sid
        s = Shard(sid, kp, hrel, jrel, ent["components"])
        s.html, s.js = texts[hrel], texts[jrel]
        shards.append(s)
    for d in ("sections", "data"):
        dirp = workdir / d
        if dirp.is_dir():
            suffix = ".html" if d == "sections" else ".js"
            for f in sorted(dirp.glob("*" + suffix)):
                rel = "%s/%s" % (d, f.name)
                if rel not in claimed:
                    errors.append(Err("plan", rel, None,
                                      "shard file not claimed by any plan.json shard",
                                      "add a shard entry for it"))
    for k in ("title", "theme"):
        if k in plan and cfg.get(k) is not None and plan[k] != cfg[k]:
            errors.append(Err("plan", "plan.json", None,
                              "plan.json %s %r != build.json %r" % (k, plan[k], cfg[k]),
                              "single source of truth: build.json"))
    return shards


def collect_parts(shards):
    return (Parts([(s.html_rel, s.html) for s in sorted(shards, key=lambda x: x.html_rel)]),
            Parts([(s.js_rel, s.js) for s in sorted(shards, key=lambda x: x.js_rel)]))
```

Wire into `assemble`: replace the monolith required-file block (the loop adding `("sections", "sections.html"), ("data", "data.js")`) with layout detection. Keep `tune.css` exactly as today (shared by both modes, same `files` error message):

```python
    parts = {}
    f = workdir / "tune.css"
    if not f.exists():
        errors.append(Err("files", "tune.css", None, "missing in workdir",
                          "the 4 required files are build.json, tune.css, sections.html, data.js"))
    else:
        parts["tune"] = read_text(f, errors)

    has_shards = (workdir / "sections").is_dir() or (workdir / "data").is_dir()
    shards = []
    plan = load_plan(workdir, errors) if (workdir / "plan.json").exists() else None
    if plan is not None:
        shards = validate_plan(plan, workdir, cfg, errors)
        if not has_shards:
            errors.append(Err("plan", "plan.json", None,
                              "plan.json present but no sections/ or data/ directory", ""))
        for fname in ("sections.html", "data.js"):
            if (workdir / fname).exists():
                errors.append(Err("files", fname, None,
                                  "monolith %s alongside shard layout" % fname,
                                  "delete %s; shards are the source" % fname))
        if not errors:
            parts["sections"], parts["data"] = collect_parts(shards)
    else:
        if has_shards:
            errors.append(Err("plan", "plan.json", None,
                              "shard directories present but plan.json missing",
                              "fan-out builds need plan.json (spec 2026-09-16 3)"))
        for key, fname in (("sections", "sections.html"), ("data", "data.js")):
            f = workdir / fname
            if not f.exists():
                errors.append(Err("files", fname, None, "missing in workdir",
                                  "monolith build needs sections.html + data.js; "
                                  "fan-out needs plan.json + sections/ + data/"))
            else:
                parts[key] = Parts([(fname, read_text(f, errors))])
```

Keep the existing `if errors: return None, errors` short-circuit (it already precedes the marker/hex/contrast phase). Pass `shards` forward; Task 3 consumes it. All downstream uses of `parts["sections"]` / `parts["data"]` already take `.text` / the `Parts` object from Task 1.

- [ ] **Step 4: Run** — `python -m pytest tests -q` → new shard tests pass, all existing tests green (monolith untouched).

- [ ] **Step 5: Commit** — `git add v2/build.py tests/test_shards.py; git commit -m "feat(build): plan.json validation + per-section shard assembly (v2.1, spec 3-4)"`

---

### Task 3: Prefix enforcement, shard-local data keys, cross-shard duplicate keys

**Files:**
- Modify: `v2/build.py` (`check_prefix`, `check_dupe_keys`, `check_shard_mounts`; call from `assemble` when `shards`)
- Test: `tests/test_shards.py` (append)

**Interfaces:**
- Consumes: `Shard` objects with `.html/.js` text and rel names (Task 2).
- Produces: rule names `prefix` (plus reused `data`); functions `check_prefix(shards, errors)`, `check_dupe_keys(data_src, errors)`, `check_shard_mounts(shards, errors)`.

- [ ] **Step 1: Write failing tests** (append to `tests/test_shards.py`):

```python
def test_prefix_section_id_violation(tmp_path):
    wd = shard_wd(tmp_path, extra={"sections/1-a.html":
        '<section class="block" id="wrong.a"><h2>A</h2></section>'})
    _, errs, rules = assembled(tmp_path, wd)
    assert "prefix" in rules and any(e.file == "sections/1-a.html" for e in errs)

def test_prefix_data_key_violation(tmp_path):
    wd = shard_wd(tmp_path, extra={"data/2-b.js": "LN.data.bogus={};"})
    _, errs, rules = assembled(tmp_path, wd)
    assert "prefix" in rules and any("bogus" in e.msg for e in errs)

def test_mount_key_not_local(tmp_path):
    wd = shard_wd(tmp_path, extra={"sections/2-b.html":
        '<section class="block" id="s2.b"><div data-component="demo" data-key="s1k"></div></section>'})
    _, errs, rules = assembled(tmp_path, wd)
    assert "data" in rules and any("s1k" in e.msg for e in errs)

def test_duplicate_data_key_cross_shard(tmp_path):
    wd = shard_wd(tmp_path, extra={"data/2-b.js": "LN.data.s1k={};",
        "sections/2-b.html": '<section class="block" id="s2.b">'
        '<div data-component="demo" data-key="s1k"></div></section>'})
    _, errs, rules = assembled(tmp_path, wd)
    assert "data" in rules and any("duplicate" in e.msg for e in errs)

def test_monolith_duplicate_key_caught(tmp_path):
    import test_build as tb
    _, errs = tb.run(tmp_path, files={"data.js": "LN.data.gl={};LN.data.gl={};"})
    assert "data" in [e.rule for e in errs] and any("duplicate" in e.msg for e in errs)
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** (add after `check_mounts`):

```python
def check_prefix(shards, errors):
    for s in shards:
        for m in re.finditer(r"<section\b[^>]*>", s.html):
            tag = m.group(0)
            if not re.search(r'class="[^"]*\bblock\b[^"]*"', tag):
                continue
            im = re.search(r'\bid="([^"]*)"', tag)
            if im and not im.group(1).startswith(s.key_prefix + "."):
                errors.append(Err("prefix", s.html_rel,
                                  s.html.count("\n", 0, m.start()) + 1,
                                  "section id %r outside prefix %r" % (im.group(1), s.key_prefix + "."),
                                  "plan assigns %s.* ids to this shard" % s.key_prefix))
        for m in KEY_RE.finditer(s.js):
            key = m.group(1) or m.group(2)
            if not key.startswith(s.key_prefix):
                errors.append(Err("prefix", s.js_rel,
                                  s.js.count("\n", 0, m.start()) + 1,
                                  "data key %r outside prefix %r" % (key, s.key_prefix),
                                  "define only %s* keys in this shard" % s.key_prefix))


def check_dupe_keys(data_src, errors):
    seen = set()
    for m in KEY_RE.finditer(data_src.text):
        key = m.group(1) or m.group(2)
        if key in seen:
            f, ln = data_src.where(m.start())
            errors.append(Err("data", f, ln, "duplicate LN.data key %r" % key,
                              "each key must be assigned exactly once"))
        seen.add(key)


def check_shard_mounts(shards, errors):
    for s in shards:
        defined = set()
        for m in KEY_RE.finditer(s.js):
            defined.add(m.group(1) or m.group(2))
        for m in re.finditer(r"data-component=", s.html):
            tag = s.html[s.html.rfind("<", 0, m.start()):
                         s.html.find(">", m.end()) + 1]
            name = re.search(r'data-component="([^"]*)"', tag)
            key = re.search(r'data-key="([^"]*)"', tag)
            name = name.group(1) if name else "?"
            ln = s.html.count("\n", 0, m.start()) + 1
            if name not in s.components:
                errors.append(Err("plan", s.html_rel, ln,
                                  "mount %r not in plan components for shard %s" % (name, s.id),
                                  "shards may only mount components their plan entry lists"))
            if key and key.group(1) not in defined:
                errors.append(Err("data", s.html_rel, ln,
                                  "data-key %r not defined in this shard's data file (%s)"
                                  % (key.group(1), s.js_rel),
                                  "keys are shard-local; move the definition or rename"))
```

Call in `assemble` after the existing `check_mounts(...)` line, monolith-safe (`shards` is `[]` then):

```python
    check_dupe_keys(parts["data"], errors)
    if shards:
        check_prefix(shards, errors)
        check_shard_mounts(shards, errors)
```

- [ ] **Step 4: Run** — `python -m pytest tests -q` all green (duplicate-key check now also fires for monolith; existing fixtures have no dupes).

- [ ] **Step 5: Commit** — `git add v2/build.py tests/test_shards.py; git commit -m "feat(build): shard prefix enforcement + local data keys + global dup-key check (spec 3, 7)"`

---

### Task 4: `build.py --lint <shard-id>` (per-shard self-check for writers)

**Files:**
- Modify: `v2/build.py` (new `lint_shard(workdir, shard_id) -> list[Err]`; `main` argument handling; docstring usage line)
- Test: `tests/test_shards.py` (append; lint failures via `build.main`, clean via too)

**Interfaces:**
- Consumes: `load_plan`, `validate_plan`, `check_prefix`, `check_mounts` (with `list_label`), `scan`, `check_wellformed`, `check_js`, `HEX_RE`, `EXTERNAL_RE`, `JS_TAG_RE` — all existing.
- Produces: CLI `python build.py <workdir> --lint <shard-id> [--skeleton DIR]` → prints `LINT OK - shard <id> clean` / reuses `report()` + `FAIL - lint ...`; exit 0/1; never reads skeleton, never writes output. Function `lint_shard` importable by tests.

- [ ] **Step 1: Write failing tests** (append):

```python
def lint(tmp_path, shard_id="1", extra=None, plan_mut=None):
    wd = shard_wd(tmp_path, extra=extra)
    if plan_mut:
        plan = json.loads((wd / "plan.json").read_text(encoding="utf-8"))
        plan_mut(plan)
        (wd / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    return wd, build.lint_shard(wd, shard_id)

def test_lint_clean(tmp_path):
    _, errs = lint(tmp_path)
    assert errs == [], [str(e) for e in errs]

def test_lint_cli_ok_exit0(tmp_path):
    wd, _ = lint(tmp_path)
    assert build.main([str(wd), "--lint", "1"]) == 0

def test_lint_cli_bad_exit1_writes_nothing(tmp_path):
    wd, errs = lint(tmp_path, extra={"sections/1-a.html":
        '<section class="block" id="s1.a" style="color:#f00"></section>'})
    assert build.main([str(wd), "--lint", "1"]) == 1
    assert not (wd / "out.html").exists()
    assert "hex" in [e.rule for e in errs]

def test_lint_unknown_shard(tmp_path):
    _, errs = lint(tmp_path, shard_id="9")
    assert "plan" in [e.rule for e in errs]

def test_lint_catches_wrong_prefix(tmp_path):
    _, errs = lint(tmp_path, extra={"sections/1-a.html":
        '<section class="block" id="bad.x"></section>'})
    assert "prefix" in [e.rule for e in errs]

def test_lint_catches_foreign_mount(tmp_path):
    def mut(plan):
        plan["shards"][0]["components"] = []
    _, errs = lint(tmp_path, plan_mut=mut)
    assert "plan" in [e.rule for e in errs]

def test_lint_catches_close_tag_js(tmp_path):
    _, errs = lint(tmp_path, extra={"data/1-a.js": "LN.data.s1k={t:'</b>'};"})
    assert "js" in [e.rule for e in errs]

def test_lint_ignores_global_and_palette_rules(tmp_path):
    # duplicate id across shards, bad contrast, missing print: all pass lint,
    # fail the full build only
    _, errs = lint(tmp_path, extra={"sections/1-a.html":
        '<section class="block" id="s1.a"></section>'
        '<section class="block" id="s1.a"></section>'})
    assert errs == [], [str(e) for e in errs]
    _, _, rules = assembled(tmp_path, shard_wd(tmp_path, extra={"sections/1-a.html":
        '<section class="block" id="s1.a"></section>'
        '<section class="block" id="s1.a"></section>'}))
    assert "ids" in rules
```

- [ ] **Step 2: Run** → FAIL (`lint_shard` undefined).

- [ ] **Step 3: Implement**:

```python
def lint_shard(workdir, shard_id):
    errors = []
    cfg_path = workdir / "build.json"
    if not cfg_path.is_file():
        return [Err("build.json", "build.json", None, "missing", "")]
    try:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [Err("build.json", "build.json", exc.lineno, "invalid JSON: %s" % exc.msg, "")]
    plan = load_plan(workdir, errors)
    if plan is None:
        return errors
    shards = validate_plan(plan, workdir, cfg, errors)
    if errors:
        return errors
    target = next((s for s in shards if s.id == shard_id), None)
    if target is None:
        return errors + [Err("plan", "plan.json", None,
                             "no shard %r in plan; ids: %s"
                             % (shard_id, ", ".join(s.id for s in shards)), "")]
    hs = Parts([(target.html_rel, target.html)])
    errs = []
    errs.extend(scan(hs, HEX_RE, "hex", hs, "hard-coded colour",
                     "sections use classes; colours come from tokens"))
    errs.extend(scan(target.js, HEX_RE, "hex", target.js_rel, "hard-coded colour in data",
                     "data carries content, not colours"))
    errs.extend(scan(hs, EXTERNAL_RE, "external", hs, "external asset",
                     "no http, no @import, gradient-only url()"))
    errs.extend(scan(target.js, EXTERNAL_RE, "external", target.js_rel, "external asset",
                     "no http, no @import, gradient-only url()"))
    errs.extend(check_js(target.js, target.js_rel))
    check_wellformed(target.html, hs, errs)
    check_mounts(hs, target.js, set(target.components), errs,
                 list_label="plan components for shard %s" % shard_id)
    check_shard_mounts([target], errs)
    check_prefix([target], errs)
    return errs
```

(If a rule fires both globally in `check_mounts` and locally in `check_shard_mounts`, dedupe by `(rule, file, line, msg)` before returning — one line: `seen = []; for e in errs: if (e.rule, e.file, e.line, e.msg) not in seen: ...`. Keep messages as emitted by the two helpers.)

`main`: parse `--lint` like `--skeleton` (index, require value, remove from argv). When present, after `workdir` resolution:

```python
    if lint_id is not None:
        lerrs = lint_shard(workdir, lint_id)
        if lerrs:
            report(lerrs)
            print("FAIL - lint shard %s: %d problem(s)" % (lint_id, len(lerrs)))
            return 1
        print("LINT OK - shard %s clean" % lint_id)
        return 0
```

Update the module docstring usage line to `python build.py <workdir> [--skeleton DIR] [--lint SHARD_ID]`.

- [ ] **Step 3b: Scope `validate_plan` to the target shard (fixes the fan-out self-check).** During fan-out a writer runs `--lint <id>` while sibling shards are being written in parallel and may not exist yet. `validate_plan` as written in Task 2 emits `shard N file ... missing` for EVERY declared shard, so a clean target would still exit 1 until all siblings land — defeating the per-writer self-check. Add an optional `scope=None` parameter to `validate_plan` that, when set, reports ONLY problems about the target shard (the whole fan-out point) and tolerates any other shard being in any state:

```python
def validate_plan(plan, workdir, cfg, errors, scope=None):
    # ... existing per-entry loop, with two guards keyed on `scope`:
    #   * a shard whose id != scope: if scope is not None, do NOT read/validate its
    #     files (skip the "file missing" branch and skip adding it to `shards`);
    #     still validate `scope`'s own entry fully.
    #   * the cross-shard sweeps (duplicate-id ACROSS shards, unclaimed-file glob,
    #     plan-vs-build.json title/theme mismatch) run ONLY when scope is None
    #     (they are whole-build concerns).
    # `scope=None` (the default, used by assemble) => behavior byte-identical to Task 2/3.
```

Call it from `lint_shard` as `shards = validate_plan(plan, workdir, cfg, errors, scope=shard_id)`, then `if errors: return errors`; `target = shards[0] if shards else None` (a scope present guarantees at most one shard), keeping the existing unknown-shard error when `target is None`. A bad id/prefix/shape/own-missing-file on the TARGET still errors (correct); a sibling's absence never does.

Add the regression test that pins the flaw (this is the load-bearing new assertion):

```python
def test_lint_tolerates_missing_sibling_shards(tmp_path):
    # writer self-checks shard 1 while shard 2's files are not yet on disk
    wd, errs = lint(tmp_path, shard_id="1")
    (wd / "sections/2-b.html").unlink()
    (wd / "data/2-b.js").unlink()
    assert build.lint_shard(wd, "1") == [], "target lint must ignore absent siblings"
    # ...but the target's OWN missing file is still caught:
    (wd / "data/1-a.js").unlink()
    assert "plan" in [e.rule for e in build.lint_shard(wd, "1")]
```

- [ ] **Step 4: Run** — `python -m pytest tests -q` all green.
- [ ] **Step 5: Commit** — `git add v2/build.py tests/test_shards.py; git commit -m "feat(build): --lint per-shard writer self-check (spec 7)"`

---

### Task 5: SKILL.md — definition-first contract (content rules only)

**Files:**
- Modify: `v2/SKILL.md` (Part 6 principle 2; Part 5 QA bullets; add the example pair inside §2.1's terseness paragraph region)

**Interfaces:**
- Consumes: nothing.
- Produces: canonical contract + BAD/GOOD example text reused verbatim by Task 6's Brief Template; QA-pass line names the orchestrator flow can reference.

- [ ] **Step 1: Replace Principle 2** — in `v2/SKILL.md` Part 6, replace the line beginning `2. Definition, then example — short.` with:

```markdown
2. **Definition-first.** A named thing may not *appear* before it is *defined*. Every
   concept gets a `.def` line — genus + differentia, one sentence — before any prose,
   mnemonic, or scenario touches it. Chain paragraphs, `.mini` examples, and component
   readouts may only *reference* defined terms; they never carry load-bearing
   definitions. Writer self-test: *"could a student write the exam answer using only
   my `.def`/`.mini` boxes?"* Then the example — short. `.def`/`.mini` by default,
   prose only to connect.
```

- [ ] **Step 2: Add the example pair** — at the end of §2.1 (after the "Terseness inside boxes…" sentence block), insert:

```markdown
**Definition-first worked pair** (canonical bad → canonical good):

> BAD: *"Plot yields against time to maturity — same credit class, same currency — and
> the stack becomes a line: the term structure of interest rates."* (metaphor before
> concept; the definition is buried in a scene)
>
> GOOD: `<div class="def"><b>Term structure of interest rates</b> — a plot of yields
> against time to maturity for same-credit, same-currency bonds.</div>` then each
> shape (`normal`, `inverted`, `flat`) and each theory (`expectations`, `liquidity
> premium`, `market segmentation`) defined in the same way; metaphor and mnemonic
> ("a bank's licence to borrow short, lend long") may appear only *after* the `.def`.
```

- [ ] **Step 3: Part 5 QA additions** — append two bullets to the "Still yours to verify" list:

```markdown
- **Definition-first (§6.2).** Every load-bearing term in the shipped file maps to a
  `.def` that appears before first use in its section; prose that defines is rewritten
  to reference.
- **Glossary stragglers (§2.0).** Terms that made it into shards but not the locked
  plan list are added to the glossary block and `data.js` glossary entry (one targeted
  edit, rebuild).
```

- [ ] **Step 4: Verify wording only** — `git diff` review; no tests to run (markdown).
- [ ] **Step 5: Commit** — `git add v2/SKILL.md; git commit -m "docs(SKILL): definition-first contract + worked pair + QA lines (spec 6)"`

---

### Task 6: SKILL.md — v2.1 frontmatter + fan-out orchestration + Brief Template

**Files:**
- Modify: `v2/SKILL.md` (frontmatter; new "What v2.1 changes" line after the v2.0 paragraph; §1.1 shard layout; §2.3 fan-out trigger; Part 4 split 4A/4B; Part 8 approval gate note; new Appendix A)

**Interfaces:**
- Consumes: Task 5's verbatim contract + example pair; `--lint` CLI and `plan.json` fields exactly as implemented in Tasks 2–4 (`id, section, files, components, key_prefix, open_handoff, close_handoff, must_teach`, optional `source_excerpt`).
- Produces: the fan-out protocol the orchestrator + writer subagents follow; the Brief Template that writer prompts are built from.

- [ ] **Step 1: Frontmatter + headline** — change `version: 2.0` → `version: 2.1`; extend the description with: `For long lessons it fans out per-section subagent writers via plan.json + sharded parts; monolith v2.0 workdirs still build unchanged.` After the "What v2.0 changes" paragraph add:

```markdown
What v2.1 adds: **fan-out authorship**. On long lessons one agent's context goes
description-first and quality drifts; so a whole-lesson planner (the orchestrator)
scripts the outline, hand-offs and glossary up front, and one **section writer per
shard** authors just its section from a brief + its slice of the source. Mechanics
still live in assets; `build.py` now also validates the plan and can lint a single
shard. The monolith flow below (4A) is unchanged and still the default for ≤3 pages
or harnesses without subagents.
```

- [ ] **Step 2: §1.1 shard layout** — after the four-files table add:

```markdown
**Fan-out layout** (instead of `sections.html` + `data.js`, with a `plan.json` —
`build.json`, `tune.css` unchanged): `sections/<stem>.html` + `data/<stem>.js` per
section (`00-overview`, `0G-glossary`, `1-concepts`, …), filename-sorted into one
stream. `build.py` auto-detects the layout; mixing monolith + shards is an error.
Each shard owns ids `sN.*` and data keys `sN*` (prefixes from the plan) — enforced.
```

- [ ] **Step 3: §2.3** — replace `16–40 → expand case bank and quiz to 15–20 items.` with `16–40 → expand case bank and quiz to 15–20 items **and use the fan-out flow (4B)**.`

- [ ] **Step 4: Part 4 dual mode** — rename `## Part 4 — Build order` content to `### 4A — Monolith (default)` keeping the 6 numbered steps verbatim; append `### 4B — Fan-out (lessons ≥ 4 pages or 16–40 pages, per §2.3)` with the spec-5 protocol:

```markdown
1. Read the whole source once. Run the §2.1 meld decision and the §1.2 pack pick.
   Stage normalized source text at `build/<slug>/source/<slug>.txt` with line numbers.
2. Write `build/<slug>/plan.json`: `title`, `theme`, `glossary_terms` (locked list:
   every technical term + one-line source-phrased def), and one shard entry per
   notebook section — `id` (`0`, `G`, `1`…`8`), `section`, `files`
   (`sections/NN-slug.html`, `data/NN-slug.js`), `components` (registry names),
   `key_prefix` (`sN`), scripted `open_handoff` / `close_handoff` sentences,
   `must_teach` (facts pulled from the MILO dependency list), `source_excerpt`
   pointer (`source/<slug>.txt#lines=A-B`).
3. **Plan approval gate:** present the §8 opening message — it *is* the announced
   outline map; get user approval before dispatch.
4. Dispatch one writer per shard (harness subagent tooling). No subagents? Run the
   identical briefs serially yourself, one shard per turn, touching only that shard's
   two files until all are written.
5. Writer (per brief, Appendix A): reads **only** the brief + its `source_excerpt`,
   writes its two files, runs `python <skill>/build.py <workdir> --lint <shard-id>`,
   fixes, reruns until `LINT OK`. Returns: shard paths + lint confirmation.
6. Orchestrator runs the full build. Cross-cutting failures (id collisions, plan ↔
   build.json, contrast, markers) → fix yourself. Concentrated shard failures →
   re-dispatch a **fix brief** (itemized report lines + original brief + the shard's
   current text). Loop until `OK`. The assembled file stays read-only.
7. Judgment QA (Part 5, incl. definition-first + glossary stragglers).
8. Hand over; propose promotions (§3.3) as usual.
```

- [ ] **Step 5: Part 8** — append to the opening-message template block:

```markdown
In fan-out mode the opening message doubles as the plan approval gate (4B step 3):
add `Shards: <count> (one per section) — approve before dispatch.`
```

- [ ] **Step 6: Appendix A** — append at end of file:

```markdown
## Appendix A — Section-writer Brief (self-contained; writers never read SKILL.md)

    You are the SECTION WRITER for "<section title>" of "<lesson title>".
    Write exactly two files and nothing else:
      <workdir>/sections/<stem>.html   — one <section class="block" id="<key_prefix>.x"> … </section>
      <workdir>/data/<stem>.js          — only LN.data.<key_prefix>… assignments
    Read your source ONLY from: <source_excerpt pointer> (read those lines).
    Plan entry for your shard (authoritative — do not widen it):
      components: <json list>   key_prefix: <sN>   id prefix: <sN>.
    OPENING (first paragraph, near-verbatim): <open_handoff>
    CLOSING (last sentence, near-verbatim): <close_handoff>
    MUST TEACH (every line lands in a .def/.mini/mount): <must_teach list>
    LOCKED GLOSSARY (use these terms; do not define your own competitors):
      <term — def lines>
    HARD RULES: no hex colours anywhere; no http/@import/non-gradient url(); every
    mount is <div data-component="NAME" data-key="<key_prefix>NAME"></div> using only
    your components list, with the key defined in YOUR data file; never write "</ +
    letter in JS (escape <\/ or pass plain text); component content goes in data.js,
    never inline HTML.
    DEFINITION-FIRST CONTRACT: a named thing may not appear before it is defined;
    every concept gets a .def line (genus + differentia, one sentence) before any
    prose, mnemonic, or scenario touches it; chain paragraphs and readouts only
    reference defined terms. Self-test: could a student write the exam answer using
    only your .def/.mini boxes?
    BAD (metaphor before concept): "…the stack becomes a line: the term structure…"
    GOOD: <div class="def"><b>Term structure of interest rates</b> — a plot of yields
    against time to maturity for same-credit, same-currency bonds.</div> then shapes,
    then theories, each defined before used; colour prose only after the .def.
    SELF-CHECK until clean, then stop:
      python <skill>/build.py <workdir> --lint <shard-id>
    Report which .def/.mini carries each must_teach line.
```

- [ ] **Step 7: Consistency check** — grep the file for `v2.0` leftovers that should read v2.1 (frontmatter, headings); the two "unchanged from v1.9" markers stay.
- [ ] **Step 8: Commit** — `git add v2/SKILL.md; git commit -m "feat(SKILL): v2.1 fan-out flow + brief template + shard layout docs (spec 4,5,8)"`

---

### Task 7: Fan-out e2e on the real sample lesson + README v2.1

**Files:**
- Test: `tests/test_e2e_fanout.py` (create)
- Modify: `README.md`

**Interfaces:**
- Consumes: `v2/sample/lesson-demo` — 9 `section.block` blocks in order (overview, glossary, costs, gate, lab, examples, limits, selfcheck, recap) whose mount keys (`milo0, gl, sort1, cmp1, gate2, lab3, ex4, rank5, match5, tf6, recap7`) each belong to exactly one section (verified by grep at plan time). `build.lint_shard` + `build.main` from Task 4.
- Produces: proof the shipped sample survives fan-out; docs updated.

- [ ] **Step 1: Write the failing test** — `tests/test_e2e_fanout.py`. The fixture splits the demo **one shard per section** (9 shards ≥ spec §9's "5 shards" requirement — a superset), renaming ids/keys to the plan prefixes (`s0.overview`, key `s0G` style → `LN.data.s0Ggl`), so every mechanical rule passes without touching the shipped sample:

```python
import json
import re
import shutil
from pathlib import Path

import build

REPO = Path(__file__).resolve().parents[1]
FIX = REPO / "v2" / "sample" / "lesson-demo"


def key_of(chunk):
    return re.match(r"LN\.data\.([A-Za-z_$][\w$]*)", chunk.strip()).group(1)


def split_demo(tmp_path):
    wd = tmp_path / "lesson"
    shutil.copytree(FIX, wd)
    sections = (wd / "sections.html").read_text(encoding="utf-8")
    data = (wd / "data.js").read_text(encoding="utf-8")
    cfg = json.loads((wd / "build.json").read_text(encoding="utf-8"))
    chunks = [b.strip() for b in re.split(r"(?=<section class=\"block\")", sections) if b.strip()]
    if not chunks[0].startswith("<section"):        # <header class="lesson-head"> prelude
        chunks[1] = chunks[0] + "\n" + chunks[1]    # rides along with the overview shard
        chunks.pop(0)
    dcut = re.search(r"(?=LN\.data\.)", data)
    data_prelude, data_body = data[:dcut.start()], data[dcut.start():]
    keys = [k.strip() for k in re.split(r"(?=LN\.data\.)", data_body) if k.strip()]
    (wd / "sections").mkdir()
    (wd / "data").mkdir()
    plan = {"title": cfg["title"], "theme": cfg["theme"], "shards": []}
    used = set()
    for i, blk in enumerate(chunks):
        sid = "0" if i == 0 else ("0G" if i == 1 else str(i))
        stem = {"0": "00-part", "0G": "0G-part"}.get(sid, sid + "-part") + str(i)
        kp = "s" + sid
        names = re.findall(r'data-key="([^"]+)"', blk)
        own = [k for k in keys if key_of(k) in names]
        used.update(names)
        blk = re.sub(r'\bid="([^"]+)"', lambda m: 'id="%s.%s"' % (kp, m.group(1)), blk)
        blk = re.sub(r'data-key="([^"]+)"', lambda m: 'data-key="%s%s"' % (kp, m.group(1)), blk)
        own = [re.sub(r"LN\.data\.([A-Za-z_$][\w$]*)",
                      lambda m: "LN.data.%s%s" % (kp, m.group(1)), k) for k in own]
        if i == 0 and own:
            own[0] = data_prelude.rstrip() + "\n" + own[0]   # data.js comment rides along
        (wd / "sections" / (stem + ".html")).write_text(blk, encoding="utf-8")
        (wd / "data" / (stem + ".js")).write_text("\n".join(own), encoding="utf-8")
        plan["shards"].append({"id": sid, "section": "part %d" % i, "key_prefix": kp,
                               "files": ["sections/%s.html" % stem, "data/%s.js" % stem],
                               "components": cfg["components"],
                               "open_handoff": "x", "close_handoff": "y",
                               "must_teach": ["x"]})
    assert used == {key_of(k) for k in keys}, "each sample key mounts in exactly one section"
    (wd / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    (wd / "sections.html").unlink()
    (wd / "data.js").unlink()
    return wd, [s["id"] for s in plan["shards"]]


def test_fanout_each_shard_lints_clean(tmp_path):
    wd, ids = split_demo(tmp_path)
    for sid in ids:
        assert build.lint_shard(wd, sid) == [], "shard %s: %s" % (sid, build.lint_shard(wd, sid))


def test_fanout_full_build(tmp_path):
    wd, _ = split_demo(tmp_path)
    assert build.main([str(wd)]) == 0
    out = (wd / "Week4-Demo-Notebook.html").read_text(encoding="utf-8")
    for tok in ("562.5", "Tumba", "break-even-lab", "@media print"):
        assert tok in out, tok
```

Filename stems (`00-part0`, `0G-part1`, `1-part2`…`8-part8`) sort into spec order (glossary between overview and section 1) by ASCII digits-before-letters. If `lint_shard` flags a genuinely mis-belonged key, fix the fixture's split regex, **never** the shipped sample.

- [ ] **Step 2: Run** — `python -m pytest tests/test_e2e_fanout.py -q` → implement/adjust fixture per note until PASS (test of pipeline, not of sample).
- [ ] **Step 3: README** — in `README.md`: bump heading line to `# Lesson Notebook Pipeline — \`interactive-lesson-notebook\` v2.1`; after the `v2.0 ships the mechanics` paragraph add:

```markdown
v2.1 adds **fan-out**: on long lessons an orchestrator writes `plan.json` (outline,
scripted hand-offs, locked glossary, per-shard prefixes) and dispatches one section
writer per shard (`sections/NN-*.html` + `data/NN-*.js`); each writer self-checks with
`build.py --lint <shard>`, and the full build refuses to write until every
cross-shard gate passes. Small lessons keep the 4-file monolith flow — byte-for-byte.
Authoring also hardens to **definition-first**: every concept gets a `.def` before
any prose touches it (see SKILL.md §6.2 worked pair).
```

Update the `build/<lesson>/` tree listing to show the optional `plan.json` + `sections/`/`data/` layout.

- [ ] **Step 4: Run everything** — `python -m pytest tests -q` → all green.
- [ ] **Step 5: Commit** — `git add tests/test_e2e_fanout.py README.md; git commit -m "test+docs: fan-out e2e on sample lesson; README v2.1"`

---

## Post-plan manual gate (outside tasks, after user approves)

1. Reinstall live skill: `robocopy v2 "$env:USERPROFILE\.claude\skills\interactive-lesson-notebook" /MIR /XD __pycache__`.
2. Convert one real 16–40 page lesson with 4B (first production run) — success criteria spec §11 #4 (fix loop converges ≤ 2 re-dispatch rounds) is judged there; brief-template wording fixes land as a follow-up commit if needed.
