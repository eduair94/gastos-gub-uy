import { defineEventHandler, getRequestHeader, readBody, setResponseStatus } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { UserModel } from '../../../../shared/models/user'
import { verifyLinkToken } from '../../../../shared/alerts/link-token'

// Telegram webhook. Telegram POSTs every bot update here. We only act on two
// commands: `/start <token>` (link the account) and `/stop` (unlink). Every
// response is 200 so Telegram does not retry. The secret header is the auth: it
// must equal TELEGRAM_WEBHOOK_SECRET (set when the webhook was registered).

interface TelegramUpdate {
  message?: {
    text?: string
    chat?: { id?: number | string }
    from?: { username?: string }
  }
}

async function reply(chatId: string | number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  }
  catch {
    // Best-effort confirmation — a failure here never fails the webhook.
  }
}

export default defineEventHandler(async (event) => {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  const got = getRequestHeader(event, 'x-telegram-bot-api-secret-token')
  // 200 + ok:false so a probing/misconfigured caller learns nothing and Telegram
  // (which would send the right header) is the only one acted upon.
  if (!expected || got !== expected) {
    setResponseStatus(event, 200)
    return { ok: false }
  }

  const update = await readBody<TelegramUpdate>(event)
  const msg = update?.message
  const chatId = msg?.chat?.id
  const text = (msg?.text ?? '').trim()
  if (!chatId || !text) return { ok: true }

  await connectToDatabase()

  if (text.startsWith('/start')) {
    const linkSecret = process.env.TELEGRAM_LINK_SECRET
    const parts = text.split(/\s+/)
    const token = parts[1]
    const uid = token && linkSecret ? verifyLinkToken(token, linkSecret) : null
    if (!uid) {
      await reply(chatId, '⚠️ Enlace inválido o vencido. Volvé a la app y generá un nuevo enlace desde tu cuenta.')
      return { ok: true }
    }
    await UserModel.updateOne(
      { uid },
      {
        $set: {
          telegram: {
            chatId: String(chatId),
            username: msg?.from?.username,
            linkedAt: new Date(),
            active: true,
          },
          'notificationPrefs.channels.telegram': true,
        },
      },
    )
    await reply(chatId, '✅ <b>Cuenta vinculada.</b> Vas a recibir acá los llamados que coincidan con tus alertas. Escribí /stop para desconectar.')
    return { ok: true }
  }

  if (text.startsWith('/stop')) {
    await UserModel.updateOne(
      { 'telegram.chatId': String(chatId) },
      { $set: { 'telegram.active': false, 'notificationPrefs.channels.telegram': false } },
    )
    await reply(chatId, '🔕 Alertas por Telegram desactivadas. Podés reactivarlas desde tu cuenta cuando quieras.')
    return { ok: true }
  }

  await reply(chatId, 'Comandos: /start &lt;token&gt; para vincular · /stop para desconectar.')
  return { ok: true }
})
