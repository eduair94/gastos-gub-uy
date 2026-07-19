import { defineEventHandler, getQuery, setHeader } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { resolveUnsubscribe } from '../../../../src/jobs/campaign/unsubscribe-core'

// Human-visited GET variant of the campaign unsubscribe link (some mail
// clients follow the link with a plain click/GET instead of the List-Unsubscribe
// one-click POST). Public, token-only, idempotent — renders a tiny confirmation
// page instead of JSON since a person is looking at this in a browser.
function page(title: string, message: string): string {
  return /* html */ `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · gastos-gub</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0b0f14; color: #e5e7eb; }
      .card { max-width: 420px; margin: 24px; padding: 24px; text-align: center; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { margin: 0; font-size: 14px; color: #9ca3af; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${title}</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''
  if (!token) {
    return page('Falta el token', 'El enlace no incluye un token válido de baja.')
  }
  await connectToDatabase()
  const result = await resolveUnsubscribe(token)
  if (!result) {
    return page('No encontramos esa suscripción', 'El enlace pudo haber expirado o ya no es válido.')
  }
  return page('Te diste de baja', 'No vas a recibir más correos de esta campaña.')
})
