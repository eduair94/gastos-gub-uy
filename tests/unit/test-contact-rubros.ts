// tests/unit/test-contact-rubros.ts
import assert from "node:assert";
import { buildRubroPipeline } from "../../src/jobs/enrich/rubros";

const p = buildRubroPipeline("R/214843360014", 5);
// Must lead with the indexed field to avoid a full scan.
assert.deepEqual(p[0], { $match: { "awards.suppliers.id": "R/214843360014" } });
// Must group by the classification id (== sice code) and cap at topN.
const group = p.find((s: any) => s.$group);
assert.ok(group, "has a $group stage");
assert.equal(group.$group._id, "$awards.items.classification.id");
const limit = p.find((s: any) => s.$limit);
assert.equal(limit.$limit, 5);
console.log("ok: rubro pipeline");
