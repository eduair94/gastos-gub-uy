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
/**
 * Y sobre todo: el bloque tiene que haber mostrado alguna vez a alguien que PERDIÓ.
 *
 * Medido el 2026-08-13 sobre lo sondeado: en las 65 compras de la Intendencia de Montevideo
 * (ids `i…`) la lista de "Proveedores participantes" coincide exactamente con la de
 * adjudicatarios en 65 de 65 — verificado además contra la ficha oficial i473855, donde las
 * tres participantes están las tres adjudicadas y la página no publica cuántas ofertas se
 * recibieron. Ese organismo publica adjudicatarios, no ofertas, y su "94% de oferente único"
 * sería un titular falso. En cambio Maldonado muestra perdedores en 6 de sus 7 compras no
 * únicas, así que su 84% sí mide algo.
 *
 * Un organismo sin un solo perdedor publicado queda INMEDIBLE (`conclusive:false`), que no es
 * lo mismo que limpio: se sigue publicando la fila con sus tres denominadores.
 */
export const MIN_WITH_LOSERS = 1;

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

  // 2. Lo sondeado, por organismo. El $lookup por `ocid` (indexado) trae los adjudicatarios
  //    de cada compra para poder contar las que publicaron algún oferente PERDEDOR: sin ese
  //    control, un organismo que alimenta el bloque con la lista de adjudicatarios puntúa
  //    como si nadie le compitiera. Son ~5k documentos, no el corpus entero.
  const probedRows: Array<{
    _id: string;
    buyerName: string | null;
    probed: number;
    withBidders: number;
    withLosers: number;
    soleBidder: number;
    totalBidders: number;
  }> = await CallBiddersModel.aggregate(
    [
      { $match: { buyerId: { $type: "string", $ne: "" } } },
      {
        $lookup: {
          from: "releases",
          let: { o: "$ocid" },
          pipeline: [
            { $match: { $expr: { $eq: ["$ocid", "$$o"] }, tag: "award" } },
            { $project: { _id: 0, ids: "$awards.suppliers.id" } },
          ],
          as: "aw",
        },
      },
      {
        // Sólo los dígitos: el mismo RUT aparece como "214644990018", "R214644990018",
        // "21.464.499.0018" o con guiones según de dónde venga el registro. Comparar crudo
        // haría que ningún adjudicatario coincida con su propia oferta y TODOS los oferentes
        // contarían como perdedores — que es exactamente lo que rompía la primera versión.
        $set: {
          winnerDigits: {
            $map: {
              input: {
                $reduce: {
                  input: { $reduce: { input: "$aw.ids", initialValue: [], in: { $concatArrays: ["$$value", "$$this"] } } },
                  initialValue: [],
                  in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] },
                },
              },
              in: {
                $reduce: {
                  input: { $regexFindAll: { input: { $toString: "$$this" }, regex: /[0-9]+/ } },
                  initialValue: "",
                  in: { $concat: ["$$value", "$$this.match"] },
                },
              },
            },
          },
        },
      },
      {
        $set: {
          hasLoser: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: { $ifNull: ["$bidders", []] },
                    as: "b",
                    cond: {
                      $and: [
                        { $ne: [{ $ifNull: ["$$b.rut", null] }, null] },
                        { $not: [{ $in: ["$$b.rut", { $ifNull: ["$winnerDigits", []] }] }] },
                      ],
                    },
                  },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$buyerId",
          buyerName: { $first: "$buyerName" },
          probed: { $sum: 1 },
          withBidders: { $sum: { $cond: ["$found", 1, 0] } },
          withLosers: { $sum: { $cond: [{ $and: ["$found", "$hasLoser"] }, 1, 0] } },
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
    const conclusive =
      r.withBidders >= MIN_WITH_BIDDERS && coverage >= MIN_COVERAGE && r.withLosers >= MIN_WITH_LOSERS;
    if (conclusive) conclusiveCount++;
    return {
      buyerId: r._id,
      buyerName: r.buyerName ?? null,
      universe,
      probed: r.probed,
      withBidders: r.withBidders,
      withLosers: r.withLosers,
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
        `  ${Math.round((d.soleRate ?? 0) * 100)}% oferente único · ${d.soleBidder}/${d.withBidders} · perdedores publicados ${d.withLosers} · cobertura ${Math.round(d.coverage * 100)}% (${d.probed}/${d.universe}) · ${d.buyerName ?? d.buyerId}`
      );
    }
    // Los que caen SÓLO por el control de artefacto: se listan para que el descarte sea visible.
    const artifacts = docs
      .filter((d) => d.withLosers < MIN_WITH_LOSERS && d.withBidders >= MIN_WITH_BIDDERS && d.coverage >= MIN_COVERAGE)
      .sort((a, b) => b.withBidders - a.withBidders);
    if (artifacts.length) {
      console.log(`[bidder-competition] inmedibles (el bloque nunca publicó un oferente no adjudicado): ${artifacts.length}`);
      for (const d of artifacts.slice(0, 10)) {
        console.log(`  ${d.soleBidder}/${d.withBidders} "únicas" descartadas · ${d.buyerName ?? d.buyerId}`);
      }
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
