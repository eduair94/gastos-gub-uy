#!/usr/bin/env tsx
/**
 * Las cifras de los canales de `/canales-youtube`, al día.
 *
 * El directorio tiene dos mitades y esto toca UNA sola. La curada —quién entra,
 * con qué prueba de identidad, por qué importa— vive en `app/data/canales-youtube.ts`
 * y la decide una persona. Lo que envejece solo —suscriptores, videos, vistas, el
 * último video, de qué habla— se remide acá todas las noches.
 *
 * DOS CAMINOS PARA EL MISMO DATO:
 *
 *   1. Con `YOUTUBE_API_KEY`: `channels.list` trae hasta 50 canales en UNA llamada
 *      con estadísticas exactas y sin redondeo. Cuesta 1 unidad de las 10.000
 *      diarias de la cuota gratis.
 *   2. Sin key: se lee la pestaña «Más información» del canal, que es de donde
 *      salió la tabla original. Redondea («23,8 mil») pero no necesita cuenta.
 *
 * El feed Atom da el último video en los dos casos, y la muestra de títulos sale
 * de la pestaña `/videos`, que devuelve unos treinta en el HTML.
 *
 * LA PRUEBA DE IDENTIDAD NO SE RECALCULA ACÁ. Si YouTube deja de publicar
 * «Uruguay» para un canal que entró por esa prueba, el job lo guarda y lo avisa;
 * sacarlo del directorio es una decisión editorial, no de un cron.
 *
 * Uso:
 *   npx tsx src/jobs/refresh-youtube-channels.ts
 *   npx tsx src/jobs/refresh-youtube-channels.ts --limit=5 --dry-run
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { YoutubeChannelStatModel } from "../../shared/models";
import { measureTitles } from "../../shared/youtube/topics";
import { CHANNELS } from "../../app/data/canales-youtube";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const DELAY_MS = 900;
/**
 * El feed Atom se pide con el user-agent honesto del proyecto, no con el de
 * Chrome: con el de navegador YouTube contesta 404 intermitente a la mitad de los
 * canales, y un canal activo se publica entonces como si no publicara.
 */
const FEED_UA = "Mozilla/5.0 (compatible; gastos-gub/1.0; +https://github.com/eduair94/gastos-gub-uy)";
const TIMEOUT_MS = 25_000;
/** Títulos que se leen por canal para la medición. La pestaña devuelve ~30. */
const SAMPLE_CAP = 30;

interface Options {
  limit: number;
  dryRun: boolean;
  channel: string | null;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { limit: CHANNELS.length, dryRun: false, channel: null };
  for (const arg of argv) {
    if (arg === "--dry-run") o.dryRun = true;
    else if (arg.startsWith("--channel=")) o.channel = arg.slice("--channel=".length).trim() || null;
    else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error(`Invalid --limit: ${arg}`);
      o.limit = n;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return o;
}

async function get(url: string, userAgent = UA): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    headers: { "user-agent": userAgent, "accept-language": "es-419,es" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, body: await res.text() };
}

/** «23,8 mil» / «23.8 k» → 23800. Sirve para ordenar y para comparar magnitudes. */
export function parseSubscribers(raw: string | null): number {
  if (!raw) return 0;
  const m = raw.match(/([\d.,]+)\s*([kKmM]|mil|millones)?/);
  if (!m) return 0;
  const n = Number(m[1]!.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "k" || unit === "mil") return Math.round(n * 1_000);
  if (unit === "m" || unit === "millones") return Math.round(n * 1_000_000);
  return Math.round(n);
}

// ─── Camino 1: la API oficial ────────────────────────────────────────────────

interface ApiStat {
  channelId: string;
  subscribers: string | null;
  subscribersApprox: number;
  videos: string | null;
  views: string | null;
  country: string | null;
  selfDescription: string | null;
  joined: string | null;
}

/**
 * `channels.list` con hasta 50 ids por llamada. Una unidad de cuota por llamada,
 * así que el directorio entero cuesta una.
 */
