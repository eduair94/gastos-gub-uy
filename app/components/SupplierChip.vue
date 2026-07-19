<script setup lang="ts">
/**
 * A small AI-derived category pill for a supplier ("TV", "Agencia", "Organismo").
 * Fed by supplier_enrichment via the endpoints; renders nothing when there is no
 * category. It is advisory AI context — pages that use it carry the "generado por
 * IA" note nearby.
 */
defineProps<{ category?: string | null }>()
const { t } = useI18n()
</script>

<template>
  <span
    v-if="category"
    :class="['schip', `schip--${category}`]"
    :title="t('sup.aiTitle')"
  >{{ t(`sup.cat.${category}`) }}</span>
</template>

<style scoped>
.schip {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--s-2);
  border-radius: var(--r-full);
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  white-space: nowrap;
}

.schip--medio-tv,
.schip--medio-radio,
.schip--medio-prensa,
.schip--medio-digital,
.schip--medio-via-publica {
  color: var(--celeste-deep);
  background: var(--celeste-wash);
  border-color: color-mix(in srgb, var(--celeste) 40%, transparent);
}

.schip--agencia-publicidad,
.schip--productora {
  color: var(--verde);
  background: color-mix(in srgb, var(--verde) 10%, transparent);
  border-color: color-mix(in srgb, var(--verde) 34%, transparent);
}

.schip--organismo-publico {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--ink) 8%, transparent);
  border-color: var(--rule-strong);
}
</style>
