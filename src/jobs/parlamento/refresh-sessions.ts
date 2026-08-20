#!/usr/bin/env tsx
/**
 * Qué se dijo en el Parlamento, contado para quien no sigue política.
 *
 * Tres fases sobre los canales oficiales de las dos cámaras:
 *
 *   1. DESCUBRIR. El feed Atom de cada canal da los últimos 15 videos. Una sesión
 *      = un video. La fecha sale del título, no de la publicación: el video se
 *      sube al otro día y la fecha de publicación miente por uno.
 *   2. TRANSCRIBIR. `yt-dlp` baja los subtítulos AUTOMÁTICOS en español. Sin
 *      cuenta y sin API key. La API de YouTube no sirve para esto: `captions.
 *      download` pide OAuth del dueño del canal, y el `timedtext` público
 *      devuelve cero bytes desde que YouTube lo firmó.
 *   3. RESUMIR. Bloques de ~1.400 palabras → temas por bloque → una síntesis en
 *      lenguaje llano. El minuto de cada tema lo pone el CÓDIGO desde el bloque,
 *      no el modelo.
 *   4. VOTAR. El código busca el recuento cantado («27 en 27») con las reglas de
 *      shared/parlamento/votes. El modelo sólo pone el asunto de cada votación.
 *      De ahí sale el «se aprobó» o «no se aprobó» de cada tema.
 *
 * LO QUE ESTO NO ES. Ni la transcripción ni el resumen son la versión oficial.
 * El subtitulado automático se come nombres y cambia cifras; el modelo resume a
 * esa máquina. Por eso el portón de `shared/parlamento/summary` tira cualquier
 * tema que opine o que traiga una cifra exacta, y por eso cada tema se publica
 * con el minuto del video: la prueba es el video, no nuestro texto.
 *
 * Uso:
 *   npx tsx src/jobs/parlamento/refresh-sessions.ts --limit=2
 *   npx tsx src/jobs/parlamento/refresh-sessions.ts --video=Hy9MRMOllfs --force
 *   npx tsx src/jobs/parlamento/refresh-sessions.ts --discover-only
 *   npx tsx src/jobs/parlamento/refresh-sessions.ts --votes-only --limit=20
 *
 * `--votes-only` recalcula las votaciones de sesiones YA resumidas. No vuelve a
 * bajar la transcripción ni a reescribir el resumen: cuesta dos llamadas al
 * modelo por sesión en vez de veinticinco.
 *
 * Requiere `yt-dlp` en el PATH (o PARL_YTDLP con la ruta al binario).
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { connectToDatabase, disconnectFromDatabase } from "../../../shared/connection/database";
import { ParlSessionModel, ParlTranscriptModel, type ParlChamber } from "../../../shared/models";
import { callStructured } from "../../../shared/ai/structured";
import {
  chunkSegments,
  findOpinion,
  formatTimestamp,
  gateTopics,
  looksMojibake,
  refineTimestamp,
  sessionDateFromTitle,
  type TranscriptSegment,
} from "../../../shared/parlamento/summary";
import {
  findVoteMoments,
  isProceduralContext,
  matchVotesToTopics,
  topicOutcome,
  type LabelledVote,
  type TopicOutcome,
  type VoteMoment,
  type VoteScope,
} from "../../../shared/parlamento/votes";

const execFileAsync = promisify(execFile);

/** Los dos canales oficiales. Ambos pasaron la prueba de identidad del directorio. */
const CHANNELS: { id: string; chamber: ParlChamber; name: string }[] = [
  { id: "UCyM7oro5NhR5oPyMEFB_rUA", chamber: "senadores", name: "Cámara de Senadores" },
  { id: "UCUxioxgZ7obrP3wVJApAK1w", chamber: "representantes", name: "Cámara de Representantes" },
];

const UA = "Mozilla/5.0 (compatible; gastos-gub/1.0; +https://github.com/eduair94/gastos-gub-uy)";
const YTDLP = process.env.PARL_YTDLP || "yt-dlp";
const MODEL = process.env.PARL_GEMINI_MODEL || "gemini-2.5-flash-lite";
/** Una sesión de seis horas son ~24 bloques. Más que esto es un video que no es una sesión. */
const MAX_BLOCKS = Number(process.env.PARL_MAX_BLOCKS || 40);
/** Debajo de esto no hay sesión que resumir: es un saludo o un video institucional. */
const MIN_WORDS = 2_000;
const YTDLP_TIMEOUT_MS = 5 * 60 * 1000;
/**
 * Intentos de bajar la transcripción antes de sacar el video de la cola.
 *
 * Un video sin pista de subtítulos se come un cupo de cada corrida y no avanza
 * nunca: medido el 19/08/2026, once sesiones sin resumir y las dos de arriba
 * irrecuperables desde julio.
 *
 * ATENCIÓN AL TECHO. Doce intentos son seis días a dos corridas por día. Tiene
 * que ser generoso porque YouTube tarda en subtitular: los dos videos de la
 * sesión del 19/08/2026 seguían sin pista al otro día. Un techo de tres perdía
 * para siempre una sesión que sólo tardaba en llegar.
 */
