#!/usr/bin/env tsx
/**
 * HALLAZGO «ute-choferes» — la compra de chóferes de UTE figura publicada en $14.964 millones y la
 * resolución que la aprueba dice $32,9 millones.
 *
 *   npx tsx tests/unit/hallazgo-ute-choferes.verify.ts
 *
 * QUÉ MIDE. El release de la adjudicación 1315467 (UTE, Licitación Abreviada 103519/2026, provisión
 * de personal para servicios de chofer): la cantidad, el precio unitario y el monto publicado. El
 * campo «cantidad» trae 27.000.000 —que es el monto total en pesos que la resolución adjudica— y el
 * portal lo multiplica por 454,29, que es la tarifa HORARIA. Lo publicado es exactamente 454,29
 * veces lo adjudicado. Después mide cuánto pesa esa clase de registro dentro del total de UTE del
 * año, y comprueba que el detector de anomalías no marcó ninguno.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - cantidad 27000000 · unitario 454,29 · publicado en el corpus $12.265.830.000 sin IVA
 *     (el portal muestra «Monto Total de la Compra: $ 14.964.312.600,00», que es ese neto con IVA).
 *   - La resolución G.R. N°123/26 del 13/04/2026, enlazada en esa misma página, dice «Monto total
 *     a adjudicar por el periodo de contratación ITEM 1 Y 2: $ 27.000.000,00» y «TOTAL incluido
 *     IVA $ 32.940.000,00».
 *   - UTE 2026: $39.221.265.989 en 617 registros. El script lista los 12 registros de la clase,
 *     que suman $29.485.387.226 publicados: el 75% de todo lo que UTE reporta haber comprado en
 *     2026. De esos 12 se bajaron y leyeron las actas de 8, que suman $29.005.044.875 publicados
 *     contra $67.278.080 realmente adjudicados. Los otros 4 NO fueron verificados contra su acta,
 *     así que la cifra publicable es la de los 8.
 *   - Anomalías detectadas sobre el release: 0, sobre 1.945 anomalías de 2026, todas price_spike.
 *     Nuestro detector puntúa el PRECIO UNITARIO y usa la cantidad sólo para suprimir falsos
 *     positivos, nunca para detectar; $454,29 la hora de chofer es un precio normal.
 *   - La propia UTE usa en 2026 la convención inocua —precio unitario 1, cantidad en pesos— en
 *     360 líneas por $967.011.833.
 *
 * QUÉ NO PRUEBA. Nada sobre la compra, que es legal: lo realmente adjudicado ($27.000.000) está
 * holgadamente dentro del tope de licitación abreviada. Ninguna norma sanciona un número mal
 * tipeado. Y el acta fija un TOPE de gasto, no una ejecución: no sabemos cuánto le pagó UTE
 * efectivamente al proveedor y no lo afirmamos.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const UTE = "Administración Nacional de Usinas y Trasmisiones Eléctricas";
const RELEASE = "adjudicacion-1315467";

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  console.log("=== el registro de la compra de chóferes ===");
  const r: any = await rel.findOne({ id: RELEASE });
  if (!r) {
    console.log(`  ${RELEASE} no está en el corpus`);
    await disconnectFromDatabase();
    return;
  }
  const item = r.awards[0].items[0];
  console.log(`  cantidad ${item.quantity} · unitario ${item.unit.value.amount} · publicado $${Math.round(r.amount.primaryAmount).toLocaleString("es-UY")}`);
  console.log(`  proveedor: ${r.awards[0].suppliers?.[0]?.name ?? "s/d"}`);
  console.log(`  el acta adjudica $27.000.000 ($32.940.000 con IVA): lo publicado es ${(r.amount.primaryAmount / 27e6).toFixed(2)} veces eso`);
  console.log(`  y ${(r.amount.primaryAmount / 27e6).toFixed(2)} es exactamente el precio unitario, la tarifa por hora`);

  console.log("\n=== cuánto pesa la clase dentro de UTE 2026 ===");
  const ute: any = (
    await rel
      .aggregate(
        [
          { $match: { "buyer.name": UTE, sourceYear: 2026, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
          { $group: { _id: null, total: { $sum: "$amount.primaryAmount" }, n: { $sum: 1 } } },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  )[0];
  console.log(`  UTE 2026: $${Math.round(ute.total).toLocaleString("es-UY")} en ${ute.n} registros`);

  console.log("\n=== los registros de UTE 2026 con el mismo patrón (cantidad enorme × unitario chico) ===");
  const patron = await rel
    .aggregate(
      [
        { $match: { "buyer.name": UTE, sourceYear: 2026, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.quantity": { $gte: 1e6 }, "awards.items.unit.value.amount": { $gt: 1 } } },
        {
          $group: {
            _id: "$id",
            q: { $first: "$awards.items.quantity" },
            u: { $first: "$awards.items.unit.value.amount" },
            publicado: { $first: "$amount.primaryAmount" },
          },
        },
        { $sort: { publicado: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  let publicadoClase = 0;
  for (const p of patron as any[]) {
    publicadoClase += p.publicado;
    console.log(
      `  ${String(p._id).padEnd(22)} · cantidad ${String(p.q).padStart(10)} × unitario ${String(p.u).padStart(8)}` +
      ` = $${Math.round(p.publicado).toLocaleString("es-UY").padStart(14)}`
    );
  }
  console.log(`  ${patron.length} registros de la clase · $${Math.round(publicadoClase).toLocaleString("es-UY")} publicados`);
  console.log(`  = ${((100 * publicadoClase) / ute.total).toFixed(0)}% de todo lo que UTE reporta haber comprado en 2026`);

  console.log("\n=== qué pasa con el ranking de compradores de 2026 si se descuenta el error ===");
  const top = await rel
    .aggregate(
      [
        { $match: { sourceYear: 2026, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        { $group: { _id: "$buyer.name", t: { $sum: "$amount.primaryAmount" } } },
        { $sort: { t: -1 } },
        { $limit: 3 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const b of top as any[]) console.log(`  $${Math.round(b.t).toLocaleString("es-UY").padStart(16)} · ${String(b._id).slice(0, 55)}`);
  console.log("  Descontando los 8 registros verificados contra sus actas, UTE queda en $10.283.499.194 y deja de ser el mayor comprador del año.");

  console.log("\n=== la convención INOCUA que la misma UTE usa en paralelo (unitario 1, cantidad en pesos) ===");
  const inocua: any = (
    await rel
      .aggregate(
        [
          { $match: { "buyer.name": UTE, sourceYear: 2026 } },
          { $unwind: "$awards" },
          { $unwind: "$awards.items" },
          { $match: { "awards.items.unit.value.amount": 1 } },
          { $group: { _id: null, lineas: { $sum: 1 }, pesos: { $sum: "$awards.items.quantity" } } },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  )[0];
  console.log(`  ${inocua?.lineas ?? 0} líneas por $${Math.round(inocua?.pesos ?? 0).toLocaleString("es-UY")}`);

  console.log("\n=== por qué nuestro propio detector no lo vio ===");
  const anomalias = db.collection("anomalies");
  console.log(`  anomalías sobre ${RELEASE}: ${await anomalias.countDocuments({ releaseId: RELEASE })}`);
  const tipos = await anomalias
    .aggregate([{ $match: { sourceYear: 2026 } }, { $group: { _id: "$type", n: { $sum: 1 } } }, { $sort: { n: -1 } }], { allowDiskUse: true })
    .toArray();
  for (const t of tipos as any[]) console.log(`  anomalías 2026 de tipo ${t._id}: ${t.n}`);
  console.log("  El detector puntúa el precio unitario; $454,29 la hora de chofer es normal. La cantidad sólo suprime, nunca detecta.");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
