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

