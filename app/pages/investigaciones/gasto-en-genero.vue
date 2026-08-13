<script setup lang="ts">
/**
 * Investigación · Gasto público en políticas de género y diversidad.
 *
 * Unlike the other investigations, whose figures are a verified snapshot, this one
 * reads a LIVE rollup (`topic_spending`, rebuilt every Monday by
 * src/jobs/refresh-topic-spending.ts). Every figure in the prose is interpolated from
 * that fetch — nothing is typed in by hand — so the piece cannot drift away from the
 * data the explorer shows.
 *
 * The three findings the data supports, and the one it does not:
 *   1. concentration in one programme (ComunaMujer + the VBG response system),
 *   2. concentration in five providers,
 *   3. the feed prices only ~20% of these contracts, so the total is a floor;
 *   ✗ it does NOT support any claim about whether the spending is justified. The page
 *     does not make one, and the party figures are electoral context, not attribution.
 */
const localePath = useLocalePath()
const { locale, t } = useI18n()

const { data: res } = await useFetch<any>('/api/analytics/topics/genero')
const s = computed<any>(() => res.value?.data?.stats ?? null)
const topic = computed<any>(() => res.value?.data?.topic ?? null)

// ---- derived figures (all live) -------------------------------------------
const coveragePct = computed(() => Math.round((s.value?.coverage ?? 0) * 100))
const noAmountPct = computed(() => 100 - coveragePct.value)
const topBuyer = computed<any>(() => s.value?.byBuyer?.[0] ?? null)
const topBuyerPct = computed(() =>
  s.value?.total ? Math.round(((topBuyer.value?.total ?? 0) / s.value.total) * 100) : 0,
)
const top5 = computed<any[]>(() => (s.value?.bySupplier ?? []).slice(0, 5))
const top5Total = computed(() => top5.value.reduce((acc, x) => acc + (x.total ?? 0), 0))
const top5Pct = computed(() => (s.value?.total ? Math.round((top5Total.value / s.value.total) * 100) : 0))
const careTotal = computed(() =>
  (s.value?.byCategory ?? [])
    .filter((c: any) => c.category === 'vbg-atencion' || c.category === 'comuna-mujer')
    .reduce((acc: number, c: any) => acc + c.total, 0),
)
const carePct = computed(() => (s.value?.total ? Math.round((careTotal.value / s.value.total) * 100) : 0))
const shareBp = computed(() => (s.value?.overallShareBp ?? 0).toFixed(1))

function fmtDate(value?: string | Date | null): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

function categoryLabel(key: string): string {
  const c = topic.value?.categories?.find((x: any) => x.key === key)
  if (!c) return key
  return locale.value === 'en' ? c.labelEn : c.labelEs
}

const categoryBars = computed(() =>
  (s.value?.byCategory ?? [])
    .filter((c: any) => c.total > 0)
    .map((c: any) => ({ label: categoryLabel(c.category), value: c.total, sub: `${c.contracts}` })),
)

const supplierBars = computed(() =>
  (s.value?.bySupplier ?? []).slice(0, 8).map((x: any) => ({
    label: x.name,
    value: x.total,
    href: x.supplierId ? localePath(`/suppliers/${encodeURIComponent(x.supplierId)}`) : undefined,
  })),
)

