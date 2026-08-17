import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Sentencias de la Base de Jurisprudencia Nacional donde se condena a pagar.
 *
 * Origen: bjn.poderjudicial.gub.uy, la base pública del Poder Judicial. Cada documento es una
 * sentencia, con su cabecera (shared/bjn-hoja.ts) y la lectura de su parte dispositiva
 * (shared/bjn-award.ts).
 *
 * NO HAY NOMBRES DE PARTICULARES ACÁ, Y NO ES POR NUESTRA PRUDENCIA. El BJN publica los fallos ya
 * anonimizados: en penal las partes son «AA» y «BB», en civil «la actora» y «la demandada». Lo que
 * se guarda es lo que el Poder Judicial ya publicó así. Aun así, `dispositive` guarda SÓLO la parte
 * dispositiva y nunca la narrativa, que es donde viven los hechos de salud y familia.
 *
 * DOS ETAPAS, Y LA SEGUNDA NO PUEDE INVENTAR. La etapa determinística deja `awardCandidates`: los
 * montos que están literalmente escritos en el fallo. La etapa con LLM (`verdict`) elige ENTRE
 * esos candidatos e identifica al organismo. Si el monto del veredicto no coincide con ningún
 * candidato, el veredicto se descarta — ver el job. Esa es la defensa contra publicar una cifra que
 * la sentencia no dice.
 *
 * `publishable` es el resultado de las dos etapas y es lo único que la página lee para mostrar una
 * cifra. Una sentencia no publicable igual se guarda: el hecho de que el Estado fue condenado vale
 * por sí solo, aunque el monto se liquide después.
 *
 * Escrito por src/jobs/load-bjn-condenas.ts (upsert por `sentenciaKey`, sin swap: el BJN sólo
 * agrega, y una sentencia que hoy no aparece en una búsqueda no dejó de existir).
 */

export interface IBjnMoney {
  currency: "UYU" | "USD" | "UR" | "UI" | "EUR" | "DEG";
  amount: number;
  /** El texto tal cual, para poder auditar la lectura contra el fallo. */
  raw: string;
  /** Porcentaje aplicado cuando el fallo condenó a una fracción («el 60% de U$S 10.000»). */
  ofPercent?: number | undefined;
}

export interface IBjnVerdict {
  /** ¿El condenado a pagar es un organismo del Estado? */
  estadoCondenado: boolean;
  /** El organismo, tal como lo nombra el fallo. Null cuando el fallo no lo nombra. */
  organismo: string | null;
  /** Nuestra forma normalizada, para agrupar ASSE y A.S.S.E. */
  organismoNorm: string | null;
  /** El monto elegido ENTRE los candidatos. Nunca uno nuevo. */
  monto: number | null;
  moneda: string | null;
  /** Qué hizo esta sentencia con la condena anterior. */
  alcance: "condena" | "confirma" | "revoca" | "modifica" | "anula" | "desestima" | "otro";
  confianza: number;
  razon: string;
  model: string;
  verifiedAt: Date;
  /** Hash del contenido verificado; cambia si el fallo se reprocesa. */
  dataVersion: string;
}

export interface IBjnCondena {
  /** Clave natural: sede + número. El tribunal numera por año, no el país. */
  sentenciaKey: string;
  numero: string;
  anio: number | null;
  sede: string;
  tipo: string | null;
  importancia: string | null;
  fecha: Date | null;
  /** IUE del expediente. Null en las sentencias viejas de la Suprema Corte («Sin datos»). */
  ficha: string | null;
  /** El fuero. `PROCESO PENAL ORDINARIO` nunca entra al corpus de dinero. */
  procedimiento: string | null;
  materias: string[];

  /** SÓLO la parte dispositiva. La narrativa no se guarda. */
  dispositive: string;
  /** El verbo del fallo: condena, confirma, revoca, anula, modifica, desestima. */
  verb: string;
  isPenal: boolean;
  /** El fallo condena pero difiere el monto a una liquidación posterior. */
  deferredLiquidation: boolean;
  /** Los montos escritos en el fallo. El veredicto sólo puede elegir de acá. */
  awardCandidates: IBjnMoney[];
  /** Lo descartado por el lector, con motivo — para auditar por qué no se publicó una cifra. */
  excluded: Array<{ raw: string; reason: string }>;

  verdict?: IBjnVerdict | undefined;
  /** `true` sólo cuando las dos etapas coinciden. Es lo único que habilita mostrar un monto. */
  publishable: boolean;

  sourceUrl: string;
  /** La consulta del BJN que la trajo. Sirve para medir la cobertura del corpus. */
  foundBy: string[];
  fetchedAt: Date;
}

const MoneySchema = new Schema<IBjnMoney>(
  {
    currency: { type: String, required: true },
    amount: { type: Number, required: true },
    raw: { type: String, required: true },
    ofPercent: { type: Number },
  },
  { _id: false }
);

const VerdictSchema = new Schema<IBjnVerdict>(
  {
    estadoCondenado: { type: Boolean, required: true },
    organismo: { type: String, default: null },
    organismoNorm: { type: String, default: null },
    monto: { type: Number, default: null },
    moneda: { type: String, default: null },
    alcance: { type: String, required: true },
    confianza: { type: Number, required: true },
    razon: { type: String, required: true },
    model: { type: String, required: true },
    verifiedAt: { type: Date, required: true },
    dataVersion: { type: String, required: true },
  },
  { _id: false }
);

const BjnCondenaSchema = new Schema<IBjnCondena>(
  {
    sentenciaKey: { type: String, required: true },
    numero: { type: String, required: true },
    anio: { type: Number, default: null },
    sede: { type: String, required: true },
    tipo: { type: String, default: null },
    importancia: { type: String, default: null },
    fecha: { type: Date, default: null },
    ficha: { type: String, default: null },
    procedimiento: { type: String, default: null },
    materias: { type: [String], default: [] },

    dispositive: { type: String, required: true },
    verb: { type: String, required: true },
    isPenal: { type: Boolean, required: true },
    deferredLiquidation: { type: Boolean, required: true },
    awardCandidates: { type: [MoneySchema], default: [] },
    excluded: {
      type: [new Schema({ raw: String, reason: String }, { _id: false })],
      default: [],
    },

    verdict: { type: VerdictSchema, default: undefined },
    publishable: { type: Boolean, required: true, default: false },

    sourceUrl: { type: String, required: true },
    foundBy: { type: [String], default: [] },
    fetchedAt: { type: Date, required: true },
  },
  { collection: "bjn_condenas" }
);

// Construidos sólo por scripts/ensure-indexes.ts — autoIndex está apagado.
BjnCondenaSchema.index({ sentenciaKey: 1 }, { unique: true });
BjnCondenaSchema.index({ publishable: 1, fecha: -1 });
BjnCondenaSchema.index({ "verdict.organismoNorm": 1, fecha: -1 });
BjnCondenaSchema.index({ anio: -1 });
BjnCondenaSchema.index({ "verdict.dataVersion": 1 });

export const BjnCondenaModel =
  mongoose.models.BjnCondena || mongoose.model<IBjnCondena>("BjnCondena", BjnCondenaSchema);
