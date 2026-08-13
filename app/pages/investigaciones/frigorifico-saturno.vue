<script setup lang="ts">
/**
 * Deep-dive · Frigorífico Saturno (Abasto de Carnes Saturno S.A.) — la carne de las FF.AA.
 * 283 contratos por ~$1.140 M con el INDA y las tres fuerzas. En la Armada, un faltante de
 * ~57 toneladas de carne terminó en la Fiscalía de Delitos Económicos. Datos de
 * ~/data/investigaciones-empresas (verificados en releases + prensa citada).
 */
import { SATURNO_ARMADA_LEDGER, SATURNO_BY_BUYER, SATURNO_STATS } from '~/data/investigaciones-empresas'

const localePath = useLocalePath()

const ES = {
  title: 'Frigorífico Saturno: la carne de los cuarteles y las toneladas que no llegaron',
  dek: 'Abasto de Carnes Saturno es uno de los grandes proveedores de carne del Estado: 283 contratos por unos 1.140 millones de pesos con el INDA, el Ejército, la Armada y la Fuerza Aérea. En la Armada, una pericia detectó un faltante de unas 57 toneladas de carne, sobreprecios y cortes no licitados. El caso está en la Fiscalía de Delitos Económicos.',
  chips: ['283 contratos', '$1.140 M', 'Las tres fuerzas', 'Faltante 57 toneladas'],
  kicker: 'Investigación · Empresas señaladas',
  fileSubject: 'Abasto de Carnes Saturno S.A.',
  fileSource: 'Compras Estatales + causa penal · verificado',
  fileOrg: 'INDA · Ejército · Armada · Fuerza Aérea', filePeriod: '2012–2026',
  tContracts: 'contratos en la base', tContractsSub: 'de carne, 2012–2026',
  tTotal: 'facturado al Estado', tTotalSub: '32 organismos compradores',
  tArmada: 'a la Armada', tArmadaSub: `${SATURNO_STATS.armadaFichas} contratos — el foco de la causa`,
  tFaltante: 'de carne sin justificar', tFaltanteSub: '~$8,4 M · licitaciones 28/2021 y 28/2022',
  ctxTag: 'El contexto', ctxTitle: 'El proveedor de carne del Estado',
  ctx1: 'Buscamos a Abasto de Carnes Saturno en la base del sitio y aparece de cuerpo entero: 283 contratos de carne desde 2012, por unos 1.140 millones de pesos. Su mayor comprador es el Instituto Nacional de Alimentación (INDA), seguido por el Ejército, la Armada, la Fuerza Aérea y Sanidad Militar. Es, en los hechos, uno de los proveedores de carne más importantes del aparato estatal.',
  ctx2: 'Esa relación —masiva, recurrente, verificable ficha por ficha— es justamente lo que hace verificable el señalamiento. El caso penal no cuestiona todo ese volumen: se concentra en las compras de la Armada Nacional, de la que Saturno es proveedor de carne desde 2013.',
  chartTag: 'La escala', chartTitle: 'Quién le compra a Saturno',
  chartIntro: 'Gasto por organismo comprador (los de las FF.AA. en alerta). El INDA encabeza, pero las tres fuerzas juntas superan los 480 millones de pesos. La causa penal recae sobre la Armada.',
  caseTag: 'El caso', caseTitle: 'Bondiola que se pedía, lomo que se entregaba',
  case1: 'Según la pericia contable en la causa, entre las licitaciones 28/2021 y 28/2022 de la Armada faltan unos 57.398 kg de carne (~$8,4 millones): 34.936 kg de bondiola no pueden justificarse como recibidos. La maniobra descrita: los oficiales encargaban cortes no licitados —lomo, chorizo, peceto— pese a que la adjudicación era por bondiola, y el frigorífico fijaba por esos cortes precios muy por encima del mercado, descontándolos del saldo de bondiola adjudicada. Se hallaron además 26 remitos con sellos y firmas irregulares.',
  case2: 'En la base, las compras de carne porcina (bondiola) de la Armada a Saturno en 2021 y 2022 están a la vista. No prueban el faltante —eso surge de la pericia interna—, pero anclan la relación contractual sobre la que se investiga: son los renglones de los que, según la Armada, la carne no llegó a destino.',
  ledgerTag: 'La evidencia', ledgerTitle: 'Las compras de la Armada, ficha por ficha',
  ledgerIntro: 'Contratos de Saturno con el Comando General de la Armada, verificados en la base y enlazados a su ficha en el sitio. En rojo, el corte del faltante: la carne porcina (bondiola).',
  colDate: 'Año', colObjeto: 'Objeto', colAmount: 'Monto', ficha: 'Ver contrato',
  statusTag: 'El estado', statusTitle: 'Dónde está la causa',
  status1: 'La Armada presentó la denuncia penal a fines de 2022. La causa está a cargo de la Fiscalía de Delitos Económicos y Complejos (fiscal Sandra Fleitas), con al menos 12 oficiales citados a declarar y una investigación administrativa interna en paralelo.',
  status2: 'La otra campana: la investigación penal se centra en los oficiales de la Armada, no en el frigorífico, que no está imputado formalmente. Lo que está cuestionado son sus precios y sus remitos. Saturno sigue siendo, en la base, un proveedor de carne habitual del Estado.',
  srcTitle: 'Fuentes',
  discTitle: 'Cómo leer esta investigación',
  disc: [
    'Los contratos, montos y compradores salen de la base de Compras Estatales (OCDS) del sitio, verificados y enlazados a su ficha en el sitio. El faltante de 57 toneladas, los sobreprecios y los remitos irregulares provienen de la pericia contable y la denuncia de la Armada, reportadas por la prensa citada —no de la base.',
    'El frigorífico no está imputado. Se lo nombra como proveedor del Estado y como parte cuestionada en una causa pública. Un contrato o un precio alto no es, por sí solo, prueba de delito. Quien quiera aportar su descargo puede hacerlo.',
  ],
}

