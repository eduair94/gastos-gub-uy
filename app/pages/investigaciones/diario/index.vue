<script setup lang="ts">
/**
 * El archivo de notas diarias.
 *
 * QUÉ ES UNA NOTA DIARIA, y por qué tiene ruta propia. No es una investigación larga —esas las
 * escribe una persona— ni una ficha de caso. Es un hallazgo MEDIDO sobre el corpus que arma un
 * trabajo por lotes todas las mañanas, y que se publica sólo si pasa un verificador automático
 * (shared/daily/verify.ts).
 *
 * EL AVISO DE ARRIBA NO SE SACA. El lector tiene que saber que esto lo escribió un modelo sobre
 * cifras medidas, antes de leer la primera. Ocultarlo sería presentar como reporteo lo que es
 * una medición automática.
 */
const { locale, t } = useI18n()
const route = useRoute()
const router = useRouter()

const page = computed(() => Math.max(1, Number.parseInt(String(route.query.page ?? '1'), 10) || 1))
const lane = computed(() => (typeof route.query.carril === 'string' ? route.query.carril : ''))

const { data: res } = await useFetch<any>('/api/investigaciones/diario', {
  query: computed(() => ({ page: page.value, limit: 20, ...(lane.value ? { lane: lane.value } : {}) })),
})

const items = computed<any[]>(() => res.value?.data?.items ?? [])
const pagination = computed(() => res.value?.data?.pagination ?? { page: 1, pages: 1, total: 0 })

function text(item: any) {
  return locale.value === 'en' ? (item.en ?? item.es) : item.es
}

const LANE_LABELS: Record<string, { es: string, en: string }> = {
  'pico-organismo': { es: 'Salto de gasto', en: 'Spending jump' },
  'proveedor-nuevo': { es: 'Proveedor nuevo', en: 'New supplier' },
  'concentracion-rubro': { es: 'Rubro concentrado', en: 'Concentrated category' },
  'anomalia-sin-explicar': { es: 'Precio sin explicar', en: 'Unexplained price' },
  'oferente-unico': { es: 'Oferta única', en: 'Single bid' },
  'salto-precio': { es: 'Salto de precio', en: 'Price jump' },
  'reiteracion-nueva': { es: 'Gasto reiterado', en: 'Overridden spending' },
  'directa-repetida': { es: 'Compra directa repetida', en: 'Repeated direct purchase' },
}
function laneLabel(key: string): string {
  const l = LANE_LABELS[key]
  return l ? (locale.value === 'en' ? l.en : l.es) : key
}

const title = computed(() => locale.value === 'en' ? 'Daily findings' : 'Hallazgos del día')
const dek = computed(() => locale.value === 'en'
  ? 'One measured finding a day, drawn from the procurement record. Each one states what was measured, which rule it puts in play, and what is still missing to say more.'
  : 'Un hallazgo medido por día, sacado del registro de compras. Cada uno dice qué se midió, qué norma pone en juego y qué falta para poder afirmar más.')

// Las vistas filtradas y las páginas 2..N no compiten con la canónica por el mismo contenido.
useSeo(() => ({
  title: title.value,
  description: dek.value.slice(0, 155),
  path: '/investigaciones/diario',
  kicker: 'Investigaciones',
  ...(lane.value || page.value > 1 ? { noindex: true } : {}),
}))

function setPage(p: number) {
  const merged: Record<string, unknown> = { ...route.query, page: p > 1 ? String(p) : undefined }
  router.replace({ query: Object.fromEntries(Object.entries(merged).filter(([, v]) => v)) })
}

const nf = computed(() => new Intl.NumberFormat(locale.value === 'en' ? 'en-US' : 'es-UY', { maximumFractionDigits: 0 }))
</script>

<template>
  <div class="inv">
    <InvCover
      tone="celeste"
      kicker="Con la tuya, contribuyente · Investigaciones"
      :title="title"
      :dek="dek"
      :fields="[
        { label: t('inv.file.alcance'), value: locale === 'en' ? `${pagination.total} findings published` : `${pagination.total} hallazgos publicados` },
        { value: locale === 'en' ? 'Measured on the OCDS procurement record' : 'Medido sobre el registro de compras (OCDS)' },
      ]"
    />

    <InvSection alt>
      <InvFinding
        :kicker="locale === 'en' ? 'How to read this' : 'Cómo se lee esto'"
        :body="[
          locale === 'en'
            ? 'These notes are produced automatically. A batch job measures the procurement record every morning, a language model writes the prose around those figures and nothing else, and an automatic checker refuses to publish anything whose numbers are not in the measured block, or that asserts wrongdoing.'
            : 'Estas notas se producen automáticamente. Un trabajo por lotes mide el registro de compras cada mañana, un modelo de lenguaje escribe la prosa alrededor de esas cifras y de nada más, y un verificador automático se niega a publicar lo que traiga un número que no esté en el bloque medido, o que afirme una irregularidad.',
          locale === 'en'
            ? 'A measurement is not a verdict. Every note carries what is still missing to say more, and who should answer.'
            : 'Una medición no es un veredicto. Cada nota lleva qué falta para afirmar más, y quién tendría que responder.',
        ]"
      />
    </InvSection>

    <InvSection>
      <p
        v-if="!items.length"
        class="dia-empty"
      >
        {{ locale === 'en' ? 'No findings published yet.' : 'Todavía no hay hallazgos publicados.' }}
      </p>

      <ul
        v-else
        class="dia-list"
      >
        <li
          v-for="item in items"
          :key="item.slug"
          class="dia-item"
        >
          <div class="chip-row">
            <span class="dia-lane">{{ laneLabel(item.lane) }}</span>
            <span class="dia-day">{{ item.dayKey }}</span>
          </div>
          <NuxtLink
            class="dia-title"
            :to="`/investigaciones/diario/${item.slug}`"
          >
            {{ text(item).title }}
          </NuxtLink>
          <p class="dia-dek">
            {{ text(item).dek }}
          </p>
          <p class="dia-meta">
            {{ item.subjectLabel }}
            <span v-if="item.amountUyu"> · <strong>$ {{ nf.format(item.amountUyu) }}</strong></span>
          </p>
        </li>
      </ul>

      <DataPager
        v-if="pagination.pages > 1"
        :page="pagination.page"
        :total-pages="pagination.pages"
        @update:page="setPage"
      />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
.dia-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-5);
}

.dia-item {
  padding-bottom: var(--s-5);
  border-bottom: 1px solid var(--rule);
}

/* Los dos chips van dentro de .chip-row: Vue condensa el salto de línea entre
   hermanos y sin el envoltorio el segundo se suelda al primero en el teléfono. */
.dia-lane {
  display: inline-block;
  padding: 2px var(--s-2);
  border: 1px solid var(--rule);
  border-radius: 999px;
  font-size: .72rem;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--muted);
}

.dia-day {
  font-size: .74rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.dia-title {
  display: block;
  margin: var(--s-2) 0 var(--s-1);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.3;
  color: var(--ink);
  text-decoration: none;
}

.dia-title:hover { text-decoration: underline; }

.dia-dek {
  margin: 0 0 var(--s-2);
  line-height: 1.6;
  color: var(--text);
}

.dia-meta {
  margin: 0;
  font-size: .84rem;
  color: var(--muted);
}

.dia-meta strong { color: var(--gold); }

.dia-empty {
  color: var(--muted);
}
</style>
