import { createError, defineEventHandler, getQuery, sendRedirect } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { UserModel } from '../../../../shared/models/user'

/**
 * Cambia la cadencia del newsletter con un clic, sin login.
 *
 * POR QUÉ EXISTE Y POR QUÉ ES GET. Los suscriptos pasaron a cadencia diaria por decisión de
 * producto, sin pedirlo. Sin una salida intermedia, el que se molesta sólo tiene el botón de
 * baja o el de spam. La denuncia de spam es peor que la baja: castiga la entrega de todo el
 * resto de la lista, incluidos los que sí quieren el correo.
 *
 * Es GET porque va como enlace dentro del correo, igual que la baja de un clic. El token es el
 * mismo `unsubscribeToken` que ya identifica al usuario sin sesión.
 *
 * NO CAMBIA `subscribed`. Bajar la cadencia no es darse de baja, y confundirlos perdería un
 * suscriptor que sólo quería menos correo.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token : ''
  const to = typeof query.to === 'string' ? query.to : ''
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Falta token' })
  if (to !== 'weekly' && to !== 'daily') {
    throw createError({ statusCode: 400, statusMessage: 'El parámetro `to` debe ser weekly o daily' })
  }

  await connectToDatabase()
  const result = await UserModel.updateOne(
    { unsubscribeToken: token },
    { $set: { 'newsletter.frequency': to, 'newsletter.frequencyChangedAt': new Date() } },
  )

  // El usuario llega desde un cliente de correo: contestarle JSON sería dejarlo mirando texto
  // crudo. La página de baja ya sabe mostrar el estado y acepta el mismo token.
  const wantsJson = String(event.node.req.headers.accept ?? '').includes('application/json')
  if (wantsJson) {
    return { success: true, data: { changed: result.matchedCount > 0, frequency: to } }
  }
  return sendRedirect(event, `/newsletter/unsubscribe?token=${encodeURIComponent(token)}&frequency=${to}`, 302)
})
