<script setup lang="ts">
/**
 * La banda de cifras que abre una página, debajo del hero.
 *
 * Existía copiada en ocho páginas con tres nombres distintos —`.stats/.stat`,
 * `.kpis/.kpi`, `.facts/.fact`— y en las ocho con el mismo defecto: la banda
 * MONTABA sobre el hero con `margin-top: calc(var(--s-6) * -1)` y el cuerpo abría
 * con `padding-block: var(--s-6)`, así que los dos se anulaban. Resultado: las
 * tarjetas arrancaban exactamente en el borde del hero, sin aire arriba.
 *
 * En tema claro el solape se leía como una decisión, porque el papel y la tinta
 * contrastan. En tema oscuro no: `--ink` y `--surface` quedan a 1.07:1, la tarjeta
 * y el hero son casi el mismo tono y lo único que se ve es un rectángulo pegado al
 * borde. Un solape que sólo funciona en un tema no es un solape, es un accidente.
 *
 * Por eso acá la banda NO monta. Deja su propio aire arriba, igual en los dos
 * temas, y el hairline `--rule-strong` le da un borde que sobrevive al tema oscuro
 * — donde `--rule` sobre `--bg` casi desaparece.
 *
 * El componente ocupa el ancho de su contenedor, así que va DENTRO del
 * `.u-container` de la página y nunca trae su propio gutter.
 *
 * Uso:
 *
 *   <StatBand :items="[{ value: '34', label: 'canales verificados' }]" />
 *   <StatBand :items="rows" :columns="3" />
 *   <StatBand :items="rows">
 *     <template #value="{ item }">
 *       <MoneyAmount :amount="item.raw" />
 *     </template>
 *   </StatBand>
 *
 * `to` convierte la tarjeta en enlace y le da su estado hover. Los montos siguen
 * pasando por `<MoneyAmount>` a través del slot: acá no se formatea plata.
 *
 * El slot `after` cierra la banda a lo ancho, para lo que ANOTA a todas las cifras
 * —una cifra de prensa, una advertencia de cobertura— y no es una cifra más.
 */
export interface StatBandItem {
  /** El número o la fecha, ya formateado. El slot `value` lo puede reemplazar. */
  value?: string | number | null
  /** Qué mide esa cifra. Va debajo, siempre. */
  label: string
  /** Segunda línea opcional: la fuente, la fecha o el matiz. */
  hint?: string
  /** Convierte la tarjeta en enlace interno. */
  to?: string
  /** Clave para el `v-for`. Si falta, se usa el label. */
  key?: string
  /**
   * Monto crudo, para que el slot lo pase a `<MoneyAmount>`. El componente NUNCA
   * lo formatea ni lo pinta: la regla del oro vive en `<MoneyAmount>` y en ningún
   * otro lado.
   */
  money?: number | null
}

withDefaults(defineProps<{
  items: StatBandItem[]
  /**
   * Columnas en pantalla ancha. Abajo de 900px la grilla se acomoda sola, y en
   * teléfono cae a una sola columna: tres cifras apiladas se leen; tres cifras
   * de 100px de ancho, no.
   */
  columns?: 2 | 3 | 4
}>(), {
  columns: 3,
})
</script>

<template>
  <div
    class="statband"
    :style="{ '--statband-cols': columns }"
  >
    <component
      :is="item.to ? resolveComponent('NuxtLink') : 'div'"
      v-for="(item, i) in items"
      :key="item.key ?? item.label ?? i"
      :to="item.to"
      class="statband__card"
      :class="{ 'statband__card--link': item.to }"
    >
      <span class="statband__value">
        <slot
          name="value"
          :item="item"
          :index="i"
        >{{ item.value ?? '—' }}</slot>
      </span>
      <span class="statband__label">{{ item.label }}</span>
      <span
        v-if="item.hint"
        class="statband__hint"
      >{{ item.hint }}</span>
    </component>
    <!-- Una nota que anota a TODAS las cifras, no una cifra más: ocupa la fila
         entera para que no se lea como la siguiente tarjeta. -->
    <div
      v-if="$slots.after"
      class="statband__after"
    >
      <slot name="after" />
    </div>
  </div>
</template>

<style scoped>
.statband {
  display: grid;
  grid-template-columns: repeat(var(--statband-cols, 3), minmax(0, 1fr));
  gap: var(--s-4);
  /* El aire que el solape negativo se comía. Es lo único que separa la banda del
     hero, así que vive acá y no en la página. */
  margin-top: var(--s-6);
}

.statband__card {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  /* `--rule` sobre `--bg` casi desaparece en tema oscuro; este borde es lo que
     separa la tarjeta del fondo cuando no hay contraste de superficie. */
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  color: inherit;
  text-decoration: none;
}

.statband__card--link {
  transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease);
}

.statband__card--link:hover {
  border-color: var(--celeste);
  transform: translateY(-2px);
}

.statband__value {
  font-family: var(--font-display);
  font-size: var(--t-2xl);
  font-weight: 700;
  font-stretch: 112%;
  line-height: 1;
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}

.statband__label {
  font-size: var(--t-sm);
  line-height: 1.35;
  color: var(--text-muted);
}

.statband__hint {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.statband__after { grid-column: 1 / -1; }

@media (prefers-reduced-motion: reduce) {
  .statband__card--link { transition: none; }
  .statband__card--link:hover { transform: none; }
}

/* Cuatro columnas no entran en una tablet; dos sí. */
@media (max-width: 900px) {
  .statband { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 600px) {
  .statband {
    grid-template-columns: minmax(0, 1fr);
    margin-top: var(--s-5);
  }
}
</style>
