<script setup lang="ts">
/**
 * The legal-status pill.
 *
 * One vocabulary, one colour map. It replaces four hand-rolled copies that had
 * drifted: the same `condena` was a solid red fill on the curro detail hero, a
 * 16% tint on the index card and flat grey on the related-case pill — in two
 * files that link to each other.
 *
 * Severity is carried by WEIGHT, not by inventing hues:
 *
 *   condena     filled     a conviction is categorically different
 *   proceso     tinted     procesamiento / formalización / juicio / imputación
 *   preliminar  celeste    investigación / auditoría / denuncia / rescisión
 *   cerrado     neutral    absolución / archivo
 *
 * The old map used `--sol` for the preliminary tier, which breaks the system's
 * one hard rule (gold is money and nothing else), and `var(--danger, #c0392b)`
 * for condena against a token that does not exist — so every conviction chip was
 * painting an un-themed fallback hex. Both are gone.
 *
 * `on="ink"` is not a style preference. `--ink` is a dark surface in BOTH themes
 * (no dark-mode override), so the paper tokens invert underneath it and go
 * dark-on-dark; the hero variant uses the fixed `--ink-*` tokens instead.
 *
 * Two things it guarantees so its containers do not have to:
 *  - it never stretches. `align-self: flex-start` means a flex row that forgot
 *    `align-items` cannot inflate a one-word pill to the height of the
 *    paragraph beside it (which is exactly what `.statusbox` was doing).
 *  - it never widens the page. `max-width: 100%` with an ellipsising label: a
 *    long value clips (and stays readable via `title`) instead of pushing the
 *    document sideways. Prose does not belong in a chip at all — see
 *    <ReportedFigure>.
 *
 * `label` arrives already translated, so this stays usable outside the
 * `curros.*` namespace (empresas-senaladas adds `observacion` / `periodistica`).
 */
const props = withDefaults(defineProps<{
  /** Raw status slug. Accents and case are tolerated; unknown values read neutral. */
  status: string
  /** The translated word. Page-owned t() string. */
  label: string
  /** soft = tinted (default) · outline = border only · micro = soft at list density. */
  variant?: 'soft' | 'outline' | 'micro'
  /** Which surface it sits on. `ink` = the dark hero, which does not follow the theme. */
  on?: 'paper' | 'ink'
  /** Tooltip override. Defaults to the label, so a clipped chip is still readable. */
  title?: string
}>(), {
  variant: 'soft',
  on: 'paper',
})

/** Slug → severity tone. The single source of truth for the vocabulary. */
const TONES: Record<string, 'condena' | 'proceso' | 'preliminar' | 'cerrado'> = {
  condena: 'condena',
  procesamiento: 'proceso',
  formalizacion: 'proceso',
  juicio: 'proceso',
  imputacion: 'proceso',
  investigacion: 'preliminar',
  auditoria: 'preliminar',
  denuncia: 'preliminar',
  rescision: 'preliminar',
  observacion: 'preliminar',
  periodistica: 'preliminar',
  absolucion: 'cerrado',
  archivo: 'cerrado',
}

// Slugs come from hand-written case files, so `Rescisión` and `rescision` both
// happen. Fold accents rather than adding a second key per word.
const tone = computed(() => {
  const key = (props.status ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
  return TONES[key] ?? 'cerrado'
})
</script>

<template>
  <span
    class="sc"
    :class="[`sc--${tone}`, `sc--${variant}`, on === 'ink' && 'sc--ink']"
    :title="title ?? label"
  >
    <span class="sc__l">{{ label }}</span>
  </span>
</template>

<style scoped>
.sc {
  /* flex-start, never stretch: a container that forgot align-items cannot
     inflate this to the height of the paragraph next to it. 0 0 auto so it
     also never grows into the slack of a flex row. */
  align-self: flex-start;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  padding: 2px var(--s-3);
  border: 1px solid transparent;
  border-radius: var(--r-full);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.6;
  text-transform: uppercase;
}

/* Overflow is clipped, never propagated: the ellipsis lives on an inner block
   because it is ignored on an inline-flex box. `title` keeps the full value. */
.sc__l {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc--micro { padding: 1px var(--s-2); font-size: 10px; letter-spacing: 0.03em; }

/* --- Tones on paper. Signal tokens only: no gold (that is money). --- */
.sc--condena {
  background: var(--alerta);
  border-color: var(--alerta);
  color: var(--alerta-fg);
  font-weight: 700;
}

.sc--proceso {
  background: var(--alerta-wash);
  border-color: color-mix(in srgb, var(--alerta) 38%, transparent);
  color: var(--alerta);
}

.sc--preliminar {
  background: var(--celeste-wash);
  border-color: color-mix(in srgb, var(--celeste) 34%, transparent);
  color: var(--celeste-deep);
}

.sc--cerrado {
  background: var(--surface-sunken);
  border-color: var(--rule);
  color: var(--text-muted);
}

/* Outline: same tones, no fill — for dense rows where a filled pill would
   read as a second surface. */
.sc--outline { background: transparent; }
.sc--outline.sc--condena { color: var(--alerta); }

/* --- On the ink hero. Fixed values, because --ink never flips. --- */
.sc--ink.sc--condena {
  background: var(--ink-alerta);
  border-color: var(--ink-alerta);
  color: var(--ink-alerta-fg);
}
.sc--ink.sc--proceso,
.sc--ink.sc--preliminar,
.sc--ink.sc--cerrado {
  background: rgb(255 255 255 / 10%);
  border-color: var(--ink-rule);
  color: var(--ink-fg);
}
</style>
