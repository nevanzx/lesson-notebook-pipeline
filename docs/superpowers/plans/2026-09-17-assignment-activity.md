# Interactive Lesson Notebook v2.5 — Activities + Fullscreen Encrypted Assignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Self-Check to an **Assignment** (20 situational items answered in a hidden, fullscreened, copy-guarded slide deck that downloads an RSA+AES-encrypted JSON), label every content section's interactive component as an **Activity**, and write teacher answer keys to `build/key/` in the run directory.

**Architecture:** All pipeline work lands in `v2/build.py` (assembler+validator), `v2/skeleton/shell.html` (LN runtime), and one new component folder `v2/skeleton/components/assignment/`; a new grading tool `v2/tools/decrypt.py`; contract text in `v2/SKILL.md`; the reference build `v2/sample/lesson-demo/` grows the fifth component so every mechanical check is exercised end-to-end. The student HTML carries only the RSA **public** key; the private key lives in `<run dir>/build/key/keys.pem`.

**Tech Stack:** Python 3 stdlib (build.py), WebCrypto (AES-GCM + RSA-OAEP-SHA256) in browser JS, Python `cryptography` package for decrypt.py + round-trip tests (already installed: 49.0.0), pytest 9.

**Spec:** `docs/superpowers/specs/2026-09-17-assignment-activity-design.md`. One refinement: `week`/`subject` are required **only when** `"assignment"` is in `components`, so existing non-assignment builds and all legacy fixtures stay valid.

## Global Constraints

- Colours are tokens only (`var(--…)`). No hex in any new CSS/JS/HTML; component CSS keeps the existing build scan contract. `.lna-cover` uses `var(--ink)` for its black-out (dark on every tuned theme), not hex.
- No `http(s)://`, `@import`, non-gradient `url()`.
- No `alert()`/`confirm()`/`prompt()`; inline error boxes only.
- Every grid `fr` track = `minmax(0, Nfr)`; grid children get `min-width:0`.
- Component JS content-free (wording from `LN.data`); never the sequence `</` + letter.
- `build.json` new optional keys `"week"` (int ≥ 1), `"subject"` (non-empty string); both **required** iff `"assignment"` in `components`.
- Student filename: `"<name> - Week <week> - <subject>.json"`; sanitizer replaces `<>:"/\|?*` and control chars with `_`, then trims.
- Tests: `python -m pytest tests -q` from repo root (baseline 77 pass). `tests/conftest.py` already maps `v2/` onto `sys.path` (`import build`). Fixture helpers live in `tests/test_build.py` (`make_skel(tmp_path, shell=None, components=…)`, `MINI_SHELL`, `MINI_THEME`) — reuse that pattern.
- Commit per task with the given message.

---

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

### Task 2: Teacher keys — `ensure_teacher_keys()`, `key_id_for()`, `sanitize_filename()`

**Files:**
- Create: `v2/tools/__init__.py` (empty package marker)
- Create: `v2/tools/make_keys.py`
- Modify: `v2/build.py` (new imports at top: `base64`, `hashlib`; new module-level functions after `read_text` ~line 520)
- Create: `tests/test_assignment_keys.py`

**Interfaces:**
- Produces (Tasks 3 & 5 consume):
  - `build.ensure_teacher_keys(key_dir) -> {"id": str(12 hex), "pub_b64": str, "pem": Path}` — parses `key_dir/keys.pem`; generates it via `tools.make_keys.generate_pem` when absent; raises `ValueError` on corrupt/missing blocks.
  - `build.key_id_for(pub_der: bytes) -> str` — sha256 hexdigest [:12].
  - `build.sanitize_filename(s: str) -> str`.

- [ ] **Step 1: Write the failing tests** — `tests/test_assignment_keys.py`:

```python
import base64
import hashlib
import pytest
import build
from cryptography.hazmat.primitives import serialization


def test_keys_generate_then_reuse(tmp_path):
    kd = tmp_path / "build" / "key"
    a = build.ensure_teacher_keys(kd)
    assert (kd / "keys.pem").exists()
    text = (kd / "keys.pem").read_text(encoding="utf-8")
    assert "BEGIN PRIVATE KEY" in text and "BEGIN PUBLIC KEY" in text
    b = build.ensure_teacher_keys(kd)
    assert a == b  # stable: same id, same pub_b64, same pem path
    pub = serialization.load_der_public_key(base64.b64decode(a["pub_b64"]))
    assert pub.key_size >= 2048
    assert a["id"] == hashlib.sha256(base64.b64decode(a["pub_b64"])).hexdigest()[:12]


def test_corrupt_key_file_raises(tmp_path):
    kd = tmp_path / "build" / "key"
    kd.mkdir(parents=True)
    (kd / "keys.pem").write_text("not a pem", encoding="utf-8")
    with pytest.raises(ValueError):
        build.ensure_teacher_keys(kd)


def test_sanitize_filename():
    assert build.sanitize_filename('Dela Cruz, Juan') == 'Dela Cruz, Juan'
    assert build.sanitize_filename('Reyes / Co') == 'Reyes _ Co'
    assert build.sanitize_filename('José<>:"/\\|?*') == 'José.'
    assert build.sanitize_filename('  ok  ') == 'ok'
    assert build.sanitize_filename('') == 'unnamed'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_keys.py -q`
Expected: FAIL — attribute errors.

- [ ] **Step 3: Implement**

`v2/tools/__init__.py`: empty file.

`v2/tools/make_keys.py` (complete file):

```python
"""Generate the teacher keypair file keys.pem (RSA-3072, PKCS8 + SPKI PEM).

Used by build.py's ensure_teacher_keys(): the run directory's build/key/
keys.pem carries both PEM blocks; only the PUBLIC half is ever embedded in a
student HTML. Needs: pip install cryptography.
"""
import hashlib
from datetime import datetime
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

HEADER = "# LN assignment teacher key  id: {kid}  created: {ts}\n"


def generate_pem(pem_path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    pub_der = key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo)
    kid = hashlib.sha256(pub_der).hexdigest()[:12]
    pub_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo)
    prv_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption())
    Path(pem_path).parent.mkdir(parents=True, exist_ok=True)
    Path(pem_path).write_bytes(
        HEADER.format(kid=kid, ts=datetime.now().strftime("%Y-%m-%d %H:%M"))
        .encode("utf-8") + pub_pem + prv_pem)
    return kid
```

`v2/build.py` — new imports at top with the others (`import base64`, `import hashlib`) and after `read_text`:

