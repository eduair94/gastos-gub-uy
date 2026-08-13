#!/usr/bin/env tsx
/**
 * Resoluciones del Tribunal de Cuentas, atadas a la compra que nombran.
 *
 * El TC audita al Estado y publica su archivo en ids secuenciales. Cuando la resolución
 * es de contrataciones, nombra el llamado ("Licitación Pública Nº 5/2021") y el organismo,
 * que es exactamente la forma en que el corpus guarda `tender.title`. Ese es el cruce, y
 * está medido: sobre 51.841 claves ⟨organismo, título⟩ sólo el 4,4% apunta a más de una
 * compra, y el caso de control (Casinos · Licitación Pública 5/2021) resolvió exacto.
 *
 * QUÉ NO SE PUEDE DECIR CON ESTO. La ficha HTML trae sólo el VISTO. Si el gasto fue
 * observado, por cuánto y con qué fundamento está en el PDF. Así que se publica "el TC se
 * pronunció sobre esta compra" con el enlace, nunca "el TC observó este gasto".
 *
 * AMBIGUO NO SE ATA. Si la clave da más de una compra se guarda el conteo y `matchedOcid`
 * queda en null: colgarle a un contrato el pronunciamiento de otro es peor que no mostrar
 * nada.
 *
 * Uso:
 *   npx tsx src/jobs/scrape-tcr-resolutions.ts --from=39500 --to=39600 --dry-run
 *   npx tsx src/jobs/scrape-tcr-resolutions.ts --limit=500
 *   npx tsx src/jobs/scrape-tcr-resolutions.ts --id=39583 --force
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ReleaseModel, TcrResolutionModel } from "../../shared/models";
import { parseTcrResolution } from "../../shared/tcr-resolution";

const UA = "gastos-gub tcr reader (+https://github.com/eduair94/gastos-gub-uy)";
const DELAY_MS = 800;
const FETCH_TIMEOUT_MS = 45_000;
const DEFAULT_LIMIT = 300;
/**
 * Techo del recorrido, MEDIDO el 2026-08-13 por búsqueda binaria: 39590 existe, 39595 y
 * todo lo de arriba está vacío. Arrancar más arriba no es gratis — una corrida con techo
 * 45000 gastó 688 requests contra el sitio del Estado para traer cero fichas.
 *
 * En cada corrida el techo real se recalcula como (mayor id existente en base + HEADROOM),
 * así que si el TC vuelve a publicar el recorrido se estira solo. Para re-medirlo a mano:
 * pedir ids salteados y buscar dónde deja de aparecer "Fecha Resolución".
 */
const DEFAULT_MAX_ID = 39600;
const HEADROOM = 200;

interface Options {
  from: number | null;
  to: number | null;
  id: number | null;
  limit: number;
  dryRun: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { from: null, to: null, id: null, limit: DEFAULT_LIMIT, dryRun: false, force: false };
  for (const arg of argv) {
    if (arg === "--dry-run") o.dryRun = true;
    else if (arg === "--force") o.force = true;
    else if (arg.startsWith("--from=")) o.from = Number.parseInt(arg.slice(7), 10);
    else if (arg.startsWith("--to=")) o.to = Number.parseInt(arg.slice(5), 10);
    else if (arg.startsWith("--id=")) o.id = Number.parseInt(arg.slice(5), 10);
    else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice(8), 10);
      if (!Number.isInteger(n) || n < 1 || n > 50000) throw new Error(`Invalid --limit: ${arg}`);
      o.limit = n;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return o;
}

