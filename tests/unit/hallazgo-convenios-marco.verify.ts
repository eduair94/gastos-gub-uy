#!/usr/bin/env tsx
/**
 * HALLAZGO «convenios-marco» — el canal que la Ley 20.446 volvió obligatorio no tiene una sola
 * adjudicación ni un solo peso en los datos abiertos de compras.
 *
 *   npx tsx tests/unit/hallazgo-convenios-marco.verify.ts
 *
 * QUÉ MIDE. Todos los releases del corpus OCDS con `tender.procurementMethodDetails` = «Convenio
 * Marco»: cuántos son, de qué años, cuántas adjudicaciones traen y cuántos pesos suman. El control
 * imprescindible es el segundo bloque: las adjudicaciones NO llevan bloque `tender`, así que
 * buscarlas por método no probaría nada; hay que juntar los `ocid` de convenio marco y recorrer
 * TODOS los releases de esos ocid, cualquiera sea su tag. Si por ahí pasara dinero, aparecería ahí.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 48 releases con método «Convenio Marco», los 48 con tag [tenderUpdate].
 *   - 48 ocid distintos; recorriendo TODOS los releases de esos ocid: 0 adjudicaciones, $0.
 *   - Por año de registro: 1 (2015), 1 (2016), 6 (2017), 2 (2018), 9 (2019), 0 (2020), 2 (2021),
 *     2 (2022), 6 (2023), 16 (2024), 3 (2025), 0 (2026).
 *   - Cero registros con comprador o parte que contenga «UACM» (la unidad de ARCE que firma las
 *     órdenes de compra del canal).
 *   - Contraste: el corpus sí registra 193.339M (2023), 217.103M (2024) y 178.059M de pesos (2025).
 *
 * QUÉ NO PRUEBA. Que no se haya comprado por convenio marco: la ficha HTML del sitio sí publica la
 * adjudicación y ARCE informa miles de órdenes de compra. Prueba que nada de eso llega al dato
 * abierto reutilizable. El 0 de 2026 no es evidencia de nada por sí solo (en 2020 también fue 0 y
 * los llamados son de 1 a 12 por año): el hallazgo es que en once años no hay ni una adjudicación.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const CONVENIO_MARCO = /convenio\s*marco/i;

async function main(): Promise<void> {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  console.log("=== releases con tender.procurementMethodDetails = «Convenio Marco», por año ===");
  const porAnio = await rel
    .aggregate(
      [
        { $match: { "tender.procurementMethodDetails": CONVENIO_MARCO } },
        {
          $group: {
            _id: "$sourceYear",
            registros: { $sum: 1 },
            convenios: { $addToSet: "$tender.title" },
            adjudicaciones: { $sum: { $size: { $ifNull: ["$awards", []] } } },
            pesos: { $sum: { $ifNull: ["$amount.primaryAmount", 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  let registros = 0;
  let adjudicaciones = 0;
  let pesos = 0;
  const porAnioMap = new Map<number, any>((porAnio as any[]).map(a => [Number(a._id), a]));
  for (let anio = 2015; anio <= 2026; anio++) {
    const a = porAnioMap.get(anio) ?? { registros: 0, convenios: [], adjudicaciones: 0, pesos: 0 };
    registros += a.registros;
    adjudicaciones += a.adjudicaciones;
    pesos += a.pesos;
    console.log(
      `  ${anio}: ${String(a.registros).padStart(3)} registros · ${String(a.convenios.length).padStart(2)} convenios distintos` +
      ` · ${a.adjudicaciones} adjudicaciones · $${a.pesos.toLocaleString("es-UY")}`
    );
  }
  console.log(`  TOTAL: ${registros} registros · ${adjudicaciones} adjudicaciones · $${pesos.toLocaleString("es-UY")}`);

  console.log("\n=== control: TODOS los releases de esos ocid, por tag (las adjudicaciones no traen tender) ===");
  const ocids = await rel.distinct("ocid", { "tender.procurementMethodDetails": CONVENIO_MARCO });
  console.log(`  ocid de convenio marco: ${ocids.length}`);
  const porTag = await rel
    .aggregate(
      [
        { $match: { ocid: { $in: ocids } } },
        {
          $group: {
            _id: "$tag",
            n: { $sum: 1 },
            adjudicaciones: { $sum: { $size: { $ifNull: ["$awards", []] } } },
            proveedores: {
              $sum: {
                $size: {
                  $reduce: {
                    input: { $ifNull: ["$awards", []] },
                    initialValue: [],
                    in: { $concatArrays: ["$$value", { $ifNull: ["$$this.suppliers", []] }] },
                  },
                },
              },
            },
            pesos: { $sum: { $ifNull: ["$amount.primaryAmount", 0] } },
          },
        },
        { $sort: { n: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const t of porTag as any[]) {
    console.log(
      `  tag ${JSON.stringify(t._id)}: ${t.n} releases · ${t.adjudicaciones} adjudicaciones` +
      ` · ${t.proveedores} proveedores · $${t.pesos.toLocaleString("es-UY")}`
    );
  }

  console.log("\n=== la UACM (unidad de ARCE que compra por convenio marco) en el corpus ===");
  const uacmBuyer = await rel.countDocuments({ "buyer.name": /UACM/i });
  const uacmParty = await rel.countDocuments({ "parties.name": /UACM/i });
  console.log(`  releases con buyer.name que contenga «UACM»: ${uacmBuyer}`);
  console.log(`  releases con alguna parte que contenga «UACM»: ${uacmParty}`);

  console.log("\n=== contraste: lo que el corpus sí registra en los mismos años ===");
  for (const anio of [2023, 2024, 2025]) {
    const r: any = (
      await rel
        .aggregate(
          [
            {
              $match: {
                "awards.0": { $exists: true },
                date: { $gte: new Date(`${anio}-01-01`), $lt: new Date(`${anio + 1}-01-01`) },
                "amount.primaryAmount": { $gt: 0, $lt: 50e9 },
              },
            },
            { $group: { _id: null, n: { $sum: 1 }, pesos: { $sum: "$amount.primaryAmount" } } },
          ],
          { allowDiskUse: true }
        )
        .toArray()
    )[0];
    console.log(`  ${anio}: ${r.n} adjudicaciones · ${(r.pesos / 1e6).toLocaleString("es-UY", { maximumFractionDigits: 0 })} millones de pesos`);
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
