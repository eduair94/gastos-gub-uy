<script setup lang="ts">
/**
 * Deep-dive · ITHG + Solidar — las ambulancias de ASSE y la invisibilidad del gasto directo.
 * El hallazgo: la base registra 5 fichas por ~$33 M, pero la auditoría de ASSE y el Tribunal
 * de Cuentas documentan más de $2.000 M pagados por compra directa. Datos de
 * ~/data/investigaciones-empresas (verificados en releases + prensa citada).
 */
import { ITHG_LEDGER, ITHG_STATS } from '~/data/investigaciones-empresas'

const localePath = useLocalePath()

const ES = {
  title: 'ITHG: cinco fichas en la base, veinte millones de dólares en la realidad',
  dek: 'Una sociedad creada en 2020 como «proveedora marítima» pasó a concentrar el 96% de los traslados en ambulancia de ASSE, todo por compra directa. La base de Compras Estatales registra apenas cinco contratos por unos 33 millones de pesos. La auditoría de ASSE y el Tribunal de Cuentas documentan más de dos mil millones. La diferencia es la parte del gasto que la transparencia no ve.',
  chips: ['5 fichas visibles', '96,47% de los traslados', 'US$ 800 mil por 1 ambulancia', 'Denuncia penal 2026'],
  kicker: 'Investigación · Empresas señaladas',
  fileSubject: 'ITHG Proveedores Marítimos',
  fileSource: 'Compras Estatales + auditoría ASSE · verificado',
  fileOrg: 'ASSE · SAME 105', filePeriod: '2020–2026',
  tVisible: 'lo que muestra la base', tVisibleSub: '5 fichas · compras directas',
  tConc: 'del gasto en traslados', tConcSub: 'concentrado en una sola empresa',
  tDoc: 'documentado por auditoría', tDocSub: '~US$ 20 M en 3 años · +$2.000 M observados',
  tAmb: 'por una sola ambulancia', tAmbSub: '2024 · hacía «un traslado cada dos días»',
  ctxTag: 'El contexto', ctxTitle: 'De proveedora marítima a dueña de las ambulancias',
  ctx1: 'ITHG se constituyó en enero de 2020 con un objeto social de «provisión marítima». Sin experiencia previa en salud ni habilitación del Ministerio de Salud Pública, y recién ampliando su objeto en 2022, pasó a concentrar el 96,47% del gasto del servicio de emergencias y traslados SAME 105 de ASSE, todo mediante compras directas sin licitación ni comparación de precios.',
  ctx2: 'La auditoría interna de ASSE detectó precios por encima del mercado, pagos por traslados cancelados y desvíos de hasta 700% sobre la pauta. El caso más citado: unos US$ 800 mil pagados en 2024 por tener a disposición una ambulancia que, según la investigación, hacía «un traslado cada dos días». Se hallaron además domicilios inconsistentes: una frutería en Ciudad Vieja, una distribuidora de calzado en Cerrito de la Victoria.',
  gapTag: 'El hallazgo', gapTitle: 'Lo que la base ve vs. lo que se gastó',
  gapIntro: 'Este es el corazón de la investigación. Buscamos a ITHG en la base de Compras Estatales del sitio: figura con cinco fichas por unos 33 millones de pesos. Pero la propia auditoría de ASSE habla de ~US$ 20 millones en tres años, y el Tribunal de Cuentas observó el 100% del gasto en traslados del período —más de 2.000 millones de pesos—. El grueso se pagó por compra directa y casi no dejó rastro abierto.',
  gapVisible: 'En la base (5 fichas)', gapDocumentado: 'Auditoría ASSE (2021–23)', gapObservado: 'Observado por el TCR',
  gapFinding: 'La base registra menos del 2% de lo que la auditoría documenta. No es un error de los datos: es la naturaleza de la compra directa de emergencia, que puede resolverse por fuera del circuito que deja ficha pública. Donde más plata se movió, la transparencia es más fina.',
  ledgerTag: 'La evidencia', ledgerTitle: 'Las cinco fichas que sí quedaron registradas',
  ledgerIntro: 'Los cinco contratos de ITHG que figuran en Compras Estatales, verificados en la base y enlazados a su ficha en el sitio. Es lo poco que el dato abierto muestra de una relación mucho más grande.',
  colDate: 'Año', colBuyer: 'Comprador', colObjeto: 'Objeto', colAmount: 'Monto', ficha: 'Ver contrato',
  solTag: 'El espejo', solTitle: 'Solidar (JD&A): la «competidora» del mismo domicilio',
  sol1: 'En las licitaciones de ambulancias de ASSE apareció una segunda empresa, Solidar (razón social JD&A S.A.S.), presentada como competidora independiente. El Tribunal de Cuentas observó el convenio marco por «indicios de prácticas prohibidas» contra la libre competencia: Solidar comparte con ITHG el domicilio, los equipos y contratos entre sí, y ofertaba en términos idénticos. En el Parlamento, los propios funcionarios del SAME 105 no supieron explicar a cuál de las dos empresas estaban vinculados.',
  sol2: `En la base, Solidar/JD&A figura con ${ITHG_STATS.solidarFichas} contratos. El convenio marco quedó suspendido y no entró en vigor; Solidar operó sobre todo como subcontratista de ITHG.`,
  statusTag: 'El estado', statusTitle: 'Dónde está la causa',
  status1: 'El 100% de las contrataciones fue observado por el Tribunal de Cuentas por incumplir el TOCAF, y el convenio marco de ambulancias fue remitido a la Comisión de Promoción y Defensa de la Competencia. En abril de 2026, el actual directorio de ASSE presentó una denuncia penal ante la Fiscalía contra el ex presidente Leonardo Cipriani y su directorio.',
  status2: 'La otra campana: la empresa no está imputada formalmente. La causa penal apunta a los ex jerarcas de ASSE que resolvieron las compras directas. El señalamiento a ITHG es de contratación —concentración, precios, método— y de las inconsistencias que la auditoría describe, no una condena.',
  srcTitle: 'Fuentes',
  discTitle: 'Cómo leer esta investigación',
  disc: [
    'Los cinco contratos y sus montos salen de la base de Compras Estatales (OCDS) del sitio, verificados uno por uno y enlazados a su ficha en el sitio. Las cifras mayores —los ~US$ 20 M, los +$2.000 M observados, el 96,47%, la ambulancia de US$ 800 mil— provienen de la auditoría de ASSE, del Tribunal de Cuentas y de la prensa citada, no de la base.',
    'ITHG no está imputada. Se la nombra como proveedora del Estado y como objeto de una auditoría y una denuncia públicas. Un contrato observado o una compra directa no es, por sí solo, prueba de delito. Quien quiera aportar su descargo puede hacerlo.',
  ],
}

