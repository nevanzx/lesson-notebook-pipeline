# SDD ledger — plan: docs/superpowers/plans/2026-09-17-assignment-activity.md
Task 1: complete (commits 56dd6ae..9a29689, review clean)
Task 1: minor (deferred): build.py:550 non-list components crashes assignment-requiredness check with TypeError (use cfg.get('components') or [])
Task 2: complete (commits 9a29689..e58d664, review clean)
Task 2: ruling: filename sanitizer = per-char _ then collapse runs to single _ (human-approved plan-text deviation)
Task 3: complete (commits e58d664..43576e7, review clean)
Task 3: minor (deferred): no explicit assignment-mount-missing error (falls through to leftover-marker msg); keys.pem side effect on doomed builds; mc ans accepts bool
Task 4: complete (commits 43576e7..0698f3f, review clean after 2 fix rounds; added build.py sanitize_assignment_data whitelist - plan amendment: Task 4 owns answer-material stripping in shipped HTML)
Task 4: minor (deferred): sanitize has unit test via contract suite but silently no-ops on regex miss (invariant protects); PrintScreen keydown-only guard best-effort; NaN week if meta absent
Task 5: complete (commits 0698f3f..ca286dc, review clean)
Task 5: minor (deferred): decrypt.py docstring says stdout headers but they go to stderr; tf answers normalized bool to "true"/"false" strings (document in docstring); browser-side WebCrypto chain unverifiable by static tests - Task 9 manual sweep owns it
Task 6: complete (commits ca286dc..a5b044a, review clean)
Task 6: minor (deferred): shell wrapper test is substring-only (no browser smoke check)
Task 7: complete (commits a5b044a..c4b3db4, review clean after 1 fix round)
Task 8: complete (commits c4b3db4..b564b05, review clean after 1 fix round; sample monolith resolved; renumbered sections 6-8)
Task 8: parked suggestion (implementer): build.py could node --check data.js JS syntax at build time - structural, defer to final review triage
Task 9: complete (sweep PASS, no fixes needed; git clean); note: make_keys.py import-only (no __main__)