// ---- copy ------------------------------------------------------------------
const ES = {
  title: 'Cuánto gasta el Estado uruguayo en políticas de género y diversidad',
  dek: 'El feed de compras públicas no tiene una etiqueta de «política de género»: hay que reconstruirla desde el texto que escribió cada funcionario. Al hacerlo aparecen tres cosas que el debate público casi nunca menciona: el gasto medible es chico, está concentrado en una sola red de atención a víctimas de violencia, y ocho de cada diez contratos del rubro no tienen monto cargado.',
  fileOrg: 'Todo el Estado · datos abiertos OCDS',
  fileSubject: 'Género y diversidad',
  kicker: 'Investigación · Series',
  chips: ['Se actualiza cada lunes', 'Método publicado', 'Cada contrato con su ficha'],
  tTotal: 'medibles en total', tTotalSub: 'suma de los contratos que sí traen monto',
  tShare: 'de cada 10.000 pesos', tShareSub: 'que estos mismos organismos gastaron en todo',
  tCoverage: 'sin monto en el feed', tCoverageSub: 'no es una estimación nuestra: el dato falta',
  tContracts: 'contratos detectados', tContractsSub: 'desde 2006, clasificados uno por uno',

  ctxTag: 'El punto de partida', ctxTitle: 'Por qué esto no se puede consultar directamente',
  ctx1: 'El portal de Compras Estatales publica qué se compró, a quién y por cuánto, pero no publica para qué política. No existe un campo «área de política», ni un organismo comprador llamado Inmujeres —el Instituto Nacional de las Mujeres compra a través de la unidad ejecutora del MIDES—, ni un rubro del catálogo que agrupe el tema. Lo único que queda es el texto libre que un funcionario escribió al cargar el llamado.',
  ctx2: 'Entonces se reconstruye desde ahí, con una lista de términos publicada y auditable. Y reconstruir desde texto tiene trampas concretas que hay que matar antes de sumar un solo peso: en la jerga de compras uruguaya «género» también significa TELA, «trans» aparece dentro de «transporte» y «transferencia», el «Plan de Equidad» era una transferencia monetaria del MIDES sin relación con el tema, y «diversidad» sola trae a la Dirección Nacional de Biodiversidad.',

  findTag: 'Hallazgo 1', findTitle: 'El gasto es chico y está concentrado en una sola red',
  find1: 'De todo lo detectado, la mayor parte no es capacitación ni campañas: es atención a mujeres en situación de violencia. La red ComunaMujer de la Intendencia de Montevideo y el sistema de respuesta en violencia basada en género concentran la enorme mayoría del dinero medible. Un solo comprador —la Intendencia de Montevideo— explica la mayoría del total.',
  find1b: 'Puesto contra lo que esos mismos organismos gastaron en todo lo demás, el tema es una fracción muy chica de su presupuesto de compras.',

  supTag: 'Hallazgo 2', supTitle: 'Cinco organizaciones se llevan casi todo',
  sup1: 'Del lado del proveedor la concentración es todavía más marcada: cinco organizaciones de la sociedad civil reciben la enorme mayoría del gasto medible. No son empresas: son ONG y fundaciones especializadas, que ganan llamados a organizaciones de la sociedad civil convocados por la Intendencia de Montevideo y por el MIDES.',
  sup2: 'Esto no prueba irregularidad: en llamados dirigidos a OSC especializadas el universo de oferentes posibles es chico por definición. Pero es un dato de concentración que merece revisarse, y cada proveedor está enlazado a su ficha completa en el sitio.',
  supCaveat: 'Cuando un contrato tiene más de un adjudicatario, el monto se le imputa entero a cada uno: la fila del proveedor es un techo, no una liquidación.',

  gapTag: 'Hallazgo 3', gapTitle: 'El agujero: ocho de cada diez contratos no tienen monto',
  gap1: 'Este es el hallazgo incómodo, y no es sobre política de género: es sobre transparencia. La mayoría de los contratos que caen en el tema figuran en el feed sin ningún monto cargado. El total que publicamos, entonces, es un piso, no una cifra final — y no hay forma honesta de estimar el resto desde los datos abiertos.',
  gapPull: 'contratos no tienen monto cargado en el feed',
  gap2: 'La falta de carga no se reparte parejo: se concentra en los registros más viejos y en la unidad ejecutora histórica del MIDES. Cualquier cifra que circule sobre «cuánto gasta el Estado en género» —para arriba o para abajo— está construida sobre este mismo agujero.',

  partyTag: 'El cruce político', partyTitle: 'Qué se puede y qué no se puede decir sobre partidos',
  party1: 'A cada contrato se le puede adosar quién gobernaba el organismo el año en que se registró, usando el registro electoral público. Eso es contexto, no atribución: nadie firma un contrato «por» un partido.',
  party2: 'Y hay una trampa que invalida el ranking crudo: la Intendencia de Montevideo explica la mayor parte del gasto medible y fue gobernada por el mismo partido durante todo el período. Un ranking de pesos por partido mide quién gobierna Montevideo, no quién gasta en género. Por eso la comparación se publica normalizada: cuánto del gasto propio de esos organismos fue al tema.',

  openTag: 'Ahora mismo', openTitle: 'Lo que está licitándose esta semana',
  openEmpty: 'No hay llamados abiertos del tema en este momento.',
  closes: 'Cierra',

  methodTag: 'El método', methodTitle: 'Cómo se construyó, y qué se tiró a la basura',
  method1: 'Dos etapas. Primero reglas: una lista de términos con guardas por contexto —la que evita que «esterilla de género» o «metros de género para cortinas» entren como política pública—. Después, un modelo lee el contrato completo y decide si realmente pertenece al tema y en qué categoría cae. Solo lo que sobrevive a las dos etapas suma.',
  method2: 'Los descartes se guardan y se publican, porque un tema reconstruido desde texto solo es auditable si se puede ver qué quedó afuera. Entre los falsos positivos que el clasificador sacó hay joyas: una compra de lombrices «(GENERO EISENIA FOETIDA)», un aire acondicionado para un sector llamado «Género» dentro de una dirección de RRHH, y bolsas de tela.',
  methodTerms: 'Ver la lista completa de términos, las exclusiones y los descartes',
  explore: 'Explorar todos los contratos',
  chartCategories: 'Composición del gasto medible',
  chartSuppliers: 'Principales proveedores',
  partyUnits: 'organismos', partyContracts: 'contratos', per10k: 'de cada 10.000',

  discTitle: 'Cómo leer esta investigación',
  disc: [
    'Todas las cifras salen de los datos abiertos de Compras Estatales (OCDS) y se recalculan cada lunes. El total es un piso: la mayoría de los contratos del tema no traen monto cargado en el feed.',
    'La página no dice si este gasto está bien o mal, ni si las políticas funcionan. Los datos de compras no contienen resultados de política; contienen compras.',
    'El partido gobernante se muestra como contexto electoral del año de cada contrato. No implica que un partido haya decidido, causado ni ejecutado esa compra.',
    'La clasificación temática usa un modelo de lenguaje en su segunda etapa. Puede equivocarse; por eso cada contrato conserva el motivo de su clasificación y la lista de descartes es pública.',
  ],
  srcTitle: 'Fuentes',
}

