/**
 * Spending topics — declarative definitions of a *subject* of public spending that
 * the procurement feed does not label on its own.
 *
 * The feed has no "policy area" field: there is no buyer, no rubro and no flag that
 * says "this contract is gender policy". The only handle is the free text a public
 * servant typed into the tender/award/item descriptions. So a topic is a curated,
 * auditable list of phrases — every one of them carries a `note` explaining why it
 * is on the list, and the list is PUBLISHED on the page. Anyone can contest a single
 * term without having to argue about the total.
 *
 * The rules here are a *pre-filter*, not the verdict. They produce candidates; the
 * second stage (src/jobs/refresh-topic-spending.ts → Gemini) reads the whole contract
 * and decides `inTopic` + category. Rules stay simple and legible on purpose.
 *
 * Matching runs through shared/utils/text.phraseMatches, so it is accent- and
 * case-insensitive, and a single token matches on word boundaries — which is what
 * stops `trans` from hitting 14.417 "transporte"/"transferencia" records.
 */
import { phraseMatches, normalizeText } from "./utils/text";

/** How much a term alone is worth without a model's opinion. */
export type TermStrength = "strong" | "weak";

export interface TopicTerm {
  /** The phrase, as a human would write it. Matched normalized. */
  term: string;
  /** `strong` alone qualifies a contract; `weak` only makes it a candidate. */
  strength: TermStrength;
  /** Why this term is on the list — published, so it can be contested. */
  note: string;
  /**
   * Phrases that neutralize THIS term when they appear near it (±`GUARD_WINDOW`
   * characters). Guards are per-term on purpose: a contract may legitimately talk
   * about "violencia de género" AND mention cloth in the same page of text.
   */
  guards?: string[];
}

export interface TopicCategory {
  key: string;
  labelEs: string;
  labelEn: string;
  /** True when the category means "this is NOT the topic" (kept, counted, excluded). */
  isRejection?: boolean;
}

export interface TopicSource {
  label: string;
  url: string;
}

export interface SpendingTopic {
  key: string;
  slug: string;
  labelEs: string;
  labelEn: string;
  dekEs: string;
  dekEn: string;
  terms: TopicTerm[];
  /** Terms deliberately NOT used, with the evidence for leaving them out. */
  rejectedTerms: { term: string; note: string }[];
  categories: TopicCategory[];
  /** SICE/CUBS article codes (== OCDS classification.id) that qualify on their own. */
  catalogCodes: { code: string; name: string }[];
  sources: TopicSource[];
}

/** Characters of context inspected around a hit when checking that term's guards. */
const GUARD_WINDOW = 90;

// ---------------------------------------------------------------------------
// Topic: género y diversidad
// ---------------------------------------------------------------------------

