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
