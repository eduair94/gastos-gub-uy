<script setup lang="ts">
/**
 * Prosa a su medida, y el resto del ancho usado en vez de vacío.
 *
 * EL PROBLEMA QUE RESUELVE, medido el 2026-08-16 en /investigaciones/sunca a 1512px: el contenedor
 * de sección mide 1400px, las tiles y las tablas ocupan 1336px y la prosa 598px. Quedaban 802px
 * vacíos, el 57,3% de la banda.
 *
 * LO QUE NO SE TOCA: la medida de lectura. `--inv-measure` rinde 74 caracteres por línea, el techo
 * de la banda 45-75 que fija app/DESIGN.md. Ensanchar la columna de texto arregla el hueco y rompe
 * la lectura. El hueco se llena con contenido, no estirando el párrafo.
 *
 *   <InvSplit>
 *     <p>…</p>
 *     <template #aside> …cifras, cronograma, fuentes de la sección… </template>
 *   </InvSplit>
 *
 * Sin slot `aside` el componente no hace nada: una sola pista, igual que hoy. Eso permite adoptarlo
 * página por página sin tocar las que todavía no tienen carril escrito.
 *
 * MÓVIL: una sola columna y el carril DEBAJO de la prosa. El carril es evidencia de apoyo, así que
 * nunca se lee antes que el texto que lo explica.
 */
withDefaults(defineProps<{
  /** Lado del carril. `end` (derecha) salvo que la sección necesite el espejo. */
  side?: 'end' | 'start'
  /**
   * El carril queda fijo mientras la prosa pasa al lado. Prendelo sólo si el carril es MÁS CORTO
   * que la prosa: al revés, la prosa termina y el carril sigue empujando la sección.
   */
  sticky?: boolean
}>(), {
  side: 'end',
  sticky: false,
})
</script>

<template>
  <div
    class="inv-split"
    :class="[`inv-split--${side}`, { 'inv-split--sticky': sticky }]"
  >
    <div class="inv-split__main">
      <slot />
    </div>
    <aside
      v-if="$slots.aside"
      class="inv-split__aside"
    >
      <slot name="aside" />
    </aside>
  </div>
</template>

<style scoped lang="scss">
.inv-split {
  display: grid;
  gap: var(--s-6);
  align-items: start;
}

.inv-split__main,
.inv-split__aside { min-width: 0; }

/* 1100px = la medida (41rem) + un carril legible (~21rem) + el gap. Por debajo, el carril quedaría
   más angosto que una tarjeta y conviene apilarlo. */
@media (min-width: 1100px) {
  .inv-split {
    grid-template-columns: minmax(0, var(--inv-measure)) minmax(0, 1fr);
    gap: var(--s-7);
  }

  /* El espejo. `order` y no reordenar el marcado: el orden del DOM manda para lectores de pantalla
     y para el móvil, donde la prosa siempre va primero. */
  .inv-split--start {
    grid-template-columns: minmax(0, 1fr) minmax(0, var(--inv-measure));
  }

  .inv-split--start .inv-split__main { order: 2; }
  .inv-split--start .inv-split__aside { order: 1; }

  .inv-split--sticky .inv-split__aside {
    position: sticky;
    top: var(--s-7);
  }
}
</style>
