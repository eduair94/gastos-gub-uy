#!/usr/bin/env tsx
/**
 * Sentencias donde se condena al Estado a pagar — crawler de la Base de Jurisprudencia Nacional.
 *
 * Recorre bjn.poderjudicial.gub.uy, baja la Hoja de Insumo de cada sentencia, le lee la cabecera
 * (shared/bjn-hoja.ts) y la parte dispositiva (shared/bjn-award.ts), y guarda en `bjn_condenas`.
 * No decide montos: deja los candidatos que están escritos en el fallo. Eso lo resuelve el
 * verificador (src/jobs/verify-bjn-condenas.ts).
 *
 * ACOTADO Y REANUDABLE, A PROPÓSITO. El universo son ~6.400 sentencias entre las dos consultas
 * principales, y cada una cuesta DOS pedidos: uno para seleccionar la fila en la conversación del
 * servidor y otro para pedir la hoja. A 1,5 s de espera son unas cinco horas y media de crawl
 * continuo. Se corre con `--limit` y el resto drena en las siguientes noches, igual que
 * extract-acta-bidders. Una sesión anterior ya castigó el sitio del gobierno con la sonda de
 * reiteración; no se repite.
 *
 * LA BASE ES UNA APLICACIÓN CON ESTADO. Cada búsqueda abre una «conversación» Seam (`cid`), y la
 * hoja se pide contra esa conversación DESPUÉS de seleccionar la fila. No hay URL directa a una
 * sentencia: por eso el crawler es serial y no paraleliza.
 *
 * Uso:
 *   npx tsx src/jobs/load-bjn-condenas.ts --dry-run
 *   npx tsx src/jobs/load-bjn-condenas.ts --limit=200
 *   npx tsx src/jobs/load-bjn-condenas.ts --query="condenase al Estado" --pages=5
 */
import axios from "axios";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { BjnCondenaModel } from "../../shared/models";
import { parseDispositive } from "../../shared/bjn-award";
import { parseHojaInsumo, sentenciaKey } from "../../shared/bjn-hoja";

const HOST = "https://bjn.poderjudicial.gub.uy";
const SEARCH_PATH = "/BJNPUBLICA/busquedaSimple.seam";
const UA = "gastos-gub bjn reader (+https://github.com/eduair94)";

/**
 * Las consultas que definen el universo.
 *
 * La búsqueda del BJN es de texto libre y no tiene un campo «demandado», así que el universo se
 * arma por frase y se limpia después: el fuero penal lo descarta el lector de cabecera y el
 * organismo lo identifica el verificador. Guardamos TODO lo que baja, publicable o no, para poder
 * medir cuánto del corpus se cae y por qué.
 */
const DEFAULT_QUERIES = [
  '"contencioso administrativo de reparacion patrimonial"',
  '"condenase al Estado"',
  '"responsabilidad del Estado" indemnizacion condena',
  '"condenase a la demandada" ASSE',
  '"condenase" Intendencia indemnizacion',
];

interface Options {
  dryRun: boolean;
  limit: number;
  pages: number;
  delayMs: number;
  queries: string[];
  force: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: false,
    limit: 100,
    pages: 3,
    delayMs: 1500,
    queries: DEFAULT_QUERIES,
    force: false,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice(8));
    else if (arg.startsWith("--pages=")) options.pages = Number(arg.slice(8));
    else if (arg.startsWith("--delay-ms=")) options.delayMs = Number(arg.slice(11));
    else if (arg.startsWith("--query=")) options.queries = [arg.slice(8)];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.limit) || options.limit <= 0) throw new Error("--limit must be > 0");
  // Nunca por debajo de un segundo: el sitio es del Poder Judicial y esto corre de noche sin nadie
  // mirando.
  if (!Number.isFinite(options.delayMs) || options.delayMs < 1000) options.delayMs = 1000;
  return options;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Entidades HTML que la hoja usa de verdad, más el aplanado de espacios. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ")
    .replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É").replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&ordm;/g, "º").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Una conversación abierta contra el buscador. Muere sola: se reabre por consulta. */
interface Session {
  cookie: string;
  action: string;
  viewState: string;
  cid: string | null;
}

function readCookie(headers: Record<string, unknown>, current: string): string {
  const raw = (headers["set-cookie"] as string[] | undefined) ?? [];
  for (const c of raw) {
    const kv = c.split(";")[0] ?? "";
    if (kv.startsWith("JSESSIONID")) return kv;
  }
  return current;
}

