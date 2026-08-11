#!/usr/bin/env tsx
/**
 * Who else bid — extract the bidder list from each acta de adjudicación.
 *
 * The OCDS feed never says who competed. Measured over 155,547 tender-phase releases since 2023,
 * `tender.tenderers` and `tender.numberOfTenderers` are populated on 0%, the per-record and
 * per-release OCDS endpoints return exactly what the bulk download does, and the gov HTML detail
 * page states only "Recepción de ofertas hasta: <fecha>". The acta de adjudicación PDF sometimes
 * states it in prose, and that is what this recovers.
 *
 * COVERAGE IS LOW AND THAT IS THE POINT OF THE DESIGN. Measured on 53 awarded competitive calls,
 * ~6% of actas enumerate the offers. So this publishes a per-CONTRACT fact carrying its source, and
 * nothing here may be aggregated into an organism-level "single bidding" rate: at this coverage a
 * body whose actas simply do not enumerate would score clean, which is the same labelling artifact
 * already documented for "% compra directa". See shared/acta-bidders.ts.
 *
 * BE GENTLE WITH THE SOURCE. comprasestatales.gub.uy is the same host the pliego and reiteración
 * probes hit, and a previous session throttled it by grinding. Serial, delayed, resumable: every
 * probed call is recorded (including the silent ones) so a re-run never re-fetches.
 *
 * Usage:
 *   npx tsx src/jobs/extract-acta-bidders.ts --limit=200
 *   npx tsx src/jobs/extract-acta-bidders.ts --limit=50 --dry-run
 *   npx tsx src/jobs/extract-acta-bidders.ts --ocid=ocds-yfs5dr-1265228 --force
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ActaBiddersModel, ReleaseModel } from "../../shared/models";
import { parseActaBidders } from "../../shared/acta-bidders";
import { extractActaText } from "../../shared/acta-pdf-text";

const UA = "gastos-gub acta reader (+https://github.com/eduair94)";
const DELAY_MS = 800;
const DEFAULT_LIMIT = 200;
const FETCH_TIMEOUT_MS = 60_000;

/**
 * Only competitive procedures. On a Compra Directa there is nothing to compete for, so "who else
 * bid" is not a question, and probing them would spend the site's patience for no signal.
 */
const COMPETITIVE = ["Licitación Abreviada", "Licitación Pública", "Concurso de Precios"];

interface Options {
  limit: number;
  dryRun: boolean;
  ocid: string | null;
  force: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { limit: DEFAULT_LIMIT, dryRun: false, ocid: null, force: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg.startsWith("--limit=")) {
      const limit = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20000) throw new Error(`Invalid --limit: ${arg}`);
      options.limit = limit;
    } else if (arg.startsWith("--ocid=")) options.ocid = arg.slice("--ocid=".length).trim() || null;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const compraIdFromOcid = (ocid: string): string => ocid.split("-").pop() ?? "";
const actaUrl = (compraId: string): string => `https://www.comprasestatales.gub.uy/Resoluciones/acta_${compraId}.pdf`;

async function fetchActa(url: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function run(options: Options): Promise<void> {
  const started = Date.now();
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) process.env.MONGO_SOCKET_TIMEOUT_MS = String(30 * 60 * 1000);
  await connectToDatabase();

  // Competitive calls that already have an award, minus the ones already probed.
  const match: Record<string, unknown> = options.ocid
    ? { ocid: options.ocid }
    : { "tender.procurementMethodDetails": { $in: COMPETITIVE }, "ocid": { $type: "string", $ne: "" } };

  const candidates: Array<{ _id: string }> = await ReleaseModel.aggregate(
    [
      { $match: match },
      { $project: { _id: 0, ocid: 1 } },
      { $group: { _id: "$ocid" } },
      {
        $lookup: {
          from: "releases",
          let: { o: "$_id" },
          pipeline: [{ $match: { $expr: { $eq: ["$ocid", "$$o"] } } }, { $match: { tag: "award" } }, { $limit: 1 }, { $project: { _id: 1 } }],
          as: "aw",
        },
      },
      { $match: { "aw.0": { $exists: true } } },
      // Skip what we already looked at. `--force` (with --ocid) is the surgical re-read.
      ...(options.force
        ? []
        : [
            {
              $lookup: {
                from: "acta_bidders",
                localField: "_id",
                foreignField: "ocid",
                as: "seen",
              },
            },
            { $match: { "seen.0": { $exists: false } } },
          ]),
      { $limit: options.limit },
      { $project: { _id: 1 } },
    ],
    { allowDiskUse: true }
  );

  console.log(`[acta-bidders] ${candidates.length} calls to probe (limit ${options.limit})`);

  let fetched = 0;
  let missing = 0;
  let noText = 0;
  let found = 0;
  let sole = 0;

  for (const row of candidates) {
    const ocid = row._id;
    const compraId = compraIdFromOcid(ocid);
    if (!compraId) continue;
    const url = actaUrl(compraId);

    const buf = await fetchActa(url);
    await new Promise((r) => setTimeout(r, DELAY_MS));
    if (!buf) {
      missing++;
      continue;
    }
    fetched++;

    const text = extractActaText(buf);
    if (text.trim().length < 50) noText++;
    const parsed = parseActaBidders(text);
    if (parsed) {
      found++;
      if (parsed.bidders.length === 0) sole++;
      console.log(`  ${compraId} ${parsed.count} oferta(s) [${parsed.marker}]${parsed.bidders.length ? ": " + parsed.bidders.join(" · ") : ""}`);
    }

    if (options.dryRun) continue;

    await ActaBiddersModel.updateOne(
      { ocid },
      {
        $set: {
          ocid,
          compraId,
          actaUrl: url,
          probedAt: new Date(),
          found: Boolean(parsed),
          count: parsed?.count ?? null,
          bidders: parsed?.bidders ?? [],
          marker: parsed?.marker ?? null,
          excerpt: parsed?.excerpt ?? null,
          textChars: text.length,
        },
      },
      { upsert: true }
    );
  }

  console.log(`\n[acta-bidders] fetched ${fetched}, acta missing ${missing}, no text layer ${noText}`);
  console.log(`[acta-bidders] enumerated ${found} (${fetched ? ((100 * found) / fetched).toFixed(1) : "0"}%), of which sole-bidder statements ${sole}`);
  if (options.dryRun) console.log("[acta-bidders] 🧪 --dry-run: no writes performed.");
  console.log(`[acta-bidders] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
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
      console.error("[acta-bidders] failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}

export { run as extractActaBidders, parseArgs };