const GENERO_TERMS: TopicTerm[] = [
  {
    term: "genero",
    strength: "weak",
    note: "Término núcleo. Débil a propósito: en compras viejas «género» también significa TELA, así que solo abre candidatura y decide la segunda etapa.",
    // In Uruguayan procurement Spanish "género" is also the word for cloth.
    guards: [
      "esterilla", "tela", "telas", "algodon", "poliester", "lienzo", "loneta",
      "tapiceria", "cortina", "sabana", "sabanas", "confeccion", "metros de",
      "hilado", "hilados", "textil", "textiles", "gabardina", "popelina",
    ],
  },
  { term: "perspectiva de genero", strength: "strong", note: "Fórmula estándar de política pública de género." },
  { term: "violencia de genero", strength: "strong", note: "Servicios de atención y prevención de violencia hacia mujeres." },
  { term: "violencia basada en genero", strength: "strong", note: "Denominación oficial uruguaya (VBG) del sistema de respuesta." },
  { term: "equidad de genero", strength: "strong", note: "Incluye el Modelo de Calidad con Equidad de Género (MCEG) de Inmujeres." },
  { term: "igualdad de genero", strength: "strong", note: "Fórmula normativa; nombra divisiones como la Asesoría para la Igualdad de Género de la IM." },
  { term: "identidad de genero", strength: "strong", note: "Ley 19.684 (integral para personas trans)." },
  { term: "politicas de genero", strength: "strong", note: "Nombra unidades como la División Políticas de Género del Ministerio del Interior." },
  { term: "juzgado de genero", strength: "strong", note: "Sedes del Poder Judicial especializadas en violencia de género, doméstica y sexual." },
  { term: "juzgados de genero", strength: "strong", note: "Variante plural de la anterior." },
  { term: "transversalizacion", strength: "strong", note: "Término técnico de la política de género (transversalización de la perspectiva)." },
  { term: "inmujeres", strength: "strong", note: "Instituto Nacional de las Mujeres (MIDES) — no es un comprador separado en el feed, solo aparece en el texto." },
  { term: "instituto nacional de las mujeres", strength: "strong", note: "Nombre completo de Inmujeres." },
  { term: "comunamujer", strength: "strong", note: "Red de centros de la Intendencia de Montevideo; se escribe junto y separado." },
  { term: "comuna mujer", strength: "strong", note: "Misma red, grafía separada." },
  { term: "masculinidades", strength: "strong", note: "Programas de trabajo con varones (línea telefónica, talleres)." },
  { term: "diversidad sexual", strength: "strong", note: "Política de diversidad." },
  { term: "lgbt", strength: "strong", note: "Cubre LGBT, LGBTI, LGBTQ por coincidencia de prefijo con límite de palabra." },
  { term: "lgbti", strength: "strong", note: "Variante explícita." },
  { term: "lgbtq", strength: "strong", note: "Variante explícita." },
  { term: "afrodescendiente", strength: "weak", note: "Ley 19.122 (acciones afirmativas). Débil: también aparece en compras genéricas de difusión." },
  { term: "afrodescendientes", strength: "weak", note: "Variante plural." },
  { term: "afrodescendencia", strength: "weak", note: "Variante nominal." },
  { term: "trata con fines de explotacion sexual", strength: "strong", note: "Artículo 75847 del catálogo SICE; servicio de atención a víctimas de trata." },
  { term: "mujeres en situacion de violencia", strength: "strong", note: "Fórmula con la que se licitan los servicios de atención." },
  { term: "casa de la mujer", strength: "weak", note: "Nombra dispositivos y también a un proveedor; la segunda etapa separa uno de otro." },
  { term: "lenguaje inclusivo", strength: "strong", note: "Sin coincidencias hoy; queda para detectar la primera." },
  { term: "no binarie", strength: "strong", note: "Sin coincidencias hoy; queda para detectar la primera." },
  { term: "feminismo", strength: "strong", note: "Sin coincidencias hoy; queda para detectar la primera." },
];

const GENERO_REJECTED = [
  {
    term: "equidad",
    note: "Sola matchea 48 contratos que en su mayoría son el «Plan de Equidad» (transferencia monetaria del MIDES, 2008-2011) y el «Día de la Equidad Racial». Solo se usa en la forma «equidad de género».",
  },
  {
    term: "igualdad de oportunidades",
    note: "Un único match, y refiere a normativa laboral general. No aporta señal.",
  },
  {
    term: "trans",
    note: "Como fragmento matchea 14.417 registros: transporte, transferencia, transmisión. Solo entran términos completos («identidad de género», «personas trans» va por la segunda etapa).",
  },
  {
    term: "diversidad",
    note: "Sola matchea la Dirección Nacional de BIODIVERSIDAD y compras ambientales. Solo se usa en «diversidad sexual».",
  },
  {
    term: "inclusion",
    note: "2.917 matches, casi todos de laboratorio («medio de inclusión», «cassette de inclusión en parafina») o de inclusión financiera/digital. Sin relación con el tema.",
  },
  {
    term: "mujer",
    note: "Sola matchea prendas de vestir del catálogo (pijama/gabardina para mujer). Entra solo en frases («mujeres en situación de violencia», «Comuna Mujer»).",
  },
];

const GENERO_CATEGORIES: TopicCategory[] = [
  { key: "vbg-atencion", labelEs: "Atención a víctimas de violencia", labelEn: "Violence victim services" },
  { key: "comuna-mujer", labelEs: "Red ComunaMujer (IM)", labelEn: "ComunaMujer network (IM)" },
  { key: "capacitacion", labelEs: "Capacitación y talleres", labelEn: "Training and workshops" },
  { key: "campana-publicidad", labelEs: "Campañas y publicidad", labelEn: "Campaigns and advertising" },
  { key: "obra-infraestructura", labelEs: "Obra e infraestructura", labelEn: "Works and infrastructure" },
  { key: "lgbt-diversidad", labelEs: "Diversidad sexual / LGBT+", labelEn: "Sexual diversity / LGBT+" },
  { key: "afrodescendencia", labelEs: "Afrodescendencia", labelEn: "Afro-descendant policy" },
  { key: "consultoria-estudio", labelEs: "Consultoría y estudios", labelEn: "Consultancy and studies" },
  { key: "insumo-generico", labelEs: "Insumos y servicios de apoyo", labelEn: "Supplies and support services" },
  { key: "falso-positivo", labelEs: "Descartado (falso positivo)", labelEn: "Discarded (false positive)", isRejection: true },
];

