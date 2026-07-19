/**
 * Curros — documented public-procurement cases, cross-referenced with the data.
 *
 * A `curro` (Uruguayan vernacular for a rigged/irregular deal) is a case that
 * has been *destapado* — surfaced by the press, an audit body (Tribunal de
 * Cuentas, JUTEP) or the courts — and can be tied to concrete spending in the
 * `releases` collection. It is the same idea as a recopilatorio (a saved query
 * over the data, resolved live) but carries two extra, load-bearing things:
 *
 *   1. `status` + `statusNote` — the *legal/administrative stage* (denuncia,
 *      investigación, imputación, condena, auditoría…). This site does not call
 *      anyone guilty: it reports where each case stands and attributes claims.
 *   2. `sources` — reputable citations (outlet + title + URL + date). Nothing
 *      goes on this list without them. The DB numbers show the money; the
 *      sources show why it is a case.
 *
 * The `query` isolates the relevant contracts using the SAME params the public
 * explorer understands (see server/api/contracts/index.get.ts →
 * `buildContractFilters`). So a curro is a pre-built explorer filter with a
 * verified story, a legal status and its sources around it.
 *
 * ── Editorial rules for adding a case ────────────────────────────────────────
 *  • Only cases with ≥2 reputable sources and a sourced legal status.
 *  • Phrase the `hallazgo` as reported/alleged, attributed — never as a verdict
 *    unless there is a firm `condena`.
 *  • Verify the query's count/total against the live data before shipping (the
 *    /api/curros endpoints resolve it live, so a wrong query shows wrong money).
 *  • The DB set is a *cross-reference*, not proof of wrongdoing: it is what the
 *    state spent with the entities named in the case. Say so (see `caveat`).
 */

/** Where a case stands. Rendered via i18n (`curros.status.<value>`). */
export type CurroStatus
  = | 'denuncia' // a complaint has been filed / press revelation
    | 'auditoria' // an audit body (TCR, JUTEP, AIN) observed irregularities
    | 'investigacion' // open judicial/parliamentary investigation
    | 'imputacion' // prosecutor has named a formal suspect
    | 'formalizacion' // court has formalised proceedings against someone
    | 'procesamiento' // (pre-2017 code) formal prosecution ordered
    | 'juicio' // case is at trial
    | 'condena' // final conviction
    | 'absolucion' // acquittal / dismissal on the merits
    | 'archivo' // shelved / closed without charges
    | 'rescision' // contract rescinded / annulled

export interface CurroQuery {
  /** buyer.id values (e.g. "60-1" = ANCAP, "3-18" = Armada). */
  buyerIds?: string[]
  /** Supplier company names as they appear as proveedor. `*foo*` = contains. */
  suppliers?: string[]
  /** Exact supplier ids (RUT-derived, e.g. "R/211203010017"). */
  supplierIds?: string[]
  /** Free-text phrase — matches objeto, artículos, proveedor (explorer search). */
  search?: string
  /** Exact catalogue codes (classification.id), when the case is a product. */
  categoryId?: string[]
  /** Uruguayan procedure names ("Compra Directa", "Licitación Pública"…). */
  procurementMethodDetails?: string[]
  yearFrom?: number
  yearTo?: number
  amountFrom?: number
  amountTo?: number
}

export interface CurroSource {
  /** The outlet or body: "El Observador", "Tribunal de Cuentas", "Fiscalía"… */
  outlet: string
  title: string
  url: string
  /** Free date label, shown as-is (e.g. "2024-05" or "May 2024"). */
  date?: string
}

export interface CurroText {
  title: string
  /** One-line standfirst. */
  dek: string
  /** What the irregularity is — reported/alleged, attributed. */
  hallazgo: string
  /** The current legal/administrative status in prose, with dates. */
  statusNote: string
  /** How the DB set relates to the case (scope, what it is / isn't). */
  caveat?: string
}

export interface CurroDef {
  slug: string
  emoji: string
  /** Free label for the period of the facts (e.g. "2014–2019"). */
  period?: string
  status: CurroStatus
  /** Headline amount as reported by the press, shown as-is (verbatim string). */
  amountReported?: string
  /** Optional link to an in-depth investigation page already on the site. */
  investigationPath?: string
  query: CurroQuery
  sources: CurroSource[]
  es: CurroText
  en: CurroText
}