const MAX_TRANSCRIPT_ATTEMPTS = Number(process.env.PARL_MAX_ATTEMPTS || 12);
/**
 * Reintentos del feed Atom de YouTube.
 *
 * Medido el 20/08/2026 desde dos IPs: cuatro de cada cinco pedidos devuelven 404
 * y el quinto devuelve el feed entero. Sin reintento, la fase de descubrir no
 * encuentra nada la mayoría de los días y las sesiones nuevas aparecen tarde.
 */
const FEED_ATTEMPTS = Number(process.env.PARL_FEED_ATTEMPTS || 6);
const FEED_RETRY_MS = 2_500;
/** Votaciones por llamada al modelo. Una sesión del Senado tiene ~50. */
const VOTES_PER_CALL = 12;
/**
 * Contexto que ve el modelo que escribe el asunto.
 *
 * Corto a propósito. Con el contexto entero, el modelo clasificó como «general»
 * la votación de una licencia: leyó el debate que venía antes y no la fórmula.
 */
const LABEL_CONTEXT_CHARS = 320;
/** Renglón simple y renglón en blanco, para armar los prompts. */
const NL = "\n";
const BLANK = "\n\n";

interface Options {
  limit: number;
  video: string | null;
  force: boolean;
  discoverOnly: boolean;
  votesOnly: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { limit: 3, video: null, force: false, discoverOnly: false, votesOnly: false, dryRun: false };
  for (const arg of argv) {
    if (arg === "--force") o.force = true;
    else if (arg === "--discover-only") o.discoverOnly = true;
    else if (arg === "--votes-only") o.votesOnly = true;
    else if (arg === "--dry-run") o.dryRun = true;
    else if (arg.startsWith("--video=")) o.video = arg.slice("--video=".length).trim() || null;
    else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error(`Invalid --limit: ${arg}`);
      o.limit = n;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return o;
}

// ─── 1. Descubrir ────────────────────────────────────────────────────────────

interface FeedVideo {
  videoId: string;
  title: string;
  publishedAt: Date;
}

/**
 * El feed Atom del canal, con reintentos.
 *
 * ATENCIÓN: el 404 de este feed casi nunca significa que el canal no existe.
 * Medido el 20/08/2026, cuatro de cada cinco pedidos devuelven 404 y el
 * siguiente devuelve el feed completo. El pedido único que había acá hacía que
 * la fase de descubrir fallara la mayoría de los días, en silencio.
 */
async function fetchFeedXml(channelId: string): Promise<string> {
  let last = "";
  for (let attempt = 1; attempt <= FEED_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return await res.text();
      last = `${res.status}`;
    } catch (error) {
      last = String(error).slice(0, 80);
    }
    if (attempt < FEED_ATTEMPTS) await sleep(FEED_RETRY_MS);
  }
  throw new Error(`feed ${channelId} → ${last} tras ${FEED_ATTEMPTS} intentos`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * El respaldo cuando el feed no contesta: la lista de subidas por `yt-dlp`.
 *
 * Es la MISMA herramienta que ya baja los subtítulos, así que no suma
 * dependencias. La lista de subidas (`UU…`) viene ordenada de la más nueva a la
 * más vieja; la pestaña `/videos` del canal NO, así que no sirve.
 *
 * TRAMPA: en modo `--flat-playlist` no viene la fecha de publicación. No hace
 * falta: la fecha de la sesión sale del título, y la de publicación sólo ordena
 * la cola. Cuando falta, se usa la del título.
 */
async function ytdlpVideos(channelId: string): Promise<FeedVideo[]> {
  const uploads = `https://www.youtube.com/playlist?list=UU${channelId.slice(2)}`;
  const { stdout } = await execFileAsync(
    YTDLP,
    ["--no-update", "--flat-playlist", "--playlist-end", "15", "-J", uploads],
    { timeout: YTDLP_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }
  );
  const parsed = JSON.parse(stdout) as { entries?: { id?: string; title?: string; timestamp?: number; release_timestamp?: number }[] };
  const out: FeedVideo[] = [];
  for (const entry of parsed.entries ?? []) {
    if (!entry.id || !entry.title) continue;
    const stamp = entry.timestamp ?? entry.release_timestamp ?? null;
    const title = entry.title;
    out.push({
      videoId: entry.id,
      title,
      publishedAt: stamp ? new Date(stamp * 1000) : sessionDateFromTitle(title, new Date()),
    });
  }
  return out;
}

async function feedVideos(channelId: string): Promise<FeedVideo[]> {
  const xml = await fetchFeedXml(channelId);
  const out: FeedVideo[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = m[1] ?? "";
    const videoId = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) ?? [])[1];
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1];
    const published = (entry.match(/<published>([^<]+)<\/published>/) ?? [])[1];
    if (!videoId || !title || !published) continue;
    out.push({ videoId, title: decodeEntities(title), publishedAt: new Date(published) });
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Un video del canal es una sesión, no un institucional.
 *
 * Las dos cámaras titulan sus sesiones de forma estable: Senadores pone la fecha
 * con barras, Representantes escribe «Sesión ...». El resto de lo que suben
 * —spots, homenajes sueltos, recorridas— no entra.
 */
function looksLikeSession(title: string): boolean {
  const t = title.toLowerCase();
  if (/sesi[óo]n/.test(t)) return true;
  if (/c[áa]mara de senadores\s*\|/.test(t)) return true;
  if (/asamblea general/.test(t)) return true;
  return false;
}

// ─── 2. Transcribir ──────────────────────────────────────────────────────────

/**
 * Subtítulos automáticos por `yt-dlp`, en JSON3, sin bajar el video.
 *
 * `--sub-langs "es.*"` toma la pista española sea `es`, `es-419` o `es-orig`.
 * El binario resuelve la firma que YouTube le pide a `timedtext`; un fetch
 * directo al `baseUrl` del player devuelve 200 con cero bytes.
 */
async function fetchTranscript(videoId: string): Promise<{ segments: TranscriptSegment[]; track: string }> {
  const dir = await mkdtemp(join(tmpdir(), "parl-"));
  try {
    await execFileAsync(
      YTDLP,
      [
        "--no-update",
        "--skip-download",
        "--write-auto-subs",
        "--sub-langs", "es.*",
        "--sub-format", "json3",
        "--retries", "3",
        "-o", join(dir, "%(id)s.%(ext)s"),
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: YTDLP_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }
    );

    const files = (await readdir(dir)).filter(f => f.endsWith(".json3"));
    if (!files.length) throw new Error("yt-dlp no dejó ninguna pista de subtítulos");
    // `es` antes que `es-orig`: la primera es la normalizada por YouTube.
    files.sort((a, b) => (a.includes("-orig") ? 1 : 0) - (b.includes("-orig") ? 1 : 0));
    const chosen = files[0]!;
    const raw = JSON.parse(await readFile(join(dir, chosen), "utf8"));

    const segments: TranscriptSegment[] = [];
    for (const e of raw.events ?? []) {
      const txt = (e.segs ?? []).map((s: any) => s.utf8).join("").replace(/\s+/g, " ").trim();
      if (txt) segments.push({ t: Math.round((e.tStartMs ?? 0) / 1000), txt });
    }
    return { segments, track: chosen.replace(/^.*\.([^.]+)\.json3$/, "$1") };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── 3. Resumir ──────────────────────────────────────────────────────────────

const BLOCK_SYSTEM = `Sos un asistente que lee la transcripción automática de una sesión del Parlamento uruguayo y dice de qué se habló.

REGLAS DURAS:
- La transcripción sale de subtítulos automáticos: tiene errores de nombres, de cifras y de palabras. Nunca cites textual. Nunca afirmes una cifra exacta.
- Escribí para una persona sin formación jurídica ni política. Frases cortas, palabras comunes, voz activa.
- No opines. No califiques a nadie ni a nada. Nada de "bueno", "grave", "histórico", "preocupante".
- Devolvé sólo los temas sustantivos. Ignorá el trámite puro (lista de asistencia, lectura de actas).
- Si el bloque no tiene ningún tema sustantivo, devolvé la lista vacía.`;

const BLOCK_SCHEMA = {
  type: "object",
  properties: {
    temas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          queSeDiscutio: { type: "string" },
        },
        required: ["titulo", "queSeDiscutio"],
      },
    },
  },
  required: ["temas"],
} as const;

