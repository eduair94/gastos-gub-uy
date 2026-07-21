/**
 * Comparativa · Servicios de alertas de licitaciones en Uruguay.
 *
 * Recurso para proveedores del Estado: qué servicio (pago o gratuito) elegir para
 * enterarse y presentarse a licitaciones. La plataforma actúa de árbitro NEUTRAL —
 * conlatuya/gastos.gub.uy NO figura como competidor en la tabla.
 *
 * Regla de objetividad (idéntica a las investigaciones del sitio):
 *   - Los HECHOS (precios, features, cobertura) salen de una investigación con
 *     fuente por dato (fetch de cada sitio oficial, jul-2026). Cada precio se
 *     muestra TAL CUAL, con su moneda, SIN convertir. Nunca se inventa un precio:
 *     lo no publicado es "Consultar" y lo no confirmable se marca.
 *   - La OPINIÓN (la recomendación a favor de ProveedorUY) vive en un bloque
 *     aparte y rotulado; se apoya sólo en hechos verificados. Sin patrocinio ni
 *     vínculo comercial con ningún proveedor.
 *   - Cada empresa puede pedir una corrección.
 *
 * Fuente de los datos: workflow uy-tender-alert-competitor-research (13 proveedores).
 * Ver docs/superpowers/specs/2026-07-21-pliego-resumen-ia-y-comparativa-alertas-design.md
 */

export interface Bi { es: string, en: string }
export type Tri = 'si' | 'no' | 'desconocido'

/** Grupos, en orden de relevancia para un proveedor uruguayo. */
export type ProviderGroup = 'core' | 'opaque' | 'regional' | 'outOfScope' | 'unverified'

export type Currency = 'UYU' | 'USD' | 'EUR' | 'UNKNOWN'
export type Period = 'mes' | 'ano' | 'unico' | 'desconocido'

export interface Plan {
  name: string
  /** Precio exacto como lo muestra el sitio. */
  priceText: string
  /** Monto numérico (0 = consultar / desconocido). Para los gráficos. */
  amount: number
  currency: Currency
  period: Period
  /** El sitio no etiqueta la moneda; se infiere por contexto (ProveedorUY). */
  currencyInferred?: boolean
  /** El precio se muestra "+ IVA" (no comparable de igual a igual con brutos). */
  ivaExcluded?: boolean
  note?: Bi
}

export interface ProviderFeatures {
  /** Resumen/análisis de pliegos con IA. */
  aiPliego: Tri
  emailAlerts: Tri
  whatsappTelegram: Tri
  savedSearches: Tri
  /** Gestión de ofertas: constructor, checklist, calendario, dashboard. */
  bidTooling: Tri
  api: Tri
  /** Respaldo/asesoría jurídica propia del servicio. */
  legalAdvisory: Tri
}

export interface Provider {
  id: string
  name: string
  url: string
  group: ProviderGroup
  tagline: Bi
  /** Foco de país + fuente oficial cubierta. */
  countryFocus: Bi
  reachable: boolean
  hasFreeTier: boolean
  freeTrial: Bi
  plans: Plan[]
  /** Plan pago más barato (para el gráfico de precio de entrada); null si opaco. */
  entryPaid: { amount: number, currency: Currency, text: string } | null
  features: ProviderFeatures
  coverage: Bi
  /** Reclamo de validación jurídica, casi textual, o "ninguna". */
  legalValidation: Bi
  ux: Bi
  sources: string[]
  confidence: 'alta' | 'media' | 'baja'
  /** Salvedades a mostrar junto a la ficha (moneda inferida, add-on pago, etc.). */
  caveats?: Bi[]
}

/** Fecha de verificación de todos los datos. */
export const VERIFIED_ON = '2026-07-21'

/** Tipo de cambio de referencia para la conversión APROXIMADA a pesos. La moneda
 *  original siempre se muestra al lado; el peso es un valor derivado y referencial.
 *  Actualizable (jul-2026). */
export const USD_UYU_REF = 40
export const EUR_UYU_REF = 44

/** Convierte un monto a pesos con el tipo de cambio de referencia. Devuelve el
 *  mismo monto si ya es UYU, y 0 si la moneda es desconocida. */
export function toPesos(amount: number, currency: Currency): number {
  if (currency === 'UYU') return amount
  if (currency === 'USD') return Math.round(amount * USD_UYU_REF)
  if (currency === 'EUR') return Math.round(amount * EUR_UYU_REF)
  return 0
}

