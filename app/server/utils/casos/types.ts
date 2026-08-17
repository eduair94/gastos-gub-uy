/**
 * Casos — thematic dossiers on questioned public investment and spending.
 *
 * A `caso` sits between the two things this site already had:
 *
 *   • `curros`  (server/utils/curros.ts) — a case that is being *prosecuted or
 *     audited*. It carries a legal status because there is a legal process.
 *   • `recopilatorios` — a saved query over the data with no claim attached.
 *
 * Most of what a citizen argues about is neither. A hospital that was never
 * finished, an arena that cost double what was announced, a cancer drug the
 * state pays for only after a court orders it — these are *questioned*, not
 * criminal. Filing them under "curros" would call them crimes; leaving them
 * out would leave the site silent on most of the public-money debate.
 *
 * So a caso carries FOUR things and refuses to publish without them:
 *
 *   1. `statusKind` + `status` — judicial / auditoría / gestión / debate. The
 *      first word the reader sees is what KIND of question this is. A cost
 *      overrun is not an indictment and the page must never blur that.
 *   2. `sources` — ≥3 reputable citations (outlet + title + URL + date), each
 *      one opened and checked. No sources, no page.
 *   3. `query` — OPTIONAL on purpose. Much of the biggest spending (PPPs,
 *      fideicomisos, ROU-UPM style contracts, Antel/UTE/ANCAP own-budget
 *      execution) never appears in the OCDS Compras Estatales feed. When the
 *      feed cannot see it, `feedCoverage` says so and the page shows the
 *      absence instead of faking a number. That absence is itself a finding.
 *   4. `es` / `en` — the same content in both locales. Spanish is the source
 *      of truth.
 *
 * Editorial contract (the same one `curros.ts` states, extended):
 *  • Attribute everything. "Según El Observador", "el Tribunal de Cuentas
 *    observó", "la Fiscalía imputó". Never a verdict of our own.
 *  • Include the response of the questioned party when it exists.
 *  • Every figure carries its source and its date. Conflicting figures are
 *    both reported.
 *  • The DB cross-reference is what the state spent with the named bodies and
 *    suppliers — never proof of wrongdoing. `caveat` says so on every page.
 */

/** What KIND of question hangs over the case. Drives the page's framing. */
export type CasoStatusKind
  = | 'judicial' // a court or prosecutor is involved
    | 'auditoria' // an audit body observed it (TCR, AIN, JUTEP, Comisionado)
    | 'gestion' // questioned management: overrun, unfinished, underused
    | 'debate' // a live policy argument over where the money goes

/** Where it stands. Rendered via i18n (`casos.status.<value>`). */
export type CasoStatus
  // judicial
  = | 'condena'
    | 'procesamiento'
    | 'formalizacion'
    | 'imputacion'
    | 'juicio'
    | 'investigacion'
    | 'denuncia'
    | 'absolucion'
    | 'archivo'
    | 'rescision'
  // audit
    | 'auditoria'
  /**
   * El órgano de control SE PRONUNCIÓ, y no sabemos en qué sentido.
   *
   * Existe porque `auditoria` se rotula «Observado», y eso es una afirmación. Para las fichas
   * del archivo del Tribunal de Cuentas sería falsa: su ficha pública trae sólo el VISTO, y si
   * el gasto fue observado consta únicamente en el PDF, que es un escaneo.
   */
    | 'pronunciamiento'
  // management / policy
    | 'sobrecosto'
    | 'inconcluso'
    | 'en-ejecucion'
    | 'terminado'
    | 'debate'
    | 'sin-resolver'

/**
 * How much of the case's money the OCDS Compras Estatales feed can actually
 * see. This is not a disclaimer — it is the page's honesty budget.
 *
 *  likely   normal state purchasing; the cross-reference should be meaningful
 *  partial  some of it is purchasing, some rides another channel
 *  unlikely PPP, fideicomiso, international treaty-contract, own-budget
 *           execution by a state company, or a direct transfer. The feed will
 *           show little or nothing and the page says why.
 */
export type CasoFeedCoverage = 'likely' | 'partial' | 'unlikely'

