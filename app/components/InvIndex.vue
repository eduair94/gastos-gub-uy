<script setup lang="ts">
/**
 * El índice de secciones que ocupa el carril, en vez de aire.
 *
 * EL PROBLEMA QUE RESUELVE, medido el 19-08-2026 en /investigaciones/suicidios-recursos a 1512px:
 * el contenedor de sección mide 1400px y la prosa 752px. Quedan 648px vacíos, a lo largo del 27%
 * del alto del documento. La regla de app/DESIGN.md es explícita: «give the rail something — a
 * sticky section index — rather than air».
 *
 * LO QUE NO SE TOCA. La medida de lectura. `--inv-measure` rinde 74 caracteres por línea, el techo
 * de la banda 45-75. El hueco se llena, no se estira.
 *
 * POR QUÉ VIVE FUERA DEL CONTENEDOR. Las tablas de estas piezas ocupan la banda entera. Un carril
 * dentro del contenedor las pisaría. Este índice se posiciona en el margen de la página, así que no
 * toca el ancho de ninguna evidencia ya publicada.
 *
 * CUÁNDO APARECE. Sólo cuando hay margen real: el contenedor mide 1400px, así que abajo de 1888px
 * no entra un índice legible sin encoger la evidencia. Nunca aparece en móvil.
 *
 * DE DÓNDE SALEN LAS ENTRADAS. De los `h2` que ya escribe cada pieza. No hay contenido que redactar
 * por página: el componente se cuelga del artículo y lee el DOM.
 *
 * LA FORMA DEL CARRIL, revisada el 19-08-2026 contra BBC, El País y El Observador.
 * Un índice lateral de diario es una lista secundaria, no un segundo artículo. Tres reglas salen
 * de ahí, y las tres estaban rotas:
 *
 * 1. Cada entrada ocupa dos renglones como máximo. Los `h2` de estas piezas son frases largas:
 *    sin corte, una entrada gastaba cuatro renglones y doce entradas tapaban media pantalla. El
 *    texto entero sigue disponible en el `title` del enlace.
 * 2. El cuerpo del enlace mide 12,5px. La banda de los diarios va de 12 a 14px para esta lista.
 * 3. El índice se ancla abajo de la barra, no al medio de la pantalla. Un bloque centrado se
 *    reacomoda cuando cambia el largo de la lista.
 *
 * EL SCROLL. La barra nativa dibujaba un riel gris de 16px pegado al texto. Acá la pista se
 * desborda sin barra visible hasta que el puntero entra o el foco cae adentro. El borde que se
 * puede seguir leyendo se marca con un degradado de 24px, arriba o abajo según lo que quede
 * cortado. Además la pista sigue a la sección activa: si el lector avanza por el artículo, el
 * índice se desplaza solo para mantener visible el renglón marcado.
 */
interface Entrada { id: string, texto: string }

const entradas = ref<Entrada[]>([])
const activo = ref('')
const pista = ref<HTMLElement | null>(null)
const corteArriba = ref(false)
const corteAbajo = ref(false)
let tick = 0

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

/**
 * QUÉ SECCIÓN SE ESTÁ LEYENDO. La última cuyo techo ya pasó la línea de los 120px.
 *
 * Antes esto lo hacía un IntersectionObserver con una banda angosta arriba del viewport. Fallaba
 * en un caso medido el 19-08-2026: al saltar de golpe al tope de la página, ninguna sección cruza
 * la banda, no hay callback, y el resaltado queda en la sección anterior. Una cuenta sobre el
 * scroll no tiene ese agujero: siempre hay una respuesta correcta, se llegue como se llegue.
 */
function marcar() {
  const filas = entradas.value
  if (!filas.length) return
  let actual = filas[0]!.id
  for (const f of filas) {
    const el = document.getElementById(f.id)
    if (el && el.getBoundingClientRect().top <= 120) actual = f.id
  }
  if (actual !== activo.value) {
    activo.value = actual
    nextTick(seguirActivo)
  }
}

/** Qué borde de la pista esconde contenido. Decide los dos degradados. */
function medirCortes() {
  const p = pista.value
  if (!p) return
  const resto = p.scrollHeight - p.clientHeight
  corteArriba.value = p.scrollTop > 4
  corteAbajo.value = resto > 4 && p.scrollTop < resto - 4
}

