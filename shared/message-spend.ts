/**
 * "Message spend" — what the State buys when what it buys carries words.
 *
 * This is deliberately NOT a keyword search over contract text. It is a curated
 * selection of CATALOGUE classes and articles, read from `product_analytics`,
 * whose amounts are already apportioned per line and per supplier. That matters
 * twice over:
 *
 *   - the totals are exact and additive, not a release-level sum that
 *     double-counts a multi-item contract, and
 *   - a text search for this subject is a trap. Searching `releases` for
 *     "impresión" returns ANEP's largest purchases — which are PAPER and
 *     EXERCISE BOOKS ("PAPEL PARA IMPRESION Y/O FOTOCOPIADO", "CUADERNOLA"),
 *     not printed content. Measured: that mistake inflates the figure to
 *     ~5.000 million UYU of school supplies misread as printing.
 *
 * Each code lands in exactly ONE layer, by the priority in `MESSAGE_LAYERS`, so
 * the layer totals sum to the grand total without overlap.
 *
 * The second half of this file is the counter-evidence: the words a reader
 * looking for "adoctrinamiento" would search for. They are checked against the
 * catalogue itself, and the page publishes the result whatever it is.
 */

export interface MessageLayer {
  key: string;
  labelEs: string;
  labelEn: string;
  /** What this layer is, in one line — published next to its figure. */
  noteEs: string;
  noteEn: string;
  /** Matched on `product_analytics.clasName` (exact). */
  clasNames?: string[];
  /** Matched on `product_analytics.subcName` (exact). */
  subcNames?: string[];
  /** Matched on `canonicalName` with this case-insensitive prefix. */
  namePrefix?: string;
}

/**
 * Order is priority: a code is claimed by the first layer that matches it, so
 * "IMPRESION DE LIBRO" counts once (under publications, its catalogue class)
 * rather than twice.
 */
export const MESSAGE_LAYERS: MessageLayer[] = [
  {
    key: "publicidad",
    labelEs: "Publicidad y propaganda",
    labelEn: "Advertising and propaganda",
    noteEs: "Espacio en medios, spots, vía pública y asesoramiento publicitario. Es la única capa donde el Estado compra explícitamente convencer.",
    noteEn: "Media space, spots, outdoor and advertising advice. The only layer where the State explicitly buys persuasion.",
    clasNames: ["PUBLICIDAD Y PROPAGANDA"],
  },
  {
    key: "cursos",
    labelEs: "Cursos y capacitación",
    labelEn: "Courses and training",
    noteEs: "Horas de aula compradas a terceros para funcionarios del Estado. Quién enseña, y qué, se decide contrato por contrato.",
    noteEn: "Classroom hours bought from third parties for public employees. Who teaches, and what, is decided contract by contract.",
    subcNames: [
      "SERV.PROFESIONALES CONTR.PARA CURSOS DE CAPACITACION",
      "CURSOS EN INSTITUCIONES DE ENSEÑANZA",
    ],
  },
  {
    key: "publicaciones",
    labelEs: "Libros, revistas y publicaciones",
    labelEn: "Books, magazines and publications",
    noteEs: "Lo que el Estado compra ya escrito por otro: libros, revistas, suscripciones.",
    noteEn: "What the State buys already written by someone else: books, magazines, subscriptions.",
    clasNames: ["LIBROS, REVISTAS Y OTRAS PUBLICACIONES"],
  },
  {
    key: "impresion",
    labelEs: "Servicios de impresión",
    labelEn: "Printing services",
    noteEs: "El vehículo, no el mensaje: imprimir folletos, libros, formularios, afiches. Es la capa más cara de todas.",
    noteEn: "The vehicle, not the message: printing leaflets, books, forms, posters. The most expensive layer of them all.",
    namePrefix: "IMPRESION DE ",
  },
];

/**
 * The words a reader hunting for state-funded indoctrination would look for.
 * Checked against the article catalogue, and published with whatever they return
 * — including nothing, which is itself the finding.
 */
export const CONTENT_PROBES: { term: string; labelEs: string; labelEn: string }[] = [
  { term: "curricul", labelEs: "currículo", labelEn: "curriculum" },
  { term: "texto escolar", labelEs: "texto escolar", labelEn: "school textbook" },
  { term: "gu[ií]a docente", labelEs: "guía docente", labelEn: "teacher's guide" },
  { term: "programa educativo", labelEs: "programa educativo", labelEn: "educational programme" },
  { term: "educaci[oó]n sexual", labelEs: "educación sexual", labelEn: "sex education" },
  { term: "material educativo", labelEs: "material educativo", labelEn: "educational material" },
  { term: "contenido", labelEs: "contenido", labelEn: "content" },
  { term: "adoctrina", labelEs: "adoctrinamiento", labelEn: "indoctrination" },
];

