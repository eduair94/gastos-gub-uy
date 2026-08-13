#!/usr/bin/env tsx
/**
 * ¿Se puede cruzar una resolución del Tribunal de Cuentas contra nuestro corpus?
 *
 * La resolución identifica la compra como «<Organismo> · Licitación Pública Nº 5/2021».
 * Este sondeo busca ese número en los releases del mismo organismo: si aparece, el cruce
 * existe y vale construir el loader; si no, el archivo del TC queda como fuente aparte.
 *
 *   npx tsx tests/unit/tcr-join.verify.ts
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ReleaseModel } from "../../shared/models";

async function main(): Promise<void> {
  await connectToDatabase();

  // El caso leído en tcr.gub.uy id=39583.
  const buyerRegex = /casino/i;
  const rows = await ReleaseModel.find(
    { "buyer.name": { $regex: buyerRegex }, "sourceYear": { $in: [2021, 2022] } },
    { _id: 0, id: 1, ocid: 1, tag: 1, sourceYear: 1, "buyer.name": 1, "tender": 1, rssTitle: 1 }
  )
    .limit(6)
    .lean();

  console.log(`releases de Casinos 2021-2022: ${rows.length}`);
  for (const r of rows as Array<Record<string, any>>) {
    console.log(`\n  id=${r.id} tag=${r.tag} year=${r.sourceYear}`);
    console.log(`  buyer: ${r.buyer?.name}`);
    console.log(`  rssTitle: ${r.rssTitle ?? "—"}`);
    if (r.tender) {
      console.log(`  tender.id: ${r.tender.id ?? "—"}`);
      console.log(`  tender.title: ${r.tender.title ?? "—"}`);
      console.log(`  tender.procurementMethodDetails: ${r.tender.procurementMethodDetails ?? "—"}`);
      console.log(`  tender.description: ${String(r.tender.description ?? "—").slice(0, 90)}`);
    }
  }

  // ¿Existe en algún lado un campo que contenga "5/2021" para este organismo?
  const numbered = await ReleaseModel.findOne(
    {
      "buyer.name": { $regex: buyerRegex },
      $or: [
        { rssTitle: { $regex: /5\/2021/ } },
        { "tender.title": { $regex: /5\/2021/ } },
        { "tender.id": { $regex: /5\/2021/ } },
      ],
    },
    { _id: 0, id: 1, ocid: 1, rssTitle: 1, "tender.title": 1 }
  ).lean();
  console.log(`\n¿algún release de Casinos dice "5/2021"? → ${numbered ? JSON.stringify(numbered) : "NO"}`);

  // ¿Cómo se ve el número de llamado en general? Muestra de rssTitle en licitaciones.
  const sample = await ReleaseModel.find(
    { rssTitle: { $regex: /Licitaci/i } },
    { _id: 0, rssTitle: 1, ocid: 1 }
  )
    .limit(8)
    .lean();
  console.log("\nmuestra de rssTitle con 'Licitación':");
  for (const s of sample as Array<Record<string, any>>) console.log(`  ${s.rssTitle}`);

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
