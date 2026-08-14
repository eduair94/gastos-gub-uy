/**
 * "Hallazgos propios" — lo que salió de mirar los datos y no estaba en ninguna crónica.
 *
 * POR QUÉ ESTA SECCIÓN EXISTE Y CÓMO NO SE PUEDE ESCRIBIR. La sección reúne hallazgos que
 * cumplen tres condiciones a la vez: salieron de medir este corpus, no tienen cobertura previa
 * en prensa, y ponen en juego una norma concreta. Esa tercera condición es la que obliga a la
 * disciplina: nombrar una norma NO es acusar de violarla.
 *
 * Cada ficha lleva por eso cuatro campos, y ninguno es opcional:
 *   - `measured`: el hecho, con su número y su fecha de medición. Es lo único que afirmamos.
 *   - `norm`: la norma que el hecho pondría en juego SI se confirmara, citada literal.
 *   - `missing`: qué falta para poder afirmarlo. Es el campo que impide que la ficha se lea
 *     como una condena, y el que más se va a querer recortar. No se recorta.
 *   - `answers`: quién tiene que responder. Un hallazgo sin destinatario es un chisme.
 *
 * Lo que NO va acá: nada que ya haya publicado la prensa (el caso ANTEL/Tribunal de Cuentas,
 * por ejemplo, vive en la investigación de competencia porque es antecedente, no hallazgo
 * nuestro), y nada que no se pueda medir de nuevo con un comando.
 */

export interface Finding {
  key: string
  /** Ruta de la investigación donde el hallazgo está desarrollado, si existe. */
  path?: string
  /** Comando que lo vuelve a medir. La ficha sin esto no entra. */
  reproduce: string
}

export const FINDINGS: Finding[] = [
  { key: 'puerta', path: '/investigaciones/competencia-aparente', reproduce: 'npx tsx tests/unit/competencia-aparente.verify.ts' },
  { key: 'unico', path: '/investigaciones/competencia-aparente', reproduce: 'npx tsx tests/unit/competencia-aparente.verify.ts' },
  { key: 'im', path: '/investigaciones/competencia-aparente', reproduce: 'npx tsx src/jobs/refresh-bidder-competition.ts --dry-run' },
  { key: 'unitario', reproduce: 'npx tsx tests/unit/sobreprecio-organismo.verify.ts' },
]

export const HALLAZGOS_SOURCES = [
  {
    key: 'norma',
    items: [
      { label: 'Ley 18.159 — Promoción y Defensa de la Competencia (IMPO)', url: 'https://www.impo.com.uy/bases/leyes/18159-2007' },
      { label: 'Ley 19.833 (2019) — incorpora el artículo 4º BIS (IMPO)', url: 'https://www.impo.com.uy/bases/leyes-originales/19833-2019' },
      { label: 'TOCAF, artículo 33 — procedimientos de contratación (IMPO)', url: 'https://impo.com.uy/bases/tocaf-tcr/150-2012/33' },
      { label: 'Comisión de Promoción y Defensa de la Competencia — MEF', url: 'https://www.gub.uy/ministerio-economia-finanzas/preguntas-frecuentes-competencia' },
    ],
  },
  {
    key: 'donde',
    items: [
      { label: 'Compras Estatales — buscador oficial de compras', url: 'https://www.comprasestatales.gub.uy/consultas/' },
      { label: 'RUPE — Registro Único de Proveedores del Estado', url: 'https://www.comprasestatales.gub.uy/rupe/' },
      { label: 'JUTEP — Junta de Transparencia y Ética Pública', url: 'https://www.gub.uy/junta-transparencia-etica-publica/' },
    ],
  },
]

export type Locale = 'es' | 'en'