const FINAL_SYSTEM = `Sos un periodista que le explica a un uruguayo común qué pasó en una sesión del Parlamento.

REGLAS DURAS:
- Lenguaje llano. Frases de veinte palabras como máximo. Nada de jerga sin explicar.
- No inventes cifras ni citas: la fuente es una transcripción automática con errores.
- No opines. Decí qué se discutió y qué efecto concreto tiene para una persona.
- "porQueImporta" es una frase sobre la vida cotidiana de alguien, no una valoración.
- "jerga" traduce las palabras del Parlamento que la gente no usa (venia, media sanción, exposición escrita).
- Ordená los temas por lo que le cambia algo a la gente, no por el orden del día.
- Máximo ocho temas. Máximo seis términos de jerga.`;

const FINAL_SCHEMA = {
  type: "object",
  properties: {
    titular: { type: "string" },
    resumen: { type: "string" },
    temas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          explicacion: { type: "string" },
          porQueImporta: { type: "string" },
          /** Índice del tema crudo que se está reescribiendo: de ahí sale el minuto. */
          origen: { type: "integer" },
        },
        required: ["titulo", "explicacion", "porQueImporta", "origen"],
      },
    },
    jerga: {
      type: "array",
      items: {
        type: "object",
        properties: { termino: { type: "string" }, significado: { type: "string" } },
        required: ["termino", "significado"],
      },
    },
  },
  required: ["titular", "resumen", "temas", "jerga"],
} as const;