/** Same param vocabulary the public explorer understands (buildContractFilters). */
export interface CasoQuery {
  /** buyer.id values (e.g. "60-1" = ANCAP). Preferred: indexed. */
  buyerIds?: string[] | undefined
  /** Buyer names; `*foo*` = contains. Slower — use when no id is stable. */
  buyers?: string[] | undefined
  /** Supplier company names as they appear as proveedor. `*foo*` = contains. */
  suppliers?: string[] | undefined
  /** Exact supplier ids (RUT-derived, e.g. "R/211203010017"). */
  supplierIds?: string[] | undefined
  /** Free-text phrase — matches objeto, artículos, proveedor. */
  search?: string | undefined
  /** Exact catalogue codes (classification.id), when the case is a product. */
  categoryId?: string[] | undefined
  /** Uruguayan procedure names ("Compra Directa", "Licitación Pública"…). */
  procurementMethodDetails?: string[] | undefined
  yearFrom?: number | undefined
  yearTo?: number | undefined
  /**
   * Sólo compras con documento de reiteración del gasto: las que el Tribunal de Cuentas
   * observó y el organismo pagó igual.
   *
   * Existe para que una ficha por organismo tenga un cruce ACOTADO. Sin esto la consulta
   * sería sólo por comprador, y una consulta sólo por comprador devuelve el padrón entero
   * del organismo — su contabilidad, no el caso. Es la regla 3 de verify-casos.
   */
  hasReiteracion?: boolean | undefined
  /**
   * OCID exactos, para la ficha que habla de UNA compra.
   *
   * `search` no sirve para esto: el buscador re-chequea la frase contra títulos, objetos y
   * nombres, y el id de la compra no está en ninguno de esos campos. Devolvía cero.
   */
  ocids?: string[] | undefined
  /**
   * Muestra TODAS las etapas del expediente, sin filtrar por `tag`.
   *
   * Por omisión el cruce se limita a `award`, que es la etapa que lleva la plata. Eso está
   * bien cuando la ficha habla de una adjudicación, y está mal cuando habla de una COMPRA
   * identificada por su ocid: el ocid es la compra entera, y sus etapas son `tender`,
   * `award`, `tenderUpdate`, `tenderCancellation` o `awardCancellation`.
   *
   * MEDIDO: forzando `award`, 96 de las 307 fichas del Tribunal de Cuentas cruzaban cero,
   * porque la resolución nombra el LLAMADO y el título del llamado vive en el release
   * `tender`. Enumerar etapas tampoco alcanzó: una de esas compras existe sólo como
   * `tenderCancellation`, y una lista siempre se olvida de un valor.
   */
  allStages?: boolean | undefined
}

export interface CasoSource {
  /** The outlet or body: "El Observador", "Tribunal de Cuentas", "Fiscalía"… */
  outlet: string
  title: string
  url: string
  /** Free date label, shown as-is ("2024-05-12", "May 2024"). */
  date?: string | undefined
}

export interface CasoText {
  /** Concrete, non-sensational. ~70 chars. */
  title: string
  /** One-line standfirst: what happened and why it is questioned. */
  dek: string
  /** What the programme/works/purchase is, who decided it, when, with what money. */
  contexto: string
  /** What exactly is questioned — figures, attributed to each source. */
  hallazgo: string
  /** Where it stands today, with dates. */
  statusNote: string
  /** What it means for a Uruguayan's pocket or service. Concrete. */
  porQueImporta: string
  /** Limits of the data cross-reference: what it includes and what it does not. */
  caveat?: string | undefined
}

export interface CasoDef {
  slug: string
  emoji: string
  theme: CasoThemeKey
  /** Free label for the period of the facts ("2018–2024"). */
  period?: string | undefined
  statusKind: CasoStatusKind
  status: CasoStatus
  /** Headline figure as reported, verbatim. Never re-computed by us. */
  amountReported?: string | undefined
  /** Bodies that decide/pay. Display only — the query is separate and validated. */
  organisms: string[]
  /** Companies named by the sources. Display only. */
  suppliersNamed?: string[] | undefined
  feedCoverage: CasoFeedCoverage
  /**
   * The cross-reference. ABSENT when no query returns a meaningful set — which
   * is the normal outcome for `feedCoverage: 'unlikely'`. Every query here was
   * resolved against the live collection before shipping
   * (scripts/verify-casos.ts).
   */
  query?: CasoQuery | undefined
  /** Link to a long-form investigation already on the site. */
  investigationPath?: string | undefined
  /** Slugs of other casos worth reading next. Theme siblings are automatic. */
  related?: string[] | undefined
  sources: CasoSource[]
  es: CasoText
  en: CasoText
}

