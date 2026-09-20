function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function extractBlock(pemText, label) {
  const m = pemText.match(
    new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`));
  if (!m) throw new Error("missing-pem-block");
  return m[1].replace(/\s+/g, "");
}

export function pemFromKeyJson(keyJson) {
  const pem = keyJson && keyJson.teacher_key_pem;
  if (typeof pem !== "string" || !pem.includes("PRIVATE KEY")) {
    throw new Error("missing-pem-block");
  }
  return pem;
}

async function importPrivateKey(pemText) {
  const der = b64ToBytes(extractBlock(pemText, "PRIVATE KEY"));
  return crypto.subtle.importKey("pkcs8", der,
    { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
}

export async function decryptSubmission(pemText, fileJson) {
  const enc = (fileJson && fileJson.enc) || {};
  if (enc.k !== "RSA-OAEP-256+A256GCM") {
    throw new Error("unknown-envelope");
  }
  try {
    const priv = await importPrivateKey(pemText);
    const raw = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" }, priv, b64ToBytes(enc.wk));
    const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(enc.iv) }, aes, b64ToBytes(enc.ct));
    const out = JSON.parse(new TextDecoder().decode(plain));
    for (const a of out.answers || []) {
      if (typeof a.answer === "boolean") a.answer = a.answer ? "true" : "false";
    }
    return out;
  } catch (e) {
    if (e && (e.message === "unknown-envelope" || e.message === "missing-pem-block")) throw e;
    throw new Error("decrypt-failed");
  }
}

export const __testOnly = { extractBlock };
