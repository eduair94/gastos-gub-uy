#!/usr/bin/env tsx
/**
 * ¿Cuántos organismos tienen a la vez indicador propio Y algo de afuera?
 *
 * Antes de construir cualquier vista de "convergencia" hay que saber si el solapamiento
 * existe. Si son dos o tres organismos, no es una página: es un enlace en las que ya hay.
 *
 *   npx tsx tests/unit/convergencia.verify.ts
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { BidderCompetitionModel, OrganismNewsModel, TcrResolutionModel } from "../../shared/models";

async function main(): Promise<void> {
  await connectToDatabase();

  const conclusive = await BidderCompetitionModel.find(
    { conclusive: true },
    { _id: 0, buyerId: 1, buyerName: 1, soleRate: 1, withBidders: 1, coverage: 1 }
  )
    .sort({ soleRate: -1 })
    .lean();

  const newsIds = new Set(
    (await OrganismNewsModel.find({ "items.0": { $exists: true } }, { _id: 0, buyerId: 1 }).lean()).map(
      (r: any) => r.buyerId as string
    )
  );

  // El TC guarda el nombre del organismo, no el buyerId: se cruza por nombre normalizado.
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const tcrNames = new Map<string, number>();
  for (const r of await TcrResolutionModel.find(
    { isProcurement: true, exists: true, organism: { $ne: null } },
    { _id: 0, organism: 1 }
  ).lean()) {
    const k = norm(String((r as any).organism));
    tcrNames.set(k, (tcrNames.get(k) ?? 0) + 1);
  }

  console.log(`organismos con indicador concluyente: ${conclusive.length}`);
  console.log(`organismos con prensa relevante:      ${newsIds.size}`);
  console.log(`organismos nombrados por el TC:       ${tcrNames.size}`);

  let both = 0;
  const rows: string[] = [];
  for (const c of conclusive as Array<any>) {
    const hasNews = newsIds.has(c.buyerId);
    const tcrHits = tcrNames.get(norm(c.buyerName ?? "")) ?? 0;
    if (hasNews || tcrHits > 0) {
      both++;
      rows.push(
        `  ${String(Math.round((c.soleRate ?? 0) * 100)).padStart(3)}% único · ${String(c.withBidders).padStart(4)} llamados · cob ${String(Math.round(c.coverage * 100)).padStart(2)}%` +
          ` · ${hasNews ? "PRENSA" : "      "} ${tcrHits ? `TC(${tcrHits})` : ""} · ${c.buyerName}`
      );
    }
  }

  console.log(`\nCON INDICADOR **Y** ALGO DE AFUERA: ${both} de ${conclusive.length}`);
  for (const r of rows.slice(0, 15)) console.log(r);

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