export const PROVIDERS: Provider[] = [
  // ─── Núcleo comparable: UY-native, alcanzables, precio público ───────────────
  {
    id: 'gubly',
    name: 'Gubly',
    url: 'https://gubly.com.uy/',
    group: 'core',
    tagline: { es: 'Ganá más licitaciones sin leer 300 páginas de pliego.', en: 'Win more tenders without reading 300 pages of specs.' },
    countryFocus: { es: 'Uruguay · ARCE / comprasestatales', en: 'Uruguay · ARCE / comprasestatales' },
    reachable: true,
    hasFreeTier: true,
    freeTrial: { es: 'Plan Gratis para siempre (sin tarjeta): 3 análisis de pliego IA por mes.', en: 'Free plan forever (no card): 3 AI document analyses per month.' },
    plans: [
      { name: 'Gratis', priceText: '$0', amount: 0, currency: 'USD', period: 'unico', note: { es: '3 análisis IA/mes, seguir hasta 5, reporte semanal.', en: '3 AI analyses/mo, follow up to 5, weekly report.' } },
      { name: 'Pro', priceText: 'USD 25 + IVA / mes', amount: 25, currency: 'USD', period: 'mes', ivaExcluded: true, note: { es: 'Análisis IA ilimitados, alertas en tiempo real, 1 usuario.', en: 'Unlimited AI analyses, real-time alerts, 1 user.' } },
      { name: 'Empresarial', priceText: 'A medida', amount: 0, currency: 'UNKNOWN', period: 'desconocido', note: { es: 'Hasta 20 usuarios, onboarding dedicado.', en: 'Up to 20 users, dedicated onboarding.' } },
    ],
    entryPaid: { amount: 25, currency: 'USD', text: 'USD 25 + IVA/mes' },
    features: { aiPliego: 'si', emailAlerts: 'si', whatsappTelegram: 'desconocido', savedSearches: 'si', bidTooling: 'no', api: 'desconocido', legalAdvisory: 'no' },
    coverage: { es: 'Sólo ARCE/comprasestatales, sincronizado a diario. No BPS ni intendencias.', en: 'Only ARCE/comprasestatales, synced daily. No BPS or municipalities.' },
    legalValidation: { es: 'Ninguna.', en: 'None.' },
    ux: { es: 'Español claro, registro sin tarjeta. Fuerte en análisis IA y precios de referencia de adjudicaciones.', en: 'Clear Spanish, no-card signup. Strong AI analysis and reference award prices.' },
    sources: ['https://gubly.com.uy/', 'https://gubly.com.uy/#planes'],
    confidence: 'alta',
  },
  {
    id: 'proveedoruy',
    name: 'ProveedorUY',
    url: 'https://proveedoruy.com/',
    group: 'core',
    tagline: { es: 'Todo lo que necesitás para ganar licitaciones.', en: 'Everything you need to win tenders.' },
    countryFocus: { es: 'Uruguay · SICE / comprasestatales', en: 'Uruguay · SICE / comprasestatales' },
    reachable: true,
    hasFreeTier: true,
    freeTrial: { es: 'Prueba 10 días del plan Monitoreo, sin tarjeta.', en: '10-day trial of the Monitoreo plan, no card.' },
    plans: [
      { name: 'Monitoreo', priceText: '$ 990 + IVA / mes', amount: 990, currency: 'UYU', period: 'mes', currencyInferred: true, ivaExcluded: true, note: { es: '30 análisis de pliego IA/mes, 50 consultas/día al asistente, alertas ilimitadas, 1 usuario.', en: '30 AI doc analyses/mo, 50 assistant queries/day, unlimited alerts, 1 user.' } },
      { name: 'Gestión', priceText: '$ 1.990 + IVA / mes', amount: 1990, currency: 'UYU', period: 'mes', currencyInferred: true, ivaExcluded: true, note: { es: 'IA ilimitada, constructor de ofertas, gestión documental, usuarios ilimitados.', en: 'Unlimited AI, offer builder, document management, unlimited users.' } },
      { name: 'Enterprise', priceText: 'Consultar', amount: 0, currency: 'UNKNOWN', period: 'desconocido', note: { es: 'Soporte dedicado, alertas por WhatsApp, integraciones ERP.', en: 'Dedicated support, WhatsApp alerts, ERP integrations.' } },
    ],
    entryPaid: { amount: 990, currency: 'UYU', text: '$ 990 + IVA/mes' },
    features: { aiPliego: 'si', emailAlerts: 'si', whatsappTelegram: 'si', savedSearches: 'si', bidTooling: 'si', api: 'desconocido', legalAdvisory: 'si' },
    coverage: { es: 'SICE/comprasestatales: llamados abiertos, PAC y adjudicaciones desde 2002.', en: 'SICE/comprasestatales: open calls, annual plans (PAC) and awards since 2002.' },
    legalValidation: { es: 'Asesoría jurídica personalizada del estudio asociado Grupo Deana (RUPE, revisión de ofertas, aclaraciones, impugnaciones y recursos ante el Tribunal de Cuentas).', en: 'Personalized legal advice from partner firm Grupo Deana (RUPE, offer review, clarifications, challenges and appeals before the Court of Accounts).' },
    ux: { es: 'Sitio en español claro para PYMEs; suma una capa de gestión de ofertas (constructor ítem por ítem, checklist, calendario, dashboard) que los agregadores no tienen.', en: 'Clear Spanish site for SMEs; adds a bid-management layer (item-by-item builder, checklist, calendar, dashboard) that aggregators lack.' },
    sources: ['https://proveedoruy.com/', 'https://proveedoruy.com/#planes', 'https://proveedoruy.com/#asesoria'],
    confidence: 'media',
    caveats: [
      { es: 'Servicio nuevo: el dominio se registró en 2026 (RDAP). Tené en cuenta la corta trayectoria al evaluarlo.', en: 'New service: the domain was registered in 2026 (RDAP). Weigh its short track record when evaluating it.' },
      { es: 'El sitio muestra "$ 990" / "$ 1.990" con "+ IVA" pero no etiqueta la moneda: pesos es una inferencia por contexto, no un dato confirmado en pantalla.', en: 'The site shows "$ 990" / "$ 1,990" with "+ VAT" but does not label the currency: pesos is inferred from context, not confirmed on screen.' },
      { es: 'La asesoría jurídica es un servicio complementario que se coordina con el estudio; sus costos NO están incluidos en la suscripción.', en: 'Legal advice is a complementary service coordinated with the firm; its cost is NOT included in the subscription.' },
    ],
  },
  {
    id: 'clearbid',
    name: 'ClearBid',
    url: 'https://clearbid.uy/',
    group: 'core',
    tagline: { es: 'Ganá más licitaciones con inteligencia de datos.', en: 'Win more tenders with data intelligence.' },
    countryFocus: { es: 'Uruguay · datos OCDS de ARCE', en: 'Uruguay · OCDS data from ARCE' },
    reachable: true,
    hasFreeTier: true,
    freeTrial: { es: 'Plan Free para siempre (sin tarjeta) + 7 días de prueba de los pagos.', en: 'Free plan forever (no card) + 7-day trial of paid plans.' },
    plans: [
      { name: 'Free', priceText: 'USD 0', amount: 0, currency: 'USD', period: 'unico', note: { es: 'Exploración histórica, rankings, señales de integridad, concentración (HHI).', en: 'Historical exploration, rankings, integrity signals, concentration (HHI).' } },
      { name: 'Pro', priceText: 'USD 25 / mes', amount: 25, currency: 'USD', period: 'mes', note: { es: 'Llamados de tu artículo, 5 perfiles, vigilar 3 competidores, pipeline de ofertas.', en: 'Calls for your item, 5 profiles, watch 3 competitors, bid pipeline.' } },
      { name: 'Premium', priceText: 'USD 89 / mes', amount: 89, currency: 'USD', period: 'mes', note: { es: 'Perfiles/competidores ilimitados, head-to-head, forecast de demanda, estimador de costos.', en: 'Unlimited profiles/competitors, head-to-head, demand forecast, cost estimator.' } },
    ],
    entryPaid: { amount: 25, currency: 'USD', text: 'USD 25/mes' },
    features: { aiPliego: 'no', emailAlerts: 'si', whatsappTelegram: 'no', savedSearches: 'si', bidTooling: 'si', api: 'desconocido', legalAdvisory: 'no' },
    coverage: { es: 'Datos oficiales OCDS de ARCE (+750.000 contratos, cifra del sitio). No BPS ni intendencias.', en: 'Official OCDS data from ARCE (+750,000 contracts, per the site). No BPS or municipalities.' },
    legalValidation: { es: 'Ninguna. Aclara que las alertas responden a criterios estadísticos que pueden no reflejar el contexto real.', en: 'None. Notes its alerts follow statistical criteria that may not reflect real context.' },
    ux: { es: 'Enfoque competitivo/comercial (vigilancia de competidores, head-to-head, forecast). NO ofrece resumen de pliegos con IA.', en: 'Competitive/commercial focus (competitor watch, head-to-head, forecast). Does NOT offer AI document summaries.' },
    sources: ['https://clearbid.uy/', 'https://clearbid.uy/planes'],
    confidence: 'alta',
  },
  {
    id: 'licitapro',
    name: 'LicitaPro',
    url: 'https://licitapro.uy/',
    group: 'core',
    tagline: { es: 'Licitaciones públicas en Uruguay con IA: resúmenes, chat y alertas.', en: 'Uruguayan public tenders with AI: summaries, chat and alerts.' },
    countryFocus: { es: 'Uruguay · portal estatal (fuente no nombrada)', en: 'Uruguay · state portal (source unnamed)' },
    reachable: true,
    hasFreeTier: true,
    freeTrial: { es: 'Plan de prueba gratuita (sin duración publicada).', en: 'Free trial plan (no published duration).' },
    plans: [
      { name: 'Inicio', priceText: 'USD 7 / mes', amount: 7, currency: 'USD', period: 'mes', note: { es: '400 créditos/mes (~15 resúmenes, ~10 propuestas). Soporte por email.', en: '400 credits/mo (~15 summaries, ~10 proposals). Email support.' } },
      { name: 'Pro', priceText: 'USD 19 / mes', amount: 19, currency: 'USD', period: 'mes', note: { es: '1200 créditos/mes. Soporte telefónico.', en: '1200 credits/mo. Phone support.' } },
      { name: 'Empresarial', priceText: 'USD 89 / mes', amount: 89, currency: 'USD', period: 'mes', note: { es: '6000 créditos/mes, pago por transferencia.', en: '6000 credits/mo, bank-transfer payment.' } },
    ],
    entryPaid: { amount: 7, currency: 'USD', text: 'USD 7/mes' },
    features: { aiPliego: 'si', emailAlerts: 'si', whatsappTelegram: 'no', savedSearches: 'si', bidTooling: 'si', api: 'desconocido', legalAdvisory: 'no' },
    coverage: { es: 'Licitaciones públicas de Uruguay; filtros por sector/organismo/artículo. No nombra la fuente que ingiere.', en: 'Uruguayan public tenders; filters by sector/agency/item. Does not name its data source.' },
    legalValidation: { es: 'Ninguna.', en: 'None.' },
    ux: { es: 'Precio por créditos (un pozo mensual consumido por resúmenes/propuestas/consultas): flexible pero difícil de comparar de igual a igual con planes planos. Precios en USD.', en: 'Credit-based pricing (a monthly pool spent on summaries/proposals/queries): flexible but hard to compare with flat plans. Prices in USD.' },
    sources: ['https://licitapro.uy/', 'https://licitapro.uy/resumenes-licitaciones'],
    confidence: 'alta',
    caveats: [
      { es: 'Precio por créditos: los "créditos" se convierten en cantidades aproximadas de acciones, no en cifras garantizadas.', en: 'Credit-based: "credits" map to approximate action counts, not guaranteed quantities.' },
    ],
  },
  {
    id: 'licitaya',
    name: 'Licita Ya',
    url: 'https://www.licitaya.uy/',
    group: 'core',
    tagline: { es: 'Encontrá licitaciones públicas sin revisar publicaciones todos los días.', en: 'Find public tenders without checking listings every day.' },
    countryFocus: { es: 'Uruguay (marca de Portal Genial, Brasil) · fuente no nombrada', en: 'Uruguay (a Portal Genial brand, Brazil) · source unnamed' },
    reachable: true,
    hasFreeTier: true,
    freeTrial: { es: 'Prueba gratis de 14 días, sin tarjeta (alta con email + palabras clave).', en: '14-day free trial, no card (sign up with email + keywords).' },
    plans: [
      { name: '1 mes', priceText: '$U 1.900 / mes', amount: 1900, currency: 'UYU', period: 'mes', note: { es: 'Precio mensual base; hay descuentos por 3/6/12/24/36 meses (hasta ~$U 1.292/mes).', en: 'Base monthly price; discounts for 3/6/12/24/36 months (down to ~$U 1,292/mo).' } },
      { name: '1 año', priceText: '$U 17.784 / año', amount: 17784, currency: 'UYU', period: 'ano', note: { es: '+2 meses gratis. ~$U 1.482/mes.', en: '+2 months free. ~$U 1,482/mo.' } },
    ],
    entryPaid: { amount: 1900, currency: 'UYU', text: '$U 1.900/mes' },
    features: { aiPliego: 'no', emailAlerts: 'si', whatsappTelegram: 'no', savedSearches: 'si', bidTooling: 'no', api: 'si', legalAdvisory: 'no' },
    coverage: { es: 'Publicaciones oficiales de compras públicas (agregador UY + Brasil). No detalla fuentes uruguayas concretas.', en: 'Official procurement listings (UY + Brazil aggregator). Does not detail concrete Uruguayan sources.' },
    legalValidation: { es: 'Ninguna. Aclara que sólo agrega licitaciones y no participa de los procesos.', en: 'None. States it only aggregates tenders and does not take part in the processes.' },
    ux: { es: 'Precios totalmente transparentes con descuentos por período. Búsqueda "con IA" y vista en mapa, pero NO resume pliegos con IA. Tiene API documentada.', en: 'Fully transparent prices with term discounts. "AI" search and map view, but does NOT summarize documents with AI. Has a documented API.' },
    sources: ['https://www.licitaya.uy/home.php', 'https://www.licitaya.uy/subscription.php'],
    confidence: 'alta',
  },
  {
    id: 'dsoluciones',
    name: 'Des@rrollo Soluciones',
    url: 'https://www.dsoluciones.com.uy/servicios/notificaciones/compras-estatales',
    group: 'core',
    tagline: { es: 'Alertas automáticas de llamados de Compras Estatales (ARCE).', en: 'Automatic alerts for Compras Estatales (ARCE) tenders.' },
    countryFocus: { es: 'Uruguay · ARCE / ACCE, por organismo/inciso', en: 'Uruguay · ARCE / ACCE, by agency/inciso' },
    reachable: true,
    hasFreeTier: true,
    freeTrial: { es: 'Plan Gratis permanente limitado a 1 organismo/inciso.', en: 'Permanent free plan limited to 1 agency/inciso.' },
    plans: [
      { name: 'Gratis', priceText: 'Gratis', amount: 0, currency: 'UYU', period: 'desconocido', note: { es: '1 inciso, alertas de nuevos llamados y modificaciones.', en: '1 inciso, alerts for new calls and changes.' } },
      { name: 'Mensual', priceText: '$ 250 UYU / mes', amount: 250, currency: 'UYU', period: 'mes', note: { es: 'Varios incisos, recordatorios a 7/3/0 días del cierre.', en: 'Multiple incisos, reminders 7/3/0 days before close.' } },
      { name: 'Anual', priceText: '$ 2.500 UYU / año', amount: 2500, currency: 'UYU', period: 'ano', note: { es: 'Todos los incisos (≈10 meses de costo).', en: 'All incisos (≈10 months of cost).' } },
    ],
    entryPaid: { amount: 250, currency: 'UYU', text: '$ 250/mes' },
    features: { aiPliego: 'no', emailAlerts: 'si', whatsappTelegram: 'no', savedSearches: 'desconocido', bidTooling: 'no', api: 'desconocido', legalAdvisory: 'no' },
    coverage: { es: 'Compras Estatales (ARCE), organizado por organismo/inciso; monitoreo ~cada hora.', en: 'Compras Estatales (ARCE), organized by agency/inciso; monitored ~hourly.' },
    legalValidation: { es: 'Ninguna.', en: 'None.' },
    ux: { es: 'El más barato con plan pago ($250/mes). Alertas por email con recordatorios de cierre; sin IA. Producto secundario de una empresa que también vende otros servicios.', en: 'Cheapest paid plan ($250/mo). Email alerts with deadline reminders; no AI. A side product of a firm that also sells other services.' },
    sources: ['https://www.dsoluciones.com.uy/servicios/notificaciones/compras-estatales'],
    confidence: 'alta',
  },
  // ─── UY-native con precio opaco / venta consultiva ──────────────────────────
  {
    id: 'trexia',
    name: 'Trexia',
    url: 'https://app.trexia.ai/',
    group: 'opaque',
    tagline: { es: 'IA que anticipa compras estatales antes de su publicación.', en: 'AI that anticipates state purchases before publication.' },
    countryFocus: { es: 'Uruguay (y Paraguay) · organismos estatales, paraestatales y multilaterales', en: 'Uruguay (and Paraguay) · state, para-state and multilateral bodies' },
    reachable: true,
    hasFreeTier: false,
    freeTrial: { es: 'Período de prueba de 1 mes (según prensa; no figura en el sitio).', en: '1-month trial (per press; not shown on the site).' },
    plans: [
      { name: 'Suscripción', priceText: 'Consultar (prensa: desde US$ 50/mes)', amount: 0, currency: 'UNKNOWN', period: 'desconocido', note: { es: 'El sitio no publica precios; toda conversión pasa por "Agendar conversación".', en: 'The site publishes no prices; every path goes through "Book a call".' } },
    ],
    entryPaid: null,
    features: { aiPliego: 'si', emailAlerts: 'desconocido', whatsappTelegram: 'desconocido', savedSearches: 'si', bidTooling: 'si', api: 'desconocido', legalAdvisory: 'no' },
    coverage: { es: 'Módulo "Compras Futuro" que identifica oportunidades hasta 6 meses antes de la publicación oficial (basado en el PAC).', en: '"Compras Futuro" module that surfaces opportunities up to 6 months before official publication (based on the annual plan).' },
    legalValidation: { es: 'Ninguna. Respaldo tecnológico/institucional (Microsoft, AWS, ANDE, ORT).', en: 'None. Tech/institutional backing (Microsoft, AWS, ANDE, ORT).' },
    ux: { es: 'Venta enterprise/consultiva, sin registro ni precios públicos. Diferenciador: anticipación de llamados.', en: 'Enterprise/consultative sales, no public signup or pricing. Differentiator: tender anticipation.' },
    sources: ['https://app.trexia.ai/'],
    confidence: 'media',
    caveats: [
      { es: 'El precio "desde US$ 50/mes" proviene de una nota de prensa (InfoNegocios), NO del sitio oficial.', en: 'The "from US$ 50/mo" price comes from a press article (InfoNegocios), NOT the official site.' },
    ],
  },
  // ─── Agregadores regionales: Uruguay es 1 de muchos países ──────────────────
  {
    id: 'latamcompra',
    name: 'LatamCompra',
    url: 'https://www.latamcompra.com/',
    group: 'regional',
    tagline: { es: 'Centraliza licitaciones de Latinoamérica (17 países).', en: 'Centralizes Latin American tenders (17 countries).' },
    countryFocus: { es: '17 países LATAM (Uruguay es uno) · fuente UY no nombrada', en: '17 LATAM countries (Uruguay is one) · UY source unnamed' },
    reachable: true,
    hasFreeTier: true,
    freeTrial: { es: 'Prueba de 7 días (Uruguay), sin pago.', en: '7-day trial (Uruguay), no payment.' },
    plans: [{ name: 'Suscripción', priceText: 'Consultar (sin precio público)', amount: 0, currency: 'UNKNOWN', period: 'desconocido', note: { es: '/precios devuelve 410; el precio sólo se obtiene tras registrarse.', en: '/precios returns 410; price only after registering.' } }],
    entryPaid: null,
    features: { aiPliego: 'no', emailAlerts: 'si', whatsappTelegram: 'no', savedSearches: 'si', bidTooling: 'desconocido', api: 'si', legalAdvisory: 'no' },
    coverage: { es: '+14M licitaciones en 17 países + Europa. Para UY no nombra la fuente oficial.', en: '+14M tenders across 17 countries + Europe. Does not name the official UY source.' },
    legalValidation: { es: 'Ninguna (la "asesoría jurídica" es un rubro que rastrea, no un respaldo propio).', en: 'None (its "legal advice" is a tracked sector, not its own backing).' },
    ux: { es: 'Producto pan-LATAM de origen colombiano; asistente IA para chatear con el pliego (no resumen). Precios totalmente opacos.', en: 'Pan-LATAM product of Colombian origin; AI assistant to chat with the document (not summarize). Fully opaque pricing.' },
    sources: ['https://www.latamcompra.com/region/uruguay'],
    confidence: 'media',
  },
  {
    id: 'b2btenders',
    name: 'B2BTenders',
    url: 'https://software-srm.b2btenders.com/informacion-licitaciones-publicas-en-/uruguay/arce',
    group: 'regional',
    tagline: { es: 'Software SRM con alertas de licitaciones en +12 países.', en: 'SRM software with tender alerts across 12+ countries.' },
    countryFocus: { es: 'Uruguay (ARCE/ACCE) + 12 países · Uruguay secundario', en: 'Uruguay (ARCE/ACCE) + 12 countries · Uruguay secondary' },
    reachable: true,
    hasFreeTier: true,
    freeTrial: { es: 'Plan BRONCE gratis permanente + DEMO de 30 días.', en: 'Permanent free BRONCE plan + 30-day DEMO.' },
    plans: [
      { name: 'PLATA', priceText: '$ 5 USD / mes', amount: 5, currency: 'USD', period: 'mes', note: { es: '500 alertas, cobertura internacional.', en: '500 alerts, international coverage.' } },
      { name: 'ORO', priceText: '$ 13 USD / mes', amount: 13, currency: 'USD', period: 'mes', note: { es: 'Alertas ilimitadas.', en: 'Unlimited alerts.' } },
      { name: 'ORO PLUS', priceText: '$ 17 USD / mes', amount: 17, currency: 'USD', period: 'mes', note: { es: 'Usuarios ilimitados.', en: 'Unlimited users.' } },
    ],
    entryPaid: { amount: 5, currency: 'USD', text: '$ 5 USD/mes' },
    features: { aiPliego: 'no', emailAlerts: 'si', whatsappTelegram: 'no', savedSearches: 'si', bidTooling: 'si', api: 'desconocido', legalAdvisory: 'no' },
    coverage: { es: 'Uruguay ARCE/ACCE + 12 países. Sus listados UY vistos estaban fechados en 2023 pese al "tiempo real".', en: 'Uruguay ARCE/ACCE + 12 countries. Its UY listings seen were dated 2023 despite "real time".' },
    legalValidation: { es: 'Ninguna.', en: 'None.' },
    ux: { es: 'Herramienta SRM (gestión de proveedores) con alertas como módulo; el más barato en USD, pero español genérico y datos UY posiblemente desactualizados.', en: 'SRM (supplier management) tool with alerts as a module; cheapest in USD, but generic Spanish and possibly stale UY data.' },
    sources: ['https://software-srm.b2btenders.com/planes-de-licitacion-publica-y-privada'],
    confidence: 'alta',
    caveats: [
      { es: 'El claim "en tiempo real" no se pudo confirmar: los listados UY vistos databan de 2023.', en: 'The "real time" claim could not be confirmed: the UY listings seen dated from 2023.' },
    ],
  },
  {
    id: 'licitacionespublica',
    name: 'Licitaciones Pública',
    url: 'https://www.licitacionespublica.com/pais/uruguay',
    group: 'regional',
    tagline: { es: 'Alertas gratis de licitaciones por email (13 países).', en: 'Free tender alerts by email (13 countries).' },
    countryFocus: { es: '13 países, foco Colombia · Uruguay cobertura genérica', en: '13 countries, Colombia focus · Uruguay generic coverage' },
    reachable: true,
    hasFreeTier: true,
    freeTrial: { es: 'Servicio gratuito y permanente ("Crear alertas gratis").', en: 'Free, permanent service ("Create free alerts").' },
    plans: [{ name: 'Alertas', priceText: 'Gratis', amount: 0, currency: 'UNKNOWN', period: 'desconocido', note: { es: 'Sin plan de pago visible; sin páginas institucionales.', en: 'No visible paid plan; no institutional pages.' } }],
    entryPaid: null,
    features: { aiPliego: 'no', emailAlerts: 'si', whatsappTelegram: 'no', savedSearches: 'si', bidTooling: 'no', api: 'desconocido', legalAdvisory: 'no' },
    coverage: { es: 'Agregador multi-país centrado en Colombia; para Uruguay no declara fuente ni frescura.', en: 'Multi-country aggregator centered on Colombia; for Uruguay it declares no source or freshness.' },
    legalValidation: { es: 'Ninguna.', en: 'None.' },
    ux: { es: 'Gratis y de baja fricción, pero opacidad institucional total: no dice quién lo opera ni de dónde saca los datos de Uruguay.', en: 'Free and low-friction, but total institutional opacity: no operator named and no Uruguayan data source.' },
    sources: ['https://www.licitacionespublica.com/pais/uruguay'],
    confidence: 'alta',
  },
  // ─── Fuera de alcance para Uruguay ──────────────────────────────────────────
  {
    id: 'ialicitaciones',
    name: 'iaLicitaciones',
    url: 'https://ialicitaciones.com/',
    group: 'outOfScope',
    tagline: { es: 'Plataforma de IA para licitaciones — España/UE, NO cubre Uruguay.', en: 'AI tender platform — Spain/EU, does NOT cover Uruguay.' },
    countryFocus: { es: 'España/UE, Colombia, México (PLACSP/TED/SECOP). NO Uruguay.', en: 'Spain/EU, Colombia, Mexico (PLACSP/TED/SECOP). NOT Uruguay.' },
    reachable: true,
    hasFreeTier: true,
    freeTrial: { es: '1 licitación gratis / 7 días (plan Pro), sin tarjeta.', en: '1 free tender / 7 days (Pro plan), no card.' },
    plans: [
      { name: 'Starter', priceText: '€29 / mes', amount: 29, currency: 'EUR', period: 'mes' },
      { name: 'Pro', priceText: '€99 / mes', amount: 99, currency: 'EUR', period: 'mes' },
      { name: 'Business', priceText: '€299 / mes', amount: 299, currency: 'EUR', period: 'mes' },
    ],
    entryPaid: { amount: 29, currency: 'EUR', text: '€29/mes' },
    features: { aiPliego: 'si', emailAlerts: 'si', whatsappTelegram: 'si', savedSearches: 'si', bidTooling: 'si', api: 'desconocido', legalAdvisory: 'no' },
    coverage: { es: 'España (PLACSP), TED Europa, SECOP Colombia. No incluye Uruguay.', en: 'Spain (PLACSP), TED Europe, SECOP Colombia. Does not include Uruguay.' },
    legalValidation: { es: 'Ninguna.', en: 'None.' },
    ux: { es: 'Se incluye sólo para descartarla: pese a nombrarse similar, es española, cotiza en euros y no cubre licitaciones uruguayas.', en: 'Listed only to rule it out: despite the similar name, it is Spanish, priced in euros, and does not cover Uruguayan tenders.' },
    sources: ['https://ialicitaciones.com/precios/'],
    confidence: 'alta',
    caveats: [
      { es: 'NO aplica a Uruguay: plataforma española con foco España/UE/Colombia/México, precios en EUR.', en: 'Does NOT apply to Uruguay: Spanish platform focused on Spain/EU/Colombia/Mexico, EUR pricing.' },
    ],
  },
  // ─── No verificables ────────────────────────────────────────────────────────
  {
    id: 'licitaia',
    name: 'LICITAIA',
    url: 'https://licitaia.com.uy/',
    group: 'unverified',
    tagline: { es: 'Análisis de licitaciones con IA (Uruguay) — sitio no accesible.', en: 'AI tender analysis (Uruguay) — site unreachable.' },
    countryFocus: { es: 'Uruguay (según caché) · no verificable', en: 'Uruguay (per cache) · unverifiable' },
    reachable: false,
    hasFreeTier: false,
    freeTrial: { es: 'Desconocido — el sitio no carga.', en: 'Unknown — the site does not load.' },
    plans: [],
    entryPaid: null,
    features: { aiPliego: 'si', emailAlerts: 'si', whatsappTelegram: 'desconocido', savedSearches: 'desconocido', bidTooling: 'desconocido', api: 'desconocido', legalAdvisory: 'no' },
    coverage: { es: 'No verificable (sitio caído / geo-bloqueado).', en: 'Unverifiable (site down / geo-blocked).' },
    legalValidation: { es: 'No verificable.', en: 'Unverifiable.' },
    ux: { es: 'No se pudo evaluar: el sitio no responde. Todo dato proviene de fragmentos en caché.', en: 'Could not be assessed: the site does not respond. All data comes from cached snippets.' },
    sources: ['https://licitaia.com.uy/'],
    confidence: 'baja',
    caveats: [
      { es: 'No verificable en sitio: no responde desde fuera de Uruguay. Sin precios ni datos confirmados.', en: 'Unverifiable on-site: does not respond from outside Uruguay. No confirmed prices or data.' },
    ],
  },
  {
    id: 'licitamatch',
    name: 'LicitaMatch (Neuratek)',
    url: 'https://neuratek.ai/',
    group: 'unverified',
    tagline: { es: 'Buscador/alertas de Compras Estatales — sin sitio activo.', en: 'Compras Estatales search/alerts — no active site.' },
    countryFocus: { es: 'Uruguay (según snippet) · no verificable', en: 'Uruguay (per snippet) · unverifiable' },
    reachable: false,
    hasFreeTier: false,
    freeTrial: { es: 'Desconocido — el subdominio no resuelve (NXDOMAIN).', en: 'Unknown — the subdomain does not resolve (NXDOMAIN).' },
    plans: [],
    entryPaid: null,
    features: { aiPliego: 'desconocido', emailAlerts: 'desconocido', whatsappTelegram: 'desconocido', savedSearches: 'desconocido', bidTooling: 'desconocido', api: 'desconocido', legalAdvisory: 'no' },
    coverage: { es: 'No verificable (NXDOMAIN, sin copia archivada).', en: 'Unverifiable (NXDOMAIN, no archived copy).' },
    legalValidation: { es: 'No verificable.', en: 'Unverifiable.' },
    ux: { es: 'Probablemente un entorno de staging no lanzado o dado de baja. Nada pudo confirmarse.', en: 'Likely an unreleased or retired staging environment. Nothing could be confirmed.' },
    sources: ['https://neuratek.ai/'],
    confidence: 'baja',
    caveats: [
      { es: 'No verificable: el subdominio del producto no resuelve. Se lista sólo para dejar constancia.', en: 'Unverifiable: the product subdomain does not resolve. Listed only for the record.' },
    ],
  },
]