const EN: typeof ES = {
  title: 'ITHG: five records in the data, twenty million dollars in reality',
  dek: 'A firm created in 2020 as a "maritime supplier" came to concentrate 96% of ASSE\'s ambulance transfers, all by direct purchase. The State-procurement data shows just five contracts for about 33 million pesos. The ASSE audit and the Tribunal de Cuentas document over two billion. The gap is the part of spending that transparency does not see.',
  chips: ['5 visible records', '96.47% of transfers', 'US$800k for 1 ambulance', 'Criminal complaint 2026'],
  kicker: 'Investigation · Flagged companies',
  fileSubject: 'ITHG Proveedores Marítimos',
  fileSource: 'State procurement + ASSE audit · verified',
  fileOrg: 'ASSE · SAME 105', filePeriod: '2020–2026',
  tVisible: 'what the data shows', tVisibleSub: '5 records · direct purchases',
  tConc: 'of transfer spending', tConcSub: 'concentrated in a single firm',
  tDoc: 'documented by audit', tDocSub: '~US$20 M in 3 years · +$2,000 M observed',
  tAmb: 'for a single ambulance', tAmbSub: '2024 · did "one trip every two days"',
  ctxTag: 'The context', ctxTitle: 'From maritime supplier to owner of the ambulances',
  ctx1: 'ITHG was incorporated in January 2020 with a "maritime provision" purpose. With no prior health experience and no Health Ministry authorization, and only widening its purpose in 2022, it came to concentrate 96.47% of ASSE\'s SAME 105 emergency-and-transfer spending, all via direct purchases without tender or price comparison.',
  ctx2: 'ASSE\'s internal audit found above-market prices, payments for cancelled trips and deviations of up to 700% over the guideline. The most-cited case: about US$800k paid in 2024 to keep on standby an ambulance that, per the investigation, did "one trip every two days". Inconsistent addresses also turned up: a greengrocer in Ciudad Vieja, a shoe distributor in Cerrito de la Victoria.',
  gapTag: 'The finding', gapTitle: 'What the data sees vs. what was spent',
  gapIntro: 'This is the heart of the investigation. We looked ITHG up in the site\'s State-procurement data: it appears with five records for about 33 million pesos. But ASSE\'s own audit speaks of ~US$20 million in three years, and the Tribunal de Cuentas observed 100% of the period\'s transfer spending —over 2,000 million pesos. The bulk was paid by direct purchase and left almost no open trace.',
  gapVisible: 'In the data (5 records)', gapDocumentado: 'ASSE audit (2021–23)', gapObservado: 'Observed by the TCR',
  gapFinding: 'The data records less than 2% of what the audit documents. It is not a data error: it is the nature of emergency direct-purchase, which can be settled outside the circuit that leaves a public record. Where the most money moved, transparency is thinnest.',
  ledgerTag: 'The evidence', ledgerTitle: 'The five records that were logged',
  ledgerIntro: 'ITHG\'s five contracts that appear in State procurement, verified in the data and linked to their record on the site. It is the little the open data shows of a far larger relationship.',
  colDate: 'Year', colBuyer: 'Buyer', colObjeto: 'Item', colAmount: 'Amount', ficha: 'View contract',
  solTag: 'The mirror', solTitle: 'Solidar (JD&A): the "competitor" at the same address',
  sol1: 'A second firm, Solidar (registered as JD&A S.A.S.), showed up in ASSE\'s ambulance tenders as an independent competitor. The Tribunal de Cuentas observed the framework for "signs of prohibited practices" against competition: Solidar shares ITHG\'s address, equipment and mutual contracts, and bid in identical terms. In Parliament, SAME 105 officials could not explain which of the two firms they were linked to.',
  sol2: `In the data, Solidar/JD&A appears with ${ITHG_STATS.solidarFichas} contracts. The framework was suspended and never took effect; Solidar operated mainly as ITHG\'s subcontractor.`,
  statusTag: 'The status', statusTitle: 'Where the case stands',
  status1: '100% of the contracting was observed by the Tribunal de Cuentas for breaching the TOCAF, and the ambulance framework was referred to the antitrust body. In April 2026, ASSE\'s current board filed a criminal complaint against former president Leonardo Cipriani and his board.',
  status2: 'The other side: the firm is not formally charged. The criminal case targets the former ASSE officials who resolved the direct purchases. The flag on ITHG is about contracting —concentration, prices, method— and the inconsistencies the audit describes, not a conviction.',
  srcTitle: 'Sources',
  discTitle: 'How to read this investigation',
  disc: [
    'The five contracts and their amounts come from the site\'s State-procurement data (OCDS), verified one by one and linked to their record on the site. The larger figures —the ~US$20 M, the +$2,000 M observed, the 96.47%, the US$800k ambulance— come from ASSE\'s audit, the Tribunal de Cuentas and the cited press, not from the data.',
    'ITHG is not charged. It is named as a State supplier and as the subject of a public audit and complaint. An observed contract or a direct purchase is not, on its own, proof of a crime. Anyone named may add their response.',
  ],
}

