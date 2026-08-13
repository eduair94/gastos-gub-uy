<script setup lang="ts">
/**
 * Investigación · Qué compra el Estado cuando compra palabras.
 *
 * The question behind it — "does the State pay to indoctrinate?" — is an
 * intention, and procurement data records purchases, not intentions. So the piece
 * answers the part that IS decidable, and says plainly which part is not:
 *
 *   1. The article catalogue (84.011 live codes) has NO code for a curriculum, a
 *      school textbook, a teacher's guide, an educational programme or sex
 *      education. The purchasing system has no way to buy an idea.
 *   2. What it does buy, at ~11.000 million UYU, is the VEHICLE: advertising,
 *      printing, courses, publications.
 *   3. Who collects that money is public, and this page names them.
 *
 * Every figure comes from /api/analytics/mensajes, which reads `product_analytics`
 * — amounts already apportioned per line and per supplier. Nothing here is typed
 * in by hand, and nothing is a keyword search over contract text: that shortcut
 * reads ANEP's paper and exercise books as "printing" and inflates the figure by
 * thousands of millions.
 *
 * Three lump-sum artifacts are excluded from every figure and published in full
 * (see AMOUNT_ARTIFACTS). One of them alone — 9.600 posters loaded at 478.080
 * pesos EACH — would otherwise have made printing the largest layer and the
 * headline wrong by a factor of ~3.300.
 */
const localePath = useLocalePath()
const { locale } = useI18n()

const { data: res } = await useFetch<any>('/api/analytics/mensajes')
const d = computed<any>(() => res.value?.data ?? null)

const isEn = computed(() => locale.value === 'en')
const layers = computed<any[]>(() => d.value?.layers ?? [])
const layer = (key: string) => layers.value.find(l => l.key === key) ?? null
const layerLabel = (l: any) => (isEn.value ? l.labelEn : l.labelEs)
const layerNote = (l: any) => (isEn.value ? l.noteEn : l.noteEs)

/** Probes that returned nothing — the counter-evidence, and the finding itself. */
const emptyProbes = computed<any[]>(() => (d.value?.content ?? []).filter((c: any) => !c.codes))
const foundProbes = computed<any[]>(() => (d.value?.content ?? []).filter((c: any) => c.codes))

const layerBars = computed(() =>
  [...layers.value]
    .sort((a, b) => b.total - a.total)
    .map(l => ({
      label: layerLabel(l),
      value: l.total,
      sub: `${l.codes} ${isEn.value ? 'codes' : 'códigos'} · ${l.contracts.toLocaleString('es-UY')} ${isEn.value ? 'contracts' : 'contratos'}`,
    })),
)

const yearBars = computed(() =>
  (d.value?.byYear ?? [])
    .filter((y: any) => y.total > 0)
    .map((y: any) => ({ label: String(y.year), value: y.total })),
)

/** Advertising is the largest layer once the lump-sum artifacts are removed. */
const adShare = computed(() => {
  const ad = layer('publicidad')
  return d.value?.total ? Math.round((ad?.total ?? 0) / d.value.total * 100) : 0
})

const artifacts = computed<any[]>(() => d.value?.artifacts ?? [])

