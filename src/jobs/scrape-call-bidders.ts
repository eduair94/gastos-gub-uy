#!/usr/bin/env tsx
/**
 * Quiénes se presentaron — leído de la ficha HTML de cada compra adjudicada.
 *
 * El feed OCDS no trae oferentes (`tender.tenderers` 0%), y el acta en PDF los enumera
 * en ~8% de los casos. Pero la ficha de una compra ADJUDICADA publica el bloque
 * "Proveedores participantes" con tipo, documento, nombre y RUT: medido el 2026-08-12
 * sobre 30 adjudicaciones de 2008, 2013, 2018, 2022 y 2025, las 30 lo traen. Con esa
 * cobertura el indicador de oferente único deja de ser indefendible.
 *
 * CUIDAR LA FUENTE. Es el mismo host que sondean el pliego y la reiteración, y una
 * sesión anterior lo throttleó por grindear. Serial, con delay, y RESUMIBLE: toda compra
 * sondeada queda guardada (también las que no publican bloque) para no volver a bajarla.
 * Antes de correr esto en el 167, revisar que no haya ya un loop andando.
 *
 * PRIORIDAD, porque el corpus no se scrapea entero. Hay ~1,1M de compras: a 900ms son
 * semanas de tráfico contra un sitio del Estado. Por eso el orden por defecto es
 * competitivas primero y más nuevas primero — donde "quién compitió" es la pregunta —
 * y el resto se llena de a tandas por cron. La consecuencia es que la cobertura es
 * PARCIAL y desigual, y por eso el indicador por organismo tiene que publicar su propia
 * cobertura al lado (misma trampa ya documentada con el % de compra directa).
 *
 * Uso:
 *   npx tsx src/jobs/scrape-call-bidders.ts --limit=200
 *   npx tsx src/jobs/scrape-call-bidders.ts --limit=50 --dry-run
 *   npx tsx src/jobs/scrape-call-bidders.ts --year=2025 --limit=500
 *   npx tsx src/jobs/scrape-call-bidders.ts --all-methods --limit=300
 *   npx tsx src/jobs/scrape-call-bidders.ts --ocid=ocds-yfs5dr-1290419 --force
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { CallBiddersModel, ReleaseModel } from "../../shared/models";
import { parseCallBidders } from "../../shared/call-bidders";

const UA = "gastos-gub bidder reader (+https://github.com/eduair94/gastos-gub-uy)";
const DELAY_MS = 900;
const DEFAULT_LIMIT = 200;
const FETCH_TIMEOUT_MS = 45_000;

/** En una Compra Directa no hay a qué competir, así que ahí el bloque no responde una pregunta. */
const COMPETITIVE = ["Licitación Abreviada", "Licitación Pública", "Concurso de Precios"];

