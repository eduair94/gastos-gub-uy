/**
 * RFC4180-ish CSV parser.
 *
 * PURE — no I/O, no imports — so tests/unit can use it directly. Handles quoted fields with
 * embedded commas, embedded newlines and `""` escapes, and strips a UTF-8 BOM.
 *
 * It lives here rather than inside a job because more than one open-data loader needs it: the MIEM
 * DEI registry (src/jobs/load-dei.ts) and the JUTEP omisos roster (src/jobs/load-jutep-omisos.ts)
 * both publish plain CSV on catalogodatos.gub.uy, and the JUTEP file genuinely needs the quote
 * handling — "MINISTERIO DE GANADERÍA, AGRICULTURA Y PESCA" splits into two fields without it.
 *
 * The delimiter is a parameter because the sources disagree: catalogodatos serves the DEI and JUTEP
 * files comma-separated and the UDECO sanctions file SEMICOLON-separated. Encoding disagrees too —
 * JUTEP is UTF-8, UDECO and SICE are Latin-1 — but that is the caller's decode, not this parser's.
 *
 * Deliberately NOT a dependency: the whole thing is 25 lines and the repo already avoids pulling a
 * package for what a loop does.
 */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      /* ignore, handled by \n */
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  // Trailing field/row without a final newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse a CSV whose first row is a header into objects keyed by column NAME.
 *
 * Keying by name rather than by position is the same rule the SICE parser follows: these files are
 * republished with columns added and reordered, and a positional read fails silently when that
 * happens — the worst possible failure mode for a loader.
 */
export function parseCsvRecords(text: string, delimiter = ","): Array<Record<string, string>> {
  const rows = parseCsv(text, delimiter);
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim());
  const out: Array<Record<string, string>> = [];
  for (const row of rows.slice(1)) {
    // A row of a single empty field is a trailing newline artefact, not a record.
    if (row.length === 1 && row[0]!.trim() === "") continue;
    const record: Record<string, string> = {};
    header.forEach((key, i) => {
      record[key] = (row[i] ?? "").trim();
    });
    out.push(record);
  }
  return out;
}
