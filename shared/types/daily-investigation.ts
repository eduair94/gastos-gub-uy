import type { Document } from "mongoose";

/**
 * La nota diaria: un hallazgo MEDIDO sobre el corpus, escrito por un trabajo por lotes.
 *
 * NO ES UNA FICHA DE CASO. Las fichas curadas las escribe una persona y las revisa un diff.
 * Las derivadas ocupan los temas `gasto-observado` y `tribunal-de-cuentas`, y su armador las
 * borra en cada corrida. Una nota diaria es un tercer objeto: nace de una medición, vive en
 * su propia colección y su propia ruta, y nadie la borra.
 *
 * LOS CUATRO CAMPOS QUE LA HACEN PUBLICABLE son los mismos de `investigaciones-hallazgos.ts`:
 *
 *   measured  el hecho, con su número y su fecha de medición. Es lo único que afirmamos.
 *   norm      la norma que el hecho pondría en juego SI se confirmara. Nombrar una norma
 *             NO es acusar de violarla.
 *   missing   qué falta para poder afirmarlo. Es el campo que impide que la nota se lea
 *             como una condena. No se recorta.
 *   answers   quién tiene que responder. Un hallazgo sin destinatario es un chisme.
 *
 * `scripts/verify-daily-investigations.ts` rechaza toda nota a la que le falte uno.
 */

export type DailyInvestigationStatus = "draft" | "published" | "rejected";

/**
 * Los ocho carriles. Cada uno mide una relación DENTRO del corpus y no depende de ningún
 * número legal externo.
 *
 * POR QUÉ NO HAY CARRIL DE «COMPRA DIRECTA SOBRE EL TOPE». El tope del artículo 33 del
 * TOCAF lo fija un decreto y se actualiza todos los años. Este repo no lo tiene cargado, y
 * publicar «superó el tope» contra un número inventado sería afirmar un incumplimiento que
 * no medimos. El carril `directa-repetida` cuenta repeticiones, que sí es una medición.
 */
export type DailyLane
  = | "pico-organismo"
    | "proveedor-nuevo"
    | "concentracion-rubro"
    | "anomalia-sin-explicar"
    | "oferente-unico"
    | "salto-precio"
    | "reiteracion-nueva"
    | "directa-repetida";

/** Un número del bloque medido. El texto publicado no puede traer ninguno que no esté acá. */
export interface IDailyFact {
  /** Qué se midió, en una línea. */
  label: string;
  /** El valor ya formateado para leer. */
  value: string;
  /** El valor crudo, para que el verificador compare contra el texto. */
  raw?: number | undefined;
  /** De dónde sale: colección, campo y ventana. */
  provenance: string;
}

/** Una fuente de prensa, ya abierta y chequeada. */
export interface IDailySource {
  outlet: string;
  title: string;
  url: string;
  date?: string | undefined;
  /** Cuándo se abrió la URL y con qué código. Sin esto la fuente no entra. */
  checkedAt: Date;
  httpStatus: number;
}

export interface IDailyText {
  /** Concreto, sin sensacionalismo. ~70 caracteres. */
  title: string;
  /** Una línea: qué se midió y por qué importa. */
  dek: string;
  /** El hecho medido, con su número y su ventana. Lo único que se afirma. */
  measured: string;
  /** Qué es el organismo, el proveedor o el rubro. Sin adjetivos. */
  contexto: string;
  /** La norma que el hecho pondría en juego si se confirmara. */
  norm: string;
  /** Artículo y ley, con su número. */
  normCite: string;
  /** Qué falta para afirmar más. Obligatorio. */
  missing: string;
  /** Quién tiene que responder. */
  answers: string;
}

/** El cruce con el explorador público. Mismo vocabulario que `CasoQuery`. */
export interface IDailyQuery {
  buyerIds?: string[] | undefined;
  buyers?: string[] | undefined;
  suppliers?: string[] | undefined;
  supplierIds?: string[] | undefined;
  search?: string | undefined;
  categoryId?: string[] | undefined;
  procurementMethodDetails?: string[] | undefined;
  ocids?: string[] | undefined;
  yearFrom?: number | undefined;
  yearTo?: number | undefined;
  hasReiteracion?: boolean | undefined;
  allStages?: boolean | undefined;
}

export interface IDailyInvestigation extends Document {
  slug: string;
  /** YYYY-MM-DD en América/Montevideo. Un día publica como mucho una nota. */
  dayKey: string;
  lane: DailyLane;
  /**
   * La clave de deduplicación: identifica al SUJETO, no a la nota.
   *
   * Es lo que impide que el mismo organismo salga dos veces en un mes. Se compara contra
   * las notas ya publicadas, contra las fichas curadas y contra las derivadas.
   */
  subjectKey: string;
  subjectLabel: string;
  status: DailyInvestigationStatus;
  /** Por qué el verificador la rechazó. Vacío cuando pasó. */
  rejectedReasons: string[];
  publishedAt?: Date | undefined;
  /** El número titular, en UYU normalizados (`amount.primaryAmount`). */
  amountUyu: number;
  contractCount: number;
  periodFrom: Date;
  periodTo: Date;
  facts: IDailyFact[];
  query: IDailyQuery;
  /** Los ocid que sostienen la medición. Enlazan a la ficha oficial. */
  ocids: string[];
  sources: IDailySource[];
  /** El comando que vuelve a medir el hecho. Sin esto la nota no se publica. */
  reproduce: string;
  measuredOn: string;
  es: IDailyText;
  en: IDailyText;
  ai: {
    provider: string;
    model: string;
    generatedAt: Date;
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
  };
  createdAt: Date;
  updatedAt: Date;
}
