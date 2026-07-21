#!/usr/bin/env tsx

/**
 * Load ARCE's Registro Único de Proveedores del Estado (RUPE) into
 * `rupe_registry`.
 *
 * RUPE is Uruguay open data (updated monthly): every provider registered to sell
 * to the state, with RUT, legal name, fiscal address, locality, department and
 * registry status. Source dataset:
 *   https://catalogodatos.gub.uy/dataset/arce-registro-unico-de-proveedores-del-estado-rupe-2026
 *
 * The join key is RUT. Every supplier_patterns doc is keyed by a RUT-based
 * `supplierId` (`R/210002980010`), so `digits(supplierId)` equals the RUPE RUT —
 * an exact, false-positive-free match (measured 2026-07-20: 39,020/42,530 = 91.7%).
 * This job only loads the registry; geocoding is a separate pass (geocode-rupe.ts)
 * and the RUT/name join happens at enrichment time (enrich/resolvers/rupe.ts).
 *
 * IDEMPOTENT + geocode-preserving: it upserts by RUT via a pipeline update that
 * only writes the RUPE *source* fields and NEVER clobbers the geocode block
 * (lat/lng/placeId/…). Coordinates are reset to `pending` for re-geocoding ONLY
 * when the composed address actually changed since it was last geocoded.
 *
 * The dataset ships one CSV per month; when several are present we keep the
 * LATEST month's row per RUT (freshest estado + address).
 *
 * Usage:
 *   npx tsx src/jobs/load-rupe.ts                 # download every monthly CSV + load
 *   npx tsx src/jobs/load-rupe.ts --dir=rupe      # load already-downloaded CSVs from a folder
 *   npx tsx src/jobs/load-rupe.ts --file=x.csv    # load a single local CSV
 *   npx tsx src/jobs/load-rupe.ts --dry-run       # parse + report, write nothing
 */

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { RupeRegistryModel } from "../../shared/models/rupe_registry";
import { normalizeText } from "../../shared/utils/text";
import { rupeGeocodeQuery } from "./enrich/rupe-address";

// Dataset id cbe2defd-…; the 6 monthly resources published for 2026. Add new
// months here (or drop a fresh CSV in --dir) as ARCE publishes them.
const DATASET = "cbe2defd-d214-4e5b-9b52-424f3688b2cf";
const MONTHLY_RESOURCES: Array<{ month: string; resource: string; file: string }> = [
  { month: "2026-01", resource: "7ff5648a-ffff-46c8-b326-57bf9cdacd38", file: "rupe-enero-2026.csv" },
  { month: "2026-02", resource: "bc290bde-a323-41cf-bc17-230efc478468", file: "rupe-febrero-2026.csv" },
  { month: "2026-03", resource: "b4d4d538-2b58-42e7-a832-47162923bd33", file: "rupe-marzo-2026.csv" },
  { month: "2026-04", resource: "723038a8-90c8-47c0-ab53-d441dd553ba9", file: "rupe-abril-2026.csv" },
  { month: "2026-05", resource: "fcc0835a-f217-4efe-bec6-194bb141360c", file: "rupe-mayo-2026.csv" },
  { month: "2026-06", resource: "ecfa313e-4f2f-46a3-98a4-ea01922e6ce5", file: "rupe-junio-2026.csv" },
];
const resourceUrl = (r: { resource: string; file: string }) =>
  `https://catalogodatos.gub.uy/dataset/${DATASET}/resource/${r.resource}/download/${r.file}`;

// Spanish month name (as it appears in the filename) → 2-digit month.
const MONTHS: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
};

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** RFC4180-ish parser with a configurable delimiter (RUPE uses ';'). */
function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
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
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\r") { /* handled by \n */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const digits = (s: string): string => (s || "").replace(/\D/g, "");

/** Trim; treat empty or the "Sin dato" sentinel as null. */
function sd(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t || t.toLowerCase() === "sin dato") return null;
  return t;
}

/** `YYYY-MM` from a `rupe-<mes>-YYYY.csv` filename, else "" (sorts last). */
function monthFromFilename(file: string): string {
  const m = file.toLowerCase().match(/rupe-([a-zé]+)-(\d{4})/);
  if (!m) return "";
  const mm = MONTHS[m[1]];
  return mm ? `${m[2]}-${mm}` : "";
}

interface RupeRow {
  rut: string;
  pais: string;
  denominacionSocial: string;
  normalizedName: string;
  domicilioFiscal: string | null;
  localidad: string | null;
  departamento: string | null;
  estado: string;
  sourceMonth: string;
}

/** Parse one CSV's rows into RupeRow[], mapping by header name. */
function parseFile(text: string, sourceMonth: string): RupeRow[] {
  const rows = parseCsv(text, ";");
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = new Map(header.map((h, i) => [h, i] as const));
  const col = (row: string[], h: string): string => {
    const i = idx.get(h);
    return i === undefined ? "" : (row[i] ?? "");
  };
  const required = ["identificacion_prov", "denominacion_social_prov", "estado_prov"];
  for (const r of required) {
    if (!idx.has(r)) throw new Error(`CSV missing expected column "${r}". Header: ${header.join(" | ")}`);
  }

  const out: RupeRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.length || (row.length === 1 && row[0].trim() === "")) continue;
    const rut = digits(col(row, "identificacion_prov"));
    if (rut.length < 8) continue;
    const denominacionSocial = (sd(col(row, "denominacion_social_prov")) ?? "");
    out.push({
      rut,
      pais: (sd(col(row, "pais_prov")) ?? ""),
      denominacionSocial,
      normalizedName: normalizeText(denominacionSocial),
      domicilioFiscal: sd(col(row, "domicilio_fiscal")),
      localidad: sd(col(row, "localidad_prov")),
      departamento: sd(col(row, "departamento_prov")),
      estado: (sd(col(row, "estado_prov")) ?? ""),
      sourceMonth,
    });
  }
  return out;
}

