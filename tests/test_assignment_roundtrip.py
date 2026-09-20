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


def enc_like_js(pem_text, payload):
    """Mirror the browser's envelope exactly: AES-GCM then RSA-OAEP-SHA256 wrap."""
    pub_pem = ("-----BEGIN PUBLIC KEY-----" +
               pem_text.split("-----BEGIN PUBLIC KEY-----")[1].split(
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


def make_lesson_key(tmp_path, output="Week4-Notebook.html"):
    from test_assignment_contract import v20
    run = tmp_path / "run"
    run.mkdir(parents=True, exist_ok=True)
    keys = build.ensure_teacher_keys(run / "build" / "key",
                                     output_stem=Path(output).stem)
    kf = build.write_key_file(run, {"title": "T", "output": output,
                                    "week": 4, "subject": "S"}, v20(), keys)
    assert not (run / "build" / "key" / "keys.pem").exists()
    return keys, kf


def test_roundtrip(tmp_path):
    keys, kf = make_lesson_key(tmp_path)
    f = tmp_path / "Dela Cruz, Juan - Week 4 - S.json"
    f.write_text(json.dumps(enc_like_js(keys["pem_text"], payload())),
                 encoding="utf-8")
    r = subprocess.run([sys.executable, str(TOOL), "--key", str(kf), str(f)],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    body = json.loads(r.stdout)
    assert body["student"]["id"] == "20190001"
    assert body["answers"][0]["answer"] == "true"
    assert body["key_id"] == "deadbeefcafe"


def test_wrong_key_refuses(tmp_path):
    k1, kf1 = make_lesson_key(tmp_path / "k1")
    k2, _kf2 = make_lesson_key(tmp_path / "k2")
    f = tmp_path / "x.json"
    f.write_text(json.dumps(enc_like_js(k2["pem_text"], payload())), encoding="utf-8")
    r = subprocess.run([sys.executable, str(TOOL), "--key", str(kf1), str(f)],
                       capture_output=True, text=True)
    assert r.returncode != 0
    assert "cannot decrypt" in (r.stdout + r.stderr)


def test_plaintext_refused(tmp_path):
    _keys, kf = make_lesson_key(tmp_path)
    f = tmp_path / "plain.json"
    f.write_text('{"answers": []}', encoding="utf-8")
    r = subprocess.run([sys.executable, str(TOOL), "--key", str(kf), str(f)],
                       capture_output=True, text=True)
    assert r.returncode == 0
    assert '"error"' in r.stdout
