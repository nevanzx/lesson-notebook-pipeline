# Lesson Notebook Pipeline — `interactive-lesson-notebook` v2.1

Turn a lesson (PDF / text / slides) into ONE self-contained interactive HTML notebook —
offline, no CDN, no frameworks — where the agent writes **only lesson content** (4 small
files) and a Python assembler builds + mechanically QA-checks the result.

v1.9 forced the model to re-emit ~2,300 lines of boilerplate per lesson. v2.0 ships the
mechanics (shell, components, print rules, validators) as assets, so a build is:

```
build/<lesson>/
  build.json      ~10 lines   title, theme pack, components, output name
  tune.css        10–25 lines :root token-value retuning (never structural CSS)
  sections.html   the real work  prose + vocabulary classes + component mounts
  data.js         the real work  activity content: LN.data.<key> = {...}
  plan.json       optional      fan-out manifest: shard ids, prefixes, scripted hand-offs
  sections/       optional      fan-out: one .html shard per section (replaces sections.html)
  data/           optional      fan-out: one .js shard per section   (replaces data.js)
```

then `python build.py build/<lesson>` assembles the notebook and **refuses to write it**
unless every QA gate passes (exit 1 + itemized rule/file/line/fix report):

- marker hygiene (no injection slot left unfilled)
- hex-colour containment (colours flow through tokens; no find-and-replace skins)
- no external assets (textures are pure CSS gradients)
- unique ids + every `section.block` idable for the auto TOC
- mount/data integrity (unknown component or missing `data-key` → error, in build **and** at page runtime as a red banner)
- well-formed HTML (`html.parser` tag-balance)
- WCAG contrast floors computed from the final palette (4.5:1 ink, 3:1 faint-on-grid) + locked semantic hues (green/amber/red)
- mandatory print stylesheet present

v2.1 adds **fan-out**: on long lessons an orchestrator writes `plan.json` (outline,
scripted hand-offs, locked glossary, per-shard prefixes) and dispatches one section
writer per shard (`sections/NN-*.html` + `data/NN-*.js`); each writer self-checks with
`build.py --lint <shard>`, and the full build refuses to write until every
cross-shard gate passes. Small lessons keep the 4-file monolith flow — byte-for-byte.
Authoring also hardens to **definition-first**: every concept gets a `.def` before
any prose touches it (see SKILL.md §6.2 worked pair).

## Layout

```
v2/                      the skill, deployable as-is
  SKILL.md               agent instructions (the manifest)
  build.py               assembler + validator (Python 3 stdlib only)
  skeleton/shell.html    layout + component CSS vocabulary + LN runtime + 7 markers
  skeleton/themes/       6 packs: ledger, receipt, contract, filecard, boardmemo, graph-paper
  skeleton/components/   registry.md + 11 components (component.css/js + README each):
                         milo-list, sort-statement, comparison-table, feasibility-gate,
                         break-even-lab, step-solver, true-false, ranked-statements,
                         case-match, flipcards, glossary
  sample/lesson-demo/    a complete worked lesson (Week 4 break-even, receipt pack tuned)
tests/                   77 pytest cases: every QA rule, every pack, every component, CLI e2e
docs/superpowers/        the design spec and the implementation plan (v1.9 archived in docs/archive/)
```

## Requirements

- Python 3.6+ (assembler + tests are stdlib-only; dev tests use `pytest`)
- A modern browser to open the output (works fully offline)

## Install — Claude Code (skill)

Claude Code loads skills from `~/.claude/skills/`. Copy the `v2/` folder into place:

**Windows (PowerShell):**

```powershell
robocopy v2 "$env:USERPROFILE\.claude\skills\interactive-lesson-notebook" /MIR /XD __pycache__
```

**macOS / Linux:**

```bash
mkdir -p ~/.claude/skills/interactive-lesson-notebook
cp -R v2/. ~/.claude/skills/interactive-lesson-notebook/
```

Then just ask, with a lesson in hand:

> Turn `Week5.pdf` into an interactive HTML notebook.

The agent triggers the skill, picks a theme pack, tunes it from the lesson's own nouns,
writes the 4 part files, runs `build.py` until green, and hands you one `.html`.

## Install — other harnesses (opencode, Codex, Gemini CLI, any agent CLI)

The skill is plain files + one stdlib Python script; there is no proprietary runtime.

- **opencode / oh-my-CLI setups that read `~/.claude/skills`:** the same copy above works;
  opencode surfaces `SKILL.md` frontmatter as the skill description.
- **Harnesses with their own skill/prompt folders** (e.g. `~/.codex/…`, project `.agents/`):
  copy `v2/` there the same way — the only contract is "the agent can read SKILL.md and run
  `python build.py <workdir>`".
- **No skill system at all:** attach `v2/SKILL.md` to the conversation as context (and let
  the agent read files under `v2/`). Everything the skill references —
  `skeleton/`, `sample/`, `build.py` — is path-relative to the skill folder.

Manual build without an agent (e.g. to test the pipeline):

```bash
python v2/build.py v2/sample/lesson-demo        # -> Week4-Demo-Notebook.html
python -m pytest tests -q                       # 77 QA/matrix/e2e tests
```

## Authoring a lesson build (agent or human)

1. Pick the pack closest to the subject (`ledger` accounting → `graph-paper` stats), then
   retune 5–15 tokens in `tune.css` from the source's own nouns — the pack is never
   shipped untuned.
2. Check `skeleton/components/registry.md` **before** inventing any interaction; mount
   matches (`<div data-component="…" data-key="…"></div>`) and put content in `data.js`.
3. Run the build until `OK`. The assembled HTML is read-only — fix parts, rebuild.
4. Novel interaction? Ship it once via `extra_css`/`extra_js`, then ask about promoting it
   to the library (user-gated; never silently).

## Design docs

- Spec: `docs/superpowers/specs/2026-09-15-lesson-notebook-pipeline-design.md`
- Plan + execution status: `docs/superpowers/plans/2026-09-15-lesson-notebook-pipeline.md`
- v1.9 for reference: `docs/archive/SKILL.interactive-lesson-notebook.v1.9.md`
