# Interactive Lesson Notebook v2.1 — Chunked Per-Section Subagent Pipeline

Date: 2026-09-16
Status: Approved by user in brainstorming session (Approach A: plan-and-dispatch with
excerpt briefs; per-notebook-section shards; scripted handoffs; locked glossary list;
definition-first contract)

## 1. Problem

v2.0 shrinks the model's output (4 part files instead of ~2,300 lines of boilerplate)
but a **single agent still holds the whole lesson in one context**: it reads the full
source, melds it, and writes every section of `sections.html` + `data.js` in one pass.
On long sources (16–40 pages, §2.3) quality degrades — the observed symptom is
description-first prose: concepts arrive wrapped in scene-setting metaphors instead of
definitions, e.g. *"the stack becomes a line: the term structure of interest rates"*
instead of a one-sentence definition the student can build on.

Goal: shard lesson authorship so each writer's context ≈ **one section of source +
its brief + a rules card**, with all whole-source judgment (meld, glossary, handoffs,
MILO coverage) owned once by an orchestrator.

## 2. Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Motivation | Quality on big lessons first; wall-clock parallelism secondary |
| 2 | Shard unit | One notebook section (0, G, 1…8) per subagent |
| 3 | Continuity | **Scripted handoffs** — orchestrator's plan dictates each section's open/close chain sentences; writers compose to script |
| 4 | Glossary | **Locked term list** extracted by the orchestrator during the meld; glossary writer + section writers share it; orchestrator's QA adds stragglers |
| 5 | Brief content | Verbatim `source_excerpt` pointer per shard (voice/number fidelity), not whole-source re-reads |
| 6 | Definition-first | Hard content contract enforced in 3 places (rules card, good/bad example pair, judgment QA line) |
| 7 | Compatibility | v2.1 is a contract-compatible superset: monolith workdirs still build; this is v2.1, not v3 |

## 3. Shard layout & assembly

```
build/<slug>/
  build.json
  tune.css
  plan.json               chunk plan + briefs (orchestrator-written, validator-readable)
  sections/00-overview.html
  sections/0G-glossary.html
  sections/1-concepts.html   …
  data/00-overview.js
  data/1-concepts.js         …
```

- **Auto-detect**: if `sections/` exists, `build.py` concatenates its `.html` files in
  filename-sorted order → `<!--__SECTIONS__-->`; same for `data/` → `/*__DATA__*/`.
  A shard's pair shares a stem (`1-concepts` = section HTML + data JS). Newline-joined
  concatenation keeps line math trivial.
- **No ambiguous sources**: monolith + shard directory may coexist only if `plan.json`
  declares which are active; otherwise the build errors.
- **Identity conventions (plan-assigned, mechanically enforced)**: shard for section `N`
  uses `section.block` ids prefixed `sN.` and `LN.data` keys prefixed `sN`. `build.py`
  enforces per-shard prefix compliance and global key/id uniqueness (existing check,
  now cross-shard).
- **Error reporting is shard-aware**: existing rule names unchanged; reports cite the
  real shard file + line, never the concatenated blob.
- **Unchanged**: shell markers, theme/tune handling, palette-level contrast checks,
  `build.json.components` (validated against the union of mounts across shards).
- Small lessons (≤3 pages) keep the v2.0 monolith flow untouched; all 38 existing
  tests must stay green.

## 4. `plan.json` schema

```json
{
  "title": "Week 7 — Interest Rates",
  "theme": "ledger",
  "glossary_terms": [ { "term": "term structure", "def": "…" } ],
  "shards": [
    {
      "id": "3",
      "files": ["sections/3-term-structure.html", "data/3-term-structure.js"],
      "section": "Term Structure of Interest Rates",
      "components": ["sort-statement", "comparison-table"],
      "key_prefix": "s3",
      "open_handoff": "Section 2 ended: … → this section answers: …",
      "close_handoff": "… hands off to §4's question: …",
      "must_teach": ["def: term structure", "3 shapes", "3 theories", "<MILO C> exercised"],
      "source_excerpt": "source/week7.txt#lines=40-95"
    }
  ]
}
```

`source_excerpt` paths are workdir-relative: the orchestrator stages its normalized
text of the source at `build/<slug>/source/<slug>.txt` during step 1, so writers (or
a serial fallback) can read exactly their slice without touching user files.

## 5. Orchestrator flow (SKILL.md Part 4, dual-mode)

1. Read source; run the §2.1 meld decision and §1.2 pack pick.
2. Write `plan.json`: shards, component mounts, id/key prefixes, scripted handoffs,
   locked glossary list, per-shard `must_teach` (from the MILO dependency list).
3. **Plan approval gate**: present the plan as the §8 opening message (outline map +
   MILO coverage). Because the plan *is* the announced outline, §2.1's "shipped file
   matches the announced Outline map" becomes mechanically checkable.
4. Dispatch one writer per shard via the harness's subagent mechanism (opencode `task`,
   Claude Code Task, etc.). **Defined degradation**: if the harness has no subagents,
   the orchestrator executes the same briefs serially, one per turn, dropping non-
   current-shard context between turns.
5. Each writer: reads its brief + its `source_excerpt` **only**, writes its two files,
   runs `python build.py <workdir> --lint <shard-id>`, iterates until lint-clean.
6. Orchestrator runs the full build; enters the fix loop (§7).
7. Judgment QA pass (existing Part 5 + definition-first line).
8. Hand over; propose any promotions (§3.3) as today.

