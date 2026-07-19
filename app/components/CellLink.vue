<script setup lang="ts">
/**
 * CellLink — the canonical table-cell action link ("Ver contratos →").
 *
 * One home for the row-level "go here" affordance so every table shares the
 * same size, colour and — the reason this exists — a trailing arrow that is
 * optically centred on the label at every zoom level and DPR.
 *
 * Why a component and not a bare <v-btn append-icon>: Vuetify centres the icon
 * box on the button's flex line, but the default trailing-icon box is a
 * fractional height (~15.43px in a small button), so at non-integer browser
 * zoom / DPR the glyph lands on a half device-pixel and paints ~1px off the
 * text. The `.cell-link` rules in main.scss pin the glyph to an integer box
 * the height of the 12px label's line box, which removes that drift. Applied
 * here once, every table gets it for free — replaces the old per-page
 * `.text-none` / `.cell-go` copies.
 */
withDefaults(defineProps<{
  /** Destination route (localePath'd by the caller). */
  to: string
  /** Label text. Omit and use the default slot for custom content. */
  label?: string
  /** Non-navigable state — e.g. a row with nothing to drill into. */
  disabled?: boolean
  /** Trailing glyph. Defaults to the standard forward arrow. */
  icon?: string
}>(), {
  icon: 'mdi-arrow-right',
})
</script>

<template>
  <v-btn
    :to="to"
    :disabled="disabled"
    :append-icon="icon"
    class="cell-link"
    variant="text"
    size="small"
    color="primary"
  >
    <slot>{{ label }}</slot>
  </v-btn>
</template>
