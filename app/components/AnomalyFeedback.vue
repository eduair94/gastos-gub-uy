<script setup lang="ts">
// Community verdict on one anomaly flag: is it a real anomaly (up) or a false
// positive (down), with an optional justification. Counts are public; the vote
// controls appear only for a logged-in user. Kept compact so it sits inside a
// dense list row without dominating it.
const props = defineProps<{
  anomalyId: string
  up?: number
  down?: number
  myVote?: 1 | -1 | null
  myComment?: string | null
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { isAuthed } = useAuth()
// Voting needs an account; when Firebase isn't configured we still show the
// public counts but hide the (dead) controls and the login hint entirely.
const authEnabled = useAuthEnabled()
const api = useMonitorApi()

// Local state seeded from props. The row is keyed by anomaly _id, so each anomaly
// gets its own instance — no cross-id reuse to guard against. After an action the
// counts are reconciled from the server's authoritative response.
const up = ref(props.up ?? 0)
const down = ref(props.down ?? 0)
const myVote = ref<1 | -1 | null>(props.myVote ?? null)

// `comment` is the editable draft; `savedComment` is what the server actually holds
// (the source of truth for the "add vs edit reason" label and for Cancel). The list
// isn't refetched after a vote, so props.myComment goes stale — never read it back.
const comment = ref(props.myComment ?? '')
const savedComment = ref(props.myComment ?? '')
const commentOpen = ref(false)
const saving = ref(false)
const err = ref('')

async function apply(target: 1 | -1 | null) {
  const prev = { up: up.value, down: down.value, myVote: myVote.value }
  // Switching direction (up<->down) invalidates any existing justification — it was
  // written for the opposite verdict — so drop it rather than re-attaching it.
  const isSwitch = myVote.value !== null && target !== null && target !== myVote.value

  // Optimistic: drop the old contribution, add the new one.
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
    }
    else {
      // On a switch, send comment: '' so the server unsets the stale justification.
      // A fresh vote carries the committed comment (empty for a first vote).
      res = await api.feedback.save(props.anomalyId, {
        vote: target,
        comment: isSwitch ? '' : (savedComment.value.trim() || undefined),
      })
    }
    up.value = res.data.counts.up
    down.value = res.data.counts.down
    if (target === null || isSwitch) {
      comment.value = ''
      savedComment.value = ''
      commentOpen.value = false
    }
  }
  catch {
    up.value = prev.up
    down.value = prev.down
    myVote.value = prev.myVote
    err.value = t('anomalies.feedback.error')
  }
  finally {
    saving.value = false
  }
}

function onVote(v: 1 | -1) {
  if (!isAuthed.value || saving.value) return
  // Clicking the active vote again retracts it.
  apply(myVote.value === v ? null : v)
}

async function saveComment() {
  if (!isAuthed.value || myVote.value === null || saving.value) return
  saving.value = true
  err.value = ''
  try {
    const c = comment.value.trim()
    const res = await api.feedback.save(props.anomalyId, { vote: myVote.value, comment: c || undefined })
    up.value = res.data.counts.up
    down.value = res.data.counts.down
    savedComment.value = c
    comment.value = c
    commentOpen.value = false
  }
  catch {
    err.value = t('anomalies.feedback.error')
  }
  finally {
    saving.value = false
  }
}

function openComment() {
  comment.value = savedComment.value
  commentOpen.value = true
}

function cancelComment() {
  commentOpen.value = false
  comment.value = savedComment.value
}
</script>

<template>
  <div class="fb">
    <div class="chip-row">
      <button
        type="button"
        class="chip fb__up"
        :class="{ 'is-active': myVote === 1 }"
        :disabled="!isAuthed || saving"
        :aria-pressed="myVote === 1"
        :title="isAuthed ? t('anomalies.feedback.upTitle') : undefined"
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
        :disabled="!isAuthed || saving"
        :aria-pressed="myVote === -1"
        :title="isAuthed ? t('anomalies.feedback.downTitle') : undefined"
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
        v-if="isAuthed && myVote !== null && !commentOpen"
        type="button"
        class="fb__reason"
        @click="openComment"
      >
        {{ savedComment.trim() ? t('anomalies.feedback.editReason') : t('anomalies.feedback.addReason') }}
      </button>

      <NuxtLink
        v-else-if="!isAuthed && authEnabled"
        :to="localePath('/login')"
        class="fb__login u-muted"
      >
        {{ t('anomalies.feedback.login') }}
      </NuxtLink>
    </div>

    <div
      v-if="commentOpen"
      class="fb__comment"
    >
      <textarea
        v-model="comment"
        class="fb__ta"
        rows="2"
        maxlength="1000"
        :placeholder="t('anomalies.feedback.reasonPlaceholder')"
      />
      <div class="fb__actions">
        <button
          type="button"
          class="fb__save"
          :disabled="saving"
          @click="saveComment"
        >
          {{ t('anomalies.feedback.save') }}
        </button>
        <button
          type="button"
          class="fb__cancel"
          :disabled="saving"
          @click="cancelComment"
        >
          {{ t('anomalies.feedback.cancel') }}
        </button>
      </div>
    </div>

    <p
      v-if="err"
      class="fb__err"
    >
      {{ err }}
    </p>
  </div>
</template>

<style scoped>
.fb {
  margin-top: var(--s-3);
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

.fb__comment {
  margin-top: var(--s-2);
  max-width: 52ch;
}

.fb__ta {
  width: 100%;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: var(--t-sm);
  line-height: 1.5;
  resize: vertical;
}

.fb__ta:focus {
  outline: none;
  border-color: var(--celeste);
}

.fb__actions {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-2);
}

.fb__save,
.fb__cancel {
  padding: var(--s-1) var(--s-4);
  border-radius: var(--r-full);
  font-size: var(--t-xs);
  cursor: pointer;
}

.fb__save {
  border: 1px solid var(--celeste-deep, var(--celeste));
  background: var(--celeste-deep, var(--celeste));
  color: #fff;
}

.fb__cancel {
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--text-muted);
}

.fb__save:disabled,
.fb__cancel:disabled {
  opacity: 0.6;
  cursor: default;
}

.fb__err {
  margin: var(--s-2) 0 0;
  font-size: var(--t-xs);
  color: var(--alerta);
}
</style>
