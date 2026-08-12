#!/usr/bin/env tsx
/**
 * Cuánta competencia hay en las compras de cada organismo — rollup de `call_bidders`.
 *
 * El oferente único es la red flag número uno en compras públicas, y hasta ahora acá era
 * indefendible: el feed no trae oferentes y el acta los enumera en ~8% de los casos. La
 * ficha HTML sí los publica (~100% de las adjudicaciones), y esto agrega eso por organismo.
 *
 * LO QUE HACE HONESTO AL NÚMERO ES EL DENOMINADOR. El scraper avanza de a tandas, así que
 * lo mirado es parcial y desigual. Publicar un "% de oferente único" pelado repetiría la
 * trampa del "% de compra directa": el organismo poco mirado saldría limpio. Por eso cada
 * fila lleva universo, sondeadas y publicadas, y el porcentaje se marca NO CONCLUYENTE
 * cuando la muestra no alcanza — nunca se oculta ni se maquilla.
 *
 * Uso:
 *   npx tsx src/jobs/refresh-bidder-competition.ts
 *   npx tsx src/jobs/refresh-bidder-competition.ts --dry-run
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { BidderCompetitionModel, CallBiddersModel, ReleaseModel } from "../../shared/models";

/** Debajo de esto el porcentaje es ruido, y se publica como no concluyente. */
export const MIN_WITH_BIDDERS = 10;
/** Y además hay que haber mirado una fracción mínima del organismo. */
export const MIN_COVERAGE = 0.02;

const dryRun = process.argv.includes("--dry-run");

async function run(): Promise<void> {
  const started = Date.now();
  // El universo recorre `releases` entero agrupando por buyer.id, que NO tiene índice.
  // Es un collscan largo a propósito: por eso esto es un job nocturno y no un endpoint.
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) process.env.MONGO_SOCKET_TIMEOUT_MS = String(60 * 60 * 1000);
  await connectToDatabase();

  const dataVersion = `v${Date.now()}`;
  const calculatedAt = new Date();

  // 1. Universo: adjudicaciones por organismo. Se agrupa en dos pasos (por ocid y después
  //    por comprador) para no armar un $addToSet gigante que reviente el límite de 100MB
  //    por etapa de Mongo 4.4.
  console.log("[bidder-competition] contando universo por organismo…");
  const universeRows: Array<{ _id: string; universe: number }> = await ReleaseModel.aggregate(
    [
      { $match: { tag: "award", "buyer.id": { $type: "string", $ne: "" } } },
      { $group: { _id: { buyerId: "$buyer.id", ocid: "$ocid" } } },
      { $group: { _id: "$_id.buyerId", universe: { $sum: 1 } } },
    ],
    { allowDiskUse: true }
  );
  const universeById = new Map(universeRows.map((r) => [r._id, r.universe]));
  console.log(`[bidder-competition] universo: ${universeById.size} organismos`);

  // 2. Lo sondeado, por organismo.
  const probedRows: Array<{
    _id: string;
    buyerName: string | null;
    probed: number;
    withBidders: number;
    soleBidder: number;
    totalBidders: number;
  }> = await CallBiddersModel.aggregate(
    [
      { $match: { buyerId: { $type: "string", $ne: "" } } },
      {
        $group: {
          _id: "$buyerId",
          buyerName: { $first: "$buyerName" },
          probed: { $sum: 1 },
          withBidders: { $sum: { $cond: ["$found", 1, 0] } },
          soleBidder: { $sum: { $cond: [{ $eq: ["$count", 1] }, 1, 0] } },
          totalBidders: { $sum: { $ifNull: ["$count", 0] } },
        },
      },
    ],
    { allowDiskUse: true }
  );
  console.log(`[bidder-competition] sondeado: ${probedRows.length} organismos con al menos una compra mirada`);

  let conclusiveCount = 0;
  const docs = probedRows.map((r) => {
    const universe = universeById.get(r._id) ?? r.probed;
    const coverage = universe > 0 ? Math.min(1, r.probed / universe) : 0;
    const conclusive = r.withBidders >= MIN_WITH_BIDDERS && coverage >= MIN_COVERAGE;
    if (conclusive) conclusiveCount++;
    return {
      buyerId: r._id,
      buyerName: r.buyerName ?? null,
      universe,
      probed: r.probed,
      withBidders: r.withBidders,
      soleBidder: r.soleBidder,
      // El porcentaje SÓLO existe cuando la muestra lo sostiene. Null no es cero.
      soleRate: conclusive && r.withBidders > 0 ? r.soleBidder / r.withBidders : null,
      avgBidders: r.withBidders > 0 ? r.totalBidders / r.withBidders : null,
      coverage,
      conclusive,
      calculatedAt,
      dataVersion,
    };
  });

  if (dryRun) {
    const top = docs
      .filter((d) => d.conclusive)
      .sort((a, b) => (b.soleRate ?? 0) - (a.soleRate ?? 0))
      .slice(0, 10);
    console.log(`[bidder-competition] --dry-run · ${docs.length} filas · ${conclusiveCount} concluyentes`);
    for (const d of top) {
      console.log(
        `  ${Math.round((d.soleRate ?? 0) * 100)}% oferente único · ${d.soleBidder}/${d.withBidders} · cobertura ${Math.round(d.coverage * 100)}% (${d.probed}/${d.universe}) · ${d.buyerName ?? d.buyerId}`
      );
    }
    return;
  }

  for (const doc of docs) {
    await BidderCompetitionModel.updateOne({ buyerId: doc.buyerId }, { $set: doc }, { upsert: true });
  }

  // Barrido compute-then-swap con $lt, NUNCA $ne: dos corridas superpuestas con $ne se
  // borran la generación mutuamente (ya pasó y vació sice_catalog). Y sólo se barre si
  // esta corrida escribió algo.
  if (docs.length > 0) {
    const removed = await BidderCompetitionModel.deleteMany({ dataVersion: { $lt: dataVersion } });
    if (removed.deletedCount) console.log(`[bidder-competition] barridas ${removed.deletedCount} filas de generaciones viejas`);
  }

  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`[bidder-competition] listo en ${secs}s · ${docs.length} organismos · ${conclusiveCount} con muestra concluyente`);
}

run()
  .catch((error) => {
    console.error("[bidder-competition] falló:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