const EN: typeof ES = {
  title: 'Frigorífico Saturno: the barracks’ meat and the tonnes that never arrived',
  dek: 'Abasto de Carnes Saturno is one of the State\'s major meat suppliers: 283 contracts for about 1,140 million pesos with INDA, the Army, the Navy and the Air Force. In the Navy, an audit found a shortfall of about 57 tonnes of meat, over-prices and un-tendered cuts. The case is with the Economic Crimes Prosecutor.',
  chips: ['283 contracts', '$1,140 M', 'All three forces', '57-tonne shortfall'],
  kicker: 'Investigation · Flagged companies',
  fileSubject: 'Abasto de Carnes Saturno S.A.',
  fileSource: 'State procurement + criminal case · verified',
  fileOrg: 'INDA · Army · Navy · Air Force', filePeriod: '2012–2026',
  tContracts: 'contracts in the data', tContractsSub: 'of meat, 2012–2026',
  tTotal: 'billed to the State', tTotalSub: '32 buying bodies',
  tArmada: 'to the Navy', tArmadaSub: `${SATURNO_STATS.armadaFichas} contracts — the focus of the case`,
  tFaltante: 'of meat unaccounted for', tFaltanteSub: '~$8.4 M · tenders 28/2021 and 28/2022',
  ctxTag: 'The context', ctxTitle: 'The State\'s meat supplier',
  ctx1: 'We looked Abasto de Carnes Saturno up in the site\'s data and it appears in full: 283 meat contracts since 2012, for about 1,140 million pesos. Its biggest buyer is the National Food Institute (INDA), followed by the Army, the Navy, the Air Force and Military Health. It is, in effect, one of the most important meat suppliers to the state apparatus.',
  ctx2: 'That relationship —massive, recurring, verifiable record by record— is exactly what makes the flag checkable. The criminal case does not question all that volume: it centers on the Navy\'s purchases, for which Saturno has been a meat supplier since 2013.',
  chartTag: 'The scale', chartTitle: 'Who buys from Saturno',
  chartIntro: 'Spending by buying body (the armed-forces ones in alert). INDA leads, but the three forces together top 480 million pesos. The criminal case falls on the Navy.',
  caseTag: 'The case', caseTitle: 'Shoulder ordered, sirloin delivered',
  case1: 'Per the forensic audit in the case, between the Navy\'s tenders 28/2021 and 28/2022 about 57,398 kg of meat are missing (~$8.4 million): 34,936 kg of shoulder cannot be justified as received. The described maneuver: officers ordered un-tendered cuts —sirloin, chorizo, eye round— even though the award was for shoulder, and the plant set well-above-market prices for those cuts, deducting them from the pending shoulder balance. 26 delivery notes with irregular stamps and signatures were also found.',
  case2: 'In the data, the Navy\'s pork (shoulder) purchases from Saturno in 2021 and 2022 are in plain sight. They do not prove the shortfall —that comes from the internal audit— but they anchor the contractual relationship under investigation: they are the line items from which, per the Navy, the meat did not reach its destination.',
  ledgerTag: 'The evidence', ledgerTitle: 'The Navy\'s purchases, record by record',
  ledgerIntro: 'Saturno\'s contracts with the Navy Command, verified in the data and linked to their record on the site. In red, the cut of the shortfall: pork (shoulder).',
  colDate: 'Year', colObjeto: 'Item', colAmount: 'Amount', ficha: 'View contract',
  statusTag: 'The status', statusTitle: 'Where the case stands',
  status1: 'The Navy filed the criminal complaint in late 2022. The case is with the Economic & Complex Crimes Prosecutor (Sandra Fleitas), with at least 12 officers summoned to testify and a parallel internal administrative investigation.',
  status2: 'The other side: the criminal probe centers on the Navy officers, not the plant, which is not formally charged. What is questioned are its prices and its delivery notes. Saturno remains, in the data, a regular State meat supplier.',
  srcTitle: 'Sources',
  discTitle: 'How to read this investigation',
  disc: [
    'The contracts, amounts and buyers come from the site\'s State-procurement data (OCDS), verified and linked to their record on the site. The 57-tonne shortfall, the over-prices and the irregular delivery notes come from the forensic audit and the Navy\'s complaint, reported by the cited press —not from the data.',
    'The plant is not charged. It is named as a State supplier and as a questioned party in a public case. A contract or a high price is not, on its own, proof of a crime. Anyone named may add their response.',
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
  path: '/investigaciones/frigorifico-saturno',
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

const buyerBars = computed(() =>
  SATURNO_BY_BUYER.map(b => ({ label: b.buyer, value: b.spend, color: b.force ? 'alerta' : 'gold' })))

const headlineTiles = computed(() => [
  { value: SATURNO_STATS.contracts, label: c.value.tContracts, sub: c.value.tContractsSub },
  { amount: SATURNO_STATS.totalUYU, label: c.value.tTotal, sub: c.value.tTotalSub },
  { amount: SATURNO_STATS.armadaUYU, label: c.value.tArmada, sub: c.value.tArmadaSub },
  { value: '57 t', label: c.value.tFaltante, sub: c.value.tFaltanteSub },
])

const ledgerColumns = computed(() => [
  { key: 'year', label: c.value.colDate, mono: true, nowrap: true },
  { key: 'desc', label: c.value.colObjeto, primary: true, minWidth: '300px' },
  { key: 'amount', label: c.value.colAmount, align: 'end' as const },
  { key: 'ficha', align: 'end' as const },
])

/** The cut the shortfall is about: flagged in place, with the house row flag. */
const isPork = (row: { desc: string }) => row.desc.toLowerCase().includes('porcina')

const SOURCES = [
  { label: 'El Observador — Almirantes encargaban lomo a un frigorífico que había ganado la licitación por bondiola', url: 'https://www.elobservador.com.uy/nacional/almirantes-encargaban-lomo-un-frigorifico-que-habia-ganado-licitacion-bondiola-n6014952' },
  { label: 'El Observador — Doce oficiales de la Armada citados por la desaparición de 35 toneladas de carne', url: 'https://www.elobservador.com.uy/nacional/doce-oficiales-la-armada-citados-la-fiscal-sandra-fleitas-caso-la-desaparicion-35-toneladas-carne-n6008254' },
  { label: 'El Observador — La Armada denunció a Fiscalía maniobras irregulares en compras de carne, frutas y verduras', url: 'https://www.elobservador.com.uy/nacional/la-armada-denuncio-fiscalia-maniobras-irregulares-sus-compras-carne-frutas-y-verduras-n5988016' },
  { label: 'Montevideo Portal — Se detectaron sobreprecios y más toneladas desaparecidas', url: 'https://www.montevideo.com.uy/Noticias/Compras-de-carne-en-Armada-se-detectaron-sobreprecios-y-mas-toneladas-desaparecidas--uc935220' },
  { label: 'Caras y Caretas — La maniobra millonaria: en la Armada compraban carne que nunca llegaba a destino', url: 'https://www.carasycaretas.com.uy/sociedad/maniobra-millonaria-la-armada-compraban-carne-que-nunca-llegaba-destino-n82364' },
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

    <!-- Chart por comprador -->
    <InvSection
      alt
      :eyebrow="c.chartTag"
      :title="c.chartTitle"
      :dek="c.chartIntro"
    >
      <ChartBlock framed>
        <InvHBars
          :items="buyerBars"
          format="moneyM"
          :row-height="42"
        />
      </ChartBlock>
    </InvSection>

    <!-- El caso -->
    <InvSection
      :eyebrow="c.caseTag"
      :title="c.caseTitle"
    >
      <div class="inv-prose">
        <p>{{ c.case1 }}</p>
        <p>{{ c.case2 }}</p>
      </div>
    </InvSection>

    <!-- Ledger Armada -->
    <InvSection
      alt
      :eyebrow="c.ledgerTag"
      :title="c.ledgerTitle"
      :dek="c.ledgerIntro"
    >
      <InvLedger
        :columns="ledgerColumns"
        :rows="SATURNO_ARMADA_LEDGER"
        row-key="ocid"
        :row-class="(row) => ({ rowflag: isPork(row) })"
        :min-width="560"
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
        path="/investigaciones/frigorifico-saturno"
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
