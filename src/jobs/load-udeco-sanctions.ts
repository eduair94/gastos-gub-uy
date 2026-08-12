#!/usr/bin/env tsx
/**
 * Sanctions applied to companies by the Unidad de Defensa del Consumidor (UDECO, MEF).
 *
 * Downloads UDECO's published roster of consumer-protection sanctions (apercibimientos, multas,
 * instrucciones; 2017-2024) and upserts it into `udeco_sanctions`, so the site can say — beside a
 * supplier's public contracts — that the State's own consumer agency has fined it.
 *
 * WHAT THIS IS NOT. A sanction here concerns the firm's conduct toward CONSUMERS. It is not a
 * finding about any public contract and does not make one irregular. The pages carrying it must say
 * so; see shared/models/udeco_sanction.ts.
 *
 * THREE SOURCE QUIRKS, all measured, none guessable:
 *   - The file is SEMICOLON-delimited, not comma.
 *   - It is LATIN-1, despite the .csv served over UTF-8 headers. Decoding it as UTF-8 turns
 *     "Publicidad engañosa" into "Publicidad enga?osa" and "Instrucción" into "Instrucci?n".
 *   - `rut` is padded with trailing spaces. 1,527 of 1,528 rows carry a full 12-digit RUT; the one
 *     that does not is dropped, because a partial RUT cannot be joined safely.
 *
 * UPSERT, NEVER SWEEP: UDECO republishes cumulatively and a row disappearing between editions is
 * their correction, not ours to mirror by deleting a sanction record.
 *
 * Usage:
 *   npx tsx src/jobs/load-udeco-sanctions.ts
 *   npx tsx src/jobs/load-udeco-sanctions.ts --dry-run
 *   npx tsx src/jobs/load-udeco-sanctions.ts --file=sanciones.csv
 */
import axios from "axios";
import * as fs from "fs";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { UdecoSanctionModel } from "../../shared/models";
import { parseCsvRecords } from "../../shared/utils/csv";

const CKAN_PACKAGE = "https://catalogodatos.gub.uy/api/3/action/package_show?id=defensa-del-consumidor-sanciones-a-empresas";
const FALLBACK_URL =
  "https://catalogodatos.gub.uy/dataset/85e54885-c53d-45b5-893c-02471cb0f44d/resource/fcdb2d2b-eecb-44c1-a079-92b79c2fefcb/download/datos_sanciones_2017_2024.csv";
const UA = "gastos-gub udeco loader (+https://github.com/eduair94)";
const BULK_BATCH = 500;
/** A Uruguayan RUT. Anything shorter is a cédula or a truncated value and is not joinable. */
const RUT_DIGITS = 12;

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

const clean = (v: string | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

/** `d/m/yyyy` as published → a UTC date, or null. */
function parseDate(value: string | undefined): Date | null {
  const m = (value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Resolve the CSV from CKAN so a moved resource fails loudly rather than silently. */
async function resolveUrl(): Promise<string> {
  try {
    const { data } = await axios.get(CKAN_PACKAGE, { timeout: 30000, headers: { "User-Agent": UA } });
    const csv = (data?.result?.resources ?? []).find((r: any) => (r?.format ?? "").toUpperCase() === "CSV");
    if (csv?.url) return csv.url as string;
  } catch {
    /* fall through to the well-known URL */
  }
  return FALLBACK_URL;
}

async function run(options: Options): Promise<void> {
  const started = Date.now();
  let buf: Buffer;
  if (options.file) {
    buf = fs.readFileSync(options.file);
  } else {
    const url = await resolveUrl();
    console.log(`[udeco] ${url}`);
    const res = await axios.get<ArrayBuffer>(url, {
      timeout: 120000,
      responseType: "arraybuffer",
      headers: { "User-Agent": UA },
    });
    buf = Buffer.from(res.data);
  }

  // LATIN-1, semicolon-delimited. Both are load-bearing; see the module docblock.
  const text = new TextDecoder("latin1").decode(buf);
  const records = parseCsvRecords(text, ";");
  console.log(`[udeco] parsed ${records.length} rows`);
  if (records.length === 0) {
    throw new Error("UDECO CSV parsed to 0 rows — refusing to proceed (resource moved or reshaped?)");
  }

  const loadedAt = new Date();
  const sourceUrl = options.file ? `file://${options.file}` : await resolveUrl();
  const docs: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let droppedRut = 0;

  for (const row of records) {
    const rut = (row.rut ?? "").replace(/\D/g, "");
    if (rut.length !== RUT_DIGITS) {
      droppedRut++;
      continue;
    }
    const fecha = (row.fecha_resolucion ?? "").trim();
    const motivo = clean(row.motivo_sancion);
    const key = `${rut}|${fecha}|${motivo ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    docs.push({
      sanctionKey: key,
      rut,
      razonSocial: clean(row.razon_social) ?? rut,
      nombreComercial: clean(row.nombre_comercial),
      departamento: clean(row.departamento),
      fechaResolucion: parseDate(fecha),
      motivo,
      tipo: clean(row.tipo_sancion),
      montoUr: Number(String(row.monto_ur ?? "0").replace(",", ".")) || 0,
      sourceUrl,
      loadedAt,
    });
  }

  const firms = new Set(docs.map((d) => d.rut)).size;
  const multas = docs.filter((d) => (d.montoUr as number) > 0).length;
  console.log(`[udeco] ${docs.length} sanciones únicas · ${firms} empresas · ${multas} con multa > 0 UR · ${droppedRut} filas sin RUT de ${RUT_DIGITS} dígitos`);

  if (options.dryRun) {
    console.log("[udeco] 🧪 --dry-run: no writes performed.");
    return;
  }

  await connectToDatabase();
  let written = 0;
  for (let i = 0; i < docs.length; i += BULK_BATCH) {
    const ops = docs.slice(i, i + BULK_BATCH).map((doc) => ({
      replaceOne: { filter: { sanctionKey: doc.sanctionKey }, replacement: doc, upsert: true },
    }));
    const result = await UdecoSanctionModel.bulkWrite(ops as never, { ordered: false });
    written += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
  }
  console.log(`[udeco] upserted/updated ${written}; collection holds ${await UdecoSanctionModel.estimatedDocumentCount()}`);
  console.log(`[udeco] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
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
      console.error("[udeco] failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}

export { run as loadUdecoSanctions, parseArgs };
