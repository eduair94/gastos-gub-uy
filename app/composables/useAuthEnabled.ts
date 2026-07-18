// True when the Firebase Web SDK is configured (public apiKey present). This is the
// runtime-accurate signal — NUXT_PUBLIC_FIREBASE_API_KEY overrides `public.firebase.apiKey`
// at server start — and it mirrors how plugins/firebase.client.ts decides whether to
// initialise auth. Used to hide the entire auth surface (login / register / account /
// alerts) when Firebase isn't set up, so the public dashboard keeps working. The server
// independently guards the session-minting endpoints on isFirebaseAdminConfigured().
export function useAuthEnabled(): boolean {
  return Boolean(useRuntimeConfig().public.firebase?.apiKey)
}
