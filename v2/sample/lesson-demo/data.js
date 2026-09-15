/* Week 4 demo lesson data — every interactive element reads from here. */

LN.data.milo0 = {
  title: "By the end of this week you can:",
  items: [
    { t: "Tell fixed from variable cost in any small venture", note: "Section 1" },
    { t: "Run a domain-by-domain feasibility judgment", note: "Section 2" },
    { t: "Compute the break-even point and the margin of safety", note: "Sections 3-4" },
    { t: "Name three places break-even analysis misleads you", note: "Section 5" }
  ]
};

LN.data.gl = {
  groups: [
    { name: "Costs", terms: [
      { t: "fixed cost", d: "Cost that does not move with volume: rent, permits, the cart itself." },
      { t: "variable cost", d: "Cost per plate that repeats with every sale: meat, rice, charcoal, stick." },
      { t: "contribution margin", d: "Price minus variable cost - what one plate contributes toward the fixed cost." },
      { t: "CM ratio", d: "Contribution margin divided by price; how much of each peso earned is margin." }
    ] },
    { name: "Break-even & judgment", terms: [
      { t: "break-even point (BEP)", d: "The volume where total revenue equals total cost: no profit, no loss." },
      { t: "margin of safety", d: "How far expected volume can fall before BEP is hit, as a share of expected volume." },
      { t: "sensitivity", d: "How much BEP moves when price, cost, or volume moves." },
      { t: "feasibility gate", d: "A domain-by-domain go/no-go screen; a passing number cannot rescue a failing domain." }
    ] }
  ]
};

LN.data.sort1 = {
  left: "Fixed cost", right: "Variable cost",
  items: [
    { t: "Rent for the cart space by the market gate", a: "left" },
    { t: "Charcoal bought each selling day", a: "right" },
    { t: "City vendor permit, paid once a year", a: "left" },
    { t: "A kilo of beef tongue per twenty plates", a: "right" },
    { t: "Rice, always a bag more when business is good", a: "right" },
    { t: "The hand-cart itself, bought before opening day", a: "left" },
    { t: "Banana leaves to wrap the tapa", a: "right" },
    { t: "Your helper, paid a fixed daily rate", a: "left" },
    { t: "Juice sachles handed out with each meal", a: "right" },
    { t: "Ice: melted by the day, replaced by the day", a: "both" }
  ]
};

LN.data.cmp1 = {
  left: "Fixed cost", right: "Variable cost",
  rows: [
    { label: "Moves with volume?", l: "No - the rent is due even on a rainy day", r: "Yes - every plate repeats its cost" },
    { label: "Per-unit behaviour", l: "Falls as volume rises (spread thinner)", r: "Stays roughly the same per plate" },
    { label: "How to attack it", l: "Renegotiate, share the space, sell the idle hours", r: "Portion control, cheaper supplier, waste" },
    { label: "Where BEP hides", l: "It sets the height the margin must climb", r: "It sets how steep each step is (the CM)" }
  ]
};

LN.data.gate2 = {
  cases: [
    { id: "cart", name: "The tumba-tapa cart", lessonVerdict: "go",
      domains: [
        { d: "Market", fact: "The gate fills with office workers at noon; no other tapa cart within two blocks." },
        { d: "Cost", fact: "FC of 45,000 a month sits inside what 750 plates at CM 80 can cover." },
        { d: "Skills", fact: "Aling Nena has grilled tumba for eleven years; the recipe is the draw." },
        { d: "Timing", fact: "The permit cycle is two weeks; start-of-quarter cash is tight but not empty." }
      ],
      outcome: "The lesson approved the cart - with the condition that the permit is filed before the first peso of stock is bought." },
    { id: "branch", name: "The rice-truck branch", lessonVerdict: "nogo",
      domains: [
        { d: "Market", fact: "Three rice trucks already serve the same highway stretch." },
        { d: "Cost", fact: "A second truck doubles fixed cost before a single extra meal is sold." },
        { d: "Skills", fact: "Logistics for the route is one person - the one running the cart." },
        { d: "Timing", fact: "The route renegotiation lands in four months; the truck would idle till then." }
      ],
      outcome: "The lesson said no-go: market and timing each fail on their own, and doubling FC halved the margin of safety." }
  ]
};

LN.data.lab3 = {
  money: "\u20B1", unit: "plates",
  init: { fc: 45000, p: 160, vc: 80, vol: 750 },
  ranges: { fc: [10000, 120000, 500], p: [80, 300, 5], vc: [20, 150, 5], vol: [0, 2000, 10] },
  presets: [
    { label: "The cart, as in the lesson", fc: 45000, p: 160, vc: 80, vol: 750 },
    { label: "Rainy month (fewer sales)", fc: 45000, p: 160, vc: 80, vol: 520 },
    { label: "Charcoal price jumps", fc: 45000, p: 160, vc: 95, vol: 750 }
  ]
};

