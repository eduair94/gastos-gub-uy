export interface BulkWriteFailure {
  index: number;
  message: string;
}

export interface BulkWriteAccounting {
  successful: number;
  failures: BulkWriteFailure[];
}

export interface SuccessfulBulkAccounting {
  processed: number;
  upserted: number;
  matchedExisting: number;
  unclassified: number;
}

function hasEntries(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  return value != null;
}

function hasWriteConcernError(candidate: { err?: unknown; result?: unknown; writeConcernErrors?: unknown }): boolean {
  if (candidate.err != null || hasEntries(candidate.writeConcernErrors)) return true;
  if (!candidate.result || typeof candidate.result !== "object") return false;

  const result = candidate.result as {
    getWriteConcernError?: unknown;
    result?: unknown;
    writeConcernErrors?: unknown;
  };
  if (typeof result.getWriteConcernError === "function") {
    try {
      if (result.getWriteConcernError.call(result) != null) return true;
    } catch {
      return true;
    }
  }
  if (hasEntries(result.writeConcernErrors)) return true;
  if (result.result && typeof result.result === "object") {
    const rawResult = result.result as { writeConcernErrors?: unknown };
    if (hasEntries(rawResult.writeConcernErrors)) return true;
  }
  return false;
}

export function parseSeedLimit(args: readonly string[]): number {
  const hit = args.find(arg => arg === "--limit" || arg.startsWith("--limit="));
  if (!hit) return Infinity;

  const raw = hit === "--limit" ? "" : hit.slice("--limit=".length);
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`--limit must be a non-negative integer; received ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Classify an acknowledged successful batch without guessing missing counts. */
export function accountSuccessfulBulkResult(result: unknown, batchSize: number): SuccessfulBulkAccounting {
  let upserted: unknown;
  let matchedExisting: unknown;
  try {
    if (result && typeof result === "object") {
      upserted = (result as { upsertedCount?: unknown }).upsertedCount;
      matchedExisting = (result as { matchedCount?: unknown }).matchedCount;
    }
  } catch {
    return { processed: batchSize, upserted: 0, matchedExisting: 0, unclassified: batchSize };
  }

  const validUpserted = Number.isInteger(upserted) && (upserted as number) >= 0;
  const validMatched = Number.isInteger(matchedExisting) && (matchedExisting as number) >= 0;
  if (!validUpserted || !validMatched || (upserted as number) + (matchedExisting as number) > batchSize) {
    return { processed: batchSize, upserted: 0, matchedExisting: 0, unclassified: batchSize };
  }
  return {
    processed: batchSize,
    upserted: upserted as number,
    matchedExisting: matchedExisting as number,
    unclassified: batchSize - (upserted as number) - (matchedExisting as number),
  };
}

/**
 * Account for an unordered Mongo bulk error only when every failed operation
 * has a unique, in-range index. Anything else is ambiguous and must abort so a
 * retry can safely rely on the idempotent upserts.
 */
export function accountUnorderedBulkError(error: unknown, batchSize: number): BulkWriteAccounting | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as {
    err?: unknown;
    result?: unknown;
    writeConcernErrors?: unknown;
    writeErrors?: unknown;
  };
  if (hasWriteConcernError(candidate) || !Array.isArray(candidate.writeErrors) || candidate.writeErrors.length === 0) {
    return null;
  }

  const seen = new Set<number>();
  const failures: BulkWriteFailure[] = [];
  for (const rawFailure of candidate.writeErrors) {
    if (!rawFailure || typeof rawFailure !== "object") return null;
    const failure = rawFailure as {
      index?: unknown;
      errmsg?: unknown;
      message?: unknown;
      err?: { index?: unknown; errmsg?: unknown };
    };
    const index = failure.index ?? failure.err?.index;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= batchSize || seen.has(index as number)) {
      return null;
    }

    seen.add(index as number);
    const message = failure.errmsg ?? failure.err?.errmsg ?? failure.message;
    failures.push({
      index: index as number,
      message: typeof message === "string" ? message : "bulk write failed",
    });
  }

  return { successful: batchSize - failures.length, failures };
}
