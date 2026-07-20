import { defineEventHandler, setHeader } from 'h3'

// Renders the interactive API reference (Scalar) for the public procurement API.
// The spec is served separately at /openapi.json. Scalar is loaded from a CDN and
// configured for a friendly, "try it live" experience.
const html = /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Docs · Con la tuya contribuyente — Uruguay Procurement API</title>
    <meta name="description" content="Public API for Uruguay government procurement: contracts, licitaciones (tenders), analytics, alerts, webhooks and an MCP server. Get an API key and try every endpoint live." />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />

    <!-- Google Analytics, hand-rolled and deliberately duplicated. This page is a
         Nitro route, not a Nuxt page: plugins/analytics.client.ts never runs here,
         the SPA router never sees the navigation, and /docs therefore recorded zero
         pageviews. Do NOT delete this as redundant with the app's gtag setup — it is
         the only measurement the API reference has.

         It honours the same decision the app stores in localStorage 'cltc-consent'
         (see composables/useConsent.ts): a refusal loads nothing at all, a grant
         behaves normally, and an undecided reader gets cookieless Consent Mode.
         There is no banner here on purpose — the banner lives in the Nuxt app, and
         a developer reading a reference should not be asked twice. -->
    <script>
      (function () {
        var choice = null
        try {
          var raw = window.localStorage.getItem('cltc-consent')
          if (raw) choice = (JSON.parse(raw) || {}).choice
        }
        catch (e) { /* localStorage throws in some privacy modes — treat as undecided */ }

        // Refused: never load the tag, so not a single request leaves the browser.
        if (choice === 'denied') return

        window.dataLayer = window.dataLayer || []
        function gtag() { window.dataLayer.push(arguments) }
        window.gtag = gtag
        gtag('js', new Date())
        // Consent Mode v2 defaults deny everything: an undecided reader is measured
        // cookielessly, with nothing written to their device.
        gtag('consent', 'default', {
          analytics_storage: 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied'
        })
        if (choice === 'granted') gtag('consent', 'update', { analytics_storage: 'granted' })
        gtag('config', 'G-E3V3E1LLC0')

        var tag = document.createElement('script')
        tag.async = true
        tag.src = 'https://www.googletagmanager.com/gtag/js?id=G-E3V3E1LLC0'
        document.head.appendChild(tag)
      })()
    </script>

    <style>
      body { margin: 0; }
      /* Friendly loading state before Scalar hydrates */
      .boot {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        min-height: 100vh; color: #4b5563; gap: 12px;
      }
      .boot h1 { font-size: 18px; font-weight: 600; margin: 0; color: #111827; }
      .boot p { margin: 0; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="boot" id="boot">
      <h1>Cargando referencia de la API… · Loading API reference…</h1>
      <p>Si demora, el spec crudo está en <a href="/openapi.json">/openapi.json</a>. ¿Necesitás una API key? <a href="/app/api-keys">/app/api-keys</a>.</p>
    </div>

    <!-- Scalar API Reference -->
    <script
      id="api-reference"
      data-url="/openapi.json"
      data-proxy-url=""
    ></script>
    <script>
      var configuration = {
        theme: 'purple',
        layout: 'modern',
        defaultOpenAllTags: false,
        hideDownloadButton: false,
        searchHotKey: 'k',
        // Lead the "try it" snippets with the three clients integrators actually use.
        defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
        hiddenClients: {
          node: true, ruby: true, php: true, go: true, java: true, csharp: true,
          objc: true, swift: true, kotlin: true, r: true, ocaml: true, powershell: true, clojure: true, http: true,
        },
        metaData: {
          title: 'Uruguay Procurement API — Con la tuya contribuyente',
        },
        // Pre-fill the "try it" client with the current origin so requests just work.
        servers: [{ url: window.location.origin, description: 'This server' }],
      }
      var el = document.getElementById('api-reference')
      el.dataset.configuration = JSON.stringify(configuration)
    </script>
    <!-- Pinned: an unversioned CDN URL resolves to whatever is latest at request
         time, so an upstream breaking release would take these docs down with no
         deploy on our side. Bump deliberately. -->
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.62.9/dist/browser/standalone.js"></script>
    <script>
      // Remove the boot placeholder once Scalar has taken over the page.
      window.addEventListener('load', function () {
        setTimeout(function () {
          var boot = document.getElementById('boot')
          if (boot) boot.remove()
        }, 1500)
      })
    </script>
  </body>
</html>`

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return html
})
