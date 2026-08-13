<script setup lang="ts">
/**
 * A record list where the identity grows and the figure stays put: name, a line
 * of context under it, and the number on the right.
 *
 * `gasto-en-genero` called it `.gen-rows` and `mensajes-del-estado` called it
 * `.msg-rows`; they are the same forty lines of CSS with two prefixes, used
 * four times between them for open calls, parties, suppliers and layers.
 *
 *   <InvRows :items="s.byParty" item-key="party">
 *     <template #fig="{ item }">
 *       <b class="u-mono">{{ item.weightedShareBp.toFixed(1) }}</b><span>{{ c.per10k }}</span>
 *     </template>
 *   </InvRows>
 *
 * On a phone the figure sits under the identity rather than being squeezed to a
 * second line beside it.
 */
const props = defineProps<{
  items: readonly any[]
  /** Row identity: a field name, or a function for composite keys. */
  itemKey: string | ((item: any, index: number) => string | number)
  /** Field holding the row's name. */
  nameKey?: string
  /** Field holding the context line under the name. */
  metaKey?: string
  /** Field holding the row's internal route — makes the name a link. */
  toKey?: string
  /** Drop the leading section beat, for a list nested under its own heading. */
  flush?: boolean
}>()

function keyFor(item: any, i: number) {
  return typeof props.itemKey === 'function' ? props.itemKey(item, i) : item[props.itemKey]
}
</script>

<template>
  <ul
    class="invrows"
    :class="{ 'invrows--flush': flush }"
  >
    <li
      v-for="(item, i) in items"
      :key="keyFor(item, i)"
    >
      <div class="invrows__id">
        <slot
          name="name"
          :item="item"
        >
          <NuxtLink
            v-if="toKey && item[toKey]"
            class="invrows__name"
            :to="item[toKey]"
          >
            {{ nameKey ? item[nameKey] : '' }}
          </NuxtLink>
          <span
            v-else
            class="invrows__name"
          >{{ nameKey ? item[nameKey] : '' }}</span>
        </slot>
        <span
          v-if="metaKey && item[metaKey]"
          class="invrows__meta"
        >{{ item[metaKey] }}</span>
        <slot
          name="meta"
          :item="item"
        />
      </div>
      <p class="invrows__fig">
        <slot
          name="fig"
          :item="item"
        />
      </p>
    </li>
  </ul>
</template>

<style scoped>
.invrows {
  list-style: none;
  margin: var(--s-6) 0 0;
  padding: 0;
  display: grid;
  gap: var(--s-3);
}

.invrows--flush { margin-top: 0; }

.invrows li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-2) var(--s-5);
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

/* On the tinted band the row keeps its contrast by dropping to the page floor. */
.inv-sec--alt .invrows li { background: var(--bg); }

.invrows__id {
  flex: 1 1 18rem;
  min-width: 0;
  display: grid;
  gap: var(--s-1);
}

/* `:deep` so a caller's `#name` slot gets the same treatment as the default. */
.invrows :deep(.invrows__name) {
  font-size: 1.02rem;
  font-weight: 600;
  overflow-wrap: anywhere;
  color: var(--celeste-deep);
  text-decoration: none;
}

/* A plain span row is not a link and must not read as one. */
.invrows :deep(span.invrows__name) { color: var(--text); }
.invrows :deep(a.invrows__name:hover) { text-decoration: underline; }

.invrows__meta {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.invrows__fig {
  display: flex;
  align-items: baseline;
  gap: var(--s-2);
  margin: 0;
  white-space: nowrap;
}

/* Figure typography is opt-in, not automatic: the slot often holds a
   `<MoneyAmount>`, and a blanket rule on `span` would repaint the gold figure
   as muted 0.8rem text. */
.invrows__fig :deep(.invrows__n) {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.invrows__fig :deep(.invrows__u) {
  font-size: 0.8rem;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .invrows li {
    padding: var(--s-3) var(--s-4);
    /* Stacked: the figure is the row's answer, so it sits under the identity. */
    align-items: flex-start;
  }

  .invrows__fig { margin-top: var(--s-1); }
}
</style>
