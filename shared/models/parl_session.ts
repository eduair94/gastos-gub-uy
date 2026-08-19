import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Una sesión del Parlamento, contada para quien no sigue política.
 *
 * QUÉ ES CADA CAPA, y no se mezclan nunca en la UI:
 *
 *   1. El VIDEO: id, cámara, fecha y duración. Es dato duro del canal oficial.
 *   2. La TRANSCRIPCIÓN: subtítulos AUTOMÁTICOS de YouTube. Es una máquina
 *      escuchando, con errores de nombres y de cifras.
 *   3. El RESUMEN: una segunda máquina leyendo a la primera.
 *
 * Por eso ninguna cifra ni cita textual de esta colección puede publicarse como
 * un hecho verificado. Lo que se publica es "de esto se habló, y acá está el
 * minuto del video para que lo escuches vos". El minuto es la prueba, no el texto.
 *
 * `topics[].t` NO lo elige el modelo. Sale del bloque de transcripción que el
 * modelo estaba leyendo, calculado en código: un modelo al que se le pide un
 * timestamp devuelve el número que le parece, y en la primera prueba devolvió
 * minutos desordenados que no existían.
 *
 * Escrito por src/jobs/parlamento/refresh-sessions.ts.
 */

/** De qué cámara es la sesión. `asamblea` es la Asamblea General (las dos juntas). */
export type ParlChamber = "senadores" | "representantes" | "asamblea";

export interface IParlTopic {
  /** Título corto, en palabras de todos los días. */
  title: string;
  /** Qué se discutió, dos o tres frases llanas. */
  explanation: string;
  /** Por qué le importa a una persona común, en una frase. */
  whyItMatters: string;
  /** Segundo del video donde empieza. Calculado del bloque, nunca pedido al modelo. */
  t: number;
}

export interface IParlTerm {
  /** La palabra del Parlamento que la gente no usa. */
  term: string;
  /** Qué significa, en llano. */
  meaning: string;
}

export interface IParlSession {
  /** Id del video de YouTube. Clave de todo. */
  videoId: string;
  chamber: ParlChamber;
  /** Título del video, tal como lo publicó la cámara. */
  videoTitle: string;
  /** Fecha de la sesión. Sale del título cuando lo dice; si no, de la publicación. */
  sessionDate: Date;
  /** Fecha en que el canal publicó el video. */
  publishedAt: Date;
  /** Duración en segundos. */
  durationSeconds: number;

  // ─── Transcripción ────────────────────────────────────────────────────────
  /** Palabras que devolvió el subtitulado automático. 0 = todavía no se bajó. */
  transcriptWords: number;
  /** Idioma del track usado, con su tipo (`es/asr`). */
  transcriptTrack: string | null;
  /** Cuándo se bajó la transcripción. */
  transcribedAt: Date | null;
  /** Por qué no hay transcripción, cuando no la hay. */
  transcriptError: string | null;

  // ─── Resumen ──────────────────────────────────────────────────────────────
  /** Una línea que dice qué pasó en la sesión. */
  headline: string | null;
  /** Cinco a ocho frases llanas. */
  summary: string | null;
  topics: IParlTopic[];
  /** Jerga parlamentaria traducida. */
  glossary: IParlTerm[];
  /** Modelo que escribió el resumen, para trazabilidad (`claude:sonnet`, `gemini-…`). */
  model: string | null;
  /** Bloques de transcripción que se leyeron para armarlo. */
  blocks: number;
  summarizedAt: Date | null;
  /** Frases que el filtro de opinión rechazó. Se guardan para poder auditarlo. */
  rejectedPhrases: string[];
}

const ParlTopicSchema = new Schema<IParlTopic>(
  {
    title: { type: String, required: true },
    explanation: { type: String, required: true },
    whyItMatters: { type: String, default: "" },
    t: { type: Number, required: true },
  },
  { _id: false }
);

const ParlTermSchema = new Schema<IParlTerm>(
  {
    term: { type: String, required: true },
    meaning: { type: String, required: true },
  },
  { _id: false }
);

const ParlSessionSchema = new Schema<IParlSession>(
  {
    videoId: { type: String, required: true },
    chamber: { type: String, required: true },
    videoTitle: { type: String, required: true },
    sessionDate: { type: Date, required: true },
    publishedAt: { type: Date, required: true },
    durationSeconds: { type: Number, default: 0 },

    transcriptWords: { type: Number, default: 0 },
    transcriptTrack: { type: String, default: null },
    transcribedAt: { type: Date, default: null },
    transcriptError: { type: String, default: null },

    headline: { type: String, default: null },
    summary: { type: String, default: null },
    topics: { type: [ParlTopicSchema], default: [] },
    glossary: { type: [ParlTermSchema], default: [] },
    model: { type: String, default: null },
    blocks: { type: Number, default: 0 },
    summarizedAt: { type: Date, default: null },
    rejectedPhrases: { type: [String], default: [] },
  },
  { collection: "parl_sessions" }
);

// Built by scripts/ensure-indexes.ts only — autoIndex is off.
ParlSessionSchema.index({ videoId: 1 }, { unique: true });
ParlSessionSchema.index({ sessionDate: -1 });
ParlSessionSchema.index({ chamber: 1, sessionDate: -1 });
// La cola del job: primero lo que no tiene resumen.
ParlSessionSchema.index({ summarizedAt: 1, publishedAt: -1 });

export const ParlSessionModel =
  mongoose.models.ParlSession || mongoose.model<IParlSession>("ParlSession", ParlSessionSchema);

/**
 * La transcripción va en su propia colección porque pesa: una sesión de seis
 * horas son ~190 KB de texto, y la lista de sesiones no la necesita nunca.
 */
export interface IParlTranscript {
  videoId: string;
  /** Segmentos `{t, txt}` del subtitulado, en orden. */
  segments: { t: number; txt: string }[];
  words: number;
  fetchedAt: Date;
}

const ParlTranscriptSchema = new Schema<IParlTranscript>(
  {
    videoId: { type: String, required: true },
    segments: { type: [{ t: Number, txt: String, _id: false }], default: [] },
    words: { type: Number, default: 0 },
    fetchedAt: { type: Date, required: true },
  },
  { collection: "parl_transcripts" }
);

ParlTranscriptSchema.index({ videoId: 1 }, { unique: true });

export const ParlTranscriptModel =
  mongoose.models.ParlTranscript || mongoose.model<IParlTranscript>("ParlTranscript", ParlTranscriptSchema);
