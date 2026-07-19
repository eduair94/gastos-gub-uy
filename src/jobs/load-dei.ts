#!/usr/bin/env tsx

/**
 * Load MIEM's Directorio de Empresas Industriales (DEI) into `dei_companies`.
 *
 * DEI is Uruguay open data: a registry of certified industrial companies with
 * their RUT, size, industrial activity (CIIU), location and contact details.
 * We cross-reference it against state suppliers by RUT so the app can show a
 * verified "registered industrial company" panel + badge + a map + a
 * size-vs-spend transparency signal. Source:
 *   https://catalogodatos.gub.uy/dataset/miem-dei
 *
 * The join key is RUT. Every supplier_patterns doc is keyed by a RUT-based
 * `supplierId` (`R/210002980010` / `R213382910014`), so `digits(supplierId)`
 * equals the DEI `RUT` — an exact, false-positive-free match. This job only
 * loads the registry; the join happens at read time (app/server/utils/dei.ts).
 *
 * The published resource is a periodic snapshot (the filename says 2023 but the
 * rows carry current registro/vencimiento dates — it is refreshed in place), so
 * this loader is idempotent: it upserts by RUT and is safe to re-run.
 *
 * Usage:
 *   npx tsx src/jobs/load-dei.ts                 # download the published CSV + load
 *   npx tsx src/jobs/load-dei.ts --file=dei.csv  # load a local CSV instead
 *   npx tsx src/jobs/load-dei.ts --url=https://…  # override the source URL
 *   npx tsx src/jobs/load-dei.ts --dry-run       # parse + report, write nothing
 */

import axios from "axios";
import * as fs from "fs";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { DeiCompanyModel } from "../../shared/models/dei_company";

const DEFAULT_URL =
  "https://catalogodatos.gub.uy/dataset/575ccb87-ae74-4dcd-ba4b-cf050bd8e08a/resource/e56d1949-3e94-42a9-801f-c6d2523b185d/download/empresasdei_20230330.csv";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** RFC4180-ish parser: handles quoted fields with embedded commas, newlines and "" escapes. */
function parseCsv(text: string): string[][] {
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
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      }
      else field += c;
    }
    else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* ignore, handled by \n */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  // Trailing field/row without a final newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const digits = (s: string): string => (s || "").replace(/\D/g, "");

/** Trim; treat empty or the "S/D" (sin dato) sentinel as null. */
function sd(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t || t.toUpperCase() === "S/D") return null;
  return t;
}