export const GENERO_TOPIC: SpendingTopic = {
  key: "genero-diversidad",
  slug: "genero",
  labelEs: "Gasto público en políticas de género y diversidad",
  labelEn: "Public spending on gender and diversity policy",
  dekEs:
    "Cuánto gasta el Estado uruguayo en políticas de género y diversidad, qué organismo lo compra, "
    + "a qué proveedor va, bajo qué administración, y qué se está licitando ahora. Cada contrato "
    + "enlaza a su ficha, con el enlace al expediente oficial.",
  dekEn:
    "How much the Uruguayan state spends on gender and diversity policy, which body buys it, which "
    + "supplier receives it, under which administration, and what is out to tender right now. Every "
    + "contract links to its record, which carries the official link.",
  terms: GENERO_TERMS,
  rejectedTerms: GENERO_REJECTED,
  categories: GENERO_CATEGORIES,
  catalogCodes: [
    { code: "77276", name: "GESTION DE ATENCION A MUJERES EN SITUACION DE VIOLENCIA DE GENERO" },
    { code: "75847", name: "GESTION DE ATENCION A MUJERES EN SITUACION DE TRATA CON FINES DE EXPLOTACION SEXUAL" },
  ],
  sources: [
    { label: "Compras Estatales — datos abiertos OCDS", url: "https://www.comprasestatales.gub.uy/ocds/" },
    { label: "Inmujeres (MIDES)", url: "https://www.gub.uy/ministerio-desarrollo-social/inmujeres" },
    { label: "ComunaMujer — Intendencia de Montevideo", url: "https://montevideo.gub.uy/areas-tematicas/genero" },
  ],
};

export const SPENDING_TOPICS: SpendingTopic[] = [GENERO_TOPIC];

export function getTopic(key: string): SpendingTopic | undefined {
  return SPENDING_TOPICS.find(t => t.key === key || t.slug === key);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export interface TopicHit {
  term: string;
  strength: TermStrength;
  /** ~160 chars of the text around the hit — what the page shows as evidence. */
  snippet: string;
}

export interface TopicMatch {
  matched: boolean;
  /** True when at least one `strong` term hit — qualifies without a model. */
  strong: boolean;
  hits: TopicHit[];
}

/** Every hit position of `needle` in the already-normalized `hay`. */
function hitPositions(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) break;
    out.push(i);
    from = i + needle.length;
  }
  return out;
}

/**
 * Match one topic against a contract's free text.
 *
 * `fields` is every text the contract carries (tender title/description, award
 * title, item descriptions, classification descriptions). They are matched
 * independently so a guard in one field cannot silence a hit in another.
 */
export function matchTopic(topic: SpendingTopic, fields: (string | null | undefined)[]): TopicMatch {
  const hits: TopicHit[] = [];
  let strong = false;

  for (const raw of fields) {
    if (!raw) continue;
    const hay = normalizeText(raw);
    if (!hay) continue;

    for (const t of topic.terms) {
      if (!phraseMatches(hay, t.term)) continue;

      const norm = normalizeText(t.term);
      const positions = hitPositions(hay, norm);
      // Keep only the hits that survive this term's guards.
      const clean = positions.filter((pos) => {
        if (!t.guards?.length) return true;
        const window = hay.slice(Math.max(0, pos - GUARD_WINDOW), pos + norm.length + GUARD_WINDOW);
        return !t.guards.some(g => window.includes(normalizeText(g)));
      });
      if (!clean.length) continue;

      const pos = clean[0] as number;
      hits.push({
        term: t.term,
        strength: t.strength,
        snippet: raw.replace(/\s+/g, " ").trim().slice(
          Math.max(0, pos - 70),
          pos + norm.length + 90,
        ).trim(),
      });
      if (t.strength === "strong") strong = true;
    }
  }

  // De-duplicate by term, keeping the first (longest-context) snippet.
  const seen = new Set<string>();
  const unique = hits.filter((h) => {
    if (seen.has(h.term)) return false;
    seen.add(h.term);
    return true;
  });

  return { matched: unique.length > 0, strong, hits: unique };
}

/**
 * The Mongo pre-filter. Rules run in JS (guards need character context Mongo cannot
 * express), so the query only has to be a cheap superset: any term as a case-insensitive
 * regex over the text fields. Deliberately loose — matchTopic() does the real work.
 */
export function topicRegex(topic: SpendingTopic): RegExp {
  const alts = topic.terms
    .map(t => normalizeText(t.term))
    // Re-admit the accented vowel so the regex hits both "genero" and "género".
    .map(t => t
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/a/g, "[aá]").replace(/e/g, "[eé]").replace(/i/g, "[ií]")
      .replace(/o/g, "[oó]").replace(/u/g, "[uúü]"))
    .sort((a, b) => b.length - a.length);
  return new RegExp(alts.join("|"), "i");
}
