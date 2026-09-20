export function parseRosterFile(XLSX, arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true }),
  }));
}

export function downloadWorkbook(XLSX, data, filename) {
  const wb = XLSX.utils.book_new();
  for (const s of data.sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  }
  XLSX.writeFile(wb, filename);
}
