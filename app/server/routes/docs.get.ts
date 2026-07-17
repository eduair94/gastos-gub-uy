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
    <meta name="description" content="Free, public API for Uruguay government procurement data: contracts, suppliers, buyers and spending analytics. Try every endpoint live." />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
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
      <h1>Loading API reference…</h1>
      <p>If this takes a while, the raw spec is at <a href="/openapi.json">/openapi.json</a>.</p>
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
