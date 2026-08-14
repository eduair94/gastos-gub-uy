/**
 * Búsqueda de prensa por organismo. Los casos de ruido son REALES: salieron de medir
 * Google News el 2026-08-13, y son la razón por la que el filtro es duro.
 */
import assert from 'node:assert/strict'
import { buildQuery, filterRelevant, newsRssUrl, organismAliases, parseNewsRss, type NewsItem } from '../../shared/news-search'

// --- Query -------------------------------------------------------------------
assert.match(buildQuery('ASSE'), /^"ASSE" \(licitación/)
const url = newsRssUrl('Intendencia de Flores')
assert.match(url, /^https:\/\/news\.google\.com\/rss\/search\?q=/)
assert.match(url, /gl=UY/, 'sin el país el feed trae prensa de toda la región')
assert.match(url, /ceid=UY%3Aes-419|ceid=UY:es-419/)

// --- Parseo de un feed real ---------------------------------------------------
const XML = `<rss><channel>
<item><title>ASSE cerró la licitación para traslados gratuitos de pacientes - Montevideo Portal</title>
<link>https://www.montevideo.com.uy/nota1</link><pubDate>Sat, 23 May 2026 12:00:00 GMT</pubDate>
<source url="https://www.montevideo.com.uy">Montevideo Portal</source></item>
<item><title>Traslados no m&#233;dicos de ASSE: empresa pas&#243; de cobrar m&#225;s - ladiaria.com.uy</title>
<link>https://ladiaria.com.uy/nota2</link><pubDate>Thu, 25 Jun 2026 09:00:00 GMT</pubDate>
<source url="https://ladiaria.com.uy">ladiaria.com.uy</source></item>
<item><title>Tres heridos tras choque entre motociclo y motorina en Manicaragua - CiberCuba</title>
<link>https://cibercuba.com/nota3</link><pubDate>Sun, 07 Dec 2025 10:00:00 GMT</pubDate>
<source url="https://cibercuba.com">CiberCuba</source></item>
</channel></rss>`

const items = parseNewsRss(XML)
assert.equal(items.length, 3)
assert.equal(items[0]!.title, 'ASSE cerró la licitación para traslados gratuitos de pacientes', 'el " - Medio" que pega Google no es parte del titular')
assert.equal(items[0]!.source, 'Montevideo Portal')
assert.match(items[0]!.publishedAt ?? '', /^2026-05-23/)
assert.equal(items[1]!.title.includes('médicos'), true, 'las entidades numéricas se decodifican')

// --- El filtro: medio uruguayo Y organismo nombrado ---------------------------
const asse = filterRelevant(items, 'ASSE')
assert.equal(asse.length, 2, 'la nota cubana no es de este organismo')
assert.ok(asse.every(i => /ASSE/i.test(i.title)))

// Un medio uruguayo que NO nombra al organismo tampoco entra.
const offTopic: NewsItem[] = [
  { title: 'Suba del boleto en Montevideo', link: 'https://x.uy/a', source: 'Montevideo Portal', publishedAt: null },
]
assert.equal(filterRelevant(offTopic, 'ASSE').length, 0)

// El titular NO tiene que hablar de compras para entrar, y es deliberado: exigirlo
// dejaba afuera «Traslados no médicos de ASSE: empresa … pasó de cobrar más de 12.000»,
// que es exactamente la nota por la que este panel existe.
const noKeyword: NewsItem[] = [
  { title: 'Traslados no médicos de ASSE: empresa pasó de cobrar más', link: 'https://x.uy/b', source: 'ladiaria.com.uy', publishedAt: null },
]
assert.equal(filterRelevant(noKeyword, 'ASSE').length, 1)

// Y el organismo nombrado en un medio extranjero tampoco: los homónimos existen.
const foreign: NewsItem[] = [
  { title: 'ASSE firma contrato millonario', link: 'https://x.ar/a', source: 'Clarín', publishedAt: null },
]
assert.equal(filterRelevant(foreign, 'ASSE').length, 0)

// Dedupe: el mismo hecho replicado por dos medios se muestra una vez.
const dupes: NewsItem[] = [
  { title: 'ASSE cerró la licitación', link: 'https://a.uy/1', source: 'El Observador', publishedAt: null },
  { title: 'ASSE  cerró   la licitación', link: 'https://b.uy/2', source: 'Subrayado', publishedAt: null },
]
assert.equal(filterRelevant(dupes, 'ASSE').length, 1)

// Alias: la ficha dice el nombre largo y el diario escribe la sigla.
const longName = 'Administración de los Servicios de Salud del Estado'
const byAlias: NewsItem[] = [
  { title: 'ASSE prepara una licitación para traslados médicos', link: 'https://a.uy/3', source: 'El Observador', publishedAt: null },
]
assert.equal(filterRelevant(byAlias, longName).length, 0, 'sin alias no matchea')
assert.equal(filterRelevant(byAlias, longName, ['ASSE']).length, 1, 'con alias sí')

// --- Aliases -----------------------------------------------------------------
// Tabla CURADA: las siglas uruguayas son convencionales, no mecánicas.
assert.deepEqual(organismAliases("Administración Nacional de Usinas y Trasmisiones Eléctricas"), ["UTE"], "no ANUTE")
assert.deepEqual(organismAliases("Administración de las Obras Sanitarias del Estado"), ["OSE"])
assert.deepEqual(organismAliases("Administración Nacional de Telecomunicaciones"), ["ANTEL"])
assert.deepEqual(organismAliases("Intendencia de Flores"), [], "sin sigla conocida no se inventa una")

// SOBRE-ALCANCE: un patrón sin anclar toca dos organismos y les cuelga las noticias del
// otro. Los tres casos son REALES y llegaron a producción.
assert.deepEqual(
  organismAliases("Dirección Nacional de Telecomunicaciones"),
  [],
  "DINATEL no es ANTEL — su ficha mostraba «el gobierno rompió el monopolio de Antel»",
)
assert.deepEqual(
  organismAliases("Red de Atención Primaria de Flores"),
  [],
  "las 19 Redes de Atención Primaria son centros de salud, no el Consejo de Educación",
)
assert.deepEqual(organismAliases("Consejo de Educación Inicial y Primaria"), ["Primaria"])
assert.deepEqual(
  organismAliases("Dirección Nacional de Vivienda"),
  [],
  "una dirección dependiente no hereda la sigla del ministerio",
)
assert.deepEqual(organismAliases("Dir. Gral. Secretaría del  Mrio. de Economía y Finanzas"), [])
assert.deepEqual(organismAliases("Ministerio de Economía y Finanzas"), ["MEF"])

// Palabra completa, no substring: con la sigla derivada vieja ("ANT") esto matcheaba.
const falsePositive: NewsItem[] = [
  { title: "Antes de la licitación, el gobierno anunció cambios", link: "https://a.uy/x", source: "El Observador", publishedAt: null },
]
assert.equal(filterRelevant(falsePositive, "Administración Nacional de Telecomunicaciones", ["ANT"]).length, 0)
// Pero la sigla real sí entra.
const realAcr: NewsItem[] = [
  { title: "Antel irá a la licitación de la AUF por los derechos del fútbol", link: "https://a.uy/y", source: "Caras y Caretas", publishedAt: null },
]
assert.equal(filterRelevant(realAcr, "Administración Nacional de Telecomunicaciones", ["ANTEL"]).length, 1)

// --- Falla cerrado -----------------------------------------------------------
assert.deepEqual(parseNewsRss(''), [])
assert.deepEqual(parseNewsRss('<rss><channel></channel></rss>'), [])
assert.deepEqual(filterRelevant(items, ''), [], 'sin nombre no se filtra nada, se descarta todo')

console.log(`test-news-search: OK (${asse.length} notas relevantes de ${items.length})`)
