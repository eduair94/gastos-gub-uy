<script setup lang="ts">
/**
 * The row of buttons that sends the reader from an investigation into the live
 * explorer.
 *
 * Four pages carried their own copy of this, and two of them also carried the
 * same `:deep(.v-btn)` override — a Vuetify button keeps its label on one line
 * and simply overflows the viewport, and these labels are full sentences
 * ("Ver la lista completa de términos, las exclusiones y los descartes"). The
 * override belongs to the row, not to each page that happens to hit it.
 *
 *   <InvActions>
 *     <v-btn :to="…" color="primary" variant="flat" class="text-none">…</v-btn>
 *     <v-btn :to="…" variant="outlined" class="text-none">…</v-btn>
 *   </InvActions>
 */
</script>

<template>
  <div class="invact">
    <slot />
  </div>
</template>

<style scoped>
.invact {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
}

/* Let a sentence-length label wrap and grow the button instead of pushing the
   document sideways. */
.invact :deep(.v-btn) {
  height: auto;
  min-height: 40px;
  max-width: 100%;
  padding-block: var(--s-2);
}

.invact :deep(.v-btn__content) {
  white-space: normal;
  text-align: left;
}

@media (max-width: 640px) {
  /* One column of full-width actions reads better than two ragged blocks. */
  .invact {
    display: grid;
    gap: var(--s-2);
  }
}
</style>