// ── Themes ──────────────────────────────────────────────────────────────────

export type CasoThemeKey
  = | 'salud-mental'
    | 'cancer'
    | 'defensa'
    | 'telecomunicaciones'
    | 'obra-publica'
    | 'educacion'
    | 'energia'
    | 'seguridad'
    | 'agua'
    | 'vivienda'
    | 'transporte'
    | 'estado-y-fondos'
    | 'ambiente'
    | 'deporte-y-cultura'
    | 'gasto-observado'
    | 'tribunal-de-cuentas'

export interface CasoThemeDef {
  key: CasoThemeKey
  emoji: string
  es: { label: string, dek: string }
  en: { label: string, dek: string }
}

/**
 * The fourteen files. Order is editorial: health first (it is where the
 * questions hurt most), the state's own plumbing last.
 */
export const CASO_THEMES: CasoThemeDef[] = [
  {
    key: 'salud-mental',
    emoji: '🧠',
    es: { label: 'Salud mental', dek: 'La ley que mandó cerrar los asilos, el país con más suicidios de la región y el dinero que nunca llegó a los servicios.' },
    en: { label: 'Mental health', dek: 'The law that ordered asylums closed, the region’s highest suicide rate, and the money that never reached the services.' },
  },
  {
    key: 'cancer',
    emoji: '🎗️',
    es: { label: 'Cáncer y alta tecnología', dek: 'Medicamentos que sólo se pagan cuando un juez lo ordena, equipos que faltan y esperas que se miden en meses.' },
    en: { label: 'Cancer and high-cost care', dek: 'Drugs the state pays for only when a judge orders it, missing equipment, and waits measured in months.' },
  },
  {
    key: 'defensa',
    emoji: '⚓',
    es: { label: 'Militares y defensa', dek: 'Las patrullas oceánicas, el déficit de la Caja Militar y todo lo que el Estado paga por sus fuerzas armadas.' },
    en: { label: 'Military and defence', dek: 'The ocean patrol vessels, the military pension fund deficit, and everything the state pays for its armed forces.' },
  },
  {
    key: 'telecomunicaciones',
    emoji: '📡',
    es: { label: 'Antel, Antel Arena y telecomunicaciones', dek: 'El estadio que costó el doble de lo anunciado, los cables submarinos y el data center que casi nadie usa.' },
    en: { label: 'Antel, Antel Arena and telecoms', dek: 'The arena that cost double what was announced, the submarine cables, and the data centre almost nobody uses.' },
  },
  {
    key: 'obra-publica',
    emoji: '🏗️',
    es: { label: 'Obra pública', dek: 'Ferrocarril Central, PPP viales, puertos y los sobrecostos que aparecen después de la foto de la inauguración.' },
    en: { label: 'Public works', dek: 'The Central Railway, road PPPs, ports, and the overruns that surface after the ribbon-cutting photo.' },
  },
  {
    key: 'educacion',
    emoji: '🎓',
    es: { label: 'Educación', dek: 'Ceibal, liceos que no se terminan, comedores y el 6% del PIB que se prometió durante veinte años.' },
    en: { label: 'Education', dek: 'Ceibal, unfinished schools, canteens, and the 6% of GDP promised for twenty years.' },
  },
  {
    key: 'energia',
    emoji: '⚡',
    es: { label: 'Energía, ANCAP y UTE', dek: 'Las pérdidas del monopolio, el portland que nunca dio ganancia, los contratos eólicos a veinte años y el hidrógeno verde.' },
    en: { label: 'Energy, ANCAP and UTE', dek: 'The monopoly’s losses, cement that never turned a profit, twenty-year wind contracts, and green hydrogen.' },
  },
  {
    key: 'seguridad',
    emoji: '🚔',
    es: { label: 'Seguridad y cárceles', dek: 'La cárcel PPP, las tobilleras, las cámaras y lo que cuesta cada persona privada de libertad.' },
    en: { label: 'Security and prisons', dek: 'The PPP prison, ankle monitors, cameras, and what each incarcerated person costs.' },
  },
  {
    key: 'agua',
    emoji: '💧',
    es: { label: 'Agua y saneamiento', dek: 'La crisis del agua salada de 2023, el proyecto Neptuno y la mitad del agua potable que se pierde en la red.' },
    en: { label: 'Water and sanitation', dek: 'The 2023 salt-water crisis, the Neptuno project, and the half of drinking water lost in the network.' },
  },
  {
    key: 'vivienda',
    emoji: '🏘️',
    es: { label: 'Vivienda', dek: 'El Plan Juntos, los realojos que quedaron por la mitad y el déficit habitacional que no baja.' },
    en: { label: 'Housing', dek: 'The Plan Juntos, half-finished relocations, and a housing deficit that will not fall.' },
  },
  {
    key: 'transporte',
    emoji: '🚌',
    es: { label: 'Transporte', dek: 'El subsidio al boleto, el gasoil exonerado, Pluna y los aeropuertos que casi no tienen vuelos.' },
    en: { label: 'Transport', dek: 'The fare subsidy, tax-free diesel, Pluna, and airports with almost no flights.' },
  },
  {
    key: 'estado-y-fondos',
    emoji: '🏛️',
    es: { label: 'El Estado por dentro', dek: 'Publicidad oficial, cargos de confianza, consultorías, alquileres y las observaciones que se reiteran igual.' },
    en: { label: 'Inside the state', dek: 'Official advertising, political appointments, consultancies, rents, and audit objections overridden anyway.' },
  },
  {
    key: 'ambiente',
    emoji: '🌿',
    es: { label: 'Ambiente', dek: 'UPM, Aratirí, la basura que no se recicla y los pasivos ambientales que termina pagando el Estado.' },
    en: { label: 'Environment', dek: 'UPM, Aratirí, waste that is not recycled, and environmental liabilities the state ends up paying.' },
  },
  {
    key: 'deporte-y-cultura',
    emoji: '🎭',
    es: { label: 'Deporte y cultura', dek: 'El Centenario rumbo al Mundial 2030, los fondos concursables y los cachés que paga el Estado.' },
    en: { label: 'Sport and culture', dek: 'The Centenario stadium heading to the 2030 World Cup, arts funds, and the fees the state pays performers.' },
  },
  // El único tema que NO se escribe a mano. Sus fichas las arma
  // src/jobs/build-derived-casos.ts a partir del documento oficial de reiteración, y viven en
  // la colección `derived_casos`. Va último para no correr el orden de las catorce curadas.
  {
    key: 'gasto-observado',
    emoji: '🧾',
    es: {
      label: 'Gasto observado y reiterado',
      dek: 'Compras que el Tribunal de Cuentas observó y que el organismo pagó igual, amparado en el artículo 114 del TOCAF.',
    },
    en: {
      label: 'Observed and overridden spending',
      dek: 'Purchases the Court of Auditors objected to and the body paid anyway, under article 114 of the TOCAF.',
    },
  },
  // También armado. Sale de `tcr_resolutions` y lo escribe el mismo trabajo.
  //
  // CUIDADO CON EL VERBO. La ficha del archivo del Tribunal publica sólo el VISTO, que dice
  // qué expediente se miró. Si el gasto fue observado, por cuánto y con qué fundamento está
  // únicamente en el PDF, que es un escaneo. Por eso este tema dice «se pronunció» y NUNCA
  // «observó»: decir observó sería inventar el fallo.
  {
    key: 'tribunal-de-cuentas',
    emoji: '⚖️',
    es: {
      label: 'El Tribunal de Cuentas, compra por compra',
      dek: 'Las compras sobre las que se pronunció el auditor del propio Estado, atadas al contrato que nombran.',
    },
    en: {
      label: 'The Court of Auditors, purchase by purchase',
      dek: 'The purchases the state’s own auditor ruled on, tied to the contract they name.',
    },
  },
]

export function getCasoTheme(key: string): CasoThemeDef | null {
  return CASO_THEMES.find(t => t.key === key) ?? null
}

/** The bilingual text for a theme in one locale, Spanish-fallback. */
export function casoThemeText(t: CasoThemeDef, locale: string): { label: string, dek: string } {
  return locale === 'en' ? t.en : t.es
}