const viewStateOf = (html: string): string =>
  /name="javax\.faces\.ViewState"[^>]*value="([^"]*)"/.exec(html)?.[1] ?? "j_id1";

async function openSession(): Promise<Session> {
  const res = await axios.get<string>(`${HOST}${SEARCH_PATH}`, {
    timeout: 60000,
    headers: { "User-Agent": UA },
    responseType: "text",
  });
  const html = res.data;
  const action = /action="([^"]*busquedaSimple[^"]*)"/.exec(html)?.[1];
  if (!action) throw new Error("BJN: no search form found — the page was reshaped");
  return {
    cookie: readCookie(res.headers as Record<string, unknown>, ""),
    action: `${HOST}${action}`,
    viewState: viewStateOf(html),
    cid: null,
  };
}

async function post(session: Session, fields: Record<string, string>): Promise<string> {
  const res = await axios.post<string>(
    session.action,
    new URLSearchParams({ AJAXREQUEST: "_viewRoot", ...fields }).toString(),
    {
      timeout: 120000,
      responseType: "text",
      headers: {
        "User-Agent": UA,
        cookie: session.cookie,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: session.action,
      },
    }
  );
  return res.data;
}

interface ResultPage {
  titles: string[];
  total: number;
  page: number;
  pages: number;
}

