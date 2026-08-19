<script setup lang="ts">
/**
 * Cómo gestiona el Estado uruguayo sus recursos frente al suicidio.
 *
 * ORDEN DE LA PÁGINA, Y POR QUÉ ES ESE. Las líneas de ayuda van PRIMERO, antes de cualquier
 * cifra. Quien llega buscando ayuda no puede tener que bajar cuatro secciones para encontrarla.
 * La OMS pide exactamente eso.
 *
 * Después va la portada, y después las quince secciones en el orden del archivo de datos. Ese
 * orden va de la norma al dinero y del dinero a la persona. Primero lo que la ley rotula.
 * Después la única meta que el presupuesto se fija. Después lo que la persona paga. Recién al
 * final entra la medición propia sobre el corpus de compras. Invertir ese orden convertiría un
 * problema de salud pública en un problema de compras públicas, que no es lo que muestra el dato.
 *
 * La pieza publicada en /investigaciones/suicidios no se reescribe. Ésta contesta la pregunta
 * siguiente, que es de gestión.
 *
 * DECISIONES DE VISUALIZACIÓN, Y SON VINCULANTES. La serie de intentos de autoeliminación va
 * como CUADRO y nunca como línea. Entre 2024 y 2025 cambia la unidad, de episodios a personas, y
 * cambia la base poblacional. Dibujar la línea inventaría una tendencia que el dato no tiene.
 * La única serie dibujada son los egresos hospitalarios de 2018 a 2021, que comparten fuente y
 * definición, y el pie del gráfico lo dice.
 *
 * Los psicofármacos no pasan por `MoneyAmount`. Su monto se mide como cantidad por precio
 * unitario de línea, no con el monto normalizado del sitio. La regla del oro compara magnitudes
 * de una sola escala, así que ese monto va como número plano, con su advertencia de unidad
 * arriba.
 *
 * Las citas de la INDDHH van en un bloque propio con filo celeste. El filo de oro de `InvFinding`
 * es para texto legal literal, y una posición institucional no lo es.
 *
 * COMUNICACIÓN RESPONSABLE. Sin métodos, sin casos individuales, sin cifra presentada como
 * récord. El único método nombrado es «restringir el acceso a medios letales», al nivel de
 * política pública en que lo escriben el MSP y la OMS.
 */
import { invContent } from '~/data/investigaciones'
import {
  SR_ART38,
  SR_ATLAS2020,
  SR_AYUDA,
  SR_COMPARABLE,
  SR_EGRESOS,
  SR_EMSE,
  SR_FAMILIAS,
  SR_FRO_2021,
  SR_HITOS,
  SR_INDICADORES_TOMO2,
  SR_INTENTOS,
  SR_INTENTOS_SEXO,
  SR_LEYES,
  SR_LINEAS,
  SR_MH4,
  SR_MODOS,
  SR_PARTIDAS,
  SR_PEDIDOS,
  SR_PROVEEDORES_TOP,
  SR_PSICO_GRUPOS,
  SR_RECOMENDACIONES,
  SR_RUIDO,
  SR_SOURCES,
  SR_TOKENS_CERO,
  srContent,
} from '~/data/investigaciones-suicidios-recursos'

const { locale, t } = useI18n()
const c = computed(() => invContent(locale.value))
const cx = computed(() => srContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: cx.value.title },
])

useSeo(() => ({
  title: cx.value.title,
  description: cx.value.dek.slice(0, 155),
  path: '/investigaciones/suicidios-recursos',
  type: 'article',
  kicker: 'Investigación',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': cx.value.title,
      'description': cx.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
    },
    breadcrumbLd,
  ],
}))

