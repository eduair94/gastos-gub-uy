<script setup lang="ts">
/**
 * El índice de secciones que ocupa el carril, en vez de aire.
 *
 * EL PROBLEMA QUE RESUELVE, medido el 19-08-2026 en /investigaciones/suicidios-recursos a 1512px:
 * el contenedor de sección mide 1400px y la prosa 656px. Quedan 744px vacíos, el 53% de la banda,
 * a lo largo del 27% del alto del documento. La regla de app/DESIGN.md es explícita: «give the rail
 * something — a sticky section index — rather than air».
 *
 * LO QUE NO SE TOCA. La medida de lectura. `--inv-measure` rinde 74 caracteres por línea, el techo
 * de la banda 45-75. Estirar la prosa hasta los 1400px daría unos 160 caracteres, y a esa distancia
 * el ojo pierde el renglón al volver al principio de la línea siguiente. El hueco se llena, no se
 * estira.
 *
 * POR QUÉ VIVE FUERA DEL CONTENEDOR. Las tablas de estas piezas ocupan la banda entera. Un carril
 * dentro del contenedor las pisaría, y meter la sección en una rejilla rompería el fondo de ancho
 * completo de las bandas `alt`. Este índice se posiciona en el margen de la página, así que no
 * toca el ancho de ninguna evidencia ya publicada.
 *
 * CUÁNDO APARECE. Sólo cuando hay margen real: el contenedor mide 1400px, así que abajo de 1780px
 * no entra un índice legible sin encoger la evidencia. Abajo de ese ancho la página queda de una
 * sola pista, que es la otra salida que DESIGN.md permite. Nunca aparece en móvil.
 *
 * DE DÓNDE SALEN LAS ENTRADAS. De los `h2` que ya escribe cada pieza. No hay contenido que redactar
 * por página: el componente se cuelga del artículo y lee el DOM. Por eso sirve para las 21 piezas
 * sin tocar ninguna.
 */
interface Entrada { id: string, texto: string }

const entradas = ref<Entrada[]>([])
const activo = ref('')
let observador: IntersectionObserver | null = null

/** Un id estable y legible, sacado del propio título. */
function slug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function construir() {
  const art = document.querySelector('.inv')
  if (!art) return
  const vistos = new Set<string>()
  const filas: Entrada[] = []
  art.querySelectorAll<HTMLElement>('section.inv-sec').forEach((sec) => {
    const h = sec.querySelector('h2')
    const texto = h?.textContent?.trim()
    if (!texto) return
    let id = sec.id || slug(texto)
    // Dos secciones pueden compartir título. El id tiene que seguir siendo único.
    let n = 2
    while (vistos.has(id)) id = `${slug(texto)}-${n++}`
    vistos.add(id)
    if (!sec.id) sec.id = id
    filas.push({ id, texto })
  })
  entradas.value = filas

  observador?.disconnect()
  if (!filas.length) return
  observador = new IntersectionObserver(
    (obs) => {
      const visible = obs.filter(o => o.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible?.target.id) activo.value = visible.target.id
    },
    // La banda alta del viewport: marca la sección que se está leyendo, no la que asoma abajo.
    { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
  )
  filas.forEach((f) => {
    const el = document.getElementById(f.id)
    if (el) observador!.observe(el)
  })
}

/**
 * RECONSTRUIR, y por qué no sirve adivinar tiempos.
 *
 * En una navegación de SPA el layout no se desmonta: este componente sigue vivo mientras Nuxt
 * cambia el artículo debajo. Medido el 19-08-2026 yendo de /investigaciones/casos al hub y de ahí
 * a una pieza: leía las 7 secciones del hub y los 7 enlaces apuntaban a ids que ya no existían.
 *
 * Un reintento por temporizador no lo arregla, porque el conteo se estabiliza en la página VIEJA
 * antes de que monte la nueva. Así que no se adivina: se observa el contenedor y se reconstruye
 * cuando el DOM deja de cambiar. Eso cubre la hidratación, la navegación de SPA y cualquier
 * contenido que llegue después.
 */
const route = useRoute()
let mutaciones: MutationObserver | null = null
let debounce: ReturnType<typeof setTimeout> | null = null

function agendar() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(construir, 120)
}

function enganchar() {
  const raiz = document.getElementById('contenido')
  if (!raiz) return
  mutaciones?.disconnect()
  mutaciones = new MutationObserver(agendar)
  mutaciones.observe(raiz, { childList: true, subtree: true, characterData: true })
  agendar()
}

onMounted(enganchar)

watch(() => route.path, () => {
  entradas.value = []
  activo.value = ''
  agendar()
})

onBeforeUnmount(() => {
  if (debounce) clearTimeout(debounce)
  mutaciones?.disconnect()
  observador?.disconnect()
})
</script>

<template>
  <nav
    v-if="entradas.length > 2"
    class="inv-index"
    :aria-label="$t('inv.index.aria')"
  >
    <p class="inv-index__tag">
      {{ $t('inv.index.title') }}
    </p>
    <ol class="inv-index__list">
      <li
        v-for="(e, i) in entradas"
        :key="e.id"
      >
        <a
          :href="`#${e.id}`"
          class="inv-index__link"
          :class="{ 'is-active': activo === e.id }"
          :aria-current="activo === e.id ? 'true' : undefined"
        >
          <span class="inv-index__n">{{ i + 1 }}</span>
          <span class="inv-index__t">{{ e.texto }}</span>
        </a>
      </li>
    </ol>
  </nav>
</template>

<style scoped lang="scss">
/* El carril vive en el margen de la página, no en el contenedor: `--container` mide 1400px y las
   tablas lo ocupan entero. 1400/2 = 700, más 24 de aire, más 220 de ancho propio: hacen falta
   1888px de viewport para que entre sin pisar nada. Abajo de eso no se muestra. */
.inv-index { display: none; }

@media (min-width: 1888px) {
  .inv-index {
    display: block;
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    left: calc(50% - (var(--container) / 2) - var(--s-5) - 220px);
    width: 220px;
    max-height: 74vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    z-index: 3;
    padding-inline-start: var(--s-3);
    border-inline-start: 2px solid var(--rule);
  }

  .inv-index__tag {
    font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--text-muted); margin: 0 0 var(--s-3);
  }

  .inv-index__list { list-style: none; margin: 0; padding: 0; }
  .inv-index__list li + li { margin-top: var(--s-2); }

  .inv-index__link {
    display: grid; grid-template-columns: 1.4rem 1fr; gap: var(--s-2);
    align-items: baseline;
    color: var(--text-muted); text-decoration: none;
    font-size: 0.82rem; line-height: 1.35;
    padding: 2px 0;
  }
  .inv-index__link:hover { color: var(--celeste-deep); }
  .inv-index__link:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

  .inv-index__n { font-family: var(--font-mono); font-size: 0.72rem; opacity: 0.7; }

  /* La sección que se está leyendo. El oro es dinero y nunca acento: el activo va en celeste. */
  .inv-index__link.is-active { color: var(--celeste-deep); font-weight: 600; }
  .inv-index__link.is-active .inv-index__n { opacity: 1; }
}

@media (prefers-reduced-motion: no-preference) {
  .inv-index__link { transition: color 120ms ease; }
}
</style>
