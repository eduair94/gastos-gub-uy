<script setup lang="ts">
// Community verdict on one anomaly flag: is it a real anomaly (up) or a false
// positive (down), with an optional justification. Counts are public; casting a
// vote needs an account. Two Vuetify dialogs carry the interaction so overlay,
// focus-trap and teleport are the framework's problem, not ours:
//   • guests get a login prompt instead of a dead disabled button;
//   • a click opens a confirm dialog with an optional reason before it counts.
const props = defineProps<{
  anomalyId: string
  up?: number
  down?: number
  myVote?: 1 | -1 | null
  myComment?: string | null
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { isAuthed, loginGoogle } = useAuth()
// Voting needs an account; when Firebase isn't configured we still show the
// public counts but hide the (dead) controls and the login prompt entirely.
const authEnabled = useAuthEnabled()
const api = useMonitorApi()

// A guest who picks "more sign-in options" leaves for /login; the intended vote
// is parked here and applied on return (same anomaly, now authed) so the click
// isn't lost across the round-trip. Single-slot: one pending vote at a time.
const PENDING_VOTE_KEY = 'gg:pendingVote'

// Local state seeded from props. The row is keyed by anomaly _id, so each anomaly
// gets its own instance. After a commit the counts are reconciled from the
// server's authoritative response. `savedComment` is the justification the server
// actually holds — the source of truth for the add-vs-edit label and for reseeding
// the draft; props.myComment goes stale (the list isn't refetched), so read it once.
const up = ref(props.up ?? 0)
const down = ref(props.down ?? 0)
const myVote = ref<1 | -1 | null>(props.myVote ?? null)
const savedComment = ref(props.myComment ?? '')

const saving = ref(false)
const err = ref('')

// Login prompt dialog (a guest clicked a vote).
const loginOpen = ref(false)
const googleLoading = ref(false)
const loginErr = ref('')
// The direction the guest intended, so login can flow straight into that vote.
// null when they opened the generic "sign in to vote" link (no direction chosen).
const loginPendingVote = ref<1 | -1 | null>(null)

// Vote + optional comment dialog (an authed user casts or edits a vote).
const voteOpen = ref(false)
const draftVote = ref<1 | -1>(1)
const draftComment = ref('')
// Same direction as the standing vote → we're editing it (offer save + retract);
// a different direction → a fresh/switched vote (offer confirm only).
const isEditing = computed(() => myVote.value === draftVote.value)

// Commit a vote, or retract it when target === null, and reconcile counts from the
// server. Optimistic: drop the old contribution, add the new one, roll back on error.
// The comment is always sent as a string so the server sets it (non-empty) or clears
// it (empty) to match exactly what the user saw in the textarea.
async function commitVote(target: 1 | -1 | null, commentText = ''): Promise<boolean> {
  if (saving.value) return false
  const prev = { up: up.value, down: down.value, myVote: myVote.value, savedComment: savedComment.value }

  if (myVote.value === 1) up.value--
  else if (myVote.value === -1) down.value--
  if (target === 1) up.value++
  else if (target === -1) down.value++
  myVote.value = target

  saving.value = true
  err.value = ''
  try {
    let res
    if (target === null) {
      res = await api.feedback.remove(props.anomalyId)
      savedComment.value = ''
    }
    else {
      const c = commentText.trim()
      res = await api.feedback.save(props.anomalyId, { vote: target, comment: c })
      savedComment.value = c
    }
    up.value = res.data.counts.up
    down.value = res.data.counts.down
    return true
  }
  catch {
    up.value = prev.up
    down.value = prev.down
    myVote.value = prev.myVote
    savedComment.value = prev.savedComment
    err.value = t('anomalies.feedback.error')
    return false
  }
  finally {
    saving.value = false
  }
}

function onVote(v: 1 | -1) {
  if (saving.value) return
  // Guest: prompt to sign in rather than dead-ending on a disabled button. When
  // Firebase isn't configured there's nowhere to send them, so this never fires.
  if (!isAuthed.value) {
    if (!authEnabled) return
    openLogin(v)
    return
  }
  openVoteDialog(v)
}

function openVoteDialog(v: 1 | -1) {
  draftVote.value = v
  // Editing the same direction: preload the saved justification. Switching
  // direction: start blank — the old reason argued the opposite verdict.
  draftComment.value = myVote.value === v ? savedComment.value : ''
  err.value = ''
  voteOpen.value = true
}

async function confirmVote() {
  if (await commitVote(draftVote.value, draftComment.value)) voteOpen.value = false
}

async function retractVote() {
  if (await commitVote(null)) voteOpen.value = false
}

// Editing an existing vote from the row link (myVote is guaranteed non-null by the
// v-if that renders the link).
function editReason() {
  if (myVote.value !== null) openVoteDialog(myVote.value)
}

function openLogin(v: 1 | -1 | null) {
  loginPendingVote.value = v
  loginErr.value = ''
  loginOpen.value = true
}

async function loginWithGoogle() {
  googleLoading.value = true
  loginErr.value = ''
  try {
    await loginGoogle()
    loginOpen.value = false
    // Now authed — continue straight into the comment step for the intended vote.
    if (loginPendingVote.value !== null) openVoteDialog(loginPendingVote.value)
  }
  catch {
    loginErr.value = t('anomalies.feedback.loginError')
  }
  finally {
    googleLoading.value = false
  }
}

// Fall back to the full login page for email / magic-link. Park the intended vote
// (if any) so it applies automatically when the user returns authed.
function goToLogin() {
  if (import.meta.client && loginPendingVote.value !== null) {
    try {
      localStorage.setItem(PENDING_VOTE_KEY, JSON.stringify({ anomalyId: props.anomalyId, vote: loginPendingVote.value }))
    }
    catch { /* private mode / quota — the link still works, just no auto-apply */ }
  }
  navigateTo(`${localePath('/login')}?redirect=${encodeURIComponent(route.fullPath)}`)
}

// Apply a vote parked before a login round-trip. Runs once the row is mounted and
// the user is authed; only the instance whose anomaly matches acts, and it clears
// the slot first so sibling rows skip it.
onMounted(() => {
  if (!import.meta.client || !isAuthed.value) return
  let pending: { anomalyId?: string, vote?: number } | null = null
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_VOTE_KEY) || 'null')
  }
  catch {
    pending = null
  }
  if (!pending || pending.anomalyId !== props.anomalyId) return
  localStorage.removeItem(PENDING_VOTE_KEY)
  if ((pending.vote === 1 || pending.vote === -1) && myVote.value !== pending.vote) {
    commitVote(pending.vote)
  }
})
</script>