interface Options {
  limit: number;
  dryRun: boolean;
  ocid: string | null;
  force: boolean;
  year: number | null;
  allMethods: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { limit: DEFAULT_LIMIT, dryRun: false, ocid: null, force: false, year: null, allMethods: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--all-methods") options.allMethods = true;
    else if (arg.startsWith("--limit=")) {
      const limit = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20000) throw new Error(`Invalid --limit: ${arg}`);
      options.limit = limit;
    } else if (arg.startsWith("--year=")) {
      const year = Number.parseInt(arg.slice("--year=".length), 10);
      if (!Number.isInteger(year) || year < 2002 || year > 2100) throw new Error(`Invalid --year: ${arg}`);
      options.year = year;
    } else if (arg.startsWith("--ocid=")) options.ocid = arg.slice("--ocid=".length).trim() || null;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

/** El id_compra es el ocid sin su cabeza `ocds-<prefijo>-`. Hay tails con guion, así que
 *  no alcanza con `.pop()`. */
const compraIdFromOcid = (ocid: string): string => ocid.split("-").slice(2).join("-");
const detailUrl = (compraId: string): string => `https://www.comprasestatales.gub.uy/consultas/detalle/id/${compraId}`;

async function fetchDetail(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal, redirect: "follow" });
    if (!res.ok) return null;
    // La página se sirve UTF-8 (verificado: "Genérico" viaja como C3 A9).
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function run(options: Options): Promise<void> {
  const started = Date.now();
  // La agregación de candidatos recorre `releases`; el default de 45s la mata a mitad.
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) process.env.MONGO_SOCKET_TIMEOUT_MS = String(30 * 60 * 1000);
  await connectToDatabase();

  // TRAMPA del corpus: un release de adjudicación NO tiene objeto `tender` (0%), así que
  // `{tag:"award"}` y `{"tender.procurementMethodDetails":…}` juntos no matchean NADA. El
  // método sólo vive en el release de fase pliego, hermano por ocid. Por eso, para filtrar
  // por método hay que arrancar del pliego y exigir después que exista la adjudicación;
  // y con --all-methods se arranca de la adjudicación, sin filtro de método.
  const and: Record<string, unknown>[] = [{ ocid: { $type: "string", $ne: "" } }];
  const fromTenderPhase = !options.allMethods && !options.ocid;
  if (options.ocid) {
    and.push({ ocid: options.ocid });
  } else {
    if (fromTenderPhase) and.push({ "tender.procurementMethodDetails": { $in: COMPETITIVE } });
    else and.push({ tag: "award" });
    if (options.year) and.push({ sourceYear: options.year });
  }

  // Más nuevas primero: son las que a alguien le sirven hoy y las que más se consultan.
  const candidates: Array<{ _id: string; date: Date | null; buyerId: string | null; buyerName: string | null; sourceYear: number | null }> =
    await ReleaseModel.aggregate(
      [
        { $match: { $and: and } },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: "$ocid",
            date: { $first: "$date" },
            buyerId: { $first: "$buyer.id" },
            buyerName: { $first: "$buyer.name" },
            sourceYear: { $first: "$sourceYear" },
          },
        },
        // Arrancando del pliego hay que exigir que la compra esté ADJUDICADA: el bloque de
        // participantes recién se publica ahí. Una compra abierta devuelve la ficha sin
        // bloque, y sondearla sólo gasta la paciencia del sitio.
        ...(fromTenderPhase
          ? [
              {
                $lookup: {
                  from: "releases",
                  let: { o: "$_id" },
                  pipeline: [{ $match: { $expr: { $eq: ["$ocid", "$$o"] } } }, { $match: { tag: "award" } }, { $limit: 1 }, { $project: { _id: 1 } }],
                  as: "aw",
                },
              },
              { $match: { "aw.0": { $exists: true } } },
            ]
          : []),
        ...(options.force
          ? []
          : [
              { $lookup: { from: "call_bidders", localField: "_id", foreignField: "ocid", as: "seen" } },
              { $match: { "seen.0": { $exists: false } } },
            ]),
        { $sort: { date: -1 } },
        { $limit: options.limit },
        { $project: { _id: 1, date: 1, buyerId: 1, buyerName: 1, sourceYear: 1 } },
      ],
      { allowDiskUse: true }
    );

  console.log(`[call-bidders] ${candidates.length} compras a sondear (limit ${options.limit}${options.allMethods ? ", todos los métodos" : ", competitivas"})`);

  let fetched = 0;
  let missing = 0;
  let withBidders = 0;
  let sole = 0;
  let totalBidders = 0;

  for (const row of candidates) {
    const ocid = row._id;
    const compraId = compraIdFromOcid(ocid);
    if (!compraId) continue;
    const url = detailUrl(compraId);

    const html = await fetchDetail(url);
    await new Promise((r) => setTimeout(r, DELAY_MS));

    if (html === null) {
      missing++;
      continue;
    }
    fetched++;

    const parsed = parseCallBidders(html);
    if (parsed.found) {
      withBidders++;
      totalBidders += parsed.bidders.length;
      if (parsed.bidders.length === 1) sole++;
    }

    if (options.dryRun) {
      console.log(`  ${compraId} → ${parsed.found ? `${parsed.bidders.length} oferentes` : "sin bloque"}${parsed.found ? ` · ${parsed.bidders.map((b) => b.name).join(" | ").slice(0, 110)}` : ""}`);
      continue;
    }

    await CallBiddersModel.updateOne(
      { ocid },
      {
        $set: {
          ocid,
          compraId,
          sourceUrl: url,
          probedAt: new Date(),
          found: parsed.found,
          // Null y no 0 cuando no publicó: cero oferentes sería un hecho, y esto es su ausencia.
          count: parsed.found ? parsed.bidders.length : null,
          bidders: parsed.bidders,
          sourceYear: row.sourceYear ?? (row.date ? new Date(row.date).getUTCFullYear() : null),
          buyerId: row.buyerId ?? null,
          buyerName: row.buyerName ?? null,
        },
      },
      { upsert: true }
    );
  }

  const secs = Math.round((Date.now() - started) / 1000);
  console.log(
    `[call-bidders] listo en ${secs}s · bajadas ${fetched} · sin ficha ${missing} · con oferentes ${withBidders}` +
      (withBidders ? ` (${Math.round((withBidders / Math.max(fetched, 1)) * 100)}% de las bajadas)` : "") +
      ` · promedio ${withBidders ? (totalBidders / withBidders).toFixed(1) : 0} · oferente único ${sole}`
  );
  if (options.dryRun) console.log("[call-bidders] --dry-run: no se escribió nada");
}

run(parseArgs(process.argv.slice(2)))
  .catch((error) => {
    console.error("[call-bidders] falló:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
