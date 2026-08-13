#!/usr/bin/env tsx
/**
 * Qué se lleva scrapeado del archivo del Tribunal de Cuentas y cuánto ata.
 * `.verify.ts` = requiere MONGODB_URI, fuera de `npm test`.
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { TcrResolutionModel } from "../../shared/models";

async function main(): Promise<void> {
  await connectToDatabase();

  const [probed, exists, procurement, withCall, matched, ambiguous] = await Promise.all([
    TcrResolutionModel.countDocuments({}),
    TcrResolutionModel.countDocuments({ exists: true }),
    TcrResolutionModel.countDocuments({ isProcurement: true }),
    TcrResolutionModel.countDocuments({ procurementTitle: { $ne: null } }),
    TcrResolutionModel.countDocuments({ matchedOcid: { $ne: null } }),
    TcrResolutionModel.countDocuments({ matchedOcid: null, matchCandidates: { $gt: 1 } }),
  ]);

  console.log(`fichas sondeadas:      ${probed}`);
  console.log(`existen:               ${exists}`);
  console.log(`de contrataciones:     ${procurement}`);
  console.log(`nombran un llamado:    ${withCall}`);
  console.log(`ATADAS a una compra:   ${matched}${withCall ? ` (${Math.round((matched / withCall) * 100)}% de las que nombran)` : ""}`);
  console.log(`ambiguas (no atadas):  ${ambiguous}`);

  const byYear = await TcrResolutionModel.aggregate([
    { $match: { resolvedAt: { $ne: null } } },
    { $group: { _id: { $year: "$resolvedAt" }, n: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: 8 },
  ]);
  console.log("\npor año de resolución:");
  for (const y of byYear) console.log(`  ${y._id}: ${y.n}`);

  const sample = await TcrResolutionModel.find({ matchedOcid: { $ne: null } })
    .sort({ resolvedAt: -1 })
    .limit(5)
    .lean();
  console.log("\núltimas atadas:");
  for (const s of sample as Array<Record<string, any>>) {
    console.log(`  ${s.date} · ${s.organism} · ${s.procurementTitle} → ${s.matchedOcid}`);
  }

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
