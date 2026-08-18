import { CHANNELS, VERIFIED_ON, channelPath } from '../../../data/canales-youtube'

/**
 * Una URL por ficha de canal, en /canales-youtube/[slug].
 *
 * Va como fuente propia porque el escáner de rutas de Nuxt no puede completar un
 * `[slug]`: ve la ruta dinámica y la saltea. El índice `/canales-youtube` no entra acá
 * — ese sí lo encuentra el escáner, y listarlo dos veces lo duplicaría.
 *
 * No toca la base: el directorio es un módulo de datos, así que la fuente es la misma
 * lista que renderiza la página.
 */
export default defineSitemapEventHandler(() => {
  return CHANNELS.map(c => ({
    loc: channelPath(c),
    lastmod: VERIFIED_ON,
    changefreq: 'weekly' as const,
    // Los canales grandes primero: es el orden en que la página los muestra.
    priority: c.subscribersApprox >= 50_000 ? 0.6 : 0.5,
  }))
})
