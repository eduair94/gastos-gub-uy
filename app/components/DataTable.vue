<script setup lang="ts" generic="T extends Record<string, any>">
/**
 * The one responsive table.
 *
 * Every list on the site used to be a hand-styled `<table>` plus a shared
 * global `.dtable` rule that reflowed it into cards on mobile via
 * `::before attr()` and cascade overrides. That pattern broke in a new
 * way on almost every page it touched — labels overlapping values,
 * numeric columns misaligning, whole cells vanishing — because it fought
 * page-level rules it couldn't see (`.ctable { max-width }`,
 * `.itable__num { text-align: right }`).
 *
 * This component ends that. It renders ONE semantic table for
 * accessibility and SSR, and reflows to cards below the breakpoint using
 * only its own scoped CSS and REAL label elements — never `attr()`,
 * never inherited page rules. A column is declared once; desktop header
 * cells and mobile inline labels both read from it, so they can never
 * disagree. Cell content comes from `#cell:<key>` slots, so a money
 * figure or a link renders identically in table and card form.
 *
 * Because all layout lives here, a distribution bug can only ever exist
 * in one place — and once fixed, it is fixed for every table.
 */
export interface DataColumn {
  /** Field key; also the slot name (`#cell:<key>`). */
  key: string
  /** Header text and mobile inline label. */
  label: string
  /** Column alignment on the desktop table. Cards are always left-read. */
  align?: 'start' | 'end'
  /** The card's headline cell on mobile: full width, no label, on top. One per table. */
  primary?: boolean
  /** Tabular monospace (ids, dates, counts). */
  mono?: boolean
  /** Hide this column's mobile label (e.g. when the value is self-evident). */
  hideLabel?: boolean
  /** Desktop column width hint. */
  width?: string
  /** Extra class on the cell. */
  cellClass?: string
}

const props = withDefaults(defineProps<{
  columns: DataColumn<T>[]
  rows: T[]
  /** Stable key per row. */
  rowKey: (row: T, index: number) => string | number
  /** Makes the whole row a link to this target. */
  rowTo?: (row: T) => string | undefined
  /** Extra class per row (e.g. severity tint). */
  rowClass?: (row: T) => string | undefined
  /** Min desktop width before the table scrolls horizontally in its own box. */
  minWidth?: string
  /**
   * Whether the table draws its own frame (border + radius + surface).
   * Default true: the table is its own card. Set false when it lives
   * inside a `.panel` — the panel is then the single frame, and the
   * table aligns its cell inset to the panel's `--s-5` so columns line
   * up with the panel head. Avoids the "box inside a box" double border.
   */
  framed?: boolean
}>(), {
  minWidth: '640px',
  framed: true,
})

const primaryKey = computed(() => props.columns.find(c => c.primary)?.key ?? props.columns[0]?.key)
const secondary = computed(() => props.columns.filter(c => c.key !== primaryKey.value))
const primaryCol = computed(() => props.columns.find(c => c.key === primaryKey.value))

// A row link is a NuxtLink for SPA navigation, resolved once — a string
// `:is="'NuxtLink'"` renders a dead <nuxtlink> element with no href.
const NuxtLinkC = resolveComponent('NuxtLink')

function rowComponent(row: T) {
  return props.rowTo?.(row) ? NuxtLinkC : 'tr'
}
</script>

<template>
  <div
    class="dt"
    :class="{ 'dt--bare': !framed }"
  >
    <!-- One table, scrolling inside its own box on desktop so a wide row
         can never push the page body sideways. -->
    <div class="dt__scroll">
      <table
        class="dt__table"
        :style="{ '--dt-min': minWidth }"
      >
        <thead class="dt__thead">
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              scope="col"
              class="dt__th"
              :class="[col.align === 'end' && 'dt__th--end', col.cellClass]"
              :style="col.width ? { width: col.width } : undefined"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <component
            :is="rowComponent(row)"
            v-for="(row, i) in rows"
            :key="rowKey(row, i)"
            :to="rowTo?.(row)"
            class="dt__row"
            :class="rowClass?.(row)"
          >
            <!-- Primary cell: card headline on mobile (full width, no label). -->
            <td
              class="dt__td dt__td--primary"
              :class="[primaryCol?.align === 'end' && 'dt__td--end', primaryCol?.mono && 'u-mono', primaryCol?.cellClass]"
            >
              <slot
                :name="`cell:${primaryKey}`"
                :row="row"
                :value="row[primaryKey]"
              >
                {{ row[primaryKey] }}
              </slot>
            </td>

            <td
              v-for="col in secondary"
              :key="col.key"
              class="dt__td"
              :class="[col.align === 'end' && 'dt__td--end', col.mono && 'u-mono', col.cellClass]"
            >
              <!-- Real label element (not ::before): shown only in card
                   mode, so a page rule can never restyle it away. -->
              <span
                v-if="!col.hideLabel"
                class="dt__label"
                aria-hidden="true"
              >{{ col.label }}</span>
              <span class="dt__value">
                <slot
                  :name="`cell:${col.key}`"
                  :row="row"
                  :value="row[col.key]"
                >
                  {{ row[col.key] }}
                </slot>
              </span>
            </td>
          </component>
        </tbody>
        <tfoot
          v-if="$slots.foot"
          class="dt__tfoot"
        >
          <slot name="foot" />
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.dt {
  width: 100%;
}