/**
 * La segunda oportunidad del tema que opinó.
 *
 * El modelo, con la instrucción de no calificar, igual escribió «se celebró la
 * habilitación» y «es importante para la zona». Descartar el tema entero le
 * costaba al lector un hecho real —una planta que reabre, una unidad neonatal que
 * abre— por culpa del adjetivo. Se le devuelve el tema y se le pide el hecho sin
 * el adjetivo. Si vuelve a calificar, ahí sí se descarta.
 */
const REWRITE_SYSTEM = `Reescribís temas de una sesión del Parlamento uruguayo sacándoles toda valoración.

REGLAS DURAS:
- Quedate con el hecho. Sacá cualquier palabra que celebre, lamente, elogie o alarme.
- Nada de "se celebró", "es importante", "genera esperanza", "fortalece", "histórico", "preocupante".
- "porQueImporta" describe a quién afecta y en qué, sin decir si es bueno o malo.
- Frases cortas, palabras comunes. No agregues datos que no estén en el texto que recibís.`;

const REWRITE_SCHEMA = {
  type: "object",
  properties: {
    temas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          indice: { type: "integer" },
          titulo: { type: "string" },
          explicacion: { type: "string" },
          porQueImporta: { type: "string" },
        },
        required: ["indice", "titulo", "explicacion", "porQueImporta"],
      },
    },
  },
  required: ["temas"],
} as const;

interface RawTopic {
  titulo: string;
  queSeDiscutio: string;
  t: number;
}

