export interface BulkWriteFailure {
  index: number;
  message: string;
}

export interface BulkWriteAccounting {
  successful: number;
  failures: BulkWriteFailure[];
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

/**
 * Account for an unordered Mongo bulk error only when every failed operation
 * has a unique, in-range index. Anything else is ambiguous and must abort so a
 * retry can safely rely on the idempotent upserts.
 */
export function accountUnorderedBulkError(error: unknown, batchSize: number): BulkWriteAccounting | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as {
    err?: unknown;
    writeErrors?: unknown;
  };
  if (candidate.err != null || !Array.isArray(candidate.writeErrors) || candidate.writeErrors.length === 0) {
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
