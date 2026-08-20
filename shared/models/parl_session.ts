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
 * La VOTACIÓN es una cuarta capa, y es la más firme de las tres últimas: el
 * recuento («27 en 27») lo canta la presidencia y el subtitulado lo escribe en
 * dígitos. Aun así pasa por el video: `IParlVote.t` abre el minuto exacto.
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

/**
 * Una votación de la sesión.
 *
 * El recuento (`inFavor` en `present`) lo canta la presidencia y lo escribe el
 * subtitulado en dígitos. `subject` lo escribe el modelo leyendo lo que se dijo
 * antes del recuento. Las dos cosas pueden estar mal, y por eso cada votación
 * lleva su `t`: el lector abre el video y lo escucha. Ver shared/parlamento/votes.ts.
 */
export interface IParlVote {
  /** Segundo del video donde se cantó el recuento. */
  t: number;
  /** Votos a favor. */
  inFavor: number;
  /** Legisladores presentes en sala. */
  present: number;
  /** `afirmativa` cuando los votos a favor pasan la mitad de los presentes. */
  result: "afirmativa" | "negativa";
  /** Qué mayoría alcanzó el recuento. Una venia de ascenso pide dos tercios. */
  majority: "unanimidad" | "dos-tercios" | "simple";
  /** Qué se votó, en una frase corta. */
  subject: string;
  /** `general` es el asunto entero. `parcial` es un artículo. `tramite` es la casa. */
  scope: "general" | "parcial" | "tramite";
}

/** Una cifra que se dijo, con la oración que la contiene. */
export interface IParlFigure {
  value: string;
  sentence: string;
}

export interface IParlTopic {
  /** Título corto, en palabras de todos los días. */
  title: string;
  /** Qué se discutió, dos o tres frases llanas. */
  explanation: string;
  /** Por qué le importa a una persona común, en una frase. */
  whyItMatters: string;
  /** Segundo del video donde empieza. Calculado del bloque, nunca pedido al modelo. */
  t: number;
  /** Las votaciones que se ataron a este tema, en orden. */
  votes: IParlVote[];
  /** Qué pasó con el asunto. `sin-votacion` = no se le encontró votación. */
  outcome: "aprobado" | "rechazado" | "mixto" | "sin-votacion";
  /** Las cifras que el portón sacó de la prosa. Se publican aparte y con aviso. */
  figures: IParlFigure[];
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
  /**
   * Intentos fallidos de bajar la transcripción.
   *
   * Un video sin pista de subtítulos se come un cupo de cada corrida y el atraso
   * no baja nunca. A partir de `MAX_TRANSCRIPT_ATTEMPTS` el video sale de la
   * cola. Ese techo es alto a propósito: YouTube tarda días en subtitular una
   * sesión de seis horas, y un video que todavía no llegó no está perdido.
   */
  transcriptAttempts: number;

  // ─── Resumen ──────────────────────────────────────────────────────────────
  /** Una línea que dice qué pasó en la sesión. */
  headline: string | null;
  /** Cinco a ocho frases llanas. */
  summary: string | null;
  topics: IParlTopic[];
  /**
   * Todas las votaciones de la sesión, en orden, incluso las de trámite y las
   * que ningún tema reclamó. `topics[].votes` es un subconjunto de esta lista.
   */
  votes: IParlVote[];
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

const ParlVoteSchema = new Schema<IParlVote>(
  {
    t: { type: Number, required: true },
    inFavor: { type: Number, required: true },
    present: { type: Number, required: true },
    result: { type: String, required: true },
    majority: { type: String, required: true },
    subject: { type: String, default: "" },
    scope: { type: String, default: "parcial" },
  },
  { _id: false }
);

const ParlFigureSchema = new Schema<IParlFigure>(
  {
    value: { type: String, required: true },
    sentence: { type: String, required: true },
  },
  { _id: false }
);

const ParlTopicSchema = new Schema<IParlTopic>(
  {
    title: { type: String, required: true },
    explanation: { type: String, required: true },
    whyItMatters: { type: String, default: "" },
    t: { type: Number, required: true },
    votes: { type: [ParlVoteSchema], default: [] },
    outcome: { type: String, default: "sin-votacion" },
    figures: { type: [ParlFigureSchema], default: [] },
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
    transcriptAttempts: { type: Number, default: 0 },

    headline: { type: String, default: null },
    summary: { type: String, default: null },
    topics: { type: [ParlTopicSchema], default: [] },
    votes: { type: [ParlVoteSchema], default: [] },
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
