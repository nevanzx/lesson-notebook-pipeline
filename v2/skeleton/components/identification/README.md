# identification

Comprehension-check activity (in-section, medium difficulty). Each item gives a
description and the student types the term or concept it names. Clicking Check or
pressing Enter locks the item (no retry), colours the field, and reveals the correct
term plus the explanation naming the slip. Scoreboard denominator is the TOTAL.

Mount ten items per content section and label the mount
`data-activity="comprehension check"`.

Data (`LN.data.id3 = ...`):
```js
{ prompt: "Identify the term or concept each item describes.",
  items: [{ q: "The rate that equates a project's discounted cash inflows with its outlay.",
            a: "internal rate of return",
            aliases: ["IRR"],
            e: "NPV uses the hurdle rate; the rate that zeroes NPV is the IRR." }] }
```

`a` is the canonical answer; optional `aliases` lists accepted variants. Matching is
case-insensitive, whitespace-collapsed, and punctuation-tolerant at the edges.
Optional per-item `e` is appended after "Correct." / "Not quite." — the explanation
names the slip.

When-not: trivia recall; anything graded (this format refuses to grade — Section 7's
`assignment` collects instead).