/**
 * Lines whose "unit price" is really the price of the whole lot, so the amount
 * calculator multiplied it by the quantity and inflated the figure by orders of
 * magnitude. This is the artifact class documented in docs/superpowers/specs/ —
 * `correct-lumpsum-artifacts` cannot repair these three because each release has
 * more than one priced line, so one official total cannot be attributed to one line.
 *
 * They are excluded from every headline figure and published in full underneath:
 * a suspect source amount stays inspectable, but it never becomes the headline
 * (PRODUCT.md, evidence contract).
 *
 * Without this, ONE 2019 poster contract would make printing the State's largest
 * message expense — a claim that is false by a factor of about 3.300.
 */
export interface AmountArtifact {
  ocid: string;
  releaseId: string;
  layer: string;
  /** Catalogue code of the inflated line. */
  code: string;
  article: string;
  supplierName: string;
  buyer: string;
  year: number;
  quantity: number;
  unitPrice: number;
  /** quantity × unitPrice — what the record claims, and what is subtracted. */
  amount: number;
  reasonEs: string;
  reasonEn: string;
}

export const AMOUNT_ARTIFACTS: AmountArtifact[] = [
  {
    ocid: "ocds-yfs5dr-733331",
    releaseId: "adjudicacion-733331",
    layer: "impresion",
    code: "62741",
    article: "IMPRESION DE AFICHE",
    supplierName: "TRADINCO S A",
    buyer: "Consejo Directivo Central (ANEP)",
    year: 2019,
    quantity: 9600,
    unitPrice: 478080,
    amount: 4589568000,
    reasonEs: "9.600 afiches a 478.080 pesos cada uno. El «precio unitario» cargado es el total del lote: a ese precio, un afiche costaría más que un auto.",
    reasonEn: "9,600 posters at 478,080 pesos each. The loaded \"unit price\" is the lot total: at that price one poster would cost more than a car.",
  },
  {
    ocid: "ocds-yfs5dr-153867",
    releaseId: "adjudicacion-153867",
    layer: "impresion",
    code: "39771",
    article: "IMPRESION DE RECETA MEDICA",
    supplierName: "ALCA S.R.L.",
    buyer: "Centro Departamental de Río Negro",
    year: 2008,
    quantity: 123000,
    unitPrice: 3000,
    amount: 369000000,
    reasonEs: "123.000 recetas médicas a 3.000 pesos cada una. Mismo patrón: el unitario es el total del lote.",
    reasonEn: "123,000 medical prescription forms at 3,000 pesos each. Same pattern: the unit is the lot total.",
  },
  {
    ocid: "ocds-yfs5dr-72091",
    releaseId: "adjudicacion-72091",
    layer: "impresion",
    code: "27194",
    article: "IMPRESION DE RECIBOS DE SUELDOS",
    supplierName: "M.A.T.E.C.S.A.",
    buyer: "Dirección General de Casinos",
    year: 2006,
    quantity: 45000,
    unitPrice: 7918,
    amount: 356310000,
    reasonEs: "45.000 recibos de sueldo a 7.918 pesos cada uno, en 2006. Mismo patrón.",
    reasonEn: "45,000 payslips at 7,918 pesos each, in 2006. Same pattern.",
  },
];

/** The Mongo filter for one layer. */
export function layerFilter(layer: MessageLayer): Record<string, unknown> {
  const or: Record<string, unknown>[] = [];
  if (layer.clasNames?.length) or.push({ clasName: { $in: layer.clasNames } });
  if (layer.subcNames?.length) or.push({ subcName: { $in: layer.subcNames } });
  if (layer.namePrefix) or.push({ canonicalName: { $regex: `^${layer.namePrefix}`, $options: "i" } });
  return or.length === 1 ? (or[0] as Record<string, unknown>) : { $or: or };
}

/** The union filter — one query fetches every candidate code, then JS assigns layers. */
export function allLayersFilter(): Record<string, unknown> {
  return { $or: MESSAGE_LAYERS.map(layerFilter) };
}

/** First layer that claims this code. Priority = array order. */
export function layerOf(doc: { clasName?: string; subcName?: string; canonicalName?: string }): string | null {
  for (const l of MESSAGE_LAYERS) {
    if (l.clasNames?.includes(doc.clasName ?? "")) return l.key;
    if (l.subcNames?.includes(doc.subcName ?? "")) return l.key;
    if (l.namePrefix && (doc.canonicalName ?? "").toUpperCase().startsWith(l.namePrefix)) return l.key;
  }
  return null;
}