```python
PUB_RE = re.compile(r"-----BEGIN PUBLIC KEY-----(.*?)-----END PUBLIC KEY-----", re.S)
PRV_RE = re.compile(r"-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----", re.S)


def key_id_for(pub_der):
    return hashlib.sha256(pub_der).hexdigest()[:12]


def sanitize_filename(s):
    s = str(s)
    s = "".join("_" if (ord(c) < 32 or c in '<>:"/\\|?*') else c for c in s)
    s = s.strip()
    return s or "unnamed"


def ensure_teacher_keys(key_dir):
    """Parse (or generate-once-then-parse) the run dir's teacher keypair.

    keys.pem lives at <run dir>/build/key/keys.pem, carries a PRIVATE and a
    PUBLIC PEM block. Returns {"id", "pub_b64", "pem"}; ValueError on damage.
    """
    pem_path = Path(key_dir) / "keys.pem"
    if not pem_path.exists():
        try:
            from tools.make_keys import generate_pem
        except ImportError as exc:
            raise ValueError("cannot create keys.pem: 'cryptography' package "
                             "missing (pip install cryptography): %s" % exc)
        generate_pem(pem_path)
    text = pem_path.read_text(encoding="utf-8")
    pm, pr = PUB_RE.search(text), PRV_RE.search(text)
    if not (pm and pr):
        raise ValueError("keys.pem unreadable: missing PUBLIC/PRIVATE PEM block "
                         "(delete the file to regenerate)")
    pub_der = base64.b64decode("".join(pm.group(1).split()))
    return {"id": key_id_for(pub_der), "pem": pem_path,
            "pub_b64": base64.b64encode(pub_der).decode("ascii")}
```