/** Parse a coordinate: strip the spreadsheet `'` text-guard, bound to Uruguay. */
function coord(v: string | undefined, kind: "lat" | "lng"): number | null {
  const t = sd(v);
  if (t === null) return null;
  const n = Number(t.replace(/^'/, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  // Uruguay bounding box; anything outside is junk/placeholder → drop.
  if (kind === "lat" && (n < -35.5 || n > -29.5)) return null;
  if (kind === "lng" && (n < -59 || n > -52.5)) return null;
  return n;
}

/** Split a `;`-delimited sub-list into a clean array. */
function list(v: string | undefined): string[] {
  return (v ?? "").split(";").map((s) => s.trim()).filter(Boolean);
}

/** Compose a one-line street address from the establishment fields, or null. */
function address(get: (h: string) => string): string | null {
  const calle = sd(get("Calle (EP)"));
  const numero = sd(get("Numero (EP)"));
  const ruta = sd(get("Ruta (EP)"));
  const km = sd(get("Kilometro (EP)"));
  const parts: string[] = [];
  if (calle) parts.push(numero ? `${calle} ${numero}` : calle);
  if (ruta) parts.push(km ? `Ruta ${ruta} Km ${km}` : `Ruta ${ruta}`);
  return parts.length ? parts.join(", ") : null;
}

/** Normalize a date-only field to ISO `YYYY-MM-DD` (source is already that shape). */
function isoDate(v: string | undefined): string | null {
  const t = sd(v);
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : t;
}

async function main() {
  const dryRun = flag("dry-run");
  const file = arg("file");
  const url = arg("url") ?? DEFAULT_URL;

  // --- Get the CSV text ---
  let text: string;
  if (file) {
    console.log(`📄 Reading local CSV: ${file}`);
    text = fs.readFileSync(file, "utf8");
  }
  else {
    console.log(`⬇️  Downloading DEI CSV: ${url}`);
    const res = await axios.get<string>(url, { responseType: "text", timeout: 60000 });
    text = res.data;
  }

  // --- Parse ---
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("CSV is empty");
  const header = rows[0].map((h) => h.trim());
  const idx = new Map(header.map((h, i) => [h, i] as const));
  const get = (row: string[], h: string): string => {
    const i = idx.get(h);
    return i === undefined ? "" : (row[i] ?? "");
  };

  const required = ["RUT", "Denominacion Social", "Estado de la empresa"];
  for (const r of required) {
    if (!idx.has(r)) throw new Error(`CSV missing expected column "${r}". Header: ${header.join(" | ")}`);
  }

  const docs: IDeiDoc[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  let withCoords = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.length || (row.length === 1 && row[0].trim() === "")) continue;
    const g = (h: string) => get(row, h);
    const rut = digits(g("RUT"));
    if (rut.length < 8) { skipped++; continue }
    if (seen.has(rut)) { skipped++; continue }
    seen.add(rut);

    const lat = coord(g("Latitud (EP)"), "lat");
    const lng = coord(g("Longitud (EP)"), "lng");
    // Require BOTH coords or neither — a lone axis can't place a pin.
    const bothCoords = lat !== null && lng !== null;
    if (bothCoords) withCoords++;

    docs.push({
      rut,
      estado: (sd(g("Estado de la empresa")) ?? ""),
      denominacionSocial: (sd(g("Denominacion Social")) ?? ""),
      nombreComercial: (sd(g("Nombre comercial")) ?? ""),
      tamano: (sd(g("Tamaño de la empresa")) ?? ""),
      tiposActividad: list(g("Tipos de actividad de la empresa")),
      descripcionActividad: (sd(g("Descripcion de la Actividad")) ?? ""),
      ciiuPrincipal: (sd(g("Codigo CIIU principal")) ?? ""),
      ciiuPrincipalDesc: (sd(g("Descripcion Codigo CIIU principal")) ?? ""),
      ciiuSecundarios: list(g("Codigos CIIU secundarios")),
      departamento: (sd(g("Departamento (EP)")) ?? ""),
      localidad: (sd(g("Localidad (EP)")) ?? ""),
      direccion: address(g),
      lat: bothCoords ? lat : null,
      lng: bothCoords ? lng : null,
      email: sd(g("Email publico")),
      sitioWeb: sd(g("Sitio web")),
      telefono: sd(g("Numero de telefono")),
      fechaRegistro: isoDate(g("Fecha de Registro")),
      fechaVencimiento: isoDate(g("Fecha de vencimiento")),
    });
  }

  console.log(
    `📊 Parsed ${docs.length} companies (skipped ${skipped}); ${withCoords} with coordinates; `
    + `${docs.filter((d) => /micro|pequeñ/i.test(d.tamano)).length} micro/pequeña.`,
  );
  if (docs.length) {
    const s = docs[0];
    console.log(`   e.g. ${s.rut} — ${s.denominacionSocial} (${s.tamano}) — ${s.ciiuPrincipalDesc}`);
  }

  if (dryRun) {
    console.log("🧪 --dry-run: no writes.");
    return;
  }

  // --- Upsert ---
  await connectToDatabase();
  const loadedAt = new Date();
  const ops = docs.map((d) => ({
    updateOne: {
      filter: { rut: d.rut },
      update: { $set: { ...d, loadedAt } },
      upsert: true,
    },
  }));
  const BATCH = 1000;
  let upserted = 0, modified = 0;
  for (let i = 0; i < ops.length; i += BATCH) {
    const res = await DeiCompanyModel.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
    upserted += res.upsertedCount ?? 0;
    modified += res.modifiedCount ?? 0;
    console.log(`   …${Math.min(i + BATCH, ops.length)}/${ops.length}`);
  }
  const total = await DeiCompanyModel.countDocuments({});
  console.log(`✅ dei_companies: +${upserted} new, ${modified} updated. Collection now ${total}.`);

  await disconnectFromDatabase();
}

/** The plain shape built per row (loadedAt is stamped at write time). */
type IDeiDoc = Omit<import("../../shared/models/dei_company").IDeiCompany, "loadedAt">;

main().catch((e) => {
  console.error("❌ load-dei failed:", e);
  process.exit(1);
});
