#!/usr/bin/env tsx
/**
 * Prensa sobre las compras de cada organismo.
 *
 * Cruza el corpus con lo que publicaron los medios: en la ficha de un organismo, sus
 * cifras de gasto quedan al lado de lo que se escribió sobre sus licitaciones. En la
 * medición del 2026-08-13 esto converge de forma útil — la Intendencia de Flores da 48%
 * de oferente único en nuestros datos Y tiene una nota de Montevideo Portal sobre
 * irregularidades halladas por la JUTEP en una licitación suya.
 *
 * SÓLO POR ORGANISMO. La búsqueda por proveedor se midió y se descartó: nombres como
 * MOTOCICLO o DIVINO devuelven choques de motos en Cuba y fiestas religiosas, y los
 * proveedores que de verdad importan no tienen prensa. Ver shared/news-search.ts.
 *
 * Se consulta un feed público de terceros, así que: una consulta por organismo, con
 * delay, los menos frescos primero, y acotado por --limit. No hay razón para pedir dos
 * veces lo mismo la misma noche.
 *
 * Uso:
 *   npx tsx src/jobs/refresh-organism-news.ts --limit=20 --dry-run
 *   npx tsx src/jobs/refresh-organism-news.ts --limit=60
 *   npx tsx src/jobs/refresh-organism-news.ts --buyer=29-1 --force
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { BuyerPatternModel, OrganismNewsModel } from "../../shared/models";
import { filterRelevant, newsRssUrl, organismAliases, parseNewsRss } from "../../shared/news-search";

const UA = "Mozilla/5.0 (compatible; gastos-gub/1.0; +https://github.com/eduair94/gastos-gub-uy)";
const DELAY_MS = 1200;
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 60;
/** Debajo de esto el nombre es demasiado corto para buscarlo sin traer cualquier cosa. */
const MIN_NAME_LENGTH = 6;
/** Se refresca lo que tenga más de esto. La prensa no cambia cada hora. */
const STALE_DAYS = 7;
/** Cuántas notas se guardan por organismo. */
const MAX_ITEMS = 8;

interface Options {
  limit: number;
  dryRun: boolean;
  buyer: string | null;
  force: boolean;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { limit: DEFAULT_LIMIT, dryRun: false, buyer: null, force: false };
  for (const arg of argv) {
    if (arg === "--dry-run") o.dryRun = true;
    else if (arg === "--force") o.force = true;
    else if (arg.startsWith("--buyer=")) o.buyer = arg.slice("--buyer=".length).trim() || null;
    else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isInteger(n) || n < 1 || n > 2000) throw new Error(`Invalid --limit: ${arg}`);
      o.limit = n;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return o;
}

async function fetchFeed(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal, redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function run(options: Options): Promise<void> {
  const started = Date.now();
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) process.env.MONGO_SOCKET_TIMEOUT_MS = String(20 * 60 * 1000);
  await connectToDatabase();

  // Los organismos que más gastan primero: son los que la prensa cubre y los que más
  // se consultan. `buyer_patterns` ya tiene el ranking calculado.
  const buyerFilter: Record<string, unknown> = { name: { $type: "string" } };
  if (options.buyer) buyerFilter.buyerId = options.buyer;

  const buyers = await BuyerPatternModel.find(buyerFilter, { _id: 0, buyerId: 1, name: 1, totalValue: 1 })
    .sort({ totalValue: -1 })
    .limit(options.buyer ? 1 : 600)
    .lean();

  const staleBefore = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const seen = options.force
    ? new Map<string, Date>()
    : new Map(
        (await OrganismNewsModel.find({}, { _id: 0, buyerId: 1, fetchedAt: 1 }).lean()).map((r: any) => [
          r.buyerId as string,
          r.fetchedAt as Date,
        ])
      );

  const pending = (buyers as Array<{ buyerId: string; name: string }>)
    .filter((b) => b.name && b.name.trim().length >= MIN_NAME_LENGTH)
    .filter((b) => {
      if (options.force) return true;
      const at = seen.get(b.buyerId);
      return !at || at < staleBefore;
    })
    .slice(0, options.limit);

  console.log(`[organism-news] ${pending.length} organismos a consultar (limit ${options.limit})`);

  let queried = 0;
  let failed = 0;
  let withNews = 0;
  let totalItems = 0;

  for (const b of pending) {
    const name = b.name.trim();
    const aliases = organismAliases(name);
    const xml = await fetchFeed(newsRssUrl(name));
    await new Promise((r) => setTimeout(r, DELAY_MS));

    if (xml === null) {
      failed++;
      continue;
    }
    queried++;

    const raw = parseNewsRss(xml);
    const relevant = filterRelevant(raw, name, aliases).slice(0, MAX_ITEMS);
    if (relevant.length) {
      withNews++;
      totalItems += relevant.length;
    }

    if (options.dryRun) {
      console.log(`  ${b.buyerId} · ${name} → ${raw.length} crudas, ${relevant.length} relevantes`);
      for (const it of relevant.slice(0, 2)) console.log(`      ${it.source} · ${it.title.slice(0, 95)}`);
      continue;
    }

    await OrganismNewsModel.updateOne(
      { buyerId: b.buyerId },
      {
        $set: {
          buyerId: b.buyerId,
          buyerName: name,
          queriedAs: [name, ...aliases],
          fetchedAt: new Date(),
          rawCount: raw.length,
          items: relevant.map((it) => ({
            title: it.title,
            link: it.link,
            source: it.source,
            publishedAt: it.publishedAt ? new Date(it.publishedAt) : null,
          })),
        },
      },
      { upsert: true }
    );
  }

  const secs = Math.round((Date.now() - started) / 1000);
  console.log(
    `[organism-news] listo en ${secs}s · consultados ${queried} · fallidos ${failed} · con prensa ${withNews} · notas ${totalItems}`
  );
  if (options.dryRun) console.log("[organism-news] --dry-run: no se escribió nada");
}

run(parseArgs(process.argv.slice(2)))
  .catch((error) => {
    console.error("[organism-news] falló:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
