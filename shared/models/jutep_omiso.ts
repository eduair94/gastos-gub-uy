import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Funcionarios declarados omisos — JUTEP's public roster of public officials formally declared
 * delinquent in their duty to file the sworn declaration of assets and income (Ley 17.060 arts. 10,
 * 11 and 13, of 23 December 1998).
 *
 * PUBLICATION IS THE LAW'S OWN CHOICE. Art. 18 of Ley 17.060 makes the CONTENT of a declaration
 * confidential, but the fact of having been declared omiso is published by JUTEP itself as open
 * data, and art. 13 requires the omission to be published in the Diario Oficial. This collection
 * mirrors that public roster and nothing else: it holds no declaration content, no assets and no
 * income.
 *
 * The document number is stored because it is IN the published file and is what disambiguates two
 * officials with the same name — but see the loader for why it is never rendered in full.
 *
 * Loaded by src/jobs/load-jutep-omisos.ts (upsert by the natural key, no swap: JUTEP republishes
 * cumulatively and a row that disappears is a correction, not a deletion we should mirror blindly).
 */
export interface IJutepOmiso {
  /** Natural key: document + the date the omission was declared. */
  omisoKey: string;
  /** Cédula as published. Never rendered in full — the API masks it. */
  documento: string;
  nombre: string | null;
  apellido: string | null;
  /** Full name as published, for search. */
  displayName: string;
  cargo: string | null;
  /** When JUTEP declared the omission. */
  fechaOmision: Date | null;
  /** The employing body, as published. */
  organismo: string | null;
  /** The budget inciso, as published (a NAME, not a number). */
  inciso: string | null;
  /**
   * Our `buyer.id` inciso prefix, when the published inciso name could be resolved to one. Null is
   * common and expected: JUTEP names bodies (juntas departamentales, entes) that never appear as a
   * procurement buyer. Never guessed — see INCISO_BY_JUTEP_NAME.
   */
  incisoCode: string | null;
  sourceUrl: string;
  loadedAt: Date;
}

const JutepOmisoSchema = new Schema<IJutepOmiso>(
  {
    omisoKey: { type: String, required: true },
    documento: { type: String, required: true },
    nombre: { type: String, default: null },
    apellido: { type: String, default: null },
    displayName: { type: String, required: true },
    cargo: { type: String, default: null },
    fechaOmision: { type: Date, default: null },
    organismo: { type: String, default: null },
    inciso: { type: String, default: null },
    incisoCode: { type: String, default: null },
    sourceUrl: { type: String, required: true },
    loadedAt: { type: Date, required: true },
  },
  { collection: "jutep_omisos" }
);

// Built by scripts/ensure-indexes.ts only — autoIndex is off.
JutepOmisoSchema.index({ omisoKey: 1 }, { unique: true });
JutepOmisoSchema.index({ incisoCode: 1 });
JutepOmisoSchema.index({ fechaOmision: -1 });
JutepOmisoSchema.index({ organismo: 1 });

export const JutepOmisoModel =
  mongoose.models.JutepOmiso || mongoose.model<IJutepOmiso>("JutepOmiso", JutepOmisoSchema);