/* ── Formato ──────────────────────────────────────────────────────────────── */
const intl = computed(() => (locale.value === 'en' ? 'en-US' : 'es-UY'))
const nf = computed(() => new Intl.NumberFormat(intl.value))
const nf2 = computed(() => new Intl.NumberFormat(intl.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const nf1 = computed(() => new Intl.NumberFormat(intl.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

const heroTiles = computed(() => cx.value.tiles.map(x => ({ value: x.n, label: x.l, sub: x.s })))

/* ── Las líneas de ayuda ──────────────────────────────────────────────────── */
type AyudaKey = keyof typeof cx.value.ayudaLabels
const ayuda = computed(() => SR_AYUDA.map(a => ({ ...a, label: cx.value.ayudaLabels[a.key as AyudaKey] })))

/* ── 3 · Las siete leyes ──────────────────────────────────────────────────── */
type LeyKey = keyof typeof cx.value.leyesLabels
const leyesRows = computed(() => SR_LEYES.map(l => ({
  ...l,
  tipo: cx.value.leyesLabels[l.key as LeyKey],
})))
const leyesColumns = computed(() => [
  { key: 'ley', label: cx.value.leyesCols.ley, mono: true, nowrap: true },
  { key: 'tipo', label: cx.value.leyesCols.tipo, primary: true, minWidth: '240px' },
  { key: 'suicid', label: cx.value.leyesCols.suicid, align: 'end' as const, mono: true },
  { key: 'saludMental', label: cx.value.leyesCols.sm, align: 'end' as const, mono: true },
])

/* Los seis países que sí reportaron en el único año del indicador. */
const mh4Columns = computed(() => [
  { key: 'pais', label: cx.value.mh4Cols.pais, primary: true, minWidth: '160px' },
  { key: 'pct', label: cx.value.mh4Cols.pct, align: 'end' as const, mono: true },
])

/* ── 4 · La única meta ────────────────────────────────────────────────────── */
type IndicadorKey = keyof typeof cx.value.indicadoresLabels
const indicadoresRows = computed(() => SR_INDICADORES_TOMO2.map(i => ({
  ...i,
  name: cx.value.indicadoresLabels[i.key as IndicadorKey],
})))
const indicadoresColumns = computed(() => [
  { key: 'name', label: cx.value.indicadoresCols.key, primary: true, minWidth: '300px' },
  { key: 'base', label: cx.value.indicadoresCols.base, align: 'end' as const, mono: true },
  { key: 'meta', label: cx.value.indicadoresCols.meta, align: 'end' as const, mono: true },
])
function flagSuicidioPpl(row: { key: string }) {
  return row.key === 'suicidioPpl' ? 'rowflag' : undefined
}

/* ── 5 · Las cinco partidas ───────────────────────────────────────────────── */
type DestinoKey = keyof typeof cx.value.partidasDestinos
const partidasRows = computed(() => SR_PARTIDAS.map(p => ({
  ...p,
  destino: cx.value.partidasDestinos[p.key as DestinoKey],
})))
const partidasColumns = computed(() => [
  { key: 'art', label: cx.value.partidasCols.art, mono: true, nowrap: true },
  { key: 'inciso', label: cx.value.partidasCols.inciso, primary: true, nowrap: true },
  { key: 'y2026', label: cx.value.partidasCols.y2026, align: 'end' as const },
  { key: 'y2027', label: cx.value.partidasCols.y2027, align: 'end' as const },
  { key: 'destino', label: cx.value.partidasCols.destino, minWidth: '320px' },
])

/* ── 6 · Los tres Modos ───────────────────────────────────────────────────── */
type ModoKey = keyof typeof cx.value.modosLabels
const modosRows = computed(() => SR_MODOS.map(m => ({
  ...m,
  name: cx.value.modosLabels[m.key as ModoKey],
  tasa: cx.value.modosTasa[m.key as ModoKey],
})))
const modosColumns = computed(() => [
  { key: 'name', label: cx.value.modosCols.modo, primary: true, minWidth: '300px' },
  { key: 'adultos', label: cx.value.modosCols.adultos, align: 'end' as const, mono: true },
  { key: 'menores', label: cx.value.modosCols.menores, align: 'end' as const, mono: true },
  { key: 'tasa', label: cx.value.modosCols.tasa, muted: true, minWidth: '180px' },
])

/* ── 7 · Los cuatro hitos ─────────────────────────────────────────────────── */
type HitoKey = keyof typeof cx.value.hitosLabels
const hitosRows = computed(() => SR_HITOS.map(h => ({
  ...h,
  name: cx.value.hitosLabels[h.key as HitoKey],
})))
const hitosColumns = computed(() => [
  { key: 'name', label: cx.value.hitosCols.key, primary: true, minWidth: '300px' },
  { key: 'peso', label: cx.value.hitosCols.peso, align: 'end' as const, mono: true },
  { key: 'monto', label: cx.value.hitosCols.monto, align: 'end' as const, mono: true },
])

/* ── 8 · Lo que el corpus ve ──────────────────────────────────────────────── *
 * Los rótulos de ruido traen el token y lo que la compra es en realidad, con un guión
 * largo entre los dos. La tabla los separa en sus dos columnas. Si el guión no está,
 * el rótulo entero queda en la primera columna. */
function splitDash(s: string): { head: string, tail: string } {
  const i = s.indexOf(' — ')
  return i === -1 ? { head: s, tail: '' } : { head: s.slice(0, i), tail: s.slice(i + 3) }
}
type RuidoKey = keyof typeof cx.value.ruidoLabels
const ruidoRows = computed(() => SR_RUIDO.map((r) => {
  const parts = splitDash(cx.value.ruidoLabels[r.key as RuidoKey])
  return { ...r, token: parts.head, que: parts.tail }
}))
const ruidoColumns = computed(() => [
  { key: 'token', label: cx.value.ruidoCols.key, primary: true, minWidth: '220px' },
  { key: 'ocids', label: cx.value.ruidoCols.ocids, align: 'end' as const, mono: true },
  { key: 'uyu', label: cx.value.ruidoCols.uyu, align: 'end' as const },
  { key: 'que', label: cx.value.ruidoCols.que, muted: true, minWidth: '280px' },
])

type FamiliaKey = keyof typeof cx.value.familiasLabels
type CondicionKey = keyof typeof cx.value.familiasCondiciones
const familiasRows = computed(() => SR_FAMILIAS.map(f => ({
  ...f,
  name: cx.value.familiasLabels[f.key as FamiliaKey],
  cond: f.condicion ? cx.value.familiasCondiciones[f.condicion as CondicionKey] : '—',
})))
const familiasColumns = computed(() => [
  { key: 'name', label: cx.value.familiasCols.key, primary: true, minWidth: '280px' },
  { key: 'ocids', label: cx.value.familiasCols.ocids, align: 'end' as const, mono: true },
  { key: 'uyu', label: cx.value.familiasCols.uyu, align: 'end' as const },
  { key: 'cond', label: cx.value.familiasCols.cond, muted: true, minWidth: '300px' },
])

type ProveedorKey = keyof typeof cx.value.proveedoresQue
const proveedoresRows = computed(() => SR_PROVEEDORES_TOP.map(p => ({
  ...p,
  que: cx.value.proveedoresQue[p.key as ProveedorKey],
})))
const proveedoresColumns = computed(() => [
  { key: 'name', label: cx.value.proveedoresCols.name, primary: true, minWidth: '260px' },
  { key: 'uyu', label: cx.value.proveedoresCols.uyu, align: 'end' as const },
  { key: 'ocids', label: cx.value.proveedoresCols.ocids, align: 'end' as const, mono: true },
  { key: 'que', label: cx.value.proveedoresCols.que, muted: true, minWidth: '280px' },
])

/* Los psicofármacos van en número plano. No usan el monto normalizado del sitio. */
type GrupoKey = keyof typeof cx.value.psicoGruposLabels
const psicoRows = computed(() => SR_PSICO_GRUPOS.map(g => ({
  ...g,
  name: cx.value.psicoGruposLabels[g.key as GrupoKey],
})))
const psicoColumns = computed(() => [
  { key: 'name', label: cx.value.psicoGruposCols.key, primary: true, minWidth: '260px' },
  { key: 'uyu', label: cx.value.psicoGruposCols.uyu, align: 'end' as const, mono: true },
])

/* ── 9 · Las dos líneas ───────────────────────────────────────────────────── */
type LineaKey = keyof typeof cx.value.lineasLabels
const lineasRows = computed(() => SR_LINEAS.map(l => ({
  ...l,
  object: cx.value.lineasLabels[l.key as LineaKey],
})))
const lineasColumns = computed(() => [
  { key: 'year', label: cx.value.lineasCols.year, mono: true, nowrap: true },
  { key: 'buyer', label: cx.value.lineasCols.buyer, primary: true, minWidth: '300px' },
  { key: 'supplier', label: cx.value.lineasCols.supplier, minWidth: '180px' },
  { key: 'uyu', label: cx.value.lineasCols.uyu, align: 'end' as const },
])

/* ── 10 · Los intentos, como cuadro ───────────────────────────────────────── *
 * NUNCA COMO LÍNEA. Las filas no comparten unidad, y entre 2024 y 2025 cambia además la
 * base poblacional. Una línea sobre estas filas dibujaría una tendencia inexistente. */
type UnidadKey = keyof typeof cx.value.intentosUnidades
type FuenteKey = keyof typeof cx.value.intentosFuentes
const intentosRows = computed(() => SR_INTENTOS.map((r) => {
  const esTasa = r.unidad === 'tasaEpisodios' || r.unidad === 'tasaPersonas'
  return {
    key: r.key,
    periodo: r.periodo,
    value: r.value === null
      ? cx.value.intentosSinConteo
      : (esTasa ? nf2.value.format(r.value) : nf.value.format(r.value)),
    unidad: cx.value.intentosUnidades[r.unidad as UnidadKey],
    source: cx.value.intentosFuentes[r.source as FuenteKey],
    esAnio: r.esAnio ? cx.value.comparableVale.si : cx.value.comparableVale.no,
  }
}))
const intentosColumns = computed(() => [
  { key: 'periodo', label: cx.value.intentosCols.periodo, primary: true, mono: true, minWidth: '190px' },
  { key: 'value', label: cx.value.intentosCols.value, align: 'end' as const, mono: true },
  { key: 'unidad', label: cx.value.intentosCols.unidad, minWidth: '260px' },
  { key: 'source', label: cx.value.intentosCols.source, muted: true, minWidth: '240px' },
  { key: 'esAnio', label: cx.value.intentosCols.esAnio, mono: true, nowrap: true },
])

const sexoRows = computed(() => SR_INTENTOS_SEXO.map((r) => {
  const esTasa = r.unidad === 'tasaEpisodios' || r.unidad === 'tasaPersonas'
  const f = (v: number) => (esTasa ? nf2.value.format(v) : nf.value.format(v))
  return {
    key: r.key,
    year: r.year,
    mujeres: f(r.mujeres),
    varones: f(r.varones),
    unidad: cx.value.intentosUnidades[r.unidad as UnidadKey],
  }
}))
const sexoColumns = computed(() => [
  { key: 'year', label: cx.value.sexoCols.year, primary: true, mono: true, nowrap: true },
  { key: 'mujeres', label: cx.value.sexoCols.mujeres, align: 'end' as const, mono: true },
  { key: 'varones', label: cx.value.sexoCols.varones, align: 'end' as const, mono: true },
  { key: 'unidad', label: cx.value.sexoCols.unidad, muted: true, minWidth: '260px' },
])

type ComparableKey = keyof typeof cx.value.comparableLabels
const comparableRows = computed(() => SR_COMPARABLE.map(x => ({
  ...x,
  name: cx.value.comparableLabels[x.key as ComparableKey],
  valeLabel: cx.value.comparableVale[x.vale],
  why: cx.value.comparableWhy[x.key as ComparableKey],
})))
const comparableColumns = computed(() => [
  { key: 'name', label: cx.value.comparableCols.key, primary: true, minWidth: '280px' },
  { key: 'valeLabel', label: cx.value.comparableCols.vale, nowrap: true },
  { key: 'why', label: cx.value.comparableCols.why, muted: true, minWidth: '320px' },
])

/* La ficha de papel de 2021: el único corte pre-digital que el MSP publicó. */
type FroKey = keyof typeof cx.value.froLabels
const FRO_ORDER = ['total', 'e1014', 'e1519', 'e2024', 'mujeres', 'varones', 'sinDatoConsulta'] as const
const froRows = computed(() => FRO_ORDER.map(k => ({
  key: k,
  name: cx.value.froLabels[k as FroKey],
  value: nf.value.format(SR_FRO_2021[k]),
})))
const froColumns = computed(() => [
  { key: 'name', label: cx.value.froCols.key, primary: true, minWidth: '260px' },
  { key: 'value', label: cx.value.froCols.value, align: 'end' as const, mono: true },
])

/* La encuesta escolar, que es la única fuente con dos puntos comparables entre sí. */
const emseRows = computed(() => {
  const years = [...new Set(SR_EMSE.map(e => e.year))]
  const pick = (y: number, k: string) => SR_EMSE.find(e => e.year === y && e.key === k)?.pct
  const show = (v?: number) => (v === undefined ? '—' : `${nf1.value.format(v)}%`)
  return years.map(y => ({
    key: String(y),
    year: y,
    total: show(pick(y, 'total')),
    mujeres: show(pick(y, 'mujeres')),
    varones: show(pick(y, 'varones')),
  }))
})
const emseColumns = computed(() => [
  { key: 'year', label: cx.value.sexoCols.year, primary: true, mono: true, nowrap: true },
  { key: 'total', label: cx.value.intentosCols.value, align: 'end' as const, mono: true },
  { key: 'mujeres', label: cx.value.sexoCols.mujeres, align: 'end' as const, mono: true },
  { key: 'varones', label: cx.value.sexoCols.varones, align: 'end' as const, mono: true },
])

/* La única serie que se dibuja: misma fuente y misma definición en los cuatro años. */
const egresosLabels = computed(() => SR_EGRESOS.map(e => String(e.year)))
const egresosSeries = computed(() => [{
  label: cx.value.egresosTitulo,
  values: SR_EGRESOS.map(e => e.value),
  colorVar: 'celeste-deep',
  fallback: '#3c6d9c',
}])

/* ── 11 · El artículo 38, antes y ahora ───────────────────────────────────── */
type Art38Key = keyof typeof cx.value.art38Labels
const art38Rows = computed(() => SR_ART38.map(d => ({
  ...d,
  name: cx.value.art38Labels[d.key as Art38Key],
  antesText: d.antes ?? cx.value.art38Suprimido,
  ahoraText: d.ahora ?? cx.value.art38Suprimido,
})))
const art38Columns = computed(() => [
  { key: 'name', label: cx.value.art38Cols.key, primary: true, minWidth: '190px' },
  { key: 'antesText', label: cx.value.art38Cols.antes, minWidth: '320px' },
  { key: 'ahoraText', label: cx.value.art38Cols.ahora, minWidth: '320px' },
])
function flagProhibicion(row: { key: string }) {
  return row.key === 'prohibicion' ? 'rowflag' : undefined
}

/* ── 12 · Lo que el país le declaró a la OMS ──────────────────────────────── */
type AtlasKey = keyof typeof cx.value.atlasLabels
const ATLAS_ORDER = [
  { key: 'psiquiatras', n: SR_ATLAS2020.psiquiatras, tasa: SR_ATLAS2020.psiquiatrasTasa },
  { key: 'psiquiatrasNyA', n: SR_ATLAS2020.psiquiatrasNyA, tasa: SR_ATLAS2020.psiquiatrasNyATasa },
  { key: 'enfermeros', n: SR_ATLAS2020.enfermeros, tasa: SR_ATLAS2020.enfermerosTasa },
  { key: 'psicologos', n: SR_ATLAS2020.psicologos, tasa: SR_ATLAS2020.psicologosTasa },
  { key: 'totalFicha', n: SR_ATLAS2020.totalFicha, tasa: SR_ATLAS2020.totalFichaTasa },
  { key: 'totalCorregido', n: SR_ATLAS2020.totalCorregido, tasa: SR_ATLAS2020.totalCorregidoTasa },
]
const atlasRows = computed(() => ATLAS_ORDER.map(r => ({
  key: r.key,
  name: cx.value.atlasLabels[r.key as AtlasKey],
  n: nf.value.format(r.n),
  tasa: nf2.value.format(r.tasa),
})))
const atlasColumns = computed(() => [
  { key: 'name', label: cx.value.atlasCols.key, primary: true, minWidth: '280px' },
  { key: 'n', label: cx.value.atlasCols.n, align: 'end' as const, mono: true },
  { key: 'tasa', label: cx.value.atlasCols.tasa, align: 'end' as const, mono: true },
])

/* ── 13 · Las cincuenta y dos recomendaciones ─────────────────────────────── */
type OrgKey = keyof typeof cx.value.orgLabels
type EstadoKey = keyof typeof cx.value.estadoLabels
type RecoKey = keyof typeof cx.value.recos
const recosRows = computed(() => SR_RECOMENDACIONES.map(r => ({
  ...r,
  orgLabel: cx.value.orgLabels[r.org as OrgKey],
  estadoLabel: cx.value.estadoLabels[r.estado as EstadoKey],
  fuente: cx.value.recos[r.id as RecoKey],
})))
const recosColumns = computed(() => [
  { key: 'id', label: cx.value.recosCols.id, mono: true, nowrap: true },
  { key: 'orgLabel', label: cx.value.recosCols.org, primary: true, minWidth: '200px' },
  { key: 'cita', label: cx.value.recosCols.cita, minWidth: '340px' },
  { key: 'estadoLabel', label: cx.value.recosCols.estado, minWidth: '160px' },
  { key: 'fuente', label: cx.value.recosCols.fuente, muted: true, minWidth: '340px' },
])
function flagRemate(row: { id: string }) {
  return row.id === 'R5' ? 'rowflag' : undefined
}

/* ── 14 · Los cuarenta y seis pedidos, por bloque ─────────────────────────── */
type BloqueKey = keyof typeof cx.value.bloqueLabels
type PedidoKey = keyof typeof cx.value.pedidos
interface PedidoRow { id: string, organismo: string, q: string, why: string }
const pedidoGroups = computed(() => {
  const groups: { key: string, title: string, rows: PedidoRow[] }[] = []
  for (const p of SR_PEDIDOS) {
    const texto = cx.value.pedidos[p.id as PedidoKey]
    let g = groups.find(x => x.key === p.bloque)
    if (!g) {
      g = { key: p.bloque, title: cx.value.bloqueLabels[p.bloque as BloqueKey], rows: [] }
      groups.push(g)
    }
    g.rows.push({ id: p.id, organismo: p.organismo, q: texto.q, why: texto.why })
  }
  return groups
})

/* ── 15 · Fuentes ─────────────────────────────────────────────────────────── */
const sourceGroups = computed(() => SR_SOURCES.map(g => ({
  title: g.key === 'oficial' ? cx.value.srcOficial : cx.value.srcPrensa,
  items: g.items,
})))

const leakFacts = computed(() => [
  'En siete leyes seguidas de presupuesto y rendición de cuentas, entre 2020 y 2025, la palabra «suicidio» aparece cero veces en el texto articulado.',
  'El único indicador de suicidio del Presupuesto 2025-2029 es carcelario: línea base 93,09 y las cinco metas anuales en 93,09.',
  'Agotar el tope anual del Modo 2 le cuesta 9.072 pesos a una persona adulta con intento de autoeliminación, con el tarifario de Camdel IAMPP al 1º de enero de 2026.',
])
</script>

<template>
  <div class="inv">
    <!-- 1 · Las líneas de ayuda van primero, y eso incluye la portada. Nada se pone antes de esto. -->
    <InvSection
      alt
      :eyebrow="cx.ayudaTag"
      :title="cx.ayudaTitle"
      :dek="cx.ayudaP"
    >
      <ul class="sr-help">
        <li
          v-for="a in ayuda"
          :key="a.key"
        >
          <b class="sr-help__n">{{ a.phone }}</b>
          <span>{{ a.label }}</span>
        </li>
      </ul>
      <p class="inv-note">
        {{ cx.ayudaNota }}
      </p>
    </InvSection>

    <InvCover
      tone="celeste"
      :fields="[
        { label: t('inv.file.alcance'), value: cx.fileScope },
        { label: t('inv.file.periodo'), value: cx.filePeriod },
        { value: cx.fileSource },
      ]"
      :kicker="cx.kicker"
      :title="cx.title"
      :dek="cx.dek"
      :chips="cx.chips"
    />

    <!-- 2 · La portada de cifras -->
    <InvSection>
      <div>
        <p class="u-eyebrow">
          {{ cx.statHead }}
        </p>
        <p class="sr-lead">
          {{ cx.statSub }}
        </p>
      </div>
      <InvTiles :items="heroTiles" />
    </InvSection>

    <!-- 3 · No hay partida que diga «prevención del suicidio» -->
    <InvSection
      alt
      :eyebrow="cx.sumarTag"
      :title="cx.sumarTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.sumar"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="leyesColumns"
        :rows="leyesRows"
        row-key="ley"
        :min-width="620"
      />
      <p class="inv-note">
        {{ cx.leyesNota }}
      </p>

      <h3 class="inv-subhead">
        {{ cx.omisionTitle }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.omision"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
      <p class="inv-note">
        {{ cx.omisionNota }}
      </p>

      <h3 class="inv-subhead">
        {{ cx.mh4Title }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.mh4"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
      <InvLedger
        :columns="mh4Columns"
        :rows="SR_MH4.vecinos"
        row-key="pais"
        :min-width="420"
      >
        <template #cell:pct="{ row }">
          {{ nf2.format(row.pct) }}%
        </template>
      </InvLedger>
      <p class="inv-note">
        {{ cx.escalaNota }}
      </p>
    </InvSection>

    <!-- 4 · La única meta es carcelaria -->
    <InvSection
      :eyebrow="cx.carcelTag"
      :title="cx.carcelTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.carcel"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="indicadoresColumns"
        :rows="indicadoresRows"
        row-key="key"
        :min-width="640"
        :row-class="flagSuicidioPpl"
      >
        <template #cell:base="{ row }">
          {{ nf2.format(row.base) }}
        </template>
        <template #cell:meta="{ row }">
          {{ nf2.format(row.meta) }}
        </template>
      </InvLedger>
      <p class="inv-note">
        {{ cx.carcelAviso }}
      </p>
    </InvSection>

    <!-- 5 · Lo que sí está rotulado -->
    <InvSection
      alt
      :eyebrow="cx.partidasTag"
      :title="cx.partidasTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.partidas"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="partidasColumns"
        :rows="partidasRows"
        row-key="art"
        :min-width="880"
      >
        <template #cell:y2026="{ row }">
          <MoneyAmount
            :amount="row.y2026"
            size="sm"
          />
        </template>
        <template #cell:y2027="{ row }">
          <MoneyAmount
            :amount="row.y2027"
            size="sm"
          />
        </template>
      </InvLedger>
      <p class="inv-note">
        {{ cx.partidasUnidad }}
      </p>

      <h3 class="inv-subhead">
        {{ cx.art508Titulo }}
      </h3>
      <p class="inv-note">
        {{ cx.art508Nota }}
      </p>
    </InvSection>

    <!-- 6 · El precio de la ayuda -->
    <InvSection
      :eyebrow="cx.precioTag"
      :title="cx.precioTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.precio"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="modosColumns"
        :rows="modosRows"
        row-key="key"
        :min-width="700"
      />

      <h3 class="inv-subhead">
        {{ cx.tarifarioTitulo }}
      </h3>
      <div>
        <p class="inv-note">
          {{ cx.tarifarioNota }}
        </p>
        <p class="inv-note sr-note-gap">
          {{ cx.decreto114Nota }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.expedienteTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.expediente"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- 7 · Lo que el Estado paga por seguir a alguien -->
    <InvSection
      alt
      :eyebrow="cx.pagoTag"
      :title="cx.pagoTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.pago"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="hitosColumns"
        :rows="hitosRows"
        row-key="key"
        :min-width="620"
      >
        <template #cell:peso="{ row }">
          {{ row.peso }}%
        </template>
        <template #cell:monto="{ row }">
          {{ nf2.format(row.monto) }}
        </template>
      </InvLedger>
      <div>
        <p class="inv-note">
          {{ cx.hitosNota }}
        </p>
        <p class="inv-note sr-note-gap">
          {{ cx.metaUnidad }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.normaTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.norma"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
      <div>
        <p class="inv-note">
          {{ cx.normaNota }}
        </p>
        <p class="inv-note sr-note-gap">
          {{ cx.relojesNota }}
        </p>
      </div>
    </InvSection>

    <!-- 8 · Lo que el corpus ve -->
    <InvSection
      :eyebrow="cx.corpusTag"
      :title="cx.corpusTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.corpus"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="ruidoColumns"
        :rows="ruidoRows"
        row-key="key"
        :min-width="820"
      >
        <template #cell:uyu="{ row }">
          <MoneyAmount
            :amount="row.uyu"
            size="sm"
          />
        </template>
      </InvLedger>

      <h3 class="inv-subhead">
        {{ cx.familiasTitulo }}
      </h3>
      <InvLedger
        :columns="familiasColumns"
        :rows="familiasRows"
        row-key="key"
        :min-width="860"
      >
        <template #cell:uyu="{ row }">
          <MoneyAmount
            :amount="row.uyu"
            size="sm"
          />
        </template>
      </InvLedger>
      <p class="inv-note">
        {{ cx.familiaCrisis }}
      </p>

      <h3 class="inv-subhead">
        {{ cx.saludMentalTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.saludMental"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.tokensCeroTitulo }}
      </h3>
      <ul class="sr-tokens">
        <li
          v-for="tok in SR_TOKENS_CERO"
          :key="tok"
        >
          {{ tok }}
        </li>
      </ul>
      <p class="inv-note">
        {{ cx.tokensCeroNota }}
      </p>

      <h3 class="inv-subhead">
        {{ cx.asseTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.asse"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.mspTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.msp"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.proveedoresTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.proveedores"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
      <InvLedger
        :columns="proveedoresColumns"
        :rows="proveedoresRows"
        row-key="rut"
        :min-width="860"
      >
        <template #cell:uyu="{ row }">
          <MoneyAmount
            :amount="row.uyu"
            size="sm"
          />
        </template>
      </InvLedger>
      <p class="inv-note">
        {{ cx.corpusFecha }}
      </p>
    </InvSection>

    <!-- 8b · Los psicofármacos, en otra unidad. La advertencia va antes de la cifra. -->
    <InvSection
      alt
      :eyebrow="cx.psicoTag"
      :title="cx.psicoTitle"
    >
      <InvFinding
        :kicker="cx.psicoTag"
        :body="cx.psicoAviso"
      />

      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.psico"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="psicoColumns"
        :rows="psicoRows"
        row-key="key"
        :min-width="480"
      >
        <template #cell:uyu="{ row }">
          {{ nf.format(row.uyu) }}
        </template>
      </InvLedger>
      <p class="inv-note">
        {{ cx.psicoNota }}
      </p>
    </InvSection>

    <!-- 9 · Dos líneas en veinticuatro años -->
    <InvSection
      :eyebrow="cx.lineasTag"
      :title="cx.lineasTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.lineas"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="lineasColumns"
        :rows="lineasRows"
        row-key="ocid"
        :min-width="880"
      >
        <template #cell:buyer="{ row }">
          <span class="sr-buyer">{{ row.buyer }}</span>
          <span class="sr-object">{{ row.object }}</span>
        </template>
        <template #cell:supplier="{ row }">
          <span v-if="row.supplier">{{ row.supplier }}</span>
          <span
            v-else
            class="sr-nd"
          >{{ cx.lineasSinAdj }}</span>
        </template>
        <template #cell:uyu="{ row }">
          <MoneyAmount
            :amount="row.uyu"
            size="sm"
          />
        </template>
      </InvLedger>
    </InvSection>

    <!-- 10 · Los intentos. Cuadro, nunca línea: las filas no comparten unidad. -->
    <InvSection
      alt
      :eyebrow="cx.intentosTag"
      :title="cx.intentosTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.intentos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="intentosColumns"
        :rows="intentosRows"
        row-key="key"
        :min-width="900"
      />
      <div>
        <p class="inv-note">
          {{ cx.intentosNota }}
        </p>
        <p class="inv-note sr-note-gap">
          {{ cx.intentosPrensa }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.sexoTitulo }}
      </h3>
      <InvLedger
        :columns="sexoColumns"
        :rows="sexoRows"
        row-key="key"
        :min-width="660"
      />
      <p class="inv-note">
        {{ cx.sexoNota }}
      </p>

      <h3 class="inv-subhead">
        {{ cx.comparableTitulo }}
      </h3>
      <InvLedger
        :columns="comparableColumns"
        :rows="comparableRows"
        row-key="key"
        :min-width="820"
      />

      <h3 class="inv-subhead">
        {{ cx.paralelasTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.paralelas"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="froColumns"
        :rows="froRows"
        row-key="key"
        :min-width="460"
      />

      <h3 class="inv-subhead">
        {{ cx.emseTitulo }}
      </h3>
      <InvLedger
        :columns="emseColumns"
        :rows="emseRows"
        row-key="key"
        :min-width="520"
      />

      <ChartBlock
        :title="cx.egresosTitulo"
        :meta="cx.comparableWhy.egresos"
        :scroll="false"
        :level="3"
      >
        <TrendLines
          :labels="egresosLabels"
          :series="egresosSeries"
          format="count"
          :label="cx.egresosTitulo"
        />
      </ChartBlock>

      <p class="inv-note">
        {{ cx.estimacionNota }}
      </p>

      <h3 class="inv-subhead">
        {{ cx.reiteracionTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.reiteracion"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- 11 · La ley que cambió dentro de un presupuesto -->
    <InvSection
      :eyebrow="cx.leyTag"
      :title="cx.leyTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.ley"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="art38Columns"
        :rows="art38Rows"
        row-key="key"
        :min-width="900"
        :row-class="flagProhibicion"
      />

      <h3 class="inv-subhead">
        {{ cx.inddhhTitulo }}
      </h3>
      <div class="sr-quotes">
        <blockquote class="sr-quote">
          {{ cx.inddhhCita }}
        </blockquote>
        <blockquote class="sr-quote">
          {{ cx.inddhhCita2 }}
        </blockquote>
      </div>
      <p class="inv-note">
        {{ cx.inddhhNota }}
      </p>

      <h3 class="inv-subhead">
        {{ cx.cronogramaTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.cronograma"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.contralorTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.contralor"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.dispositivosTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.dispositivos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- 12 · Recursos humanos. La frase de bloqueo va antes de cualquier cifra. -->
    <InvSection
      alt
      :eyebrow="cx.rrhhTag"
      :title="cx.rrhhTitle"
    >
      <InvFinding
        :kicker="cx.rrhhTag"
        :body="cx.rrhhBloqueo"
      />

      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.rrhh"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.controlTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.control"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.atlasTitulo }}
      </h3>
      <InvLedger
        :columns="atlasColumns"
        :rows="atlasRows"
        row-key="key"
        :min-width="560"
      />
      <p class="inv-note">
        {{ cx.atlasNota }}
      </p>

      <h3 class="inv-subhead">
        {{ cx.regionalTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.regional"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.atlas2024Titulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.atlas2024"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.territorioTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.territorio"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <h3 class="inv-subhead">
        {{ cx.esperaTitulo }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.espera"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
      <div>
        <p class="inv-note">
          {{ cx.estrategiaRrhhNota }}
        </p>
        <p class="inv-note sr-note-gap">
          {{ cx.llamadasNota }}
        </p>
      </div>
    </InvSection>

    <!-- 13 · Las cincuenta y dos recomendaciones -->
    <InvSection
      :eyebrow="cx.recosTag"
      :title="cx.recosTitle"
      :dek="cx.recosP"
    >
      <InvLedger
        :columns="recosColumns"
        :rows="recosRows"
        row-key="id"
        :min-width="1060"
        :row-class="flagRemate"
      />
      <p class="inv-note">
        {{ cx.recosRemate }}
      </p>
    </InvSection>

    <!-- 14 · Los cuarenta y seis pedidos de datos -->
    <InvSection
      alt
      :eyebrow="cx.pedidosTag"
      :title="cx.pedidosTitle"
      :dek="cx.pedidosP"
    >
      <div
        v-for="g in pedidoGroups"
        :key="g.key"
      >
        <h3 class="inv-subhead">
          {{ g.title }}
        </h3>
        <ul class="sr-asks">
          <li
            v-for="p in g.rows"
            :key="p.id"
          >
            <span class="sr-asks__id u-mono">{{ p.id }}</span>
            <div class="sr-asks__body">
              <p class="sr-asks__q">
                {{ p.q }}
              </p>
              <p class="sr-asks__org u-mono">
                {{ p.organismo }}
              </p>
              <p class="sr-asks__why">
                {{ p.why }}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </InvSection>

    <!-- 15 · Los límites, con el mismo peso que los hallazgos -->
    <InvSection
      :eyebrow="cx.limitesTag"
      :title="cx.limitesTitle"
      :dek="cx.limitesP"
    >
      <div
        v-for="g in cx.limites"
        :key="g.key"
      >
        <h3 class="inv-subhead">
          {{ g.title }}
        </h3>
        <ul class="sr-limits">
          <li
            v-for="(l, i) in g.items"
            :key="i"
          >
            {{ l }}
          </li>
        </ul>
      </div>
    </InvSection>

    <InvSection alt>
      <LeakTip
        :subject="cx.title"
        path="/investigaciones/suicidios-recursos"
        :facts="leakFacts"
      />
    </InvSection>

    <InvSection
      :eyebrow="cx.sourcesTag"
      :title="cx.sourcesTitle"
      :dek="cx.sourcesP"
    >
      <InvSources :groups="sourceGroups" />
    </InvSection>

    <InvSection alt>
      <InvDisclaimer
        :title="c.common.disclaimerTitle"
        :paragraphs="c.common.disclaimer"
      />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
/* La bajada de la portada de cifras. No es un número, así que no lleva color de cifra. */
.sr-lead {
  font-family: var(--font-display);
  font-size: clamp(1.3rem, 3.2vw, 1.9rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  max-width: 34ch;
  margin: var(--s-3) 0 0;
}

/* Las líneas de ayuda: número grande, etiqueta al lado. En teléfono se apilan, y el
   número queda arriba porque es lo único que hace falta leer. */
.sr-help {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-4);
  max-width: 74ch;
}

.sr-help li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-2) var(--s-4);
  border-top: 1px solid var(--rule);
  padding-top: var(--s-3);
}

.sr-help__n {
  font-family: var(--font-display);
  font-size: clamp(1.4rem, 5vw, 1.9rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--celeste-deep);
  white-space: nowrap;
}

.sr-help li span {
  color: var(--text-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

/* Dos notas seguidas necesitan su propio intervalo: el ritmo de sección sólo separa
   bloques hermanos, y las dos notas viven adentro del mismo bloque. */
.sr-note-gap { margin-top: var(--s-3); }

/* Los diez tokens que dan cero. Cada uno es un valor de un vocabulario cerrado, así que
   va como ficha y no como frase. */
.sr-tokens {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.sr-tokens li {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-muted);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  padding: 3px 9px;
}

/* Cita institucional. Filo celeste, nunca de oro: el oro es dinero. */
.sr-quotes {
  display: grid;
  gap: var(--s-4);
  max-width: var(--inv-measure);
}

.sr-quote {
  margin: 0;
  border-left: 3px solid var(--celeste);
  padding-left: var(--s-4);
  font-size: 1.05rem;
  line-height: 1.55;
  color: var(--text);
}

/* Los pedidos de datos: identificador a la izquierda, el pedido y su motivo al lado. */
.sr-asks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-4);
}

.sr-asks li {
  display: grid;
  grid-template-columns: 3.2rem minmax(0, 1fr);
  gap: var(--s-3);
  border-top: 1px solid var(--rule);
  padding-top: var(--s-3);
}

.sr-asks__id {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--celeste-deep);
}

.sr-asks__body { min-width: 0; }

.sr-asks__q {
  margin: 0;
  font-size: 1rem;
  line-height: 1.5;
  max-width: 74ch;
}

.sr-asks__org {
  margin: var(--s-1) 0 0;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.sr-asks__why {
  margin: var(--s-2) 0 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-muted);
  max-width: 74ch;
}

.sr-limits {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-3);
  max-width: 74ch;
  color: var(--text-muted);
}

.sr-nd {
  color: var(--text-muted);
  font-size: 0.85rem;
}

/* El organismo y, debajo, el objeto literal del llamado. Dos etiquetas hermanas se
   sueldan sin un contenedor que traiga el intervalo, así que van en una grilla. */
.sr-buyer,
.sr-object { display: block; }

.sr-object {
  margin-top: var(--s-1);
  font-weight: 400;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--text-muted);
}

@media (max-width: 560px) {
  .sr-asks li {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-1);
  }
}
</style>
