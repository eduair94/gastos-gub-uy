/**
 * Parser for ACCE's SICE/CUBS catalog dump (`imp_catalogo.tgz`). The archive is
 * a set of ANSI-SQL files — DDL + one-row-per-statement INSERTs — NOT CSV, so we
 * parse the INSERTs directly.
 *
 * Confirmed traps (all present in the real dump):
 *   - Encoding is Latin-1/CP1252 — the caller MUST read the file as `latin1`.
 *   - `''` inside a string is an escaped single quote; `''` alone is empty-string.
 *   - Strings can contain commas and parentheses, so we cannot split on `,`/`)`
 *     naïvely — a quote-aware scanner is required.
 *   - Literals: numbers, quoted strings, bare `NULL`, and `date 'YYYY-MM-DD'`.
 *   - Table names are plural (familias, subflias, clases, subclases, unidades_med,
 *     sinonimos, art_serv_obra); INSERTs are column-qualified, so we key by column
 *     name rather than positional order.
 */

export type SqlValue = string | null;
export interface InsertRow { [column: string]: SqlValue; }

const HEADER_RE = /insert\s+into\s+(\w+)\s*\(([^)]*)\)\s*values\s*\(/gi;

/**
 * All INSERT rows for `table`, each as a `{ column: value }` map (columns and
 * table matched case-insensitively). Values: quoted strings are unescaped,
 * `NULL` → null, `date '...'` → the date string, numbers → their raw string.
 */
export function parseInserts(sql: string, table: string): InsertRow[] {
  const rows: InsertRow[] = [];
  const wanted = table.toLowerCase();
  HEADER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADER_RE.exec(sql))) {
    const cols = m[2].split(",").map((c) => c.trim().toLowerCase());
    const { fields, endIndex } = scanTuple(sql, HEADER_RE.lastIndex);
    HEADER_RE.lastIndex = endIndex; // resume after this tuple's closing paren
    if (m[1].toLowerCase() !== wanted) continue;
    const row: InsertRow = {};
    for (let i = 0; i < cols.length; i++) row[cols[i]] = parseField(fields[i]);
    rows.push(row);
  }
  return rows;
}

/**
 * Scan one value tuple starting at `start` (the char just after the opening
 * `(`). Returns the raw, comma-split field strings (quotes retained) and the
 * index just past the matching `)`. Commas/parens inside quoted strings are
 * ignored; `''` inside a string is kept raw for parseField to unescape.
 */
function scanTuple(sql: string, start: number): { fields: string[]; endIndex: number } {
  const fields: string[] = [];
  let cur = "";
  let inStr = false;
  let i = start;
  for (; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      if (ch === "'") {
        if (sql[i + 1] === "'") { cur += "''"; i++; continue; } // escaped quote
        inStr = false; cur += ch; continue;
      }
      cur += ch; continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === ",") { fields.push(cur); cur = ""; continue; }
    if (ch === ")") { fields.push(cur); i++; break; }
    cur += ch;
  }
  return { fields, endIndex: i };
}

function parseField(raw: string | undefined): SqlValue {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === "") return null;
  if (/^null$/i.test(t)) return null;
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  const dm = /^date\s+'([^']*)'/i.exec(t);
  if (dm) return dm[1];
  return t; // number or bareword, kept as string
}

// ---- Typed row shapes for the tables the import job consumes ----

export interface FamiliaRow { cod: string; descripcion: string; comprable: string }
export interface SubfliaRow { fami_cod: string; cod: string; descripcion: string }
export interface ClaseRow { fami_cod: string; subf_cod: string; cod: string; descripcion: string }
export interface SubclaseRow { fami_cod: string; subf_cod: string; clas_cod: string; cod: string; descripcion: string }
export interface UnidadMedRow { cod: string; descripcion: string }
export interface SinonimoRow { arse_cod: string; descripcion: string }
export interface ArticuloRow {
  cod: string; descripcion: string;
  fami_cod: string; subf_cod: string; clas_cod: string; subc_cod: string;
  unme_cod: string | null; ind_art_serv: string | null; odg: string | null;
  comprable: string | null; fecha_baja: string | null;
}

const s = (v: SqlValue): string => (v == null ? "" : v);

export const parseFamilias = (sql: string): FamiliaRow[] =>
  parseInserts(sql, "familias").map((r) => ({ cod: s(r.cod), descripcion: s(r.descripcion), comprable: s(r.comprable) }));

export const parseSubflias = (sql: string): SubfliaRow[] =>
  parseInserts(sql, "subflias").map((r) => ({ fami_cod: s(r.fami_cod), cod: s(r.cod), descripcion: s(r.descripcion) }));

export const parseClases = (sql: string): ClaseRow[] =>
  parseInserts(sql, "clases").map((r) => ({ fami_cod: s(r.fami_cod), subf_cod: s(r.subf_cod), cod: s(r.cod), descripcion: s(r.descripcion) }));

export const parseSubclases = (sql: string): SubclaseRow[] =>
  parseInserts(sql, "subclases").map((r) => ({ fami_cod: s(r.fami_cod), subf_cod: s(r.subf_cod), clas_cod: s(r.clas_cod), cod: s(r.cod), descripcion: s(r.descripcion) }));

export const parseUnidadesMed = (sql: string): UnidadMedRow[] =>
  parseInserts(sql, "unidades_med").map((r) => ({ cod: s(r.cod), descripcion: s(r.descripcion) }));

export const parseSinonimos = (sql: string): SinonimoRow[] =>
  parseInserts(sql, "sinonimos").map((r) => ({ arse_cod: s(r.arse_cod), descripcion: s(r.descripcion) }));

export const parseArticulos = (sql: string): ArticuloRow[] =>
  parseInserts(sql, "art_serv_obra").map((r) => ({
    cod: s(r.cod), descripcion: s(r.descripcion),
    fami_cod: s(r.fami_cod), subf_cod: s(r.subf_cod), clas_cod: s(r.clas_cod), subc_cod: s(r.subc_cod),
    unme_cod: r.unme_cod ?? null, ind_art_serv: r.ind_art_serv ?? null, odg: r.odg ?? null,
    comprable: r.comprable ?? null, fecha_baja: r.fecha_baja ?? null,
  }));
