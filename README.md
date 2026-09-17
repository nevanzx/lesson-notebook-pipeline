# Lesson Notebook Pipeline â€” `interactive-lesson-notebook` v2.4

Turn a lesson (PDF / text / slides) into ONE self-contained interactive HTML notebook â€”
offline, no CDN, no frameworks â€” where the outline is fixed as a machine-checked contract
first, per-section agents write **only lesson content**, and a Python assembler builds +
mechanically QA-checks the result.

v1.9 forced the model to re-emit ~2,300 lines of boilerplate per lesson. v2.0 ships the
mechanics (shell, components, print rules, validators) as assets, so a build is:

```
build/<lesson>/
  build.json      ~10 lines   title, theme pack, components, output name
  tune.css        10â€“25 lines :root token-value retuning (never structural CSS)
  outline.json    the contract  every source title verbatim + section mapping (main session)
  parts/                      one pair per notebook section, written by its own agent:
    NN-<id>.sections.html     prose + vocabulary classes + component mounts
    NN-<id>.data.js           activity content: LN.data.<key> = {...}
```
(the monolith pair `sections.html` + `data.js` is still accepted instead of `parts/` â€”
never both; `python build.py v2/sample/lesson-demo` uses it)

then `python build.py build/<lesson>` assembles the notebook and **refuses to write it**
unless every QA gate passes (exit 1 + itemized rule/file/line/fix report). The finished
`.html` â€” and only it â€” lands in the **current directory the command runs from**, never
in the workdir:

- outline contract (phantom / missing / heading drift / source-title coverage / duplicate data keys across parts)
- marker hygiene (no injection slot left unfilled)
- hex-colour containment (colours flow through tokens; no find-and-replace skins)
- no external assets (textures are pure CSS gradients)
- unique ids + every `section.block` idable for the auto TOC
- mount/data integrity (unknown component or missing `data-key` â†’ error, in build **and** at page runtime as a red banner)
- well-formed HTML (`html.parser` tag-balance)
- WCAG contrast floors computed from the final palette (4.5:1 ink, 3:1 faint-on-grid) + locked semantic hues (green/amber/red)
- mandatory print stylesheet present

v2.1 added **fan-out** (`plan.json` + shard writers + `build.py --lint`). v2.2 added
**calculation emphasis**: every source formula and worked calc lives in the section prose
(SKILL.md Â§2.4); mounted widgets only practise the same numbers. v2.3 replaces fan-out with
the **outline-first contract**: `outline.json` inventories every source title verbatim
before any writing, one agent per notebook section fills `parts/NN-<id>.*` from only its
own source slice, and the build rejects phantom sections, missing sections, heading drift
and uncovered source titles. **Part 9** (source-only rule) hardens the Week 5 lessons:
nothing ships that the source does not contain, every source number is recomputed, and
agent briefs never anchor a result. v2.4 writes the output notebook to the run directory
and adds **figure emphasis**: a section whose concept is inherently a graph gets it drawn
as inline SVG from the source's own numbers, even when the source has no figure (Â§2.5).

## Layout

```
v2/                      the skill, deployable as-is
  SKILL.md               agent instructions (the manifest)
  build.py               assembler + validator (Python 3 stdlib only)
  skeleton/shell.html    layout + component CSS vocabulary + LN runtime + 7 markers
  skeleton/themes/       6 packs: ledger, receipt, contract, filecard, boardmemo, graph-paper
  skeleton/components/   registry.md + 12 registered components (component.css/js + README):
                         milo-list, sort-statement, comparison-table, feasibility-gate,
                         break-even-lab, tvm-lab, step-solver, true-false,
                         ranked-statements, case-match, flipcards, glossary
                         (+ port-lab: css/js only, pending promotion per SKILL.md Â§9.4)
  sample/lesson-demo/    a complete worked lesson (Week 4 break-even, receipt pack tuned;
                         monolith parts + a valid outline.json showing the contract)
tests/                   pytest: every QA rule, every pack, every component, CLI e2e
                         (40 green on v2.3; 37 shard-era cases pending outline migration)
docs/superpowers/        the design spec and the implementation plan (v1.9 archived in docs/archive/)
```

## Requirements

- Python 3.6+ (assembler + tests are stdlib-only; dev tests use `pytest`)
- A modern browser to open the output (works fully offline)

## Install â€” Claude Code / opencode (skill)

Both load skills from `~/.claude/skills/`. **Live mode (recommended for this repo):**
link the skill slot to `v2/` so editing the repo *is* editing the live skill â€”

**Windows (PowerShell):**

```powershell
New-Item -ItemType Junction "$env:USERPROFILE\.claude\skills\interactive-lesson-notebook" -Target "$PWD\v2"
```

**macOS / Linux:**

```bash
ln -s "$PWD/v2" ~/.claude/skills/interactive-lesson-notebook
```

Restart the agent after edits â€” skill lists load at startup.

**Copy mode (other machines, releases):**

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

The agent triggers the skill, inventories the source titles into `outline.json`, picks and
tunes a theme pack, dispatches one section agent per notebook section, runs `build.py`
until green, and hands you one `.html`.

## Install â€” other harnesses (opencode, Codex, Gemini CLI, any agent CLI)

The skill is plain files + one stdlib Python script; there is no proprietary runtime.

- **opencode:** reads `~/.claude/skills` automatically, so the link/copy above works as-is;
  project-local skills can also live in `.opencode/skills/` or any folder registered in
  `opencode.json > skills.paths`. opencode surfaces `SKILL.md` frontmatter as the skill
  description.
- **Harnesses with their own skill/prompt folders** (e.g. `~/.codex/â€¦`, project `.agents/`):
  copy `v2/` there the same way â€” the only contract is "the agent can read SKILL.md and run
  `python build.py <workdir>`".
- **No skill system at all:** attach `v2/SKILL.md` to the conversation as context (and let
  the agent read files under `v2/`). Everything the skill references â€”
  `skeleton/`, `sample/`, `build.py` â€” is path-relative to the skill folder.

Manual build without an agent (e.g. to test the pipeline):

```bash
python v2/build.py v2/sample/lesson-demo        # -> Week4-Demo-Notebook.html in the CWD
python -m pytest tests -q --ignore=tests/test_shards.py --ignore=tests/test_e2e_fanout.py -k "not parts_where and not scan_reports_parts_coords"                       # 65 green
```

## Authoring a lesson build (agent or human)

1. Pick the pack closest to the subject (`ledger` accounting â†’ `graph-paper` stats), then
   retune 5â€“15 tokens in `tune.css` from the source's own nouns â€” the pack is never
   shipped untuned.
2. Check `skeleton/components/registry.md` **before** inventing any interaction; mount
   matches (`<div data-component="â€¦" data-key="â€¦"></div>`) and put content in `data.js`.
3. Run the build until `OK`. The assembled HTML is read-only â€” fix parts, rebuild.
4. Novel interaction? Ship it once via `extra_css`/`extra_js`, then ask about promoting it
   to the library (user-gated; never silently).

## Design docs

- Spec: `docs/superpowers/specs/2026-09-15-lesson-notebook-pipeline-design.md`
- Plan + execution status: `docs/superpowers/plans/2026-09-15-lesson-notebook-pipeline.md`
- v1.9 for reference: `docs/archive/SKILL.interactive-lesson-notebook.v1.9.md`
