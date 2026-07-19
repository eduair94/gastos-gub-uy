// tests/unit/test-open-calls-count.ts
import assert from "node:assert";
import { buildOpenCallCountQuery } from "../../src/jobs/campaign/open-calls-count";
const now = new Date("2026-07-19T00:00:00Z");
const q: any = buildOpenCallCountQuery("28267", now);
assert.equal(q.status, "open");
assert.deepEqual(q.classificationSet, "28267");
assert.deepEqual(q["tenderPeriod.endDate"], { $gt: now });
console.log("ok: open-calls count query");
