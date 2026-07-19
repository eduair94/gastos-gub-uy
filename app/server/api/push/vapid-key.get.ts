import { defineEventHandler } from 'h3'

// The public VAPID key the browser needs to subscribe. Null when push is not
// configured on the server → the client hides the push UI entirely. Read straight
// from the environment (same pattern as the Firebase Admin creds) so it works
// identically in the Nitro server without relying on runtimeConfig plumbing.
export default defineEventHandler(() => {
  const publicKey = process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || null
  return { success: true, data: { publicKey: publicKey || null } }
})