function fmtDate(value?: string | null): string {
  if (!value) return '—'
  const x = new Date(value)
  if (Number.isNaN(x.getTime())) return '—'
  return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${x.getUTCFullYear()}`
}

// ---- copy ------------------------------------------------------------------
const ES = {
  title: 'Qué compra el Estado cuando compra palabras',
  dek: 'La pregunta circula seguido: ¿el Estado gasta en adoctrinar? Las compras públicas no registran intenciones, registran compras — así que fuimos al catálogo. En sus 84.011 artículos vigentes no existe un código para un currículo, un texto escolar, una guía docente ni un programa educativo. El Estado no tiene forma de comprar una idea. Lo que sí compra, por 11.000 millones de pesos, es el vehículo que la transporta.',
  fileOrg: 'Todo el Estado · catálogo SICE + datos abiertos OCDS',
  kicker: 'Investigación · Series',
  chips: ['Montos prorrateados por línea', '4 capas · 221 códigos', 'Sin búsqueda por palabras'],

  tTotal: 'en vehículos para un mensaje', tTotalSub: 'impresión, publicidad, cursos y publicaciones',
  tCodes: 'códigos de contenido curricular', tCodesSub: 'en un catálogo de 84.011 artículos vigentes',
  tContracts: 'contratos', tContractsSub: 'detrás de esas cuatro capas',
  tAds: 'es publicidad', tAdsSub: 'la capa más grande: comprar que te escuchen',

  qTag: 'La pregunta', qTitle: 'Qué se puede decidir con esta base y qué no',
  q1: 'Adoctrinar es una intención. Un registro de compras no guarda intenciones: guarda qué se compró, a quién y por cuánto. Ninguna base de contrataciones del mundo puede probar que un gasto buscaba formar una opinión, y este sitio no va a fingir lo contrario.',
  q2: 'Pero hay una pregunta vecina que sí se puede contestar con precisión: ¿el Estado compra contenido? Es decir, ¿le paga a alguien de afuera para que escriba lo que se enseña o lo que se dice? Eso deja rastro obligatorio, porque toda compra pública se carga contra un código del catálogo de artículos. Si el contenido se comprara, existiría el código.',

  catTag: 'Hallazgo 1', catTitle: 'El catálogo no tiene un código para una idea',
  cat1: 'El catálogo SICE es la lista de todo lo que el Estado uruguayo puede comprar: tornillos, tomografías, horas de vigilancia, pasajes. Cada línea de cada contrato se imputa a uno de esos códigos. Buscamos ahí los términos que usaría cualquiera que sospeche de contenido comprado.',
  catNone: 'Ningún código',
  catFoundIntro: 'Lo único que aparece:',
  cat2: 'La conclusión no es que no exista contenido educativo: existe, y se produce adentro del Estado —programas, currículo y formación docente los hacen funcionarios en la ANEP, con sueldo, no con una orden de compra—. La conclusión es que ese contenido no pasa por el circuito de compras, y por lo tanto no se puede auditar por acá. Quien quiera discutirlo tiene que ir a las actas del CODICEN, no a las licitaciones.',

  moneyTag: 'Hallazgo 2', moneyTitle: 'Dónde sí está la plata: el vehículo, no el mensaje',
  money1: 'Lo que el Estado sí compra en volumen es todo aquello que lleva palabras encima. Cuatro capas, sin superposición entre ellas: cada código del catálogo se cuenta una sola vez.',
  money2: 'La capa más grande es la publicidad: más de la mitad del total. Le sigue la imprenta —folletos, formularios, libretas, afiches— y recién después los cursos y los libros. El Estado gasta bastante más en que lo escuchen que en enseñarle algo a sus propios funcionarios.',
  moneyPauta: 'La publicidad oficial tiene su propia página, con el detalle por medio receptor.',
  moneyPautaCta: 'Ver pauta oficial',
  chartLayers: 'Las cuatro capas',
  chartYears: 'Por año',
  chartYearsHelp: 'Suma de las cuatro capas. Los años más viejos tienen menos montos cargados, así que la serie no es comparable hacia atrás.',

  whoTag: 'Hallazgo 3', whoTitle: 'Quién cobra por las palabras del Estado',
  who1: 'Los montos están prorrateados por línea y por proveedor, así que estas son cifras de cobro, no totales de contrato. Dos cosas saltan al mirarlas.',
  who2: 'La primera: en varias capas el mayor receptor es el propio Estado. En libros y publicaciones encabeza la Dirección Nacional de Impresiones y Publicaciones Oficiales; en cursos aparecen direcciones nacionales cobrándole a otros organismos. Es dinero público que cambia de bolsillo dentro del Estado, no una fuga.',
  who3: 'La segunda: en cursos, el negocio de enseñarle al Estado está repartido entre fundaciones universitarias, institutos de idiomas, un sindicato y el instituto de normas técnicas. No hay un proveedor dominante.',
  colSupplier: 'Proveedor', colAmount: 'Cobrado',

  artTag: 'La advertencia', artTitle: 'Un contrato de afiches que valía 3.300 veces menos',
  art1: 'Al armar esta nota apareció un número imposible: la imprenta parecía la capa más cara del Estado, con 8.400 millones. Más de la mitad venía de un solo contrato de 2019 del CODICEN: 9.600 afiches de Zonalectura a 478.080 pesos cada uno. A ese precio, un afiche costaría más que un auto.',
  art2: 'Es el artefacto de monto que este sitio ya documenta: quien cargó la compra puso en «precio unitario» el precio de todo el lote, y el cálculo lo multiplicó por la cantidad. Encontramos tres casos del mismo tipo dentro de esta capa. Los tres están excluidos de todas las cifras de esta página, y están acá abajo para revisarlos uno por uno.',
  art3: 'Sin esa corrección, el titular de esta nota habría sido falso por un factor de más de tres mil.',
  artLine: 'cargado como', artEach: 'c/u', artExcluded: 'Excluido',
  artSee: 'Ver el contrato',

  methodTag: 'El método', methodTitle: 'Por qué esto no se hizo buscando palabras',
  method1: 'La forma obvia de armar esta nota sería buscar «impresión» o «publicidad» en el texto de los contratos. Lo probamos y da un número falso: los contratos más grandes que contienen la palabra «impresión» son las compras de PAPEL PARA IMPRESIÓN Y FOTOCOPIADO y CUADERNOLAS de Primaria. Sumar eso da unos 5.000 millones de pesos de útiles escolares contados como si fueran imprenta.',
  method2: 'Por eso el conteo se hace sobre el catálogo, código por código, con los montos que ya vienen prorrateados por línea y por proveedor. Cada código cae en una sola capa, así que las cuatro suman el total sin contarse dos veces.',
  exploreCta: 'Explorar los contratos',

  discTitle: 'Cómo leer esta investigación',
  disc: [
    'Los montos salen de los datos abiertos de Compras Estatales (OCDS), normalizados a pesos y prorrateados por línea. Son lo que efectivamente se imputó a cada código del catálogo, no el total de los contratos que lo contienen.',
    'Que no exista un código de catálogo para «currículo» no prueba que nadie influya sobre lo que se enseña. Prueba algo más chico y más útil: que esa influencia, si existe, no se ejerce comprándola, y por lo tanto no se investiga con esta base.',
    'Comprar publicidad no es adoctrinar. Un Estado comunica campañas de vacunación, de seguridad vial y de trámites. Esta página muestra cuánto y a quién, y deja el juicio al lector.',
    'Los mayores receptores incluyen organismos públicos vendiéndole a otros organismos públicos. Están a la vista, sin corregir, porque así figura en la fuente.',
  ],
  srcTitle: 'Fuentes',
  sources: [
    { label: 'Compras Estatales — datos abiertos OCDS', url: 'https://www.comprasestatales.gub.uy/ocds/' },
    { label: 'ACCE — catálogo de artículos, servicios y obras (SICE)', url: 'https://www.gub.uy/agencia-reguladora-compras-estatales/' },
    { label: 'ANEP — Consejo Directivo Central', url: 'https://www.anep.edu.uy/' },
  ],
}

const EN: typeof ES = {
  title: 'What the State buys when it buys words',
  dek: 'The question comes up often: does the State spend on indoctrination? Procurement records do not hold intentions, they hold purchases — so we went to the catalogue. Across its 84,011 live articles there is no code for a curriculum, a school textbook, a teacher\'s guide or an educational programme. The State has no way to buy an idea. What it does buy, for 11,000 million pesos, is the vehicle that carries one.',
  fileOrg: 'Whole state · SICE catalogue + OCDS open data',
  kicker: 'Investigation · Series',
  chips: ['Amounts apportioned per line', '4 layers · 221 codes', 'No keyword search'],

  tTotal: 'on vehicles for a message', tTotalSub: 'printing, advertising, courses and publications',
  tCodes: 'codes for curricular content', tCodesSub: 'in a catalogue of 84,011 live articles',
  tContracts: 'contracts', tContractsSub: 'behind those four layers',
  tAds: 'is advertising', tAdsSub: 'the largest layer: buying an audience',

  qTag: 'The question', qTitle: 'What this data can settle, and what it cannot',
  q1: 'Indoctrination is an intention. A purchase record holds no intentions: it holds what was bought, from whom and for how much. No procurement database anywhere can prove that a purchase sought to shape an opinion, and this site will not pretend otherwise.',
  q2: 'But a neighbouring question can be answered precisely: does the State buy content? That is, does it pay an outsider to write what gets taught or said? That leaves a mandatory trace, because every public purchase is charged against a code in the article catalogue. If content were bought, the code would exist.',

  catTag: 'Finding 1', catTitle: 'The catalogue has no code for an idea',
  cat1: 'The SICE catalogue is the list of everything the Uruguayan State can buy: screws, CT scans, security hours, plane tickets. Every line of every contract is charged to one of those codes. We searched it for the terms anyone suspecting bought content would use.',
  catNone: 'No code',
  catFoundIntro: 'The only thing that shows up:',
  cat2: 'The conclusion is not that educational content does not exist: it does, and it is produced inside the State — programmes, curriculum and teacher training are made by ANEP staff, on salary, not on a purchase order. The conclusion is that this content never passes through the purchasing circuit, and so cannot be audited here. Anyone wanting to argue about it has to go to CODICEN minutes, not to tenders.',

  moneyTag: 'Finding 2', moneyTitle: 'Where the money is: the vehicle, not the message',
  money1: 'What the State does buy in volume is everything that carries words. Four layers, with no overlap between them: each catalogue code is counted once.',
  money2: 'The largest layer is advertising: more than half the total. Printing follows — leaflets, forms, booklets, posters — and only then courses and books. The State spends considerably more on being heard than on teaching its own staff.',
  moneyPauta: 'Official advertising has its own page, broken down by receiving outlet.',
  moneyPautaCta: 'See official advertising',
  chartLayers: 'The four layers',
  chartYears: 'By year',
  chartYearsHelp: 'Sum of the four layers. Older years carry fewer loaded amounts, so the series is not comparable further back.',

  whoTag: 'Finding 3', whoTitle: 'Who gets paid for the State\'s words',
  who1: 'Amounts are apportioned per line and per supplier, so these are receipts, not contract totals. Two things stand out.',
  who2: 'First: in several layers the largest recipient is the State itself. Books and publications are led by the National Directorate of Official Printing and Publications; courses show national directorates charging other bodies. That is public money changing pockets inside the State, not a leak.',
  who3: 'Second: in courses, the business of teaching the State is split between university foundations, language institutes, a trade union and the technical standards institute. There is no dominant supplier.',
  colSupplier: 'Supplier', colAmount: 'Received',

  artTag: 'The warning', artTitle: 'A poster contract worth 3,300 times less',
  art1: 'Building this piece turned up an impossible number: printing looked like the State costliest layer, at 8,400 million. More than half came from a single 2019 CODICEN contract: 9,600 Zonalectura posters at 478,080 pesos each. At that price a poster would cost more than a car.',
  art2: 'It is the lump-sum artifact this site already documents: whoever loaded the purchase put the price of the whole lot into the unit-price field, and the calculation multiplied it by the quantity. We found three of the same kind inside this layer. All three are excluded from every figure on this page, and they are below so each one can be checked.',
  art3: 'Without that correction, this piece headline would have been wrong by a factor of more than three thousand.',
  artLine: 'loaded as', artEach: 'each', artExcluded: 'Excluded',
  artSee: 'See the contract',

  methodTag: 'The method', methodTitle: 'Why this was not done by searching words',
  method1: 'The obvious way to build this piece would be to search contract text for "impresión" or "publicidad". We tried, and it returns a false number: the largest contracts containing the word "impresión" are Primary Education\'s purchases of PHOTOCOPY PAPER and EXERCISE BOOKS. Adding those up counts some 5,000 million pesos of school supplies as printing.',
  method2: 'So the count runs over the catalogue instead, code by code, with amounts that already come apportioned per line and per supplier. Each code falls in exactly one layer, so the four sum to the total without double counting.',
  exploreCta: 'Explore the contracts',

  discTitle: 'How to read this investigation',
  disc: [
    'Amounts come from State-procurement open data (OCDS), normalised to pesos and apportioned per line. They are what was actually charged to each catalogue code, not the total of the contracts containing it.',
    'That no catalogue code exists for "curriculum" does not prove nobody influences what is taught. It proves something smaller and more useful: that such influence, if it exists, is not exercised by buying it, and therefore is not investigated with this data.',
    'Buying advertising is not indoctrination. A State communicates vaccination, road-safety and paperwork campaigns. This page shows how much and to whom, and leaves the judgement to the reader.',
    'The largest recipients include public bodies selling to other public bodies. They are shown uncorrected, because that is how the source records them.',
  ],
  srcTitle: 'Sources',
  sources: [
    { label: 'State Procurement — OCDS open data', url: 'https://www.comprasestatales.gub.uy/ocds/' },
    { label: 'ACCE — catalogue of articles, services and works (SICE)', url: 'https://www.gub.uy/agencia-reguladora-compras-estatales/' },
    { label: 'ANEP — Central Governing Council', url: 'https://www.anep.edu.uy/' },
  ],
}

const c = computed(() => (isEn.value ? EN : ES))

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

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/mensajes-del-estado',
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
    <header class="inv-cover">
      <div class="u-container">
        <div class="inv-file">
          <span>EXPEDIENTE&nbsp; <b>Mensajes del Estado</b></span>
          <span>{{ c.fileOrg }}</span>
          <span v-if="d">Recalculado el {{ fmtDate(d.calculatedAt) }}</span>
        </div>
        <p class="inv-kicker">
          {{ c.kicker }}
        </p>
        <h1>{{ c.title }}</h1>
        <p class="inv-dek">
          {{ c.dek }}
        </p>
        <div class="inv-chips">
          <span
            v-for="ch in c.chips"
            :key="ch"
            class="inv-chip"
          >{{ ch }}</span>
        </div>
      </div>
    </header>

    <!-- Headline figures -->
    <section
      v-if="d"
      class="inv-sec inv-sec--alt"
    >
      <div class="u-container">
        <div class="inv-tiles">
          <div class="inv-tile">
            <MoneyAmount
              :amount="d.total"
              size="lg"
              align="start"
              :rule="false"
              compact
            />
            <div class="inv-tile__l">
              {{ c.tTotal }}
            </div>
            <div class="inv-tile__s">
              {{ c.tTotalSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n inv-tile__n--alerta">
              0
            </div>
            <div class="inv-tile__l">
              {{ c.tCodes }}
            </div>
            <div class="inv-tile__s">
              {{ c.tCodesSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n">
              {{ d.contracts.toLocaleString('es-UY') }}
            </div>
            <div class="inv-tile__l">
              {{ c.tContracts }}
            </div>
            <div class="inv-tile__s">
              {{ c.tContractsSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n">
              {{ adShare }}%
            </div>
            <div class="inv-tile__l">
              {{ c.tAds }}
            </div>
            <div class="inv-tile__s">
              {{ c.tAdsSub }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- The question -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.qTag }}
          </p>
          <h2>{{ c.qTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.q1 }}</p>
          <p>{{ c.q2 }}</p>
        </div>
      </div>
    </section>

    <!-- Finding 1 — the catalogue has no code for an idea -->
    <section
      v-if="d"
      class="inv-sec inv-sec--alt"
    >
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.catTag }}
          </p>
          <h2>{{ c.catTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.cat1 }}</p>
        </div>

        <ul class="msg-probes">
          <li
            v-for="p in emptyProbes"
            :key="p.term"
          >
            <span class="msg-probes__t">«{{ isEn ? p.labelEn : p.labelEs }}»</span>
            <span class="msg-probes__n u-mono">{{ c.catNone }}</span>
          </li>
        </ul>

        <template v-if="foundProbes.length">
          <p class="inv-note msg-found__h">
            {{ c.catFoundIntro }}
          </p>
          <ul class="msg-found">
            <li
              v-for="p in foundProbes"
              :key="p.term"
            >
              <span
                v-for="ex in p.examples"
                :key="ex.code"
                class="msg-found__item"
              >
                <NuxtLink :to="localePath(`/products/${ex.code}`)">{{ ex.name }}</NuxtLink>
                <MoneyAmount
                  :amount="ex.total"
                  size="sm"
                  compact
                />
              </span>
            </li>
          </ul>
        </template>

        <div class="inv-prose msg-after">
          <p>{{ c.cat2 }}</p>
        </div>
      </div>
    </section>

    <!-- Finding 2 — where the money is -->
    <section
      v-if="d"
      class="inv-sec"
    >
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.moneyTag }}
          </p>
          <h2>{{ c.moneyTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.money1 }}</p>
          <p>{{ c.money2 }}</p>
        </div>

        <div class="msg-layers">
          <article
            v-for="l in layers"
            :key="l.key"
            class="msg-layer"
          >
            <h3>{{ layerLabel(l) }}</h3>
            <MoneyAmount
              :amount="l.total"
              size="lg"
              align="start"
              :rule="false"
              compact
            />
            <p class="msg-layer__meta u-mono">
              {{ l.codes }} {{ isEn ? 'codes' : 'códigos' }} · {{ l.contracts.toLocaleString('es-UY') }} {{ isEn ? 'contracts' : 'contratos' }}
            </p>
            <p class="msg-layer__note">
              {{ layerNote(l) }}
            </p>
          </article>
        </div>

        <div class="msg-charts">
          <ChartBlock
            :title="c.chartLayers"
            :scroll="false"
          >
            <SpendBars :items="layerBars" />
          </ChartBlock>
          <ChartBlock
            :title="c.chartYears"
            :help="c.chartYearsHelp"
            :scroll="false"
          >
            <SpendBars :items="yearBars" />
          </ChartBlock>
        </div>

        <p class="inv-note msg-pauta">
          {{ c.moneyPauta }}
          <NuxtLink :to="localePath('/pauta')">
            {{ c.moneyPautaCta }}
          </NuxtLink>
        </p>
      </div>
    </section>

    <!-- Finding 3 — who gets paid -->
    <section
      v-if="d"
      class="inv-sec inv-sec--alt"
    >
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.whoTag }}
          </p>
          <h2>{{ c.whoTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.who1 }}</p>
          <p>{{ c.who2 }}</p>
          <p>{{ c.who3 }}</p>
        </div>

        <div class="msg-who">
          <section
            v-for="l in layers"
            :key="l.key"
            class="msg-who__col"
          >
            <h3>{{ layerLabel(l) }}</h3>
            <ul class="msg-rows">
              <li
                v-for="s in l.topSuppliers.slice(0, 6)"
                :key="s.name"
              >
                <NuxtLink
                  v-if="s.id"
                  class="msg-rows__n"
                  :to="localePath(`/suppliers/${encodeURIComponent(s.id)}`)"
                >
                  {{ s.name }}
                </NuxtLink>
                <span
                  v-else
                  class="msg-rows__n"
                >{{ s.name }}</span>
                <MoneyAmount
                  :amount="s.total"
                  size="sm"
                  compact
                />
              </li>
            </ul>
          </section>
        </div>
      </div>
    </section>

    <!-- The warning: the artifacts that would have made the headline false -->
    <section
      v-if="artifacts.length"
      class="inv-sec"
    >
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.artTag }}
          </p>
          <h2>{{ c.artTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.art1 }}</p>
          <p>{{ c.art2 }}</p>
        </div>

        <ul class="msg-art">
          <li
            v-for="a in artifacts"
            :key="a.ocid"
          >
            <div class="msg-art__id">
              <NuxtLink
                class="msg-art__t"
                :to="localePath(`/contracts/${a.releaseId}`)"
              >
                {{ a.article }} · {{ a.buyer }} · {{ a.year }}
              </NuxtLink>
              <p class="msg-art__calc u-mono">
                {{ a.quantity.toLocaleString('es-UY') }} × ${{ a.unitPrice.toLocaleString('es-UY') }} {{ c.artEach }}
              </p>
              <p class="msg-art__why">
                {{ isEn ? a.reasonEn : a.reasonEs }}
              </p>
            </div>
            <div class="msg-art__fig">
              <p class="msg-art__lab u-mono">
                {{ c.artExcluded }}
              </p>
              <MoneyAmount
                :amount="a.amount"
                size="sm"
                compact
              />
            </div>
          </li>
        </ul>

        <div class="inv-prose msg-after">
          <p>{{ c.art3 }}</p>
        </div>
      </div>
    </section>

    <!-- Method -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.methodTag }}
          </p>
          <h2>{{ c.methodTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.method1 }}</p>
          <p>{{ c.method2 }}</p>
        </div>
        <div class="msg-actions">
          <v-btn
            :to="localePath('/pauta')"
            color="primary"
            variant="flat"
            prepend-icon="mdi-bullhorn-variant-outline"
            class="text-none"
          >
            {{ c.moneyPautaCta }}
          </v-btn>
          <v-btn
            :to="localePath('/products')"
            variant="outlined"
            class="text-none"
          >
            {{ c.exploreCta }}
          </v-btn>
        </div>
      </div>
    </section>

    <!-- How to read -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <h2>{{ c.discTitle }}</h2>
        </div>
        <ul class="msg-disc">
          <li
            v-for="(x, i) in c.disc"
            :key="i"
          >
            {{ x }}
          </li>
        </ul>
        <h3 class="msg-srch">
          {{ c.srcTitle }}
        </h3>
        <ul class="msg-disc msg-disc--src">
          <li
            v-for="s in c.sources"
            :key="s.url"
          >
            <a
              :href="s.url"
              target="_blank"
              rel="noopener"
            >{{ s.label }}</a>
          </li>
        </ul>
      </div>
    </section>
    <!-- Uruguay Leaks: lo que no está en los datos abiertos se manda a quien puede protegerlo. -->
    <section class="inv-sec">
      <div class="u-container">
        <LeakTip
          :subject="c.title"
          path="/investigaciones/mensajes-del-estado"
        />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
/* Spacing follows the house rhythm: --s-8 between sections (from .inv-sec),
   --s-6 between a head and its body, --s-4 between paragraphs, --s-2 inside a
   row. Nothing here replaces the grammar in assets/scss/_investigaciones.scss. */

/* The empty catalogue probes ARE the finding, so they get a real block rather
   than a footnote — each term with the answer next to it. */
.msg-probes {
  list-style: none;
  margin: var(--s-6) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: var(--s-2);
}

.msg-probes li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  background: var(--bg);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  min-width: 0;
}

.msg-probes__t { font-weight: 600; overflow-wrap: anywhere; }

.msg-probes__n {
  font-size: 0.78rem;
  color: var(--alerta);
  white-space: nowrap;
}

.msg-found__h { margin: var(--s-6) 0 var(--s-2); }

.msg-found {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-2);
}

.msg-found__item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-2) var(--s-4);
  padding: var(--s-3) var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
}

.msg-found__item a { color: var(--celeste-deep); text-decoration: none; flex: 1 1 18rem; min-width: 0; }
.msg-found__item a:hover { text-decoration: underline; }

.msg-after { margin-top: var(--s-7); }

/* The four layers, as cards of equal weight: they are genuinely equivalent. */
.msg-layers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
  gap: var(--s-4);
  margin-top: var(--s-7);
}

.msg-layers > * { min-width: 0; }

.msg-layer {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  padding: var(--s-5);

  h3 {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 700;
    margin-bottom: var(--s-3);
  }
}

.msg-layer__meta {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin: var(--s-2) 0 var(--s-3);
}

.msg-layer__note {
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--text-muted);
  margin: 0;
}

.msg-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
  gap: var(--s-5);
  margin-top: var(--s-7);
}

.msg-charts > * { min-width: 0; }

.msg-pauta { margin-top: var(--s-5); }
.msg-pauta a { margin-left: var(--s-2); color: var(--celeste-deep); }

.msg-who {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: var(--s-5);
  margin-top: var(--s-7);
}

.msg-who > * { min-width: 0; }

.msg-who__col h3 {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: var(--s-3);
}

.msg-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-2);
}

.msg-rows li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-2) var(--s-4);
  padding: var(--s-3) var(--s-4);
  background: var(--bg);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
}

.msg-rows__n {
  flex: 1 1 12rem;
  min-width: 0;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
  color: var(--celeste-deep);
  text-decoration: none;
}

a.msg-rows__n:hover { text-decoration: underline; }
span.msg-rows__n { color: var(--text); }

.msg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-6);

  :deep(.v-btn) {
    height: auto;
    min-height: 40px;
    max-width: 100%;
    padding-block: var(--s-2);
  }

  :deep(.v-btn__content) { white-space: normal; text-align: left; }
}

.msg-art {
  list-style: none;
  margin: var(--s-6) 0 0;
  padding: 0;
  display: grid;
  gap: var(--s-3);
}

.msg-art li {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-3) var(--s-5);
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.msg-art__id { flex: 1 1 22rem; min-width: 0; }

.msg-art__t {
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.msg-art__t:hover { text-decoration: underline; }

.msg-art__calc {
  font-size: 0.8rem;
  color: var(--alerta);
  margin: var(--s-2) 0 0;
}

.msg-art__why {
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--text-muted);
  margin: var(--s-2) 0 0;
  max-width: 62ch;
}

.msg-art__fig { text-align: right; }

.msg-art__lab {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 var(--s-1);
}

.msg-disc {
  margin: 0;
  padding-left: var(--s-5);
  max-width: 72ch;
  display: grid;
  gap: var(--s-3);
  color: var(--text-muted);
}

.msg-disc--src { margin-top: var(--s-4); }
.msg-disc--src a { color: var(--celeste-deep); }

.msg-srch {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  margin: var(--s-6) 0 0;
}

@media (max-width: 640px) {
  .msg-actions { display: grid; gap: var(--s-2); }
  .msg-layer { padding: var(--s-4); }
}
</style>
