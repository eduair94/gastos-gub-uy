<script setup lang="ts">
/**
 * "Quiénes se presentaron" — los oferentes de esta compra.
 *
 * El feed OCDS nunca dice quién más ofertó: publica sólo al ganador. Hay dos fuentes
 * fuera del feed y este panel prefiere la buena:
 *
 *   1. `callBidders` — el bloque "Proveedores participantes" de la ficha del gobierno.
 *      Trae documento y RUT, y aparece en ~100% de las compras adjudicadas. Es lo que
 *      se muestra: cada oferente enlaza a su ficha de proveedor, y el ganador va marcado.
 *   2. `bidders` (acta) — prosa del acta en PDF. Enumera en ~6-8% de los casos. Queda
 *      como respaldo cuando el bloque HTML todavía no se sondeó, con su cita textual.
 *
 * AUSENCIA NO ES CERO. Si no hay ninguna de las dos, el panel NO se renderiza: una
 * compra que todavía no publicó oferentes no es una compra sin competencia, y mostrar
 * "0 oferentes" fabricaría el hallazgo.
 */
interface CallBidder { docType: string, docNumber: string, name: string, rut: string | null }
interface CallBidders { count: number | null, bidders: CallBidder[], sourceUrl?: string, probedAt?: string }
interface ActaBidders { count: number | null, bidders: string[], excerpt?: string | null, actaUrl?: string }

const props = defineProps<{
  callBidders?: CallBidders | null
  acta?: ActaBidders | null
  /** Nombres de los adjudicatarios, para marcar quién ganó entre los que se presentaron. */
  winners?: string[]
}>()

const { t } = useI18n()
const localePath = useLocalePath()

const list = computed(() => props.callBidders?.bidders ?? [])
const hasHtml = computed(() => list.value.length > 0)
const hasActa = computed(() => (props.acta?.bidders?.length ?? 0) > 0 || props.acta?.count === 1)
const show = computed(() => hasHtml.value || hasActa.value)
const isSole = computed(() => hasHtml.value && list.value.length === 1)

// Comparación laxa a propósito: el nombre del adjudicatario en el feed y el de la ficha
// difieren en puntuación y espacios ("MONTE CARLO TV  S.A." vs "MONTE CARLO TV S A").
const normalized = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
const winnerSet = computed(() => new Set((props.winners ?? []).map(normalized)))
function isWinner(b: CallBidder): boolean {
  return winnerSet.value.has(normalized(b.name))
}

// La ruta de proveedor es catch-all y los ids traen barras: cada segmento se codifica solo.
function supplierPath(rut: string): string {
  return localePath(`/suppliers/${rut.split('/').map(encodeURIComponent).join('/')}`)
}
</script>

<template>
  <section
    v-if="show"
    class="panel block"
  >
    <div class="panel__head">
      <h2>{{ t('contract.sections.bidders') }}</h2>
    </div>
    <div class="panel__body">
      <p class="bid__help u-muted">
        {{ t('contract.biddersHelp') }}
      </p>

      <template v-if="hasHtml">
        <p
          class="bid__count"
          :class="{ 'bid__count--sole': isSole }"
        >
          <v-icon
            size="16"
            :aria-hidden="true"
          >
            {{ isSole ? 'mdi-account-outline' : 'mdi-account-group-outline' }}
          </v-icon>
          {{ isSole ? t('contract.biddersSoleHtml') : t('contract.biddersCount', { n: list.length }) }}
        </p>

        <ul class="bid__list">
          <li
            v-for="(b, i) in list"
            :key="`${b.docNumber}-${i}`"
            class="bid__item"
            :class="{ 'bid__item--winner': isWinner(b) }"
          >
            <span class="bid__name">
              <NuxtLink
                v-if="b.rut"
                :to="supplierPath(b.rut)"
              >{{ b.name }}</NuxtLink>
              <span v-else>{{ b.name }}</span>
            </span>
            <span
              v-if="isWinner(b)"
              class="bid__won"
            >{{ t('contract.biddersWinner') }}</span>
            <span
              v-else-if="!b.rut"
              class="bid__foreign"
            >{{ b.docType }} · {{ b.docNumber }}</span>
          </li>
        </ul>

        <p
          v-if="callBidders?.sourceUrl"
          class="bid__src u-muted"
        >
          <a
            :href="callBidders.sourceUrl"
            target="_blank"
            rel="noopener nofollow"
          >{{ t('contract.biddersOfficial') }}</a>
        </p>
      </template>

      <!-- Respaldo: el acta en prosa, cuando el bloque HTML no se sondeó todavía. -->
      <template v-else-if="hasActa">
        <p class="bid__count">
          <v-icon
            size="16"
            :aria-hidden="true"
          >
            mdi-file-document-outline
          </v-icon>
          {{ acta?.count === 1 && !(acta?.bidders?.length) ? t('contract.biddersSole') : t('contract.biddersCount', { n: acta?.count ?? acta?.bidders?.length ?? 0 }) }}
        </p>
        <ul
          v-if="acta?.bidders?.length"
          class="bid__list"
        >
          <li
            v-for="(name, i) in acta.bidders"
            :key="`a-${i}`"
            class="bid__item"
          >
            <span class="bid__name">{{ name }}</span>
          </li>
        </ul>
        <details
          v-if="acta?.excerpt"
          class="bid__excerpt"
        >
          <summary>{{ t('contract.biddersSource') }}</summary>
          <blockquote>{{ acta.excerpt }}</blockquote>
        </details>
        <p
          v-if="acta?.actaUrl"
          class="bid__src u-muted"
        >
          <a
            :href="acta.actaUrl"
            target="_blank"
            rel="noopener nofollow"
          >{{ t('contract.biddersActa') }}</a>
        </p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.bid__help { font-size: var(--t-xs); line-height: 1.5; max-width: 78ch; margin: 0 0 var(--s-3); }
.bid__count {
  display: flex; align-items: center; gap: var(--s-1);
  font-family: var(--font-mono); font-size: var(--t-sm); font-weight: 600;
  margin: 0 0 var(--s-3);
}
.bid__count--sole { color: var(--alerta); }
.bid__list { list-style: none; padding: 0; margin: 0 0 var(--s-3); }
.bid__item {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s-2);
  padding: var(--s-2) 0; border-bottom: 1px solid var(--rule);
}
.bid__item:last-child { border-bottom: 0; }
.bid__name { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.bid__name a { color: var(--celeste-deep); }
.bid__item--winner .bid__name { font-weight: 700; }
.bid__won {
  flex: 0 0 auto;
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--verde); font-weight: 700;
}
.bid__foreign { flex: 0 0 auto; font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-muted); }
.bid__excerpt { margin: 0 0 var(--s-2); font-size: var(--t-sm); }
.bid__excerpt blockquote {
  margin: var(--s-2) 0 0; padding-left: var(--s-3);
  border-left: 2px solid var(--rule); color: var(--text-muted); line-height: 1.5;
}
.bid__src { font-size: var(--t-xs); margin: 0; }
.bid__src a { color: var(--celeste-deep); }
</style>
