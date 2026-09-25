# Assignment Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship assignment questions as AES-256-GCM ciphertext in every built lesson, releasable only by the official HTML Viewer (via a Worker `/unlock` gated on Wednesday Asia/Manila + app origin), plus a teacher-only preview viewer that unlocks any day with a locally-loaded key.

**Architecture:** `v2/build.py` encrypts the already-sanitized `LN.data.<key>` object with one universal 32-byte key (`build/key/unlock.key`, mirrored as the Worker secret `UNLOCK_KEY`). The assignment component detects the `{lnenc,v,iv,ct}` envelope and takes the key over an iframe `postMessage` channel from the viewer (student path) or from `teacher-viewer.html` (teacher path). The Cloudflare Worker gains `POST /unlock` which releases the key on Wednesday to allowed origins only. `teacher-viewer.html` answers the same channel locally with a runtime-uploaded key and injects a trusted-time fetch stub for plaintext/legacy builds.

**Tech Stack:** Python 3 + `cryptography` (AESGCM) in `v2/build.py`; ES5-style vanilla JS in the skeleton component; Node 24 `node:test` + WebCrypto for worker/app units; `vm`-sandbox smoke harness; Cloudflare Worker (plain JS); static HTML pages.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-09-24-assignment-encryption-design.md` — every requirement below traces to it (§4 build encryption, §5 key, §6 Worker, §7 viewer relay, §8 component, §9 teacher preview).
- **Fail closed everywhere:** no key → no decryption → no questions (spec 2g). A missing/damaged key file **fails the build**; Worker without `UNLOCK_KEY` returns 500; component with no parent/no reply shows the locked card.
- **Key placement invariant (spec 2b):** the key never enters any served/saved file the student can fetch — not the lesson, not `viewer.html`, not `teacher-viewer.html` (which is served but contains no key; the key only lives in memory after runtime upload, never localStorage).
- **The universal key is 32 raw bytes**, stored/transported as base64. The envelope in the lesson is exactly `{"lnenc": 1, "v": 1, "iv": "<b64>", "ct": "<b64>"}` replacing the sanitized object at `LN.data.<key>`.
- **Never touch answers:** encrypt the **sanitized** object only, never the answer-bearing original (spec §4). `sanitize_assignment_data`'s signature and direct-call tests must stay unchanged.
- **Message protocol (exact strings):** child→parent `{type:"ln-unlock-request", v:1}`; parent→child `{type:"ln-unlock-response", v:1, ok:true, key}` or `{type:"ln-unlock-response", v:1, ok:false, reason}` with reasons `out-of-window`, `no-key`, `network`, `forbidden`, `unconfigured`, or anything else → viewer-link card (spec §7/§8/§9).
- **Worker release gate (spec §6):** both Origin-allowed AND server-clock window-day, checked in order origin → secret → day; HTTP codes 403 / 500 / 423 / 200. `/unlock` echoes `access-control-allow-origin` only for allowed origins; `/grade` and `/models` keep `*`.
- **Baseline green bar** (run from repo root `D:\Programming\lesson-notebook-pipeline`):
  - `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → currently `2 failed, 107 passed`. `test_themes_matrix.py::test_pack_names_exact` is a **pre-existing, out-of-scope failure** — it must remain the ONLY failure. (`test_e2e_lesson::test_demo_fixture_output_is_self_contained` is currently failing too and IS fixed by Task 1.)
  - Full `python -m pytest tests -q` has 37 pre-existing failures (31 shard-era + the 2 above) — do not try to fix the shard-era ones; they belong to the unimplemented fan-out migration.
  - `node --test checker/app/test/*.test.js` → 40 pass (note: directory form `node --test test/` does NOT work on this Node/Windows — always use the `*.test.js` glob form).
  - `node --test checker/worker/test/*.test.js` → 27 pass.
  - `node v2/tools/assignment_smoke.js` → `SMOKE OK`.
- **Component lint rules that keep biting:** `build.py` scans component **CSS** for `http`/hex (component **JS** is not external-scanned, so `VIEWER_URL` in `component.js` is legal); `check_js` rejects a literal `</` followed by a letter anywhere in component JS — build the stub's closing tag as `"<" + "/script>"` concatenation only where a string is injected into HTML text (it isn't in the component; the injected stub script string lives in `checker/app/lib/preview.js`, which is NOT scanned — but keep the concatenation anyway for safety).
- **Operator step (spec §13):** after Task 3 deploys, run `npx wrangler secret put UNLOCK_KEY` in `checker/worker` with the base64 value from the local `build/key/unlock.key`. Until then the Worker fails closed. This is a manual step, never automated in a task.
- **Comments:** sparse; only where an existing comment establishes the convention. Match each file's ES5 (skeleton component) or ESM (checker) style.
- **Commits:** one per task minimum; repo style `feat(scope): ...`, `test(scope): ...`, `docs: ...`.

---

### Task 1: Build-time universal key + ciphertext at rest (build.py + pytest + e2e audit)

**Files:**
- Modify: `v2/build.py` (imports at line 21-29; add `os`; new helpers after `ensure_teacher_keys` (ends line 605); `_data_obj_span` + refactored `sanitize_assignment_data` at lines 780-836; `encrypt_assignment_data` after it; call sites in `assemble()` at lines 1392-1408 and 1480-1482; version note in module docstring lines 2 and 19)
- Create: `tests/test_assignment_encryption.py`
- Modify (audit): `tests/test_e2e_lesson.py:29-57` (two tests), `tests/test_e2e_dag.py:100-124` (+ import at top)

**Interfaces:**
- Consumes: existing `Err(rule, file, msg, hint)` pattern, `assemble()`'s `ka` (assignment data-key) + sanitized text from `sanitize_assignment_data`.
- Produces: `ensure_unlock_key(key_dir) -> (key_bytes: bytes, key_b64: str)` (raises `ValueError` on damage); `encrypt_assignment_data(data_text: str, key: str, key_bytes: bytes) -> str`; `_data_obj_span(data_text, key) -> (i, end) | None`; env var `LN_UNLOCK_KEY` (base64) overrides the key file and suppresses reading/writing it. After this task every assignment build's `LN.data.<key>` is the `{"lnenc":1,"v":1,"iv","ct"}` envelope; `build/key/unlock.key` (base64, one line) exists under the **run cwd** (already gitignored).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_assignment_encryption.py`:

```python
import base64
import contextlib
import io
import json
import re

import build
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from test_build import make_skel

ENV_KEY_B64 = base64.b64encode(bytes(range(32))).decode("ascii")


def _items():
    return ([{"type": "mc", "prompt": "qPrompt%d" % i,
              "choices": ["choiceX", "b", "c", "d"], "ans": 1} for i in range(10)]
            + [{"type": "tf", "prompt": "tPrompt%d" % i,
                "ans": i % 2 == 0} for i in range(4)]
            + [{"type": "id", "prompt": "iPrompt%d" % j,
                "aliases": ["aliasZ"]} for j in range(4)]
            + [{"type": "sa", "prompt": "sPrompt%d" % j, "key_points": ["kpW"],
                "rubric": "1 pt: the point", "max_points": 1} for j in range(2)])


def _workdir(tmp_path):
    w = tmp_path / "w"
    w.mkdir(exist_ok=True)
    (w / "build.json").write_text(json.dumps(
        {"title": "T", "theme": "mini", "components": ["assignment"],
         "output": "out.html", "week": 4, "subject": "S"}), encoding="utf-8")
    (w / "tune.css").write_text(":root{}", encoding="utf-8")
    (w / "sections.html").write_text(
        '<section class="block" id="x"><h2>A B</h2>'
        '<div data-component="assignment" data-key="a1"></div></section>',
        encoding="utf-8")
    (w / "data.js").write_text(
        "LN.data.a1 = " + json.dumps({"intro": "introSentinel",
                                      "items": _items()}) + ";",
        encoding="utf-8")
    return w


def _run(tmp_path, monkeypatch, cwd=None):
    monkeypatch.delenv("LN_UNLOCK_KEY", raising=False)
    skel = tmp_path / "skel"
    if not skel.exists():
        make_skel(tmp_path, components=("assignment",))
    cwd = cwd or tmp_path
    monkeypatch.chdir(cwd)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(_workdir(tmp_path))])
    return rc, buf.getvalue()


def _envelope(html):
    m = re.search(r"LN\.data\.a1 = (\{.*?\});", html)
    assert m, "LN.data.a1 missing from output"
    return json.loads(m.group(1))


def _decrypt(env, key_bytes):
    pt = AESGCM(key_bytes).decrypt(base64.b64decode(env["iv"]),
                                   base64.b64decode(env["ct"]), None)
    return json.loads(pt.decode("utf-8"))


def test_output_ships_envelope_and_no_plaintext(tmp_path, monkeypatch):
    rc, out = _run(tmp_path, monkeypatch)
    assert rc == 0, out
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    env = _envelope(html)
    assert env["lnenc"] == 1 and env["v"] == 1
    assert set(env) == {"lnenc", "v", "iv", "ct"}
    for needle in ("qPrompt0", "tPrompt0", "iPrompt0", "sPrompt0", "choiceX",
                   "introSentinel", "aliasZ", "kpW", '"ans"', "rubric",
                   "max_points"):
        assert needle not in html, needle


def test_envelope_decrypts_to_sanitized_object(tmp_path, monkeypatch):
    rc, out = _run(tmp_path, monkeypatch)
    assert rc == 0, out
    key_bytes = base64.b64decode(
        (tmp_path / "build" / "key" / "unlock.key")
        .read_text(encoding="ascii").strip())
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    safe = _decrypt(_envelope(html), key_bytes)
    assert safe["intro"] == "introSentinel"
    assert len(safe["items"]) == 20
    assert safe["items"][0] == {"type": "mc", "prompt": "qPrompt0",
                                "choices": ["choiceX", "b", "c", "d"]}
    assert safe["items"][10] == {"type": "tf", "prompt": "tPrompt0"}
    assert safe["items"][14] == {"type": "id", "prompt": "iPrompt0"}
    assert safe["items"][18] == {"type": "sa", "prompt": "sPrompt0"}
    assert "ans" not in json.dumps(safe)


def test_key_file_created_once_and_reused(tmp_path, monkeypatch):
    rc, out = _run(tmp_path, monkeypatch)
    assert rc == 0, out
    kf = tmp_path / "build" / "key" / "unlock.key"
    first = kf.read_text(encoding="ascii")
    html1 = (tmp_path / "out.html").read_text(encoding="utf-8")
    (tmp_path / "out.html").unlink()
    rc, out = _run(tmp_path, monkeypatch)
    assert rc == 0, out
    assert kf.read_text(encoding="ascii") == first
    env = _envelope((tmp_path / "out.html").read_text(encoding="utf-8"))
    _decrypt(env, base64.b64decode(first.strip()))


def test_env_key_wins_and_file_is_not_written(tmp_path, monkeypatch):
    monkeypatch.delenv("LN_UNLOCK_KEY", raising=False)
    monkeypatch.setenv("LN_UNLOCK_KEY", ENV_KEY_B64)
    skel = make_skel(tmp_path, components=("assignment",))
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(_workdir(tmp_path))])
    assert rc == 0, buf.getvalue()
    assert not (tmp_path / "build" / "key" / "unlock.key").exists()
    html = (tmp_path / "out.html").read_text(encoding="utf-8")
    safe = _decrypt(_envelope(html), base64.b64decode(ENV_KEY_B64))
    assert safe["items"][0]["prompt"] == "qPrompt0"


def test_damaged_key_file_fails_build(tmp_path, monkeypatch):
    (tmp_path / "build" / "key").mkdir(parents=True)
    (tmp_path / "build" / "key" / "unlock.key").write_text(
        "not-base64-!!", encoding="ascii")
    rc, out = _run(tmp_path, monkeypatch)
    assert rc == 1
    assert "unlock.key" in out


def test_env_key_wrong_length_fails_build(tmp_path, monkeypatch):
    monkeypatch.delenv("LN_UNLOCK_KEY", raising=False)
    monkeypatch.setenv("LN_UNLOCK_KEY",
                       base64.b64encode(b"x" * 16).decode("ascii"))
    skel = make_skel(tmp_path, components=("assignment",))
    monkeypatch.chdir(tmp_path)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = build.main(["--skeleton", str(skel), str(_workdir(tmp_path))])
    assert rc == 1
    assert "unlock.key" in buf.getvalue() or "LN_UNLOCK_KEY" in buf.getvalue()
```

