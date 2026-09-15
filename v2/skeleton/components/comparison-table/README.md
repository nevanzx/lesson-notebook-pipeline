# comparison-table
Static two-column comparison table on the shell's .tbl vocabulary, in a phone-scrollable
.cmp-wrap with the swipe hint. Use for Concept A vs Concept B rows that do not need sorting.

Data (`LN.data.cmp1 = ...`):
```js
{ title: optional, rowLabel: optional corner-header, left: "Fixed cost", right: "Variable cost",
  rows: [{ label: "Definition", l: "...", r: "..." }] }
```
When-not: if the student should discover the differences, use sort-statement instead.
