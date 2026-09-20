import base64
import hashlib
import pytest
import build
from cryptography.hazmat.primitives import serialization


def test_fresh_keys_create_no_pem_file(tmp_path):
    kd = tmp_path / "build" / "key"
    keys = build.ensure_teacher_keys(kd, output_stem="Week4-Notebook")
    assert not (kd / "keys.pem").exists()
    assert keys["pem"] is None
    assert "BEGIN PRIVATE KEY" in keys["pem_text"]
    assert "BEGIN PUBLIC KEY" in keys["pem_text"]
    pub = serialization.load_der_public_key(base64.b64decode(keys["pub_b64"]))
    assert pub.key_size >= 2048
    assert keys["id"] == hashlib.sha256(base64.b64decode(keys["pub_b64"])).hexdigest()[:12]


def test_rebuild_restores_keys_from_key_json(tmp_path):
    from test_assignment_contract import v20
    run = tmp_path / "run"
    run.mkdir()
    kd = run / "build" / "key"
    keys = build.ensure_teacher_keys(kd, output_stem="Week4-Notebook")
    build.write_key_file(run, {"title": "T", "output": "Week4-Notebook.html",
                               "week": 4, "subject": "Mgmt"}, v20(), keys)
    again = build.ensure_teacher_keys(kd, output_stem="Week4-Notebook")
    assert again["id"] == keys["id"]
    assert again["pub_b64"] == keys["pub_b64"]
    assert not (kd / "keys.pem").exists()


def test_legacy_keys_pem_still_used(tmp_path):
    from tools.make_keys import generate_pem
    kd = tmp_path / "build" / "key"
    kd.mkdir(parents=True)
    generate_pem(kd / "keys.pem")
    keys = build.ensure_teacher_keys(kd, output_stem="Week4-Notebook")
    assert keys["pem"] == kd / "keys.pem"
    assert "BEGIN PRIVATE KEY" in keys["pem_text"]


def test_ambiguous_key_json_raises(tmp_path):
    from test_assignment_contract import v20
    run = tmp_path / "run"
    run.mkdir()
    kd = run / "build" / "key"
    cfg = {"title": "T", "week": 4, "subject": "Mgmt"}
    k1 = build.ensure_teacher_keys(kd)
    build.write_key_file(run, dict(cfg, output="Week4-Notebook.html"), v20(), k1)
    k2 = build.ensure_teacher_keys(kd)
    assert k2["id"] != k1["id"]
    build.write_key_file(run, dict(cfg, output="Week5-Notebook.html"), v20(), k2)
    with pytest.raises(ValueError):
        build.ensure_teacher_keys(kd, output_stem="Week9-Notebook")


def test_corrupt_key_file_raises(tmp_path):
    kd = tmp_path / "build" / "key"
    kd.mkdir(parents=True)
    (kd / "keys.pem").write_text("not a pem", encoding="utf-8")
    with pytest.raises(ValueError):
        build.ensure_teacher_keys(kd)


def test_sanitize_filename():
    assert build.sanitize_filename('Dela Cruz, Juan') == 'Dela Cruz, Juan'
    assert build.sanitize_filename('Reyes / Co') == 'Reyes _ Co'
    assert build.sanitize_filename('José<>:"/\\|?*') == 'José_'
    assert build.sanitize_filename('  ok  ') == 'ok'
    assert build.sanitize_filename('') == 'unnamed'
