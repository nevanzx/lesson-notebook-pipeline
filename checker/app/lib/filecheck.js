import { normalize } from "./format.js";

function baseName(filename) {
  return String(filename || "")
    .split(/[\\/]/)
    .pop()
    .replace(/\.json$/i, "")
    .replace(/\s+\(\d+\)$/, "")
    .trim();
}

/* The lesson names a submission "<Lastname, Firstname> - Week N - <Subject>.json".
 * The readable part is only a claim: the encrypted student block is the truth.
 * Returns "" when no name claim is present (renamed file), so the caller can
 * mark it unverified instead of inventing a mismatch. */
export function claimedNameFromFile(filename) {
  const parts = baseName(filename).split(/\s+-\s+Week\s+/i);
  return parts.length > 1 ? parts[0].trim() : "";
}

export function checkFileName(filename, student) {
  const st = student || {};
  const claimed = claimedNameFromFile(filename);
  const actual = st.name || [st.last, st.first].filter(Boolean).join(", ");
  const out = {
    file: String(filename || ""),
    claimed,
    actual,
    id: st.id || "",
    status: "unverified",
  };
  if (!claimed || !actual) return out;
  const got = normalize(claimed);
  const names = [normalize(actual)];
  if (st.first && st.last) {
    names.push(normalize(st.first + " " + st.last));
    names.push(normalize(st.last + ", " + st.first));
  }
  out.status = names.includes(got) ? "match" : "mismatch";
  return out;
}

/* Collect the flags attached to scored/unmatched results for the results
 * note and the exported workbook. */
export function flaggedStudents(results, unmatchedResults) {
  const out = [];
  for (const map of [results, unmatchedResults]) {
    if (!map) continue;
    for (const r of map.values()) {
      if (r && r.fileCheck && r.fileCheck.status !== "match") out.push(r.fileCheck);
    }
  }
  return out;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function fileCheckNoteHtml(flags) {
  if (!flags || !flags.length) return "";
  const items = flags.map((f) => {
    const id = f.id ? ` (${esc(f.id)})` : "";
    if (f.status === "mismatch") {
      return `&ldquo;${esc(f.file)}&rdquo; claims ${esc(f.claimed)} ` +
        `but the encrypted submission is ${esc(f.actual)}${id}.`;
    }
    return `&ldquo;${esc(f.file)}&rdquo; has no readable name; ` +
      `the encrypted submission is ${esc(f.actual)}${id}.`;
  });
  return `<p class="note flag"><b>File check:</b> ${items.join(" ")}</p>`;
}