/**
 * El renglón marcado queda siempre a la vista.
 *
 * No se usa `scrollIntoView`: esa llamada sube por los ancestros y también mueve la ventana, así
 * que el artículo saltaba solo mientras el lector scrolleaba. Acá se escribe `scrollTop` de la
 * pista y nada más. El margen de 32px evita que el renglón activo quede pegado al degradado.
 */
function seguirActivo() {
  const p = pista.value
  if (!p) return
  const el = p.querySelector<HTMLElement>('.inv-index__link.is-active')
  if (!el) return
  const margen = 32
  const arriba = el.offsetTop - margen
  const abajo = el.offsetTop + el.offsetHeight + margen - p.clientHeight
  let destino = p.scrollTop
  if (arriba < p.scrollTop) destino = arriba
  else if (abajo > p.scrollTop) destino = abajo
  if (destino === p.scrollTop) return
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  p.scrollTo({ top: Math.max(0, destino), behavior: quieto ? 'auto' : 'smooth' })
}

function alScrollear() {
  if (tick) return
  tick = requestAnimationFrame(() => {
    tick = 0
    marcar()
  })
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

  marcar()
  nextTick(medirCortes)
}

/**
 * CUÁNDO SE RECONSTRUYE, y por qué no sirve adivinar tiempos.
 *
 * En una navegación de SPA el layout no se desmonta: este componente sigue vivo mientras Nuxt
 * cambia el artículo debajo. Medido el 19-08-2026 yendo de /investigaciones/casos al hub y de ahí
 * a una pieza: leía las 7 secciones del hub y los 7 enlaces apuntaban a ids que ya no existían.
 *
 * Un reintento por temporizador tampoco alcanza, porque el conteo se estabiliza en la página VIEJA
 * antes de que monte la nueva. Así que no se adivina: se observa el contenedor y se reconstruye
 * cuando el DOM deja de cambiar. Hay que observar `characterData` además de `childList`, porque el
 * texto de los `h2` llega como cambio de texto y no como alta de nodo.
 */
const route = useRoute()
let mutaciones: MutationObserver | null = null
let debounce: ReturnType<typeof setTimeout> | null = null

function agendar() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(construir, 120)
}

function alRedimensionar() {
  alScrollear()
  medirCortes()
}

function enganchar() {
  const raiz = document.getElementById('contenido')
  if (!raiz) return
  mutaciones?.disconnect()
  mutaciones = new MutationObserver(agendar)
  mutaciones.observe(raiz, { childList: true, subtree: true, characterData: true })
  window.addEventListener('scroll', alScrollear, { passive: true })
  window.addEventListener('resize', alRedimensionar, { passive: true })
  agendar()
}

onMounted(enganchar)

watch(() => route.path, () => {
  entradas.value = []
  activo.value = ''
  corteArriba.value = false
  corteAbajo.value = false
  agendar()
})

