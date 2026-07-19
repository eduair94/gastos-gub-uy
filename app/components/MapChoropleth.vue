<script setup lang="ts">
/**
 * MapChoropleth — a generic, apolitical SVG choropleth of Uruguay's 19 departments.
 *
 * Receives geometry (buyer.id → SVG path) and a `colorFor(id)` callback; it knows
 * nothing about parties or metrics — the page decides the fill. Fully offline (no map
 * tiles, no external fetch), SSR-safe, theme-aware, and keyboard-accessible.
 *
 * Emits `hover(id|null)` and `select(id)`; the page renders the tooltip/detail panel
 * beside it, so positioning stays simple and the map is a pure paint surface.
 */
const props = withDefaults(defineProps<{
  paths: Record<string, string>
  viewBox: string
  colorFor: (id: string) => string
  labelFor?: (id: string) => string
  activeId?: string | null
  ariaLabel?: string
}>(), {
  labelFor: undefined,
  activeId: null,
  ariaLabel: 'Mapa de departamentos',
})

const emit = defineEmits<{
  (e: 'hover', id: string | null): void
  (e: 'select', id: string): void
}>()

const ids = computed(() => Object.keys(props.paths))
const label = (id: string) => (props.labelFor ? props.labelFor(id) : id)
</script>

<template>
  <svg
    :viewBox="viewBox"
    class="choro"
    role="group"
    :aria-label="ariaLabel"
    preserveAspectRatio="xMidYMid meet"
  >
    <path
      v-for="id in ids"
      :key="id"
      :d="paths[id]"
      class="choro__dept"
      :class="{ 'choro__dept--active': id === activeId, 'choro__dept--dim': activeId && id !== activeId }"
      :fill="colorFor(id)"
      tabindex="0"
      role="button"
      :aria-label="label(id)"
      @mouseenter="emit('hover', id)"
      @mouseleave="emit('hover', null)"
      @focus="emit('hover', id)"
      @blur="emit('hover', null)"
      @click="emit('select', id)"
      @keydown.enter.prevent="emit('select', id)"
      @keydown.space.prevent="emit('select', id)"
    >
      <title>{{ label(id) }}</title>
    </path>
  </svg>
</template>

<style scoped>
.choro {
  width: 100%;
  height: auto;
  display: block;
  max-height: 620px;
}
.choro__dept {
  stroke: var(--surface, #fff);
  stroke-width: 1.1;
  stroke-linejoin: round;
  cursor: pointer;
  transition: opacity var(--dur, 0.15s) var(--ease, ease), stroke-width var(--dur, 0.15s) var(--ease, ease);
  outline: none;
}
.choro__dept:hover,
.choro__dept--active {
  stroke: var(--ink, #10222e);
  stroke-width: 2;
}
.choro__dept:focus-visible {
  stroke: var(--celeste-deep, #0a6);
  stroke-width: 2.5;
}
.choro__dept--dim { opacity: 0.55; }
</style>