const { locale, t } = useI18n()
const c = computed(() => (locale.value === 'en' ? EN : ES))

const personLd = usePersonLd()
const orgLd = useOrgLd()

// NOT a top-level `const breadcrumbLd = useBreadcrumbLd([...])`: that would
// read `c.value.title` eagerly, at module-init time — before `ES`/`EN` below
// are declared ("Cannot access 'ES' before initialization"). Building the
// plain object inline here (no composable call) is safe both for that and
// for the usual reason useOrgLd()/usePersonLd() must never be called inside
// this lazy getter — it does no Nuxt-instance-dependent work at all.
function breadcrumbLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Investigaciones', 'item': `${siteUrl}/investigaciones` },
      { '@type': 'ListItem', 'position': 2, 'name': c.value.title },
    ],
  }
}
const siteUrl = useRuntimeConfig().public.siteUrl as string

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/asse-ambulancias',
  type: 'article',
  kicker: 'Investigación',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': c.value.title,
      'description': c.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
    },
    breadcrumbLd(),
  ],
}))

const gapBars = computed(() => [
  { label: c.value.gapVisible, value: ITHG_STATS.visibleUYU, color: 'celeste' },
  { label: c.value.gapDocumentado, value: ITHG_STATS.documentadoUYUmin, color: 'gold' },
  { label: c.value.gapObservado, value: ITHG_STATS.observadoUYU, color: 'alerta' },
])