<template>
  <div class="fb">
    <div class="chip-row">
      <button
        type="button"
        class="chip fb__up"
        :class="{ 'is-active': myVote === 1 }"
        :disabled="saving || (!isAuthed && !authEnabled)"
        :aria-pressed="myVote === 1"
        :title="isAuthed ? t('anomalies.feedback.upTitle') : (authEnabled ? t('anomalies.feedback.login') : undefined)"
        @click="onVote(1)"
      >
        <span
          class="chip__ic"
          aria-hidden="true"
        >▲</span>
        <span>{{ t('anomalies.feedback.valid') }}</span>
        <span class="chip__count u-mono">{{ up }}</span>
      </button>
      <button
        type="button"
        class="chip fb__down"
        :class="{ 'is-active': myVote === -1 }"
        :disabled="saving || (!isAuthed && !authEnabled)"
        :aria-pressed="myVote === -1"
        :title="isAuthed ? t('anomalies.feedback.downTitle') : (authEnabled ? t('anomalies.feedback.login') : undefined)"
        @click="onVote(-1)"
      >
        <span
          class="chip__ic"
          aria-hidden="true"
        >▼</span>
        <span>{{ t('anomalies.feedback.invalid') }}</span>
        <span class="chip__count u-mono">{{ down }}</span>
      </button>

      <button
        v-if="isAuthed && myVote !== null"
        type="button"
        class="fb__reason"
        @click="editReason"
      >
        {{ savedComment.trim() ? t('anomalies.feedback.editReason') : t('anomalies.feedback.addReason') }}
      </button>

      <button
        v-else-if="!isAuthed && authEnabled"
        type="button"
        class="fb__login"
        @click="openLogin(null)"
      >
        {{ t('anomalies.feedback.login') }}
      </button>
    </div>

    <p
      v-if="err && !voteOpen"
      class="fb__err"
    >
      {{ err }}
    </p>

    <!-- Guest login prompt: sign in without leaving the page. Google is one click;
         email / magic-link fall through to the full login page with the vote parked. -->
    <v-dialog
      v-model="loginOpen"
      max-width="440"
    >
      <v-card class="fbd">
        <h2 class="fbd__h">
          {{ t('anomalies.feedback.loginTitle') }}
        </h2>
        <p class="fbd__p">
          {{ t('anomalies.feedback.loginBody') }}
        </p>

        <p
          v-if="loginErr"
          class="fbd__err"
        >
          {{ loginErr }}
        </p>

        <v-btn
          block
          variant="outlined"
          prepend-icon="mdi-google"
          :loading="googleLoading"
          @click="loginWithGoogle"
        >
          {{ t('auth.withGoogle') }}
        </v-btn>
        <v-btn
          class="fbd__more"
          block
          variant="text"
          :disabled="googleLoading"
          @click="goToLogin"
        >
          {{ t('anomalies.feedback.moreOptions') }}
        </v-btn>

        <div class="fbd__actions">
          <v-spacer />
          <v-btn
            variant="text"
            :disabled="googleLoading"
            @click="loginOpen = false"
          >
            {{ t('anomalies.feedback.cancel') }}
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Cast / edit a vote with an optional justification. The chosen verdict is
         echoed as the same pill the user clicked, so the dialog confirms which way. -->
    <v-dialog
      v-model="voteOpen"
      max-width="480"
    >
      <v-card class="fbd">
        <h2 class="fbd__h">
          {{ t('anomalies.feedback.prompt') }}
        </h2>

        <div class="fbd__verdict">
          <span class="fbd__vlabel">{{ t('anomalies.feedback.yourVote') }}</span>
          <span
            class="chip"
            :class="draftVote === 1 ? 'fb__up is-active' : 'fb__down is-active'"
          >
            <span
              class="chip__ic"
              aria-hidden="true"
            >{{ draftVote === 1 ? '▲' : '▼' }}</span>
            <span>{{ draftVote === 1 ? t('anomalies.feedback.valid') : t('anomalies.feedback.invalid') }}</span>
          </span>
        </div>

        <v-textarea
          v-model="draftComment"
          class="fbd__ta"
          variant="outlined"
          :label="t('anomalies.feedback.reasonLabel')"
          :placeholder="t('anomalies.feedback.reasonPlaceholder')"
          rows="3"
          auto-grow
          counter
          maxlength="1000"
          :disabled="saving"
        />

        <p
          v-if="err"
          class="fbd__err"
        >
          {{ err }}
        </p>

        <div class="fbd__actions">
          <v-btn
            v-if="isEditing"
            variant="text"
            color="error"
            :disabled="saving"
            @click="retractVote"
          >
            {{ t('anomalies.feedback.retract') }}
          </v-btn>
          <v-spacer />
          <v-btn
            variant="text"
            :disabled="saving"
            @click="voteOpen = false"
          >
            {{ t('anomalies.feedback.cancel') }}
          </v-btn>
          <v-btn
            :color="draftVote === 1 ? 'primary' : 'error'"
            :loading="saving"
            @click="confirmVote"
          >
            {{ isEditing ? t('anomalies.feedback.save') : t('anomalies.feedback.confirm') }}
          </v-btn>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
