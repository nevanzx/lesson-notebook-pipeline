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

