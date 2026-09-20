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
  const info = new Map();
  for (const a of assignments) {
    for (const [k, r] of a.results) {
      if (!info.has(k)) info.set(k, { name: r.name, id: r.id });
    }
  }
  for (const [k, { name, id }] of info) {
    const cells = [];
    let grand = 0;
    for (const a of assignments) {
      const r = a.results.get(k);
      if (!r) {
        cells.push("", "", "");
        for (const n of a.saNs) cells.push("");
        cells.push("");
        continue;
      }
      cells.push(r.mc, r.tf, r.idScore);
      for (const n of a.saNs) cells.push(r.saScores.get(n) ?? "");
      cells.push(r.total);
      grand += r.total;
    }
    grades.push([name, id, ...cells, grand, "matched"]);
  }
  // Unmatched submissions were still fully checked — list them in Grades
  // with status "unmatched" so no scores are lost. Each unmatched file is
  // its own row (never merged across assignments).
  for (const a of assignments) {
    if (!a.unmatchedResults) continue;
    for (const [, r] of a.unmatchedResults) {
      const cells = [];
      let grand = 0;
      for (const b of assignments) {
        if (b === a) {
          cells.push(r.mc, r.tf, r.idScore);
          for (const n of b.saNs) cells.push(r.saScores.get(n) ?? "");
          cells.push(r.total);
          grand += r.total;
        } else {
          cells.push("", "", "");
          for (const n of b.saNs) cells.push("");
          cells.push("");
        }
      }
      grades.push([r.name, r.id, ...cells, grand, "unmatched"]);
    }
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