Note: `test_output_ships_envelope_and_no_plaintext` asserting `"rubric" not in html` and `"max_points" not in html` is safe — the sanitized object (and therefore the plaintext) never carries those fields, and after encryption no data.js question text remains at all. The component JS itself does not contain the words `rubric`/`max_points`/`ans` (verified — do NOT add them there in later tasks without re-running this test).

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_assignment_encryption.py -q`
Expected: FAIL — build succeeds so no envelope (`"lnenc"` missing), or `AttributeError`/`TypeError` on missing helpers; `test_damaged_key_file_fails_build` fails with `rc == 0`.

- [ ] **Step 3: build.py — `os` import + docstring note**

In `v2/build.py`, add `import os` to the stdlib block (keep alphabetical): between `import json` and `import re` (line ~25).

Docstring line 2: change `Interactive Lesson Notebook v2.4 - parts assembler + mechanical validator.` to `Interactive Lesson Notebook v2.9 - parts assembler + mechanical validator.`

Docstring line 19: change `...honoured as-is. Python 3 stdlib only.` to `...honoured as-is. Python 3 stdlib; assignment builds additionally need the ``cryptography`` package. Assignment questions ship AES-256-GCM ciphertext (key: build/key/unlock.key).`

- [ ] **Step 4: build.py — `ensure_unlock_key`**

Insert after `ensure_teacher_keys` (which ends at line 605, before the `ASSIGN_FIXED` line):

```python
UNLOCK_KEY_LEN = 32


def _unlock_b64_to_bytes(text, where):
    try:
        raw = base64.b64decode(text, validate=True)
    except Exception:
        raise ValueError("%s is not valid base64 "
                         "(restore it from backup)" % where)
    if len(raw) != UNLOCK_KEY_LEN:
        raise ValueError("%s must decode to exactly %d bytes, got %d "
                         "(restore it from backup)" % (where, UNLOCK_KEY_LEN,
                                                       len(raw)))
    return raw


def ensure_unlock_key(key_dir):
    """Universal assignment key: (32 raw bytes, base64 str), one key for all.

    Lookup order: LN_UNLOCK_KEY env (authoritative, never written to disk) →
    <key_dir>/unlock.key → fresh os.urandom(32) written to the file with a
    loud warning. ValueError on damage (mirrors ensure_teacher_keys).
    """
    env = os.environ.get("LN_UNLOCK_KEY")
    if env:
        raw = _unlock_b64_to_bytes(env.strip(), "LN_UNLOCK_KEY env")
        return raw, base64.b64encode(raw).decode("ascii")
    key_dir = Path(key_dir)
    kf = key_dir / "unlock.key"
    if kf.exists():
        raw = _unlock_b64_to_bytes(
            kf.read_text(encoding="ascii").strip(), "build/key/unlock.key")
        return raw, base64.b64encode(raw).decode("ascii")
    raw = os.urandom(UNLOCK_KEY_LEN)
    b64 = base64.b64encode(raw).decode("ascii")
    key_dir.mkdir(parents=True, exist_ok=True)
    kf.write_text(b64 + "\n", encoding="ascii")
    print("WARNING: generated build/key/unlock.key — set this same value as "
          "the Worker secret UNLOCK_KEY (cd checker/worker; "
          "npx wrangler secret put UNLOCK_KEY); losing it orphans existing "
          "lessons.")
    return raw, b64
```

- [ ] **Step 5: build.py — shared brace scan + `encrypt_assignment_data`**

Insert immediately before `sanitize_assignment_data` (line ~780):

```python
def _data_obj_span(data_text, key):
    """(open, close) indices of the LN.data.<key> = { … } object, or None."""
    m = re.search(r"LN\.data\." + re.escape(key) + r"\s*=\s*", data_text)
    if not m:
        return None
    try:
        i = data_text.index("{", m.end())
    except ValueError:
        return None
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
    return (i, end) if end >= 0 else None
```

Refactor `sanitize_assignment_data`: replace its whole header up to the safe-object build (lines 782-806 — the regex search, `index("{", …)`, the inline brace loop, the `end < 0` return) with:

```python
def sanitize_assignment_data(data_text, key, data):
    """Rewrite LN.data.<key> in the student output without any answer material."""
    span = _data_obj_span(data_text, key)
    if span is None:
        return data_text
    i, end = span
