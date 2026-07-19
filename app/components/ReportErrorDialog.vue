<script setup lang="ts">
/**
 * Report-a-load-error dialog. Opened per row from /analytics/errores-carga.
 *
 * The site does not store or forward reports — corrections are owned by the
 * buying agency (data entry via SICE) and ACCE (comprasestatales.gub.uy). So
 * this dialog just hands the reader everything they need to take the error to
 * the source: the official record, the agency, and a ready-to-paste report text.
 *
 * The official deep-link uses the confirmed government URL format
 * `…/mostrar-llamado/1/id/{id_compra}`. An anomaly's releaseId (e.g.
 * `adjudicacion-1074933`) shares its trailing number with the OCDS ocid
 * (`ocds-…-1074933`), which is the id_compra — so we derive it from that
 * suffix. When no numeric suffix is present we drop the official link and the
 * on-site contract page (always correct) carries the reader instead.
 */
const props = defineProps<{
  modelValue: boolean
  anomaly: any
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const { t } = useI18n()
const localePath = useLocalePath()

const open = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const a = computed(() => props.anomaly ?? {})
const releaseId = computed<string>(() => String(a.value?.releaseId ?? ''))
const organism = computed<string>(() => a.value?.metadata?.buyerName?.trim() || '—')
const supplier = computed<string>(() => a.value?.metadata?.supplierName?.trim() || '')
const item = computed<string>(() => {
  const cls = a.value?.metadata?.itemClassification?.description
  if (cls && cls !== 'Unknown') return cls
  const d = a.value?.metadata?.itemDescription
  return d && d !== 'Unknown' ? d : '—'
})
function cur(): string {
  return a.value?.currency ?? a.value?.metadata?.currency ?? 'UYU'
}
const detected = computed<string>(() =>
  Number.isFinite(a.value?.detectedValue) ? formatMoney(a.value.detectedValue, cur()) : '—',
)
const expected = computed<string>(() => {
  const min = a.value?.expectedRange?.min
  const max = a.value?.expectedRange?.max
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '—'
  return `${formatMoney(min, cur())} – ${formatMoney(max, cur())}`
})

/** The government call page for this purchase, from the id_compra in the releaseId. */
const officialUrl = computed<string | null>(() => {
  const m = /(\d+)\s*$/.exec(releaseId.value)
  const id = m?.[1]
  return id ? `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/${encodeURIComponent(id)}` : null
})

/** The on-site contract page (always resolvable) — the reliable fallback + cross-check. */
const contractPath = computed(() => localePath(`/contracts/${releaseId.value}`))
const contractAbsolute = computed(() =>
  import.meta.client ? new URL(contractPath.value, window.location.origin).href : contractPath.value,
)

/** Human contract reference for the paste text — the official link if we have it, else the on-site page. */
const contractRef = computed(() => officialUrl.value ?? contractAbsolute.value)

const reportText = computed(() =>
  t('reportDialog.copyText', {
    ref: contractRef.value,
    organism: organism.value,
    item: item.value,
    detected: detected.value,
    expected: expected.value,
  }),
)

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null
async function copy() {
  try {
    await navigator.clipboard.writeText(reportText.value)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 1800)
  }
  catch {
    // Clipboard blocked (insecure context / permissions): select-all fallback so the
    // reader can still copy manually from the visible <textarea>.
    const el = document.getElementById('report-text') as HTMLTextAreaElement | null
    el?.select()
  }
}
onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="580"
    scrollable
  >
    <div class="rd">
      <header class="rd__head">
        <h2 class="rd__title">
          {{ t('reportDialog.title') }}
        </h2>
        <button
          class="rd__x"
          type="button"
          :aria-label="t('reportDialog.close')"
          @click="open = false"
        >
          <v-icon size="22">
            mdi-close
          </v-icon>
        </button>
      </header>

      <div class="rd__body">
        <p class="rd__intro">
          {{ t('reportDialog.intro') }}
        </p>

        <dl class="rd__facts">
          <div class="rd__fact rd__fact--wide">
            <dt>{{ t('reportDialog.contractLabel') }}</dt>
            <dd>
              <NuxtLink
                :to="contractPath"
                class="rd__link"
                @click="open = false"
              >
                {{ releaseId }}
              </NuxtLink>
            </dd>
          </div>
          <div class="rd__fact rd__fact--wide">
            <dt>{{ t('reportDialog.organismLabel') }}</dt>
            <dd>{{ organism }}</dd>
          </div>
          <div class="rd__fact">
            <dt>{{ t('reportDialog.detectedLabel') }}</dt>
            <dd class="u-mono rd__bad">
              {{ detected }}
            </dd>
          </div>
          <div class="rd__fact">
            <dt>{{ t('reportDialog.expectedLabel') }}</dt>
            <dd class="u-mono">
              {{ expected }}
            </dd>
          </div>
        </dl>

        <div class="rd__copy">
          <div class="rd__copyhead">
            <span class="rd__copyt u-mono">{{ t('reportDialog.copyTitle') }}</span>
            <button
              class="rd__copybtn"
              type="button"
              @click="copy"
            >
              <v-icon size="16">
                {{ copied ? 'mdi-check' : 'mdi-content-copy' }}
              </v-icon>
              {{ copied ? t('reportDialog.copied') : t('reportDialog.copy') }}
            </button>
          </div>
          <textarea
            id="report-text"
            class="rd__text u-mono"
            readonly
            rows="9"
            :value="reportText"
          />
        </div>
      </div>

      <footer class="rd__foot">
        <a
          v-if="officialUrl"
          :href="officialUrl"
          target="_blank"
          rel="noopener external"
          class="rd__act rd__act--primary"
        >
          <v-icon size="18">mdi-open-in-new</v-icon>
          {{ t('reportDialog.openOfficial') }}
        </a>
        <NuxtLink
          :to="contractPath"
          class="rd__act"
          @click="open = false"
        >
          {{ t('reportDialog.openContract') }}
        </NuxtLink>
        <NuxtLink
          :to="localePath('/analytics/como-reportar')"
          class="rd__act rd__act--ghost"
          @click="open = false"
        >
          {{ t('reportDialog.guideLink') }}
        </NuxtLink>
      </footer>
    </div>
  </v-dialog>