LN.data.ex4 = {
  title: "Example 1 - the cart, as in the lesson",
  story: "FC is 45,000 pesos a month. A plate sells at 160 and its variable cost is 80. Expected volume is 750 plates a month. Verify each step.",
  unit: "plates",
  steps: [
    { q: "Contribution margin per plate", a: 80, pre: "\u20B1", tol: 0.5 },
    { q: "CM ratio (percent of price)", a: 50, suf: "%", tol: 0.5 },
    { q: "Break-even volume (plates/month)", a: 562.5, unit: "plates", tol: 1 },
    { q: "Margin of safety at 750 plates (percent)", a: 25, suf: "%", tol: 0.5 }
  ],
  solution: "CM = 160 - 80 = 80. CM ratio = 80 / 160 = 50%. BEP = 45,000 / 80 = 562.5, about 563 plates a month - roughly 19 a day. MoS = (750 - 562.5) / 750 = 25%."
};

LN.data.rank5 = {
  prompt: "Rank the method's assumptions from strongest to weakest.",
  direction: "most reliable \u2192 least reliable",
  items: [
    { t: "Every peso of revenue and cost is correctly recorded", rank: 4 },
    { t: "Costs split cleanly into fixed and variable", rank: 2 },
    { t: "The price stays the price at any volume", rank: 6 },
    { t: "Everything produced is sold", rank: 5 },
    { t: "Volume is the only thing that moves cost", rank: 1 },
    { t: "The month is the right horizon for the answer", rank: 3 }
  ]
};

LN.data.match5 = {
  prompt: "Which limitation is each note guilty of?",
  concepts: [
    "Flat-price assumption",
    "Sells-all-output assumption",
    "Cost-classification error",
    "Time-lag blindness"
  ],
  scenarios: [
    { text: "We printed 120 banana-leaf wraps a day; half went to the bin each night.", answer: "Sells-all-output assumption" },
    { text: "The sari-sari store next door gets charcoal at a wholesale rate. Our VC curve assumed our retail price.", answer: "Flat-price assumption" },
    { text: "We called the helper's daily wage fixed - but she works two more days every festival month.", answer: "Cost-classification error" },
    { text: "March broke even on paper, yet the stove repair in April nearly drowned the cart.", answer: "Time-lag blindness" }
  ]
};

LN.data.tf6 = {
  items: [
    { s: "The cart's BEP is 563 plates. If only 540 are realistically sellable, the cleanest fix is to cut the price to attract more buyers.",
      a: false, e: "The trap: cutting price lowers the contribution margin, which raises BEP above 563. The fix is on the cost side - rent, charcoal, waste - or a genuinely higher volume." },
    { s: "A plate sells at 160 with a variable cost of 80. The 80-peso gap is the contribution margin.",
      a: true, e: "Correct - and its ratio to price is 50%. CM is the only part of a sale that goes to work on the fixed cost." },
    { s: "If contribution margin turns zero or negative, break-even just becomes very high.",
      a: false, e: "Worse: it becomes unreachable. When price does not exceed variable cost, no volume ever covers fixed cost. The lab correctly refuses to compute a BEP." },
    { s: "Cutting fixed cost by 10% and cutting contribution margin by 10% move the BEP by the same amount.",
      a: false, e: "The arithmetic is symmetric (BEP = FC / CM) but the plan is not: a CM cut is a cut on every single sale, so it also compresses the margin of safety." },
    { s: "A margin of safety of 25% at 750 expected plates means BEP is at about 563 plates.",
      a: true, e: "MoS = (750 - BEP) / 750 = 25% puts BEP at 562.5. Read margins of safety as distances you can afford to be wrong." },
    { s: "The cart passes every break-even test, so the lesson should approve it.",
      a: false, e: "The numbers are one gate, not the gate. A failing domain - no market, no skill, bad timing - sinks a feasible-looking venture; the gate exists to stop this exact shortcut." },
    { s: "Two ventures with the same BEP always carry the same risk.",
      a: false, e: "Same BEP, different distance to it. The one whose expected volume sits barely above BEP dies in any bad week; the other shrugs it off." }
  ]
};

LN.data.recap7 = {
  title: "Six cards to carry out of Week 4",
  cards: [
    { q: "The one-line feasibility question", a: "Which costs move with volume, and which sit still?" },
    { q: "Contribution margin, in words", a: "What is left of each sale after its own variable cost - the part that pays the fixed cost." },
    { q: "Break-even, the formula", a: "BEP = FC / (P - VC). Price must exceed VC, or there is no answer." },
    { q: "Margin of safety", a: "(Expected - BEP) / Expected. The distance you can afford to be wrong." },
    { q: "What the gate catches", a: "A passing number cannot rescue a failing domain: market, cost, skills, timing." },
    { q: "Where the method goes dark", a: "Flat price, sells-all-output, clean cost splits, and the time lag between months." }
  ]
};
