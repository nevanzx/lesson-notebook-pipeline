# feasibility-gate
Multi-domain judgment with a personal go/no-go call (Section 2). Tabs per case; each domain
gets Pass/Marginal/Fail; submit requires all domains judged; verdict = any fail -> NO-GO,
else any marginal -> CONDITIONAL GO, else GO; then the lesson's actual conclusion is revealed
with a match note. Picks and verdict persist per case, not globally.

Data (`LN.data.gate2 = ...`):
```js
{ cases: [{ id: "cart", name: "Food-cart case", lessonVerdict: "go",
  domains: [{ d: "Market", fact: "One-sentence finding from the source" }],  /* usually 4 */
  outcome: "What the lesson concluded and why." }] }
```
