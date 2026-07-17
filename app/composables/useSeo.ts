import type { UseHeadInput } from '@unhead/vue'

interface SeoInput {
  title: string
  description: string
  /** Absolute or root-relative path for the canonical. Defaults to current route. */
  path?: string
  /** Structured data. Emitted as-is inside a JSON-LD script tag. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  /** Detail pages that no longer exist upstream shouldn't be indexed. */
  noindex?: boolean
  /** Overrides the generated OG image path. */
  image?: string
}

/**
 * One place that decides what every page tells a crawler.
 *
 * The site previously shipped a single hard-coded title and
 * description for all ten routes, so every contract, supplier and
 * agency page was a duplicate to Google. Each page now states its own
 * title, description and canonical, and detail pages carry JSON-LD so
 * the facts (who bought, who sold, how much) are machine-readable.
 */
export function useSeo(input: MaybeRefOrGetter<SeoInput>) {
  const route = useRoute()
  const config = useRuntimeConfig()
  const { locale, t } = useI18n()

  const resolved = computed(() => toValue(input))

  const siteUrl = (config.public.siteUrl as string) || ''
  const canonical = computed(() => {
    const path = resolved.value.path ?? route.path
    return `${siteUrl}${path}`.replace(/([^:])\/{2,}/g, '$1/')
  })

  const brand = computed(() => t('brand.name'))

  // The site name is already in the brand-level title; repeating it on
  // every page just eats the SERP character budget.
  const fullTitle = computed(() => {
    const base = resolved.value.title
    return base.includes(brand.value) ? base : `${base} · ${brand.value}`
  })

  const image = computed(() => `${siteUrl}${resolved.value.image ?? '/og-default.png'}`)

  useHead(() => {
    const head: UseHeadInput = {
      title: fullTitle.value,
      link: [{ rel: 'canonical', href: canonical.value }],
      meta: [
        { name: 'description', content: resolved.value.description },
        { property: 'og:title', content: fullTitle.value },
        { property: 'og:description', content: resolved.value.description },
        { property: 'og:url', content: canonical.value },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: brand.value },
        { property: 'og:locale', content: locale.value === 'es' ? 'es_UY' : 'en_US' },
        { property: 'og:image', content: image.value },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: fullTitle.value },
        { name: 'twitter:description', content: resolved.value.description },
        { name: 'twitter:image', content: image.value },
      ],
    }

    if (resolved.value.noindex) {
      head.meta!.push({ name: 'robots', content: 'noindex, follow' })
    }

    if (resolved.value.jsonLd) {
      head.script = [{
        type: 'application/ld+json',
        innerHTML: JSON.stringify(resolved.value.jsonLd),
      }]
    }

    return head
  })

  return { canonical, fullTitle }
}

/** The publisher identity reused across every JSON-LD graph. */
export function useOrgLd() {
  const config = useRuntimeConfig()
  const siteUrl = config.public.siteUrl as string
  return {
    '@type': 'Organization',
    'name': 'Con la tuya, contribuyente',
    '@id': `${siteUrl}/#org`,
    'url': siteUrl,
  }
}
