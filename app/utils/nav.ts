/**
 * The site's navigation structure — one source of truth.
 *
 * The top bar and the /analytics hub used to declare their own lists, and they
 * drifted: the bar carried `partidos` and `anticipacion` that the hub never
 * showed, while the hub carried `rss` and `estadisticas` the bar's dropdown
 * didn't. Two indexes of the same section disagreeing is what made the site feel
 * disorganised, more than the number of pages did. Both now render from here.
 *
 * Shape: sections group a menu's leaves under a heading. A menu with ONE section
 * renders its leaves flat (a heading over a lone group is noise); a menu with
 * several renders the headings, which is what keeps the 14-entry "Señales" menu
 * scannable. `to` is the group's own hub page and is optional — "Explorar",
 * "Directorio" and "Recursos" group pages that have no landing of their own, and
 * their activator only opens the menu.
 *
 * Labels come from `nav.<key>` and section headings from `nav.grp.<key>` in both
 * locale files. Every section carries a `nav.grp.<key>` entry even when its menu
 * has a single section and therefore renders no heading — the day a second
 * section is added, the label is already there in both locales.
 *
 * Icons must already exist in the committed MDI subset
 * (app/assets/scss/mdi-subset.scss) or `npm run build` fails its prebuild check.
 */

export interface NavLeaf {
  key: string
  to: string
  icon: string
  /** Served outside vue-router (only `/docs`), so it must render as a real anchor. */
  external?: boolean | undefined
}

export interface NavSection {
  /** Heading i18n key suffix (`nav.grp.<key>`); only rendered when the menu has 2+ sections. */
  key: string
  items: NavLeaf[]
}

export interface NavNode {
  key: string
  icon: string
  /** The group's own hub page. Absent for grouping-only menus. */
  to?: string | undefined
  external?: boolean | undefined
  sections?: NavSection[] | undefined
}

/** Every leaf of a group, flattened — for the measuring rail, overflow menu and drawer. */
export function navLeaves(n: NavNode): NavLeaf[] {
  return (n.sections ?? []).flatMap(s => s.items)
}

export function hasNavChildren(n: NavNode): boolean {
  return (n.sections ?? []).some(s => s.items.length > 0)
}

/**
 * Built per-call because every `to` is locale-prefixed: `localePath` resolves
 * against the ACTIVE locale, so this must re-run when the locale changes rather
 * than be frozen into a module constant.
 */
