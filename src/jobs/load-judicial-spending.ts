#!/usr/bin/env tsx
/**
 * Gasto del Estado por causa judicial — loader.
 *
 * Lee «Crédito presupuestal a partir de 2011» (OPP) y guarda las filas cuyo objeto del gasto tiene
 * causa judicial en `judicial_spending`, más la cobertura medida de cada año en
 * `judicial_spending_years`.
 *
 * POR QUÉ EL DATASTORE DE CKAN Y NO EL PORTAL DE OPP. `transparenciapresupuestaria.opp.gub.uy`
 * devuelve 403 a todo cliente que no sea un navegador, incluidos los CSV, desde cualquier IP que
 * probamos (dev y el servidor de producción). El datastore de catalogodatos.gub.uy sirve la misma
 * tabla, con SQL y sin WAF. Los `resource_id` se resuelven en cada corrida con `package_show`:
 * hardcodearlos rompe callado el día que OPP republica.
 *
 * TRES ESQUEMAS PARA LA MISMA TABLA. 2011-2019 trae columnas en mayúscula y montos numéricos; 2020
 * trae las mismas columnas con montos de texto («1431696,00»); 2021 renombra todo a minúscula
 * (`año`, `odgyaux_codigo`, `credito`). El normalizador acepta las tres. Un año con columnas que no
 * reconoce ABORTA — nunca escribe cero filas en silencio.
 *
 * LA COBERTURA ES PARTE DEL DATO. 2019, 2020 y 2021 publican el ejecutado en cero para todas sus
 * filas; 2013-2015 y 2017-2018 son fragmentos del presupuesto. El loader mide filas, organismos y
 * totales del archivo COMPLETO, no sólo de las judiciales, y los guarda al lado. La página los
 * muestra.
 *
 * Uso:
 *   npx tsx src/jobs/load-judicial-spending.ts
 *   npx tsx src/jobs/load-judicial-spending.ts --dry-run
 *   npx tsx src/jobs/load-judicial-spending.ts --year=2016
 */
import axios from "axios";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ExchangeRateModel, JudicialSpendingModel, JudicialSpendingYearModel } from "../../shared/models";
import { JUDICIAL_OBJECT_CODES, classifyJudicialObject } from "../../shared/judicial-objects";

const CKAN = "https://catalogodatos.gub.uy/api/3/action";
const PACKAGE_ID = "opp-credito-presupuestal-detallado-a-partir-de-2011";
const DATASET_URL = `https://catalogodatos.gub.uy/dataset/${PACKAGE_ID}`;
const UA = "gastos-gub judicial-spending loader (+https://github.com/eduair94)";

interface Options {
  dryRun: boolean;
  year: number | null;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, year: null };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--year=")) {
      const y = Number(arg.slice("--year=".length));
      if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error(`Bad --year: ${arg}`);
      options.year = y;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

/**
 * Percent-encoding estricto: también escapa `!'()*`, que `encodeURIComponent` deja pasar.
 *
 * El WAF de AGESIC cuenta los paréntesis y asteriscos crudos de una query string como firma de
 * inyección SQL. Con ellos escapados, la misma consulta pasa.
 */
function strictEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Una llamada a la API de acciones de CKAN.
 *
 * `validateStatus` deja pasar el 409 con el que CKAN responde una consulta inválida: el cuerpo trae
 * el error de Postgres, y descartarlo convierte cada error de SQL en un 409 mudo. El WAF contesta
 * 200 con una página HTML, así que un cuerpo que no es JSON se reporta como bloqueo, no como éxito.
 */
