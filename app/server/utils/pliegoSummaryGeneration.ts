import { randomUUID } from 'node:crypto'
import { OpenCallModel } from '../../../shared/models/open_call'
import { summarizeOpenCall } from '../../../shared/pliego/summarize'
import type { IPliegoSummaryGeneration } from '../../../shared/types/monitor'

// The interactive path must finish well below the old 30+ minute worst case.
// It runs in the background, so HTTP clients poll one shared Mongo state instead
// of keeping a reverse-proxy connection open.
const INTERACTIVE_MODEL_TIMEOUT_MS = 30_000
const INTERACTIVE_TOTAL_TIMEOUT_MS = 3 * 60_000
const GENERATION_LEASE_MS = 6 * 60_000

const inFlight = new Map<string, Promise<void>>()

export function isPliegoGenerationRunning(
  state: Partial<IPliegoSummaryGeneration> | null | undefined,
  now = new Date(),
): boolean {
  if (state?.status !== 'running' || !state.leaseUntil) return false
  return new Date(state.leaseUntil).getTime() > now.getTime()
}

async function runGeneration(compraId: string, leaseId: string, startedAt: Date): Promise<void> {
  let lastPersistedAt = 0
  let lastModel = ''
  let progressWrites = Promise.resolve()
  const persistProgress = (model: string, receivedChars: number): void => {
    const now = Date.now()
    if (model === lastModel && receivedChars > 0 && now - lastPersistedAt < 2_000) return
    lastModel = model
    lastPersistedAt = now
    progressWrites = progressWrites.then(async () => {
      await OpenCallModel.updateOne(
        { compraId, 'aiSummaryGeneration.leaseId': leaseId },
        {
          $set: {
            'aiSummaryGeneration.model': model,
            'aiSummaryGeneration.lastActivityAt': new Date(),
            'aiSummaryGeneration.receivedChars': receivedChars,
          },
        },
      )
    }).catch((error) => {
      console.error(`[pliego-summary] could not persist progress for ${compraId}:`, error)
    })
  }

  try {
    const summary = await summarizeOpenCall(compraId, undefined, {
      timeoutMs: INTERACTIVE_MODEL_TIMEOUT_MS,
      maxRetriesPerModel: 0,
      totalTimeoutMs: INTERACTIVE_TOTAL_TIMEOUT_MS,
      stream: true,
      throwOnFailure: true,
      onProgress: progress => persistProgress(progress.modelUsed, progress.receivedChars),
    })
    if (!summary) throw new Error('No provider produced a complete summary')
    await progressWrites

    await OpenCallModel.updateOne(
      { compraId, 'aiSummaryGeneration.leaseId': leaseId },
      {
        $set: {
          aiSummaryGeneration: {
            status: 'complete',
            startedAt,
            finishedAt: new Date(),
          },
        },
      },
    )
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await progressWrites
    console.error(`[pliego-summary] background generation ${compraId} failed: ${message}`)
    await OpenCallModel.updateOne(
      { compraId, 'aiSummaryGeneration.leaseId': leaseId },
      {
        $set: {
          aiSummaryGeneration: {
            status: 'failed',
            startedAt,
            finishedAt: new Date(),
            lastError: message.slice(0, 500),
          },
        },
      },
    ).catch((updateError) => {
      console.error(`[pliego-summary] could not persist failure for ${compraId}:`, updateError)
    })
  }
}

export interface StartPliegoGenerationResult {
  started: boolean
  promise?: Promise<void> | undefined
}

/**
 * Starts exactly one generation per compraId. The process-local map coalesces
 * requests in this Nitro worker; the Mongo lease coalesces tabs and any future
 * PM2 workers. Callers never await the model ladder in the HTTP response.
 */
export async function startPliegoSummaryGeneration(compraId: string): Promise<StartPliegoGenerationResult> {
  const local = inFlight.get(compraId)
  if (local) return { started: false, promise: local }

  const now = new Date()
  const leaseId = randomUUID()
  const leaseUntil = new Date(now.getTime() + GENERATION_LEASE_MS)
  const acquired = await OpenCallModel.findOneAndUpdate(
    {
      compraId,
      $or: [
        { 'aiSummaryGeneration.status': { $ne: 'running' } },
        { 'aiSummaryGeneration.leaseUntil': { $lte: now } },
        { 'aiSummaryGeneration.leaseUntil': { $exists: false } },
      ],
    },
    {
      $set: {
        aiSummaryGeneration: {
          status: 'running',
          leaseId,
          startedAt: now,
          leaseUntil,
        },
      },
    },
    { new: true },
  ).select('_id').lean()

  if (!acquired) return { started: false }

  const promise = runGeneration(compraId, leaseId, now)
  inFlight.set(compraId, promise)
  void promise.finally(() => {
    if (inFlight.get(compraId) === promise) inFlight.delete(compraId)
  })
  return { started: true, promise }
}
