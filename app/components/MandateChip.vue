<script setup lang="ts">
/**
 * MandateChip — the administration that governed an organism the year a purchase
 * was recorded. Public electoral record, shown as context, never as attribution.
 *
 * Resolves `buyer.id` + `sourceYear` through #shared/political-mandates. Renders
 * nothing for organisms with no executive mandate (unless `showSelfGoverned`) and
 * nothing when the year is outside the curated range — a silent gap, not a guess.
 */
import { mandateForBuyer, MANDATE_SOURCE } from '#shared/political-mandates'

const props = withDefaults(defineProps<{
  buyerId?: string | null
  year?: number | null
  /** Show a muted "órgano autónomo" chip for self-governed bodies. */
  showSelfGoverned?: boolean
  /** Print the holder's name on the chip face (off = party + term only). */
  showHolder?: boolean
  size?: 'x-small' | 'small' | 'default'
}>(), {
  buyerId: '',
  year: null,
  showSelfGoverned: false,
  showHolder: true,
  size: 'small',
})

const { t } = useI18n()

const m = computed(() => mandateForBuyer(String(props.buyerId ?? ''), props.year))
const show = computed(() => m.value.hasMandate)
const selfGov = computed(() => props.showSelfGoverned && m.value.jurisdiction === 'self-governed')
const roleLabel = computed(() => m.value.role === 'president' ? t('mandate.role.president') : t('mandate.role.intendente'))
</script>

<template>
  <v-chip
    v-if="show"
    :size="size"
    variant="tonal"
    class="mandate"
    label
  >
    <span
      class="mandate__dot"
      :style="{ background: m.partyColor }"
      aria-hidden="true"
    />
    <span class="mandate__txt">
      <strong class="mandate__party">{{ m.party }}</strong>
      <span
        v-if="showHolder"
        class="mandate__holder"
      >{{ m.holder }}</span>
    </span>
    <span
      v-if="m.termLabel"
      class="mandate__term u-mono"
    >{{ m.termLabel }}</span>
    <span
      v-if="m.isTransition"
      class="mandate__flag"
      aria-hidden="true"
    >*</span>

    <v-tooltip
      activator="parent"
      location="bottom"
      max-width="320"
    >
      <div class="mtt">
        <p class="mtt__eyebrow">
          {{ roleLabel }}
        </p>
        <p class="mtt__holder">
          {{ m.holder }}
        </p>
        <p class="mtt__party">
          {{ m.partyLabel }}<span v-if="m.termLabel"> · {{ m.termLabel }}</span>
        </p>
        <p
          v-if="m.coalition && m.coalition !== m.partyLabel"
          class="mtt__line"
        >
          {{ t('mandate.coalition', { name: m.coalition }) }}
        </p>
        <p
          v-if="m.isTransition"
          class="mtt__line"
        >
          {{ t('mandate.transition') }}
        </p>
        <p
          v-if="m.boardSplitCaveat"
          class="mtt__line"
        >
          {{ t('mandate.boardSplit') }}
        </p>
        <p
          v-if="m.confidence === 'single-source'"
          class="mtt__line"
        >
          {{ t('mandate.singleSource') }}
        </p>
        <p class="mtt__src">
          {{ t('mandate.disclaimer') }} {{ t('mandate.source', { source: MANDATE_SOURCE }) }}
        </p>
      </div>
    </v-tooltip>
  </v-chip>

  <v-chip
    v-else-if="selfGov"
    :size="size"
    variant="text"
    class="mandate mandate--auto"
    label
  >
    <v-icon
      start
      size="13"
    >
      mdi-scale-balance
    </v-icon>
    {{ t('mandate.selfGoverned') }}
  </v-chip>
</template>

<style scoped>
.mandate {
  font-weight: 500;
  letter-spacing: 0;
}
.mandate__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--r-full);
  margin-right: 6px;
  flex: none;
}
.mandate__txt {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}
.mandate__party { font-weight: 700; }
.mandate__holder {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 22ch;
}
.mandate__term {
  margin-left: 7px;
  font-size: var(--t-xs);
  color: var(--text-muted);
}
.mandate__flag {
  margin-left: 3px;
  color: var(--text-muted);
  font-weight: 700;
}
.mandate--auto {
  color: var(--text-muted);
  font-size: var(--t-xs);
}

.mtt { padding: 2px 0; }
.mtt__eyebrow {
  margin: 0 0 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
}
.mtt__holder { margin: 0; font-weight: 700; font-size: var(--t-sm); }
.mtt__party { margin: 2px 0 0; font-size: var(--t-xs); opacity: 0.9; }
.mtt__line {
  margin: 8px 0 0;
  font-size: var(--t-xs);
  line-height: 1.45;
  opacity: 0.85;
}
.mtt__src {
  margin: 10px 0 0;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 10px;
  line-height: 1.4;
  opacity: 0.7;
}
</style>