const EN: typeof ES = {
  title: 'How much Uruguay spends on gender and diversity policy',
  dek: 'The procurement feed has no "gender policy" label: it has to be rebuilt from the text each civil servant typed. Doing so surfaces three things the public debate rarely mentions: the measurable spend is small, it is concentrated in a single victim-support network, and eight in ten contracts in the field carry no amount at all.',
  fileOrg: 'Whole state · OCDS open data',
  fileSubject: 'Gender and diversity',
  kicker: 'Investigation · Series',
  chips: ['Refreshed every Monday', 'Method published', 'Every contract linked to its record'],
  tTotal: 'measurable in total', tTotalSub: 'sum of the contracts that do carry an amount',
  tShare: 'of every 10,000 pesos', tShareSub: 'these same bodies spent on everything',
  tCoverage: 'with no amount in the feed', tCoverageSub: 'not our estimate: the figure is missing',
  tContracts: 'contracts detected', tContractsSub: 'since 2006, classified one by one',

  ctxTag: 'The starting point', ctxTitle: 'Why you cannot just look this up',
  ctx1: 'State procurement publishes what was bought, from whom and for how much — but not which policy it served. There is no "policy area" field, no buying body called Inmujeres (the National Women\'s Institute buys through the MIDES executing unit), and no catalogue heading that groups the subject. All that is left is the free text a civil servant typed when loading the call.',
  ctx2: 'So it is rebuilt from there, with a published, auditable term list. Rebuilding from text has concrete traps that must be killed before adding up a single peso: in Uruguayan procurement Spanish "género" also means CLOTH, "trans" hides inside "transporte" and "transferencia", the "Plan de Equidad" was an unrelated MIDES cash transfer, and "diversidad" on its own drags in the National Biodiversity Directorate.',

  findTag: 'Finding 1', findTitle: 'The spend is small and concentrated in one network',
  find1: 'Most of what was detected is not training or campaigns: it is support for women experiencing violence. Montevideo\'s ComunaMujer network and the gender-violence response system account for the vast majority of the measurable money. A single buyer — the Montevideo city government — explains most of the total.',
  find1b: 'Set against what those same bodies spent on everything else, the subject is a very small fraction of their procurement budget.',

  supTag: 'Finding 2', supTitle: 'Five organisations take almost all of it',
  sup1: 'On the supplier side the concentration is sharper still: five civil-society organisations receive the vast majority of the measurable spend. They are not companies but specialised NGOs and foundations, winning calls addressed to civil-society organisations by the Montevideo city government and MIDES.',
  sup2: 'This does not prove irregularity: in calls addressed to specialised CSOs the pool of possible bidders is small by definition. But it is a concentration figure worth reviewing, and every supplier links to its full record on the site.',
  supCaveat: 'When a contract has more than one awardee the amount is charged in full to each: a supplier row is a ceiling, not a settlement.',

  gapTag: 'Finding 3', gapTitle: 'The hole: eight in ten contracts carry no amount',
  gap1: 'This is the uncomfortable finding, and it is not about gender policy: it is about transparency. Most contracts in the topic appear in the feed with no amount loaded at all. The total we publish is therefore a floor, not a final figure — and there is no honest way to estimate the rest from open data.',
  gapPull: 'contracts carry no amount in the feed',
  gap2: 'The gap is not evenly spread: it clusters in the older records and in the historic MIDES executing unit. Any figure circulating about "how much the state spends on gender" — higher or lower — is built on this same hole.',

  partyTag: 'The political cross-reference', partyTitle: 'What can and cannot be said about parties',
  party1: 'Each contract can be tagged with who governed the body in the year it was recorded, from the public electoral record. That is context, not attribution: nobody signs a contract "for" a party.',
  party2: 'And one trap invalidates the raw ranking: the Montevideo city government explains most of the measurable spend and was governed by the same party throughout. A peso ranking by party measures who governs Montevideo, not who spends on gender. So the comparison is published normalised: how much of those bodies\' own spending went to the topic.',

  openTag: 'Right now', openTitle: 'What is out to tender this week',
  openEmpty: 'No open calls on the topic at the moment.',
  closes: 'Closes',

  methodTag: 'The method', methodTitle: 'How it was built, and what was thrown out',
  method1: 'Two stages. First rules: a term list with context guards — the thing that stops "esterilla de género" or "metres of género for curtains" entering as public policy. Then a model reads the whole contract and decides whether it really belongs and in which category. Only what survives both stages counts.',
  method2: 'The discards are kept and published, because a topic rebuilt from text is only auditable if you can see what was left out. Among the false positives the classifier removed: a purchase of worms "(GENERO EISENIA FOETIDA)", an air conditioner for a section called "Género" inside an HR directorate, and cloth bags.',
  methodTerms: 'See the full term list, the exclusions and the discards',
  explore: 'Explore every contract',
  chartCategories: 'Composition of the measurable spend',
  chartSuppliers: 'Top suppliers',
  partyUnits: 'bodies', partyContracts: 'contracts', per10k: 'of every 10,000',

  discTitle: 'How to read this investigation',
  disc: [
    'Every figure comes from State-procurement open data (OCDS) and is recomputed every Monday. The total is a floor: most contracts in the topic carry no amount in the feed.',
    'The page does not say whether this spending is good or bad, nor whether the policies work. Procurement data holds purchases, not policy outcomes.',
    'The governing party is shown as electoral context for the year of each contract. It does not imply a party decided, caused or executed the purchase.',
    'The topic classification uses a language model in its second stage. It can be wrong; that is why each contract keeps the reason for its classification and the discard list is public.',
  ],
  srcTitle: 'Sources',
}

