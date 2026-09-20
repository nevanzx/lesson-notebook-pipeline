# Component registry

**Read this before writing any interactive element.** If a row fits, use the component:
add its name to `build.json > components`, put a mount in `sections.html`, and put the
data object in `data.js`. Only hand-write (via `extra.css`/`extra.js`) when nothing here
fits — then propose the new component for promotion.

| Teaching need | Component | Data schema (`LN.data[key] = …`) | Example mount |
|---|---|---|---|
| State lesson outcomes; student claims them | `milo-list` | `{title?, items:[{t, note?}]}` | `<div data-component="milo-list" data-key="milo0"></div>` |
| Distinguish two confused concepts | `sort-statement` | `{left, right, items:[{t, a:'left'\|'right'\|'both', e?}]}` (8–12 items) | `<div data-component="sort-statement" data-key="sort1"></div>` |
| Show A-vs-B differences as reference | `comparison-table` | `{title?, rowLabel?, left, right, rows:[{label, l, r}]}` | `<div data-component="comparison-table" data-key="cmp1"></div>` |
| Multi-domain judgment → go/no-go verdict | `feasibility-gate` | `{cases:[{id, name, domains:[{d, fact}], lessonVerdict:'go'\|'nogo', outcome}]}` | `<div data-component="feasibility-gate" data-key="gate2"></div>` |
| The anchor calculator (break-even) + ±10% sensitivity | `break-even-lab` | `{money, unit, init:{fc,p,vc,vol}, ranges:{k:[min,max,step]}, presets:[{label,fc,p,vc,vol}]}` | `<div data-component="break-even-lab" data-key="lab3"></div>` |
| The anchor calculator (time value of money: FV/PV, and bond duration/convexity) + sensitivity | `tvm-lab` | `{money, init:{mode,amt,r,n[,cr,dy]}, ranges:{amt,r,n[,cr,dy]}, presets:[{label,mode,amt,r,n[,cr,dy]}], copy:{...all wording}}` — see README for the `copy` keys | `<div data-component="tvm-lab" data-key="lab3"></div>` |
| Verify each step of a worked example | `step-solver` | `{title?, story, unit?, steps:[{q, a, pre?, unit?, tol?}], solution?}` (or array of these) | `<div data-component="step-solver" data-key="ex4"></div>` |
| Hard situational self-check | `true-false` | `{items:[{s, a, e}]}` | `<div data-component="true-false" data-key="tf7"></div>` |
| Order claims (no calculation lessons) | `ranked-statements` | `{prompt?, direction, items:[{t, rank}]}` (author shuffled) | `<div data-component="ranked-statements" data-key="rank6"></div>` |
| Recognise concepts in scenarios | `case-match` | `{prompt?, concepts:[…], scenarios:[{text, answer, e?}]}` | `<div data-component="case-match" data-key="match6"></div>` |
| Recap cards (printable) | `flipcards` | `{title?, cards:[{q, a}]}` | `<div data-component="flipcards" data-key="flip8"></div>` |
| The mandatory Glossary section | `glossary` | `{title?, groups:[{name?, terms:[{t, d}]}]}` | `<div data-component="glossary" data-key="gl"></div>` |
| Collect answers for the teacher (no reveal), encrypted submit | `assignment` | `{intro?, items:[18 fixed + 2+ sa: 10×{type:'mc',prompt,choices[4]}, 4×{type:'tf',prompt}, 4×{type:'id',prompt}, 2×{type:'sa',prompt}]}` — answers never in student data. SA items also carry `rubric` (string) + `max_points` (positive int); 2+ SA items allowed. | `<div data-component="assignment" data-key="assign7"></div>` |

Conventions: one key per mount (a key may be reused by two mounts of the same component);
component JS is content-free — all wording lives in `data.js`; feedback pairs colour with
text ("Correct" / "Not quite") never hue alone; interactive activities hide themselves in
print, recap/static ones flatten to readable.
