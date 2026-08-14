/**
 * De qué tipo es la fuente de una nota: prensa, comunicación oficial o partidaria.
 *
 * POR QUÉ HACE FALTA. `organism_news.items[].source` es un string plano con el nombre que le pone
 * el buscador ("ladiaria.com.uy", "EL PAÍS Uruguay", "GUB.UY"). Nada distingue una investigación
 * periodística de un comunicado del propio organismo. Medido el 14/08/2026 sobre las 257 notas
 * guardadas: 53 (20,6%) NO son prensa — GUB.UY 30, asse.com.uy 9, rionegro.gub.uy 9, salto.gub.uy 4
 * y frenteamplio.uy 1.
 *
 * En un panel de ocho ítems dentro de la ficha de un organismo eso pasa desapercibido. En una lista
 * ordenada por fecha, un comunicado ministerial aparecería arriba junto a periodismo y sin ninguna
 * marca, que es exactamente lo que PRODUCT.md no permite. Por eso la etiqueta es obligatoria para
 * mostrar una nota fuera de su ficha.
 *
 * ES UN PISO, NO UN CENSO. Clasifica por dominio. Puede haber portales institucionales o partidarios
 * entre los 29 medios cuyo nombre no delata el origen, y esos van a quedar como 'prensa'. La página
 * lo dice con todas las letras: la clasificación es nuestra y es conservadora.
 */

export type NewsSourceType = 'prensa' | 'oficial' | 'partidaria'

/** Dominios de partidos políticos uruguayos con presencia en el corpus o esperable. */
const PARTY_HOSTS = [
  'frenteamplio.uy',
  'partidonacional.org.uy',
  'partidocolorado.uy',
  'cabildoabierto.uy',
  'pit-cnt.uy',
]

/**
 * Comunicación oficial: el Estado hablando de sí mismo. `.gub.uy` cubre casi todo; los entes
 * autónomos y servicios descentralizados usan dominios propios y hay que nombrarlos.
 */
const OFFICIAL_HOSTS = [
  'asse.com.uy',
  'antel.com.uy',
  'ute.com.uy',
  'ancap.com.uy',
  'ose.com.uy',
  'bps.gub.uy',
  'impo.com.uy',
  'presidencia.gub.uy',
]

/** Normaliza lo que el buscador escribió como "medio" a algo comparable con un host. */
function normalise(source: string): string {
  return source.trim().toLowerCase().replace(/^www\./, '')
}

export function classifyNewsSource(source: string | null | undefined): NewsSourceType {
  const s = normalise(String(source ?? ''))
  if (!s) return 'prensa'

  if (PARTY_HOSTS.some(h => s === h || s.endsWith(`.${h}`) || s.includes(h))) return 'partidaria'

  // El buscador a veces escribe el portal del Estado como "GUB.UY", sin host.
  if (s === 'gub.uy' || s.endsWith('.gub.uy') || s.includes('gub.uy')) return 'oficial'
  if (OFFICIAL_HOSTS.some(h => s === h || s.endsWith(`.${h}`) || s.includes(h))) return 'oficial'

  return 'prensa'
}