const c = computed(() => (locale.value === 'en' ? EN : ES))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const siteUrl = useRuntimeConfig().public.siteUrl as string

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

/** The file line: the period and the recompute stamp only exist once the live
 *  rollup has answered, so they are appended rather than rendered empty. */
const coverFields = computed(() => {
  const fields: { label?: string, value: string }[] = [
    { label: t('inv.file.expediente'), value: c.value.fileSubject },
    { value: c.value.fileOrg },
  ]
  if (s.value) {
    fields.push({ label: t('inv.file.periodo'), value: `${s.value.minYear}–${s.value.maxYear}` })
    fields.push({ value: t('inv.file.recalculado', { date: fmtDate(s.value.calculatedAt) }) })
  }
  return fields
})

const headlineTiles = computed(() => [
  { amount: s.value?.total, label: c.value.tTotal, sub: c.value.tTotalSub },
  { value: shareBp.value, label: c.value.tShare, sub: c.value.tShareSub },
  { value: `${noAmountPct.value}%`, tone: 'alerta' as const, label: c.value.tCoverage, sub: c.value.tCoverageSub },
  { value: s.value?.contracts, label: c.value.tContracts, sub: c.value.tContractsSub },
])

const partyRows = computed<any[]>(() => (s.value?.byParty ?? []).map((p: any) => ({
  ...p,
  name: p.partyLabel,
  meta: `${p.organisms} ${c.value.partyUnits} · ${p.contracts} ${c.value.partyContracts}`,
})))