async function summarize(
  session: { videoId: string; videoTitle: string; chamber: ParlChamber; durationSeconds: number },
  segments: TranscriptSegment[],
  apiKey: string
) {
  const blocks = chunkSegments(segments).slice(0, MAX_BLOCKS);
  const raw: RawTopic[] = [];
  let modelUsed = "";

  for (const [i, block] of blocks.entries()) {
    try {
      const res = await callStructured<{ temas: { titulo: string; queSeDiscutio: string }[] }>({
        apiKey,
        model: MODEL,
        systemInstruction: BLOCK_SYSTEM,
        schema: BLOCK_SCHEMA as any,
        temperature: 0,
        prompt: `Bloque ${i + 1} de ${blocks.length} de la sesión. Va del segundo ${block.tStart} al ${block.tEnd}.\n\n${block.text}`,
      });
      modelUsed = res.modelUsed;
      if (looksMojibake(JSON.stringify(res.data))) {
        console.warn(`
    bloque ${i + 1}: respuesta con encoding roto de ${res.modelUsed}`);
      }
      // El minuto sale del bloque, no del modelo.
      for (const t of res.data.temas ?? []) raw.push({ ...t, t: block.tStart });
      process.stdout.write(`    bloque ${i + 1}/${blocks.length}: ${res.data.temas?.length ?? 0} temas\r`);
    } catch (error) {
      console.warn(`\n    bloque ${i + 1} falló: ${String(error).slice(0, 120)}`);
    }
  }
  console.log("");

  if (!raw.length) return null;

  const { data, modelUsed: finalModel } = await callStructured<any>({
    apiKey,
    model: MODEL,
    systemInstruction: FINAL_SYSTEM,
    schema: FINAL_SCHEMA as any,
    temperature: 0.2,
    prompt:
      `Sesión de la ${session.chamber === "senadores" ? "Cámara de Senadores" : "Cámara de Representantes"}. ` +
      `Título del video: "${session.videoTitle}".\n\n` +
      `Temas detectados bloque por bloque, numerados desde 0:\n` +
      raw.map((t, i) => `${i}. ${t.titulo} — ${t.queSeDiscutio}`).join("\n") +
      `\n\nEscribí el resumen para el ciudadano. En "origen" poné el número del tema que estás reescribiendo.`,
  });

  const drafts = (data.temas ?? []).map((t: any) => {
    const title = String(t.titulo ?? "").trim();
    // Si el modelo apunta a un tema que no existe, el minuto queda al principio del video:
    // es preferible a inventar uno.
    const blockStart = raw[Number(t.origen)]?.t ?? 0;
    return {
      title,
      explanation: String(t.explicacion ?? "").trim(),
      whyItMatters: String(t.porQueImporta ?? "").trim(),
      // El bloque cubre veinte minutos; esto busca el segundo donde de verdad se lo nombra.
      t: refineTimestamp(title, segments, blockStart),
    };
  });

  const gated = gateTopics(drafts, session.durationSeconds);

  // Los que cayeron SÓLO por opinar vuelven a pasar por el modelo, sin el adjetivo.
  const opinionated = drafts.filter((d: any, i: number) =>
    gated.rejected.some(r => r.startsWith("opinión") && r.endsWith(`: ${d.title}`)) &&
    !gated.kept.some(k => k.title === d.title) &&
    i >= 0
  );
  const recovered: typeof gated.kept = [];
  if (opinionated.length) {
    try {
      const { data: fixed } = await callStructured<{ temas: any[] }>({
        apiKey,
        model: MODEL,
        systemInstruction: REWRITE_SYSTEM,
        schema: REWRITE_SCHEMA as any,
        temperature: 0,
        prompt:
          `Reescribí estos temas sin ninguna valoración. Devolvé el mismo índice que recibís.\n\n` +
          opinionated
            .map((t: any, i: number) => `${i}. ${t.title} — ${t.explanation} — ${t.whyItMatters}`)
            .join("\n"),
      });
      const second = (fixed.temas ?? []).map((t: any) => ({
        title: String(t.titulo ?? "").trim(),
        explanation: String(t.explicacion ?? "").trim(),
        whyItMatters: String(t.porQueImporta ?? "").trim(),
        t: opinionated[Number(t.indice)]?.t ?? 0,
      }));
      const regated = gateTopics(second, session.durationSeconds);
      recovered.push(...regated.kept);
      // El que reincide queda registrado con su motivo, no vuelve a intentarse.
      gated.rejected.push(...regated.rejected.map(r => `reescrito y aún así ${r}`));
      console.log(`    reescritos: ${recovered.length} de ${opinionated.length} recuperados`);
    } catch (error) {
      console.warn(`    reescritura falló: ${String(error).slice(0, 100)}`);
    }
  }

  const headline = String(data.titular ?? "").trim();
  const summary = String(data.resumen ?? "").trim();

  return {
    headline,
    summary,
    topics: [...gated.kept, ...recovered].sort((a, b) => a.t - b.t),
    glossary: (data.jerga ?? [])
      .map((g: any) => ({ term: String(g.termino ?? "").trim(), meaning: String(g.significado ?? "").trim() }))
      .filter((g: any) => g.term && g.meaning)
      .slice(0, 6),
    rejected: gated.rejected,
    model: finalModel || modelUsed,
    blocks: blocks.length,
  };
}

// ─── 4. Votar ────────────────────────────────────────────────────────────────

const VOTES_SYSTEM = `Leés fragmentos de una sesión del Parlamento uruguayo. Cada fragmento termina en un recuento de votos. Decís QUÉ se estaba votando.

REGLAS DURAS:
- Respondé sólo con el asunto que se vota. Máximo doce palabras. Sin comillas.
- No opines. No digas si estuvo bien o mal. No agregues nada que no esté en el fragmento.
- No repitas el recuento ni inventes números.
- Mirá primero si es trámite. "alcance" es "tramite" cuando se vota la marcha de la sesión o el simple ENVÍO de un pedido a otro organismo: licencias de legisladores, envío de una nota, de una solicitud o de una exposición escrita a un ministerio, a una intendencia o a una junta, cuartos intermedios, prórrogas de hora, suprimir la lectura, levantar la sesión, alterar el orden del día.
- "alcance" es "general" si se vota el asunto entero: un proyecto de ley en general, una designación, una venia, un artículo único, un proyecto de resolución.
- "alcance" es "parcial" si se vota una parte del asunto: un artículo, un aditivo, un sustitutivo, un desglose, una reconsideración.
- Si el fragmento dice "artículo único", el alcance es "general": ese artículo ES el asunto entero.
- Si el fragmento no deja claro qué se votaba, devolvé "asunto" vacío.`;

const VOTES_SCHEMA = {
  type: "object",
  properties: {
    votaciones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          indice: { type: "integer" },
          asunto: { type: "string" },
          alcance: { type: "string" },
        },
        required: ["indice", "asunto", "alcance"],
      },
    },
  },
  required: ["votaciones"],
} as const;

const SCOPES: VoteScope[] = ["general", "parcial", "tramite"];

/**
 * Le pone asunto a cada recuento.
 *
 * El recuento y el resultado ya están calculados: acá el modelo sólo lee lo que
 * se dijo antes y dice qué se votaba. Si opina, si el texto llega roto o si no
 * entendió, la votación queda sin asunto y no se ata a ningún tema — pero el
 * recuento igual se publica en la lista de la sesión, porque es dato duro.
 */
