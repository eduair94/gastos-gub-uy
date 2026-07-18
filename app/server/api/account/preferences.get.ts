import { defineEventHandler } from 'h3'
import { requireUser } from '../../utils/auth'

// The current user's notification preferences (+ email/locale for the form).
export default defineEventHandler((event) => {
  const user = requireUser(event)
  return {
    success: true,
    data: {
      email: user.email,
      emailVerified: user.emailVerified,
      locale: user.locale,
      notificationPrefs: user.notificationPrefs,
    },
  }
})
