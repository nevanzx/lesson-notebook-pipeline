export function buildWorkbookData({ roster, assignments }) {
  const perAssign = [];
  for (const a of assignments) {
    perAssign.push({ tag: a.tag, saNs: a.saNs });
  }
  const head = ["Name", "ID"];
  for (const p of perAssign) {
    head.push(`${p.tag} MC`, `${p.tag} TF`, `${p.tag} ID`);
    for (const n of p.saNs) head.push(`${p.tag} SA${n}`);
    head.push(`${p.tag} Total`);
  }
  head.push("GrandTotal", "Status");
  const grades = [head];
  const byKey = new Map();
  for (const a of assignments) {
    for (const [k, r] of a.results) {
      if (!byKey.has(k)) byKey.set(k, { name: r.name, id: r.id, cells: [], grand: 0 });
      const row = byKey.get(k);
      row.cells.push(r.mc, r.tf, r.idScore);
      for (const n of a.saNs) row.cells.push(r.saScores.get(n) ?? "");
      row.cells.push(r.total);
      row.grand += r.total;
    }
  }
  for (const row of byKey.values()) {
    grades.push([row.name, row.id, ...row.cells, row.grand, "matched"]);
  }
  const unmatched = [["Assignment", "File"]];
  const missing = [["Assignment", "Name", "ID"]];
  for (const a of assignments) {
    for (const f of a.unmatched || []) unmatched.push([a.tag, f]);
    for (const m of a.missing || []) missing.push([a.tag, m.name, m.id]);
  }
  const review = [["Assignment", "SA", "Ref", "AI score", "AI reason", "Final"]];
  for (const a of assignments) {
    for (const r of a.reviews || []) {
      review.push([a.tag, r.saN, r.ref, r.ai, r.reason, r.final]);
    }
  }
  return { sheets: [
    { name: "Grades", rows: grades },
    { name: "Unmatched", rows: unmatched },
    { name: "Missing", rows: missing },
    { name: "ReviewLog", rows: review },
  ] };
}