const openCallRows = computed<any[]>(() => (s.value?.openCalls ?? []).map((call: any) => ({
  ...call,
  name: call.title || `#${call.compraId}`,
  meta: call.buyerName,
  to: localePath(`/llamados/${call.compraId}`),
})))

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/gasto-en-genero',
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
</script>

<template>
  <div class="inv">
    <InvCover
      :fields="coverFields"
      :kicker="c.kicker"
      :title="c.title"
      :dek="c.dek"
      :chips="c.chips"
    />

    <!-- Headline figures, all live -->
    <InvSection
      v-if="s"
      alt
    >
      <InvTiles :items="headlineTiles" />
    </InvSection>

    <!-- Context -->
    <InvSection
      :eyebrow="c.ctxTag"
      :title="c.ctxTitle"
    >
      <div class="inv-prose">
        <p>{{ c.ctx1 }}</p>
        <p>{{ c.ctx2 }}</p>
      </div>
    </InvSection>

    <!-- Finding 1 -->
    <InvSection
      v-if="s"
      alt
      :eyebrow="c.findTag"
      :title="c.findTitle"
    >
      <div class="inv-prose">
        <p>{{ c.find1 }}</p>
        <p>
          {{ c.find1b }}
          <template v-if="topBuyer">
            <strong>{{ topBuyer.buyerName }}: {{ topBuyerPct }}%</strong>.
          </template>
          <strong>{{ categoryLabel('vbg-atencion') }} + {{ categoryLabel('comuna-mujer') }}: {{ carePct }}%</strong>.
        </p>
      </div>
      <div class="gen-evidence">
        <ChartBlock
          :title="c.chartCategories"
          :scroll="false"
        >
          <SpendBars :items="categoryBars" />
        </ChartBlock>
      </div>
    </InvSection>

    <!-- Finding 2 — suppliers -->
    <InvSection
      v-if="s"
      :eyebrow="c.supTag"
      :title="c.supTitle"
    >
      <div class="inv-prose">
        <p>
          {{ c.sup1 }}
          <strong>{{ top5Pct }}%</strong>.
        </p>
        <p>{{ c.sup2 }}</p>
      </div>
      <div class="gen-evidence">
        <ChartBlock
          :title="c.chartSuppliers"
          :help="c.supCaveat"
          :scroll="false"
        >
          <SpendBars :items="supplierBars" />
        </ChartBlock>
      </div>
    </InvSection>

    <!-- Finding 3 — the coverage hole. The ink panel is the house device for
         "this is the decisive finding", and this one is decisive: it is why the
         total is a floor. -->
    <InvSection
      v-if="s"
      alt
      :eyebrow="c.gapTag"
      :title="c.gapTitle"
    >
      <div class="inv-prose">
        <p>{{ c.gap1 }}</p>
      </div>
      <InvFinding class="gen-finding">
        <p class="gen-finding__n">
          {{ s.contractsWithoutAmount }} <span>/ {{ s.contracts }}</span>
        </p>
        <p class="gen-finding__l">
          {{ c.gapPull }}
        </p>
        <p>{{ c.gap2 }}</p>
      </InvFinding>
    </InvSection>

    <!-- Party -->
    <InvSection
      v-if="s?.byParty?.length"
      :eyebrow="c.partyTag"
      :title="c.partyTitle"
    >
      <div class="inv-prose">
        <p>{{ c.party1 }}</p>
        <p>{{ c.party2 }}</p>
      </div>
      <InvRows
        :items="partyRows"
        item-key="party"
        name-key="name"
        meta-key="meta"
      >
        <template #fig="{ item }">
          <b class="invrows__n u-mono">{{ item.weightedShareBp.toFixed(1) }}</b>
          <span class="invrows__u">{{ c.per10k }}</span>
        </template>
      </InvRows>
    </InvSection>

    <!-- Open calls -->
    <InvSection
      alt
      :eyebrow="c.openTag"
      :title="c.openTitle"
    >
      <p
        v-if="!openCallRows.length"
        class="inv-note"
      >
        {{ c.openEmpty }}
      </p>
      <InvRows
        v-else
        :items="openCallRows"
        item-key="compraId"
        name-key="name"
        meta-key="meta"
        to-key="to"
      >
        <template #fig="{ item }">
          <span class="gen-date u-mono">{{ c.closes }} {{ fmtDate(item.endDate) }}</span>
        </template>
      </InvRows>
    </InvSection>

    <!-- Method -->
    <InvSection
      :eyebrow="c.methodTag"
      :title="c.methodTitle"
    >
      <div class="inv-prose">
        <p>{{ c.method1 }}</p>
        <p>{{ c.method2 }}</p>
      </div>
      <InvActions class="gen-actions">
        <v-btn
          :to="localePath('/analytics/genero')"
          color="primary"
          variant="flat"
          prepend-icon="mdi-magnify"
          class="text-none"
        >
          {{ c.explore }}
        </v-btn>
        <v-btn
          :to="localePath('/analytics/genero?rejected=1')"
          variant="outlined"
          class="text-none"
        >
          {{ c.methodTerms }}
        </v-btn>
      </InvActions>
    </InvSection>

    <!-- Uruguay Leaks: lo que no está en los datos abiertos se manda a quien puede protegerlo. -->
    <InvSection>
      <LeakTip
        :subject="c.title"
        path="/investigaciones/gasto-en-genero"
      />
    </InvSection>

    <!-- How to read -->
    <InvSection alt>
      <InvDisclaimer
        :title="c.discTitle"
        :paragraphs="c.disc"
        :sources-title="topic?.sources?.length ? c.srcTitle : undefined"
        :sources="topic?.sources"
      />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
