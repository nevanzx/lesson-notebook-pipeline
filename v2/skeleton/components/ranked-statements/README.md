# ranked-statements
Ordering comprehension check for lessons without calculation (v1.9 §2.2): exactly 10
medium claims, clicked from the bank into a lineup, then Check — reports how many sit in
the right slot; clicks return items to the bank for another pass. Mount with
`data-activity="comprehension check"`. Author `items` in a SCRAMBLED presentation order;
`rank` gives the correct position (1 = first).

Data (`LN.data.rank6 = ...`):
```js
{ prompt: optional, direction: "most \u2192 least important",
  items: [{ t: "claim text", rank: 2 }, ...] }   /* shuffled presentation, ranks 1..n unique */
```
When-not: two-bucket classification (use sort-statement).