/**
 * Antigüedad corroborada de cada dominio. Fuentes: RDAP (fecha de registro del
 * dominio) y Wayback Machine (primer archivo web). Verificado 2026-07-21. Los
 * dominios .uy no tienen whois público (NIC.uy no lo publica) y varios sitios
 * nuevos aún no tienen snapshots en Wayback → "sin dato" (año null). Que un .uy
 * figure "s/d" NO implica que sea antiguo: solo que su fecha no es pública.
 */
export const ESTABLISHED: Record<string, { year: number | null, basis: Bi }> = {
  gubly: { year: null, basis: { es: '.uy sin whois público; sin archivo en Wayback', en: '.uy has no public whois; no Wayback archive' } },
  proveedoruy: { year: 2026, basis: { es: 'dominio registrado el 2026-05-17 (RDAP)', en: 'domain registered 2026-05-17 (RDAP)' } },
  clearbid: { year: null, basis: { es: '.uy sin whois público; sin archivo web', en: '.uy has no public whois; no web archive' } },
  licitapro: { year: null, basis: { es: '.uy sin whois público; sin archivo web', en: '.uy has no public whois; no web archive' } },
  licitaya: { year: null, basis: { es: 'marca Portal Genial (Brasil, 2004); dominio .uy sin fecha pública', en: 'Portal Genial brand (Brazil, 2004); .uy domain has no public date' } },
  dsoluciones: { year: 2024, basis: { es: 'primer archivo web 2024 (Wayback)', en: 'first web archive 2024 (Wayback)' } },
  trexia: { year: 2025, basis: { es: 'dominio registrado en 2025 (RDAP)', en: 'domain registered 2025 (RDAP)' } },
  latamcompra: { year: 2015, basis: { es: 'dominio registrado en 2015 (RDAP)', en: 'domain registered 2015 (RDAP)' } },
  b2btenders: { year: 2001, basis: { es: 'dominio activo desde 2001 (Wayback); registro actual 2021', en: 'domain active since 2001 (Wayback); current registration 2021' } },
  licitacionespublica: { year: 2021, basis: { es: 'primer archivo web 2021 (Wayback)', en: 'first web archive 2021 (Wayback)' } },
  ialicitaciones: { year: 2025, basis: { es: 'dominio registrado en 2025 (RDAP)', en: 'domain registered 2025 (RDAP)' } },
  licitaia: { year: null, basis: { es: '.uy sin whois; sitio caído', en: '.uy no whois; site down' } },
  neuratek: { year: 2024, basis: { es: 'dominio registrado en 2024 (RDAP)', en: 'domain registered 2024 (RDAP)' } },
}

