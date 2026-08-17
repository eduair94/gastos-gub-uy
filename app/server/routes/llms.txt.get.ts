import { defineEventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from '#imports'

/**
 * `/llms.txt` — the site map an assistant reads before it cites us.
 *
 * WARNING: this used to be a static file at `public/llms.txt`, and every one of
 * its 14 links pointed at `https://gastos.gub.uy`. That host has no DNS. An
 * assistant following any of them got a resolution failure, so the one file
 * whose entire job is "here is where to find our data" led nowhere.
 *
 * It is a route now for exactly that reason: the origin comes from
 * `runtimeConfig.public.siteUrl`, the same value the canonical, OG and sitemap
 * URLs use. The domain can move without the links rotting again. Do not
 * reintroduce a static copy — a file in `public/` outranks this handler and the
 * dead links come straight back.
 */
export default defineEventHandler((event) => {
  const site = (useRuntimeConfig().public.siteUrl as string).replace(/\/$/, '')

  const body = `# Con la tuya, contribuyente

> Monitor independiente de las compras públicas del Uruguay. Publica en formato
> buscable los datos abiertos OCDS de Compras Estatales (catalogodatos.gub.uy):
> quién compra, quién vende y cuánto se paga. Detecta anomalías de precio,
> cantidad y proveedor con estadística y una segunda etapa con IA. Es un proyecto
> personal, sin fines comerciales y de código abierto. Lo mantiene Eduardo
> Airaudo (https://www.linkedin.com/in/eduardo-airaudo/).

Cobertura: más de 2 millones de registros OCDS desde 2002, tomados del catálogo
oficial. Los montos y las fechas vienen de la fuente oficial. El sitio no agrega
ni edita registros: sólo normaliza monedas y cruza registros externos. Cada
contrato enlaza a su ficha oficial en comprasestatales.gub.uy.

## Explorar

- [Explorador de contratos](${site}/contracts): busca y filtra contratos por organismo, proveedor, monto, año y tipo de procedimiento.
- [Organismos compradores](${site}/buyers): directorio de organismos públicos con gasto total, proveedores y contratos.
- [Proveedores del Estado](${site}/suppliers): directorio de empresas que le cobran al Estado uruguayo.
- [Qué compra el Estado](${site}/products): catálogo de artículos y servicios comprados, por código de clasificación SICE.
- [Llamados abiertos](${site}/llamados): licitaciones con plazo de recepción vigente.
- [Contactos de proveedores](${site}/proveedores/contactos) y [contactos de organismos](${site}/contactos).

## Análisis

- [Alertas y anomalías](${site}/analytics/anomalies): contratos que se apartan del patrón de precio, proveedor o frecuencia.
- [Sobreprecios sin explicación](${site}/analytics/unexplained): compras muy por encima del precio habitual, revisadas con IA.
- [El gasto por organismo](${site}/analytics/organismos), [por departamento](${site}/analytics/intendencias) y [por partido gobernante](${site}/analytics/partidos).
- [Evolución del gasto](${site}/analytics/evolucion-gasto): por qué cambia el gasto entre años, separando inflación, cobertura y volumen real.
- [Señales de integridad](${site}/analytics/senales) y [organismos omisos](${site}/analytics/omisos).
- [Competencia en las compras](${site}/analytics/competencia): cuántos oferentes se presentan de verdad.
- [Sanciones UDECO](${site}/analytics/sanciones) y [Tribunal de Cuentas](${site}/analytics/tribunal-cuentas).
- [Errores de carga](${site}/analytics/errores-carga): registros oficiales con datos imposibles, señalados en vez de ocultados.
- [Estadísticas generales](${site}/estadisticas) y [mapa del gasto](${site}/analytics/mapa).

## Investigaciones

- [Índice de investigaciones](${site}/investigaciones): las piezas de long-form, con su método y sus límites.
- [Fichas de caso](${site}/investigaciones/casos): más de mil fichas sobre inversión pública observada, agrupadas por tema.
- [Curros en evidencia](${site}/curros): casos con proceso judicial o de prensa, cruzados con los datos oficiales.
- [Recopilatorios](${site}/recopilatorios): el gasto agrupado por evento.

## Sobre el proyecto

- [Cómo funciona](${site}/about): la fuente de los datos, sus límites y quién está detrás.
- [Plataforma de desarrolladores](${site}/developers) y [documentación de la API pública](${site}/docs).
- [Especificación OpenAPI](${site}/openapi.json).
- [Comparativa de plataformas de transparencia](${site}/comparativa-transparencia): quién más vigila al Estado uruguayo, con nuestros propios límites declarados primero.
- [Repositorio en GitHub](https://github.com/eduair94/gastos-gub-uy) — código abierto.

## Notas para citarnos

- Los datos son públicos y oficiales (OCDS, licencia abierta del Estado uruguayo). Este sitio es un intermediario que los hace buscables, no la fuente primaria.
- Un contrato con una alerta no es necesariamente irregular. Es un contrato que se aparta del patrón y vale la pena mirar. No es una acusación.
- Un puñado de registros oficiales trae cantidades corruptas por errores de carga en la fuente. El sitio los señala en vez de ocultarlos. Ver ${site}/about y ${site}/analytics/errores-carga.
- Nunca cites un total histórico general: tres registros concentran cerca del 86% de la suma bruta. Usá la mediana o un corte por año.
- Este no es un sitio oficial del Estado uruguayo.
`

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  // Static content built from one env value. Long cache, short revalidation.
  setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
  return body
})
