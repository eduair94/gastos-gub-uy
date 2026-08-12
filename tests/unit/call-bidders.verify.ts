#!/usr/bin/env tsx
/**
 * Sonda contra la base viva: cuánto se lleva scrapeado de oferentes y qué dice.
 * `.verify.ts` = requiere MONGODB_URI, queda fuera de `npm test`.
 *
 *   npx tsx tests/unit/call-bidders.verify.ts
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { CallBiddersModel } from "../../shared/models";

async function main(): Promise<void> {
  await connectToDatabase();

  const probed = await CallBiddersModel.countDocuments({});
  const found = await CallBiddersModel.countDocuments({ found: true });
  const sole = await CallBiddersModel.countDocuments({ count: 1 });

  console.log(`compras sondeadas:    ${probed}`);
  console.log(`publicaron oferentes: ${found} (${probed ? Math.round((found / probed) * 100) : 0}%)`);
  console.log(`oferente único:       ${sole} (${found ? Math.round((sole / found) * 100) : 0}% de las que publican)`);

  const dist = await CallBiddersModel.aggregate([
    { $match: { found: true } },
    { $group: { _id: "$count", n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $limit: 12 },
  ]);
  console.log("\ndistribución de oferentes por compra:");
  for (const d of dist) console.log(`  ${String(d._id).padStart(3)} oferente(s): ${d.n}`);

  const withRut = await CallBiddersModel.aggregate([
    { $match: { found: true } },
    { $unwind: "$bidders" },
    { $group: { _id: null, total: { $sum: 1 }, conRut: { $sum: { $cond: [{ $ne: ["$bidders.rut", null] }, 1, 0] } } } },
  ]);
  if (withRut[0]) {
    const { total, conRut } = withRut[0];
    console.log(`\nfilas de oferente: ${total} · con RUT cruzable: ${conRut} (${Math.round((conRut / total) * 100)}%)`);
  }

  const sample = await CallBiddersModel.findOne({ found: true, count: { $gte: 3 } }).lean();
  if (sample) {
    console.log(`\nejemplo ${sample.compraId} (${sample.buyerName ?? sample.buyerId}):`);
    for (const b of sample.bidders) console.log(`  ${b.rut ?? b.docNumber} · ${b.name}`);
  }

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