const headlineTiles = computed(() => [
  { amount: ITHG_STATS.visibleUYU, label: c.value.tVisible, sub: c.value.tVisibleSub },
  { value: `${ITHG_STATS.concentracionPct}%`, label: c.value.tConc, sub: c.value.tConcSub },
  { value: `US$ ${ITHG_STATS.usdTres} M`, label: c.value.tDoc, sub: c.value.tDocSub },
  { value: 'US$ 800 k', label: c.value.tAmb, sub: c.value.tAmbSub },
])

const ledgerColumns = computed(() => [
  { key: 'year', label: c.value.colDate, mono: true, nowrap: true },
  { key: 'buyer', label: c.value.colBuyer, muted: true, minWidth: '200px' },
  { key: 'desc', label: c.value.colObjeto, primary: true, minWidth: '240px' },
  { key: 'amount', label: c.value.colAmount, align: 'end' as const },
  { key: 'ficha', align: 'end' as const },
])

const SOURCES = [
  { label: 'la diaria — ASSE pagó US$ 20 millones a ITHG por traslados en tres años (compras directas, observadas por el TCR)', url: 'https://ladiaria.com.uy/salud/articulo/2023/5/asse-pago-20-millones-de-dolares-a-la-empresa-maritima-ithg-por-traslados-en-tres-anos-fueron-todas-compras-directas-y-observadas-por-el-tribunal-de-cuentas/' },
  { label: 'El Observador — Se pagaron US$ 800 mil por una ambulancia que hizo un traslado cada dos días', url: 'https://www.elobservador.com.uy/nacional/investigacion-asse-se-pagaron-us-800-mil-ithg-un-ano-tener-disponible-una-ambulancia-que-hizo-un-traslado-cada-dos-dias-el-mides-n6041939' },
  { label: 'El Observador — Auditoría detectó precios por encima del mercado y desvíos de 700%', url: 'https://www.elobservador.com.uy/nacional/auditoria-asse-contrataciones-ithg-detecto-precios-encima-del-mercado-pagos-traslados-cancelados-y-desvios-700-la-pauta-n6026659' },
  { label: 'Búsqueda — El Tribunal de Cuentas observó el convenio marco de ambulancias y lo envió a Defensa de la Competencia', url: 'https://www.busqueda.com.uy/informacion/tribunal-cuentas-observo-convenio-marco-asse-ambulancias-y-lo-envio-defensa-la-competencia-n5394027' },
  { label: 'La Red 21 — Denuncia penal de ASSE contra la ex gestión Cipriani', url: 'https://www.lr21.com.uy/politica/1495087-denuncia-penal-de-asse-contra-exgestion-cipriani-tres-presuntas-irregularidades-que-investiga-fiscalia' },
  { label: 'M24 — Solidar, la empresa con el domicilio de ITHG', url: 'https://m24.com.uy/solidar-empresa-creada-en-2020-que-presta-traslados-en-ambulancias-para-asse-y-que-tiene-la-direccion-de-ithg-tambien-proveedora-del-organismo' },
]
</script>

