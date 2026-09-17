### Task 7: SKILL.md contract update (v2.5)

**Files:**
- Modify: `v2/SKILL.md` (frontmatter, purpose block, Part 2, Part 4 brief, Part 5, Part 6)

**No code.** Apply exactly these edits:

- [ ] **Step 1: Frontmatter + purpose**

- `version: 2.4` → `version: 2.5`; title heading `# Interactive Lesson Notebook (v2.4 — outline-first, one agent per section)` → `# Interactive Lesson Notebook (v2.5 — outline-first, one agent per section)`.
- Description tail: "…live calculators, activity labels, and a graded collect-only assignment with an encrypted submission file. Do NOT use for…"

- [ ] **Step 2: v2.5 paragraph** — after the "What v2.4 adds" paragraph (line ~41–44), insert:

```markdown
What v2.5 adds: **the assignment** replaces the graded-to-nowhere self-check.
Every content section's interactive element is now labelled an *Activity* — a
class-discussion check — via a `data-activity="class discussion"` attribute on
the mount (the shell renders the tag; `data-activity="none"` opts out). Section
7 ships 20 situational items (10 mc · 4 tf · 4 id · 2 objective short-answer)
inside a hidden fullscreen slide deck (`assignment` component, §3). Correct
answers live only in the data's `ans` / `aliases` / `key_points` fields — the
student HTML never carries them, and build.py derives the teacher's grading key
from there into `<run dir>/build/key/<output stem>-key.json`. Submission
downloads an RSA-OAEP-256 + AES-GCM encrypted `.json` named
`Lastname, Firstname - Week N - Subject.json` (week + subject are baked in as
`ln:week` / `ln:subject` meta tags from build.json, which must now carry both
when the assignment mounts; the teacher decrypts with `v2/tools/decrypt.py`).
```

- [ ] **Step 3: Part 2 row 7 + label note** — replace the `| 7 | Self-Check | 7–12 hard situational items | `true-false` |` row with:

```markdown
| 7 | **Assignment** | 20 situational items (10 mc·4 tf·4 id·2 sa), hidden until begun; no reveal | `assignment` |
```

and add below the table:

```markdown
Each content-section mount also carries `data-activity="class discussion"` so
the shell prints the Activity tag; Section 7 is the *Assignment* (collect-only,
never scored in-page).
```

- [ ] **Step 4: Part 4/C brief-template bullet** — after the components bullet add:

```markdown
- If your section mounts `assignment`: author correct answers ONLY inside the
  data object (`ans` for mc/tf, `aliases` for id, `key_points` for sa) — the
  student never sees them; build.py derives the teacher's grading key from them.
  No feedback/score UI.
```

- [ ] **Step 5: Part 5 QA bullet** — append to the judgment list:

```markdown
- **Assignment integrity.** 20 items in the 10/4/4/2 mix; no answer material
  (`ans`/`aliases`/`key_points`) readable anywhere in the student file; the
  Begin → fullscreen → slide flow works; `build/key/` received the key file.
```

- [ ] **Step 6: Part 6 principle 7** — replace `7. Refuse to grade: self-checks are calibration; say so.` with:

```markdown
7. The assignment collects; it never reveals. Feedback lives in `build/key/`.
```

- [ ] **Step 7: Run tests, commit**

Run: `python -m pytest tests -q` — expected PASS.

```bash
git add v2/SKILL.md
git commit -m "docs(v2.5): assignment + activity-label contract in the skill"
```

---

