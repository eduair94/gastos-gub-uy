#!/usr/bin/env tsx
/**
 * Funcionarios declarados omisos (JUTEP) — loader.
 *
 * Downloads the Junta de Transparencia y Ética Pública's published roster of public officials
 * formally declared delinquent in their duty to file the sworn declaration of assets and income
 * (Ley 17.060 arts. 10, 11 and 13) and upserts it into `jutep_omisos`.
 *
 * WHY THIS IS PUBLISHABLE. Art. 18 of Ley 17.060 makes the CONTENT of a declaration confidential;
 * the fact of an omission is the opposite — art. 13 requires it to be published in the Diario
 * Oficial, and JUTEP itself publishes this roster as open data on catalogodatos.gub.uy. Nothing
 * here holds declaration content, assets or income. The cédula is stored because it is in the
 * published file and disambiguates officials who share a name, and it is masked on the way out
 * (see maskDocument).
 *
 * UPSERT, NOT SWAP. JUTEP republishes cumulatively; a row vanishing between editions is a
 * correction on their side, not something to mirror by deleting a person's record on ours. Rows are
 * keyed on (documento, fechaOmisión) and re-run is idempotent.
 *
 * Usage:
 *   npx tsx src/jobs/load-jutep-omisos.ts
 *   npx tsx src/jobs/load-jutep-omisos.ts --dry-run
 *   npx tsx src/jobs/load-jutep-omisos.ts --file=omisos.csv
 */
import axios from "axios";
import * as fs from "fs";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { JutepOmisoModel } from "../../shared/models";
import { resolveIncisoCode } from "../../shared/jutep-incisos";
import { parseCsvRecords } from "../../shared/utils/csv";

/** The CKAN resource JUTEP publishes. Stable id; the dataset page is 83d67528-…. */
const SOURCE_URL =
  "https://catalogodatos.gub.uy/dataset/83d67528-aa57-4d7e-8141-027054d5352e/resource/e8903a2c-b53f-4f5c-9ea5-496e2cf58810/download/funcionarios-declarados-omisos-1.csv";
const UA = "gastos-gub jutep loader (+https://github.com/eduair94)";
const BULK_BATCH = 500;

interface Options {
  dryRun: boolean;
  file: string | null;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, file: null };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--file=")) options.file = arg.slice("--file=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/** `YYYY-MM-DD` as published → a UTC date, or null when unparseable. */
function parseDate(value: string | undefined): Date | null {
  const trimmed = (value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
  const date = new Date(`${trimmed.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function run(options: Options): Promise<void> {
  const started = Date.now();
  const text = options.file
    ? fs.readFileSync(options.file, "utf8")
    : (
        await axios.get<string>(SOURCE_URL, {
          timeout: 120000,
          responseType: "text",
          headers: { "User-Agent": UA },
        })
      ).data;

  const records = parseCsvRecords(text);
  console.log(`[jutep] parsed ${records.length} rows`);
  if (records.length === 0) {
    // An empty parse means the resource moved or changed shape. Writing nothing is right; wiping
    // the collection would not be, which is exactly why this loader never sweeps.
    throw new Error("JUTEP CSV parsed to 0 rows — refusing to proceed (resource moved or reshaped?)");
  }

  const loadedAt = new Date();
  const docs: Array<Record<string, unknown>> = [];
  const unresolved = new Map<string, number>();
  const seen = new Set<string>();

  for (const row of records) {
    const documento = (row["Nro DOCUMENTO"] ?? "").replace(/\D/g, "");
    if (!documento) continue;
    const fechaOmision = parseDate(row["FECHA OMISION"]);
    const omisoKey = `${documento}|${row["FECHA OMISION"] ?? ""}`;
    // The published file does repeat a person/date pair; keep one.
    if (seen.has(omisoKey)) continue;
    seen.add(omisoKey);

    const nombre = clean(row.NOMBRE);
    const apellido = clean(row.APELLIDO);
    const inciso = clean(row.INCISO);
    const incisoCode = resolveIncisoCode(inciso);
    if (inciso && !incisoCode) unresolved.set(inciso, (unresolved.get(inciso) ?? 0) + 1);

    docs.push({
      omisoKey,
      documento,
      nombre,
      apellido,
      displayName: [nombre, apellido].filter(Boolean).join(" ") || documento,
      cargo: clean(row["DENOMINACION DEL CARGO"]),
      fechaOmision,
      organismo: clean(row.ORGANISMO),
      inciso,
      incisoCode,
      sourceUrl: SOURCE_URL,
      loadedAt,
    });
  }

  const resolved = docs.filter((d) => d.incisoCode !== null).length;
  console.log(`[jutep] ${docs.length} unique records; inciso resolved for ${resolved} (${((100 * resolved) / docs.length).toFixed(1)}%)`);
  if (unresolved.size) {
    console.log(`[jutep] unresolved inciso labels (${unresolved.size}) — these bodies are not procurement buyers, or the map needs a row:`);
    for (const [label, n] of [...unresolved].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(n).padStart(4)}  ${label}`);
    }
  }

  if (options.dryRun) {
    console.log("[jutep] 🧪 --dry-run: no writes performed.");
    return;
  }

  await connectToDatabase();
  let upserted = 0;
  for (let i = 0; i < docs.length; i += BULK_BATCH) {
    const ops = docs.slice(i, i + BULK_BATCH).map((doc) => ({
      replaceOne: { filter: { omisoKey: doc.omisoKey }, replacement: doc, upsert: true },
    }));
    const result = await JutepOmisoModel.bulkWrite(ops as never, { ordered: false });
    upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
  }
  const total = await JutepOmisoModel.estimatedDocumentCount();
  console.log(`[jutep] upserted/updated ${upserted}; collection now holds ${total}`);
  console.log(`[jutep] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (require.main === module) {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${(error as Error).message}`);
    process.exit(1);
  }
  run(options)
    .then(async () => {
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("[jutep] failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}

export { run as loadJutepOmisos, parseArgs };