async function main() {
  const dryRun = flag("dry-run");
  const dir = arg("dir");
  const file = arg("file");

  // --- Gather (text, month) sources ---
  const sources: Array<{ text: string; month: string; label: string }> = [];
  if (file) {
    console.log(`📄 Reading local CSV: ${file}`);
    sources.push({ text: fs.readFileSync(file, "utf8"), month: monthFromFilename(path.basename(file)), label: file });
  }
  else if (dir) {
    const files = fs.readdirSync(dir).filter((f) => /^rupe-.*\.csv$/i.test(f)).sort();
    if (!files.length) throw new Error(`No rupe-*.csv files in ${dir}`);
    for (const f of files) {
      console.log(`📄 Reading ${f}`);
      sources.push({ text: fs.readFileSync(path.join(dir, f), "utf8"), month: monthFromFilename(f), label: f });
    }
  }
  else {
    for (const r of MONTHLY_RESOURCES) {
      const url = resourceUrl(r);
      console.log(`⬇️  Downloading ${r.file}`);
      const res = await axios.get<string>(url, { responseType: "text", timeout: 120000 });
      sources.push({ text: res.data, month: r.month, label: r.file });
    }
  }

  // --- Parse + dedup by RUT, keeping the LATEST month per RUT ---
  const byRut = new Map<string, RupeRow>();
  let parsedRows = 0;
  for (const s of sources) {
    const month = s.month || "0000-00";
    const rows = parseFile(s.text, month);
    parsedRows += rows.length;
    for (const row of rows) {
      const prev = byRut.get(row.rut);
      if (!prev || row.sourceMonth >= prev.sourceMonth) byRut.set(row.rut, row);
    }
  }
  const docs = [...byRut.values()];
  const active = docs.filter((d) => d.estado.toUpperCase() === "ACTIVO").length;
  const withAddr = docs.filter((d) => rupeGeocodeQuery(d) !== null).length;
  console.log(
    `📊 Parsed ${parsedRows} rows across ${sources.length} file(s) → ${docs.length} unique providers; `
    + `${active} ACTIVO; ${withAddr} with a geocodable address.`,
  );
  if (docs.length) {
    const s = docs[0];
    console.log(`   e.g. ${s.rut} — ${s.denominacionSocial} [${s.estado}] (${s.sourceMonth}) — ${s.domicilioFiscal ?? "(no addr)"}`);
  }

  if (dryRun) {
    console.log("🧪 --dry-run: no writes.");
    return;
  }

  // --- Upsert (pipeline update: preserve the geocode block; re-geocode only on address change) ---
  await connectToDatabase();
  const loadedAt = new Date();
  const ops = docs.map((d) => {
    const query = rupeGeocodeQuery(d); // string | null — what geocode-rupe would send
    return {
      updateOne: {
        filter: { rut: d.rut },
        update: [
          {
            $set: {
              rut: d.rut,
              pais: d.pais,
              denominacionSocial: d.denominacionSocial,
              normalizedName: d.normalizedName,
              domicilioFiscal: d.domicilioFiscal,
              localidad: d.localidad,
              departamento: d.departamento,
              estado: d.estado,
              sourceMonth: d.sourceMonth,
              loadedAt,
              // Preserve any existing geocode block; initialise to null on insert.
              lat: { $ifNull: ["$lat", null] },
              lng: { $ifNull: ["$lng", null] },
              placeId: { $ifNull: ["$placeId", null] },
              geocodeConfidence: { $ifNull: ["$geocodeConfidence", null] },
              geocodedAddress: { $ifNull: ["$geocodedAddress", null] },
              geocodedAt: { $ifNull: ["$geocodedAt", null] },
            },
          },
          {
            $set: {
              // Re-geocode iff the address we'd send differs from what we last
              // geocoded (covers first insert: geocodedAddress is null → pending).
              geocodeStatus: {
                $cond: [
                  { $eq: [{ $ifNull: ["$geocodedAddress", null] }, { $literal: query }] },
                  { $ifNull: ["$geocodeStatus", "pending"] },
                  "pending",
                ],
              },
            },
          },
        ],
        upsert: true,
      },
    };
  });

  const BATCH = 1000;
  let upserted = 0, modified = 0;
  for (let i = 0; i < ops.length; i += BATCH) {
    const res = await RupeRegistryModel.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
    upserted += res.upsertedCount ?? 0;
    modified += res.modifiedCount ?? 0;
    console.log(`   …${Math.min(i + BATCH, ops.length)}/${ops.length}`);
  }
  const total = await RupeRegistryModel.countDocuments({});
  const pending = await RupeRegistryModel.countDocuments({ geocodeStatus: "pending" });
  console.log(`✅ rupe_registry: +${upserted} new, ${modified} updated. Collection now ${total}; ${pending} awaiting geocode.`);

  await disconnectFromDatabase();
}

main().catch((e) => {
  console.error("❌ load-rupe failed:", e);
  process.exit(1);
});