async function labelVotes(moments: VoteMoment[], apiKey: string): Promise<LabelledVote[]> {
  const out: LabelledVote[] = moments.map(m => ({ ...m, subject: "", scope: "parcial" as VoteScope, topicHint: -1 }));

  for (let from = 0; from < moments.length; from += VOTES_PER_CALL) {
    const batch = moments.slice(from, from + VOTES_PER_CALL);
    try {
      const { data } = await callStructured<{ votaciones: { indice: number; asunto: string; alcance: string }[] }>({
        apiKey,
        model: MODEL,
        systemInstruction: VOTES_SYSTEM,
        schema: VOTES_SCHEMA as any,
        temperature: 0,
        prompt:
          'Fragmentos numerados desde 0. Cada uno termina en el recuento de esa votación.' +
          BLANK + batch.map((m, i) => `${i}. […] ${m.context.slice(-LABEL_CONTEXT_CHARS)}`).join(BLANK),
      });
      for (const row of data.votaciones ?? []) {
        const target = out[from + Number(row.indice)];
        if (!target) continue;
        const scope = SCOPES.includes(row.alcance as VoteScope) ? (row.alcance as VoteScope) : "parcial";
        const subject = String(row.asunto ?? "").trim().replace(/^[«"']|[»"']$/g, "");
        // La fórmula de sala le gana al modelo: marcó como decisión de la cámara
        // once licencias de la sesión de Diputados del 18/08.
        target.scope = isProceduralContext(target.context.slice(-LABEL_CONTEXT_CHARS)) ? "tramite" : scope;
        // Un asunto que califica o que llegó roto no se publica. El recuento sí.
        if (subject && !findOpinion(subject) && !looksMojibake(subject)) target.subject = subject;
      }
    } catch (error) {
      console.warn(`    votaciones ${from}-${from + batch.length}: ${String(error).slice(0, 100)}`);
    }
  }

  return out;
}

const MAP_SYSTEM = `Tenés los temas de una sesión del Parlamento uruguayo y una lista de votaciones de esa misma sesión. Decís a qué tema pertenece cada votación.

REGLAS DURAS:
- La mayoría de las votaciones NO pertenece a ningún tema. La lista de temas cuenta ocho asuntos de una sesión de seis horas. Poné -1.
- Dos asuntos seguidos y parecidos son asuntos distintos: la venia de una jueza no es la venia de un policía.
- Una votación pertenece a un tema sólo si vota ESE asunto: el proyecto entero, uno de sus artículos, un aditivo suyo o un sustitutivo suyo.
- "Artículo único", "sustitutivo" y "en general" no nombran nada. Ahí mirá el texto que viene después, que es lo que se estaba leyendo en sala.
- Una votación es POSTERIOR al minuto en que arranca su tema. Nunca la mandes a un tema que arranca después.
- No cambies el asunto. No inventes votaciones. Devolvé una respuesta por cada votación que recibís.`;

const MAP_SCHEMA = {
  type: "object",
  properties: {
    votaciones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          indice: { type: "integer" },
          tema: { type: "integer" },
        },
        required: ["indice", "tema"],
      },
    },
  },
  required: ["votaciones"],
} as const;

/** Votaciones por llamada de mapeo. Cada una lleva su asunto y su contexto. */
const MAP_PER_CALL = 20;
/**
 * Contexto que viaja al mapeo. Acá va entero.
 *
 * «Proyecto en general» no dice nada. Lo que identifica el asunto es el texto
 * que se estaba leyendo en sala medio minuto antes.
 */
const MAP_CONTEXT_CHARS = 900;

/**
 * A qué tema pertenece cada votación, según el modelo.
 *
 * VA APARTE DEL ETIQUETADO A PROPÓSITO. La primera versión hacía las dos cosas
 * en una llamada, con los temas a la vista, y el modelo copiaba el título del
 * tema como asunto de la votación: seis votaciones distintas quedaron con el
 * mismo nombre. Separadas, el asunto sale del fragmento y el mapeo sólo elige.
 *
 * Lo que devuelve es una PISTA. `matchVotesToTopics` la acepta o la tira.
 */
