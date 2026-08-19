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
  gateTopics,
  looksMojibake,
  refineTimestamp,
  sessionDateFromTitle,
  type TranscriptSegment,
} from "../../../shared/parlamento/summary";

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

interface Options {
  limit: number;
  video: string | null;
  force: boolean;
  discoverOnly: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { limit: 3, video: null, force: false, discoverOnly: false, dryRun: false };
  for (const arg of argv) {
    if (arg === "--force") o.force = true;
    else if (arg === "--discover-only") o.discoverOnly = true;
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

async function feedVideos(channelId: string): Promise<FeedVideo[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`feed ${channelId} → ${res.status}`);
  const xml = await res.text();
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

// ─── Orquestación ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY || process.env.FREE_GEMINI_API_KEY || "";

  await connectToDatabase();

  // 1. Descubrir
  let discovered = 0;
  for (const channel of CHANNELS) {
    try {
      const videos = await feedVideos(channel.id);
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
  const query = opts.video
    ? { videoId: opts.video }
    : opts.force
      ? {}
      : { $or: [{ summarizedAt: null }, { transcriptWords: 0 }] };

  const pending = await ParlSessionModel.find(query).sort({ publishedAt: -1 }).limit(opts.limit);
  console.log(`Por procesar: ${pending.length}`);

  for (const session of pending) {
    console.log(`\n▶ ${session.videoTitle} (${session.videoId})`);
    try {
      let segments: TranscriptSegment[] = [];
      const stored = await ParlTranscriptModel.findOne({ videoId: session.videoId });
      if (stored && !opts.force) {
        segments = stored.segments as TranscriptSegment[];
        console.log(`  transcripción en base: ${stored.words} palabras`);
      } else {
        const fetched = await fetchTranscript(session.videoId);
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
      session.headline = result.headline;
      session.summary = result.summary;
      session.topics = result.topics;
      session.glossary = result.glossary;
      session.rejectedPhrases = result.rejected;
      session.model = result.model;
      session.blocks = result.blocks;
      session.summarizedAt = new Date();
      await session.save();

      console.log(`  ✓ ${result.topics.length} temas · ${result.glossary.length} términos · ${result.rejected.length} rechazados (${result.model})`);
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