export const HALLAZGOS_CONTENT = {
  es: {
    kicker: 'Hallazgos propios',
    title: 'Lo que encontramos nosotros',
    dek: 'Cosas que salieron de medir el registro de compras y que no estaban en ninguna crónica. Cada una dice qué norma pondría en juego, qué falta para poder afirmarlo y quién tiene que responder.',
    fileScope: '4 hallazgos',
    fileSource: 'medidos sobre el corpus, agosto 2026',
    filePeriod: 'sin cobertura previa',
    chips: ['Dato propio', 'Norma en juego', 'Reproducible'],

    reglasTag: 'Cómo se arma esta sección',
    reglasTitle: 'Tres condiciones, y una advertencia',
    reglas: [
      'Para entrar acá, un hallazgo tiene que cumplir tres cosas al mismo tiempo: haber salido de medir este corpus, no tener cobertura previa en la prensa, y poner en juego una norma concreta. Si un hallazgo es bueno pero ya lo contó un diario, va a la investigación que corresponda y no acá.',
      'La advertencia es la parte importante. Nombrar una norma no es acusar a nadie de violarla, y esta página no dice que se haya cometido un delito: dice qué habría que mirar y qué falta para saberlo. Compartir un teléfono no prueba un acuerdo; una compra con una sola oferta puede ser un mercado de un solo proveedor; un precio unitario imposible suele ser un error de carga y no un desvío. Quien tiene los poderes para averiguarlo —la Comisión de Defensa de la Competencia, el Tribunal de Cuentas, la JUTEP, una fiscalía— tiene facultades que nosotros no tenemos.',
      'Por eso cada ficha lleva el campo "qué falta". Es el campo que la vuelve honesta y es el primero que se querría recortar. No se recorta.',
    ],

    colMeasured: 'Qué medimos',
    colNorm: 'Qué norma pondría en juego',
    colMissing: 'Qué falta para poder afirmarlo',
    colAnswers: 'Quién tiene que responder',
    reproduceLabel: 'Se vuelve a medir con',
    readMore: 'Ver la investigación completa',

    items: {
      puerta: {
        title: 'Empresas que compiten entre sí desde la misma puerta',
        measured: 'Ocho pares de empresas se presentaron al mismo llamado compartiendo teléfono o domicilio, en 24 llamados de 2025 y 2026. En tres de esos pares el vínculo lo declara cada empresa en su propio sitio: mismo teléfono y misma oficina, y en un caso el sitio de una dice textualmente que es "una empresa del grupo" de la otra. En 6 de los 24 llamados la compra terminó adjudicada a las dos.',
        norm: 'Establecer, concertar o coordinar las ofertas o la abstención en licitaciones, concursos o subastas.',
        normCite: 'Ley 18.159, artículo 4º BIS, numeral 4 — incorporado por la Ley 19.833 de 2019. Lo investiga la Comisión de Promoción y Defensa de la Competencia, de oficio o por denuncia.',
        missing: 'Todo lo esencial: que compartan una puerta no prueba que hayan coordinado las ofertas. Dos empresas de un mismo grupo pueden presentarse legítimamente al mismo llamado, y presentarse no es acordar. Faltaría comparar las ofertas económicas —que no son públicas— y establecer si hubo acuerdo. Eso lo puede hacer la Comisión de Defensa de la Competencia, que puede pedir documentación; nosotros no.',
        answers: 'El organismo que adjudicó cada uno de los 24 llamados, que es quien puede decir si sabía que dos de sus oferentes atendían el mismo teléfono.',
      },
      unico: {
        title: 'Uno de cada cinco llamados competitivos recibió una sola oferta',
        measured: '852 de las 4.372 compras con oferentes publicados (19,5%) recibieron exactamente una oferta, y todas son procedimientos que existen para que haya competencia: Concurso de Precios 522 de 2.781, Licitación Abreviada 323 de 1.489, Licitación Pública 7 de 102. Es la primera medición de este tipo sobre compras uruguayas.',
        norm: 'No hay una norma que se viole por recibir una sola oferta. Es el primero de los ocho indicadores de riesgo que usan los organismos de control en el mundo, y lo que abre es una pregunta sobre el pliego, no un expediente.',
        normCite: 'TOCAF, artículo 33 — define cuándo corresponde cada procedimiento de contratación.',
        missing: 'Saber por qué. Un llamado con una sola oferta puede reflejar un mercado con un solo proveedor capaz, un pliego escrito demasiado a la medida, un plazo corto, o que nadie se enteró. Cada una de esas explicaciones lleva a una acción distinta y ninguna se deduce del número.',
        answers: 'Cada organismo, sobre sus propios llamados: si volvió a llamar, si revisó el pliego, si preguntó a los proveedores que no se presentaron.',
      },
      im: {
        title: 'Un organismo publica adjudicatarios donde debería publicar ofertas',
        measured: 'En las 65 compras miradas de la Intendencia de Montevideo, la lista de "Proveedores participantes" coincide exactamente con la de adjudicatarios, las 65 veces: nunca aparece alguien que se haya presentado y perdido. Lo verificamos además contra una ficha oficial con tres participantes, donde las tres están adjudicadas —una por ítem— y la página no dice cuántas ofertas se recibieron. Otros organismos sí muestran perdedores: el BPS en 742 de 1.021 compras.',
        norm: 'La publicidad de las compras estatales existe para que se pueda saber quién compitió, no sólo quién ganó. Si el bloque publica adjudicatarios, el dato que la ciudadanía necesita para controlar la competencia no está publicado, aunque la página parezca completa.',
        normCite: 'TOCAF, artículo 33 y el régimen de publicidad del portal de Compras Estatales.',
        missing: 'Saber si es una decisión, una limitación del sistema por el que ese organismo publica, o un error. Los registros de esa intendencia entran al portal por otra vía —sus identificadores empiezan con "i"—, lo que sugiere una integración distinta antes que una omisión deliberada.',
        answers: 'La Intendencia de Montevideo y la Agencia Reguladora de Compras Estatales, que es quien administra el portal donde ese bloque se publica.',
      },
      unitario: {
        title: 'Contratos enteros cargados como "una unidad a un peso"',
        measured: 'El 2,4% de las líneas de adjudicación desde 2023 (28.008 de 1.156.503) tiene un precio unitario de un peso o menos. No están repartidas parejo: en Presidencia de la República son el 64,5% de sus líneas y en UTE el 43,5%, y esas líneas cargan 6.390 millones de pesos. El efecto práctico es que en esas compras el precio unitario deja de ser un precio, y ninguna comparación entre organismos es posible: al medirlas sin filtrar, "limpieza integral de locales" mostraba una brecha de 17 millones de veces entre un organismo y otro.',
        norm: 'Ninguna que se viole por sí sola: no es un desvío de fondos ni una compra irregular, es una forma de cargar el dato. Lo que rompe es el control: el registro publicado deja de permitir la comparación que justifica publicarlo.',
        normCite: 'TOCAF, artículo 33 y el régimen de publicidad del portal de Compras Estatales.',
        missing: 'Saber si el sistema admite otra forma de cargar un contrato de servicio a suma alzada. Puede ser una limitación del formulario y no una decisión del organismo, y en ese caso el pedido no es a quien carga sino a quien diseña el sistema.',
        answers: 'Los organismos donde la práctica es mayoritaria, y la Agencia Reguladora de Compras Estatales, que define el formato del registro.',
      },
    },

    leakTitle: 'Si sabés algo de alguno de estos',
    sourcesTag: 'Dónde chequear',
    sourcesTitle: 'La norma y el registro',
    sourcesP: 'Cada hallazgo se vuelve a medir con el comando que lleva al pie, y cada número enlaza a la investigación donde está desarrollado con sus fichas oficiales.',
    srcNorma: 'La norma y quién la aplica',
    srcDonde: 'Dónde mirar el registro',
  },
  en: {
    kicker: 'Our own findings',
    title: 'What we found ourselves',
    dek: 'Things that came out of measuring the procurement record and were in no news story. Each one states which law it would engage, what is missing before it can be asserted, and who has to answer.',
    fileScope: '4 findings',
    fileSource: 'measured on the corpus, August 2026',
    filePeriod: 'no prior coverage',
    chips: ['Own data', 'Law engaged', 'Reproducible'],

    reglasTag: 'How this section is built',
    reglasTitle: 'Three conditions, and one warning',
    reglas: [
      'To appear here a finding must satisfy three things at once: it came out of measuring this corpus, it has no prior press coverage, and it engages a specific law. If a finding is good but a newspaper already reported it, it goes to the relevant investigation, not here.',
      'The warning is the important part. Naming a law is not accusing anyone of breaking it, and this page does not say a crime was committed: it says what would have to be looked at and what is missing to know. Sharing a phone number does not prove an agreement; a single-offer purchase may be a single-supplier market; an impossible unit price is usually a data-entry error and not a diversion of funds. Those who have the powers to find out — the Competition Commission, the Court of Auditors, the transparency board, a prosecutor — have powers we do not.',
      'That is why every card carries the "what is missing" field. It is the field that keeps it honest and the first one anybody would want to trim. It does not get trimmed.',
    ],

    colMeasured: 'What we measured',
    colNorm: 'Which law it would engage',
    colMissing: 'What is missing before asserting it',
    colAnswers: 'Who has to answer',
    reproduceLabel: 'Re-measure it with',
    readMore: 'Read the full investigation',

    items: {
      puerta: {
        title: 'Firms competing against each other from the same doorway',
        measured: 'Eight pairs of companies bid on the same tender while sharing a phone number or an address, across 24 tenders in 2025 and 2026. In three of those pairs each firm declares the link on its own website: same phone and same office, and in one case one site states verbatim that it is "a company of the group" of the other. In 6 of the 24 tenders the purchase was awarded to both.',
        norm: 'Establecer, concertar o coordinar las ofertas o la abstención en licitaciones, concursos o subastas.',
        normCite: 'Law 18,159, article 4 BIS, item 4 — added by Law 19,833 of 2019. Investigated by the Competition Commission, on its own initiative or on a complaint.',
        missing: 'Everything essential: sharing a doorway does not prove the offers were coordinated. Two firms of one group may legitimately bid on the same tender, and bidding is not colluding. It would take comparing the price offers — which are not public — and establishing whether there was an agreement. The Competition Commission can do that; we cannot.',
        answers: 'The public body that awarded each of the 24 tenders, which can say whether it knew two of its bidders answered the same phone.',
      },
      unico: {
        title: 'One in five competitive tenders drew a single offer',
        measured: '852 of the 4,372 purchases with published bidders (19.5%) received exactly one offer, and all are procedures that exist to produce competition: price competition 522 of 2,781, abbreviated tender 323 of 1,489, public tender 7 of 102. It is the first measurement of its kind on Uruguayan procurement.',
        norm: 'No law is broken by receiving a single offer. It is the first of the eight risk indicators oversight bodies use worldwide, and what it opens is a question about the tender document, not a case file.',
        normCite: 'TOCAF, article 33 — defines which procurement procedure applies when.',
        missing: 'Knowing why. A single-offer tender may reflect a market with one capable supplier, a specification written too closely to one product, a short deadline, or nobody hearing about it. Each explanation leads to a different action and none follows from the number.',
        answers: 'Each public body, about its own tenders: whether it re-tendered, reviewed the specification, or asked the suppliers who did not bid.',
      },
      im: {
        title: 'A public body publishes winners where offers should be',
        measured: 'Across the 65 inspected purchases of Montevideo\'s city government, the "participating suppliers" list matches the awarded-supplier list exactly, all 65 times: nobody who bid and lost ever appears. We checked it against an official record with three participants where all three were awarded — one item each — and the page does not say how many offers were received. Other bodies do show losers: the social security bank in 742 of 1,021 purchases.',
        norm: 'Procurement publicity exists so that it is possible to know who competed, not only who won. If the block publishes winners, the fact citizens need in order to watch competition is not published, even though the page looks complete.',
        normCite: 'TOCAF, article 33, and the publicity regime of the state procurement portal.',
        missing: 'Knowing whether it is a decision, a limitation of the system that body publishes through, or an error. That city government\'s records enter the portal by a different route — its identifiers start with "i" — which suggests a different integration rather than a deliberate omission.',
        answers: 'Montevideo\'s city government and the state procurement agency, which runs the portal where that block is published.',
      },
      unitario: {
        title: 'Whole contracts recorded as "one unit at one peso"',
        measured: '2.4% of award lines since 2023 (28,008 of 1,156,503) carry a unit price of one peso or less. They are not evenly spread: at the Presidency they are 64.5% of its lines and at the state power utility 43.5%, and those lines carry 6,390 million pesos. The practical effect is that in those purchases the unit price stops being a price, and no comparison between bodies is possible: measured without filtering, "integral cleaning of premises" showed a 17-million-fold gap between one body and another.',
        norm: 'None that is broken on its own: it is not a diversion of funds nor an irregular purchase, it is a way of entering the data. What it breaks is oversight: the published record stops allowing the comparison that justifies publishing it.',
        normCite: 'TOCAF, article 33, and the publicity regime of the state procurement portal.',
        missing: 'Knowing whether the system allows another way to record a lump-sum service contract. It may be a limitation of the form rather than a decision by the body, in which case the request goes to whoever designs the system, not to whoever fills it in.',
        answers: 'The bodies where the practice is the majority, and the state procurement agency, which defines the record format.',
      },
    },

    leakTitle: 'If you know something about any of these',
    sourcesTag: 'Where to check',
    sourcesTitle: 'The law and the record',
    sourcesP: 'Every finding is re-measured with the command at its foot, and every figure links to the investigation where it is developed with its official records.',
    srcNorma: 'The law and who applies it',
    srcDonde: 'Where to look at the record',
  },
} as const

export function hallazgosContent(locale: string) {
  return HALLAZGOS_CONTENT[(locale === 'en' ? 'en' : 'es') as Locale]
}