function readResults(html: string): ResultPage {
  const titles = [...html.matchAll(/lnkTituloSentencia"[^>]*>([^<]+)</g)].map((m) => m[1]!.trim());
  const total = Number(/(\d+)\s*resultado\/s/.exec(html)?.[1] ?? 0);
  const pag = /P[áa]gina\s+(\d+)\s+de\s+(\d+)/.exec(htmlToText(html));
  return {
    titles,
    total,
    page: Number(pag?.[1] ?? 1),
    pages: Number(pag?.[2] ?? 1),
  };
}

async function search(session: Session, query: string): Promise<ResultPage> {
  const html = await post(session, {
    formBusqueda: "formBusqueda",
    "formBusqueda:cajaQuery": query,
    autoScroll: "",
    "formBusqueda:j_idcl": "",
    "formBusqueda:_link_hidden_": "",
    "javax.faces.ViewState": session.viewState,
    "formBusqueda:Search": "formBusqueda:Search",
  });
  session.viewState = viewStateOf(html);
  session.cid = /hojaInsumo2\.seam\?cid=(\d+)/.exec(html)?.[1] ?? session.cid;
  return readResults(html);
}

async function nextPage(session: Session): Promise<ResultPage> {
  const html = await post(session, {
    formResultados: "formResultados",
    autoScroll: "",
    "formResultados:j_idcl": "",
    "formResultados:_link_hidden_": "",
    "javax.faces.ViewState": session.viewState,
    "formResultados:sigLink": "formResultados:sigLink",
  });
  session.viewState = viewStateOf(html);
  session.cid = /hojaInsumo2\.seam\?cid=(\d+)/.exec(html)?.[1] ?? session.cid;
  return readResults(html);
}

/** Selecciona la fila en la conversación y devuelve el texto de su Hoja de Insumo. */
async function fetchHoja(session: Session, row: number): Promise<string> {
  await post(session, {
    formResultados: "formResultados",
    autoScroll: "",
    "formResultados:j_idcl": "",
    "formResultados:_link_hidden_": "",
    "javax.faces.ViewState": session.viewState,
    [`formResultados:grid:${row}:j_id63`]: `formResultados:grid:${row}:j_id63`,
  });
  const res = await axios.get<string>(`${HOST}/BJNPUBLICA/hojaInsumo2.seam?cid=${session.cid}`, {
    timeout: 60000,
    responseType: "text",
    headers: { "User-Agent": UA, cookie: session.cookie, Referer: session.action },
  });
  return htmlToText(res.data);
}

interface Stats {
  fetched: number;
  saved: number;
  skipped: number;
  noHeader: number;
  noDispositive: number;
  penal: number;
  withCandidates: number;
}

async function crawlQuery(query: string, options: Options, seen: Set<string>, stats: Stats): Promise<void> {
  const session = await openSession();
  await sleep(options.delayMs);
  let page = await search(session, query);
  console.log(`[bjn] «${query}» → ${page.total} resultados, ${page.pages} páginas`);

  for (let p = 1; p <= Math.min(options.pages, page.pages); p++) {
    for (let row = 0; row < page.titles.length; row++) {
      if (stats.fetched >= options.limit) return;
      const title = page.titles[row] ?? "";
      // El título trae «46/2023 DEFINITIVA - Tribunal Apelaciones Civil 4ºTº - PROCESO ...», lo que
      // alcanza para saltar sin gastar los dos pedidos de la hoja.
      const numero = /^(\S+)\s/.exec(title)?.[1] ?? "";
      const sede = /-\s*([^-]+?)\s*-/.exec(title)?.[1] ?? "";
      const key = numero && sede ? sentenciaKey(sede, numero) : "";
      if (key && seen.has(key) && !options.force) {
        stats.skipped++;
        continue;
      }

      await sleep(options.delayMs);
      let text: string;
      try {
        text = await fetchHoja(session, row);
      } catch (error) {
        console.warn(`[bjn] fila ${row} de «${query}» falló: ${(error as Error).message}`);
        continue;
      }
      stats.fetched++;

      const hoja = parseHojaInsumo(text);
      if (!hoja) {
        stats.noHeader++;
        continue;
      }
      const parse = parseDispositive(text, hoja.procedimiento);
      if (!parse.found) {
        stats.noDispositive++;
        continue;
      }
      if (parse.isPenal) stats.penal++;
      if (parse.awardCandidates.length > 0) stats.withCandidates++;

      const realKey = sentenciaKey(hoja.sede, hoja.numero);
      seen.add(realKey);

      if (options.dryRun) {
        console.log(
          `   ${hoja.numero.padEnd(11)} ${String(hoja.procedimiento).slice(0, 24).padEnd(24)} ${parse.verb.padEnd(10)}` +
            ` candidatos=${parse.awardCandidates.length}` +
            `${parse.deferredLiquidation ? " diferido" : ""}${parse.isPenal ? " PENAL" : ""}`
        );
        continue;
      }

      await BjnCondenaModel.updateOne(
        { sentenciaKey: realKey },
        {
          $set: {
            sentenciaKey: realKey,
            numero: hoja.numero,
            anio: hoja.anio,
            sede: hoja.sede,
            tipo: hoja.tipo,
            importancia: hoja.importancia,
            fecha: hoja.fecha,
            ficha: hoja.ficha,
            procedimiento: hoja.procedimiento,
            materias: hoja.materias,
            dispositive: parse.dispositive,
            verb: parse.verb,
            isPenal: parse.isPenal,
            deferredLiquidation: parse.deferredLiquidation,
            awardCandidates: parse.awardCandidates,
            excluded: parse.excluded,
            sourceUrl: `${HOST}${SEARCH_PATH}`,
            fetchedAt: new Date(),
          },
          // `publishable` lo decide el verificador; acá sólo se inicializa cuando el documento nace.
          $setOnInsert: { publishable: false },
          $addToSet: { foundBy: query },
        },
        { upsert: true }
      );
      stats.saved++;
    }

    if (p < Math.min(options.pages, page.pages) && stats.fetched < options.limit) {
      await sleep(options.delayMs);
      page = await nextPage(session);
    }
  }
}

async function run(options: Options): Promise<void> {
  const started = Date.now();
  const stats: Stats = {
    fetched: 0, saved: 0, skipped: 0, noHeader: 0, noDispositive: 0, penal: 0, withCandidates: 0,
  };

  const seen = new Set<string>();
  if (!options.dryRun) {
    await connectToDatabase();
    // Reanudable: lo ya bajado no se vuelve a pedir. Con 6.400 sentencias de universo, esto es lo
    // que hace que el crawl drene en varias noches sin repetir trabajo.
    const existing = await BjnCondenaModel.find({}, { sentenciaKey: 1, _id: 0 }).lean();
    for (const d of existing as unknown as Array<{ sentenciaKey: string }>) seen.add(d.sentenciaKey);
    console.log(`[bjn] ya guardadas: ${seen.size}`);
  }

  for (const query of options.queries) {
    if (stats.fetched >= options.limit) break;
    try {
      await crawlQuery(query, options, seen, stats);
    } catch (error) {
      console.error(`[bjn] «${query}» abortó: ${(error as Error).message}`);
    }
    await sleep(options.delayMs);
  }

  console.log(
    `[bjn] bajadas ${stats.fetched} · guardadas ${stats.saved} · salteadas ${stats.skipped}` +
      ` · sin cabecera ${stats.noHeader} · sin fallo ${stats.noDispositive}` +
      ` · penales ${stats.penal} · con candidato de monto ${stats.withCandidates}`
  );
  console.log(`[bjn] listo en ${((Date.now() - started) / 1000).toFixed(1)}s`);
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
      console.error("[bjn] failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}

export { run as loadBjnCondenas, parseArgs, htmlToText, readResults };
