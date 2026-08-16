import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Gasto del Estado por causa judicial — crédito presupuestal por objeto del gasto.
 *
 * Origen: OPP, «Crédito presupuestal a partir de 2011», leído por la API del datastore de CKAN. El
 * portal propio de OPP responde 403 a todo cliente que no sea un navegador; el datastore sirve la
 * misma tabla sin WAF y con SQL.
 *
 * QUÉ ES CADA FILA. Una combinación (año, organismo, unidad ejecutora, objeto del gasto). El
 * archivo de OPP puede traer varias filas para esa combinación — se abren por financiación,
 * programa y proyecto —, así que el loader las suma y guarda cuántas eran en `sourceRows`.
 *
 * QUÉ NO ES. El presupuesto no nombra causas ni personas. Ninguna fila dice a quién indemnizó el
 * Estado ni por qué. Dice cuánto reservó y cuánto gastó bajo un objeto cuyo nombre oficial es una
 * sentencia, un acuerdo judicial o un amparo. El caso a caso vive en la Base de Jurisprudencia
 * Nacional, en prosa, y en el RUJE, que no es público.
 *
 * LEER `ejecutado` CON EL AÑO AL LADO. 2019, 2020 y 2021 no traen ejecución: el archivo la publica
 * en cero para TODAS las filas, no sólo las judiciales. Antes de mostrar un ejecutado hay que mirar
 * `executionAvailable` del año en `judicial_spending_years`. El titular de la página es el crédito
 * vigente, que sí está en todos los años.
 *
 * Escrito por src/jobs/load-judicial-spending.ts (upsert por `rowKey`, sin swap).
 */
export interface IJudicialSpending {
  /** Clave natural: `${year}|${organismoCodigo}|${ueCodigo}|${objectCode}`. */
  rowKey: string;
  year: number;
  organismoCodigo: number | null;
  organismo: string;
  ueCodigo: number | null;
  unidadEjecutora: string;
  /** Código del objeto del gasto, canónico (`711`, `45.7`). */
  objectCode: string;
  /** Nuestro nombre estable. El publicado cambia de año a año. */
  objectLabel: string;
  category: "sentencia" | "acuerdo" | "amparo" | "indemnizacion";
  /**
   * `true` cuando el nombre oficial del objeto declara una causa judicial. El objeto 793
   * («Indemnizaciones», sin causa declarada) es el único `false`, y va fuera del titular.
   */
  judicial: boolean;
  /** Los nombres tal como OPP los publicó ese año. Sirven para auditar la clasificación. */
  objectNames: string[];
  /** Crédito vigente en pesos nominales del año. */
  creditoVigente: number;
  /** Ejecutado en pesos nominales del año. Cero real y cero por falta de dato se ven igual acá. */
  ejecutado: number;
  /** Cuántas filas del archivo de OPP se sumaron en ésta. */
  sourceRows: number;
  loadedAt: Date;
}

const JudicialSpendingSchema = new Schema<IJudicialSpending>(
  {
    rowKey: { type: String, required: true },
    year: { type: Number, required: true },
    organismoCodigo: { type: Number, default: null },
    organismo: { type: String, required: true },
    ueCodigo: { type: Number, default: null },
    unidadEjecutora: { type: String, required: true },
    objectCode: { type: String, required: true },
    objectLabel: { type: String, required: true },
    category: { type: String, required: true },
    judicial: { type: Boolean, required: true },
    objectNames: { type: [String], default: [] },
    creditoVigente: { type: Number, required: true },
    ejecutado: { type: Number, required: true },
    sourceRows: { type: Number, required: true },
    loadedAt: { type: Date, required: true },
  },
  { collection: "judicial_spending" }
);

// Construidos sólo por scripts/ensure-indexes.ts — autoIndex está apagado.
JudicialSpendingSchema.index({ rowKey: 1 }, { unique: true });
JudicialSpendingSchema.index({ year: -1, creditoVigente: -1 });
JudicialSpendingSchema.index({ judicial: 1, year: -1 });
JudicialSpendingSchema.index({ organismo: 1, year: -1 });
JudicialSpendingSchema.index({ category: 1, year: -1 });

export const JudicialSpendingModel =
  mongoose.models.JudicialSpending ||
  mongoose.model<IJudicialSpending>("JudicialSpending", JudicialSpendingSchema);

/**
 * Un documento por año, con la cobertura MEDIDA del archivo de OPP.
 *
 * Existe porque los archivos anuales no cubren lo mismo y la diferencia es enorme: 2016 trae 44.527
 * filas y 457.000 millones de crédito; 2017 trae 4.500 filas y 27.000 millones. Una serie que
 * ponga esos dos años juntos sin decirlo dibuja un derrumbe que nunca pasó. La página muestra esta
 * cobertura al lado de la serie.
 *
 * `fullySpentRows` sostiene la decisión de titular con el crédito vigente: en los años con
 * ejecución, la partida de sentencias se gasta entera (369.270.154 vigente == 369.270.154 ejecutado
 * en 2011, y así). Se recalcula en cada corrida. Si deja de cumplirse, la página lo dice sola.
 */
export interface IJudicialSpendingYear {
  year: number;
  /** Filas del archivo completo de OPP, no sólo las judiciales. */
  fileRows: number;
  /** Organismos distintos en el archivo completo. */
  fileOrganismos: number;
  /** Crédito vigente de TODO el presupuesto ese año, en pesos nominales. */
  fileVigente: number;
  /** Ejecutado de TODO el presupuesto ese año. Cero cuando el archivo no publica ejecución. */
  fileEjecutado: number;
  /** `false` cuando el archivo publica el ejecutado en cero para todas sus filas. */
  executionAvailable: boolean;
  /** Filas judiciales guardadas (después de agrupar). */
  judicialRows: number;
  /** Crédito vigente de los objetos con causa judicial declarada. */
  judicialVigente: number;
  judicialEjecutado: number;
  /** Objeto 793, aparte del titular. */
  indemnizacionVigente: number;
  indemnizacionEjecutado: number;
  /** De las filas judiciales con ejecución > 0, cuántas gastaron el crédito entero. */
  fullySpentRows: number;
  rowsWithExecution: number;
  /**
   * Promedio de la Unidad Indexada del año (`exchange_rates.ui`). La API deflacta con esto contra
   * la última UI. `null` cuando no hay meses cargados para ese año.
   */
  uiYearAvg: number | null;
  resourceId: string;
  sourceUrl: string;
  loadedAt: Date;
}

const JudicialSpendingYearSchema = new Schema<IJudicialSpendingYear>(
  {
    year: { type: Number, required: true },
    fileRows: { type: Number, required: true },
    fileOrganismos: { type: Number, required: true },
    fileVigente: { type: Number, required: true },
    fileEjecutado: { type: Number, required: true },
    executionAvailable: { type: Boolean, required: true },
    judicialRows: { type: Number, required: true },
    judicialVigente: { type: Number, required: true },
    judicialEjecutado: { type: Number, required: true },
    indemnizacionVigente: { type: Number, required: true },
    indemnizacionEjecutado: { type: Number, required: true },
    fullySpentRows: { type: Number, required: true },
    rowsWithExecution: { type: Number, required: true },
    uiYearAvg: { type: Number, default: null },
    resourceId: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    loadedAt: { type: Date, required: true },
  },
  { collection: "judicial_spending_years" }
);

JudicialSpendingYearSchema.index({ year: 1 }, { unique: true });

export const JudicialSpendingYearModel =
  mongoose.models.JudicialSpendingYear ||
  mongoose.model<IJudicialSpendingYear>("JudicialSpendingYear", JudicialSpendingYearSchema);