/**
 * The cases. Each is verified against reputable sources and cross-referenced
 * against the live data. See the header for the editorial rules.
 *
 * ⚠️ On the money shown: the `query` isolates every contract the questioned
 * supplier billed the organism in the open data — NOT only the contracts a
 * source flagged. So the DB total is usually far larger than the reported
 * irregularity (e.g. Artigas: ~$119M billed vs ~US$3.8M questioned). Each
 * `caveat` states this. The list deliberately excludes famous cases whose
 * contracts are outside the OCDS Compras Estatales feed (Cardama, Gas Sayago,
 * OSE Neptuno-Arazatí, the ANCAP/Sendic card + Trafigura 2010-13) — they cannot
 * be honestly cross-referenced here.
 *
 * Ordered most-severe first (condena → procesamiento → investigación →
 * auditoría/denuncia).
 */
export const CURROS: CurroDef[] = [
  {
    slug: 'buena-estrella-asse-limpieza',
    emoji: '🧹',
    period: '2010–2011',
    status: 'condena',
    amountReported: 'Condena a Alfredo Silva (2018): ~$2.143.420 (~US$65.000)',
    query: { supplierIds: ['R/216569940019', 'R/216786150016'] },
    sources: [
      { outlet: 'El Observador', title: 'Sindicalista Alfredo Silva condenado a pagar $2 millones por corrupción en ASSE', url: 'https://www.elobservador.com.uy/nota/sindicalista-alfredo-silva-condenado-a-pagar-2-millones-por-corrupcion-en-asse-20186159120', date: '2018-06-15' },
      { outlet: '180.com.uy', title: 'Las razones de la condena a Alfredo Silva por su gestión en ASSE', url: 'https://180.com.uy/articulo/74791_las-razones-de-la-condena-a-alfredo-silva-por-su-gestion-en-asse', date: '2018-06-18' },
      { outlet: 'Subrayado', title: 'Juez procesó con prisión a Alfredo Silva', url: 'https://www.subrayado.com.uy/juez-proceso-prision-alfredo-silva-director-asse-n35390', date: '2014-07-18' },
      { outlet: 'El Observador', title: 'Cayó Alfredo Silva por corrupción', url: 'https://www.elobservador.com.uy/nota/cayo-alfredo-silva-por-corrupcion-y-la-justicia-cita-a-la-ministra-muniz-201471823340', date: '2014-07-18' },
    ],
    es: {
      title: 'Caso Buena Estrella: la limpieza de los hospitales de ASSE',
      dek: 'La cooperativa Buena Estrella limpiaba hospitales públicos con sobrefacturación y direccionamiento; terminó con procesamientos en 2014 y una condena en 2018.',
      hallazgo: 'Según la Justicia, hubo sobrefacturación y direccionamiento en los contratos de limpieza de hospitales de ASSE (Maciel, Rivera, Pando, Instituto del Cáncer) con la cooperativa Buena Estrella, más pagos de coimas a jerarcas para asegurar las contrataciones.',
      statusNote: 'En julio de 2014 el juez Néstor Valetti procesó a diez personas (Heber Tejeira con prisión por cohecho; Alfredo Silva sin prisión por conjunción del interés personal y público). En junio de 2018 la jueza Beatriz Larrieu condenó a Alfredo Silva a 2 años de prisión, inhabilitación y multa (~$2.143.420); la causa incluyó condenas por estafa y tráfico de influencia. Es el último estado documentado por la prensa consultada a julio de 2026.',
      caveat: 'El cruce muestra los dos contratos de la cooperativa Buena Estrella registrados en los datos abiertos (2010–2011); la cobertura del período es parcial.',
    },
    en: {
      title: 'The Buena Estrella case: cleaning ASSE’s hospitals',
      dek: 'The Buena Estrella cooperative cleaned public hospitals amid over-billing and bid-steering; it ended in 2014 prosecutions and a 2018 conviction.',
      hallazgo: 'According to the courts, there was over-billing and bid-steering in ASSE hospital-cleaning contracts (Maciel, Rivera, Pando, Cancer Institute) with the Buena Estrella cooperative, plus bribes to officials to secure the contracts.',
      statusNote: 'In July 2014 Judge Néstor Valetti prosecuted ten people (Heber Tejeira jailed for bribery; Alfredo Silva without prison for conflict of interest). In June 2018 Judge Beatriz Larrieu convicted Alfredo Silva to 2 years’ imprisonment, disqualification and a fine (~$2,143,420); the case included fraud and influence-peddling convictions. This is the latest status in the press reviewed as of July 2026.',
      caveat: 'The cross-reference shows the two Buena Estrella cooperative contracts recorded in the open data (2010–2011); coverage of that period is partial.',
    },
  },
  {
    slug: 'bella-union-siemm-ambulancias',
    emoji: '🚑',
    period: '2012–2016',
    status: 'procesamiento',
    amountReported: 'Facturación de traslados 2012–2016 (sin cifra única reportada)',
    query: { supplierIds: ['R/010164030015', 'R010164030015'], buyerIds: ['29-34'] },
    sources: [
      { outlet: 'El Observador', title: 'Justicia procesó a exdirector del Hospital de Bella Unión', url: 'https://www.elobservador.com.uy/nota/justicia-proceso-a-exdirector-del-hospital-de-bella-union-2019328132959', date: '2019-03-28' },
      { outlet: 'Subrayado', title: 'Procesan con prisión al exdirector del Hospital de Bella Unión por contratar sus ambulancias', url: 'https://www.subrayado.com.uy/procesan-prision-al-exdirector-del-hospital-bella-union-contratar-sus-ambulancias-n529934', date: '2019-03-18' },
      { outlet: 'Subrayado', title: 'Fiscal pide procesar al exdirector Marcos García', url: 'https://www.subrayado.com.uy/fiscal-pide-procesar-prision-al-ex-director-del-hospital-bella-union-marcos-garcia-n521480', date: '2018-12-14' },
      { outlet: 'Teledoce', title: 'El caso del Hospital de Bella Unión y la empresa Siemm', url: 'https://www.teledoce.com/telemundo/nacionales/el-caso-de-asse-el-hospital-de-bella-union-y-la-empresa-siemm-nunca-se-trasladaron-pacientes-que-no-existen-y-nunca-hubo-problemas-de-facturacion/', date: '2018-04-12' },
    ],
    es: {
      title: 'Bella Unión: el exdirector que contrató a su propia empresa de ambulancias',
      dek: 'El exdirector del Hospital de Bella Unión fue procesado por contratar para traslados de pacientes a Siemm S.R.L., una empresa de la que era socio.',
      hallazgo: 'La Fiscalía sostuvo que el exdirector del Hospital de Bella Unión (ASSE) contrató servicios de traslado de pacientes con Siemm S.R.L., empresa vinculada a él mismo, configurando conjunción del interés personal y del público. Las imputaciones sobre "pacientes inexistentes" fueron negadas por la empresa y no integraron el delito por el que se dictó el procesamiento.',
      statusNote: 'Procesado sin prisión el 18 de marzo de 2019 por la jueza Dolores Sánchez, a pedido del fiscal Luis Pacheco, por conjunción del interés personal y del público (art. 161 CP), bajo el anterior Código del Proceso Penal. La defensa apeló. A julio de 2026 no consta condena firme ni absolución posterior; sus exsocios no fueron procesados.',
      caveat: 'El monto es el total que Siemm S.R.L. facturó al Centro Auxiliar de Bella Unión en los datos abiertos (2013–2026), no solo el tramo del procesamiento (2012–2016). El cruce no prueba que cada contrato sea irregular.',
    },
    en: {
      title: 'Bella Unión: the ex-director who hired his own ambulance company',
      dek: 'The former director of Bella Unión Hospital was prosecuted for contracting patient transport to Siemm S.R.L., a company he was a partner in.',
      hallazgo: 'Prosecutors held that the former director of Bella Unión Hospital (ASSE) contracted patient-transport services with Siemm S.R.L., a company linked to himself — a conflict of interest. Allegations of "non-existent patients" were denied by the company and were not part of the offence prosecuted.',
      statusNote: 'Prosecuted without prison on 18 March 2019 by Judge Dolores Sánchez, at prosecutor Luis Pacheco’s request, for conflict of interest (art. 161 Penal Code) under the former criminal-procedure code. The defence appealed. As of July 2026 there is no final conviction or later acquittal on record; his former partners were not prosecuted.',
      caveat: 'The amount is everything Siemm S.R.L. billed the Bella Unión auxiliary centre in the open data (2013–2026), not only the prosecuted period (2012–2016). The cross-reference is not proof that each contract is irregular.',
    },
  },
  {
    slug: 'asse-same-105-ithg',
    emoji: '🚑',
    period: '2022–2024',
    status: 'investigacion',
    amountReported: '≈US$ 50 millones en traslados 2022–2024; el Tribunal de Cuentas observó ~$1.985 millones pagados a ITHG',
    query: { supplierIds: ['R/218671240019'] },
    sources: [
      { outlet: 'El Observador', title: 'ASSE resolvió denunciar penalmente al expresidente Cipriani y su directorio por compras a ITHG', url: 'https://www.elobservador.com.uy/nacional/asse-resolvio-denunciar-penalmente-al-expresidente-leonardo-cipriani-y-su-directorio-compras-ithg-e-irregularidades-casmu-y-el-circulo-catolico-n6041806', date: '2026-04-24' },
      { outlet: 'El Observador', title: 'Se pagaron US$ 800 mil a ITHG por un año para tener disponible una ambulancia', url: 'https://www.elobservador.com.uy/nacional/investigacion-asse-se-pagaron-us-800-mil-ithg-un-ano-tener-disponible-una-ambulancia-que-hizo-un-traslado-cada-dos-dias-el-mides-n6041939', date: '2026-04-25' },
      { outlet: 'Búsqueda', title: 'Tribunal de Cuentas observó el convenio marco de ASSE por ambulancias y lo envió a Defensa de la Competencia', url: 'https://www.busqueda.com.uy/informacion/tribunal-cuentas-observo-convenio-marco-asse-ambulancias-y-lo-envio-defensa-la-competencia-n5394027', date: '2024-10-10' },
      { outlet: 'UyPress', title: 'ASSE pidió a Fiscalía investigar hechos con apariencia delictiva de la administración de Cipriani', url: 'https://www.uypress.net/Actualidad/ASSE-pidio-a-Fiscalia-investigar-hechos-con-apariencia-delictiva-de-la-administracion-de-Cipriani-uc153405', date: '2026-05-24' },
    ],
    es: {
      title: 'ASSE–SAME 105: los traslados a ITHG que ASSE denunció penalmente',
      dek: 'ASSE denunció ante la Fiscalía a la gestión de Leonardo Cipriani por unos US$50 millones en traslados de pacientes del SAME 105 adjudicados a ITHG/UTAM; el Tribunal de Cuentas ya había observado el convenio.',
      hallazgo: 'El nuevo directorio de ASSE denunció que la administración anterior contrató traslados del SAME 105 con ITHG/UTAM con presuntas irregularidades (entre ellas pagar unos US$800 mil por un año por una ambulancia que hacía un traslado cada dos días). El Tribunal de Cuentas observó el convenio marco y lo remitió a Defensa de la Competencia por indicios de prácticas anticompetitivas.',
      statusNote: 'El directorio de ASSE resolvió (23–24 de abril de 2026) denunciar penalmente a Leonardo Cipriani, Eduardo Henderson y varios exdirectores; la denuncia se presentó ante la Fiscalía en mayo de 2026 (Fiscalía de Delitos Económicos, fiscal Gilberto Rodríguez) por presuntos fraude, conjunción de intereses y abuso de funciones. El Tribunal de Cuentas observó las compras (resolución del 2/10/2024). A julio de 2026 nadie ha sido imputado, formalizado ni condenado.',
      caveat: 'El cruce muestra los contratos de ITHG Proveedores Marítimos / UTAM registrados como adjudicaciones en los datos abiertos; el total reportado por ASSE (~US$50 M) incluye convenios y pagos que pueden no figurar todos como adjudicaciones separadas.',
    },
    en: {
      title: 'ASSE–SAME 105: the ITHG transport deals ASSE reported to prosecutors',
      dek: 'ASSE filed a criminal complaint against Leonardo Cipriani’s administration over roughly US$50 million in SAME 105 patient transfers awarded to ITHG/UTAM; the audit court had already flagged the deal.',
      hallazgo: 'ASSE’s new board alleged the previous administration contracted SAME 105 transfers with ITHG/UTAM under suspected irregularities (including paying ~US$800k for a year for an ambulance that made one transfer every two days). The audit court flagged the framework agreement and referred it to the competition authority over signs of anti-competitive practices.',
      statusNote: 'ASSE’s board resolved (23–24 April 2026) to file a criminal complaint against Leonardo Cipriani, Eduardo Henderson and several former directors; it was filed with prosecutors in May 2026 (Economic Crimes Unit, prosecutor Gilberto Rodríguez) for alleged fraud, conflict of interest and abuse of office. The audit court flagged the purchases (ruling of 2 Oct 2024). As of July 2026 no one has been charged, indicted or convicted.',
      caveat: 'The cross-reference shows ITHG Proveedores Marítimos / UTAM contracts recorded as awards in the open data; the total reported by ASSE (~US$50M) includes agreements and payments that may not all appear as separate awards.',
    },
  },
  {
    slug: 'artigas-obras-empresas-vinculadas',
    emoji: '🏗️',
    period: '2017–2020',
    status: 'investigacion',
    amountReported: '$146.196.756 (≈US$ 3,8 millones) en obras adjudicadas',
    query: { buyerIds: ['80-1'], supplierIds: ['R/010175850019', 'R/010161290016', 'R010161290016'] },
    sources: [
      { outlet: 'El Observador', title: 'JUTEP señaló que la Intendencia de Artigas contrató a tres empresas vinculadas a funcionarios', url: 'https://www.elobservador.com.uy/nota/jutep-senalo-que-intendencia-de-artigas-contrato-a-tres-empresas-vinculadas-a-funcionarios-202012321310', date: '2020-02' },
      { outlet: 'Montevideo Portal', title: 'JUTEP divulgó la resolución con irregularidades en la Intendencia de Artigas', url: 'https://www.montevideo.com.uy/Noticias/Jutep-divulgo-la-resolucion-en-la-que-constan-irregularidades-en-la-Intendencia-de-Artigas-uc742426', date: '2020-02' },
      { outlet: 'Radio Montecarlo', title: 'Nuevos elementos en la investigación a Pablo Caram y el exsecretario Rodolfo Caram', url: 'https://www.radiomontecarlo.com.uy/2024/05/22/nacionales/nuevos-elementos-en-la-investigacion-al-intendente-de-artigas-pablo-caram-y-el-exsecretario-general-rodolfo-caram/', date: '2024-05-22' },
      { outlet: 'Montevideo Portal', title: 'Caso Caram: el paso a paso de la denuncia que terminó en condenas y renuncias', url: 'https://www.montevideo.com.uy/Noticias/Caso-Caram-el-paso-a-paso-de-la-denuncia-viral-que-termino-en-condenas-y-renuncias-uc894616', date: '2024-07' },
    ],
    es: {
      title: 'Intendencia de Artigas: obras fraccionadas a empresas ligadas a funcionarios',
      dek: 'La JUTEP halló que la Intendencia de Artigas fraccionó obras en licitaciones abreviadas y las adjudicó a empresas vinculadas a funcionarios (Pedrera del Norte y Prenorte).',
      hallazgo: 'Según la JUTEP (resolución del 24/1/2020), la Intendencia de Artigas fraccionó obras para mantenerlas en el rango de la licitación abreviada y las adjudicó a tres empresas vinculadas a funcionarios municipales, violando los principios de probidad, legalidad y transparencia. La causa penal por el tramo de obras (~US$3,8 M) seguía abierta.',
      statusNote: 'La resolución de la JUTEP (2020) es administrativa/ética, no penal. El caso penal por licitaciones/obras seguía abierto en mayo de 2024, con Pablo Caram y el exsecretario Rodolfo Caram indagados. La condena de julio de 2024 (proceso abreviado, 14 meses con libertad a prueba) fue por «omisión de denunciar delitos como funcionario público» en la causa de horas extras, NO por las adjudicaciones de obras. A julio de 2026 no consta condena penal específica por el fraccionamiento.',
      caveat: 'El monto es el total que Pedrera del Norte y Prenorte facturaron a la Intendencia de Artigas en los datos abiertos (~$119 M, 2014–2024), mucho mayor que el tramo cuestionado (~US$3,8 M). El cruce no prueba que cada contrato sea irregular.',
    },
    en: {
      title: 'Artigas department: works split up and awarded to insider-linked firms',
      dek: 'The anti-corruption board (JUTEP) found Artigas split works into abbreviated tenders and awarded them to firms tied to officials (Pedrera del Norte and Prenorte).',
      hallazgo: 'Per JUTEP’s ruling (24 Jan 2020), Artigas split works to keep them within the abbreviated-tender threshold and awarded them to three firms linked to municipal officials, breaching the principles of probity, legality and transparency. The criminal case over the works line (~US$3.8M) remained open.',
      statusNote: 'JUTEP’s 2020 ruling is administrative/ethical, not criminal. The criminal case over the bids/works was still open as of May 2024, with Pablo Caram and former secretary Rodolfo Caram under investigation. The July 2024 conviction (abbreviated process, 14 months’ probation) was for "failure to report crimes as a public official" in the overtime case — NOT the works awards. As of July 2026 there is no criminal conviction specifically for the fractioning.',
      caveat: 'The amount is everything Pedrera del Norte and Prenorte billed Artigas in the open data (~$119M, 2014–2024), far larger than the questioned line (~US$3.8M). The cross-reference is not proof that each contract is irregular.',
    },
  },
  {
    slug: 'control-migratorio-sigmu',
    emoji: '🛂',
    period: '2018–2025',
    status: 'auditoria',
    amountReported: '~US$ 50 millones (oferta de Veridos); tasa de US$ 2,10 por pasajero para financiarlo',
    query: { buyerIds: ['4-1'], supplierIds: ['R/217689280014', 'X/MEXVME140617PM6', 'R/213117790014'] },
    sources: [
      { outlet: 'la diaria', title: 'El TCA analiza la nulidad de la licitación del sistema de control migratorio ganada por Veridos', url: 'https://ladiaria.com.uy/justicia/articulo/2025/10/tca-analiza-nulidad-de-la-licitacion-del-sistema-de-control-migratorio-ganada-por-la-empresa-mexicana-veridos/', date: '2025-10' },
      { outlet: 'El Observador', title: 'Interior dejó sin efecto controvertida licitación sobre control fronterizo', url: 'https://www.elobservador.com.uy/nota/interior-dejo-sin-efecto-controvertida-licitacion-del-gobierno-anterior-sobre-control-fronterizo-202011818580', date: '2020-11-18' },
      { outlet: 'uypress', title: 'Denuncian irregularidades en licitación millonaria del Ministerio del Interior', url: 'https://www.uypress.net/Actualidad/Denuncian-irregularidades-en-licitacion-millonaria-del-Ministerio-del-Interior-uc101554', date: '2020' },
      { outlet: 'Búsqueda', title: 'El Ministerio del Interior busca otra vez renovar el sistema de control migratorio', url: 'https://www.busqueda.com.uy/Secciones/Tras-procesos-que-terminaron-en-denuncias-el-Ministerio-del-Interior-busca-otra-vez-renovar-el-sistema-de-control-migratorio-uc49152', date: '2021-09-01' },
    ],
    es: {
      title: 'El sistema de control migratorio (SIGMU): la licitación impugnada',
      dek: 'La licitación del sistema de control migratorio del Ministerio del Interior acumuló denuncias de irregularidades, una adjudicación anulada y una posterior a Veridos que hoy litiga en el TCA.',
      hallazgo: 'La renovación del sistema de gestión migratoria del Ministerio del Interior generó denuncias de irregularidades: una primera adjudicación fue dejada sin efecto en 2020 y un nuevo proceso, adjudicado a la mexicana Veridos, fue observado por el Tribunal de Cuentas (garantía depositada fuera de plazo) e impugnado con acciones de nulidad ante el TCA. La tasa de US$2,10 por pasajero para financiarlo también fue recurrida.',
      statusNote: 'A julio de 2026 el caso es administrativo, no penal. El Tribunal de Cuentas observó la adjudicación a Veridos y el Ministerio del Interior reiteró el gasto bajo su responsabilidad. Hay acciones de nulidad ante el TCA (una «en análisis» en octubre de 2025) y un recurso contra el decreto de la tasa. No consta resolución definitiva, condena ni denuncia penal.',
      caveat: 'El monto es el total que IAFIS Uruguay (proveedor histórico del sistema), Veridos y Dafiway facturaron a la Secretaría del Ministerio del Interior en los datos abiertos (~US$ 7 M, 2016–2025); la oferta cuestionada de Veridos (~US$50 M) es un proceso licitatorio en disputa, aún no ejecutado en su totalidad.',
    },
    en: {
      title: 'The border-control system (SIGMU): the disputed tender',
      dek: 'The Interior Ministry’s migration-control tender drew irregularity complaints, an annulled award, and a later award to Veridos now being litigated at the administrative court.',
      hallazgo: 'The renewal of the Interior Ministry’s migration-management system drew irregularity complaints: a first award was scrapped in 2020, and a new process — awarded to Mexico’s Veridos — was flagged by the audit court (bond posted late) and challenged with nullity actions at the administrative court (TCA). The US$2.10-per-passenger fee to fund it was also appealed.',
      statusNote: 'As of July 2026 the case is administrative, not criminal. The audit court flagged the Veridos award and the Interior Ministry reaffirmed the spending on its own responsibility. There are nullity actions at the TCA (one "under analysis" in October 2025) and an appeal against the fee decree. There is no final ruling, conviction or criminal complaint on record.',
      caveat: 'The amount is everything IAFIS Uruguay (the system’s incumbent supplier), Veridos and Dafiway billed the Interior Ministry secretariat in the open data (~US$7M, 2016–2025); Veridos’ questioned bid (~US$50M) is a disputed tender not yet fully executed.',
    },
  },
  {
    slug: 'florida-compras-directas-vinculadas',
    emoji: '🚜',
    period: '2020–2023',
    status: 'denuncia',
    amountReported: '~US$ 70.000 en unas 37 compras directas',
    query: { buyerIds: ['86-1'], supplierIds: ['R/070252600011', 'R070252600011'] },
    sources: [
      { outlet: 'El Observador', title: 'JUTEP denuncia a la Intendencia de Florida por irregularidades en contrataciones', url: 'https://www.elobservador.com.uy/nacional/jutep-denuncia-la-intendencia-florida-irregularidades-contrataciones-y-desarchiva-dos-casos-vinculados-al-frente-amplio-n5954983', date: '2024-08-06' },
      { outlet: 'la diaria', title: 'La JUTEP decidió enviar a la Fiscalía la denuncia por presuntas irregularidades en Florida', url: 'https://ladiaria.com.uy/politica/articulo/2024/8/jutep-decidio-enviar-a-la-fiscalia-la-denuncia-por-presuntas-irregularidades-en-contrataciones-en-la-intendencia-de-florida/', date: '2024-08-07' },
      { outlet: 'Subrayado', title: 'JUTEP elevó a la Justicia penal el caso de presuntas irregularidades en la Intendencia de Florida', url: 'https://www.subrayado.com.uy/jutep-elevo-la-justicia-penal-caso-presuntas-irregularidades-intendencia-florida-n953818', date: '2024-08-07' },
      { outlet: 'Búsqueda', title: 'La Junta Anticorrupción recomienda denunciar a Fiscalía contrataciones de la Intendencia de Florida', url: 'https://www.busqueda.com.uy/informe-juridico-la-junta-anticorrupcion-recomienda-denunciar-fiscalia-contrataciones-la-intendencia-florida-n5392286', date: '2024-07' },
    ],
    es: {
      title: 'Intendencia de Florida: compras directas reiteradas a una empresa vinculada',
      dek: 'La JUTEP denunció ante la Fiscalía a la Intendencia de Florida por compras directas reiteradas a una empresa vinculada a un funcionario.',
      hallazgo: 'La JUTEP sostuvo que la Intendencia de Florida realizó unas 37 compras directas (alquiler de retroexcavadora, recolección de residuos, maquinaria vial) a la firma Rodríguez Castellini y Rodríguez Coito, vinculada a un funcionario, eludiendo procedimientos competitivos por un total cercano a los US$70.000.',
      statusNote: 'El 6 de agosto de 2024 el directorio de la JUTEP votó por unanimidad elevar la denuncia a la Fiscalía, tras un informe jurídico que recomendaba denunciar hechos de apariencia delictiva. A julio de 2026 el caso permanece en etapa de denuncia/indagatoria; nadie ha sido imputado ni condenado.',
      caveat: 'El monto es el total que Rodríguez Castellini y Rodríguez Coito facturó a la Intendencia de Florida en los datos abiertos (~$7,8 M, 2021–2026). El cruce no prueba que cada contrato sea irregular.',
    },
    en: {
      title: 'Florida department: repeated direct purchases from a linked firm',
      dek: 'The anti-corruption board reported Florida to prosecutors over repeated direct purchases from a firm tied to an official.',
      hallazgo: 'JUTEP held that Florida made some 37 direct purchases (excavator rental, waste collection, road machinery) from the firm Rodríguez Castellini y Rodríguez Coito, linked to an official, bypassing competitive procedures for roughly US$70,000 in total.',
      statusNote: 'On 6 August 2024 JUTEP’s board unanimously voted to refer the complaint to prosecutors, after a legal report recommending it. As of July 2026 the case remains at the complaint/inquiry stage; no one has been charged or convicted.',
      caveat: 'The amount is everything Rodríguez Castellini y Rodríguez Coito billed Florida in the open data (~$7.8M, 2021–2026). The cross-reference is not proof that each contract is irregular.',
    },
  },
  {
    slug: 'pandemia-tapabocas-sobreprecio',
    emoji: '😷',
    period: '2020',
    status: 'auditoria',
    amountReported: 'Tapabocas al 3–4× del costo de importación; mascarillas N95 con hasta 86% de sobreprecio',
    query: { search: 'tapabocas', yearFrom: 2020, yearTo: 2021 },
    sources: [
      { outlet: 'la diaria', title: 'Cuidarse de la COVID-19 sale caro: el Estado compra tapabocas al triple de su costo de importación', url: 'https://ladiaria.com.uy/politica/articulo/2020/6/cuidarse-de-la-covid-19-sale-caro-el-estado-compra-tapabocas-al-triple-de-su-costo-de-importacion/', date: '2020-06-17' },
      { outlet: 'Red PALTA', title: 'Compras de pandemia', url: 'https://redpalta.org/compras-pandemia/', date: '2020-06-17' },
      { outlet: 'Ojo Público', title: 'Coronacompras: mascarillas con sobreprecio en América Latina', url: 'https://ojo-publico.com/1928/coronacompras-mascarillas-sobreprecio-america-latina', date: '2020-06-17' },
      { outlet: 'Compras Estatales (ARCE)', title: 'Contratación Directa por Excepción 123/2020 (respiradores)', url: 'https://www.comprasestatales.gub.uy/consultas/detalle/id/833955', date: '2020' },
    ],
    es: {
      title: 'Compras de pandemia: tapabocas y mascarillas con sobreprecio',
      dek: 'Una investigación periodística regional mostró que el Estado uruguayo pagó tapabocas y mascarillas N95 con sobreprecio en compras directas por excepción durante la emergencia sanitaria de 2020.',
      hallazgo: 'Según La Diaria y la Red PALTA (Ojo Público y otros), en 2020 el Estado uruguayo pagó tapabocas al triple o cuádruple de su costo de importación y mascarillas N95 con hasta 86% de sobreprecio, mediante compras directas por excepción amparadas en la emergencia sanitaria (art. 33 lit. D del TOCAF, Decreto 93/2020).',
      statusNote: 'Hallazgo periodístico y de auditoría. El Tribunal de Cuentas revisó compras directas por excepción de la emergencia sanitaria. A julio de 2026 no se conocen imputaciones, formalizaciones ni condenas vinculadas a estos sobreprecios en Uruguay, y los proveedores no fueron individualizados como investigados penalmente. Nota: el caso «tapabocas de oro» con imputaciones corresponde a Paraguay, no a Uruguay.',
      caveat: 'El cruce muestra las adjudicaciones cuyo objeto menciona «tapabocas» en 2020–2021, no necesariamente todas con sobreprecio ni todos los insumos de pandemia; es una muestra temática del gasto de emergencia.',
    },
    en: {
      title: 'Pandemic purchases: overpriced face masks',
      dek: 'A regional press investigation showed Uruguay paid over the odds for face masks and N95 respirators through emergency direct purchases in 2020.',
      hallazgo: 'Per La Diaria and the PALTA Network (Ojo Público and others), in 2020 Uruguay paid three-to-four times import cost for face masks and up to 86% over the odds for N95 respirators, via emergency direct purchases under the health emergency (art. 33 lit. D of TOCAF, Decree 93/2020).',
      statusNote: 'A press and audit finding. The audit court reviewed emergency direct purchases. As of July 2026 there are no charges, indictments or convictions tied to these overprices in Uruguay, and the suppliers were not singled out as criminally investigated. Note: the "golden face masks" case with charges is in Paraguay, not Uruguay.',
      caveat: 'The cross-reference shows awards whose object mentions "tapabocas" in 2020–2021 — not necessarily all overpriced, nor every pandemic input; it is a thematic sample of emergency spending.',
    },
  },
]

