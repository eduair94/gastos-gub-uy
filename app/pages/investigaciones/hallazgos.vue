<script setup lang="ts">
/**
 * Hallazgos propios — lo que salió de medir el corpus y no estaba en ninguna crónica.
 *
 * La ficha de cada hallazgo tiene cuatro campos en un orden que no es decorativo: primero lo
 * medido (lo único que afirmamos), después la norma que pondría en juego, después qué falta
 * para poder afirmarlo, y recién al final quién tiene que responder. Si el campo "qué falta"
 * se cae de la página, la página pasa a decir algo que no podemos sostener.
 */
import { invContent } from '~/data/investigaciones'
import { FINDINGS, HALLAZGOS_SOURCES, findingText, hallazgosContent } from '~/data/investigaciones-hallazgos'

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => invContent(locale.value))
const cx = computed(() => hallazgosContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: cx.value.title },
])

useSeo(() => ({
  title: cx.value.title,
  description: cx.value.dek.slice(0, 155),
  path: '/investigaciones/hallazgos',
  type: 'article',
  kicker: 'Investigación',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': cx.value.title,
      'description': cx.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
    },
    breadcrumbLd,
  ],
}))

/** Cada ficha trae sus dos idiomas adentro, así que sumar una tanda es un append al array. */
const findings = computed(() => FINDINGS.map(f => ({ ...f, copy: findingText(f, locale.value) })))

const sourceGroups = computed(() => HALLAZGOS_SOURCES.map(g => ({
  title: g.key === 'norma' ? cx.value.srcNorma : cx.value.srcDonde,
  items: g.items,
})))

const leakFacts = computed(() => findings.value.map(f => f.copy.title))
</script>

<template>
  <div class="inv">
    <InvCover
      tone="celeste"
      :fields="[
        { label: t('inv.file.alcance'), value: cx.fileScope.replace('{n}', String(FINDINGS.length)) },
        { label: t('inv.file.periodo'), value: cx.filePeriod },
        { value: cx.fileSource },
      ]"
      :kicker="cx.kicker"
      :title="cx.title"
      :dek="cx.dek"
      :chips="cx.chips"
    />

    <!-- Las reglas, antes que los hallazgos: son las que hacen legible lo que sigue. -->
    <InvSection
      alt
      :eyebrow="cx.reglasTag"
      :title="cx.reglasTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.reglas"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- Un hallazgo por sección: cada uno se lee entero sin competir con el siguiente. -->
    <InvSection
      v-for="(f, i) in findings"
      :key="f.key"
      :alt="i % 2 === 1"
      :eyebrow="`${i + 1} / ${findings.length}`"
      :title="f.copy.title"
    >
      <dl class="hz">
        <div class="hz__row">
          <dt>{{ cx.colMeasured }}</dt>
          <dd>{{ f.copy.measured }}</dd>
        </div>
        <div class="hz__row">
          <dt>{{ cx.colNorm }}</dt>
          <dd>
            <blockquote class="hz__norm">
              {{ f.copy.norm }}
            </blockquote>
            <p class="hz__cite">
              {{ f.copy.normCite }}
            </p>
          </dd>
        </div>
        <div class="hz__row hz__row--missing">
          <dt>{{ cx.colMissing }}</dt>
          <dd>{{ f.copy.missing }}</dd>
        </div>
        <div class="hz__row">
          <dt>{{ cx.colAnswers }}</dt>
          <dd>{{ f.copy.answers }}</dd>
        </div>
      </dl>

      <p class="hz__foot">
        <NuxtLink
          v-if="f.path"
          :to="localePath(f.path)"
        >
          {{ cx.readMore }} →
        </NuxtLink>
        <span class="hz__repro u-mono">{{ cx.measuredOnLabel }} {{ f.measuredOn }} · {{ cx.reproduceLabel }}: <code>{{ f.reproduce }}</code></span>
      </p>
    </InvSection>

    <!-- Uruguay Leaks -->
    <InvSection alt>
      <LeakTip
        :subject="cx.leakTitle"
        path="/investigaciones/hallazgos"
        :facts="leakFacts"
      />
    </InvSection>

    <InvSection
      :eyebrow="cx.sourcesTag"
      :title="cx.sourcesTitle"
      :dek="cx.sourcesP"
    >
      <InvSources :groups="sourceGroups" />
    </InvSection>

    <InvSection alt>
      <InvDisclaimer
        :title="c.common.disclaimerTitle"
        :paragraphs="c.common.disclaimer"
      />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
/* La ficha es una lista de definiciones y no una tabla: cada campo es una respuesta a una
   pregunta, no una celda comparable con la de al lado. */
.hz {
  margin: 0;
  display: grid;
  gap: var(--s-5);
  max-width: 78ch;
}

.hz__row dt {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: var(--s-2);
}

.hz__row dd {
  margin: 0;
  font-size: 1rem;
  line-height: 1.6;
  max-width: 72ch;
}

/* "Qué falta" no puede leerse como una nota al pie: es la condición de honestidad de la
   ficha, y va con el mismo peso visual que el hallazgo. */
.hz__row--missing dd {
  border-left: 1px solid var(--celeste);
  padding-left: var(--s-4);
}

.hz__norm {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  line-height: 1.6;
  background: var(--surface-sunken);
  border-radius: var(--r-md);
  padding: var(--s-4);
}

.hz__cite {
  margin: var(--s-2) 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.hz__foot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-5);
  align-items: baseline;
  margin: var(--s-6) 0 0;
  font-size: 0.85rem;
}

.hz__repro {
  color: var(--text-muted);
  font-size: 0.74rem;
}

.hz__repro code {
  font-family: inherit;
  word-break: break-word;
}
</style>