async function mapVotesToTopics(
  votes: LabelledVote[],
  topics: { title: string; explanation: string; t: number }[],
  apiKey: string
): Promise<void> {
  if (!topics.length) return;
  const candidates = votes.filter(v => v.scope !== "tramite" && v.subject.trim());
  const topicList = `Temas, numerados desde 0, con el minuto en que arrancan:${BLANK}${
    topics.map((t, i) => `${i}. [${formatTimestamp(t.t)}] ${t.title} — ${t.explanation}`).join(NL)
  }`;

  for (let from = 0; from < candidates.length; from += MAP_PER_CALL) {
    const batch = candidates.slice(from, from + MAP_PER_CALL);
    try {
      const { data } = await callStructured<{ votaciones: { indice: number; tema: number }[] }>({
        apiKey,
        model: MODEL,
        systemInstruction: MAP_SYSTEM,
        schema: MAP_SCHEMA as any,
        temperature: 0,
        prompt:
          topicList + BLANK +
          `Votaciones, numeradas desde 0, con su minuto. Cada una trae el asunto y lo que se dijo alrededor:` + BLANK +
          batch
            .map((v, i) => `${i}. [${formatTimestamp(v.t)}] ${v.subject} […] ${v.context.slice(-MAP_CONTEXT_CHARS)}`)
            .join(NL),
      });
      for (const row of data.votaciones ?? []) {
        const target = batch[Number(row.indice)];
        if (!target) continue;
        const topic = Number(row.tema);
        target.topicHint = Number.isInteger(topic) && topic >= 0 && topic < topics.length ? topic : -1;
      }
    } catch (error) {
      console.warn(`    mapeo ${from}-${from + batch.length}: ${String(error).slice(0, 100)}`);
    }
  }
}

/** Ata cada votación a su tema y deja escrito el resultado de cada tema. */
function attachVotes<T extends { title: string; explanation: string; t: number }>(
  topics: T[],
  votes: LabelledVote[]
): (T & { votes: LabelledVote[]; outcome: TopicOutcome })[] {
  const matched = matchVotesToTopics(votes, topics);
  const buckets: LabelledVote[][] = topics.map(() => []);
  for (const [i, target] of matched.entries()) {
    if (target >= 0) buckets[target]!.push(votes[i]!);
  }
  return topics.map((topic, i) => {
    const mine = buckets[i]!.slice().sort((a, b) => a.t - b.t);
    return { ...topic, votes: mine, outcome: topicOutcome(mine) };
  });
}

