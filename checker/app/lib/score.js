import { idMatch, tfCorrect, mcCorrect } from "./format.js";

export function scoreNonAI(keyItems, answers) {
  const byQ = new Map((answers || []).map((a) => [a.q, a]));
  const perQ = [];
  let mc = 0;
  let tf = 0;
  let id = 0;
  const saItems = [];
  for (const k of keyItems) {
    const a = byQ.get(k.n);
    const given = a ? a.answer : undefined;
    if (k.type === "mc") {
      const ok = given !== undefined && mcCorrect(given, k.ans);
      if (ok) mc++;
      perQ.push({ n: k.n, type: "mc", correct: ok, points: ok ? 1 : 0 });
    } else if (k.type === "tf") {
      const ok = given !== undefined && tfCorrect(given, k.ans);
      if (ok) tf++;
      perQ.push({ n: k.n, type: "tf", correct: ok, points: ok ? 1 : 0 });
    } else if (k.type === "id") {
      const ok = given !== undefined && idMatch(given, k.aliases);
      if (ok) id++;
      perQ.push({ n: k.n, type: "id", correct: ok, points: ok ? 1 : 0 });
    } else {
      saItems.push({
        n: k.n,
        prompt: k.prompt,
        answer: typeof given === "string" ? given : "",
        rubric: k.rubric,
        maxPoints: k.max_points,
        keyPoints: k.key_points,
      });
    }
  }
  return { perQ, mc, tf, id, totalNonAI: mc + tf + id, saItems };
}
