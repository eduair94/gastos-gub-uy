import type { UseHeadInput } from '@unhead/vue'

/** The one person behind the project — reused by the article byline and the Person graph. */
export const AUTHOR = {
  name: 'Eduardo Airaudo',
  linkedin: 'https://www.linkedin.com/in/eduardo-airaudo/',
  github: 'https://github.com/eduair94',
} as const

interface SeoArticle {
  /** ISO datetime the content was first published. */
  publishedTime?: string
  /** ISO datetime of the last substantive edit. */
  modifiedTime?: string
  /** Content section shown to crawlers, e.g. "Investigaciones". */
  section?: string
}

interface SeoInput {
  title: string
  description: string
  /** Absolute or root-relative path for the canonical. Defaults to current route. */
  path?: string
  /** Structured data. Emitted as-is inside a JSON-LD script tag (one node or an array of nodes). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  /** Detail pages that no longer exist upstream shouldn't be indexed. */
  noindex?: boolean
  /** Explicit image override (root-relative). Skips the dynamic generator. */
  image?: string
  /** Eyebrow label burned into the dynamic OG image, e.g. "Contrato", "Investigación". */
  kicker?: string
  /** A short headline figure burned into the dynamic OG image, e.g. a formatted peso amount. */
  stat?: string
  /** 'article' emits article:* OG tags and a byline. Default 'website'. */
  type?: 'website' | 'article'
  article?: SeoArticle
}

/**
 * One place that decides what every page tells a crawler.
 *
 * The site previously shipped a single hard-coded title and
 * description for all ten routes, so every contract, supplier and
 * agency page was a duplicate to Google. Each page now states its own
 * title, description and canonical, and detail pages carry JSON-LD so
 * the facts (who bought, who sold, how much) are machine-readable.
 *
 * `image` never falls back to a missing static file: unless a page passes
 * an explicit `image`, every page gets a purpose-built, on-brand OG image
 * rendered at `/api/og.png` from its own title — a generic share preview
 * was worse than none.
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

  const image = computed(() => {
    if (resolved.value.image) return `${siteUrl}${resolved.value.image}`
    const params = new URLSearchParams({ title: resolved.value.title })
    if (resolved.value.kicker) params.set('kicker', resolved.value.kicker)
    if (resolved.value.stat) params.set('stat', resolved.value.stat)
    if (locale.value !== 'es') params.set('locale', locale.value)
    return `${siteUrl}/api/og.png?${params.toString()}`
  })

  const isArticle = computed(() => resolved.value.type === 'article')

  useHead(() => {
    const meta: NonNullable<UseHeadInput['meta']> = [
      { name: 'description', content: resolved.value.description },
      { property: 'og:title', content: fullTitle.value },
      { property: 'og:description', content: resolved.value.description },
      { property: 'og:url', content: canonical.value },
      { property: 'og:type', content: isArticle.value ? 'article' : 'website' },
      { property: 'og:site_name', content: brand.value },
      { property: 'og:locale', content: locale.value === 'es' ? 'es_UY' : 'en_US' },
      { property: 'og:image', content: image.value },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: fullTitle.value },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: fullTitle.value },
      { name: 'twitter:description', content: resolved.value.description },
      { name: 'twitter:image', content: image.value },
    ]

    const head: UseHeadInput = {
      title: fullTitle.value,
      link: [{ rel: 'canonical', href: canonical.value }],
      meta,
    }

    if (resolved.value.noindex) {
      meta.push({ name: 'robots', content: 'noindex, follow' })
    }

    // Byline. Only on authored content (investigations, curros, recopilatorios,
    // about) — a directory or dashboard page has no "author" in any meaningful
    // sense, and repeating the tag everywhere would dilute it.
    if (isArticle.value) {
      meta.push(
        { name: 'author', content: AUTHOR.name },
        { property: 'article:author', content: AUTHOR.linkedin },
      )
      head.link!.push({ rel: 'author', href: AUTHOR.linkedin })
      const art = resolved.value.article
      if (art?.publishedTime) meta.push({ property: 'article:published_time', content: art.publishedTime })
      if (art?.modifiedTime) meta.push({ property: 'article:modified_time', content: art.modifiedTime })
      if (art?.section) meta.push({ property: 'article:section', content: art.section })
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

/** The person behind the project. `sameAs` is what lets Google (and LinkedIn) tie the byline to the profile. */
export function usePersonLd() {
  const config = useRuntimeConfig()
  const siteUrl = config.public.siteUrl as string
  return {
    '@type': 'Person',
    '@id': `${siteUrl}/about#person`,
    'name': AUTHOR.name,
    'url': `${siteUrl}/about`,
    'sameAs': [AUTHOR.linkedin, AUTHOR.github],
  }
}

/** A BreadcrumbList node for a detail page. `items` is root → leaf; a leaf without `path` is the current page. */
export function useBreadcrumbLd(items: { name: string, path?: string }[]) {
  const config = useRuntimeConfig()
  const siteUrl = config.public.siteUrl as string
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((it, i) => ({
      '@type': 'ListItem',
      'position': i + 1,
      'name': it.name,
      ...(it.path ? { item: `${siteUrl}${it.path}` } : {}),
    })),
  }
}
