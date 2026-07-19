<script setup lang="ts">
/**
 * Deep-dive · Frigorífico Saturno (Abasto de Carnes Saturno S.A.) — la carne de las FF.AA.
 * 283 contratos por ~$1.140 M con el INDA y las tres fuerzas. En la Armada, un faltante de
 * ~57 toneladas de carne terminó en la Fiscalía de Delitos Económicos. Datos de
 * ~/data/investigaciones-empresas (verificados en releases + prensa citada).
 */
import { SATURNO_ARMADA_LEDGER, SATURNO_BY_BUYER, SATURNO_STATS } from '~/data/investigaciones-empresas'

const { locale } = useI18n()
const c = computed(() => (locale.value === 'en' ? EN : ES))

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/frigorifico-saturno',
}))

const buyerBars = computed(() =>
  SATURNO_BY_BUYER.map(b => ({ label: b.buyer, value: b.spend, color: b.force ? 'alerta' : 'gold' })))

const ES = {
  title: 'Frigorífico Saturno: la carne de los cuarteles y las toneladas que no llegaron',
  dek: 'Abasto de Carnes Saturno es uno de los grandes proveedores de carne del Estado: 283 contratos por unos 1.140 millones de pesos con el INDA, el Ejército, la Armada y la Fuerza Aérea. En la Armada, una pericia detectó un faltante de unas 57 toneladas de carne, sobreprecios y cortes no licitados. El caso está en la Fiscalía de Delitos Económicos.',
  chips: ['283 contratos', '$1.140 M', 'Las tres fuerzas', 'Faltante 57 toneladas'],
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
  ledgerIntro: 'Contratos de Saturno con el Comando General de la Armada, verificados en la base y enlazados a su ficha oficial. En rojo, el corte del faltante: la carne porcina (bondiola).',
  colDate: 'Año', colObjeto: 'Objeto', colAmount: 'Monto', ficha: 'Ficha oficial',
  statusTag: 'El estado', statusTitle: 'Dónde está la causa',
  status1: 'La Armada presentó la denuncia penal a fines de 2022. La causa está a cargo de la Fiscalía de Delitos Económicos y Complejos (fiscal Sandra Fleitas), con al menos 12 oficiales citados a declarar y una investigación administrativa interna en paralelo.',
  status2: 'La otra campana: la investigación penal se centra en los oficiales de la Armada, no en el frigorífico, que no está imputado formalmente. Lo que está cuestionado son sus precios y sus remitos. Saturno sigue siendo, en la base, un proveedor de carne habitual del Estado.',
  srcTitle: 'Fuentes',
  discTitle: 'Cómo leer esta investigación',
  disc: [
    'Los contratos, montos y compradores salen de la base de Compras Estatales (OCDS) del sitio, verificados y enlazados a su ficha oficial. El faltante de 57 toneladas, los sobreprecios y los remitos irregulares provienen de la pericia contable y la denuncia de la Armada, reportadas por la prensa citada —no de la base.',
    'El frigorífico no está imputado. Se lo nombra como proveedor del Estado y como parte cuestionada en una causa pública. Un contrato o un precio alto no es, por sí solo, prueba de delito. Quien quiera aportar su descargo puede hacerlo.',
  ],
}