// ─── Orquestación ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY || process.env.FREE_GEMINI_API_KEY || "";

  await connectToDatabase();

  // 1. Descubrir
  let discovered = 0;
  for (const channel of CHANNELS) {
    try {
      let videos: FeedVideo[] = [];
      try {
        videos = await feedVideos(channel.id);
      } catch (error) {
        console.warn(`  ${channel.name}: feed caído (${String(error).slice(0, 60)}), voy por yt-dlp`);
        videos = await ytdlpVideos(channel.id);
      }
      for (const v of videos) {
        if (!looksLikeSession(v.title)) continue;
        const exists = await ParlSessionModel.exists({ videoId: v.videoId });
        if (exists) continue;
        if (opts.dryRun) {
          console.log(`  [dry-run] nueva sesión: ${channel.name} — ${v.title}`);
          discovered++;
          continue;
        }
        await ParlSessionModel.create({
          videoId: v.videoId,
          chamber: channel.chamber,
          videoTitle: v.title,
          sessionDate: sessionDateFromTitle(v.title, v.publishedAt),
          publishedAt: v.publishedAt,
          durationSeconds: 0,
          transcriptWords: 0,
        });
        discovered++;
      }
      console.log(`  ${channel.name}: feed leído`);
    } catch (error) {
      console.warn(`  ${channel.name}: ${String(error).slice(0, 120)}`);
    }
  }
  console.log(`Sesiones nuevas: ${discovered}`);

  if (opts.discoverOnly || opts.dryRun) {
    await disconnectFromDatabase();
    return;
  }

  // 2 y 3. La cola: lo que no tiene resumen, lo más nuevo primero.
  // ATENCIÓN: `$lt` no matchea el documento que no tiene el campo, y los que se
  // crearon antes de esta guarda no lo tienen. Por eso el `$or` con `$exists`.
  const withinAttempts = {
    $or: [{ transcriptAttempts: { $lt: MAX_TRANSCRIPT_ATTEMPTS } }, { transcriptAttempts: { $exists: false } }],
  };
  const query = opts.video
    ? { videoId: opts.video }
    : opts.votesOnly
      ? { summarizedAt: { $ne: null } }
      : opts.force
        ? {}
        : { $and: [{ $or: [{ summarizedAt: null }, { transcriptWords: 0 }] }, withinAttempts] };

  const pending = await ParlSessionModel.find(query)
    .sort(opts.votesOnly ? { sessionDate: -1 } : { publishedAt: -1 })
    .limit(opts.limit);
  console.log(`Por procesar: ${pending.length}`);

  // `--votes-only` no toca el resumen: recalcula el recuento y vuelve a atarlo.
  if (opts.votesOnly) {
    for (const session of pending) {
      const stored = await ParlTranscriptModel.findOne({ videoId: session.videoId });
      if (!stored) {
        console.log(`  ${session.videoId}: sin transcripción guardada`);
        continue;
      }
      const moments = findVoteMoments(stored.segments as TranscriptSegment[], session.chamber);
      const stale = session.topics as unknown as { title: string; explanation: string; t: number }[];
      const votes = moments.length ? await labelVotes(moments, apiKey) : [];
      if (votes.length) await mapVotesToTopics(votes, stale, apiKey);
      const topics = attachVotes(stale, votes);
      session.votes = votes as any;
      session.topics = topics as any;
      await session.save();
      const named = votes.filter(v => v.subject).length;
      const tied = topics.filter((t: any) => t.votes.length).length;
      console.log(`  ✓ ${session.videoId}: ${votes.length} votaciones (${named} con asunto), ${tied}/${topics.length} temas con resultado`);
    }
    await disconnectFromDatabase();
    return;
  }

  for (const session of pending) {
    console.log(`\n▶ ${session.videoTitle} (${session.videoId})`);
    try {
      let segments: TranscriptSegment[] = [];
      const stored = await ParlTranscriptModel.findOne({ videoId: session.videoId });
      if (stored && !opts.force) {
        segments = stored.segments as TranscriptSegment[];
        console.log(`  transcripción en base: ${stored.words} palabras`);
      } else {
        const fetched = await fetchTranscript(session.videoId).catch(async (error) => {
          // El intento se cuenta acá y no en el catch de abajo: sólo la bajada de
          // subtítulos es la que nunca se recupera.
          session.transcriptAttempts = (session.transcriptAttempts ?? 0) + 1;
          session.transcriptError = String(error).slice(0, 200);
          await session.save();
          throw error;
        });
        segments = fetched.segments;
        const words = segments.reduce((a, s) => a + s.txt.split(/\s+/).length, 0);
        await ParlTranscriptModel.updateOne(
          { videoId: session.videoId },
          { $set: { videoId: session.videoId, segments, words, fetchedAt: new Date() } },
          { upsert: true }
        );
        session.transcriptWords = words;
        session.transcriptTrack = fetched.track;
        session.transcribedAt = new Date();
        session.transcriptError = null;
        session.durationSeconds = segments.length ? segments[segments.length - 1]!.t : 0;
        await session.save();
        console.log(`  transcripción: ${words} palabras, ${Math.round(session.durationSeconds / 60)} min`);
      }

      const words = segments.reduce((a, s) => a + s.txt.split(/\s+/).length, 0);
      if (words < MIN_WORDS) {
        console.log(`  se saltea: ${words} palabras es menos que una sesión`);
        session.transcriptError = `sólo ${words} palabras`;
        await session.save();
        continue;
      }

      const result = await summarize(
        { videoId: session.videoId, videoTitle: session.videoTitle, chamber: session.chamber, durationSeconds: session.durationSeconds },
        segments,
        apiKey
      );
      if (!result) {
        console.log("  el modelo no devolvió ningún tema");
        continue;
      }

      // Si el texto llegó con el encoding roto, no se publica: un resumen ilegible es
      // peor que una sesión sin resumen.
      const blob = [result.headline, result.summary, ...result.topics.map(t => `${t.title} ${t.explanation}`)].join(" ");
      if (looksMojibake(blob)) {
        console.warn("  texto con encoding roto: no se guarda");
        session.transcriptError = "resumen con encoding roto";
        await session.save();
        continue;
      }

      if (process.env.PARL_DUMP) {
        (await import("node:fs")).writeFileSync(process.env.PARL_DUMP, JSON.stringify(result, null, 1), "utf8");
      }
      // 4. Las votaciones. El recuento lo saca el código; el asunto, el modelo.
      const moments = findVoteMoments(segments, session.chamber);
      const votes = moments.length ? await labelVotes(moments, apiKey) : [];
      if (votes.length) await mapVotesToTopics(votes, result.topics, apiKey);
      const topics = attachVotes(result.topics, votes);

      session.headline = result.headline;
      session.summary = result.summary;
      session.topics = topics as any;
      session.votes = votes as any;
      session.glossary = result.glossary;
      session.rejectedPhrases = result.rejected;
      session.model = result.model;
      session.blocks = result.blocks;
      session.summarizedAt = new Date();
      await session.save();

      const tied = topics.filter(t => t.votes.length).length;
      console.log(`  ✓ ${result.topics.length} temas · ${votes.length} votaciones (${tied} temas con resultado) · ${result.glossary.length} términos · ${result.rejected.length} rechazados (${result.model})`);
      console.log(`    ${result.headline}`);
      for (const r of result.rejected.slice(0, 3)) console.log(`    ✗ ${r.slice(0, 100)}`);
    } catch (error) {
      const message = String(error).slice(0, 200);
      console.warn(`  falló: ${message}`);
      session.transcriptError = message;
      await session.save();
    }
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
