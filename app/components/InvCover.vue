<script setup lang="ts">
/**
 * The ink band an investigation opens on: file line, kicker, headline, dek and
 * the chips that state the piece's scope before a word of it is read.
 *
 * Eleven pages hand-wrote this same header, and the file line was where they
 * drifted worst: every one of them typed its field labels — EXPEDIENTE, INCISO,
 * PERÍODO, ORGANISMO, ALCANCE — as literal Spanish inside a bilingual page, so
 * the English reader got the Spanish label. Labels are text parameters here
 * (`t('inv.file.*')`) and the uppercase is styling, not content.
 *
 *   <InvCover
 *     :fields="[
 *       { label: t('inv.file.expediente'), value: c.file.org },
 *       { value: c.file.inciso },
 *       { label: t('inv.file.periodo'), value: c.file.period },
 *       { value: c.common.source },
 *     ]"
 *     :kicker="c.kicker"
 *     :title="c.title"
 *     :dek="c.dek"
 *     :chips="c.chips"
 *   />
 *
 * `--ink` does not flip in dark mode, so everything inside is painted from the
 * cover's own fixed foreground pair, never from `--text`.
 */
withDefaults(defineProps<{
  /** The file line. A field with no `label` is a free-standing note (the source line). */
  fields?: { label?: string, value: string }[]
  kicker?: string
  /** Gold kicker for a piece about money; celeste for a neutral record. */
  tone?: 'sol' | 'celeste'
  title: string
  dek?: string
  chips?: readonly string[]
}>(), {
  tone: 'sol',
})
</script>

<template>
  <header class="inv-cover">
    <div class="u-container">
      <div
        v-if="fields?.length"
        class="inv-file"
      >
        <span
          v-for="(f, i) in fields"
          :key="i"
          class="inv-file__f"
        >
          <template v-if="f.label">
            <span class="inv-file__k">{{ f.label }}</span>
            <b>{{ f.value }}</b>
          </template>
          <template v-else>{{ f.value }}</template>
        </span>
      </div>

      <p
        v-if="kicker"
        class="inv-kicker"
        :class="{ 'inv-kicker--celeste': tone === 'celeste' }"
      >
        {{ kicker }}
      </p>

      <h1>{{ title }}</h1>

      <p
        v-if="dek || $slots.dek"
        class="inv-dek"
      >
        <slot name="dek">
          {{ dek }}
        </slot>
      </p>

      <div
        v-if="chips?.length"
        class="inv-chips"
      >
        <span
          v-for="ch in chips"
          :key="ch"
          class="inv-chip"
        >{{ ch }}</span>
      </div>

      <slot />
    </div>
  </header>
</template>

<style scoped>
/* Label and value are one baseline pair. The gap is CSS, not an `&nbsp;` in the
   markup: Vue condenses the newline between two sibling tags, so a hand-written
   space between the label and its value disappears. */
.inv-file__f {
  display: inline-flex;
  align-items: baseline;
  gap: 0.7ch;
  min-width: 0;
}

.inv-file__k {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
</style>
