import { normalize } from "./format.js";

function headerRowIndex(rows) {
  return rows.findIndex((r) =>
    r.some((c) => /student'?s name/i.test(String(c ?? ""))) &&
    r.some((c) => /id\s*no\.?/i.test(String(c ?? ""))));
}

function colIndex(header, re) {
  return header.findIndex((c) => re.test(String(c ?? "")));
}

export function parseRosterSheet(rows, source) {
  const hi = headerRowIndex(rows);
  if (hi < 0) return [];
  const header = rows[hi];
  const ni = colIndex(header, /student'?s name/i);
  const ii = colIndex(header, /id\s*no\.?/i);
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const name = String(r[ni] ?? "").trim();
    const id = String(r[ii] ?? "").trim();
    if (!name) continue;
    out.push({ name, id, source });
  }
  return out;
}

export function mergeRosters(lists) {
  const seen = new Set();
  const out = [];
  for (const row of lists.flat()) {
    const key = row.id ? `id:${normalize(row.id)}` : `nm:${normalize(row.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function joinSubmissions(roster, submissions) {
  const byId = new Map(roster.filter((r) => r.id).map((r) => [normalize(r.id), r]));
  const byName = new Map(roster.map((r) => [normalize(r.name), r]));
  const used = new Set();
  const matched = [];
  const unmatched = [];
  for (const sub of submissions) {
    const st = sub.student || {};
    const stName = st.name || [st.last, st.first].filter(Boolean).join(", ");
    const hit = (st.id && byId.get(normalize(st.id))) ||
      (stName && byName.get(normalize(stName))) || null;
    if (hit && !used.has(hit)) {
      used.add(hit);
      matched.push({ roster: hit, sub });
    } else {
      unmatched.push(sub);
    }
  }
  return { matched, unmatched, missing: roster.filter((r) => !used.has(r)) };
}
