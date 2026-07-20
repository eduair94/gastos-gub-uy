// Captures the browser's `beforeinstallprompt` so we can offer an in-app "Install"
// button (Chromium). On browsers without it (iOS Safari) the button stays hidden;
// users install via the native "Add to Home Screen" share action.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePwaInstall() {
  const canInstall = ref(false)
  const installed = ref(false)
  let deferred: BeforeInstallPromptEvent | null = null

  function onPrompt(e: Event) {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    canInstall.value = true
  }
  function onInstalled() {
    installed.value = true
    canInstall.value = false
    deferred = null
    useAnalytics().track('pwa_installed')
  }

  onMounted(() => {
    if (!import.meta.client) return
    installed.value = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
  })
  onBeforeUnmount(() => {
    if (!import.meta.client) return
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  })

  async function install(): Promise<boolean> {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    canInstall.value = false
    useAnalytics().track('pwa_install_prompt', { outcome })
    return outcome === 'accepted'
  }

  return { canInstall, installed, install }
}
