#!/usr/bin/env tsx
/**
 * Mide el bug de MONEDA NULA. Necesita MONGODB_URI, así que `npm test` lo saltea por la
 * convención `.verify.ts`.
 *
 *   npx tsx tests/unit/moneda-nula.verify.ts
 *
 * EL BUG. Hay adjudicaciones donde el feed no trae moneda —`awards.items[].unit.value.currency`
 * y `amount.currency` en null— y el cálculo las toma como pesos uruguayos. Verificado a mano
 * contra la ficha oficial el 2026-08-14: la compra 1126716 dice literalmente
 * "U$S B 27.500,00" por unidad y 6 unidades, o sea USD 165.000; nuestro corpus la guarda como
 * 0,17M UYU. A ~42 pesos por dólar, el registro subestima esa compra unas 40 veces.
 *
 * POR QUÉ IMPORTA MÁS QUE UNA COMPRA. Cualquier ranking de proveedores o de organismos que salga
 * del corpus hereda el error, y no de forma aleatoria: se concentra en quienes cotizan en
 * dólares (vehículos, equipamiento médico, informática importada), que quedan sistemáticamente
 * por debajo de quienes cotizan en pesos.
 *
 * QUÉ NO HACE ESTE SCRIPT. No corrige nada. La corrección no es obvia: el dato correcto no está
 * en el feed, así que hay que elegir entre raspar la ficha de cada compra, marcarlas como
 * moneda desconocida y excluirlas de los rankings, o inferir la moneda de compras hermanas del
 * mismo proveedor. Es una decisión que mueve los totales publicados del sitio y por eso no se
 * toma dentro de un test.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(15 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

/** Verificados uno por uno contra la ficha oficial: todos dicen "U$S B" y todos están en null. */
const CASOS_VERIFICADOS = ["717053", "742800", "902464", "1012959", "1126716"];

async function main(): Promise<void> {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  console.log("=== casos verificados a mano contra comprasestatales.gub.uy ===");
  for (const id of CASOS_VERIFICADOS) {
    const r: any = await rel.findOne(
      { id: `adjudicacion-${id}` },
      { projection: { id: 1, date: 1, amount: 1, "awards.items.unit.value": 1, "awards.items.quantity": 1, "awards.suppliers.name": 1 } }
    );
    if (!r) { console.log(`  ${id}: no está en el corpus`); continue; }
    const item = (r.awards ?? []).flatMap((a: any) => a.items ?? [])[0];
    const proveedor = (r.awards ?? []).flatMap((a: any) => (a.suppliers ?? []).map((s: any) => s.name))[0];
    const unit = item?.unit?.value?.amount;
    const qty = item?.quantity;
    console.log(
      `  compra ${id} · ${String(r.date).slice(4, 15)} · ${String(proveedor).slice(0, 30)}\n` +
      `     guardado: ${(Number(r.amount?.primaryAmount) / 1e6).toFixed(2)}M UYU · moneda ${JSON.stringify(r.amount?.currency ?? null)} / ítem ${JSON.stringify(item?.unit?.value?.currency ?? null)}\n` +
      `     ficha oficial: ${qty} × U$S ${unit} = USD ${(Number(qty) * Number(unit)).toLocaleString("es-UY")}`
    );
  }

  console.log("\n=== escala: adjudicaciones con algún ítem sin moneda (desde 2015) ===");
  const escala = await rel
    .aggregate(
      [
        { $match: { tag: "award", date: { $gte: new Date("2015-01-01") }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        {
          $project: {
            sinMoneda: {
              $anyElementTrue: {
                $map: {
                  input: { $reduce: { input: "$awards.items", initialValue: [], in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] } } },
                  as: "i",
                  in: { $eq: [{ $ifNull: ["$$i.unit.value.currency", null] }, null] },
                },
              },
            },
            uyu: "$amount.primaryAmount",
          },
        },
        { $group: { _id: "$sinMoneda", n: { $sum: 1 }, uyu: { $sum: "$uyu" } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  const con = (escala as any[]).find(r => r._id === true) ?? { n: 0, uyu: 0 };
  const sin = (escala as any[]).find(r => r._id === false) ?? { n: 0, uyu: 0 };
  const total = con.n + sin.n;
  console.log(`  con algún ítem sin moneda: ${con.n} (${((100 * con.n) / total).toFixed(1)}%) · ${(con.uyu / 1e9).toFixed(1)}B UYU contabilizados`);
  console.log(`  con moneda en todos los ítems: ${sin.n} · ${(sin.uyu / 1e9).toFixed(1)}B UYU`);
  console.log(`\n  Si una parte relevante de esas ${con.n} está en dólares, el corpus las subestima ~40 veces.`);

  console.log("\n=== los proveedores más afectados (desde 2015) ===");
  const porProveedor = await rel
    .aggregate(
      [
        { $match: { tag: "award", date: { $gte: new Date("2015-01-01") }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 }, "awards.items.unit.value.currency": null } },
        { $set: { sup: { $arrayElemAt: [{ $arrayElemAt: ["$awards.suppliers.name", 0] }, 0] } } },
        { $match: { sup: { $ne: null } } },
        { $group: { _id: "$sup", n: { $sum: 1 }, uyu: { $sum: "$amount.primaryAmount" } } },
        { $sort: { n: -1 } },
        { $limit: 12 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const p of porProveedor as any[]) {
    console.log(`  ${String(p.n).padStart(5)} adj. · ${(p.uyu / 1e6).toFixed(1).padStart(9)}M UYU guardados · ${String(p._id).slice(0, 46)}`);
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
