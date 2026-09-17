# assignment

Collect-only assessment. Mount: `<div data-component="assignment" data-key="…">`.
Data `{intro?, items:[20]}` — 10 mc (4 choices), 4 tf, 4 id, 2 sa, all situational.
The component never reveals answers and never scores: those live only in the
build's teacher key file (`build/key/`) written by build.py.

Flow: hidden Begin card → fullscreen deck (iOS: fixed-overlay simulation) →
one question per slide, locked Next → name (Lastname, Firstname) + 8-digit ID →
submit validates completeness and downloads an AES-GCM/RSA-OAEP-encrypted
`<name> - Week N - Subject.json`. Exit keeps answers; re-entry resumes.

Guards (best effort, not absolute): selection disabled inside the deck
(inputs stay typeable), context menu off while open, cover on
blur/visibilitychange/PrintScreen, diagonal `ID — Name` watermark filled live.
