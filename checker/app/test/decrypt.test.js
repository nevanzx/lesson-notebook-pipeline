import test from "node:test";
import assert from "node:assert/strict";
import { decryptSubmission, pemFromKeyJson, __testOnly } from "../lib/decrypt.js";

function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function makeKeys() {
  const kp = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["encrypt", "decrypt"]);
  const pubDer = await crypto.subtle.exportKey("spki", kp.publicKey);
  const privDer = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const pubB64 = b64(new Uint8Array(pubDer));
  const privPem = "-----BEGIN PRIVATE KEY-----\n" +
    b64(new Uint8Array(privDer)).match(/.{1,64}/g).join("\n") +
    "\n-----END PRIVATE KEY-----\n";
  return { kp, pubB64, privPem };
}

async function encLikeBrowser(pubB64, payloadBytes) {
  const pubDer = Uint8Array.from(Buffer.from(pubB64, "base64"));
  const pub = await crypto.subtle.importKey("spki", pubDer,
    { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, payloadBytes));
  const wk = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, raw));
  return { enc: { k: "RSA-OAEP-256+A256GCM", iv: b64(iv), ct: b64(ct), wk: b64(wk) } };
}

test("roundtrip decrypts and normalizes tf booleans", async () => {
  const { pubB64, privPem } = await makeKeys();
  const payload = Buffer.from(JSON.stringify({
    answers: [{ q: 1, type: "tf", prompt: "p", answer: true },
              { q: 2, type: "mc", prompt: "q", answer: 2 }],
  }));
  const file = await encLikeBrowser(pubB64, payload);
  const out = await decryptSubmission(privPem, file);
  assert.equal(out.answers[0].answer, "true");
  assert.equal(out.answers[1].answer, 2);
});

test("unknown envelope and wrong key throw", async () => {
  const { pubB64, privPem } = await makeKeys();
  await assert.rejects(decryptSubmission(privPem, { enc: { k: "nope" } }), /unknown-envelope/);
  const file = await encLikeBrowser(pubB64, Buffer.from("{}"));
  const other = await makeKeys();
  await assert.rejects(decryptSubmission(other.privPem, file), /decrypt-failed/);
});

test("pem block extractor finds private block", () => {
  const pem = "junk\n-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----\nmore";
  assert.equal(__testOnly.extractBlock(pem, "PRIVATE KEY"), "QUJD");
});

test("pemFromKeyJson returns embedded teacher pem", async () => {
  const { privPem } = await makeKeys();
  const keyJson = { lesson: "T", items: [], teacher_key_pem: "junk\n" + privPem + "more" };
  assert.equal(pemFromKeyJson(keyJson), keyJson.teacher_key_pem);
});

test("pemFromKeyJson throws on key json without embedded pem", () => {
  assert.throws(() => pemFromKeyJson({ lesson: "T", items: [] }), /missing-pem-block/);
});

test("embedded teacher pem decrypts submissions", async () => {
  const { pubB64, privPem } = await makeKeys();
  const keyJson = { lesson: "T", items: [], teacher_key_pem: privPem };
  const payload = Buffer.from(JSON.stringify({
    answers: [{ q: 1, type: "mc", prompt: "q", answer: 0 }],
  }));
  const file = await encLikeBrowser(pubB64, payload);
  const out = await decryptSubmission(pemFromKeyJson(keyJson), file);
  assert.equal(out.answers[0].answer, 0);
});
