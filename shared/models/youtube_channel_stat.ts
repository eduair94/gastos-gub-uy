import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Las cifras vivas de cada canal del directorio de `/canales-youtube`.
 *
 * QUÉ SE MUEVE Y QUÉ NO. El módulo `app/data/canales-youtube.ts` es la parte
 * CURADA: quién entra, con qué prueba de identidad y por qué importa. Eso lo
 * decide una persona y no lo toca ningún job. Lo que envejece solo —los
 * suscriptores, el total de videos, la fecha del último— vive acá y lo reescribe
 * `src/jobs/refresh-youtube-channels.ts` todas las noches.
 *
 * La página prefiere esta colección y cae al módulo cuando falta: un canal recién
 * agregado a mano se publica igual, con la cifra del día en que se lo agregó,
 * hasta que el job pase por él.
 *
 * `sample` es la medición de qué publica el canal, rehecha con los mismos
 * criterios de `shared/youtube/topics.ts` que usa la página para el feed en vivo.
 */
export interface IYoutubeChannelStat {
  /** Identificador de YouTube (UC…). Clave del upsert y del cruce con el módulo. */
  channelId: string;
  /** Suscriptores con la redacción de YouTube («23,8 mil»). null = el canal los oculta. */
  subscribers: string | null;
  /** El mismo número, para ordenar. */
  subscribersApprox: number;
  videos: string | null;
  views: string | null;
  /** País que YouTube publica. Si deja de decir «Uruguay», la ficha lo tiene que revisar. */
  country: string | null;
  /** ISO de la fecha del último video del feed público. */
  lastUpload: string | null;
  /** Descripción que publica el canal, textual. */
  selfDescription: string | null;
  /** Alta del canal, con las palabras de YouTube. */
  joined: string | null;

  /** Qué publica: la medición sobre sus títulos recientes. */
  sample: {
    n: number;
    topicHits: number;
    mentions: Record<string, number>;
  };

  /** De dónde salieron las cifras: `api` (YouTube Data v3) o `scrape`. */
  source: "api" | "scrape";
  checkedAt: Date;
  /** Por qué falló la última pasada, cuando falló. */
  error: string | null;
}

const YoutubeChannelStatSchema = new Schema<IYoutubeChannelStat>(
  {
    channelId: { type: String, required: true },
    subscribers: { type: String, default: null },
    subscribersApprox: { type: Number, default: 0 },
    videos: { type: String, default: null },
    views: { type: String, default: null },
    country: { type: String, default: null },
    lastUpload: { type: String, default: null },
    selfDescription: { type: String, default: null },
    joined: { type: String, default: null },
    sample: {
      n: { type: Number, default: 0 },
      topicHits: { type: Number, default: 0 },
      mentions: { type: Object, default: {} },
    },
    source: { type: String, default: "scrape" },
    checkedAt: { type: Date, required: true },
    error: { type: String, default: null },
  },
  { collection: "youtube_channel_stats" }
);

// Built by scripts/ensure-indexes.ts only — autoIndex is off.
YoutubeChannelStatSchema.index({ channelId: 1 }, { unique: true });
YoutubeChannelStatSchema.index({ checkedAt: 1 });

export const YoutubeChannelStatModel =
  mongoose.models.YoutubeChannelStat ||
  mongoose.model<IYoutubeChannelStat>("YoutubeChannelStat", YoutubeChannelStatSchema);
