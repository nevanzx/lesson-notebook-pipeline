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
      const ok = given !== undefined && mcCorrect(given, k.ans, k.choices);
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

export function scoreDag(dagKey, path) {
  const nodes = (dagKey && dagKey.nodes) || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots = nodes.filter((n) => n.level === 0);
  const maxScore = (dagKey && dagKey.optimal && dagKey.optimal.max_score) || 0;
  const gold = ((dagKey && dagKey.optimal && dagKey.optimal.path) || [])
    .map((p) => p.label);
  const steps = [];
  let score = 0;
  let mismatch = "";
  const labels = [];
  const pathSteps = path || [];
  if (!pathSteps.length) {
    mismatch = "not a walk: empty path";
  } else if (roots.length !== 1) {
    mismatch = "not a walk: key has no single root";
  } else if (pathSteps[0].node !== roots[0].id) {
    mismatch = `not a walk: must start at root ${roots[0].id}, got ${pathSteps[0].node}`;
  }
  for (let i = 0; !mismatch && i < pathSteps.length; i++) {
    const step = pathSteps[i];
    const node = byId.get(step.node);
    if (!node) { mismatch = `unknown node ${step.node}`; break; }
    const ch = (node.choices || []).find((c) => c.label === step.label);
    if (!ch) { mismatch = `unknown choice ${step.node}/${step.label}`; break; }
    if (i + 1 < pathSteps.length && ch.nextNodeId !== pathSteps[i + 1].node) {
      mismatch = `not a walk: ${step.node}/${step.label} → ${ch.nextNodeId} but next step is ${pathSteps[i + 1].node}`;
      break;
    }
    const pts = typeof ch.points === "number" ? ch.points : 0;
    score += pts;
    labels.push(step.label);
    steps.push({ node: step.node, label: step.label, points: pts, text: ch.text || "" });
  }
  if (!mismatch) {
    const lastStep = pathSteps[pathSteps.length - 1];
    const lastNode = byId.get(lastStep.node);
    const lastCh = (lastNode.choices || []).find((c) => c.label === lastStep.label);
    const endId = lastCh ? lastCh.nextNodeId : null;
    const endNode = endId ? byId.get(endId) : null;
    if (!endNode || endNode.isLeaf !== true) {
      mismatch = `not a walk: does not end at a leaf (${endId || "unresolved"})`;
    }
  }
  let pathMatch = false;
  let divergeAt = -1;
  if (!mismatch) {
    pathMatch = labels.length === gold.length
      && labels.every((l, i) => l === gold[i]);
    if (!pathMatch) {
      divergeAt = labels.findIndex((l, i) => l !== gold[i]);
      if (divergeAt < 0) divergeAt = Math.min(labels.length, gold.length);
    }
  }
  return {
    score: mismatch ? 0 : score,
    maxScore,
    pct: mismatch || maxScore <= 0 ? 0 : score / maxScore,
    pathMatch,
    divergeAt,
    mismatch,
    steps,
    ribbon: mismatch ? "" : labels.join("→"),
  };
}