/* ---- Desktop: a real table ---- */
.dt__scroll {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.dt__table {
  width: 100%;
  min-width: var(--dt-min);
  border-collapse: collapse;
}

.dt__th {
  padding: var(--s-3) var(--s-4);
  text-align: left;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  white-space: nowrap;
  border-bottom: 1px solid var(--rule);
}

.dt__th--end { text-align: right; }

.dt__row {
  color: inherit;
  text-decoration: none;
}

/* A whole-row link still lays out as a table row. */
a.dt__row {
  display: table-row;
}

.dt__td {
  padding: var(--s-3) var(--s-4);
  font-size: var(--t-sm);
  vertical-align: top;
  border-bottom: 1px solid var(--rule);
}

.dt__row:last-child .dt__td { border-bottom: 0; }
tbody .dt__row:hover .dt__td { background: var(--surface-sunken); }

.dt__td--end { text-align: right; }
.dt__td--end .dt__value { justify-content: flex-end; }

/* The inline label is desktop-invisible; the <thead> carries headers. */
.dt__label { display: none; }
.dt__value { display: block; }

.dt__tfoot td {
  padding: var(--s-3) var(--s-4);
  border-top: 2px solid var(--rule-strong);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* ---- Mobile: each row becomes a card ---- */
@media (max-width: 760px) {
  /* The scroll box stops being a surface — the cards are the surfaces. */
  .dt__scroll {
    overflow-x: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .dt__table {
    min-width: 0;
    display: block;
  }

  .dt__thead {
    /* Visually hidden, still read by assistive tech via the table semantics. */
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .dt__table tbody {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .dt__row,
  a.dt__row {
    display: block;
    padding: var(--s-4);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-1);
  }

  a.dt__row:active { border-color: var(--celeste); }

  .dt__td {
    display: block;
    padding: 0;
    border: 0 !important;
    text-align: left !important;
  }

  tbody .dt__row:hover .dt__td { background: transparent; }

  /* Headline of the card. */
  .dt__td--primary {
    margin-bottom: var(--s-3);
    padding-bottom: var(--s-3);
    border-bottom: 1px solid var(--rule) !important;
    font-weight: 600;
  }

  /* Every other cell: label above value, both left-read, full width. */
  .dt__td:not(.dt__td--primary) {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--s-2) 0;
  }

  .dt__td:not(.dt__td--primary) + .dt__td:not(.dt__td--primary) {
    border-top: 1px solid color-mix(in srgb, var(--rule) 55%, transparent) !important;
  }

  .dt__label {
    display: block;
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    line-height: 1.3;
  }

  .dt__value {
    display: block;
    text-align: left;
    font-size: var(--t-sm);
  }

  .dt__td--end .dt__value { justify-content: flex-start; }

  .dt__tfoot { display: block; }

  .dt__tfoot td {
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    border-top: 0;
    background: var(--surface-sunken);
    border-radius: var(--r-lg);
  }
}

/* ---- Unframed: the parent .panel is the single frame ---- */
.dt--bare .dt__scroll {
  border: 0;
  border-radius: 0;
  background: transparent;
}

@media (min-width: 761px) {
  /* Line the columns up with the panel's s-5 head/foot inset rather
     than the table's own s-4. Desktop only — mobile cards reset cell
     padding to 0 and must stay that way. */
  .dt--bare .dt__th,
  .dt--bare .dt__td,
  .dt--bare .dt__tfoot td {
    padding-inline: var(--s-5);
  }
}
</style>
