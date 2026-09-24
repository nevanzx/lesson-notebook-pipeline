# assignment

Collect-only assessment. Mount: `<div data-component="assignment" data-key="…">`.
Data `{intro?, items:[20]}` — 10 mc (4 choices), 4 tf, 4 id, 2 sa, all situational.
The component never reveals answers and never scores: those live only in the
build's teacher key file (`build/key/`) written by build.py.

Flow: hidden Begin card → fullscreen identity gate (name Lastname, Firstname +
8-digit ID, verified before anything else) → quiz deck, one question per slide,
locked Next → submit validates completeness and downloads an
AES-GCM/RSA-OAEP-encrypted `<name> - Week N - Subject.json`. No Exit while the
quiz runs: Esc/fullscreen-exit re-locks fullscreen with answers kept; Close
appears only after a successful submit.

Guards (best effort, not absolute): selection disabled inside the deck
(inputs stay typeable), context menu off while open, cover on
blur/visibilitychange/PrintScreen, diagonal `ID — Name` watermark filled live.

Maintainer invariant: `show()` is the SOLE recompute point for the Next
button's `disabled` state and the progress dots. Every listener that writes
`state.answers[i]` (radio clicks AND text/textarea input) must call `bump()`
afterwards, or typed answers strand the student with Next permanently off.
`show()` refuses to render the quiz until `state.identified` is true.
Verify with `node tools/assignment_smoke.js` (from the skill folder) after
any edit to this component.

## Dag mode

When `build.json` sets `"assignment": "dag"`, the same mount renders a
forward-only graph walk instead of flat slides: identity gate and guards are
identical; there is no Back; the layer meter shows `Layer k of L`; Submit is
only enabled at a leaf and exports `{mode:"dag", path:[{node,label}],
final_outcome}`. Student data carries `nextNodeId` but never `points`.
Validate with `node tools/assignment_smoke.js` (walks flat **and** dag).
Authoring law: `../../dag-craft.md`.
