import { CASO_THEMES, listCasoDefs } from '../../utils/casos'
import { listCurroDefs } from '../../utils/curros'
import { listRecopDefs } from '../../utils/recopilatorios'

/** Curros + recopilatorios + casos — static case defs, no DB needed. See buyers.ts for why this is its own source. */
export default defineSitemapEventHandler(() => {
  const urls: unknown[] = []
  for (const def of listCurroDefs()) {
    urls.push({ loc: `/curros/${def.slug}`, changefreq: 'monthly' as const, priority: 0.8 })
  }
  for (const def of listRecopDefs()) {
    urls.push({ loc: `/recopilatorios/${def.slug}`, changefreq: 'monthly' as const, priority: 0.7 })
  }
  // The dossier collection: one URL per theme, one per caso. Themes rank above
  // individual dossiers because they are the pages a subject search should land
  // on ("presupuesto salud mental Uruguay"), and they link down to the rest.
  for (const theme of CASO_THEMES) {
    urls.push({ loc: `/investigaciones/temas/${theme.key}`, changefreq: 'monthly' as const, priority: 0.8 })
  }
  for (const def of listCasoDefs()) {
    urls.push({ loc: `/investigaciones/casos/${def.slug}`, changefreq: 'monthly' as const, priority: 0.7 })
  }
  return urls
})