async function fetchViaApi(ids: string[], apiKey: string): Promise<Map<string, ApiStat>> {
  const out = new Map<string, ApiStat>();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url =
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics` +
      `&id=${batch.join(",")}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`channels.list → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as any;
    for (const item of json.items ?? []) {
      const stats = item.statistics ?? {};
      const subs = stats.hiddenSubscriberCount ? null : Number(stats.subscriberCount ?? 0);
      out.set(item.id, {
        channelId: item.id,
        subscribers: subs === null ? null : new Intl.NumberFormat("es-UY").format(subs),
        subscribersApprox: subs ?? 0,
        videos: stats.videoCount ? new Intl.NumberFormat("es-UY").format(Number(stats.videoCount)) : null,
        views: stats.viewCount ? new Intl.NumberFormat("es-UY").format(Number(stats.viewCount)) : null,
        country: item.snippet?.country === "UY" ? "Uruguay" : (item.snippet?.country ?? null),
        selfDescription: (item.snippet?.description ?? "").replace(/\s+/g, " ").trim().slice(0, 400) || null,
        joined: item.snippet?.publishedAt ? String(item.snippet.publishedAt).slice(0, 10) : null,
      });
    }
  }
  return out;
}

// ─── Camino 2: la pestaña «Más información» ──────────────────────────────────

async function fetchViaScrape(channelId: string): Promise<ApiStat> {
  const { status, body } = await get(`https://www.youtube.com/channel/${channelId}/about`);
  if (status !== 200) throw new Error(`about → ${status}`);
  const pick = (re: RegExp) => (body.match(re) ?? [])[1] ?? null;

  let description: string | null = null;
  const m = body.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/);
  if (m) {
    const stack: any[] = [JSON.parse(m[1]!)];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (node.aboutChannelViewModel?.description) {
        description = String(node.aboutChannelViewModel.description).replace(/\s+/g, " ").trim().slice(0, 400);
        break;
      }
      for (const v of Object.values(node)) if (v && typeof v === "object") stack.push(v);
    }
  }

  const subscribers = pick(/"subscriberCountText":"([^"]+)"/);
  return {
    channelId,
    subscribers,
    subscribersApprox: parseSubscribers(subscribers),
    videos: pick(/"videoCountText":"([^"]+)"/),
    views: pick(/"viewCountText":"([^"]+)"/),
    country: pick(/"country":"([^"]+)"/),
    selfDescription: description,
    joined: pick(/"joinedDateText":\{"content":"([^"]+)"/)?.replace(/^Se unió el /, "") ?? null,
  };
}

// ─── El último video y la muestra de títulos ─────────────────────────────────

async function fetchLastUpload(channelId: string): Promise<string | null> {
  // Un reintento con pausa: pidiendo tres cosas por canal, YouTube devuelve algún
  // 429 suelto. Sin el reintento, un canal activo se publica como si no publicara.
  for (const attempt of [0, 1]) {
    if (attempt) await new Promise(r => setTimeout(r, 2_000));
    const { status, body } = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, FEED_UA);
    if (status !== 200) {
      if (attempt) console.warn(`    feed ${channelId} → ${status}`);
      continue;
    }
    const dates = [...body.matchAll(/<published>([^<]+)<\/published>/g)].map(m => m[1]!);
    if (!dates.length) return null;
    return dates.sort().at(-1)!.slice(0, 10);
  }
  return null;
}

/**
 * Títulos recientes de la pestaña `/videos`.
 *
 * Los ítems son `lockupViewModel`. Un parser que busque `videoRenderer` —el
 * nombre viejo— devuelve cero sin fallar, y el conteo queda en cero para siempre.
 */
async function fetchRecentTitles(channelId: string): Promise<string[]> {
  const { status, body } = await get(`https://www.youtube.com/channel/${channelId}/videos`);
  if (status !== 200) return [];
  const m = body.match(/ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/);
  if (!m) return [];

  const titles: string[] = [];
  const seen = new Set<string>();
  const stack: any[] = [JSON.parse(m[1]!)];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    const lockup = node.lockupViewModel;
    if (lockup?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && lockup.contentId && !seen.has(lockup.contentId)) {
      const title = lockup.metadata?.lockupMetadataViewModel?.title?.content;
      if (title) {
        seen.add(lockup.contentId);
        titles.push(String(title));
      }
    }
    for (const v of Object.values(node)) if (v && typeof v === "object") stack.push(v);
  }
  return titles.slice(0, SAMPLE_CAP);
}

