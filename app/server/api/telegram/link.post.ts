import { createError, defineEventHandler } from 'h3'
import { requireWrite } from '../../utils/auth'
import { createLinkToken } from '../../../../shared/alerts/link-token'

// Issue a one-tap Telegram linking deep link: t.me/<bot>?start=<signed-token>.
// The token is a stateless HMAC (uid + expiry) verified by the bot webhook, so no
// DB row is needed. Requires the bot username + link secret to be configured.
export default defineEventHandler((event) => {
  const user = requireWrite(event)
  const secret = process.env.TELEGRAM_LINK_SECRET
  const botUsername = process.env.TELEGRAM_BOT_USERNAME
  if (!secret || !botUsername) {
    throw createError({ statusCode: 503, statusMessage: 'Telegram no está configurado' })
  }
  const token = createLinkToken(user.uid, secret)
  return {
    success: true,
    data: {
      url: `https://t.me/${botUsername}?start=${token}`,
      botUsername,
    },
  }
})
