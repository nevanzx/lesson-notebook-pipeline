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