async function ckan<T>(action: string, params: Record<string, string>): Promise<T> {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${strictEncode(v)}`)
    .join("&");
  const { data } = await axios.get<{ success: boolean; result: T; error?: unknown } | string>(
    `${CKAN}/${action}?${qs}`,
    { timeout: 180000, headers: { "User-Agent": UA }, validateStatus: (s) => s < 500 }
  );
  if (typeof data === "string" || !data || typeof data !== "object") {
    const blocked = typeof data === "string" && data.includes("Error de seguridad");
    throw new Error(`CKAN ${action}: ${blocked ? "bloqueado por el WAF de AGESIC" : "respuesta no-JSON"}`);
  }
  if (!data.success) {
    const detail = JSON.stringify(data.error ?? data).slice(0, 300);
    throw new Error(`CKAN ${action} failed: ${detail}`);
  }
  return data.result;
}

/** Las columnas que nos importan, por año. Los tres esquemas se resuelven acá y en ningún otro lado. */
interface ColumnMap {
  code: string;
  name: string;
  org: string;
  orgId: string;
  ue: string;
  ueId: string;
  vigente: string;
  ejecutado: string;
}

const UPPER: ColumnMap = {
  code: "ODGYAUX_ID",
  name: "ODGYAUX_NOMBRE",
  org: "ORG_NOMBRE",
  orgId: "ORG_ID",
  ue: "UE_NOMBRE",
  ueId: "UE_ID",
  vigente: "MONTO_VIGENTE",
  ejecutado: "MONTO_EJECUTADO",
};

const LOWER: ColumnMap = {
  code: "odgyaux_codigo",
  name: "odgyaux_nombre",
  org: "organismo_nombre",
  orgId: "organismo_codigo",
  ue: "ue_nombre",
  ueId: "ue_codigo",
  vigente: "credito",
  ejecutado: "ejecutado",
};

function pickColumns(fields: string[]): ColumnMap {
  const set = new Set(fields);
  if (set.has(UPPER.code) && set.has(UPPER.vigente)) return UPPER;
  if (set.has(LOWER.code) && set.has(LOWER.vigente)) return LOWER;
  throw new Error(`Unrecognised OPP schema. Columns: ${fields.join(", ")}`);
}

/**
 * SQL que devuelve un monto como número, venga numérico o como texto uruguayo.
 *
 * `"1431696,00"` → `1431696.00`, `",00"` → `0`. Un valor ya numérico pasa por `::text` sin coma y
 * el `replace` no lo toca. `SUM` ignora los NULL; la celda vacía no aparece en ningún año (probado
 * sobre los once recursos), y si apareciera el error de cast sería ruidoso, no silencioso.
 *
 * NO AGREGAR `NULLIF`, `COALESCE(…, 0)` NI `CASE WHEN`. El WAF de AGESIC bloquea la consulta
 * entera —devuelve una página HTML con 200— en cuanto ve un literal de cadena vacía o un `CASE`.
 * Esta forma es la más defensiva que pasa.
 */
function amountExpr(column: string): string {
  return `replace("${column}"::text, ',', '.')::numeric`;
}

async function sql<T>(query: string): Promise<T[]> {
  const result = await ckan<{ records: T[] }>("datastore_search_sql", { sql: query });
  return result.records;
}

/** Promedio de la UI del año, para que la API pueda deflactar a pesos de hoy al leer. */
async function uiAverages(): Promise<Map<number, number>> {
  const rows = await ExchangeRateModel.find({ ui: { $gt: 0 } }, { month: 1, ui: 1 }).lean();
  const byYear = new Map<number, { sum: number; n: number }>();
  for (const r of rows as Array<{ month: string; ui: number }>) {
    const year = Number(r.month.slice(0, 4));
    if (!Number.isInteger(year)) continue;
    const acc = byYear.get(year) ?? { sum: 0, n: 0 };
    acc.sum += r.ui;
    acc.n += 1;
    byYear.set(year, acc);
  }
  const out = new Map<number, number>();
  for (const [year, acc] of byYear) out.set(year, acc.sum / acc.n);
  return out;
}

interface RawJudicialRow {
  code: unknown;
  name: string | null;
  org: string | null;
  org_id: unknown;
  ue: string | null;
  ue_id: unknown;
  vigente: string | number;
  ejecutado: string | number;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function intOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : null;
}

async function loadYear(
  year: number,
  resourceId: string,
  uiByYear: Map<number, number>,
  options: Options
): Promise<void> {
  const probe = await ckan<{ fields: Array<{ id: string }> }>("datastore_search", {
    resource_id: resourceId,
    limit: "1",
  });
  const col = pickColumns(probe.fields.map((f) => f.id));

  // Cobertura del archivo COMPLETO. Sin esto, un año fragmentario parece una caída del gasto.
  // `rows` es palabra reservada en Postgres: el alias tiene que ser otro o la consulta no parsea.
  const [file] = await sql<{ n_rows: string; n_orgs: string; vigente: string; ejecutado: string }>(
    `SELECT COUNT(*) AS n_rows, COUNT(DISTINCT "${col.org}") AS n_orgs,
            SUM(${amountExpr(col.vigente)}) AS vigente,
            SUM(${amountExpr(col.ejecutado)}) AS ejecutado
     FROM "${resourceId}"`
  );
  if (!file) throw new Error(`${year}: coverage query returned nothing`);

  const codes = JUDICIAL_OBJECT_CODES.join(", ");
  const raw = await sql<RawJudicialRow>(
    `SELECT "${col.code}" AS code, "${col.name}" AS name,
            "${col.org}" AS org, "${col.orgId}" AS org_id,
            "${col.ue}" AS ue, "${col.ueId}" AS ue_id,
            ${amountExpr(col.vigente)} AS vigente,
            ${amountExpr(col.ejecutado)} AS ejecutado
     FROM "${resourceId}"
     WHERE "${col.code}" IN (${codes})`
  );

  // Una combinación (año, organismo, unidad ejecutora, objeto) puede venir abierta por financiación
  // y programa. Se suma; `sourceRows` guarda cuántas eran.
  const grouped = new Map<
    string,
    {
      doc: Record<string, unknown>;
      names: Set<string>;
    }
  >();

  for (const row of raw) {
    const object = classifyJudicialObject(row.code);
    // El WHERE ya filtró por código; si el clasificador dice que no, es que el código cambió de
    // forma y hay que verlo, no ignorarlo.
    if (!object) {
      console.warn(`[judicial] ${year}: código ${String(row.code)} pasó el filtro y no clasifica — se omite`);
      continue;
    }
    const orgCode = intOrNull(row.org_id);
    const ueCode = intOrNull(row.ue_id);
    const organismo = (row.org ?? "").trim() || "Sin organismo";
    const unidadEjecutora = (row.ue ?? "").trim() || organismo;
    const rowKey = `${year}|${orgCode ?? "x"}|${ueCode ?? "x"}|${object.code}`;

    const entry = grouped.get(rowKey) ?? {
      doc: {
        rowKey,
        year,
        organismoCodigo: orgCode,
        organismo,
        ueCodigo: ueCode,
        unidadEjecutora,
        objectCode: object.code,
        objectLabel: object.label,
        category: object.category,
        judicial: object.judicial,
        creditoVigente: 0,
        ejecutado: 0,
        sourceRows: 0,
      },
      names: new Set<string>(),
    };
    entry.doc.creditoVigente = (entry.doc.creditoVigente as number) + num(row.vigente);
    entry.doc.ejecutado = (entry.doc.ejecutado as number) + num(row.ejecutado);
    entry.doc.sourceRows = (entry.doc.sourceRows as number) + 1;
    if (row.name) entry.names.add(row.name.trim());
    grouped.set(rowKey, entry);
  }

  const loadedAt = new Date();
  const docs = [...grouped.values()].map((e) => ({
    ...e.doc,
    objectNames: [...e.names].sort(),
    loadedAt,
  }));

  const judicialDocs = docs.filter((d) => d.judicial === true);
  const indemDocs = docs.filter((d) => d.judicial === false);
  const sum = (list: typeof docs, field: "creditoVigente" | "ejecutado"): number =>
    list.reduce((acc, d) => acc + (d[field] as number), 0);

  // La igualdad vigente == ejecutado es lo que sostiene titular con el crédito vigente. Se mide, no
  // se asume: si un año deja de cumplirla, la página lo muestra.
  const withExecution = judicialDocs.filter((d) => (d.ejecutado as number) > 0);
  const fullySpent = withExecution.filter(
    (d) => Math.abs((d.ejecutado as number) - (d.creditoVigente as number)) < 1
  );

  const yearDoc = {
    year,
    fileRows: num(file.n_rows),
    fileOrganismos: num(file.n_orgs),
    fileVigente: num(file.vigente),
    fileEjecutado: num(file.ejecutado),
    executionAvailable: num(file.ejecutado) > 0,
    judicialRows: judicialDocs.length,
    judicialVigente: sum(judicialDocs, "creditoVigente"),
    judicialEjecutado: sum(judicialDocs, "ejecutado"),
    indemnizacionVigente: sum(indemDocs, "creditoVigente"),
    indemnizacionEjecutado: sum(indemDocs, "ejecutado"),
    fullySpentRows: fullySpent.length,
    rowsWithExecution: withExecution.length,
    uiYearAvg: uiByYear.get(year) ?? null,
    resourceId,
    sourceUrl: DATASET_URL,
    loadedAt,
  };

  console.log(
    `[judicial] ${year}: archivo ${yearDoc.fileRows} filas / ${yearDoc.fileOrganismos} organismos` +
      ` · ejecución ${yearDoc.executionAvailable ? "sí" : "NO"}` +
      ` · judiciales ${judicialDocs.length} (vigente ${Math.round(yearDoc.judicialVigente).toLocaleString("es-UY")})` +
      ` · indemnizaciones ${indemDocs.length}` +
      ` · gastadas enteras ${fullySpent.length}/${withExecution.length}`
  );

  if (options.dryRun) return;

  if (docs.length) {
    await JudicialSpendingModel.bulkWrite(
      docs.map((doc) => ({
        replaceOne: { filter: { rowKey: doc.rowKey }, replacement: doc, upsert: true },
      })) as never,
      { ordered: false }
    );
    // Barrido acotado al año y sólo con filas calculadas en la mano. Un año que devuelve cero filas
    // no borra nada: sería el síntoma de que el recurso cambió, no de que el gasto desapareció.
    await JudicialSpendingModel.deleteMany({
      $and: [{ year }, { rowKey: { $nin: docs.map((d) => d.rowKey) } }],
    });
  } else {
    console.warn(`[judicial] ${year}: 0 filas judiciales — no se barre el año`);
  }

  await JudicialSpendingYearModel.replaceOne({ year }, yearDoc, { upsert: true });
}

async function run(options: Options): Promise<void> {
  const started = Date.now();

  const pkg = await ckan<{ resources: Array<{ id: string; name: string; format: string }> }>(
    "package_show",
    { id: PACKAGE_ID }
  );

  // «Créditos 2016» → 2016. El resumen y la nota metodológica no traen objeto del gasto y quedan
  // afuera por no matchear.
  const byYear = new Map<number, string>();
  for (const res of pkg.resources) {
    const m = /^Cr[ée]ditos\s+(\d{4})$/i.exec(res.name.trim());
    if (m && m[1]) byYear.set(Number(m[1]), res.id);
  }
  if (byYear.size === 0) {
    throw new Error("No yearly resources matched «Créditos YYYY» — the OPP dataset was reshaped");
  }

  const years = [...byYear.keys()].sort((a, b) => a - b).filter((y) => !options.year || y === options.year);
  if (years.length === 0) throw new Error(`No resource for --year=${options.year}`);
  console.log(`[judicial] ${years.length} años: ${years.join(", ")}`);

  if (!options.dryRun) await connectToDatabase();
  const uiByYear = options.dryRun ? new Map<number, number>() : await uiAverages();

  for (const year of years) {
    await loadYear(year, byYear.get(year)!, uiByYear, options);
  }

  if (!options.dryRun) {
    const total = await JudicialSpendingModel.estimatedDocumentCount();
    console.log(`[judicial] judicial_spending guarda ${total} filas`);
  }
  console.log(`[judicial] listo en ${((Date.now() - started) / 1000).toFixed(1)}s`);
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
      console.error("[judicial] failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}

export { run as loadJudicialSpending, parseArgs, pickColumns, amountExpr };
