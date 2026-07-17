<script setup lang="ts">
/**
 * The mark is the magnitude rule itself: three gold bars of growing
 * length, the same scale that sits under every amount on the site.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    class="brandmark"
    aria-hidden="true"
    focusable="false"
  >
    <rect
      width="32"
      height="32"
      rx="6"
      class="brandmark__field"
    />
    <rect
      x="6"
      y="8.5"
      width="8"
      height="3"
      rx="1.5"
      class="brandmark__rule"
    />
    <rect
      x="6"
      y="14.5"
      width="14"
      height="3"
      rx="1.5"
      class="brandmark__rule"
    />
    <rect
      x="6"
      y="20.5"
      width="20"
      height="3"
      rx="1.5"
      class="brandmark__rule"
    />
  </svg>
</template>

<style scoped>
.brandmark {
  display: block;
  flex: none;
}

.brandmark__field {
  fill: var(--ink);
}

.brandmark__rule {
  fill: var(--sol);
}

/* On ink surfaces the field would vanish; invert it to paper. */
:global([data-theme="dark"]) .brandmark__field,
:global(.v-theme--contribuyenteDark) .brandmark__field {
  fill: #071019;
}
</style>
