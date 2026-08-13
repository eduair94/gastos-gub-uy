<script setup lang="ts">
/**
 * "¿Sabés algo de esto?" — el puente entre una investigación y Uruguay Leaks.
 *
 * Uruguay Leaks (la diaria + PODER + DATA Uruguay) recibe material de forma anónima sobre
 * corrupción e información que contradice los datos públicos. Nosotros no recibimos denuncias
 * ni tenemos con qué proteger a nadie: lo honesto es mandar a quien sí puede.
 *
 * El componente escribe el mensaje por el lector — con el tema, el enlace a la investigación y
 * los datos concretos que la sostienen — porque el costo real de una denuncia no es el formulario:
 * es tener que explicar de cero de qué se está hablando.
 *
 * La advertencia sobre el equipo del trabajo NO es decorativa y no se saca: quien filtra desde la
 * computadora o el correo de la oficina deja el rastro ahí, no acá.
 */
const props = defineProps<{
  /** Tema del mensaje: el título de la investigación. */
  subject: string
  /** Ruta de la investigación (sin dominio), para que el mensaje la enlace. */
  path: string
  /** Dos o tres datos concretos que ya están publicados, uno por línea. */
  facts?: string[] | undefined
}>()

const { t } = useI18n()
const siteUrl = useRuntimeConfig().public.siteUrl as string

const message = computed(() => {
  const lines = [
    `${t('leak.tplSubject')}: ${props.subject}`,
    '',
    t('leak.tplIntro', { url: `${siteUrl}${props.path}` }),
  ]
  if (props.facts?.length) {
    lines.push('', `${t('leak.tplPublished')}:`)
    for (const f of props.facts) lines.push(`- ${f}`)
  }
  lines.push(
    '',
    `${t('leak.tplKnow')}:`,
    t('leak.tplKnowHint'),
    '',
    `${t('leak.tplDocs')}:`,
    t('leak.tplDocsHint'),
  )
  return lines.join('\n')
})

const copied = ref(false)
const selected = ref(false)
const box = useTemplateRef<HTMLTextAreaElement>('box')

/**
 * El portapapeles se niega en varios contextos (permiso denegado, iframe, http). Ahí el botón
 * no puede quedar mudo: selecciona el mensaje entero para que un Ctrl+C lo resuelva. Un fallo
 * silencioso acá cuesta la denuncia.
 */
async function copy() {
  try {
    await navigator.clipboard.writeText(message.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
  catch {
    box.value?.focus()
    box.value?.select()
    selected.value = true
  }
}
</script>

<template>
  <section class="leak">
    <div class="leak__head">
      <span class="leak__tag">{{ t('leak.tag') }}</span>
      <h2>{{ t('leak.title') }}</h2>
      <p class="leak__dek">
        {{ t('leak.dek') }}
      </p>
    </div>

    <div class="leak__body">
      <label
        class="leak__label"
        for="leak-msg"
      >{{ t('leak.messageLabel') }}</label>
      <textarea
        id="leak-msg"
        ref="box"
        class="leak__msg u-mono"
        readonly
        rows="10"
        :value="message"
      />

      <div class="leak__actions">
        <button
          type="button"
          class="leak__btn leak__btn--primary"
          @click="copy"
        >
          <v-icon size="18">
            {{ copied ? 'mdi-check' : 'mdi-content-copy' }}
          </v-icon>
          <span>{{ copied ? t('leak.copied') : selected ? t('leak.selected') : t('leak.copy') }}</span>
        </button>
        <a
          class="leak__btn"
          href="https://uruguayleaks.uy/enviar.php"
          target="_blank"
          rel="noopener noreferrer"
        >
          <v-icon size="18">
            mdi-open-in-new
          </v-icon>
          <span>{{ t('leak.open') }}</span>
        </a>
      </div>

      <p class="leak__warn">
        <v-icon size="16">
          mdi-shield-alert-outline
        </v-icon>
        <span>{{ t('leak.warn') }}</span>
      </p>
      <p class="leak__who">
        {{ t('leak.who') }}
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.leak {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface-sunken);
  padding: var(--s-6);
}

.leak__tag {
  display: inline-block;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  /* `--celeste` is a fill, not an ink: as 11px text on the panel's sunken
     surface it measured 2.6:1. The deep tone is the ink of that pair. */
  color: var(--celeste-deep);
  margin-bottom: var(--s-2);
}

.leak__head h2 {
  font-size: 1.25rem;
  line-height: 1.25;
  margin: 0 0 var(--s-2);
}

.leak__dek {
  color: var(--text-muted);
  margin: 0 0 var(--s-5);
  max-width: 62ch;
}

.leak__label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: var(--s-2);
}

.leak__msg {
  width: 100%;
  max-width: 100%;
  resize: vertical;
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  padding: var(--s-3);
  font-size: 0.82rem;
  line-height: 1.55;
}

.leak__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-4);
}

.leak__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  padding: var(--s-2) var(--s-4);
  font-size: 0.88rem;
  cursor: pointer;
  text-decoration: none;
}

.leak__btn:hover { border-color: var(--celeste); }

.leak__btn--primary {
  border-color: var(--celeste);
  /* Label ink, not the border's fill: on white the bright tone was 3.3:1. */
  color: var(--celeste-deep);
}

.leak__warn,
.leak__who {
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
  color: var(--text-muted);
  font-size: 0.82rem;
  margin: var(--s-4) 0 0;
  max-width: 70ch;
}

.leak__who { margin-top: var(--s-2); }
</style>
