# Task 5 Report — Encrypted `_export` + decrypt.py + round-trip

**Status:** COMPLETE
**Commit:** ca286dc — `feat(v2.5): encrypted submission download (AES-GCM + RSA-OAEP) + decrypt.py`
**Tests:** 60 passed (57 baseline + 3 new roundtrip), 2 deselected (gate excludes).

## What was done
- TDD: added `tests/test_assignment_roundtrip.py` (roundtrip / wrong-key refuse / plaintext graceful-error) — failed first, then green.
- Created `v2/tools/decrypt.py`: argparse `--key` + files; envelope `k` check; RSA-OAEP(MGF1-SHA256, SHA-256) unwrap + AESGCM decrypt; `{"error": …}` bodies for unknown-envelope/plaintext; exit 1 on missing PRIVATE block or per-file hard failures (`cannot decrypt`).
- Replaced `_export` in `v2/skeleton/components/assignment/component.js` with WebCrypto chain: AES-256-GCM payload, AES key wrapped via RSA-OAEP/SHA-256 with `window.LN.pub`; envelope `{v:1,k:"RSA-OAEP-256+A256GCM",iv,ct,wk}`; body `{title,subject,week,student,submitted_at,answers,key_id,enc}`; filename `nameOf(name) - Week N - Subject.json`; submit button relabels "Submitted — download again" (submit button passed via `ui.submit`); crypto-unavailable + unreplaced-marker (`__` in pub) → browser-cannot-encrypt message; catch → "Encryption failed".
- Deck test needles added: "RSA-OAEP-256+A256GCM", "download again", plus `__PUBKEY__`/`__KEYID__` absent in shipped HTML and present in source (`test_component_files_clean`). Existing leak assertions untouched and still pass.

## Deviations from brief
- Decrypt tool prints the `==> file` header to **stderr** (brief had it on stdout); `test_roundtrip` parses stdout as pure JSON.
- Tool normalizes tf answer booleans to `"true"`/`"false"` strings after decrypt — `test_roundtrip` asserts `body["answers"][0]["answer"] == "true"` while the JSON payload carries a real bool.
- Submit call passes `{errB, cover, submit}` in one `ui` object instead of a third positional arg (signature stays `(body, ui)`), needed for the "download again" relabel.

## Concerns
- None blocking. Filename label uses an em dash; decrypt header on stderr means multi-file grading shows headers in stderr — harmless.