<template>
  <div class="inv">
    <InvCover
      :fields="[
        { label: t('inv.file.expediente'), value: c.fileSubject },
        { value: c.fileOrg },
        { label: t('inv.file.periodo'), value: c.filePeriod },
        { value: c.fileSource },
      ]"
      :kicker="c.kicker"
      :title="c.title"
      :dek="c.dek"
      :chips="c.chips"
    />

    <InvSection alt>
      <InvTiles :items="headlineTiles" />
    </InvSection>

    <!-- Contexto -->
    <InvSection
      :eyebrow="c.ctxTag"
      :title="c.ctxTitle"
    >
      <div class="inv-prose">
        <p>{{ c.ctx1 }}</p>
        <p>{{ c.ctx2 }}</p>
      </div>
    </InvSection>

    <!-- El hallazgo: gap -->
    <InvSection
      alt
      :eyebrow="c.gapTag"
      :title="c.gapTitle"
      :dek="c.gapIntro"
    >
      <ChartBlock framed>
        <InvHBars
          :items="gapBars"
          format="moneyM"
          :row-height="52"
        />
      </ChartBlock>
      <InvFinding
        spaced
        :kicker="c.gapTag"
        :body="c.gapFinding"
      />
    </InvSection>

    <!-- Ledger -->
    <InvSection
      :eyebrow="c.ledgerTag"
      :title="c.ledgerTitle"
      :dek="c.ledgerIntro"
    >
      <InvLedger
        :columns="ledgerColumns"
        :rows="ITHG_LEDGER"
        row-key="ocid"
      >
        <template #cell:amount="{ row }">
          <MoneyAmount
            :amount="row.amount"
            compact
          />
        </template>
        <template #cell:ficha="{ row }">
          <NuxtLink :to="localePath(`/contracts/adjudicacion-${row.idc}`)">
            {{ c.ficha }} →
          </NuxtLink>
        </template>
      </InvLedger>
    </InvSection>

    <!-- Solidar -->
    <InvSection
      alt
      :eyebrow="c.solTag"
      :title="c.solTitle"
    >
      <div class="inv-prose">
        <p>{{ c.sol1 }}</p>
        <p>{{ c.sol2 }}</p>
      </div>
    </InvSection>

    <!-- Estado -->
    <InvSection
      :eyebrow="c.statusTag"
      :title="c.statusTitle"
    >
      <div class="inv-prose">
        <p>{{ c.status1 }}</p>
        <p>{{ c.status2 }}</p>
      </div>
    </InvSection>

    <!-- Fuentes -->
    <InvSection
      alt
      :eyebrow="c.srcTitle"
      :title="t('inv.verifiedSources')"
    >
      <InvSources :items="SOURCES" />
    </InvSection>

    <!-- Uruguay Leaks: lo que no está en los datos abiertos se manda a quien puede protegerlo. -->
    <InvSection>
      <LeakTip
        :subject="c.title"
        path="/investigaciones/asse-ambulancias"
      />
    </InvSection>

    <InvSection>
      <InvDisclaimer
        :title="c.discTitle"
        :paragraphs="c.disc"
      />
    </InvSection>
  </div>
</template>
