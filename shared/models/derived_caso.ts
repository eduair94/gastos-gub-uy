import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Fichas de caso ARMADAS a partir de los datos, no escritas a mano.
 *
 * POR QUÉ VIVEN EN MONGO Y NO EN TS. Las 141 fichas curadas son 7.320 líneas de módulo, y el
 * bundle de Nitro las carga enteras en cada worker de pm2. Mil fichas más serían unas 60.000
 * líneas residentes por worker. Lo derivado se puede volver a armar con un comando, así que
 * no gana nada por estar en git y sí cuesta memoria en producción.
 *
 * `def` guarda un CasoDef completo, con la misma forma que un dossier curado. Así el lector
 * unificado mezcla las dos fuentes sin traducir nada, y las páginas no se enteran de que hay
 * dos orígenes.
 *
 * NUNCA BORRES POR `$ne` DE GENERACIÓN. Dos corridas que se pisan se aniquilan entre sí: ya
 * pasó en este repo y dejó una colección vacía en producción. El armador junta los slugs de
 * SU corrida y borra sólo lo que sobra de esa lista.
 */
export type DerivedCasoOrigin = "reiteracion" | "medicion";

export interface IDerivedCaso {
  slug: string;
  origin: DerivedCasoOrigin;
  /** Marca de la corrida que la escribió. Sirve para auditar, no para borrar. */
  generation: string;
  builtAt: Date;
  /** Orden dentro del carril. Menor primero. */
  rank: number;
  def: Record<string, unknown>;
}

const DerivedCasoSchema = new Schema<IDerivedCaso>(
  {
    slug: { type: String, required: true },
    origin: { type: String, required: true },
    generation: { type: String, required: true },
    builtAt: { type: Date, required: true },
    rank: { type: Number, required: true, default: 0 },
    def: { type: Schema.Types.Mixed, required: true },
  },
  { collection: "derived_casos" }
);

// Construidos sólo por scripts/ensure-indexes.ts. `autoIndex` está apagado.
DerivedCasoSchema.index({ slug: 1 }, { unique: true });
DerivedCasoSchema.index({ origin: 1, rank: 1 });
DerivedCasoSchema.index({ "def.theme": 1, rank: 1 });

export const DerivedCasoModel =
  mongoose.models.DerivedCaso ||
  mongoose.model<IDerivedCaso>("DerivedCaso", DerivedCasoSchema);