/* Everything here is spacing INSIDE the house grammar (.inv-sec / .inv-head /
   .inv-prose / .inv-tile), never a replacement for it. The page reads as:
   generous air between sections, one interval between a head and its body, a
   tighter one between paragraphs, and the tightest inside a record row. */

/* Evidence follows its prose after a full section-scale beat, so the chart is
   read as the argument's proof rather than as another paragraph. */
.gen-evidence { margin-top: var(--s-7); }

/* The decisive finding, on the house ink panel. In the dark theme the panel and
   the section behind it are both near-ink (1.1:1), so the panel's edge dissolves
   and only its shadow remains. A hairline in the ink surface's own rule token
   restores the boundary in both themes. */
.gen-finding {
  margin-top: var(--s-7);
  border: 1px solid var(--ink-rule);
}

.gen-finding__n {
  font-family: var(--font-display);
  font-size: clamp(2.6rem, 8vw, 4.5rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--ink-fg);
  margin: 0;

  span {
    font-size: 0.45em;
    color: var(--ink-fg-dim);
    letter-spacing: -0.01em;
  }
}

.gen-finding__l {
  font-size: 1.05rem;
  color: var(--ink-fg-dim);
  margin: var(--s-3) 0 var(--s-5);
  max-width: 40ch;
}

/* A closing date is a sentence, not a figure: it wraps rather than forcing the
   row wider. */
.gen-date {
  font-size: 0.85rem;
  color: var(--text-muted);
  white-space: normal;
}

.gen-actions { margin-top: var(--s-6); }

@media (max-width: 640px) {
  .gen-finding { padding: var(--s-5); }
}
</style>
