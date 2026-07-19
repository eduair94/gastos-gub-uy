// tests/unit/test-contact-rubros.ts
import assert from "node:assert";
import { buildRubroPipeline } from "../../src/jobs/enrich/rubros";

const p = buildRubroPipeline("R/214843360014", 5);
// Must lead with the indexed field to avoid a full scan.
assert.deepEqual(p[0], { $match: { "awards.suppliers.id": "R/214843360014" } });

// The top-N grouping now lives inside a $facet, alongside a "grand" total
// sub-pipeline — so `share` (computed in deriveRubros) can divide by the
// supplier's FULL award-item universe, not just the top-N returned here.
const facetStage: any = p.find((s: any) => s.$facet);
assert.ok(facetStage, "has a $facet stage");
const { top, grand } = facetStage.$facet;
assert.ok(Array.isArray(top), "$facet has a top sub-pipeline");
assert.ok(Array.isArray(grand), "$facet has a grand sub-pipeline for the share denominator");

// top sub-pipeline: must group by the classification id (== sice code) and cap at topN.
const group = top.find((s: any) => s.$group);
assert.ok(group, "top sub-pipeline has a $group stage");
assert.equal(group.$group._id, "$awards.items.classification.id");
const limit = top.find((s: any) => s.$limit);
assert.equal(limit.$limit, 5);

// grand sub-pipeline: must count independently of the top-N cap (no $limit of its own).
assert.ok(!grand.some((s: any) => s.$limit), "grand sub-pipeline must not be capped at topN");
assert.ok(grand.some((s: any) => s.$count), "grand sub-pipeline counts the full universe");

console.log("ok: rubro pipeline");
