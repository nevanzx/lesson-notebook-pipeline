#!/usr/bin/env python3
"""Decrypt submitted assignment .json files for grading.

Usage: python decrypt.py --key build/key/<lesson>-key.json A.json B.json …
(--key also accepts keys.pem; the -key.json carries the teacher decoding key.)
Prints one pretty JSON payload per file (the ==> file headers go to stderr).
Envelope format RSA-OAEP-256+A256GCM: random AES-256-GCM key (ct carries the
GCM tag appended, as WebCrypto emits), session key wrapped with RSA-OAEP
(SHA-256). tf answers arrive as WebCrypto booleans and are normalised to the
strings "true"/"false" for slicing.
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
        out = json.loads(plain.decode("utf-8"))
        for a in out.get("answers") or []:
            if isinstance(a.get("answer"), bool):
                a["answer"] = "true" if a["answer"] else "false"
        return out
    except Exception as exc:
        return {"error": "cannot decrypt with this key: %s" % exc}


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    ap = argparse.ArgumentParser(description="Decrypt assignment submissions")
    ap.add_argument("--key", required=True, help="lesson -key.json (or keys.pem)")
    ap.add_argument("files", nargs="+", help="submitted .json file(s)")
    args = ap.parse_args(argv)
    raw = Path(args.key).read_text(encoding="utf-8")
    pem = raw
    try:
        doc = json.loads(raw)
    except ValueError:
        doc = None
    if isinstance(doc, dict) and doc.get("teacher_key_pem"):
        pem = doc["teacher_key_pem"]
    if PRV not in pem:
        print("FAIL: --key file carries no PRIVATE KEY block "
              "(pass the lesson -key.json or keys.pem)", file=sys.stderr)
        return 1
    rc = 0
    for f in args.files:
        try:
            out = decrypt_file(pem, f)
            sys.stderr.write("==> %s\n" % f)
            print(json.dumps(out, ensure_ascii=False, indent=1))
            if "error" in out and str(out["error"]).startswith("cannot decrypt"):
                rc = 1
        except Exception as exc:
            print("FAIL: %s: %s" % (f, exc), file=sys.stderr)
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
