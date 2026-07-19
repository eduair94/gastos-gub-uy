<script setup lang="ts">
/**
 * Nested treemap — area is money. Two levels: each GROUP is a region sized by
 * its total; inside it, each MEMBER is a cell sized by its spend. The whole
 * state's spending is dimensioned at a glance: a bigger rectangle spent more.
 *
 * Layout is a squarified treemap (Bruls, Huizing & van Wijk) computed against a
 * fixed viewBox, so it renders identically on the server (no measuring) and the
 * numbers land in the crawlable HTML. Member cells are links.
 *
 * Area encodes magnitude here, so — unlike everywhere else — the figure inside a
 * cell is plain text, not a <MoneyAmount>: the rectangle IS the gold rule.
 */
const props = withDefaults(defineProps<{
  groups: {
    key: string
    label: string
    value: number
    members: { label: string, value: number, href?: string }[]
  }[]
  /** viewBox height; width is fixed at 1000. Taller = more room for small cells. */
  height?: number
}>(), { height: 640 })

const W = 1000
const H = computed(() => props.height)

// One calm, theme-stable hue per group; members are shades of it. Mid-tones so
// white labels stay legible in light and dark. (A chart palette, like the
// fallback hexes in InvHBars — not page chrome.)
const GROUP_COLORS = ['#5e93c4', '#3f7d62', '#6b7f8f', '#8a6ea0', '#4f9a94', '#b0805a', '#9a6a6a', '#7a86b8']

interface Rect { x: number, y: number, w: number, h: number }

function worstRatio(areas: number[], side: number): number {
  const sum = areas.reduce((a, b) => a + b, 0)
  if (sum <= 0) return Infinity
  const max = Math.max(...areas)
  const min = Math.min(...areas)
  const s2 = sum * sum
  const side2 = side * side
  return Math.max((side2 * max) / s2, s2 / (side2 * min))
}

/** Squarify `items` (each with `area`) into the rect; returns per-item rects. */
function squarify<T extends { area: number }>(items: T[], rect: Rect): (T & Rect)[] {
  const out: (T & Rect)[] = []
  let { x, y, w, h } = rect
  const list = items.filter(i => i.area > 0)
  let i = 0
  while (i < list.length) {
    const short = Math.min(w, h)
    const row = [list[i]!]
    let j = i + 1
    while (
      j < list.length
      && worstRatio([...row, list[j]!].map(r => r.area), short)
      <= worstRatio(row.map(r => r.area), short)
    ) {
      row.push(list[j]!)
      j++
    }
    const rowArea = row.reduce((a, r) => a + r.area, 0)
    if (w <= h) {
      const stripH = rowArea / w
      let cx = x
      for (const r of row) {
        const cw = stripH > 0 ? r.area / stripH : 0
        out.push({ ...r, x: cx, y, w: cw, h: stripH })
        cx += cw
      }
      y += stripH
      h -= stripH
    }
    else {
      const stripW = rowArea / h
      let cy = y
      for (const r of row) {
        const ch = stripW > 0 ? r.area / stripW : 0
        out.push({ ...r, x, y: cy, w: stripW, h: ch })
        cy += ch
      }
      x += stripW
      w -= stripW
    }
    i = j
  }
  return out
}

// Level 1: place the groups.
const groupRects = computed(() => {
  const total = props.groups.reduce((a, g) => a + Math.max(0, g.value), 0)
  if (total <= 0) return []
  const scale = (W * H.value) / total
  const items = [...props.groups]
    .map((g, idx) => ({ ...g, idx, area: Math.max(0, g.value) * scale }))
    .sort((a, b) => b.area - a.area)
  return squarify(items, { x: 0, y: 0, w: W, h: H.value })
})

// Height reserved at the top of each group region for its header bar, so the
// group label never sits on top of the biggest member's label.
const HEADER_H = 30

function hasHeader(g: { w: number, h: number }): boolean {
  return g.w > 96 && g.h > 66
}

// Level 2: place each group's members inside its region (below the header
// band), and shade by rank.
const cells = computed(() => {
  const all: Array<{ x: number, y: number, w: number, h: number, label: string, value: number, href?: string, fill: string, group: string }> = []
  for (const g of groupRects.value) {
    const base = GROUP_COLORS[g.idx % GROUP_COLORS.length]!
    const inset = hasHeader(g) ? HEADER_H : 0
    const region = { x: g.x, y: g.y + inset, w: g.w, h: g.h - inset }
    const members = [...g.members]
      .map(m => ({ ...m, area: Math.max(0, m.value) }))
      .filter(m => m.area > 0)
      .sort((a, b) => b.area - a.area)
    const sum = members.reduce((a, m) => a + m.area, 0)
    if (sum <= 0 || region.h <= 0) continue
    const scale = (region.w * region.h) / sum
    const placed = squarify(members.map(m => ({ ...m, area: m.area * scale })), region)
    placed.forEach((p, i) => {
      // Lightest cells first (biggest), stepping darker down the ranking, so a
      // group reads as one family with internal contrast.
      const t = placed.length > 1 ? i / (placed.length - 1) : 0
      all.push({ x: p.x, y: p.y, w: p.w, h: p.h, label: p.label, value: p.value, href: p.href, group: g.key, fill: shade(base, t) })
    })
  }
  return all
})