(The `from tools.make_keys …` import works for both `pytest` runs — `v2/` on `sys.path` — and CLI runs, because build.py itself sits in `v2/`; when running `python v2/build.py`, add to `ensure_teacher_keys`' import branch a `sys.path` nudge: `sys.path.append(str(Path(__file__).resolve().parent))` before the import, guarded by a `if str(...) not in sys.path`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_assignment_keys.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add v2/build.py v2/tools/ tests/
git commit -m "feat(v2.5): teacher keypair in run-dir build/key + key id + filename sanitizer"
```

---

### Task 3: Assignment data contract — extract, validate 10/4/4/2, write key file

**Files:**
- Modify: `v2/build.py` (functions after Task 2's; wiring in `assemble()` after `check_mounts` + after component-JS substitution + return-tuple change; wiring in `main()` after the HTML write)
- Create: `tests/test_assignment_contract.py`

**Interfaces:**
- Consumes: Task 2's functions.
- Produces:
  - `build.extract_assignment(sections_text, data_text, errors) -> (key_name|None, data|None)`; errors carry rule `"assign"`.
  - `build.validate_assignment(data, errors)` — rule `"assign"`: exactly 20 items; mix `mc==10, tf==4, id==4, sa==2`; mc: exactly 4 non-empty `choices` + `ans` int 0..3; tf: boolean `ans`; id: non-empty string-list `aliases`; sa: non-empty string-list `key_points`; every prompt non-empty.
  - `build.write_key_file(run_dir, cfg, data, keys) -> Path` — `<run_dir>/build/key/<output stem>-key.json` with `{lesson, output, week, subject, key_id, public_key_b64, decrypt, items:[{n,type,prompt,choices?,ans?|aliases?|key_points?}]}`.
  - `assemble()` returns `(out, errors, ctx)` where `ctx = {"assign": data|None, "keys": keys|None}`; when the assignment data exists the component JS markers `__PUBKEY__`/`__KEYID__` get replaced in the assembled output; `main()` writes the key file after the HTML.

- [ ] **Step 1: Write the failing tests** — `tests/test_assignment_contract.py`:

```python
import json
import pytest
import build


def v20():
    items = []
    items += [{"type": "mc", "prompt": "q%d" % i,
               "choices": ["a", "b", "c", "d"], "ans": i % 4} for i in range(10)]
    items += [{"type": "tf", "prompt": "t%d" % i, "ans": i % 2 == 0}
              for i in range(4)]
    items += [{"type": "id", "prompt": "i%d" % j,
               "aliases": ["variable cost"]} for j in range(4)]
    items += [{"type": "sa", "prompt": "s%d" % j,
               "key_points": ["contribution margin"]} for j in range(2)]
    return {"intro": "i", "items": items}


def test_valid_mix_and_key_file(tmp_path):
    run = tmp_path / "run"
    run.mkdir()
    errs = []
    data = v20()
    build.validate_assignment(data, errs)
    assert not errs, [str(e) for e in errs]
    keys = build.ensure_teacher_keys(run / "build" / "key")
    kf = build.write_key_file(run, {"title": "T", "output": "Week4-Notebook.html",
                                    "week": 4, "subject": "Mgmt"}, data, keys)
    assert kf.name == "Week4-Notebook-key.json"
    assert kf.parent.name == "key"
    body = json.loads(kf.read_text(encoding="utf-8"))
    assert body["week"] == 4 and body["key_id"] == keys["id"]
    assert len(body["items"]) == 20
    assert body["items"][0]["ans"] == 0 and body["items"][0]["choices"][3] == "d"
    assert body["items"][10]["ans"] is True
    assert body["items"][14]["aliases"] == ["variable cost"]
    assert body["items"][19]["key_points"] == ["contribution margin"]
    assert "decrypt.py" in body["decrypt"]


def test_bad_mix_named(tmp_path):
    errs = []
    data = v20()
    data["items"][0]["type"] = "sa"
    build.validate_assignment(data, errs)
    assert errs and errs[-1].rule == "assign" and "expected 10" in errs[-1].msg


def test_field_checks(tmp_path):
    data = v20()
    data["items"][0]["choices"] = ["a", "b", "c"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("choices" in e.msg for e in errs)
    data = v20(); data["items"][0]["ans"] = 7
    errs = []
    build.validate_assignment(data, errs)
    assert any("ans" in e.msg for e in errs)
    data = v20(); del data["items"][18]["key_points"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("key_points" in e.msg for e in errs)
    data = v20(); del data["items"][10]["ans"]
    errs = []
    build.validate_assignment(data, errs)
    assert any("ans" in e.msg for e in errs)
    data = v20(); data["items"][5]["prompt"] = " "
    errs = []
    build.validate_assignment(data, errs)
    assert any("prompt" in e.msg for e in errs)


def test_extract_from_mount(tmp_path):
    sec = '<div data-component="assignment" data-key="assign7"></div>'
    dat = "LN.data.assign7 = " + json.dumps(v20()) + ";\nLN.data.other = 1;"
    errs = []
    ka, dd = build.extract_assignment(sec, dat, errs)
    assert ka == "assign7" and dd and len(dd["items"]) == 20 and not errs


def test_extract_missing_object():
    errs = []
    ka, dd = build.extract_assignment(
        '<div data-component="assignment" data-key="zz9"></div>',
        "LN.data.other = 1;", errs)
    assert ka == "zz9" and dd is None and errs


def test_extract_unparsable_object():
    errs = []
    ka, dd = build.extract_assignment(
        '<div data-component="assignment" data-key="zz9"></div>',
        'LN.data.zz9 = {items: [,]};', errs)   # trailing comma → JSONDecodeError
    assert dd is None and errs
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_contract.py -q`
Expected: FAIL — attribute errors.

- [ ] **Step 3: Implement** (build.py, after Task 2's functions; plus wiring)

```python
ASSIGN_SIZE = 20
ASSIGN_MIX_ORDER = {"mc": 10, "tf": 4, "id": 4, "sa": 2}


def extract_assignment(sections_text, data_text, errors):
    """Find the assignment mount + its LN.data object (balanced JSON)."""
    mm = re.search(r'<div[^>]*data-component="assignment"[^>]*>', sections_text)
    if not mm:
        return None, None
    km = re.search(r'data-key="([^"]*)"', mm.group(0))
    if not km:
        errors.append(Err("assign", "sections.html",
                          sections_text.count("\n", 0, mm.start()) + 1,
                          "assignment mount has no data-key",
                          "add data-key=... to the assignment mount"))
        return None, None
    key = km.group(1)
    m = re.search(r"LN\.data\." + re.escape(key) + r"\s*=\s*", data_text)
    if not m:
        errors.append(Err("assign", "data.js", None,
                          "LN.data.%s missing for the assignment mount" % key,
                          "define LN.data.%s = {...} in data.js" % key))
        return key, None
    i = data_text.index("{", m.end())
    depth, end, instr, esc = 0, -1, False, False
    for k in range(i, len(data_text)):
        c = data_text[k]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
        elif c == '"':
            instr = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = k
                break
    if end < 0:
        errors.append(Err("assign", "data.js", None,
                          "unbalanced object for LN.data.%s" % key,
                          "close the braces"))
        return key, None
    try:
        return key, json.loads(data_text[i:end + 1])
    except json.JSONDecodeError as exc:
        errors.append(Err("assign", "data.js", None,
                          "LN.data.%s is not strict JSON: %s" % (key, exc),
                          "write it as pure JSON: double quotes, no trailing commas"))
        return key, None


def validate_assignment(data, errors):
    items = (data or {}).get("items") or []
    if len(items) != ASSIGN_SIZE:
        errors.append(Err("assign", "data.js", None,
                          "assignment needs exactly %d items, found %d"
                          % (ASSIGN_SIZE, len(items)),
                          "author 20 situational items: 10 mc, 4 tf, 4 id, 2 sa"))
        return
    counts = {}
    for n, it in enumerate(items, 1):
        t = it.get("type")
        counts[t] = counts.get(t, 0) + 1
        if not str(it.get("prompt") or "").strip():
            errors.append(Err("assign", "data.js", None,
                              "item %d has an empty prompt" % n, ""))
        if t == "mc":
            ch = it.get("choices") or []
            if len(ch) != 4 or not all(str(c).strip() for c in ch):
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d needs exactly 4 non-empty choices" % n, ""))
            a = it.get("ans")
            if not isinstance(a, int) or not 0 <= a < 4:
                errors.append(Err("assign", "data.js", None,
                                  "mc item %d needs ans 0..3" % n,
                                  "the answer key ships only to build/key/"))
        elif t == "tf":
            if not isinstance(it.get("ans"), bool):
                errors.append(Err("assign", "data.js", None,
                                  "tf item %d needs a boolean ans" % n, ""))
        elif t == "id":
            al = it.get("aliases") or []
            if not al or not all(isinstance(a, str) and a.strip() for a in al):
                errors.append(Err("assign", "data.js", None,
                                  "id item %d needs a non-empty aliases list" % n,
                                  "aliases = accepted answer variants for grading"))
        elif t == "sa":
            kp = it.get("key_points") or []
            if not kp or not all(isinstance(a, str) and a.strip() for a in kp):
                errors.append(Err("assign", "data.js", None,
                                  "sa item %d needs a non-empty key_points list" % n,
                                  "key_points = the objective marks for grading"))
        else:
            errors.append(Err("assign", "data.js", None,
                              "item %d has unknown type %r" % (n, t),
                              "types: mc, tf, id, sa"))
    for t, want in sorted(ASSIGN_MIX_ORDER.items()):
        got = counts.get(t, 0)
        if got != want:
            errors.append(Err("assign", "data.js", None,
                              "type mix has %d %s, expected %d"
                              % (got, t, want),
                              "author 20 situational items: 10 mc, 4 tf, 4 id, 2 sa"))


def write_key_file(run_dir, cfg, data, keys):
    kf = Path(run_dir) / "build" / "key" / (Path(cfg["output"]).stem + "-key.json")
    kf.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for n, it in enumerate(data["items"], 1):
        row = {"n": n, "type": it["type"], "prompt": it["prompt"]}
        if it["type"] == "mc":
            row.update(choices=it["choices"], ans=it["ans"])
        elif it["type"] == "tf":
            row.update(ans=it["ans"])
        elif it["type"] == "id":
            row.update(aliases=it["aliases"])
        else:
            row.update(key_points=it["key_points"])
        rows.append(row)
    kf.write_text(json.dumps({
        "lesson": cfg["title"], "output": cfg["output"],
        "week": cfg["week"], "subject": cfg["subject"],
        "key_id": keys["id"], "public_key_b64": keys["pub_b64"],
        "decrypt": "python v2/tools/decrypt.py --key build/key/keys.pem <submissions…>",
        "items": rows,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    return kf
```

Wiring in `assemble()`:

1. After `check_mounts(parts["sections"], parts["data"], set(cfg["components"]), errors)`:

```python
    assign_data, keys = None, None
    if "assignment" in cfg["components"]:
        ka, assign_data = extract_assignment(parts["sections"], parts["data"], errors)
        if assign_data is not None:
            validate_assignment(assign_data, errors)
        try:
            keys = ensure_teacher_keys(Path.cwd() / "build" / "key")
        except ValueError as exc:
            errors.append(Err("assign", "build/key/keys.pem", None, str(exc),
                              "generate or repair the teacher key file"))
```

2. Component-JS reading loop stays; afterwards (before the substitution chain), when `assign_data and keys`:

```python
    if assign_data and keys:
        for _ix, c in enumerate(cfg["components"]):
            if c == "assignment":
                comp_js[_ix] = (comp_js[_ix]
                                .replace("__PUBKEY__", keys["pub_b64"])
                                .replace("__KEYID__", keys["id"]))
```

3. Change the final `return` of `assemble` to `return out, errors, {"assign": assign_data, "keys": keys}` and in error paths `return None, errors, {}`.
4. `main()` unpacks three; after `out_path.write_text(...)`:

```python
    if ctx["assign"] and ctx["keys"]:
        kf = write_key_file(Path.cwd(), cfg, ctx["assign"], ctx["keys"])
        print("OK - wrote %s" % kf)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_assignment_contract.py tests/test_assignment_meta.py tests/test_build.py -q`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `python -m pytest tests -q` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add v2/build.py tests/
git commit -m "feat(v2.5): assignment contract — mount extraction, 10/4/4/2 validation, per-build teacher key file"
```

---

### Task 4: `assignment` component — entry card, fullscreen slide deck, guard rails

**Files:**
- Create: `v2/skeleton/components/assignment/component.css`
- Create: `v2/skeleton/components/assignment/component.js`
- Create: `v2/skeleton/components/assignment/README.md`
- Modify: `v2/skeleton/components/registry.md` (new row)
- Create: `tests/test_assignment_deck.py`

**Interfaces:**
- Consumes: Task 1 metas; Task 3 injects `LN.pub` (single-line base64 SPKI DER) and `LN.keyId`; `LN.h`.
- Produces: `LN.components["assignment"].init(root, d)` with `d = {intro?, items:[20]}`; on submit produces body `{title, subject, week, student:{name,id}, submitted_at, answers:[{q,type,prompt,choice/answer}]}` handed to `_export` (Task 5).

- [ ] **Step 1: Write the failing tests** — `tests/test_assignment_deck.py`:

```python
import io
import json
import re
import contextlib
from pathlib import Path
import build
from test_build import make_skel

COMP = Path(__file__).resolve().parents[1] / "v2" / "skeleton" / "components" / "assignment"


def _skel(tmp_path):
    skel = make_skel(tmp_path, components=("assignment",))
    cd = skel / "components" / "assignment"
    (cd / "component.css").write_text(
        (Path("v2/skeleton/components/assignment/component.css")
         .read_text(encoding="utf-8")), encoding="utf-8")
    (cd / "component.js").write_text(
        (Path("v2/skeleton/components/assignment/component.js")
         .read_text(encoding="utf-8")), encoding="utf-8")
    return skel


def _work(tmp_path):
    w = tmp_path / "w"
    w.mkdir()
    items = ([{"type": "mc", "prompt": "q%d" % i,
               "choices": ["a", "b", "c", "d"], "ans": 1} for i in range(10)]
             + [{"type": "tf", "prompt": "t%d" % i, "ans": True} for i in range(4)]
             + [{"type": "id", "prompt": "i%d" % j, "aliases": ["x"]} for j in range(4)]
             + [{"type": "sa", "prompt": "s%d" % j, "key_points": ["k"]} for j in range(2)])
    (w / "build.json").write_text(json.dumps(
        {"title": "T", "theme": "mini", "components": ["assignment"],
         "output": "o.html", "week": 4, "subject": "S"}), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="assign"><h2>6 Assignment</h2>'
        '<div data-component="assignment" data-key="assign7"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text(
        "LN.data.assign7 = " + json.dumps({"intro": "i", "items": items}) + ";",
        encoding="utf-8")
    return w


def _build(tmp_path, skel, w, monkeypatch):
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(w)])
    text = (tmp_path / "o.html").read_text(encoding="utf-8") if rc == 0 else ""
    return rc, buf.getvalue(), text


def test_deck_ships_without_leak(tmp_path, monkeypatch):
    rc, out, html = _build(tmp_path, _skel(tmp_path), _work(tmp_path), monkeypatch)
    assert rc == 0, out
    for needle in ("lna-begin", "lna-watermark", "user-select:none", "PrintScreen",
                   "visibilitychange", "lna-cover", "requestFullscreen"):
        assert needle in html, needle
    assert '"ans"' not in html and "'ans'" not in html
    assert "key_points" not in html and "aliases" not in html


def test_component_files_clean():
    js = Path("v2/skeleton/components/assignment/component.js").read_text(encoding="utf-8")
    css = (Path("v2/skeleton/components/assignment/component.css").read_text(encoding="utf-8"))
    assert not re.search(r"\b(alert|confirm|prompt)\s*\(", js)
    assert not re.search(r"#[0-9a-fA-F]{3,8}\b", css)
    assert "http" not in css and "@import" not in css
    assert not re.search(r"</[A-Za-z]", js)
```


- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_assignment_deck.py -q`
Expected: FAIL — component files don't exist.

- [ ] **Step 3: Write `component.css`** (final, verbatim; tokens only):

```css
/* assignment — begin card, fullscreen deck, watermark, guards. Tokens only. */
.lna{user-select:none;-webkit-user-select:none;position:relative}
.lna input,.lna textarea{-webkit-user-select:text;user-select:text}
.lna-entry{border:1px solid var(--grid-strong);border-radius:var(--radius);
  background:var(--surface-2);padding:16px 18px;margin:14px 0;box-shadow:var(--shadow-sm)}
.lna-entry p{margin:6px 0;color:var(--ink-soft);font-size:14.5px}
.lna-begin{background:var(--accent);color:var(--surface);border:0;
  border-radius:999px;padding:10px 18px;font:600 14px/1.2 var(--sans);cursor:pointer}
.lna-begin:hover{border-color:var(--accent-deep)}
.lna-deck{display:none}
.lna-deck.open{display:block}
.lna-over{position:fixed;inset:0;background:var(--surface);z-index:210;overflow:auto;
  border-radius:0}
.lna-watermark{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.lna-watermark span{position:absolute;font:700 12px/1 var(--mono);
  color:var(--ink-faint);opacity:.5;transform:rotate(-24deg);white-space:nowrap;
  min-width:0}
.lna-sheet{position:relative;z-index:2;max-width:780px;margin:0 auto;
  padding:18px 16px 44px;min-width:0}
.lna-head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;
  justify-content:space-between;border-bottom:1px solid var(--grid-strong);
  padding-bottom:8px;margin-bottom:14px}
.lna-prog{font:600 12.5px/1.4 var(--mono);color:var(--accent-deep)}
.lna-dots{display:flex;gap:5px;flex:0 1 auto;min-width:0;flex-wrap:wrap}
.lna-dot{width:9px;height:9px;border-radius:999px;background:var(--grid)}
.lna-dot.on{background:var(--accent)}
.lna-dot.done{background:var(--accent-deep)}
.lna-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;
  background:var(--surface-2);border:1px solid var(--grid-strong);
  border-radius:var(--radius);padding:12px 14px;margin:0 0 14px}
.lna-form>div{min-width:0}
.lna-form label{font:600 11.5px/1.4 var(--mono);color:var(--accent-deep);
  letter-spacing:.08em;text-transform:uppercase}
.lna-name,.lna-id{font:15px/1.3 var(--sans);padding:8px 10px;width:100%;min-width:0;
  border:2px solid var(--grid-strong);border-radius:8px;background:var(--surface);
  color:var(--ink)}
.lna-err{display:none;background:var(--note-pink);border:1px solid var(--red);
  border-radius:8px;padding:9px 12px;font-size:13.5px;margin:10px 0;color:var(--ink)}
.lna-err.show{display:block}
.lna-q{font-size:16.5px;font-weight:600;margin:12px 0 10px}
.lna-opt{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;
  border:1px solid var(--grid-strong);border-radius:8px;margin:7px 0;
  background:var(--surface-2);cursor:pointer;min-width:0}
.lna-opt input{flex:none;margin-top:3px}
.lna-txt,.lna-area{width:100%;font:15px/1.55 var(--sans);padding:9px 11px;
  border:2px solid var(--grid-strong);border-radius:8px;background:var(--surface);
  color:var(--ink);min-width:0}
.lna-area{min-height:104px;resize:vertical}
.lna-nav{display:flex;gap:10px;align-items:center;justify-content:space-between;
  flex-wrap:wrap;margin-top:16px;border-top:1px solid var(--grid-strong);
  padding-top:12px}
.lna-nf{display:flex;gap:10px}
.lna-back,.lna-next,.lna-exit{font:600 14px/1.2 var(--sans);border-radius:999px;
  padding:9px 16px;cursor:pointer;border:1px solid var(--grid-strong);
  background:var(--surface-2);color:var(--ink)}
.lna-next{background:var(--accent);color:var(--surface);border-color:var(--accent)}
.lna-next[disabled]{opacity:.5}
.lna-exit{background:var(--note-yellow)}
.lna-note{font:12px/1.5 var(--mono);color:var(--ink-faint)}
.lna-cover{position:absolute;inset:0;background:var(--ink);display:none;z-index:5}
.lna-cover.show{display:block}
@media (max-width:640px){
  .lna-form{grid-template-columns:minmax(0,1fr)}
  .lna-sheet{padding:12px 10px 56px}
}
@media print{.lna{display:none!important}}
```

- [ ] **Step 4: Write `component.js`** (complete; the top helpers `b64`, `s64`, `nameOf`, `err` ship here; `_export` is a stub in Task 4, replaced in Task 5):

```js
LN.components["assignment"] = (function () {
  "use strict";
  function metaOf(nm) {
    var el = document.querySelector('meta[name="' + nm + '"]');
    return el ? el.getAttribute("content") : "";
  }
  function answered(it, a) {
    if (a === null || a === undefined) return false;
    if (it.type === "id" || it.type === "sa") return String(a).trim() !== "";
    return true; /* mc/tf write real values at pick time */
  }
  function b64(buf) {
    var b = new Uint8Array(buf), s = "", i;
    for (i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function s64(b64str) {
    var s = atob(b64str), u = new Uint8Array(s.length), i;
    for (i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }
  function nameOf(n) {
    return String(n || "Unnamed Student")
      .replace(/[<>:"\/\\|?*\u0000-\u001f]/g, "_").trim() || "Unnamed Student";
  }
  function err(ui, m) {
    ui.errB.className = "lna-err show";
    ui.errB.textContent = m;
  }
  return {
    init: function (root, d) {
      var items = d.items || [];
      var week = metaOf("ln:week"), subj = metaOf("ln:subject");
      var state = { ix: 0, answers: [] };
      items.forEach(function () { state.answers.push(null); });
      var box = LN.h("div", { class: "lna" });
      var card = LN.h("div", { class: "lna-entry" });
      card.appendChild(LN.h("p", { text: "ASSIGNMENT — TO BE SUBMITTED" }));
      card.appendChild(LN.h("p", { text: (d.intro ||
        "20 situational questions close this lesson. ") +
        "Answers are collected — never scored or corrected here — and download " +
        "as an encrypted file for your teacher once you submit." }));
      var begin = LN.h("button", { type: "button", class: "lna-begin",
        text: "Begin assignment" });
      card.appendChild(begin);
      box.appendChild(card);

      var deck = LN.h("div", { class: "lna-deck", role: "dialog",
        "aria-label": "Assignment" });
      var cover = LN.h("div", { class: "lna-cover" });
      deck.appendChild(cover);
      var wm = LN.h("div", { class: "lna-watermark", "aria-hidden": "true" });
      var sheet = LN.h("div", { class: "lna-sheet" });
      var prog = LN.h("span", { class: "lna-prog" });
      var dots = LN.h("div", { class: "lna-dots" });
      items.forEach(function () { dots.appendChild(LN.h("span", { class: "lna-dot" })); });
      var nam = LN.h("input", { class: "lna-name", autocomplete: "off",
        placeholder: "Lastname, Firstname" });
      var idIn = LN.h("input", { class: "lna-id", autocomplete: "off",
        inputmode: "numeric", placeholder: "8-digit student no." });
      function syncWM() {
        var t = (idIn.value || "Student ID") + " — " + (nam.value || "Name");
        wm.innerHTML = "";
        for (var i = 0; i < 14; i++)
          wm.appendChild(LN.h("span", { text: t,
            style: "left:" + (8 + (i % 4) * 22) + "%;top:" +
              (6 + Math.floor(i / 4) * 15) + "%" }));
      }
      idIn.addEventListener("input", function () {
        idIn.value = idIn.value.replace(/\D/g, "").slice(0, 8);
        syncWM();
      });
      nam.addEventListener("input", syncWM);
      var form = LN.h("div", { class: "lna-form" }, [
        LN.h("div", { class: "lna-form-cell" }, [
          LN.h("label", { text: "Student name — Lastname, Firstname" }), nam]),
        LN.h("div", { class: "lna-form-cell" }, [
          LN.h("label", { text: "Student ID — 8 digits" }), idIn])]);
      var errB = LN.h("div", { class: "lna-err" });
      var back = LN.h("button", { type: "button", class: "lna-back", text: "\u2190 Back" });
      var next = LN.h("button", { type: "button", class: "lna-next", text: "Next \u2192" });
      var exit = LN.h("button", { type: "button", class: "lna-exit",
        text: "Exit (answers kept)" });
      var submit = LN.h("button", { type: "button", class: "lna-next",
        text: "Submit" });
      var slides = [];
      items.forEach(function (it, i) {
        var s = LN.h("div", { class: "lna-slide" });
        s.hidden = true;
        s.appendChild(LN.h("div", { class: "lna-q",
          text: "Q" + (i + 1) + " — " + it.prompt }));
        if (it.type === "mc") {
          (it.choices || []).forEach(function (c) {
            var r = LN.h("input", { type: "radio", name: "a" + i });
            r.addEventListener("click", function () {
              state.answers[i] = c; bump();
            });
            s.appendChild(LN.h("label", { class: "lna-opt" }, [
              r, LN.h("span", { text: c })]));
          });
        } else if (it.type === "tf") {
          ["true", "false"].forEach(function (v) {
            var r = LN.h("input", { type: "radio", name: "a" + i });
            r.addEventListener("click", function () {
              state.answers[i] = (v === "true"); bump();
            });
            s.appendChild(LN.h("label", { class: "lna-opt" }, [
              r, LN.h("span", { text: v.toUpperCase() })]));
          });
        } else if (it.type === "id") {
          var t = LN.h("input", { class: "lna-txt", placeholder: "Your answer" });
          t.addEventListener("input", function () {
            state.answers[i] = t.value.trim();
          });
          s.appendChild(t);
        } else {
          var ar = LN.h("textarea", { class: "lna-area",
            placeholder: "Name the fact or reason from the lesson." });
          ar.addEventListener("input", function () {
            state.answers[i] = ar.value.trim();
          });
          s.appendChild(ar);
        }
        slides.push(s);
        sheet.appendChild(s);
      });
      var head = LN.h("div", { class: "lna-head" }, [prog, dots]);
      var navA = LN.h("div", { class: "lna-nav" }, [
        LN.h("div", { class: "lna-nf" }, [back, next]), exit]);
      var navB = LN.h("div", { class: "lna-nav" }, [
        LN.h("div", { class: "lna-nf" }, [back, submit]),
        LN.h("span", { class: "lna-note",
          text: "Submission needs every question answered." })]);
      sheet.appendChild(head);
      sheet.appendChild(form);
      sheet.appendChild(errB);
      sheet.appendChild(navA);
      sheet.appendChild(navB);
      deck.appendChild(wm);
      deck.appendChild(sheet);
      box.appendChild(deck);

      function show(ix) {
        state.ix = Math.max(0, Math.min(items.length - 1, ix));
        var i;
        for (i = 0; i < slides.length; i++) slides[i].hidden = (i !== state.ix);
        prog.textContent = "Question " + (state.ix + 1) + " of " + items.length;
        var ds = dots.childNodes, j;
        for (j = 0; j < ds.length; j++)
          ds[j].className = "lna-dot" +
            (state.answers[j] !== null && state.answers[j] !== "" ? " done" : "") +
            (j === state.ix ? " on" : "");
        var last = state.ix === items.length - 1;
        navA.hidden = last;
        navB.hidden = !last;
        next.disabled = !answered(items[state.ix], state.answers[state.ix]);
        errB.className = "lna-err";
      }
      function bump() { show(state.ix); }
      var opened = false;
      function fallbackOpen() {
        deck.className = "lna-deck open lna-over";
        document.documentElement.style.overflow = "hidden";
      }
      begin.addEventListener("click", function () {
        opened = true;
        if (deck.requestFullscreen) {
          deck.requestFullscreen().catch(fallbackOpen);
        } else {
          fallbackOpen();
        }
        begin.textContent = "Resume assignment (Q" + (state.ix + 1) + ")";
        show(state.ix);
        syncWM();
      });
      exit.addEventListener("click", function () {
        if (document.exitFullscreen && document.fullscreenElement)
          document.exitFullscreen();
        document.documentElement.style.overflow = "";
        deck.className = "lna-deck";
        begin.textContent = "Resume assignment (Q" + (state.ix + 1) + ")";
      });
      next.addEventListener("click", function () {
        if (!answered(items[state.ix], state.answers[state.ix])) {
          errB.className = "lna-err show";
          errB.textContent = "Answer Q" + (state.ix + 1) +
            " first — Next stays off until you do.";
          return;
        }
        show(state.ix + 1);
      });
      back.addEventListener("click", function () { show(state.ix - 1); });
      submit.addEventListener("click", function () {
        var i, missing = [];
        for (i = 0; i < items.length; i++)
          if (!answered(items[i], state.answers[i])) missing.push(i + 1);
        var name = nam.value.trim(), id = idIn.value.trim();
        var bad = [];
        if (name.indexOf(",") < 1)
          bad.push("your name as Lastname, Firstname");
        if (!/^\d{8}$/.test(id)) bad.push("an 8-digit student ID");
        if (missing.length < items.length && missing.length > 0)
          bad.push("answers to Q " + missing.join(", Q"));
        if (bad.length) {
          errB.className = "lna-err show";
          errB.textContent = "Still needed: " + bad.join("; ") + ".";
          return;
        }
        var ans = [];
        for (i = 0; i < items.length; i++) ans.push({
          q: i + 1, type: items[i].type, prompt: items[i].prompt,
          answer: state.answers[i]
        });
        this._export({
          title: document.title, subject: subj, week: Number(week),
          student: { name: name, id: id },
          submitted_at: new Date().toISOString(),
          answers: ans
        }, { errB: errB, cover: cover }, submit);
      });
      deck.addEventListener("contextmenu", function (ev) {
        if (opened) ev.preventDefault();
      });
      document.addEventListener("visibilitychange", function () {
        if (!opened) return;
        cover.className = document.hidden ? "lna-cover show" : "lna-cover";
      });
      window.addEventListener("blur", function () {
        if (opened) cover.className = "lna-cover show";
      });
      window.addEventListener("focus", function () {
        cover.className = "lna-cover";
      });
      document.addEventListener("keydown", function (ev) {
        if (opened && ev.key === "PrintScreen") {
          cover.className = "lna-cover show";
          setTimeout(function () { cover.className = "lna-cover"; }, 900);
        }
      });
      root.appendChild(box);
    },
    _export: function (body, ui) { /* Task 5 replaces this stub */
      var blob = new Blob([JSON.stringify(body, null, 1)],
        { type: "application/json" });
      var a = LN.h("a", { href: URL.createObjectURL(blob),
        download: "submission.json" });
      document.body.appendChild(a);
      a.click();
      a.remove();
      ui.errB.className = "lna-err show";
      ui.errB.textContent = "Downloaded (unencrypted stub — replaced by Task 5).";
    }
  };
})();
```

`v2/skeleton/components/assignment/README.md`:

```markdown
# assignment

Collect-only assessment. Mount: `<div data-component="assignment" data-key="…">`.
Data `{intro?, items:[20]}` — 10 mc (4 choices), 4 tf, 4 id, 2 sa, all situational.
The component never reveals answers and never scores: those live only in the
build's teacher key file (`build/key/`) written by build.py.

Flow: hidden Begin card → fullscreen deck (iOS: fixed-overlay simulation) →
one question per slide, locked Next → name (Lastname, Firstname) + 8-digit ID →
submit validates completeness and downloads an AES-GCM/RSA-OAEP-encrypted
`<name> - Week N - Subject.json`. Exit keeps answers; re-entry resumes.

Guards (best effort, not absolute): selection disabled inside the deck
(inputs stay typeable), context menu off while open, cover on
blur/visibilitychange/PrintScreen, diagonal `ID — Name` watermark filled live.
```

Registry row appended to the table in `v2/skeleton/components/registry.md` (before the "Conventions" footer):

```markdown
| Collect answers for the teacher (no reveal), encrypted submit | `assignment` | `{intro?, items:[20: 10×{type:'mc',prompt,choices[4]}, 4×{type:'tf',prompt}, 4×{type:'id',prompt}, 2×{type:'sa',prompt}]}` — answers never in student data | `<div data-component="assignment" data-key="assign7"></div>` |
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_assignment_deck.py -q`
Expected: PASS (2 tests).

- [ ] **Step 6: Full suite**

Run: `python -m pytest tests -q` — expected PASS.

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/components/assignment v2/skeleton/components/registry.md tests/
git commit -m "feat(v2.5): assignment component — hidden fullscreen deck, watermark, copy/screenshot guards"
```

---

### Task 5: Encrypted `_export` + `tools/decrypt.py` + round-trip

**Files:**
- Modify: `v2/skeleton/components/assignment/component.js` (replace `_export`; add nothing else)
- Create: `v2/tools/decrypt.py`
- Modify: `tests/test_assignment_deck.py` (one more needle in `test_deck_ships_without_leak`: `"RSA-OAEP-256+A256GCM"`)
- Create: `tests/test_assignment_roundtrip.py`

**Interfaces:**
- Consumes: `LN.pub`, `LN.keyId` (build-injected in Task 3's step 3 wiring, items 2).
- Produces: envelope `{enc:{v:1,k:"RSA-OAEP-256+A256GCM",iv,ct,wk}}`; file body `{title, subject, week, student, submitted_at, answers, key_id, enc}`; `decrypt.py --key <keys.pem> <files…>`.

- [ ] **Step 1: Write the failing test** — `tests/test_assignment_roundtrip.py`:

```python
import base64
import json
import os
import subprocess
import sys
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import build

TOOL = Path(__file__).resolve().parents[1] / "v2" / "tools" / "decrypt.py"


def enc_like_js(pem_path, payload):
    """Mirror the browser's envelope exactly: AES-GCM then RSA-OAEP-SHA256 wrap."""
    text = pem_path.read_text(encoding="utf-8")
    pub_pem = ("-----BEGIN PUBLIC KEY-----" +
               text.split("-----BEGIN PUBLIC KEY-----")[1].split(
                   "-----END PUBLIC KEY-----")[0] +
               "-----END PUBLIC KEY-----")
    pub = serialization.load_pem_public_key(pub_pem.encode("utf-8"))
    raw = os.urandom(32)
    iv = os.urandom(12)
    ct = AESGCM(raw).encrypt(iv, payload, None)
    wk = pub.encrypt(raw, padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(), label=None))
    return {"enc": {"v": 1, "k": "RSA-OAEP-256+A256GCM",
                    "iv": base64.b64encode(iv).decode(),
                    "ct": base64.b64encode(ct).decode(),
                    "wk": base64.b64encode(wk).decode()}}


def payload():
    return json.dumps({
        "title": "T", "subject": "S", "week": 4,
        "student": {"name": "Dela Cruz, Juan", "id": "20190001"},
        "submitted_at": "2026-09-17T09:00:00Z",
        "answers": [{"q": 1, "type": "tf", "prompt": "p", "answer": True}],
        "key_id": "deadbeefcafe",
    }).encode("utf-8")


def test_roundtrip(tmp_path):
    keys = build.ensure_teacher_keys(tmp_path / "build" / "key")
    f = tmp_path / "Dela Cruz, Juan - Week 4 - S.json"
    f.write_text(json.dumps(enc_like_js(keys["pem"], payload())),
                 encoding="utf-8")
    r = subprocess.run([sys.executable, str(TOOL), "--key", str(keys["pem"]), str(f)],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    body = json.loads(r.stdout)
    assert body["student"]["id"] == "20190001"
    assert body["answers"][0]["answer"] == "true"
    assert body["key_id"] == "deadbeefcafe"


def test_wrong_key_refuses(tmp_path):
    k1 = build.ensure_teacher_keys(tmp_path / "k1")
    k2 = build.ensure_teacher_keys(tmp_path / "k2")
    f = tmp_path / "x.json"
    f.write_text(json.dumps(enc_like_js(k2["pem"], payload())), encoding="utf-8")
    r = subprocess.run([sys.executable, str(TOOL), "--key", str(k1["pem"]), str(f)],
                       capture_output=True, text=True)
    assert r.returncode != 0
    assert "cannot decrypt" in (r.stdout + r.stderr)


def test_plaintext_refused(tmp_path):
    keys = build.ensure_teacher_keys(tmp_path / "k")
    f = tmp_path / "plain.json"
    f.write_text('{"answers": []}', encoding="utf-8")
    r = subprocess.run([sys.executable, str(TOOL), "--key", str(keys["pem"]), str(f)],
                       capture_output=True, text=True)
    assert r.returncode == 0
    assert '"error"' in r.stdout
```

(The decrypt tool prints a graceful `{"error": "unknown envelope …"}` body for structurally wrong files and exits per-file nonzero only on hard failures; the module header imports `subprocess`, `sys`, `os`, `base64`, `json` as shown.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_roundtrip.py -q`
Expected: FAIL — decrypt.py missing.

- [ ] **Step 3: Write `v2/tools/decrypt.py`** (complete file):

```python
#!/usr/bin/env python3
"""Decrypt submitted assignment .json files for grading.

Usage: python decrypt.py --key build/key/keys.pem A.json B.json …
Prints one pretty JSON payload per file (after a ==> header). Envelope format
RSA-OAEP-256+A256GCM: random AES-256-GCM key (ct carries the GCM tag appended,
as WebCrypto emits), session key wrapped with RSA-OAEP(SHA-256).
Requires the cryptography package: pip install cryptography.
"""
import argparse
import base64
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PRV = "-----BEGIN PRIVATE KEY-----"


def decrypt_file(pem_text, path):
    body = json.loads(Path(path).read_text(encoding="utf-8"))
    enc = body.get("enc") or {}
    if enc.get("k") != "RSA-OAEP-256+A256GCM":
        return {"error": "unknown envelope %r — wrong file or newer version"
                         % enc.get("k")}
    try:
        key = serialization.load_pem_private_key(pem_text.encode("utf-8"), None)
        raw = key.decrypt(base64.b64decode(enc["wk"]), padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(), label=None))
        plain = AESGCM(raw).decrypt(
            base64.b64decode(enc["iv"]), base64.b64decode(enc["ct"]), None)
        return json.loads(plain.decode("utf-8"))
    except Exception as exc:
        return {"error": "cannot decrypt with this key: %s" % exc}


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    ap = argparse.ArgumentParser(description="Decrypt assignment submissions")
    ap.add_argument("--key", required=True, help="teacher keys.pem")
    ap.add_argument("files", nargs="+", help="submitted .json file(s)")
    args = ap.parse_args(argv)
    pem = Path(args.key).read_text(encoding="utf-8")
    if PRV not in pem:
        print("FAIL: --key file carries no PRIVATE KEY block", file=sys.stderr)
        return 1
    rc = 0
    for f in args.files:
        try:
            out = json.dumps(decrypt_file(pem, f), ensure_ascii=False, indent=1)
            print("==> %s" % f)
            print(out)
        except Exception as exc:
            print("FAIL: %s: %s" % (f, exc), file=sys.stderr)
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Replace the `_export` stub in `component.js`** with the real implementation (same signature `(body, ui)`; drop the third arg):

```js
    _export: function (body, ui) {
      if (!(window.crypto && window.crypto.subtle && window.LN.pub)) {
        err(ui, "This browser cannot encrypt — update it; nothing was exported.");
        return;
      }
      var ivv = crypto.getRandomValues(new Uint8Array(12));
      var msg = new TextEncoder().encode(JSON.stringify(body));
      var aes = null;
      crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"])
        .then(function (k) {
          aes = k;
          var ctP = crypto.subtle.encrypt({ name: "AES-GCM", iv: ivv }, aes, msg);
          var wkP = crypto.subtle.exportKey("raw", k).then(function (raw) {
            return crypto.subtle.importKey("spki", s64(LN.pub),
              { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"])
              .then(function (pk) {
                return crypto.subtle.encrypt({ name: "RSA-OAEP" }, pk, raw);
              });
          });
          return Promise.all([ctP, wkP]);
        })
        .then(function (both) {
          var full = {
            title: body.title, subject: body.subject, week: body.week,
            student: body.student, submitted_at: body.submitted_at,
            answers: body.answers, key_id: window.LN.keyId,
            enc: { v: 1, k: "RSA-OAEP-256+A256GCM", iv: b64(ivv),
                   ct: b64(both[0]), wk: b64(both[1]) }
          };
          var f = nameOf(body.student.name) + " - Week " + body.week +
            " - " + body.subject + ".json";
          var a = LN.h("a", { download: f, href: URL.createObjectURL(
            new Blob([JSON.stringify(full, null, 1)],
              { type: "application/json" })) });
          document.body.appendChild(a);
          a.click();
          a.remove();
          err(ui, "Encrypted and downloaded: " + f);
        })
        .catch(function (e) {
          err(ui, "Encryption failed (" + e + ") — nothing was exported.");
        });
    }
```

(`body.title` comes from the submit handler; `window.LN.keyId` is filled by Task 3's marker replacement `__KEYID__`→key id and `__PUBKEY__`→pub_b64; the assignment component JS source must therefore contain, near the top: `var LNpub = "__PUBKEY__", LNkeyId = "__KEYID__";` with actual usage `window.LN.pub = LNpub; window.LN.keyId = LNkeyId;` placed inside `init` before `_export` runs — implement half-line pair:

```js
      window.LN.pub = window.LN.pub || LNpub;
      window.LN.keyId = window.LN.keyId || LNkeyId;
```

at the start of `init`. Update the deck test: `assert '__PUBKEY__' not in html` remains valid.)

Also add to `test_deck_ships_without_leak`'s needle list: `"RSA-OAEP-256+A256GCM"` and `"downloaded"` — keep exact existing assertions intact.

One more test addition, in `test_component_files_clean`:

```python
    assert '__PUBKEY__' in js and '__KEYID__' in js, "build injects the public key"
```

- [ ] **Step 5: Run the round-trip + deck suites**

Run: `python -m pytest tests/test_assignment_roundtrip.py tests/test_assignment_deck.py tests/test_assignment_contract.py -q`
Expected: PASS.

- [ ] **Step 6: Full suite**

Run: `python -m pytest tests -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add v2/skeleton/components/assignment/component.js v2/tools/decrypt.py tests/
git commit -m "feat(v2.5): encrypted submission download (AES-GCM + RSA-OAEP) + decrypt.py"
```

---

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

### Task 7: SKILL.md contract update (v2.5)

**Files:**
- Modify: `v2/SKILL.md` (frontmatter, purpose block, Part 2, Part 4 brief, Part 5, Part 6)

**No code.** Apply exactly these edits:

- [ ] **Step 1: Frontmatter + purpose**

- `version: 2.4` → `version: 2.5`; title heading `# Interactive Lesson Notebook (v2.4 — outline-first, one agent per section)` → `# Interactive Lesson Notebook (v2.5 — outline-first, one agent per section)`.
- Description tail: "…live calculators, activity labels, and a graded collect-only assignment with an encrypted submission file. Do NOT use for…"

- [ ] **Step 2: v2.5 paragraph** — after the "What v2.4 adds" paragraph (line ~41–44), insert:

```markdown
What v2.5 adds: **the assignment** replaces the graded-to-nowhere self-check.
Every content section's interactive element is now labelled an *Activity* — a
class-discussion check — via a `data-activity="class discussion"` attribute on
the mount (the shell renders the tag; `data-activity="none"` opts out). Section
7 ships 20 situational items (10 mc · 4 tf · 4 id · 2 objective short-answer)
inside a hidden fullscreen slide deck (`assignment` component, §3). Correct
answers live only in the data's `ans` / `aliases` / `key_points` fields — the
student HTML never carries them, and build.py derives the teacher's grading key
from there into `<run dir>/build/key/<output stem>-key.json`. Submission
downloads an RSA-OAEP-256 + AES-GCM encrypted `.json` named
`Lastname, Firstname - Week N - Subject.json` (week + subject are baked in as
`ln:week` / `ln:subject` meta tags from build.json, which must now carry both
when the assignment mounts; the teacher decrypts with `v2/tools/decrypt.py`).
```

- [ ] **Step 3: Part 2 row 7 + label note** — replace the `| 7 | Self-Check | 7–12 hard situational items | `true-false` |` row with:

```markdown
| 7 | **Assignment** | 20 situational items (10 mc·4 tf·4 id·2 sa), hidden until begun; no reveal | `assignment` |
```

and add below the table:

```markdown
Each content-section mount also carries `data-activity="class discussion"` so
the shell prints the Activity tag; Section 7 is the *Assignment* (collect-only,
never scored in-page).
```

- [ ] **Step 4: Part 4/C brief-template bullet** — after the components bullet add:

```markdown
- If your section mounts `assignment`: author correct answers ONLY inside the
  data object (`ans` for mc/tf, `aliases` for id, `key_points` for sa) — the
  student never sees them; build.py derives the teacher's grading key from them.
  No feedback/score UI.
```

- [ ] **Step 5: Part 5 QA bullet** — append to the judgment list:

```markdown
- **Assignment integrity.** 20 items in the 10/4/4/2 mix; no answer material
  (`ans`/`aliases`/`key_points`) readable anywhere in the student file; the
  Begin → fullscreen → slide flow works; `build/key/` received the key file.
```

- [ ] **Step 6: Part 6 principle 7** — replace `7. Refuse to grade: self-checks are calibration; say so.` with:

```markdown
7. The assignment collects; it never reveals. Feedback lives in `build/key/`.
```

- [ ] **Step 7: Run tests, commit**

Run: `python -m pytest tests -q` — expected PASS.

```bash
git add v2/SKILL.md
git commit -m "docs(v2.5): assignment + activity-label contract in the skill"
```

---

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

### Task 9: Closing sweep

- [ ] **Step 1:** `python -m pytest tests -q` — all PASS.
- [ ] **Step 2:** Build the sample into a scratch dir (`cd %TEMP% && python D:\Programming\lesson-notebook-pipeline\v2\build.py D:\Programming\lesson-notebook-pipeline\v2\sample\lesson-demo`), open `Week4-Demo-Notebook.html`, verify by hand: Begin/resume, fullscreen + Exit, nav lock, dots, watermark fill, selection blocked in deck + textareas typeable, PrintScreen/blur cover, submit validation messages, downloaded filename `… - Week 4 - Management Science.json`, decrypt.py round-trip on that file using `build/key/keys.pem`.
- [ ] **Step 3:** Confirm `git status` clean; commit any sweep fixes as:

```bash
git add -A; git commit -m "fix(v2.5): post-sweep corrections"
```
