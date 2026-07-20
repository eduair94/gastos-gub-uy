import assert from "node:assert";
import { partitionBySuppression } from "../../src/jobs/campaign/suppression";
import { buildStaleReclaimFilter } from "../../src/jobs/campaign/send";

// partitionBySuppression: the batch form of the suppression gate. A row is
// unsendable if its email is invalid OR present in the (already normalized)
// suppressed set — mirroring isSuppressed's "unusable = suppressed" rule — and
// everything else is sendable. Pure, one pass, no DB round-trip per row.
{
  const rows = [
    { _id: "a", email: "keep@b.uy" },       // clean, not suppressed -> sendable
    { _id: "b", email: "SUP@b.uy" },         // in the set once case-folded -> suppressed
    { _id: "c", email: "not-an-email" },     // invalid -> suppressed
    { _id: "d", email: "  Keep2@B.uy " },    // normalizes, not in set -> sendable
  ];
  const suppressed = new Set(["sup@b.uy"]);
  const out = partitionBySuppression(rows, suppressed);
  assert.deepEqual(out.sendable.map((r) => r._id), ["a", "d"]);
  assert.deepEqual(out.suppressed.map((r) => r._id), ["b", "c"]);
}

// buildStaleReclaimFilter: rows stuck in "sending" past the cutoff (a dispatcher
// that crashed mid-batch) are reclaimable back to "queued" on the next run.
{
  const cutoff = new Date("2026-07-20T00:00:00Z");
  const f = buildStaleReclaimFilter("promo1", cutoff) as {
    campaignId: string; status: string; claimedAt: { $lt: Date };
  };
  assert.equal(f.campaignId, "promo1");
  assert.equal(f.status, "sending");
  assert.deepEqual(f.claimedAt, { $lt: cutoff });
}

console.log("ok: campaign dispatch claim helpers");