const EN: typeof ES = {
  title: 'Frigorífico Saturno: the barracks’ meat and the tonnes that never arrived',
  dek: 'Abasto de Carnes Saturno is one of the State\'s major meat suppliers: 283 contracts for about 1,140 million pesos with INDA, the Army, the Navy and the Air Force. In the Navy, an audit found a shortfall of about 57 tonnes of meat, over-prices and un-tendered cuts. The case is with the Economic Crimes Prosecutor.',
  chips: ['283 contracts', '$1,140 M', 'All three forces', '57-tonne shortfall'],
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
  ledgerIntro: 'Saturno\'s contracts with the Navy Command, verified in the data and linked to their official record. In red, the cut of the shortfall: pork (shoulder).',
  colDate: 'Year', colObjeto: 'Item', colAmount: 'Amount', ficha: 'Official record',
  statusTag: 'The status', statusTitle: 'Where the case stands',
  status1: 'The Navy filed the criminal complaint in late 2022. The case is with the Economic & Complex Crimes Prosecutor (Sandra Fleitas), with at least 12 officers summoned to testify and a parallel internal administrative investigation.',
  status2: 'The other side: the criminal probe centers on the Navy officers, not the plant, which is not formally charged. What is questioned are its prices and its delivery notes. Saturno remains, in the data, a regular State meat supplier.',
  srcTitle: 'Sources',
  discTitle: 'How to read this investigation',
  disc: [
    'The contracts, amounts and buyers come from the site\'s State-procurement data (OCDS), verified and linked to their official record. The 57-tonne shortfall, the over-prices and the irregular delivery notes come from the forensic audit and the Navy\'s complaint, reported by the cited press —not from the data.',
    'The plant is not charged. It is named as a State supplier and as a questioned party in a public case. A contract or a high price is not, on its own, proof of a crime. Anyone named may add their response.',
  ],
}

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
    <header class="inv-cover">
      <div class="u-container">
        <div class="inv-file">
          <span>EXPEDIENTE&nbsp; <b>Abasto de Carnes Saturno S.A.</b></span>
          <span>{{ c.fileOrg }}</span>
          <span>PERÍODO&nbsp; <b>{{ c.filePeriod }}</b></span>
          <span>Compras Estatales + causa penal · verificado</span>
        </div>
        <p class="inv-kicker">
          Investigación · Empresas señaladas
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

    <!-- Tiles -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-tiles">
          <div class="inv-tile">
            <div class="inv-tile__n">
              {{ SATURNO_STATS.contracts }}
            </div>
            <div class="inv-tile__l">
              {{ c.tContracts }}
            </div>
            <div class="inv-tile__s">
              {{ c.tContractsSub }}
            </div>
          </div>
          <div class="inv-tile">
            <MoneyAmount
              :amount="SATURNO_STATS.totalUYU"
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
            <MoneyAmount
              :amount="SATURNO_STATS.armadaUYU"
              size="lg"
              align="start"
              :rule="false"
              compact
            />
            <div class="inv-tile__l">
              {{ c.tArmada }}
            </div>
            <div class="inv-tile__s">
              {{ c.tArmadaSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n">
              57 t
            </div>
            <div class="inv-tile__l">
              {{ c.tFaltante }}
            </div>
            <div class="inv-tile__s">
              {{ c.tFaltanteSub }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Contexto -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.ctxTag }}
          </p>
          <h2>{{ c.ctxTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.ctx1 }}</p>
          <p>{{ c.ctx2 }}</p>
        </div>
      </div>
    </section>

    <!-- Chart por comprador -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.chartTag }}
          </p>
          <h2>{{ c.chartTitle }}</h2>
          <p>{{ c.chartIntro }}</p>
        </div>
        <div class="inv-cardc">
          <div class="inv-scroll">
            <InvHBars
              :items="buyerBars"
              format="moneyM"
              :row-height="42"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- El caso -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.caseTag }}
          </p>
          <h2>{{ c.caseTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.case1 }}</p>
          <p>{{ c.case2 }}</p>
        </div>
      </div>
    </section>

    <!-- Ledger Armada -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.ledgerTag }}
          </p>
          <h2>{{ c.ledgerTitle }}</h2>
          <p>{{ c.ledgerIntro }}</p>
        </div>
        <div class="im-ledger u-scroll-x">
          <table>
            <thead>
              <tr>
                <th>{{ c.colDate }}</th>
                <th>{{ c.colObjeto }}</th>
                <th class="num">
                  {{ c.colAmount }}
                </th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in SATURNO_ARMADA_LEDGER"
                :key="row.ocid"
                :class="{ 'is-pork': row.desc.toLowerCase().includes('porcina') }"
              >
                <td
                  class="u-mono nowrap"
                  :data-label="c.colDate"
                >
                  {{ row.year }}
                </td>
                <td class="obj">
                  {{ row.desc }}
                </td>
                <td
                  class="num"
                  :data-label="c.colAmount"
                >
                  <MoneyAmount
                    :amount="row.amount"
                    compact
                  />
                </td>
                <td class="num">
                  <a
                    :href="row.url"
                    target="_blank"
                    rel="noopener"
                    class="im-ficha u-mono"
                  >{{ c.ficha }} →</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Estado -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.statusTag }}
          </p>
          <h2>{{ c.statusTitle }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.status1 }}</p>
          <p>{{ c.status2 }}</p>
        </div>
      </div>
    </section>

    <!-- Fuentes -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.srcTitle }}
          </p>
          <h2>{{ locale === 'en' ? 'Verified sources' : 'Fuentes verificadas' }}</h2>
        </div>
        <ul class="inv-srclist">
          <li
            v-for="s in SOURCES"
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

    <!-- Disclaimer -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-disclaimer">
          <h3>{{ c.discTitle }}</h3>
          <p
            v-for="(p, i) in c.disc"
            :key="i"
          >
            {{ p }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.im-ledger table { width: 100%; border-collapse: collapse; font-size: var(--t-sm); min-width: 560px; }
.im-ledger thead th {
  text-align: left; padding: var(--s-2) var(--s-3); font-family: var(--font-mono);
  font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-muted); border-bottom: 1px solid var(--rule);
}
.im-ledger thead th.num { text-align: right; }
.im-ledger tbody td { padding: var(--s-3); border-bottom: 1px solid var(--rule); vertical-align: top; }
.im-ledger tbody tr:hover { background: var(--surface-sunken); }
.im-ledger tbody tr.is-pork .obj { color: var(--alerta); font-weight: 700; }
.im-ledger .num { text-align: right; white-space: nowrap; }
.im-ledger .nowrap { white-space: nowrap; }
.im-ledger .obj { font-weight: 600; min-width: 300px; }
.im-ficha { color: var(--celeste-deep); text-decoration: none; font-size: var(--t-xs); white-space: nowrap; }
.im-ficha:hover { text-decoration: underline; }

@media (max-width: 760px) {
  .im-ledger { overflow-x: visible; }
  .im-ledger table { min-width: 0; display: block; }
  .im-ledger thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
  .im-ledger tbody { display: flex; flex-direction: column; gap: var(--s-3); }
  .im-ledger tbody tr {
    display: block; padding: var(--s-4); background: var(--surface);
    border: 1px solid var(--rule); border-radius: var(--r-lg); box-shadow: var(--shadow-1);
  }
  .im-ledger tbody tr:hover { background: var(--surface); }
  .im-ledger tbody td {
    display: block; min-width: 0; padding: var(--s-2) 0; border: 0;
    border-top: 1px solid color-mix(in srgb, var(--rule) 55%, transparent); text-align: left; white-space: normal;
  }
  .im-ledger tbody td:first-child { border-top: 0; padding-top: 0; }
  .im-ledger tbody td[data-label]::before {
    content: attr(data-label); display: block; margin-bottom: 3px; font-family: var(--font-mono);
    font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);
  }
  .im-ledger tbody td.obj { min-width: 0; font-weight: 700; }
  .im-ledger tbody td.num { text-align: left; white-space: normal; }
}
</style>