/** Filas de la matriz objetiva, en orden. */
export interface Dimension { key: string, label: Bi, help?: Bi }
export const DIMENSIONS: Dimension[] = [
  { key: 'countryFocus', label: { es: 'Foco y fuente', en: 'Focus & source' }, help: { es: 'País y feed oficial que cubre.', en: 'Country and official feed covered.' } },
  { key: 'established', label: { es: 'En línea desde', en: 'Online since' }, help: { es: 'Antigüedad del dominio (RDAP / archivo web). "s/d" = .uy sin whois público.', en: 'Domain age (RDAP / web archive). "s/d" = .uy with no public whois.' } },
  { key: 'entryPaid', label: { es: 'Precio de entrada', en: 'Entry price' }, help: { es: 'Plan pago más barato, en su moneda original (sin convertir).', en: 'Cheapest paid plan, in its original currency (no conversion).' } },
  { key: 'freeTier', label: { es: 'Gratis / prueba', en: 'Free / trial' } },
  { key: 'aiPliego', label: { es: 'Resumen IA de pliego', en: 'AI document summary' } },
  { key: 'legalAdvisory', label: { es: 'Asesoría jurídica', en: 'Legal advisory' } },
  { key: 'alertChannels', label: { es: 'Canales de alerta', en: 'Alert channels' } },
  { key: 'bidTooling', label: { es: 'Gestión de ofertas', en: 'Bid tooling' } },
  { key: 'api', label: { es: 'API', en: 'API' } },
]

