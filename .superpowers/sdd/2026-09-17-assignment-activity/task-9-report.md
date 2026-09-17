# Task 9 — Closing Sweep Report (2026-09-17)

Branch: `feature/v2.5-assignment` @ b564b05. Status: **PASS — no fixes required, nothing committed.**

## 1. Full gated test suite

Command:
```
python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"
```
Output: `63 passed, 2 deselected in 5.87s` ✅ (expected 63)

## 2. Standalone tool checks

- `python v2/tools/decrypt.py --help` → works:
  ```
  usage: decrypt.py [-h] --key KEY files [files ...]
  Decrypt assignment submissions
  ```
- `v2/tools/make_keys.py`: **no `__main__` block** (grep found `if __name__ == "__main__"` only in decrypt.py:69). Brief required import-only usage, so this is as-specified — noted, not a defect.

## 3. Sample build + decrypt round-trip (scratch dir)

Scratch: `C:\Users\aclco\AppData\Local\Temp\lnsweep_01acc2f6` (fresh, empty).

Build (run from scratch dir, since build.py writes relative to CWD):
```
python v2/build.py v2/sample/lesson-demo
→ OK - wrote ...\Week4-Demo-Notebook.html (1949 lines)
→ OK - wrote ...\build\key\Week4-Demo-Notebook-key.json
```

- HTML exists (101,098 bytes) ✅
- `build/key/keys.pem` (3,182 B) + key JSON exist ✅

**keys.pem reuse:** ran build a second time; SHA256 of keys.pem identical before/after
(`505E2C7A4B49…D1982`) → **reuse worked, keys not regenerated** ✅

**Synthetic round-trip:**
- Parsed `public_key_b64` from the key JSON (top-level fields: `decrypt, items, key_id, lesson, output, public_key_b64, subject, week`), loaded as RSA public key.
- First attempt with a hand-rolled envelope failed (`unknown envelope None`) because decrypt.py requires `{"enc": {"k": "RSA-OAEP-256+A256GCM", "wk", "iv", "ct"}}` — my test file format was wrong, not a code issue.
- Correct envelope: AES-256-GCM encrypt (12-byte IV, tag appended via cryptography lib) inner JSON `{"lesson": "t", "answers": [{"q": 1, "answer": "a"}]}`; AES key wrapped with RSA-OAEP-SHA256.
- `python v2/tools/decrypt.py --key build/key/keys.pem submission-test.json` → exit 0, output exactly equals encrypted plaintext ✅

## 4. Grep sweeps on built HTML (`Week4-Demo-Notebook.html`)

(Matches counted with Python on UTF-8 text; em dash verified as `\xe2\x80\x94` via byte dump.)

Forbidden — expected 0:
| Pattern | Count |
|---|---|
| `"ans"` | 0 ✅ |
| `key_points` | 0 ✅ |
| `aliases` | 0 ✅ |

Required:
| Pattern | Count |
|---|---|
| `ASSIGNMENT — TO BE SUBMITTED` | 1 ✅ (in `lna` JS: `LN.h("p", { text: "ASSIGNMENT — TO BE SUBMITTED" })`) |
| `lna-begin` | 3 ✅ (button node + CSS rules) |
| `lna-watermark` | 3 ✅ (CSS CSS rule + spans) |
| `PrintScreen` | 1 ✅ (keydown guard flipping `lna-cover show`) |
| “Activity — ” tag template (JS, `text: "Activity — " + lbl`) | present ✅ |
| `.ln-act-tag` CSS rule | present ✅ |
| `data-activity="..."` attrs | 3 ✅ (≥3: sort1, cmp1, ex4 — all `"class discussion"`) |

Note: literal string `Activity — class discussion` does not appear verbatim because the label is built at runtime (`"Activity — " + lbl` from `data-activity`); the tag CSS (`.ln-act-tag`) + runtime template + 3 `data-activity` attrs satisfy the intent.

## 5. Interactive hooks (remote code verification only — no browser)

Shipped hooks confirmed in built HTML:
- Fullscreen: `begin` click handler → `deck.requestFullscreen().catch(...)` guarded (2 `requestFullscreen` occurrences).
- Watermark/anti-capture: `.lna-watermark` CSS (absolute, pointer-events:none, rotated spans); `document.addEventListener("keydown")` on `ev.key === "PrintScreen"` flashing `lna-cover show`; `visibilitychange` (1) and `contextmenu` (1) listeners present.

## 6. `git status`

Tracking-commit diff: clean (29 untracked `.superpowers/sdd/…` sweep-artifact files only; no modifications to tracked source). No fixes were required → **no commit made** (untracked report files left unstaged per prior-task convention; momentarily staged and unstaged during verification).

## Notes / concerns

- React-native em dash false-alarms while grepping via PowerShell (console `?` mangling) were resolved with Python UTF-8 byte verification; actual HTML content is correct.
- `make_keys.py` could optionally gain a `if __name__ == "__main__": make_keys()` CLI later, but brief specified import usage.
