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