export const METHODOLOGY: Bi = {
  es: `Datos relevados de los sitios oficiales de cada servicio en ${VERIFIED_ON}, con fuente por dato. Los precios se muestran tal cual (en su moneda: USD, pesos o euros) y NO se convierten entre sí: mezclan monedas, algunos cotizan "+ IVA" y otros por créditos, así que las cifras no son directamente comparables. Lo no publicado figura como "Consultar"; lo que no se pudo confirmar se marca como tal. La antigüedad ("en línea desde") se corroboró con RDAP (fecha de registro del dominio) y la Wayback Machine (primer archivo web); los dominios .uy no tienen whois público, así que varios figuran "s/d" —eso no significa que sean antiguos, sino que su fecha no es pública. Ningún proveedor cubre de forma verificable BPS ni intendencias: donde nombran la fuente, es ARCE/comprasestatales. Las cifras de volumen que cada empresa afirma no fueron verificadas de forma independiente.`,
  en: `Data gathered from each service's official site on ${VERIFIED_ON}, sourced per fact. Prices are shown as-is (in their currency: USD, pesos or euros) and are NOT converted between each other: they mix currencies, some quote "+ VAT" and others by credits, so the figures are not directly comparable. Unpublished prices read "Consultar"; anything unconfirmable is marked. Age ("online since") was corroborated with RDAP (domain registration date) and the Wayback Machine (first web archive); .uy domains have no public whois, so several read "s/d" — that does not mean they are old, only that their date is not public. No provider verifiably covers BPS or municipalities: where a source is named, it is ARCE/comprasestatales. Volume figures each company claims were not independently verified.`,
}

