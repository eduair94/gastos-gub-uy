import assert from "node:assert";
import {
  accountSuccessfulBulkResult,
  accountUnorderedBulkError,
  parseSeedLimit,
} from "../../src/jobs/seed-rupe-only/batch";

assert.equal(parseSeedLimit([]), Infinity);
assert.equal(parseSeedLimit(["--limit=0"]), 0);
assert.equal(parseSeedLimit(["--dry-run", "--limit=500"]), 500);
for (const invalid of ["--limit", "--limit=", "--limit=-1", "--limit=1.5", "--limit=Infinity", "--limit=NaN"]) {
  assert.throws(() => parseSeedLimit([invalid]), /non-negative integer/);
}

assert.deepEqual(accountSuccessfulBulkResult({ upsertedCount: 3, matchedCount: 2 }, 5), {
  processed: 5,
  upserted: 3,
  matchedExisting: 2,
  unclassified: 0,
});
assert.deepEqual(accountSuccessfulBulkResult({ upsertedCount: 1, matchedCount: 2 }, 5), {
  processed: 5,
  upserted: 1,
  matchedExisting: 2,
  unclassified: 2,
});
assert.deepEqual(accountSuccessfulBulkResult({ upsertedCount: 6, matchedCount: 0 }, 5), {
  processed: 5,
  upserted: 0,
  matchedExisting: 0,
  unclassified: 5,
});

const accounted = accountUnorderedBulkError({
  writeErrors: [
    { index: 1, errmsg: "duplicate" },
    { err: { index: 4, errmsg: "validation" } },
  ],
}, 5);
assert.deepEqual(accounted, {
  successful: 3,
  failures: [
    { index: 1, message: "duplicate" },
    { index: 4, message: "validation" },
  ],
});

// Missing, duplicate or out-of-range indexes make success accounting unsafe.
assert.equal(accountUnorderedBulkError(new Error("network"), 5), null);
assert.equal(accountUnorderedBulkError({ writeErrors: [{ errmsg: "unknown op" }] }, 5), null);
assert.equal(accountUnorderedBulkError({ writeErrors: [{ index: 2 }, { index: 2 }] }, 5), null);
assert.equal(accountUnorderedBulkError({ writeErrors: [{ index: 5 }] }, 5), null);
assert.equal(accountUnorderedBulkError({ err: { message: "write concern" }, writeErrors: [{ index: 0 }] }, 5), null);

const writeConcernError = { code: 64, errmsg: "waiting for replication timed out" };
assert.equal(accountUnorderedBulkError({
  writeErrors: [{ index: 0, errmsg: "duplicate" }],
  result: { getWriteConcernError: () => writeConcernError },
}, 2), null, "driver result write-concern errors make success accounting ambiguous");
assert.equal(accountUnorderedBulkError({
  writeErrors: [{ index: 0 }],
  result: { writeConcernErrors: [writeConcernError] },
}, 2), null, "raw result writeConcernErrors are ambiguous");
assert.equal(accountUnorderedBulkError({
  writeErrors: [{ index: 0 }],
  result: { result: { writeConcernErrors: [writeConcernError] } },
}, 2), null, "nested raw result writeConcernErrors are ambiguous");

console.log("ok: seed-rupe-only batch accounting");
