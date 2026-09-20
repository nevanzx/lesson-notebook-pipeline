"""Teacher keypair (RSA-3072, PKCS8 + SPKI PEM).

One file per lesson: the pair is embedded into the lesson's -key.json
(teacher_key_pem) by build.py's write_key_file(); no keys.pem is generated
for new lessons. generate_pem() remains for pre-existing build/key/keys.pem
files, which build.py still honours. Needs: pip install cryptography.
"""
import base64
import hashlib
from datetime import datetime
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

HEADER = "# LN assignment teacher key  id: {kid}  created: {ts}\n"


def generate_pair():
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
    text = (HEADER.format(kid=kid, ts=datetime.now().strftime("%Y-%m-%d %H:%M"))
            .encode("utf-8") + pub_pem + prv_pem).decode("utf-8")
    return {"id": kid, "pem_text": text,
            "pub_b64": base64.b64encode(pub_der).decode("ascii")}


def generate_pem(pem_path):
    """Legacy: write the pair to a keys.pem file. Kept for pre-existing lessons."""
    pair = generate_pair()
    Path(pem_path).parent.mkdir(parents=True, exist_ok=True)
    Path(pem_path).write_text(pair["pem_text"], encoding="utf-8")
    return pair["id"]
