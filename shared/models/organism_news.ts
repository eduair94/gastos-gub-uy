import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Prensa sobre las compras de cada organismo. Una fila por organismo (`buyerId`).
 *
 * Escrito por src/jobs/refresh-organism-news.ts. Ver shared/news-search.ts para por qué
 * esto existe por ORGANISMO y no por proveedor: la búsqueda por nombre de empresa es
 * ruido puro y medido (MOTOCICLO trae choques en Cuba, DIVINO trae "Divino Salvador del
 * Mundo"), y colgarle a una empresa una noticia ajena no se arregla con una aclaración.
 *
 * Se guarda TODO organismo consultado, incluidos los que no dieron ninguna nota
 * relevante (`items: []`), para que la UI distinga "no hay prensa" de "no lo buscamos" y
 * para no repetir la consulta la noche siguiente.
 *
 * Lo guardado es el resultado de una BÚSQUEDA, no una curaduría: no verificamos el
 * contenido ni lo respaldamos. Por eso cada ítem viaja con medio, fecha y enlace.
 */
export interface IOrganismNewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: Date | null;
}

export interface IOrganismNews {
  buyerId: string;
  buyerName: string;
  /** Nombre + alias con los que se buscó, para poder auditar por qué entró una nota. */
  queriedAs: string[];
  fetchedAt: Date;
  /** Cuántas devolvió el feed antes de filtrar — el denominador del filtro. */
  rawCount: number;
  items: IOrganismNewsItem[];
}

const OrganismNewsItemSchema = new Schema<IOrganismNewsItem>(
  {
    title: { type: String, required: true },
    link: { type: String, required: true },
    source: { type: String, default: "" },
    publishedAt: { type: Date, default: null },
  },
  { _id: false }
);

const OrganismNewsSchema = new Schema<IOrganismNews>(
  {
    buyerId: { type: String, required: true },
    buyerName: { type: String, required: true },
    queriedAs: { type: [String], default: [] },
    fetchedAt: { type: Date, required: true },
    rawCount: { type: Number, required: true, default: 0 },
    items: { type: [OrganismNewsItemSchema], default: [] },
  },
  { collection: "organism_news" }
);

// Construidos sólo por scripts/ensure-indexes.ts — autoIndex está apagado.
OrganismNewsSchema.index({ buyerId: 1 }, { unique: true });
// El recorrido nocturno: los menos frescos primero.
OrganismNewsSchema.index({ fetchedAt: 1 });

export const OrganismNewsModel =
  mongoose.models.OrganismNews || mongoose.model<IOrganismNews>("OrganismNews", OrganismNewsSchema);
