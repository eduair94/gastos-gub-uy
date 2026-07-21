// tests/unit/test-contacts-origen-filter.ts
// buildContactFilter's `origen` dimension: which population of the directory a
// query includes. No DB needed - these branches never touch DEI/categoria joins.
import assert from "node:assert";
import { buildContactFilter } from "../../app/server/utils/contacts";

(async () => {
  // Default (todas): contactable OR registry - a single condition, assigned
  // directly (no $and wrapper needed when there's only one).
  const todas = await buildContactFilter({});
  assert.ok(!("empty" in todas));
  const f = (todas as { filter: Record<string, unknown> }).filter;
  assert.deepEqual(f.$or, [
    { emails: { $elemMatch: { mxValid: true, status: "valid" } } },
    { neverAwarded: true },
  ]);
  assert.equal(f.status, undefined, "the old status:'enriched' gate is dropped - email/neverAwarded conditions govern instead");
  assert.equal(f.$and, undefined);

  // con-email: contactable only.
  const conEmail = await buildContactFilter({ origen: "con-email" });
  const f2 = (conEmail as { filter: Record<string, unknown> }).filter;
  assert.deepEqual(f2, { emails: { $elemMatch: { mxValid: true, status: "valid" } } });

  // sin-adjudicaciones: registry rows only.
  const sinAdj = await buildContactFilter({ origen: "sin-adjudicaciones" });
  const f3 = (sinAdj as { filter: Record<string, unknown> }).filter;
  assert.deepEqual(f3, { neverAwarded: true });

  // verified=0 still widens the contactable side (both con-email and the
  // todas $or's first branch use the same hasUsableEmail clause).
  const widened = await buildContactFilter({ origen: "con-email", verified: "0" });
  assert.deepEqual(
    (widened as { filter: Record<string, unknown> }).filter,
    { emails: { $elemMatch: { status: { $nin: ["suppressed", "invalid"] } } } },
  );

  // origen composes with search via $and - two conditions, neither clobbers the other.
  const withSearch = await buildContactFilter({ origen: "sin-adjudicaciones", search: "acme" });
  const f4 = (withSearch as { filter: Record<string, unknown> }).filter;
  assert.ok(Array.isArray(f4.$and) && f4.$and.length === 2, "origin + search both present");
  const and4 = f4.$and as Record<string, unknown>[];
  assert.ok(and4.some(c => c.neverAwarded === true));
  assert.ok(and4.some(c => !!(c.name as { $regex?: string } | undefined)?.$regex));

  console.log("ok: contacts origen filter");
})();
