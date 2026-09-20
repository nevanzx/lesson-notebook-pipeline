function requireXLSX(XLSX) {
  if (!XLSX || typeof XLSX.read !== "function" || !XLSX.utils) {
    throw new Error(
      "SheetJS (XLSX) library not loaded. Check your network connection / ad-blocker, " +
      "reload teacher.html so the SheetJS CDN script loads, then retry."
    );
  }
  return XLSX;
}

export function parseRosterFile(XLSX, arrayBuffer) {
  requireXLSX(XLSX);
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true }),
  }));
}

export function downloadWorkbook(XLSX, data, filename) {
  requireXLSX(XLSX);
  if (typeof XLSX.writeFile !== "function") {
    throw new Error(
      "SheetJS (XLSX) library not loaded. Check your network connection / ad-blocker, " +
      "reload teacher.html so the SheetJS CDN script loads, then retry."
    );
  }
  const wb = XLSX.utils.book_new();
  for (const s of data.sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  }
  XLSX.writeFile(wb, filename);
}
