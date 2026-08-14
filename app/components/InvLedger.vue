<script setup lang="ts">
/**
 * The evidence table: the contracts an investigation rests on, one row each,
 * every row linking to its record on the site.
 *
 * There were two of these — `.inv-ledger` in the shared stylesheet (bordered
 * card, sticky head, flagged rows) and `.im-ledger`, copy-pasted with ~120
 * lines of scoped CSS into four pages, drifting as it went: `min-width` 560 in
 * one file and 640 in the next, the object column at 200/220/240/300px, and two
 * copies whose mobile `thead` clip rule had lost its `white-space: nowrap`.
 * This is the one ledger; pages describe columns and hand over cells.
 *
 *   <InvLedger
 *     :columns="[
 *       { key: 'date', label: c.colDate, mono: true, nowrap: true },
 *       { key: 'desc', label: c.colObjeto, primary: true },
 *       { key: 'amount', label: c.colAmount, align: 'end' },
 *       { key: 'ficha' },
 *     ]"
 *     :rows="ledger"
 *     row-key="ocid"
 *     :row-class="r => ({ rowflag: r.flag })"
 *   >
 *     <template #cell:amount="{ row }">
 *       <MoneyAmount :amount="row.amount" compact />
 *     </template>
 *   </InvLedger>
 *
 * Below 760px each row becomes a card and the header is read out by
 * `data-label`, so the table never scrolls the document sideways. A column with
 * no `label` is the row action: its header is `aria-hidden`, because "→" is not
 * a column name.
 */
export interface InvLedgerColumn {
  key: string
  /** Column head. Omit for the row-action column. */
  label?: string
  /** Numeric column: right-aligned on desktop, left-aligned in the mobile card. */
  align?: 'end'
  mono?: boolean
  /** The row's subject — bold, and the card's title on mobile (so: no label). */
  primary?: boolean
  muted?: boolean
  nowrap?: boolean
  /** Desktop reading width for a text column that must not be squeezed. */
  minWidth?: string
}

const props = withDefaults(defineProps<{
  columns: InvLedgerColumn[]
  rows: readonly any[]
  /** Row identity: a field name, or a function for composite keys. */
  rowKey: string | ((row: any, index: number) => string | number)
  /** Extra classes per row — `rowflag` tints the row in alerta. */
  rowClass?: (row: any, index: number) => string | Record<string, boolean> | undefined
  /** Table floor before the scroller takes over. */
  minWidth?: number
}>(), {
  minWidth: 640,
})

function keyFor(row: any, i: number) {
  return typeof props.rowKey === 'function' ? props.rowKey(row, i) : row[props.rowKey]
}

function cellClass(c: InvLedgerColumn) {
  return [
    c.align === 'end' && 'num',
    c.mono && 'u-mono',
    c.primary && 'is-primary',
    c.muted && 'is-muted',
    c.nowrap && 'is-nowrap',
  ]
}
</script>

<template>
  <div class="ilg u-scroll-x">
    <table :style="{ minWidth: `${minWidth}px` }">
      <thead>
        <tr>
          <th
            v-for="c in columns"
            :key="c.key"
            :class="[c.align === 'end' && 'num']"
            :aria-hidden="c.label ? undefined : 'true'"
            :style="c.minWidth ? { minWidth: c.minWidth } : undefined"
          >
            {{ c.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, i) in rows"
          :key="keyFor(row, i)"
          :class="rowClass?.(row, i)"
        >
          <td
            v-for="c in columns"
            :key="c.key"
            :class="cellClass(c)"
            :data-label="c.primary ? undefined : c.label"
          >
            <slot
              :name="`cell:${c.key}`"
              :row="row"
              :index="i"
            >
              {{ row[c.key] }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ilg {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}

.ilg table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--t-sm);
}

.ilg thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 11px 14px;
  background: var(--surface-sunken);
  border-bottom: 1px solid var(--rule-strong);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
  color: var(--text-muted);
}

.ilg th.num,
.ilg td.num { text-align: right; }

.ilg tbody td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--rule);
  vertical-align: middle;
}

.ilg tbody tr:last-child td { border-bottom: none; }
.ilg tbody tr:hover { background: var(--surface-sunken); }

.ilg td.u-mono { font-variant-numeric: tabular-nums; }
.ilg td.is-primary { font-weight: 600; }
.ilg td.is-muted { color: var(--text-muted); }
.ilg td.is-nowrap { white-space: nowrap; }

/* Flagged row: the finding, marked in place. */
.ilg tbody tr.rowflag { background: var(--alerta-wash); }

/* Row links and actions live in the caller's cell slots, so they carry the
   page's scope, not this component's. */
.ilg :deep(a) {
  color: var(--celeste-deep);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-decoration: none;
  white-space: nowrap;
}

.ilg :deep(a:hover) { text-decoration: underline; }

/* Mobile: each row becomes a card — no horizontal scroll, no lost columns. */
@media (max-width: 760px) {
  .ilg {
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .ilg table {
    display: block;
    min-width: 0 !important;
  }

  .ilg thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .ilg tbody {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .ilg tbody tr {
    display: block;
    padding: var(--s-4);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-1);
  }

  .ilg tbody tr:hover { background: var(--surface); }

  /* En escritorio los enlaces no envuelven porque la tabla scrollea en su propia caja; en modo
     tarjeta no hay tal caja, y un enlace largo —"Centro de Rehabilitación Médico Ocupacional y
     Sicosocial"— empujaba el DOCUMENTO entero 11px a 360px. Medido en /analytics/agenda. */
  .ilg :deep(a) {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .ilg tbody tr.rowflag {
    border-color: var(--alerta);
    background: var(--alerta-wash);
  }

  .ilg tbody tr.rowflag:hover { background: var(--alerta-wash); }

  .ilg tbody td,
  .ilg tbody td.num {
    display: block;
    min-width: 0 !important;
    padding: var(--s-2) 0;
    border: 0;
    border-top: 1px solid color-mix(in srgb, var(--rule) 55%, transparent);
    text-align: left;
    white-space: normal;
  }

  .ilg tbody td:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .ilg tbody td[data-label]::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 3px;
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .ilg tbody td.is-primary {
    font-size: var(--t-base);
    font-weight: 700;
  }
}
</style>
