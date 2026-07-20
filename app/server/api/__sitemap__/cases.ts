import { listCurroDefs } from '../../utils/curros'
import { listRecopDefs } from '../../utils/recopilatorios'

/** Curros + recopilatorios — a handful of static case defs, no DB needed. See buyers.ts for why this is its own source. */
export default defineSitemapEventHandler(() => {
  const urls: unknown[] = []
  for (const def of listCurroDefs()) {
    urls.push({ loc: `/curros/${def.slug}`, changefreq: 'monthly' as const, priority: 0.8 })
  }
  for (const def of listRecopDefs()) {
    urls.push({ loc: `/recopilatorios/${def.slug}`, changefreq: 'monthly' as const, priority: 0.7 })
  }
  return urls
})