const sourceUrl = (id: number) => `https://www.tcr.gub.uy/resoluciones_busqueda.php?id=${id}`;

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** dd/mm/yyyy → Date. Null si no parsea; nunca una fecha inventada. */
function toDate(ddmmyyyy: string | null): Date | null {
  if (!ddmmyyyy) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normaliza para comparar nombres de organismo entre dos fuentes distintas. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Ata la resolución a una compra del corpus por ⟨título del llamado, organismo⟩.
 * Devuelve el ocid sólo cuando la clave apunta a UNA sola compra.
 */
async function matchProcurement(title: string, organism: string | null, visto: string | null) {
  const rows = await ReleaseModel.find(
    { "tender.title": title },
    { _id: 0, ocid: 1, "buyer.name": 1 }
  )
    .limit(50)
    .lean();

  const byOcid = new Map<string, string>();
  for (const r of rows as Array<Record<string, any>>) {
    if (r.ocid) byOcid.set(r.ocid, r.buyer?.name ?? "");
  }
  let candidates = [...byOcid.entries()];

  // El título solo puede repetirse entre organismos (cada uno numera sus llamados), así
  // que filtrar por organismo es lo que vuelve inequívoco al cruce. "Compra Directa
  // 7/2020" tiene 66 candidatos en el corpus: sin este paso no se ata nada.
  if (organism && candidates.length > 1) {
    const target = norm(organism);
    const narrowed = candidates.filter(([, name]) => {
      const n = norm(name);
      return n === target || n.includes(target) || target.includes(n);
    });
    if (narrowed.length) candidates = narrowed;
  }

  // Desempate: el encabezado de la resolución nombra el MINISTERIO ("Ministerio de
  // Defensa Nacional") mientras el corpus guarda la unidad ejecutora que compró
  // ("Comando General de la Armada") — y esa unidad casi siempre aparece escrita en el
  // VISTO. Buscar el nombre del comprador dentro del texto resuelve ese salto.
  if (visto && candidates.length > 1) {
    const haystack = norm(visto);
    const named = candidates.filter(([, name]) => {
      const n = norm(name);
      return n.length >= 8 && haystack.includes(n);
    });
    if (named.length) candidates = named;
  }

  return {
    count: candidates.length,
    ocid: candidates.length === 1 ? candidates[0]![0] : null,
    buyerName: candidates.length === 1 ? candidates[0]![1] : null,
  };
}

async function run(options: Options): Promise<void> {
  const started = Date.now();
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) process.env.MONGO_SOCKET_TIMEOUT_MS = String(30 * 60 * 1000);
  await connectToDatabase();

  let ids: number[];
  if (options.id) {
    ids = [options.id];
  } else {
    // El techo sale de lo que ya se vio existir, no de una constante que envejece.
    const highest = await TcrResolutionModel.findOne({ exists: true }, { _id: 0, tcrId: 1 })
      .sort({ tcrId: -1 })
      .lean();
    const discovered = highest ? (highest as { tcrId: number }).tcrId + HEADROOM : DEFAULT_MAX_ID;
    const to = options.to ?? Math.max(discovered, DEFAULT_MAX_ID);
    const from = options.from ?? 1;
    // Más nuevas primero: los ids altos son las resoluciones recientes.
    const all: number[] = [];
    for (let i = to; i >= from; i--) all.push(i);
    const seen = options.force
      ? new Set<number>()
      : new Set((await TcrResolutionModel.find({}, { _id: 0, tcrId: 1 }).lean()).map((r: any) => r.tcrId as number));
    ids = all.filter((i) => !seen.has(i)).slice(0, options.limit);
  }

  console.log(`[tcr] ${ids.length} fichas a sondear`);

  let ok = 0;
  let missing = 0;
  let procurement = 0;
  let matched = 0;
  let ambiguous = 0;

  for (const id of ids) {
    const url = sourceUrl(id);
    const html = await fetchPage(url);
    await new Promise((r) => setTimeout(r, DELAY_MS));

    const parsed = html ? parseTcrResolution(html, id) : null;
    const exists = Boolean(parsed?.date);
    if (!exists) missing++;
    else ok++;

    let match = { count: 0, ocid: null as string | null, buyerName: null as string | null };
    if (parsed?.procurement) {
      procurement++;
      match = await matchProcurement(parsed.procurement.titleForm, parsed.organism, parsed.visto);
      if (match.ocid) matched++;
      else if (match.count > 1) ambiguous++;
    }

    if (options.dryRun) {
      if (exists) {
        console.log(
          `  ${id} · ${parsed!.date} · ${parsed!.organism ?? "—"} · ${parsed!.procurement?.titleForm ?? "sin llamado"}` +
            (match.ocid ? ` → ${match.ocid}` : match.count > 1 ? ` → AMBIGUO (${match.count})` : "")
        );
      }
      continue;
    }

    await TcrResolutionModel.updateOne(
      { tcrId: id },
      {
        $set: {
          tcrId: id,
          exists,
          probedAt: new Date(),
          sourceUrl: url,
          date: parsed?.date ?? null,
          resolvedAt: toDate(parsed?.date ?? null),
          organismPath: parsed?.organismPath ?? null,
          organism: parsed?.organism ?? null,
          subject: parsed?.subject ?? null,
          expediente: parsed?.expediente ?? null,
          visto: parsed?.visto ?? null,
          pdfUrl: parsed?.pdfUrl ?? null,
          isProcurement: parsed?.isProcurement ?? false,
          procurementMethod: parsed?.procurement?.method ?? null,
          procurementNumber: parsed?.procurement?.number ?? null,
          procurementYear: parsed?.procurement?.year ?? null,
          procurementTitle: parsed?.procurement?.titleForm ?? null,
          matchedOcid: match.ocid,
          matchedCompraId: match.ocid ? match.ocid.split("-").slice(2).join("-") : null,
          matchedBuyerName: match.buyerName,
          matchCandidates: match.count,
        },
      },
      { upsert: true }
    );
  }

  const secs = Math.round((Date.now() - started) / 1000);
  console.log(
    `[tcr] listo en ${secs}s · fichas ${ok} · inexistentes ${missing} · de contrataciones con llamado ${procurement} · atadas ${matched} · ambiguas ${ambiguous}`
  );
  if (options.dryRun) console.log("[tcr] --dry-run: no se escribió nada");
}

run(parseArgs(process.argv.slice(2)))
  .catch((error) => {
    console.error("[tcr] falló:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