export function listCurroDefs(): CurroDef[] {
  return CURROS
}

export function getCurroDef(slug: string): CurroDef | null {
  return CURROS.find(c => c.slug === slug) ?? null
}

/** The bilingual text for a def in one locale, English-fallback for 'en'. */
export function curroText(def: CurroDef, locale: string): CurroText {
  return locale === 'en' ? def.en : def.es
}

/**
 * Turns a def's query into the exact param bag `buildContractFilters` expects.
 * `tag: 'award'` restricts to the money-bearing stage — a curro counts what was
 * awarded, not every llamado/aclaración release of the same OCID.
 */
export function curroToQueryParams(q: CurroQuery): Record<string, unknown> {
  const params: Record<string, unknown> = { tag: 'award' }
  if (q.buyerIds?.length) params.buyerIds = q.buyerIds
  if (q.suppliers?.length) params.suppliers = q.suppliers
  if (q.supplierIds?.length) params.supplierIds = q.supplierIds
  if (q.search) params.search = q.search
  if (q.categoryId?.length) params.categoryId = q.categoryId
  if (q.procurementMethodDetails?.length) params.procurementMethodDetails = q.procurementMethodDetails
  if (q.yearFrom != null) params.yearFrom = q.yearFrom
  if (q.yearTo != null) params.yearTo = q.yearTo
  if (q.amountFrom != null) params.amountFrom = q.amountFrom
  if (q.amountTo != null) params.amountTo = q.amountTo
  return params
}