```

The rest of the function (`if data.get("mode") == "dag":` … through the final `return`) stays byte-identical. Do NOT touch `extract_assignment`'s copy.

Insert after `sanitize_assignment_data` (before `_wc`):

```python
def encrypt_assignment_data(data_text, key, key_bytes):
    """Replace the sanitized LN.data.<key> object with an AES-256-GCM envelope."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    span = _data_obj_span(data_text, key)
    if span is None:
        return data_text
    i, end = span
    safe_obj = json.loads(data_text[i:end + 1])
    iv = os.urandom(12)
    pt = json.dumps(safe_obj, ensure_ascii=False).encode("utf-8")
    ct = AESGCM(key_bytes).encrypt(iv, pt, None)
    envelope = {"lnenc": 1, "v": 1,
                "iv": base64.b64encode(iv).decode("ascii"),
                "ct": base64.b64encode(ct).decode("ascii")}
    return data_text[:i] + json.dumps(envelope) + data_text[end + 1:]
```

- [ ] **Step 6: build.py — wire into `assemble()`**

In the assignment block (line ~1392), start the row at: `assign_data, keys, ka = None, None, None` becomes `assign_data, keys, ka, unlock_key = None, None, None, None`.

Inside `if "assignment" in cfg["components"]:`, immediately after the `ensure_teacher_keys` try/except (ends line ~1408), add (same indent level as that try):

```python
        try:
            unlock_key, _unlock_b64 = ensure_unlock_key(
                Path.cwd() / "build" / "key")
        except ValueError as exc:
            errors.append(Err("assign", "build/key/unlock.key", None, str(exc),
                              "restore build/key/unlock.key from backup, or set "
                              "the LN_UNLOCK_KEY env to the Worker secret value "
                              "(a fresh key orphans old lessons)"))
```

At the data-out splice (lines ~1480-1483), change:

```python
    data_out = parts["data"]
    if ka and assign_data is not None and keys:
        data_out = sanitize_assignment_data(data_out, ka, assign_data)
```

to:

```python
    data_out = parts["data"]
    if ka and assign_data is not None and keys:
        data_out = sanitize_assignment_data(data_out, ka, assign_data)
        if unlock_key is not None:
            data_out = encrypt_assignment_data(data_out, ka, unlock_key)
```

- [ ] **Step 7: Run encryption tests**

Run: `python -m pytest tests/test_assignment_encryption.py -q`
Expected: PASS (6). `test_assignment_contract.py` / `test_assignment_dag.py` sanitize tests: run `python -m pytest tests/test_assignment_contract.py tests/test_assignment_dag.py -q` → all pass (signature/behavior unchanged).

- [ ] **Step 8: Fix the audited e2e tests**

Run: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"`
Expected: FAILURES in `test_e2e_dag.py::test_dag_fixture_builds_clean`, `test_e2e_lesson.py::test_demo_fixture_output_is_self_contained` (+ the known `test_pack_names_exact`). Fix both:

`tests/test_e2e_dag.py` — add `import base64` to the import block and `from cryptography.hazmat.primitives.ciphers.aead import AESGCM` after `import build`. Replace the body of `test_dag_fixture_builds_clean` from `m = re.search(...)` through the `nextNodeId` assert with:

```python
    m = re.search(r"LN\.data\.assign7\s*=\s*(\{[^{}]*\});", html)
    assert m, "assign7 not in output"
    env = json.loads(m.group(1))
    assert env["lnenc"] == 1 and env["v"] == 1
    key = base64.b64decode(
        (tmp_path / "build" / "key" / "unlock.key")
        .read_text(encoding="ascii").strip())
    body = json.loads(AESGCM(key).decrypt(base64.b64decode(env["iv"]),
                                          base64.b64decode(env["ct"]), None))
    assert body["mode"] == "dag"
    assert "points" not in json.dumps(body)
    assert body["nodes"][0]["choices"][0]["nextNodeId"] == "n1"
```

(Keep the `data-component="assignment"` assert and everything from the `kf = tmp_path / ...` key-file block onward unchanged.)

`tests/test_e2e_lesson.py::test_demo_fixture_output_is_self_contained` — replace the body (after reading `out`) with:

```python
    assert "http://" not in out.replace("http://www.w3.org/2000/svg", "")
    # the assignment's trusted-time lookups + the viewer link are the only
    # allowlisted https strings in a built lesson
    for host in ("https://worldtimeapi.org", "https://utctime.app",
                 "https://time.now", "https://sunrise.am",
                 "https://assignz.web.app"):
        out = out.replace(host, "")
    assert "https://" not in out
    assert "@import" not in out
```

(The `assignz.web.app` entry lands in Task 2 — add it now so Task 2 stays green; it is inert until the string exists.)

`tests/test_e2e_lesson.py::test_demo_builds_assignment_and_key` — (controller fix-up, 2026-09-25: an earlier draft of this task wrongly treated `"Where the method goes dark"` as an assignment prompt; it lives in `LN.data.recap7`, which stays plaintext. This test needs **no change** — its existing asserts remain true and `"ans"`-absence still guards the assignment. The ciphertext guard for the demo build lives in `tests/test_assignment_encryption.py`.)

- [ ] **Step 9: Run the full green bar + smoke**

Run: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"`
Expected: `1 failed, 114 passed` — the only failure is the pre-existing `test_themes_matrix.py::test_pack_names_exact`.
Run: `node v2/tools/assignment_smoke.js` → still `SMOKE OK` (plaintext walk unaffected: the component still gets plaintext from the OLD build outputs it loads itself — smoke drives the component directly, not build.py).

- [ ] **Step 10: Commit**

```bash
git add v2/build.py tests/test_assignment_encryption.py tests/test_e2e_lesson.py tests/test_e2e_dag.py
git commit -m "feat(build): assignment ciphertext at rest (AES-256-GCM) + universal unlock key"
```

---

### Task 2: Assignment component unlock path + locked cards + smoke

**Files:**
- Modify: `v2/skeleton/components/assignment/component.js` (init body → `render`; add `VIEWER_URL`, `UNLOCK_TIMEOUT_MS`, `unlockThenInit`; `gateBypass` option)
- Modify: `v2/skeleton/components/assignment/component.css` (add `.lna-lock-link`)
- Modify: `v2/skeleton/components/assignment/README.md` (unlock path + fail-closed invariant)
- Modify: `v2/tools/assignment_smoke.js` (encrypted-path checks)

**Interfaces:**
- Consumes: the envelope shape from Task 1 (`{lnenc:1, v:1, iv, ct}` b64 fields); existing helpers `s64` (line 20), `LN.h`, `metaOf`; existing `.lna-lock-shut` CSS.
- Produces: runtime protocol `{type:"ln-unlock-request",v:1}` → parent, `{type:"ln-unlock-response",v:1,ok, key|reason}` ← parent; gate cards `.lna-lock-link` (viewer URL `https://assignz.web.app/viewer.html`) and `.lna-lock-shut`; test hook `api._setUnlockTimeout(ms)`; `render(root, d, {gateBypass:true})` skips clock gate + watchdog while submit keeps `withTrustedTime`. Legacy plaintext builds must render exactly as before.

- [ ] **Step 1: Extend the smoke harness with the encrypted path (failing)**

In `v2/tools/assignment_smoke.js`, first extend the sandbox object literal (lines 106-115) by adding these properties: `atob: atob, btoa: btoa, TextDecoder: TextDecoder, crypto: require("crypto").webcrypto`.

Then, immediately before the final `runFallbackTests().then(function () {` (line 543), insert:

```js
/* ---------- v2.9 encrypted unlock path ---------- */
const nodeCrypto = require("crypto");

function toB64(bytes) { return Buffer.from(bytes).toString("base64"); }

async function envelopeFor(keyBytes, obj) {
  const iv = new Uint8Array(nodeCrypto.randomBytes(12));
  const k = await nodeCrypto.webcrypto.subtle.importKey(
    "raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await nodeCrypto.webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv }, k,
    new TextEncoder().encode(JSON.stringify(obj))));
  return { lnenc: 1, v: 1, iv: toB64(iv), ct: toB64(ct) };
}

function fireWin(type, ev) {
  (docListeners["win:" + type] || []).forEach(function (f) { f(ev); });
}

function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

function gateTextOf(rootEl, cls) {
  var n = walk(rootEl, function (e) {
    return (e.className || "").indexOf(cls) >= 0;
  })[0];
  return n ? String(n.textContent || "") : null;
}

async function runUnlockTests() {
  const key = new Uint8Array(32).fill(7);
  const keyB64 = toB64(key);
  const env = await envelopeFor(key, data);

  sandboxWindow.parent = sandboxWindow;
  const rA = new El("div");
  assignmentComp.init(rA, env);
  check("unlock: top-level open shows the viewer-link card",
    (gateTextOf(rA, "lna-lock-link") || "")
      .indexOf("https://assignz.web.app/viewer.html") >= 0,
    "text=" + gateTextOf(rA, "lna-lock-link"));

  let sent = null;
  sandboxWindow.parent = { postMessage: function (m) { sent = m; } };
  const rB = new El("div");
  assignmentComp.init(rB, env);
  check("unlock: embedded lesson posts ln-unlock-request to parent",
    !!sent && sent.type === "ln-unlock-request" && sent.v === 1,
    JSON.stringify(sent));
  fireWin("message", { source: {}, data: { type: "ln-unlock-response",
    v: 1, ok: true, key: keyB64 } });
  await tick();
  check("unlock: reply from a foreign source is ignored",
    !walk(rB, function (e) {
      return (e.className || "").indexOf("lna-lock") >= 0;
    }).length);
  fireWin("message", { source: sandboxWindow.parent,
    data: { type: "ln-unlock-response", v: 1, ok: true, key: keyB64 } });
  await tick(); await tick(); await tick();
  const beginB = walk(rB, function (e) {
    return e.tag === "button" && (e.className || "").indexOf("lna-begin") >= 0;
  })[0];
  check("unlock: valid key renders the deck with the gate bypassed",
    !!beginB && beginB.disabled === false, "begin=" + !!beginB);
  if (beginB) {
    beginB.click();
    check("unlock: decrypted deck reaches the identity gate",
      !!walk(rB, function (e) {
        return e.tag === "input" && (e.className || "").indexOf("lna-name") >= 0;
      })[0]);
    check("unlock: decrypted prompt text is rendered",
      walk(rB, function (e) {
        return (e.className || "").indexOf("lna-q") >= 0;
      }).some(function (q) {
        return (q.textContent || "").indexOf("Pick A") >= 0;
      }));
  }

  const rC = new El("div");
  assignmentComp.init(rC, env);
  fireWin("message", { source: sandboxWindow.parent,
    data: { type: "ln-unlock-response", v: 1, ok: false,
      reason: "out-of-window" } });
  const shutC = gateTextOf(rC, "lna-lock-shut");
  check("unlock: out-of-window reply shows the Wednesday notice",
    !!shutC && shutC.indexOf("Wednesday, 12:00 AM") >= 0, "text=" + shutC);

  const rD = new El("div");
  assignmentComp.init(rD, env);
  fireWin("message", { source: sandboxWindow.parent,
    data: { type: "ln-unlock-response", v: 1, ok: true,
      key: toB64(new Uint8Array(32).fill(9)) } });
  await tick(); await tick(); await tick();
  check("unlock: wrong key fails closed to the viewer-link card",
    (gateTextOf(rD, "lna-lock-link") || "").indexOf("HTML Viewer") >= 0);

  const rF = new El("div");
  assignmentComp.init(rF, env);
  fireWin("message", { source: sandboxWindow.parent,
    data: { type: "ln-unlock-response", v: 1, ok: false,
      reason: "no-key" } });
  check("unlock: no-key reply shows the viewer-link card",
    (gateTextOf(rF, "lna-lock-link") || "").indexOf("HTML Viewer") >= 0);

  assignmentComp._setUnlockTimeout(50);
  const rE = new El("div");
  assignmentComp.init(rE, env);
  await new Promise(function (r) { setTimeout(r, 150); });
  check("unlock: a silent parent times out to the viewer-link card",
    (gateTextOf(rE, "lna-lock-link") || "").indexOf("HTML Viewer") >= 0);
  assignmentComp._setUnlockTimeout(10000);
}
```

and change the tail from:

```js
runFallbackTests().then(function () {
```

to:

```js
runFallbackTests().then(runUnlockTests).then(function () {
```

- [ ] **Step 2: Run the smoke to verify it fails**

Run: `node v2/tools/assignment_smoke.js`
Expected: `FAIL unlock: top-level open shows the viewer-link card` (current `init` treats the envelope as plaintext: `d.mode`/`d.items` undefined → renders an empty flat deck).

- [ ] **Step 3: component.js — dispatcher + constants + unlockThenInit**

At the top of the IIFE, after `var LNpub = ...; window.LN.pub ...` lines (1-5), add:

```js
  var VIEWER_URL = "https://assignz.web.app/viewer.html";
  var UNLOCK_TIMEOUT_MS = 10000;
```

Rename the current `init: function (root, d) {` (line 118) into a top-level function inside the IIFE, placed BEFORE `var api = {` (line 117): `function render(root, d, opts) {` — everything in the old body stays byte-identical except the two gate edits in Step 4.

Add these functions after `render` closes (the old `init` body ended at the `root.appendChild(box);` + `},` — the closing `}` now terminates `render`), before `var api = {`:

```js
  function unlockThenInit(root, d) {
    var box = LN.h("div", { class: "lna" });
    var card = LN.h("div", { class: "lna-entry" });
    card.appendChild(LN.h("p", { text: "ASSIGNMENT — TO BE SUBMITTED" }));
    var status = LN.h("p", { class: "lna-gate", text: "Unlocking\u2026" });
    var begin = LN.h("button", { type: "button", class: "lna-begin",
      text: "Begin assignment" });
    begin.disabled = true;
    card.appendChild(status);
    card.appendChild(begin);
    box.appendChild(card);
    root.appendChild(box);
    function lock(cls, msg) {
      status.className = "lna-gate " + cls;
      status.textContent = msg;
    }
    function viewerLock() {
      lock("lna-lock-link", "This assignment opens only in the HTML " +
        "Viewer \u2014 " + VIEWER_URL);
    }
    if (window.parent === window) { viewerLock(); return; }
    var settled = false;
    var timer = null;
    function finish() {
      settled = true;
      if (timer !== null) clearTimeout(timer);
      if (typeof window.removeEventListener === "function")
        window.removeEventListener("message", onMsg);
    }
    function onMsg(ev) {
      if (settled || ev.source !== window.parent) return;
      var m = ev.data;
      if (!m || m.type !== "ln-unlock-response" || m.v !== 1) return;
      finish();
      if (m.ok === true && typeof m.key === "string") {
        decryptUnlock(m.key, d, function (plain) {
          root.innerHTML = "";
          render(root, plain, { gateBypass: true });
        }, viewerLock);
        return;
      }
      if (m.ok === false && m.reason === "out-of-window") {
        lock("lna-lock-shut", "This assignment opens Wednesday, 12:00 AM " +
          "\u2013 11:59 PM (Asia/Manila).");
        return;
      }
      viewerLock();
    }
    if (typeof window.addEventListener !== "function") { viewerLock(); return; }
    window.addEventListener("message", onMsg);
    timer = (typeof setTimeout === "function")
      ? setTimeout(function () {
          if (settled) return;
          finish();
          viewerLock();
        }, UNLOCK_TIMEOUT_MS)
      : null;
    window.parent.postMessage({ type: "ln-unlock-request", v: 1 }, "*");
  }
  function decryptUnlock(keyB64, d, onOk, onFail) {
    try {
      var raw = s64(keyB64), iv = s64(d.iv), ct = s64(d.ct);
      crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"])
        .then(function (k) {
          return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, k, ct);
        })
        .then(function (plain) {
          onOk(JSON.parse(new TextDecoder().decode(plain)));
        })
        .catch(function () { onFail(); });
    } catch (e) { onFail(); }
  }
```

Add to the `api` object, replacing the old `init` slot (keep all other api keys unchanged):

```js
    init: function (root, d) {
      if (d && d.lnenc === 1) { unlockThenInit(root, d); return; }
      render(root, d, {});
    },
```

and add next to `_setClock` (line ~644):

```js
    _setUnlockTimeout: function (ms) { UNLOCK_TIMEOUT_MS = ms; },
```

- [ ] **Step 4: component.js — `gateBypass` inside `render`**

In `render`, the first two statements (the `window.LN.pub`/`keyId` lines copied from old init) stay. Replace the gate kickoff block (old lines 478-485):

```js
      renderGate();
      checkGate();
      if (typeof setInterval === "function") gateTimer = setInterval(checkGate, 60000);
      begin.addEventListener("click", function () {
        checkGate(function (st) {
          if (st.inWindow) openDeckNow();
        });
      });
```

with:

```js
      if (opts.gateBypass) {
        gateState.checked = true;
        gateState.inWindow = true;
        renderGate();
      } else {
        renderGate();
        checkGate();
        if (typeof setInterval === "function")
          gateTimer = setInterval(checkGate, 60000);
      }
      begin.addEventListener("click", function () {
        if (opts.gateBypass) { openDeckNow(); return; }
        checkGate(function (st) {
          if (st.inWindow) openDeckNow();
        });
      });
```

The submit paths (flat + dag) keep calling `withTrustedTime` unchanged — the Worker already gated the open, but the timestamp must still be trusted (spec §8).

- [ ] **Step 5: component.css — viewer-link card**

Append after `.lna-lock-shut` (line ~10):

```css
.lna-lock-link{background:var(--note-blue);border:1px solid var(--grid-strong);
  border-radius:8px;padding:9px 12px;color:var(--ink);word-break:break-all}
```

- [ ] **Step 6: Run smoke + the component-sensitive pytest files**

Run: `node v2/tools/assignment_smoke.js` → all new `unlock:` checks `ok` and final `SMOKE OK`.
Run: `python -m pytest tests/test_assignment_deck.py tests/test_e2e_lesson.py -q` → pass (deck ships; self-contained allowlist already covers `assignz.web.app`; `test_component_files_clean` regexes: no `alert(`/`prompt(`/`</`+letter added — the em-dashes are `\u2014` escapes, no raw HTML tags in strings).
Run the Task-1 green-bar command once more → only `test_pack_names_exact` fails.

- [ ] **Step 7: Assignment README**

Append to `v2/skeleton/components/assignment/README.md`:

```markdown
## Ciphertext at rest + unlock (v2.9)

For assignment builds, `build.py` ships `LN.data.<key>` as an AES-256-GCM
envelope `{lnenc:1, v:1, iv, ct}` of the sanitized object — no question text
exists in the file. `init` dispatches: envelope → `unlockThenInit` (Begin
disabled, status line), plaintext/legacy → the normal gated deck. The key is
requested from the embedding page over `postMessage`
(`ln-unlock-request` → `ln-unlock-response`): the HTML Viewer relays it to the
Worker, which releases it only on Wednesday (Asia/Manila) to the app origin;
`teacher-viewer.html` answers it locally with a runtime-loaded key. Outcomes,
all fail-closed: valid key → deck renders with the in-page clock gate bypassed
(the Worker already gated the open; the submit timestamp still uses trusted
time) · out-of-window → `.lna-lock-shut` Wednesday notice · top-level/new-tab
open, wrong key, denial, or 10 s silence → `.lna-lock-link` card pointing at
`VIEWER_URL`. Invariant: the universal key must never appear in any file the
student can fetch; only the Worker secret and the teacher's local
`build/key/unlock.key` hold it.
```

- [ ] **Step 8: Commit**

```bash
git add v2/skeleton/components/assignment/component.js v2/skeleton/components/assignment/component.css v2/skeleton/components/assignment/README.md v2/tools/assignment_smoke.js
git commit -m "feat(assignment): ciphertext unlock path via parent postMessage + fail-closed locked cards"
```

---

### Task 3: Worker `POST /unlock`

**Files:**
- Create: `checker/worker/src/unlock.js`
- Modify: `checker/worker/src/index.js` (import + route + env param + NOTE comment, lines 1, 75-85)
- Create: `checker/worker/test/unlock.test.js`
- Modify: `checker/worker/README.md`

**Interfaces:**
- Consumes: Worker `env` secrets (`UNLOCK_KEY` base64, `APP_ORIGIN`, `UNLOCK_TZ`, `UNLOCK_DAY`, test-only `NOW`).
- Produces: `POST /unlock` with body `{"v":1}` → `200 {ok:true,key}` | `403 {ok:false,reason:"forbidden"}` | `423 {ok:false,reason:"out-of-window",day,tz}` | `500 {ok:false,reason:"unconfigured"}` | `400 {ok:false,reason:"bad-request"}`; CORS echo of allowed origin only. Exports for tests: `isAllowedOrigin(origin, appOriginList)`, `weekdayInTz(date, tz)`, `handleUnlock(request, env)`, `unlockPreflight(request, env)`.

- [ ] **Step 1: Write the failing tests**

Create `checker/worker/test/unlock.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../src/index.js";
import { isAllowedOrigin, weekdayInTz } from "../src/unlock.js";

const KEY = Buffer.from(new Uint8Array(32).fill(3)).toString("base64");
const APP = "https://assignz.web.app";
const WED = "2026-09-23T04:00:00Z"; // 12:00 Manila — Wednesday
const TUE = "2026-09-22T04:00:00Z";

const unlockEnv = (over = {}) =>
  ({ UNLOCK_KEY: KEY, NOW: WED, ...over });

function post(path, body, headers = {}) {
  return new Request(`https://w.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("unit: isAllowedOrigin honors the comma list and default", () => {
  assert.equal(isAllowedOrigin(APP, undefined), true);
  assert.equal(isAllowedOrigin("https://assignz.firebaseapp.com", undefined), true);
  assert.equal(isAllowedOrigin("https://evil.test", undefined), false);
  assert.equal(isAllowedOrigin(null, undefined), false);
  assert.equal(isAllowedOrigin("https://a.test", "https://a.test , https://b.test"), true);
});

test("unit: weekdayInTz reads the server-side zone", () => {
  assert.equal(weekdayInTz(new Date(WED), "Asia/Manila"), "wednesday");
  assert.equal(weekdayInTz(new Date(TUE), "Asia/Manila"), "tuesday");
});

test("allowed origin + Wednesday → 200 with the key + echoed CORS", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }), unlockEnv());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), APP);
  assert.deepEqual(await res.json(), { ok: true, key: KEY });
});

test("non-Wednesday → 423 out-of-window with day+tz", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }),
    unlockEnv({ NOW: TUE }));
  assert.equal(res.status, 423);
  assert.equal(res.headers.get("access-control-allow-origin"), APP);
  const body = await res.json();
  assert.deepEqual(body, { ok: false, reason: "out-of-window", day: "tuesday",
    tz: "Asia/Manila" });
});

test("wrong origin → 403 with no CORS echo", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 },
    { origin: "https://evil.test" }), unlockEnv());
  assert.equal(res.status, 403);
  assert.equal(await (await res.json()).reason, "forbidden");
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("missing origin → 403", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }), unlockEnv());
  assert.equal(res.status, 403);
});

test("missing UNLOCK_KEY → 500 unconfigured (fail closed)", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }),
    { NOW: WED });
  assert.equal(res.status, 500);
  assert.equal(await (await res.json()).reason, "unconfigured");
});

test("short/long key → 500 unconfigured", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }),
    unlockEnv({ UNLOCK_KEY: Buffer.from(new Uint8Array(31)).toString("base64") }));
  assert.equal(res.status, 500);
});

test("custom UNLOCK_TZ/UNLOCK_DAY are honored", async () => {
  const res = await handler.fetch(post("/unlock", { v: 1 }, { origin: APP }),
    unlockEnv({ NOW: TUE, UNLOCK_TZ: "Pacific/Kiritimati", UNLOCK_DAY: "tuesday" }));
  assert.equal(res.status, 200);
});

test("body without v:1 → 400", async () => {
  const res = await handler.fetch(post("/unlock", {}), unlockEnv());
  assert.equal(res.status, 400);
});

test("OPTIONS preflight echoes the allowed origin only", async () => {
  const ok = await handler.fetch(new Request("https://w.test/unlock", {
    method: "OPTIONS", headers: { origin: APP } }), unlockEnv());
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), APP);
  const bad = await handler.fetch(new Request("https://w.test/unlock", {
    method: "OPTIONS", headers: { origin: "https://evil.test" } }), unlockEnv());
  assert.equal(bad.status, 204);
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
});

test("GET /unlock → 404; /grade and /models keep wildcard CORS", async () => {
  const gone = await handler.fetch(new Request("https://w.test/unlock"),
    unlockEnv());
  assert.equal(gone.status, 404);
  const models = await handler.fetch(new Request("https://w.test/models"), {});
  assert.equal(models.headers.get("access-control-allow-origin"), "*");
  const unauth = await handler.fetch(post("/grade", {}), {});
  assert.equal(unauth.status, 401);
  assert.equal(unauth.headers.get("access-control-allow-origin"), "*");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test checker/worker/test/unlock.test.js` (repo root)
Expected: module-not-found failure on `../src/unlock.js` — but note the import path relative to the test file is `../src/unlock.js`.

- [ ] **Step 3: Create `checker/worker/src/unlock.js`**

```js
const DEFAULT_APP_ORIGIN =
  "https://assignz.web.app,https://assignz.firebaseapp.com";
const DEFAULT_TZ = "Asia/Manila";

export function isAllowedOrigin(origin, appOriginList) {
  if (!origin) return false;
  return (appOriginList || DEFAULT_APP_ORIGIN)
    .split(",").map((s) => s.trim()).filter(Boolean).includes(origin);
}

export function weekdayInTz(now, tz) {
  return new Intl.DateTimeFormat("en-US",
    { timeZone: tz || DEFAULT_TZ, weekday: "long" })
    .format(now).toLowerCase();
}

function b64Is32(v) {
  let bin;
  try {
    bin = atob(String(v).trim());
  } catch {
    return false;
  }
  return bin.length === 32;
}

function unlockJson(status, obj, echo) {
  const headers = { "content-type": "application/json" };
  if (echo) headers["access-control-allow-origin"] = echo;
  return new Response(JSON.stringify(obj), { status, headers });
}

export async function handleUnlock(request, env) {
  const origin = request.headers.get("origin");
  const echo = isAllowedOrigin(origin, env.APP_ORIGIN) ? origin : null;
  if (!echo) return unlockJson(403, { ok: false, reason: "forbidden" }, null);
  const body = await request.json().catch(() => null);
  if (!body || body.v !== 1) {
    return unlockJson(400, { ok: false, reason: "bad-request" }, echo);
  }
  const key = env.UNLOCK_KEY ? String(env.UNLOCK_KEY).trim() : "";
  if (!key || !b64Is32(key)) {
    return unlockJson(500, { ok: false, reason: "unconfigured" }, echo);
  }
  const tz = env.UNLOCK_TZ || DEFAULT_TZ;
  const want = (env.UNLOCK_DAY || "wednesday").toLowerCase();
  const now = env.NOW ? new Date(env.NOW) : new Date();
  const day = weekdayInTz(now, tz);
  if (day !== want) {
    return unlockJson(423, { ok: false, reason: "out-of-window", day, tz }, echo);
  }
  return unlockJson(200, { ok: true, key }, echo);
}

export function unlockPreflight(request, env) {
  const origin = request.headers.get("origin");
  const headers = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
  };
  if (isAllowedOrigin(origin, env.APP_ORIGIN)) {
    headers["access-control-allow-origin"] = origin;
  }
  return new Response(null, { status: 204, headers });
}
```

`atob` returns the decoded byte string, so `bin.length === 32` is exactly "decodes to 32 bytes".

- [ ] **Step 4: Wire into `checker/worker/src/index.js`**

Line 1-4 imports: add `import { handleUnlock, unlockPreflight } from "./unlock.js";`.

Change `async fetch(request, _env) {` → `async fetch(request, env) {` and replace the NOTE comment (line 76) with:

```js
  // NOTE: one env secret by design — UNLOCK_KEY (assignment unlock, released
  // Wednesday + app-origin only). /grade still holds no key: the teacher's
  // Go key arrives per request.
```

Insert the unlock route BEFORE the generic OPTIONS branch (before line 79's `if (request.method === "OPTIONS")`):

```js
    if (url.pathname === "/unlock") {
      if (request.method === "OPTIONS") return unlockPreflight(request, env);
      if (request.method === "POST") return await handleUnlock(request, env);
      return json(404, { error: "not found" });
    }
```

- [ ] **Step 5: Run worker tests**

Run: `node --test checker/worker/test/*.test.js`
Expected: all pass (old 27 + new ~12), 0 fail.

- [ ] **Step 6: Update `checker/worker/README.md`**

Replace the second paragraph line `Stateless CORS + protocol proxy: browser `POST /grade` → OpenCode Go. Holds NO secret — the teacher's Go key is forwarded per request and never logged.` with:

```markdown
Stateless CORS + protocol proxy: browser `POST /grade` → OpenCode Go. The
teacher's Go key is forwarded per request and never logged. It holds exactly
ONE secret — `UNLOCK_KEY` — and releases it only via `POST /unlock`, only to
an allowed `APP_ORIGIN` and only inside the unlock window (server clock;
default Wednesday `Asia/Manila`, overridable via `UNLOCK_DAY`/`UNLOCK_TZ`).
Every failure is fail-closed (403 / 500 / 423) and carries no key.

Deploy once per key: `npx wrangler secret put UNLOCK_KEY` with the base64
value from the local `build/key/unlock.key` (see v2/SKILL.md v2.9 note).
Losing/rotating it orphans every lesson built against the old key.
```

- [ ] **Step 7: Commit**

```bash
git add checker/worker/src/unlock.js checker/worker/src/index.js checker/worker/test/unlock.test.js checker/worker/README.md
git commit -m "feat(worker): POST /unlock — releases the assignment key on Wednesday to the app origin only"
```

---

### Task 4: Student viewer unlock relay

**Files:**
- Create: `checker/app/lib/unlock.js`
- Create: `checker/app/test/unlock.test.js`
- Modify: `checker/app/viewer.html` (module script after the existing inline script)
- Modify: `checker/app/README.md` (viewer bullet)

**Interfaces:**
- Consumes: Worker `POST /unlock` from Task 3.
- Produces: `WORKER_URL` const; `relayUnlock(workerUrl, fetchImpl, reply)`; `unlockMessageHandler({stage, workerUrl, fetchImpl})` → listener verifying `ev.source === stage.contentWindow`, replying `{type:"ln-unlock-response",v:1,...}` to the frame.

- [ ] **Step 1: Write the failing tests**

Create `checker/app/test/unlock.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { WORKER_URL, relayUnlock, unlockMessageHandler } from "../lib/unlock.js";

function frame() {
  return { posts: [], postMessage(m) { this.posts.push(m); } };
}

test("WORKER_URL is the deployed checker worker", () => {
  assert.equal(WORKER_URL, "https://checker-grade.aclc-obero.workers.dev");
});

test("request from the staged iframe is forwarded and the key relays back", async () => {
  const f = frame();
  const calls = [];
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async (url, init) => {
      calls.push([url, init.method, init.body]);
      return { ok: true, status: 200, json: async () => ({ ok: true, key: "a2tleQ==" }) };
    },
  });
  await handler({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.equal(calls[0][0], "https://w.test/unlock");
  assert.equal(calls[0][1], "POST");
  assert.deepEqual(JSON.parse(calls[0][2]), { v: 1 });
  assert.deepEqual(f.posts,
    [{ type: "ln-unlock-response", v: 1, ok: true, key: "a2tleQ==" }]);
});

test("out-of-window reply is relayed with its reason", async () => {
  const f = frame();
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async () => ({ ok: false, status: 423,
      json: async () => ({ ok: false, reason: "out-of-window", day: "tuesday" }) }),
  });
  await handler({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: false,
    reason: "out-of-window" }]);
});

test("fetch failure relays {ok:false, reason:'network'}", async () => {
  const f = frame();
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async () => { throw new TypeError("offline"); },
  });
  await handler({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: false,
    reason: "network" }]);
});

test("a message from another source is ignored", async () => {
  const f = frame();
  let called = false;
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
  });
  await handler({ source: { }, data: { type: "ln-unlock-request", v: 1 } });
  assert.equal(called, false);
  assert.deepEqual(f.posts, []);
});

test("foreign message types are ignored", async () => {
  const f = frame();
  let called = false;
  const handler = unlockMessageHandler({
    stage: { contentWindow: f },
    workerUrl: "https://w.test",
    fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
  });
  await handler({ source: f, data: { type: "something-else", v: 1 } });
  await handler({ source: f, data: { type: "ln-unlock-request", v: 2 } });
  assert.equal(called, false);
});

test("relayUnlock survives a non-JSON body", async () => {
  const replies = [];
  await relayUnlock("https://w.test",
    async () => ({ ok: true, status: 200, json: async () => { throw new Error("nope"); } }),
    (r) => replies.push(r));
  assert.deepEqual(replies, [{ type: "ln-unlock-response", v: 1, ok: false,
    reason: "network" }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test checker/app/test/unlock.test.js` → cannot-find-module failure.

- [ ] **Step 3: Create `checker/app/lib/unlock.js`**

```js
export const WORKER_URL = "https://checker-grade.aclc-obero.workers.dev";
const REQ = "ln-unlock-request";
const RESP = "ln-unlock-response";

export async function relayUnlock(workerUrl, fetchImpl, reply) {
  try {
    const res = await fetchImpl(`${String(workerUrl).replace(/\/$/, "")}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ v: 1 }),
    });
    const j = await res.json().catch(() => null);
    if (j && j.ok === true && typeof j.key === "string") {
      reply({ type: RESP, v: 1, ok: true, key: j.key });
    } else if (j && j.ok === false && typeof j.reason === "string") {
      reply({ type: RESP, v: 1, ok: false, reason: j.reason });
    } else {
      reply({ type: RESP, v: 1, ok: false, reason: "network" });
    }
  } catch {
    reply({ type: RESP, v: 1, ok: false, reason: "network" });
  }
}

export function unlockMessageHandler({ stage, workerUrl = WORKER_URL,
  fetchImpl = (u, init) => globalThis.fetch(u, init) }) {
  return function (ev) {
    if (!stage || !stage.contentWindow || ev.source !== stage.contentWindow) return;
    const m = ev.data;
    if (!m || m.type !== REQ || m.v !== 1) return;
    return relayUnlock(workerUrl, fetchImpl, (resp) => {
      try {
        ev.source.postMessage(resp, "*");
      } catch { /* frame is gone */ }
    });
  };
}
```

- [ ] **Step 4: Wire `viewer.html`**

Insert directly before `</body>` (after the existing classic `<script>` IIFE, line ~143):

```html
<script type="module">
import { unlockMessageHandler } from "./lib/unlock.js";
window.addEventListener("message", unlockMessageHandler({
  stage: document.getElementById("stage"),
}));
</script>
```

No other viewer change — the "Open in new tab ↗" button stays (a lesson opened that way has no parent channel and shows the locked card, which carries the viewer link; that is intended, spec §7).

- [ ] **Step 5: Run tests + verify existing app suite**

Run: `node --test checker/app/test/*.test.js` → all pass (40 + new 7).

- [ ] **Step 6: Update `checker/app/README.md`**

In the bullet `- **HTML Viewer** (\`viewer.html\`) — for students. ...`, after `Files never leave the device.` add: `On Wednesday (Asia/Manila) it also relays the assignment unlock request from the staged lesson iframe to the Worker (`lib/unlock.js` → \`POST /unlock\`); the lesson decrypts only inside this page.`

- [ ] **Step 7: Commit**

```bash
git add checker/app/lib/unlock.js checker/app/test/unlock.test.js checker/app/viewer.html checker/app/README.md
git commit -m "feat(viewer): unlock relay — iframe channel to Worker /unlock"
```

---

### Task 5: Teacher preview viewer (offline unlock + time stub)

**Files:**
- Create: `checker/app/lib/preview.js`
- Create: `checker/app/test/preview.test.js`
- Create: `checker/app/teacher-viewer.html`
- Modify: `checker/app/teacher.html` (header link)
- Modify: `checker/app/README.md` (teacher preview section)

**Interfaces:**
- Consumes: the §8/§7 message protocol; the component's trusted-time `TIME_SOURCES` hosts (`worldtimeapi.org`, `utctime.app`, `time.now`, `sunrise.am`); `ln:window-day` meta.
- Produces (from `lib/preview.js`, all ESM): `windowDayFromHtml(html)`, `timeStubScript(day)`, `injectTimeStub(html, dayOverride?)`, `decodeUnlockKey(text) -> Uint8Array(32)` (throws `empty-key` | `not-base64` | `not-32-bytes`), `previewUnlockHandler({stage, getKey}) -> listener`.

- [ ] **Step 1: Write the failing tests**

Create `checker/app/test/preview.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { windowDayFromHtml, timeStubScript, injectTimeStub,
  decodeUnlockKey, previewUnlockHandler } from "../lib/preview.js";

const LESSON = '<!DOCTYPE html><html><head>' +
  '<meta name="ln:window-day" content="friday">' +
  '<script>window.LN={data:{}};</' + 'script></head><body></body></html>';
const PLAIN = '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>';

function stubOf(html) {
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, "stub script present");
  return m[1];
}

function runStub(html) {
  const win = { fetch: (input) => ({ viaOrig: String(input.url || input) }) };
  new Function("window", stubOf(html))(win);
  return win;
}

test("injectTimeStub lands right after <head>, before the lesson's own scripts", () => {
  const out = injectTimeStub(LESSON);
  const headEnd = out.indexOf("<head>") + "<head>".length;
  const stub = out.indexOf("<script>", headEnd);
  assert.ok(stub >= headEnd, "after <head>");
  assert.ok(stub < out.indexOf("window.LN"), "before the lesson script");
});

test("stub answers only the four trusted-time hosts", async () => {
  const win = runStub(injectTimeStub(LESSON));
  for (const host of ["https://worldtimeapi.org/api/timezone/Asia/Manila",
    "https://utctime.app/api/now/Asia/Manila",
    "https://time.now/developer/api/timezone/Asia/Manila",
    "https://sunrise.am/developer/api/timezone/Asia/Manila"]) {
    const resp = await win.fetch({ url: host });
    assert.equal(resp.ok, true, host);
    const j = await resp.json();
    assert.equal(j.day_of_week, "friday", host);
    assert.ok(!isNaN(Date.parse(j.datetime)), host);
    assert.equal(typeof j.unixtime, "number", host);
  }
});

test("every other URL passes through to the original fetch", () => {
  const win = runStub(injectTimeStub(LESSON));
  const p = win.fetch({ url: "https://example.com/api" });
  assert.equal(p.viaOrig, "https://example.com/api");
});

test("window day comes from ln:window-day, defaults to wednesday", () => {
  assert.equal(windowDayFromHtml(LESSON), "friday");
  assert.equal(windowDayFromHtml(PLAIN), "wednesday");
  assert.equal(windowDayFromHtml(
    '<meta name="ln:window-day" content="somnday">'), "wednesday");
  assert.ok(timeStubScript("bogus").includes('"wednesday"'));
  assert.ok(timeStubScript("Friday").includes('"friday"'));
});

test("decodeUnlockKey accepts 32-byte base64, rejects the rest", () => {
  const good = Buffer.from(new Uint8Array(32).fill(5)).toString("base64");
  assert.equal(decodeUnlockKey(good).length, 32);
  assert.equal(decodeUnlockKey("  " + good + "\n").length, 32);
  assert.throws(() => decodeUnlockKey(
    Buffer.from(new Uint8Array(31)).toString("base64")), /not-32-bytes/);
  assert.throws(() => decodeUnlockKey("not base64 !!"), /not-base64/);
  assert.throws(() => decodeUnlockKey(""), /empty-key/);
  assert.throws(() => decodeUnlockKey(null), /empty-key/);
});

test("handler answers the frame's unlock request from the local key", async () => {
  const f = { posts: [], postMessage(m) { this.posts.push(m); } };
  let key = "a2V5";
  const h = previewUnlockHandler({ stage: { contentWindow: f },
    getKey: () => key });
  await h({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: true,
    key: "a2V5" }]);
  f.posts.length = 0;
  key = null;
  await h({ source: f, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, [{ type: "ln-unlock-response", v: 1, ok: false,
    reason: "no-key" }]);
  f.posts.length = 0;
  await h({ source: { }, data: { type: "ln-unlock-request", v: 1 } });
  assert.deepEqual(f.posts, []);
  await h({ source: f, data: { type: "other", v: 1 } });
  assert.deepEqual(f.posts, []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test checker/app/test/preview.test.js` → module not found.

- [ ] **Step 3: Create `checker/app/lib/preview.js`**

```js
const TIME_HOSTS = ["worldtimeapi.org", "utctime.app", "time.now", "sunrise.am"];
const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday",
  "saturday"];

export function windowDayFromHtml(html) {
  const m = /<meta\s+name=["']ln:window-day["']\s+content=["']([a-z]+)["']/i
    .exec(html || "");
  const day = m ? m[1].toLowerCase() : "";
  return DOW.includes(day) ? day : "wednesday";
}

export function timeStubScript(day) {
  const d = DOW.includes(String(day || "").toLowerCase())
    ? String(day).toLowerCase() : "wednesday";
  return "<script>(function(){var HOSTS=" + JSON.stringify(TIME_HOSTS) +
    ";var DAY=" + JSON.stringify(d) +
    ";var orig=window.fetch&&window.fetch.bind(window);" +
    "window.fetch=function(input,init){" +
    "var u=(input&&input.url)?String(input.url):String(input);" +
    "for(var i=0;i<HOSTS.length;i++){if(u.indexOf(HOSTS[i])!==-1){" +
    "var now=new Date();" +
    "var p={day_of_week:DAY,datetime:now.toISOString()," +
    "unixtime:Math.floor(now.getTime()/1000)};" +
    "return Promise.resolve({ok:true,status:200,url:u," +
    "json:function(){return Promise.resolve(p)}," +
    "text:function(){return Promise.resolve(JSON.stringify(p))}});" +
    "}}" +
    "if(orig)return orig(input,init);" +
    "return Promise.reject(new Error('fetch-unavailable'));};})();" +
    "<" + "/script>";
}

export function injectTimeStub(html, dayOverride) {
  const text = String(html || "");
  const d = DOW.includes(String(dayOverride || "").toLowerCase())
    ? String(dayOverride).toLowerCase() : windowDayFromHtml(text);
  const stub = timeStubScript(d);
  const m = /<head[^>]*>/i.exec(text);
  if (m) {
    const at = m.index + m[0].length;
    return text.slice(0, at) + stub + text.slice(at);
  }
  const s = /<script/i.exec(text);
  if (s) return text.slice(0, s.index) + stub + text.slice(s.index);
  return stub + text;
}

export function decodeUnlockKey(text) {
  const b64 = String(text == null ? "" : text).replace(/\s+/g, "");
  if (!b64) throw new Error("empty-key");
  let bin;
  try {
    bin = atob(b64);
  } catch {
    throw new Error("not-base64");
  }
  if (bin.length !== 32) throw new Error("not-32-bytes");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function previewUnlockHandler({ stage, getKey }) {
  return function (ev) {
    if (!stage || !stage.contentWindow || ev.source !== stage.contentWindow) return;
    const m = ev.data;
    if (!m || m.type !== "ln-unlock-request" || m.v !== 1) return;
    const key = getKey();
    const resp = key
      ? { type: "ln-unlock-response", v: 1, ok: true, key }
      : { type: "ln-unlock-response", v: 1, ok: false, reason: "no-key" };
    try {
      ev.source.postMessage(resp, "*");
    } catch { /* frame is gone */ }
  };
}
```

- [ ] **Step 4: Run lib tests**

Run: `node --test checker/app/test/preview.test.js` → pass (7).

- [ ] **Step 5: Create `checker/app/teacher-viewer.html`**

Full file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teacher Preview — HTML Viewer (unlock any day)</title>
<script>
(function () {
  try {
    if (sessionStorage.getItem("teacherAuth") !== "1") {
      window.location.replace("./index.html");
    }
  } catch (e) {
    window.location.replace("./index.html");
  }
})();
</script>
<style>
:root{--ink:#1e2a32;--mut:#5b6b76;--bg:#f4f1ea;--card:#fff;--line:#d8d2c4;--acc:#0f766e;--warn:#b45309}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,Segoe UI,Roboto,Arial,sans-serif}
header{background:#12312e;color:#f5f1e6;padding:18px 22px}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;opacity:.8;font-size:13px}
header a.home{color:#f5f1e6;opacity:.85;font-size:13px;text-decoration:none;border:1px solid #ffffff55;border-radius:8px;padding:4px 10px;display:inline-block;margin-bottom:8px}
header a.home:hover{opacity:1;background:#ffffff18}
main{max-width:1060px;margin:0 auto;padding:18px}
#banner{background:var(--warn);color:#fff;border-radius:10px;padding:9px 14px;font-size:13.5px;font-weight:600;margin:0 0 14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 14px}
.card h2{margin:0 0 8px;font-size:17px}.card p{margin:6px 0;color:var(--mut);font-size:14px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
label{font-size:13px;color:var(--mut);display:block;margin-bottom:4px}
input[type=text]{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;min-width:220px;background:#fff;color:var(--ink);flex:1}
textarea{font:13px/1.4 Consolas,Menlo,monospace;padding:8px 10px;border:1px solid var(--line);border-radius:8px;width:100%;min-height:54px}
button{font:inherit;font-weight:600;background:var(--acc);color:#fff;border:0;border-radius:8px;padding:9px 16px;cursor:pointer}
button.ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}button:disabled{opacity:.45;cursor:not-allowed}
.note{font-size:13px;color:var(--mut)}.mono{font-family:Consolas,Menlo,monospace;font-size:13px}
#drop{border:1px dashed var(--line);border-radius:8px;padding:16px;margin-top:10px;text-align:center}
#keyDrop{border:1px dashed var(--line);border-radius:8px;padding:12px;margin-top:10px;text-align:center}
#fileList{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
#fileList button{padding:6px 12px;font-size:13px}
#fileList button.on{outline:2px solid var(--acc);outline-offset:1px}
#stageWrap{margin-top:12px}
#stage{width:100%;height:70vh;min-height:480px;border:1px solid var(--line);border-radius:12px;background:#fff}
#empty{padding:24px;text-align:center;border:1px solid var(--line);border-radius:12px;background:#fff}
footer{color:var(--mut);font-size:12px;text-align:center;padding:14px}
</style>
</head>
<body>
<header>
<a class="home" href="./teacher.html">← Teacher</a>
<h1>Teacher Preview <span style="opacity:.6">· lesson viewer</span></h1>
<p>Opens any built lesson and runs the assignment on any day — no Worker call. Not for students.</p>
</header>
<main>
<div id="banner">Teacher preview — time lock bypassed (key loaded: no)</div>

<div class="card">
<h2>1 · Lesson file</h2>
<p>Pick or drop a built lesson <span class="mono">.html</span>. A trusted-time stub is injected in-memory (never on disk), so the lesson's own Wednesday gate opens on its window day. Encrypted lessons additionally need the unlock key below.</p>
<div class="row">
<div><label for="filePick">Lesson file (.html)</label><input type="file" id="filePick" accept=".html,.htm,text/html" multiple></div>
</div>
<div id="drop" class="note">Or drop .html files here</div>
<div id="fileList"></div>
<p class="note" id="fileStatus">No file opened yet.</p>
</div>

<div class="card">
<h2>2 · …or a lesson link</h2>
<div class="row">
<input type="text" id="urlInput" placeholder="https://…/lesson.html" inputmode="url">
<div><label>&nbsp;</label><button id="loadUrl" type="button">Load link →</button></div>
</div>
</div>

<div class="card">
<h2>3 · Unlock key (encrypted lessons only)</h2>
<p>Drop or pick <span class="mono">build/key/unlock.key</span> — or paste its base64. The key stays in memory for this page session only: never stored, never written anywhere. Legacy/plaintext lessons ignore it.</p>
<div class="row">
<div><label for="keyPick">unlock.key file</label><input type="file" id="keyPick" accept=".key,.txt,.pem,*"></div>
<div style="flex:1 1 260px"><label for="keyPaste">or paste base64</label><textarea id="keyPaste" placeholder="44-char base64 (32 bytes)…" spellcheck="false"></textarea></div>
<div><label>&nbsp;</label><button id="loadKey" type="button">Load key</button></div>
<div><label>&nbsp;</label><button id="forgetKey" class="ghost" type="button">Forget key</button></div>
</div>
<div id="keyDrop" class="note">Or drop unlock.key here</div>
<p class="note" id="keyStatus">No key loaded — encrypted lessons stay locked in this preview.</p>
</div>

<div id="stageWrap">
<div id="empty"><p class="note" style="margin:0">Your lesson will appear here after you pick a file or load a link.</p></div>
<iframe id="stage" title="Lesson preview" hidden></iframe>
</div>
</main>
<footer>Teacher preview · the unlock key is never served; only build/key/unlock.key and the Worker secret hold it.</footer>
<script type="module">
import { injectTimeStub, decodeUnlockKey, previewUnlockHandler } from "./lib/preview.js";

const files = [];
let current = -1;
let keyB64 = null;
const filePick = document.getElementById("filePick");
const fileList = document.getElementById("fileList");
const fileStatus = document.getElementById("fileStatus");
const stage = document.getElementById("stage");
const empty = document.getElementById("empty");
const banner = document.getElementById("banner");
const keyStatus = document.getElementById("keyStatus");
const keyPaste = document.getElementById("keyPaste");

function setBanner() {
  banner.textContent = "Teacher preview — time lock bypassed (key loaded: " +
    (keyB64 ? "yes" : "no") + ")";
}

function show(i) {
  if (i < 0 || i >= files.length) return;
  current = i;
  stage.hidden = false;
  empty.hidden = true;
  stage.src = files[i].url;
  fileStatus.textContent = "Viewing: " + files[i].name;
  renderList();
}

function renderList() {
  fileList.innerHTML = "";
  files.forEach(function (f, i) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ghost" + (i === current ? " on" : "");
    b.textContent = f.name;
    b.addEventListener("click", function () { show(i); });
    fileList.appendChild(b);
  });
}

function openHtml(name, text) {
  const injected = injectTimeStub(text);
  const url = URL.createObjectURL(new Blob([injected], { type: "text/html" }));
  files.push({ name, url });
  show(files.length - 1);
}

function acceptFiles(list) {
  const picked = Array.prototype.slice.call(list || []).filter(function (f) {
    return /\.html?$/i.test(f.name) || (f.type && f.type.indexOf("html") !== -1);
  });
  if (!picked.length && list && list.length) {
    fileStatus.textContent = "That doesn't look like an .html file — please pick the lesson .html file.";
    return;
  }
  picked.forEach(function (f) {
    f.text().then(function (t) { openHtml(f.name, t); });
  });
}

filePick.addEventListener("change", function (e) {
  acceptFiles(e.target.files);
  filePick.value = "";
});
const drop = document.getElementById("drop");
drop.addEventListener("dragover", function (e) { e.preventDefault(); });
drop.addEventListener("drop", function (e) {
  e.preventDefault();
  acceptFiles(e.dataTransfer.files);
});

document.getElementById("loadUrl").addEventListener("click", async function () {
  const u = (document.getElementById("urlInput").value || "").trim();
  if (!/^https?:\/\//i.test(u)) {
    fileStatus.textContent = "Paste a full link starting with https://";
    return;
  }
  try {
    const r = await fetch(u);
    if (!r.ok) throw new Error("http " + r.status);
    openHtml(u, await r.text());
  } catch {
    files.push({ name: u, url: u });
    show(files.length - 1);
    fileStatus.textContent = "Couldn't read the link text (CORS?) — opened un-injected: an encrypted lesson there stays locked without the key, a legacy one keeps its real Wednesday gate.";
  }
});

function setKeyFromText(text, source) {
  try {
    decodeUnlockKey(text);
  } catch (e) {
    keyStatus.textContent = "Rejected (" + e.message + ") — the key must be the 32-byte base64 from build/key/unlock.key.";
    return;
  }
  keyB64 = String(text).replace(/\s+/g, "");
  keyStatus.textContent = "Key loaded from " + source + " — encrypted lessons will unlock. In memory only.";
  setBanner();
}

const keyPick = document.getElementById("keyPick");
keyPick.addEventListener("change", function (e) {
  const f = e.target.files && e.target.files[0];
  if (f) f.text().then(function (t) { setKeyFromText(t, f.name); });
  keyPick.value = "";
});
const keyDrop = document.getElementById("keyDrop");
keyDrop.addEventListener("dragover", function (e) { e.preventDefault(); });
keyDrop.addEventListener("drop", function (e) {
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) f.text().then(function (t) { setKeyFromText(t, f.name); });
});
document.getElementById("loadKey").addEventListener("click", function () {
  setKeyFromText(keyPaste.value, "pasted text");
});
document.getElementById("forgetKey").addEventListener("click", function () {
  keyB64 = null;
  keyPaste.value = "";
  keyStatus.textContent = "Key forgotten — encrypted lessons stay locked in this preview.";
  setBanner();
});

window.addEventListener("message", previewUnlockHandler({
  stage: stage,
  getKey: function () { return keyB64; },
}));
</script>
</body>
</html>
```

- [ ] **Step 6: Link it from `teacher.html`**

In the header (line ~56), after `<a class="home" href="./index.html">← Home</a>` add:

```html
<a class="home" href="./teacher-viewer.html" style="margin-left:8px">Lesson preview →</a>
```

- [ ] **Step 7: Update `checker/app/README.md`**

After the `- **Teacher** (\`teacher.html\`) ...` bullet block add:

```markdown
- **Teacher Preview** (`teacher-viewer.html`) — grading-side lesson viewer,
  gated by the same `sessionStorage.teacherAuth` flag. Opens any built lesson
  any day **without the Worker**: legacy/plaintext builds get an injected
  trusted-time stub (in-memory copy only — the file on disk is never modified),
  encrypted builds unlock via `build/key/unlock.key` dropped in or pasted, kept
  in memory only (never localStorage, never a served file). Submissions made
  from the preview are ordinary rows — the teacher just ignores them.
```

- [ ] **Step 8: Run the full checker suite + smoke + green bar**

Run: `node --test checker/app/test/*.test.js` → all pass (47+).
Run: `node --test checker/worker/test/*.test.js` → all pass.
Run: `node v2/tools/assignment_smoke.js` → `SMOKE OK`.
Run the global-constraints pytest bar → only `test_pack_names_exact` fails.
Manual (operator, later): open `teacher-viewer.html` via `npx serve checker/app`, pass the teacher gate (set `sessionStorage.teacherAuth="1"` or enter the landing password), load the lesson-demo build — plaintext walk with stub, then an encrypted build with the key.

- [ ] **Step 9: Commit**

```bash
git add checker/app/lib/preview.js checker/app/test/preview.test.js checker/app/teacher-viewer.html checker/app/teacher.html checker/app/README.md
git commit -m "feat(checker): teacher preview viewer — local unlock any day"
```

---

### Task 6: Docs sweep + version bump to v2.9

**Files:**
- Modify: `v2/SKILL.md` (frontmatter line 3, title line 16, new v2.9 paragraph after the v2.8 one ~line 104)
- Modify: `README.md` (v2.8 paragraph lines 51-53, trusted-time mentions lines 4, 32-33, 78)
- Modify: `v2/skeleton/components/registry.md` (assignment row, line 22)

**Interfaces:**
- Consumes: nothing executable. Produces: docs consistent with Tasks 1-5.

- [ ] **Step 1: v2/SKILL.md**

Line 3: `version: 2.8` → `version: 2.9`.
Line 16: `# Interactive Lesson Notebook (v2.8 — outline-first, one agent per section)` → `# Interactive Lesson Notebook (v2.9 — outline-first, one agent per section)`.
Immediately after the "What v2.8 adds:" paragraph (ends with `...design spec §1.1).`) insert:

```markdown
What v2.9 adds: **assignment ciphertext at rest + app-only unlock**. Every
assignment build ships `LN.data.<key>` as an AES-256-GCM envelope (`{lnenc,v,iv,ct}`)
of the sanitized object — no question text exists in the file, so opening it in
a browser, another viewer, or an AI yields nothing. One universal key lives in
`build/key/unlock.key` (gitignored; `LN_UNLOCK_KEY` env overrides) and as the
Worker secret `UNLOCK_KEY`; the Worker releases it only on Wednesday
(Asia/Manila, server clock) to the app origin. The deck decrypts only inside the
HTML Viewer's iframe channel (or the teacher-only `teacher-viewer.html`, which
loads the key at runtime — the key never enters a served file), and every
failure is fail-closed to a locked card. Teacher preview stubs trusted time
for legacy builds so any day behaves like the lesson's window day.
```

- [ ] **Step 2: Root README.md**

Line 1: `... interactive-lesson-notebook` v2.4` → leave (historic header) — instead extend the v2.8 paragraph (lines 51-53) by appending after `...adds a\nTime Submitted column to the checker export.`:

```markdown
v2.9 encrypts the assignment at rest: built lessons carry only an AES-256-GCM
envelope of the questions (no prompt text to copy or feed to an AI), the
Cloudflare Worker releases the universal key only on Wednesday (Asia/Manila)
to the HTML Viewer app, and a teacher-only preview viewer unlocks any day with
a locally-loaded key. See docs/superpowers/specs/2026-09-24-assignment-encryption-design.md.
```

Line 4: `(assignment builds make one optional trusted-time request\nto worldtimeapi.org)` → `(assignment builds make optional trusted-time\nrequests — see v2.9)`; lines 32-33: `the assignment's optional\n  worldtimeapi.org trusted-time lookup is the sole runtime request` → `the assignment's optional\n  trusted-time lookups (worldtimeapi.org + fallbacks) are the sole runtime requests;\n  the questions themselves are ciphertext until unlocked in the HTML Viewer`.
Line 78: `an assignment's time gate needs the trusted-time lookup` → `an assignment's time gate + submit stamp need the trusted-time lookup, and v2.9-encrypted assignments only open inside the HTML Viewer app (Wednesday) or the teacher preview`.

- [ ] **Step 3: registry.md assignment row**

Append to the end of the assignment row's data-shape cell (line 22, after `...submit carries `submitted_at` + `submitted_time_source`.`):

```
**Encrypted at rest (v2.9):** builds replace this data with `{lnenc,v,iv,ct}` ciphertext; the deck only renders inside the HTML Viewer app (Worker-gated unlock, Wednesday Asia/Manila) or teacher-viewer with the local key.
```

- [ ] **Step 4: Verify + commit**

Run: `python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"` → only `test_pack_names_exact` fails (docstrings unchanged where tests assert them).
```bash
git add v2/SKILL.md README.md v2/skeleton/components/registry.md
git commit -m "docs: v2.9 — assignment encryption across SKILL, README, component registry"
```

---

## Spec coverage map (self-check)

| Spec | Covered by |
|---|---|
| §4 build-time encryption, envelope, trigger, IV randomness | Task 1 |
| §5 `ensure_unlock_key`, env override, damage fails build, `(bytes,b64)` | Task 1 |
| §6 Worker `/unlock`, order origin→secret→day, codes, CORS echo, `NOW`, pure helpers, comment | Task 3 |
| §7 viewer relay, source verify, network→"network", no UI change | Task 4 |
| §8 component dispatcher, `gateBypass`, locked cards, VIEWER_URL, 10 s timeout | Task 2 |
| §9 teacher preview: auth gate, stub, key load/forget/32-byte reject, remote links, banner, no tag, `preview.js` helpers | Task 5 |
| §12 pytest/worker/app/preview/smoke tests + e2e audit | Tasks 1-5 test steps |
| §13 rollout order 1→6 | Task order |
| §11 docs sweep (SKILL/README/registry/worker/app README/assignment README) | Tasks 2-6 |
| §2h key never in a served file | Task 1 (build), Task 4/5 (pages contain constants + relay only), global constraints |