Writer context budget = the actual quality fix: no writer sees the whole source;
cross-section facts arrive only through the plan (`must_teach`, glossary list), which
also prevents duplication drift.

## 6. Definition-first contract

A named thing may not *appear* before it is *defined*. Every concept gets a `.def`
line — genus + differentia, one sentence — before any prose, mnemonic, or scenario
touches it. Chain paragraphs, `.mini` examples, and component readouts may only
*reference* already-defined terms; they never carry load-bearing definitions.
Writer self-test shipped in the rules card: *"Could a student write the exam answer
using only my `.def`/`.mini` boxes?"*

Enforcement points:

1. **Rules card in every brief** (Appendix A of SKILL.md), not one-principle-among-
   eight prose.
2. **Good/bad example pair in the brief template**: the current failure
   (*"Plot yields against time to maturity … the stack becomes a line…"*) is the
   canonical BAD example; the same passage rewritten def-first (*"The term structure
   of interest rates is a plot of yields against time to maturity for equal-credit,
   same-currency instruments."* then shapes, then theories — each defined before use)
   is the canonical GOOD example.
3. **Judgment QA line** for the orchestrator: *Definition-first: every load-bearing
   term maps to a `.def`.* Not `build.py`-checkable; judgment stays judgment.

Glossary interaction: `plan.json.glossary_terms` is the locked list from the meld
step; the glossary writer (section G) renders exactly it (source phrasing, trimmed);
section writers use listed terms in prose. Stragglers found in QA are added to the
glossary by the orchestrator (one targeted edit, re-lint, rebuild).

## 7. `build.py --lint <shard>` & the fix loop

Lint runs the **shard-scoped subset** of existing checks (same rule functions, new
entry point — no logic duplication):

| Check | In lint |
|---|---|
| hex containment / no external assets / `@import` / `url()` | ✓ (shard scope) |
| well-formed fragment (balanced tags) | ✓ |
| mounts registered in `plan.json` component union **and** `data-key` defined in the shard's own `data/NN-*.js` | ✓ |
| id prefix `sN.` / key prefix `sN` per shard | ✓ |
| `</` + letter in JS | ✓ |
| structural CSS in `tune.css` | ✗ — tune is orchestrator-owned |
| global id uniqueness, contrast, marker hygiene, TOC, print | ✗ — full build only |

**Fix loop (assembly)**: full build failures *many + concentrated* in 2–3 shards
(rule + file identifies them) → re-dispatch those writers with a **fix brief**
(itemized report lines + original brief; bounded context). Cross-cutting failures
(id collision between shards, missing component in `build.json`, tune contrast) →
orchestrator fixes itself; no single writer owns them. Termination: loop until `OK`,
same as v2.0. Assembled file remains read-only; runtime red banner remains the
last-resort net.

## 8. SKILL.md changes

| Area | Change |
|---|---|
| §6.2 content principle | Rewritten as the definition-first contract (genus-differentia, defined-before-used) with the yield-curve bad/good pair |
| Part 4 build order | Dual mode: **monolith flow** (≤3 pages or no subagent harness; today's steps, unchanged) and **fan-out flow** (plan.json → approval → dispatch → lint → assemble → fix loop → QA) |
| Part 5 QA | Add definition-first line; glossary straggler line |
| Part 8 opening message | Doubles as the plan approval gate in fan-out mode |
| New Appendix A — Brief Template | Self-contained rules card a writer receives: §1.3 hard rules, mount patterns, its plan entry, definition-first contract + example pair, prefix assignment. **Writers never read SKILL.md itself** — the brief carries everything, which keeps writer context small and harness-portable |

## 9. Testing

- **Assembly parity**: a lesson split into shards must build byte-identical output to
  its monolith equivalent.
- **Lint fixtures**: one known-bad shard per lint check (hex in shard, unregistered
  mount, key defined in wrong shard, id prefix violation, `</b>` in data JS) — each
  must fail naming the right rule, file, line.
- **Prefix & uniqueness**: cross-shard duplicate ids/keys caught at full build.
- **Layout ambiguity**: coexisting undeclared monolith + `sections/` rejected.
- **E2E**: sample lesson re-authored as 5 shards passes full build with `OK`.
- Existing 38 tests stay green untouched (monolith path unchanged). Stdlib-only.

## 10. Out of scope

- Harness dispatch *code* — SKILL.md states the protocol; the host agent runs its own
  subagent tooling. No new runtime dependency.
- Automated interactivity/browser QA (unchanged from v2.0).
- Per-shard contrast checking (palette-level, stays global).
- A shipped fan-out sample lesson: YAGNI until the first real large lesson exposes a
  brief-template gap.
- Sharding of `tune.css`, `build.json`, or the shell (orchestrator-owned, small).

## 11. Success criteria

1. A 16–40 page lesson converts with per-writer context ≤ one section of source +
   brief (verifiable: writer turns touch only their two shard files).
2. Every shipped concept has a retrievable definition: judgment QA's definition-first
   line passes without the orchestrator rewriting whole sections.
3. All v2.0 workdirs still build identically (zero migration).
4. Full-build fix loop converges in ≤ 2 re-dispatch rounds on the first real lesson
   (if more, the briefs or plan format need wording fixes — that is the REFACTOR
   signal from the v2.0 process).