onBeforeUnmount(() => {
  if (debounce) clearTimeout(debounce)
  if (tick) cancelAnimationFrame(tick)
  mutaciones?.disconnect()
  window.removeEventListener('scroll', alScrollear)
  window.removeEventListener('resize', alRedimensionar)
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
    <div
      ref="pista"
      class="inv-index__scroll"
      :class="{ 'has-top': corteArriba, 'has-bottom': corteAbajo }"
      @scroll.passive="medirCortes"
    >
      <ol class="inv-index__list">
        <li
          v-for="e in entradas"
          :key="e.id"
        >
          <a
            :href="`#${e.id}`"
            class="inv-index__link"
            :class="{ 'is-active': activo === e.id }"
            :title="e.texto"
            :aria-current="activo === e.id ? 'location' : undefined"
          >{{ e.texto }}</a>
        </li>
      </ol>
    </div>
  </nav>
</template>

<style scoped lang="scss">
/* El carril vive en el margen de la página, no en el contenedor: `--container` mide 1400px y las
   tablas lo ocupan entero. 1400/2 = 700, más 24 de aire, más 220 de ancho propio: hacen falta
   1888px de viewport para que entre sin pisar nada. Abajo de eso no se muestra. */
.inv-index { display: none; }

@media (min-width: 1888px) {
  .inv-index {
    display: flex;
    flex-direction: column;
    position: fixed;
    /* Anclado abajo de la barra pegajosa de 62px, no centrado: la lista cambia de largo entre
       piezas y un bloque centrado se reacomoda con cada cambio. */
    top: calc(var(--header-h) + var(--s-6));
    /* `max()` es la guarda del borde: el `50%` se resuelve contra el ancho SIN la barra de scroll,
       pero el punto de corte de la media query la incluye. Justo en 1888px la cuenta daba -8px y el
       panel salía de la pantalla. El piso de 12px lo deja adentro sin pisar el contenedor. */
    left: max(var(--s-3), calc(50% - (var(--container) / 2) - var(--s-5) - 220px));
    /* 220px CON borde y relleno adentro: `box-sizing` es `border-box` en todo el sitio. La cuenta
       del punto de corte (1400 + 2 × (24 + 220) = 1888) sigue valiendo. */
    width: 220px;
    max-height: calc(100vh - var(--header-h) - var(--s-8));
    z-index: 3;

    /* EL PANEL ES LA CORRECCIÓN DE CONTRASTE, medida el 19-08-2026 a 1920 × 700.
       El índice es fijo y el artículo pasa por debajo. Arriba del todo pasa `.inv-cover`, que es
       una banda `--ink`: ahí el texto gris del índice quedaba a 1,6:1 y se perdía. Un fondo propio
       corta esa dependencia. El texto siempre cae sobre `--surface`, así que rinde 6,7:1 pase lo
       que pase abajo. */
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--r-lg);
    padding: var(--s-4) var(--s-2) var(--s-4) var(--s-3);
    /* En oscuro `--surface` y `--ink` quedan a 1,07:1, así que el filete solo no separa el panel
       de la banda. La sombra es la que dibuja el borde ahí. */
    box-shadow: var(--shadow-1);
  }

  .inv-index__tag {
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 0 0 var(--s-3);
    padding-inline-start: var(--s-3);
  }

  /* La pista de scroll. El degradado marca el borde por donde sigue habiendo lista; sin corte
     mide 0px y no se ve nada. */
  .inv-index__scroll {
    --corte: 24px;
    --fade-top: 0px;
    --fade-bottom: 0px;
    /* En una columna flex el ítem no baja de su alto de contenido sin esto, y la lista se
       derramaba abajo del carril en vez de scrollear. */
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-inline-end: var(--s-2);
    mask-image: linear-gradient(
      to bottom,
      transparent 0,
      #000 var(--fade-top),
      #000 calc(100% - var(--fade-bottom)),
      transparent 100%
    );

    /* Barra fina y sin riel. Aparece cuando el puntero entra o el foco cae adentro, que es como
       la muestran los índices de BBC y El País. */
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }

  .inv-index__scroll.has-top { --fade-top: var(--corte); }
  .inv-index__scroll.has-bottom { --fade-bottom: var(--corte); }

  .inv-index__scroll:hover,
  .inv-index__scroll:focus-within { scrollbar-color: var(--rule-strong) transparent; }

  .inv-index__scroll::-webkit-scrollbar { width: 4px; }
  .inv-index__scroll::-webkit-scrollbar-track { background: transparent; }
  .inv-index__scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: var(--r-full); }
  .inv-index__scroll:hover::-webkit-scrollbar-thumb,
  .inv-index__scroll:focus-within::-webkit-scrollbar-thumb { background: var(--rule-strong); }

  /* El filete de 1px es la columna del índice. La sección que se lee se marca con una barra de
     2px encima de ese filete: el color solo no alcanza para señalar posición. */
  .inv-index__list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-inline-start: 1px solid var(--rule);
  }

  .inv-index__link {
    position: relative;
    min-height: 24px;
    padding: var(--s-1) 0 var(--s-1) var(--s-3);
    color: var(--text-muted);
    text-decoration: none;
    /* 12,5px: la banda de 12 a 14px que usan estos índices en los diarios. */
    font-size: 0.78rem;
    line-height: 1.35;

    /* Dos renglones y corte. El título entero queda en el `title` del enlace. */
    display: -webkit-box;  /* stylelint-disable-line value-no-vendor-prefix */
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .inv-index__link::before {
    content: "";
    position: absolute;
    inset-block: 2px;
    inset-inline-start: -1px;
    width: 2px;
    background: transparent;
  }

  .inv-index__link:hover { color: var(--celeste-deep); }
  .inv-index__link:hover::before { background: var(--rule-strong); }
  .inv-index__link:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

  /* La sección que se está leyendo. El oro es dinero y nunca acento: el activo va en celeste. */
  .inv-index__link.is-active { color: var(--celeste-deep); font-weight: 600; }
  .inv-index__link.is-active::before { background: var(--celeste-deep); }
}

@media (prefers-reduced-motion: no-preference) {
  .inv-index__link { transition: color 120ms ease; }
  .inv-index__link::before { transition: background-color 120ms ease; }
}
</style>