export const NEUTRALITY: Bi = {
  es: 'Esta comparativa es un recurso independiente. No tenemos vínculo comercial ni patrocinio con ninguno de los servicios listados. Cada empresa puede pedir una corrección.',
  en: 'This comparison is an independent resource. We have no commercial ties to or sponsorship from any listed service. Any company may request a correction.',
}

/** Bloque editorial (OPINIÓN, rotulada). Se apoya sólo en hechos verificados. */
export const RECOMMENDATION = {
  providerId: 'proveedoruy',
  title: { es: 'Nuestra recomendación para PYMES', en: 'Our recommendation for SMEs' },
  disclosure: { es: 'Opinión propia · sin patrocinio · sin vínculo comercial', en: 'Our own opinion · no sponsorship · no commercial ties' },
  body: {
    es: 'Para quien recién empieza a presentarse a licitaciones del Estado — el perfil más común entre las PYMEs uruguayas — nuestra recomendación es ProveedorUY. Es el único servicio del relevamiento que suma asesoría jurídica de un estudio (Grupo Deana): registro y gestión del RUPE, revisión previa de ofertas, aclaraciones e impugnaciones ante el Tribunal de Cuentas. A eso le agrega una capa de gestión de ofertas (constructor ítem por ítem, checklist de cumplimiento, calendario de plazos) que los agregadores no tienen, resumen de pliegos con IA y una prueba de 10 días sin tarjeta. Para un proveedor sin equipo jurídico propio, ese acompañamiento reduce el mayor riesgo de una licitación: quedar afuera por un error formal.',
    en: 'For those just starting to bid on state tenders — the most common profile among Uruguayan SMEs — our recommendation is ProveedorUY. It is the only service in the survey that adds legal advice from a firm (Grupo Deana): RUPE registration and management, prior review of offers, clarifications and challenges before the Court of Accounts. It also adds a bid-management layer (item-by-item builder, compliance checklist, deadline calendar) that aggregators lack, AI document summaries and a 10-day no-card trial. For a supplier without an in-house legal team, that support cuts a tender\'s biggest risk: being disqualified over a formal error.',
  },
  caveat: {
    es: 'Con salvedades objetivas: es un servicio nuevo (dominio registrado en 2026), el sitio no etiqueta la moneda de sus precios (se infiere pesos) y la asesoría jurídica es un servicio aparte, con costo no incluido en la suscripción.',
    en: 'With objective caveats: it is a new service (domain registered in 2026), the site does not label its price currency (pesos is inferred) and the legal advice is a separate service, at a cost not included in the subscription.',
  },
}