</template>

<style scoped>
.rd {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
}

.rd__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-5) var(--s-5) var(--s-3);
  border-bottom: 1px solid var(--rule);
}

.rd__title {
  margin: 0;
  font-size: var(--t-lg);
  line-height: 1.25;
}

.rd__x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.rd__x:hover { color: var(--text); background: var(--surface-sunken); }

.rd__body { padding: var(--s-4) var(--s-5); }

.rd__intro {
  margin: 0 0 var(--s-4);
  font-size: var(--t-sm);
  line-height: 1.55;
  color: var(--text-muted);
}

.rd__facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-3) var(--s-4);
  margin: 0 0 var(--s-4);
  padding: var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
}

.rd__fact { min-width: 0; }
.rd__fact--wide { grid-column: 1 / -1; }

.rd__fact dt {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.rd__fact dd {
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.35;
  word-break: break-word;
}

.rd__bad { color: var(--alerta); font-weight: 700; }

.rd__link { color: var(--celeste-deep); text-decoration: none; }
.rd__link:hover { text-decoration: underline; }

.rd__copyhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-2);
}

.rd__copyt {
  font-size: var(--t-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.rd__copybtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  background: var(--surface);
  color: var(--celeste-deep);
  font-size: var(--t-xs);
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.rd__copybtn:hover { border-color: var(--celeste); }

.rd__text {
  width: 100%;
  resize: vertical;
  padding: var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
  color: var(--text);
  font-size: var(--t-xs);
  line-height: 1.55;
}

.rd__text:focus { outline: 2px solid var(--focus); outline-offset: 1px; }

.rd__foot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  padding: var(--s-4) var(--s-5) var(--s-5);
  border-top: 1px solid var(--rule);
}

.rd__act {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
  color: var(--text);
  background: var(--surface);
  transition: border-color var(--dur) var(--ease), filter var(--dur) var(--ease);
}

.rd__act:hover { border-color: var(--rule-strong); }

.rd__act--primary {
  background: var(--celeste);
  border-color: var(--celeste);
  color: #fff;
}

.rd__act--primary:hover { filter: brightness(1.06); }

.rd__act--ghost {
  border-color: transparent;
  color: var(--celeste-deep);
  background: transparent;
  margin-left: auto;
}

.rd__act--ghost:hover { text-decoration: underline; border-color: transparent; }

@media (max-width: 520px) {
  .rd__facts { grid-template-columns: 1fr; }
  .rd__act--ghost { margin-left: 0; }
}
</style>
