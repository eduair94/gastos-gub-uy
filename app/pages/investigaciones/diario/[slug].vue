<script setup lang="ts">
/**
 * Una nota diaria.
 *
 * EL ORDEN DE LOS CUATRO BLOQUES ES EL CONTRATO EDITORIAL, y no se reordena:
 *
 *   1. `measured`  el hecho, con su número. Es lo único que se afirma.
 *   2. `norm`      la norma que el hecho pondría en juego SI se confirmara.
 *   3. `missing`   qué falta para poder afirmarlo.
 *   4. `answers`   quién tiene que responder.
 *
 * `missing` va con el MISMO peso visual que `measured`. Achicarlo convierte una medición en una
 * acusación, que es exactamente lo que el verificador existe para impedir.
 *
 * La tabla de hechos medidos va completa, con su procedencia por fila. Es lo que permite que
 * alguien vuelva a medir sin creernos nada.
 */
const route = useRoute()
const { locale, t } = useI18n()

const { data: res, error } = await useFetch<any>(`/api/investigaciones/diario/${route.params.slug}`)

if (error.value || !res.value?.data) {
  throw createError({ statusCode: 404, statusMessage: 'Nota no encontrada', fatal: true })
}

const note = computed<any>(() => res.value!.data)
const text = computed(() => (locale.value === 'en' ? (note.value.en ?? note.value.es) : note.value.es))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: locale.value === 'en' ? 'Daily findings' : 'Hallazgos del día', path: '/investigaciones/diario' },
  { name: text.value.title },
])

useSeo(() => ({
  title: text.value.title,
  description: text.value.dek.slice(0, 155),
  path: `/investigaciones/diario/${note.value.slug}`,
  type: 'article',
  kicker: 'Investigaciones',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': text.value.title,
      'description': text.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
      'datePublished': note.value.publishedAt,
      'dateModified': note.value.publishedAt,
    },
    breadcrumbLd,
  ],
}))

const nf = computed(() => new Intl.NumberFormat(locale.value === 'en' ? 'en-US' : 'es-UY', { maximumFractionDigits: 0 }))

const factColumns = computed(() => [
  { key: 'label', label: locale.value === 'en' ? 'Measured' : 'Qué se midió', primary: true },
  { key: 'value', label: locale.value === 'en' ? 'Value' : 'Valor', align: 'end' as const, mono: true },
  { key: 'provenance', label: locale.value === 'en' ? 'Where it comes from' : 'De dónde sale', muted: true },
])

/** El enlace al explorador con el mismo recorte que produjo la medición. */
const exploreHref = computed(() => {
  const q = note.value.query ?? {}
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  const qs = params.toString()
  return qs ? `/contratos?${qs}` : '/contratos'
})

const L = computed(() => locale.value === 'en'
  ? { measured: 'What was measured', norm: 'The rule it puts in play', missing: 'What is missing to say more', answers: 'Who should answer', facts: 'The measured block', context: 'Context', sources: 'Press about this body', explore: 'See these contracts in the explorer', reproduce: 'Reproduce this measurement', auto: 'Automatically produced note' }
  : { measured: 'Qué se midió', norm: 'La norma que pone en juego', missing: 'Qué falta para afirmar más', answers: 'Quién tiene que responder', facts: 'El bloque medido', context: 'Contexto', sources: 'Prensa sobre el organismo', explore: 'Ver estos contratos en el explorador', reproduce: 'Volver a medir el hecho', auto: 'Nota producida automáticamente' })
</script>

<template>
  <div class="inv">
    <InvCover
      tone="celeste"
      :kicker="L.auto"
      :title="text.title"
      :dek="text.dek"
      :fields="[
        { label: t('inv.file.periodo'), value: note.dayKey },
        { label: t('inv.file.alcance'), value: note.subjectLabel },
        ...(note.amountUyu ? [{ value: `$ ${nf.format(note.amountUyu)}` }] : []),
      ]"
    />

    <!-- 1. El hecho. Lo único que se afirma. -->
    <InvSection
      alt
      :title="L.measured"
    >
      <div class="inv-prose">
        <p>{{ text.measured }}</p>
      </div>

      <ChartBlock
        :title="L.facts"
        :level="3"
      >
        <InvLedger
          :columns="factColumns"
          :rows="note.facts"
          row-key="label"
          :min-width="640"
        />
      </ChartBlock>

      <p class="dia-repro">
        <span>{{ L.reproduce }}:</span>
        <code>{{ note.reproduce }}</code>
      </p>
    </InvSection>

    <InvSection :title="L.context">
      <div class="inv-prose">
        <p>{{ text.contexto }}</p>
      </div>

      <InvActions
        v-if="note.ocids?.length || note.query"
        :items="[{ label: L.explore, to: exploreHref }]"
      />
    </InvSection>

    <!-- 2. La norma. Nombrarla NO es acusar de violarla. -->
    <InvSection
      alt
      :title="L.norm"
    >
      <InvFinding
        :body="[text.norm]"
        :law="text.normCite"
      />
    </InvSection>

    <!-- 3. Lo que falta. Mismo peso visual que el hecho: es lo que impide leer esto como condena. -->
    <InvSection :title="L.missing">
      <div class="inv-prose dia-missing">
        <p>{{ text.missing }}</p>
      </div>
    </InvSection>

    <!-- 4. El destinatario. Un hallazgo sin destinatario es un chisme. -->
    <InvSection
      alt
      :title="L.answers"
    >
      <div class="inv-prose">
        <p>{{ text.answers }}</p>
      </div>
    </InvSection>

    <InvSection
      v-if="note.sources?.length"
      :title="L.sources"
    >
      <InvSources :items="note.sources.map((s: any) => ({ outlet: s.outlet, title: s.title, url: s.url, date: s.date }))" />
    </InvSection>

    <InvSection>
      <LeakTip
        :subject="text.title"
        :path="`/investigaciones/diario/${note.slug}`"
        :facts="[text.measured]"
      />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
.dia-repro {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-2);
  margin: var(--s-4) 0 0;
  font-size: .82rem;
  color: var(--muted);
}

.dia-repro code {
  padding: 2px var(--s-2);
  border: 1px solid var(--rule);
  border-radius: 4px;
  font-size: .78rem;
  overflow-wrap: anywhere;
}

/* El bloque que más se va a querer achicar. No se achica. */
.dia-missing {
  padding-left: var(--s-4);
  border-left: 3px solid var(--gold);
}
</style>