/** Mix a hex toward a darker version of itself by t in [0,1]. */
function shade(hex: string, t: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const gr = (n >> 8) & 255
  const b = n & 255
  const k = 1 - t * 0.42
  const to = (v: number) => Math.round(v * k).toString(16).padStart(2, '0')
  return `#${to(r)}${to(gr)}${to(b)}`
}

// Group header bars, drawn in the reserved band at the top of each region.
const headers = computed(() =>
  groupRects.value
    .filter(hasHeader)
    .map(g => ({
      key: g.key,
      label: g.label,
      value: g.value,
      x: g.x,
      y: g.y,
      w: g.w,
      h: HEADER_H,
      fill: shade(GROUP_COLORS[g.idx % GROUP_COLORS.length]!, 0.72),
    })))

// Stable unique id so each header's clipPath doesn't collide with another
// treemap on the page (and survives SSR hydration).
const uid = useId()

function fmt(v: number) {
  return formatMoney(v, 'UYU', { compact: true })
}

// SPA navigation. The cell is a native SVG <a> (so it renders inside the SVG
// namespace and stays right-clickable / crawlable); this intercepts the plain
// click for a client-side route change.
function go(href?: string) {
  if (href) navigateTo(href)
}
</script>

<template>
  <div class="tm">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="tm__svg"
      preserveAspectRatio="xMidYMid meet"
      role="img"
    >
      <defs>
        <clipPath
          v-for="g in headers"
          :id="`tmh-${uid}-${g.key}`"
          :key="`clip-${g.key}`"
        >
          <rect
            :x="g.x"
            :y="g.y"
            :width="g.w"
            :height="g.h"
          />
        </clipPath>
      </defs>
      <!-- Member cells. Native SVG <a> so the rect paints in the SVG namespace
           (a NuxtLink component here renders an HTML <a> and the cell vanishes). -->
      <a
        v-for="(c, i) in cells"
        :key="i"
        :href="c.href || undefined"
        class="tm__cellwrap"
        @click.prevent="go(c.href)"
      >
        <title>{{ c.label }} · {{ fmt(c.value) }}</title>
        <rect
          :x="c.x"
          :y="c.y"
          :width="Math.max(0, c.w - 1.5)"
          :height="Math.max(0, c.h - 1.5)"
          :fill="c.fill"
          class="tm__cell"
          rx="2"
        />
        <text
          v-if="c.w > 74 && c.h > 30"
          :x="c.x + 8"
          :y="c.y + 20"
          class="tm__cname"
        >{{ c.label }}</text>
        <text
          v-if="c.w > 74 && c.h > 46"
          :x="c.x + 8"
          :y="c.y + 36"
          class="tm__cval"
        >{{ fmt(c.value) }}</text>
      </a>

      <!-- Group header bars, drawn last so they sit on top of the cells -->
      <g
        v-for="g in headers"
        :key="`h-${g.key}`"
        class="tm__group"
        :clip-path="`url(#tmh-${uid}-${g.key})`"
      >
        <rect
          :x="g.x"
          :y="g.y"
          :width="g.w"
          :height="g.h"
          :fill="g.fill"
        />
        <text
          :x="g.x + 8"
          :y="g.y + g.h / 2"
          class="tm__glabel"
          dominant-baseline="central"
        >{{ g.label }}</text>
        <text
          v-if="g.w > 240"
          :x="g.x + g.w - 8"
          :y="g.y + g.h / 2"
          class="tm__gval"
          text-anchor="end"
          dominant-baseline="central"
        >{{ fmt(g.value) }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.tm { width: 100%; }

.tm__svg {
  width: 100%;
  height: auto;
  display: block;
  border-radius: var(--r-md);
  overflow: hidden;
}

.tm__cellwrap { cursor: pointer; }

.tm__cell {
  transition: opacity var(--dur) var(--ease);
}

.tm__cellwrap:hover .tm__cell { opacity: 0.82; }

.tm__cname {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 600;
  fill: #fff;
  pointer-events: none;
}

.tm__cval {
  font-family: var(--font-mono);
  font-size: 11px;
  fill: rgba(255, 255, 255, 0.85);
  pointer-events: none;
}

.tm__group { pointer-events: none; }

.tm__glabel {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  fill: #fff;
}

.tm__gval {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  fill: rgba(255, 255, 255, 0.9);
}
</style>