/* Align the feedback zone with the rest of the anomaly card: the same s-5 inset
   as `.flags__link` / `.aidet` (this block sits OUTSIDE the padded NuxtLink, so
   it needs its own inset) and a dashed top rule echoing `.aidet`, so it reads as
   the card's closing zone with real breathing room above and below. */
.fb {
  padding: var(--s-4) var(--s-5) var(--s-5);
  border-top: 1px dashed var(--rule);
}

/* Base pill spacing/shape comes from the global .chip primitive (main.scss).
   Only the active-state colours are domain-specific here: up = a validated real
   anomaly (institutional blue), down = a false positive (alert red). */
.fb__up.is-active,
.fb__up.is-active:hover {
  color: #fff;
  background: var(--celeste-deep, var(--celeste));
  border-color: var(--celeste-deep, var(--celeste));
}

.fb__down.is-active,
.fb__down.is-active:hover {
  color: #fff;
  background: var(--alerta);
  border-color: var(--alerta);
}

/* Even out the rating pills. The global .chip adds 4px before the count so a
   number reads as its own token; in these compact vote chips that made the
   label→count gap heavier than the glyph→label gap and the row looked lopsided.
   Drop the extra pad for a single 8px rhythm, and lift the ▲/▼ glyph to the
   text's optical centre (triangles render bottom-heavy). */
.fb__up .chip__count,
.fb__down .chip__count {
  padding-left: 0;
}

.fb__up .chip__ic,
.fb__down .chip__ic {
  position: relative;
  top: -0.5px;
}

.fb__reason,
.fb__login {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--t-xs);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.fb__reason:hover,
.fb__login:hover {
  color: var(--celeste-deep, var(--celeste));
}

.fb__err {
  margin: var(--s-2) 0 0;
  font-size: var(--t-xs);
  color: var(--alerta);
}

/* ---- Dialogs (login prompt + vote/comment). The v-card surface already tracks
   the Vuetify theme; these tokens tune padding, type and the framing hairline. ---- */
.fbd {
  padding: var(--s-5);
  border: 1px solid var(--rule);
}

.fbd__h {
  margin: 0 0 var(--s-2);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--t-lg);
  color: var(--text);
}

.fbd__p {
  margin: 0 0 var(--s-4);
  font-size: var(--t-sm);
  line-height: 1.55;
  color: var(--text-muted);
}

.fbd__more {
  margin-top: var(--s-2);
}

.fbd__verdict {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}

.fbd__vlabel {
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.fbd__ta {
  margin-bottom: var(--s-1);
}

.fbd__actions {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-4);
}

.fbd__err {
  margin: 0 0 var(--s-3);
  font-size: var(--t-sm);
  color: var(--alerta);
}
</style>