// ─── Orquestación ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const apiKey = (process.env.YOUTUBE_API_KEY ?? "").trim();
  const targets = (opts.channel ? CHANNELS.filter(c => c.id === opts.channel) : CHANNELS).slice(0, opts.limit);
  if (!targets.length) throw new Error("ningún canal seleccionado");

  console.log(`Canales: ${targets.length} · camino: ${apiKey ? "API oficial" : "lectura de la ficha"}`);

  let apiStats = new Map<string, ApiStat>();
  if (apiKey) {
    try {
      apiStats = await fetchViaApi(targets.map(c => c.id), apiKey);
      console.log(`  API respondió por ${apiStats.size} canales`);
    } catch (error) {
      console.warn(`  la API falló, se sigue por lectura de ficha: ${String(error).slice(0, 140)}`);
    }
  }

  if (!opts.dryRun) await connectToDatabase();

  let ok = 0;
  let failed = 0;
  const drift: string[] = [];

  for (const channel of targets) {
    try {
      const stat = apiStats.get(channel.id) ?? (await fetchViaScrape(channel.id));
      // En serie a propósito: tres pedidos simultáneos por canal es lo que hace
      // que YouTube conteste 429 justo en el feed.
      const lastUpload = await fetchLastUpload(channel.id);
      const titles = await fetchRecentTitles(channel.id);
      const sample = measureTitles(titles);

      // El país es la prueba de identidad de la mitad del directorio: si cambia,
      // se avisa. Sacar el canal es una decisión editorial, no de este job.
      if (channel.proofs.includes("pais") && stat.country && stat.country !== "Uruguay") {
        drift.push(`${channel.name}: YouTube ahora publica «${stat.country}»`);
      }
      if (channel.lastUpload && lastUpload && lastUpload !== channel.lastUpload) {
        // Sin ruido: sólo importa cuando la tabla curada quedó vieja de verdad.
        const stale = new Date(lastUpload).getTime() - new Date(channel.lastUpload).getTime();
        if (stale > 30 * 86_400_000) drift.push(`${channel.name}: publicó de nuevo el ${lastUpload}`);
      }

      // Un 404 del feed —que YouTube devuelve como disfraz del rate limit— no puede
      // convertir un canal activo en uno abandonado. Si esta vuelta no trajo fecha,
      // se conserva la anterior: la de la corrida previa, o la de la tabla curada.
      const previous = opts.dryRun
        ? null
        : await YoutubeChannelStatModel.findOne({ channelId: channel.id }).select("lastUpload").lean<{ lastUpload: string | null } | null>();
      const resolvedLastUpload = lastUpload ?? previous?.lastUpload ?? channel.lastUpload;
      if (!lastUpload) console.warn(`    ${channel.name}: el feed no respondió; se conserva ${resolvedLastUpload ?? "sin fecha"}`);

      if (opts.dryRun) {
        console.log(
          `  [dry-run] ${channel.name}: ${stat.subscribers ?? "sin subs"} · ${lastUpload ?? "sin feed"} · ` +
            `${sample.topicHits}/${sample.n} de gasto y política`
        );
      } else {
        await YoutubeChannelStatModel.updateOne(
          { channelId: channel.id },
          {
            $set: {
              channelId: channel.id,
              subscribers: stat.subscribers,
              subscribersApprox: stat.subscribersApprox || channel.subscribersApprox,
              videos: stat.videos,
              views: stat.views,
              country: stat.country,
              lastUpload: resolvedLastUpload,
              selfDescription: stat.selfDescription,
              joined: stat.joined,
              sample: { n: sample.n, topicHits: sample.topicHits, mentions: sample.mentions },
              source: apiStats.has(channel.id) ? "api" : "scrape",
              checkedAt: new Date(),
              error: null,
            },
          },
          { upsert: true }
        );
      }
      ok++;
    } catch (error) {
      failed++;
      const message = String(error).slice(0, 200);
      console.warn(`  ✗ ${channel.name}: ${message}`);
      if (!opts.dryRun) {
        await YoutubeChannelStatModel.updateOne(
          { channelId: channel.id },
          { $set: { channelId: channel.id, checkedAt: new Date(), error: message } },
          { upsert: true }
        );
      }
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\nActualizados ${ok}, fallaron ${failed}`);
  if (drift.length) {
    console.log("Para revisar a mano:");
    for (const d of drift) console.log(`  · ${d}`);
  }

  if (!opts.dryRun) await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