export function buildNav(localePath: (path: string) => string): NavNode[] {
  return [
    // The two citizen entry points stay one click away — grouping them would
    // bury the overview behind a menu for the reader least able to navigate.
    { key: 'home', to: localePath('/'), icon: 'mdi-view-dashboard-outline' },
    { key: 'gastos', to: localePath('/gastos'), icon: 'mdi-cash-multiple' },

    // Find one record. The four directories plus the open-calls monitor: the
    // "I arrived with a name, RUT or product" job from PRODUCT.md.
    {
      key: 'explorar',
      icon: 'mdi-magnify',
      sections: [
        {
          key: 'registros',
          items: [
            { key: 'contracts', to: localePath('/contracts'), icon: 'mdi-file-document-outline' },
            { key: 'suppliers', to: localePath('/suppliers'), icon: 'mdi-domain' },
            { key: 'buyers', to: localePath('/buyers'), icon: 'mdi-bank-outline' },
            { key: 'products', to: localePath('/products'), icon: 'mdi-package-variant-closed' },
            { key: 'llamados', to: localePath('/llamados'), icon: 'mdi-bullhorn-outline' },
          ],
        },
      ],
    },

    // "Is this normal?" — the watchdog job. Three sections because a flat list of
    // 14 technical names is exactly what read as saturated: detected signals,
    // then institutional breakdowns, then movement over time.
    {
      key: 'senales',
      to: localePath('/analytics'),
      icon: 'mdi-chart-box-outline',
      sections: [
        {
          key: 'anomalias',
          items: [
            // First in the section: it is the only view that starts from the ORGANISM rather than
            // from an individual flag, so it is where a reader with no particular contract in mind
            // should land.
            { key: 'senalesGestion', to: localePath('/analytics/senales'), icon: 'mdi-gauge-low' },
            { key: 'competencia', to: localePath('/analytics/competencia'), icon: 'mdi-account-group-outline' },
            { key: 'tribunalCuentas', to: localePath('/analytics/tribunal-cuentas'), icon: 'mdi-gavel' },
            // The integrity record from the other side: not how a body buys, but who inside it
            // never declared their assets.
            { key: 'omisos', to: localePath('/analytics/omisos'), icon: 'mdi-file-document-alert-outline' },
            // The State's own consumer agency vs the State's own purchase orders.
            { key: 'sanciones', to: localePath('/analytics/sanciones'), icon: 'mdi-gavel' },
            { key: 'anomalies', to: localePath('/analytics/anomalies'), icon: 'mdi-flag-outline' },
            { key: 'unexplained', to: localePath('/analytics/unexplained'), icon: 'mdi-help-rhombus-outline' },
            { key: 'erroresCarga', to: localePath('/analytics/errores-carga'), icon: 'mdi-database-alert-outline' },
            { key: 'providerAnomalies', to: localePath('/analytics/proveedores-anomalias'), icon: 'mdi-account-alert-outline' },
            { key: 'providerLoadErrors', to: localePath('/analytics/proveedores-errores-carga'), icon: 'mdi-clipboard-alert-outline' },
            { key: 'rss', to: localePath('/analytics/rss-anomalias'), icon: 'mdi-flag-outline' },
          ],
        },
        {
          key: 'radiografia',
          items: [
            // "Gasto por organismo" — it groups by type (Intendencias, Ministerios,
            // Salud, Entes, Educación) but lists the individual organisms inside
            // each, which is what the reader actually scans. Shares a word with the
            // `buyers` directory ("Organismos") on purpose: that one is the
            // directory, this one is the spending view, and they now sit in
            // different menus.
            { key: 'organismos', to: localePath('/analytics/organismos'), icon: 'mdi-finance' },
            { key: 'intendencias', to: localePath('/analytics/intendencias'), icon: 'mdi-city-variant-outline' },
            { key: 'mapa', to: localePath('/analytics/mapa'), icon: 'mdi-view-grid-outline' },
            { key: 'partidos', to: localePath('/analytics/partidos'), icon: 'mdi-vote-outline' },
            // Spending recovered by SUBJECT rather than by body — the feed has no
            // policy-area field, so this is the first of a family of reconstructed topics.
            { key: 'genero', to: localePath('/analytics/genero'), icon: 'mdi-gender-male-female' },
            // Demoted from the top level: state-advertising spend is an analysis,
            // not a trunk section of the site.
            { key: 'pauta', to: localePath('/pauta'), icon: 'mdi-bullhorn-variant-outline' },
          ],
        },
        {
          key: 'tendencias',
          items: [
            // El tablero del día: lo que entró hoy al registro más los indicadores oficiales con
            // su fecha. Va primero de la sección porque es la única superficie que cambia a diario.
            { key: 'agenda', to: localePath('/analytics/agenda'), icon: 'mdi-calendar-today' },
            { key: 'evolucion', to: localePath('/analytics/evolucion-gasto'), icon: 'mdi-chart-timeline-variant' },
            { key: 'estadisticas', to: localePath('/estadisticas'), icon: 'mdi-chart-box-outline' },
            { key: 'anticipacion', to: localePath('/analytics/anticipacion'), icon: 'mdi-crystal-ball' },
            // Lo único del sitio que no sale del corpus: mediciones de terceros, publicadas con
            // su ficha técnica. Va última porque es la más lejana al registro de compras.
            { key: 'encuestas', to: localePath('/analytics/encuestas'), icon: 'mdi-poll' },
          ],
        },
      ],
    },

    // Work we already did for the reader. Curros, Recopilatorios and the weekly
    // issue were three separate top-level entries for the same idea as the
    // investigations, so they join them as a second section.
    {
      key: 'investigaciones',
      to: localePath('/investigaciones'),
      icon: 'mdi-magnify-scan',
      sections: [
        {
          key: 'casos',
          items: [
            // First in the section: it is the only entry that is a COLLECTION
            // rather than a single piece, so a reader with no particular case
            // in mind should land there and browse by theme.
            { key: 'invFichas', to: localePath('/investigaciones/casos'), icon: 'mdi-book-open-variant' },
            { key: 'tvciudad', to: localePath('/investigaciones/tv-ciudad'), icon: 'mdi-television-classic' },
            { key: 'invCasinos', to: localePath('/investigaciones/casinos'), icon: 'mdi-slot-machine-outline' },
            { key: 'invCasinosCortesia', to: localePath('/investigaciones/casinos-cortesia'), icon: 'mdi-cards-playing-outline' },
            { key: 'invIm', to: localePath('/investigaciones/intendencia-montevideo'), icon: 'mdi-city-variant-outline' },
            { key: 'invMonopolios', to: localePath('/investigaciones/monopolios'), icon: 'mdi-bank-outline' },
            { key: 'invEmpresas', to: localePath('/investigaciones/empresas-senaladas'), icon: 'mdi-domain-off' },
            { key: 'invAsse', to: localePath('/investigaciones/asse-ambulancias'), icon: 'mdi-ambulance' },
            { key: 'invSaturno', to: localePath('/investigaciones/frigorifico-saturno'), icon: 'mdi-cow' },
            { key: 'invMejorPeor', to: localePath('/investigaciones/mejor-o-peor'), icon: 'mdi-chart-timeline-variant' },
            { key: 'invDocumentoFa', to: localePath('/investigaciones/documento-fa'), icon: 'mdi-file-document-check-outline' },
            { key: 'invSunca', to: localePath('/investigaciones/sunca'), icon: 'mdi-hard-hat' },
            { key: 'invGenero', to: localePath('/investigaciones/gasto-en-genero'), icon: 'mdi-human-male-female' },
            { key: 'invMensajes', to: localePath('/investigaciones/mensajes-del-estado'), icon: 'mdi-bullhorn-variant-outline' },
            { key: 'invCanales', to: localePath('/investigaciones/canales-privados'), icon: 'mdi-television-play' },
          ],
        },
        {
          key: 'series',
          items: [
            { key: 'curros', to: localePath('/curros'), icon: 'mdi-scale-balance' },
            { key: 'recopilatorios', to: localePath('/recopilatorios'), icon: 'mdi-folder-star-outline' },
            { key: 'blog', to: localePath('/blog'), icon: 'mdi-file-document-outline' },
          ],
        },
      ],
    },

    // The supplier's job. Two directories whose old top-level labels sat side by
    // side and read almost identically; under one menu the distinction is the
    // point of the menu rather than a trap.
    {
      key: 'directorio',
      icon: 'mdi-card-account-details-outline',
      sections: [
        {
          key: 'contactos',
          items: [
            { key: 'contactosProveedores', to: localePath('/proveedores/contactos'), icon: 'mdi-email-outline' },
            { key: 'contactosCompras', to: localePath('/contactos'), icon: 'mdi-card-account-details-outline' },
          ],
        },
      ],
    },

    // Everything that explains or extends the site rather than being it.
    // `comparativa` compares third-party SaaS pricing — at the top level it
    // implied this site is one of them.
    {
      key: 'recursos',
      icon: 'mdi-code-tags',
      sections: [
        {
          key: 'ayuda',
          items: [
            { key: 'about', to: localePath('/about'), icon: 'mdi-information-outline' },
            { key: 'colaboradores', to: localePath('/colaboradores'), icon: 'mdi-account-group-outline' },
            { key: 'comoReportar', to: localePath('/analytics/como-reportar'), icon: 'mdi-help-circle-outline' },
            { key: 'comparativa', to: localePath('/comparativa'), icon: 'mdi-compare' },
            { key: 'plataformas', to: localePath('/comparativa-transparencia'), icon: 'mdi-account-eye-outline' },
            { key: 'canalesYt', to: localePath('/canales-youtube'), icon: 'mdi-youtube' },
            { key: 'developers', to: localePath('/developers'), icon: 'mdi-code-tags' },
            // A Nitro server route, not a Nuxt page: vue-router resolves /docs to
            // zero matched routes and 404s without ever issuing a request, so it
            // must stay a real anchor and is deliberately not localePath'd.
            { key: 'docs', to: '/docs', icon: 'mdi-api', external: true },
          ],
        },
      ],
    },
  ]
}
