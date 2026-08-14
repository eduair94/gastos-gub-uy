#!/usr/bin/env tsx
/**
 * HALLAZGO «antel-sin-adjudicatario» — ANTEL publicó 11.641 millones de pesos adjudicados en 2025
 * sin nombrar al adjudicatario en el sistema de compras.
 *
 *   npx tsx tests/unit/hallazgo-antel-sin-adjudicatario.verify.ts
 *
 * QUÉ MIDE. Sobre el año calendario 2025, cuántos releases con adjudicación y monto válido no
 * traen NINGÚN proveedor en ningún award, y de quién son. Después, el control que cierra la
 * pregunta: dentro del mismo canal de publicación (ocid `ocds-yfs5dr-i…`), qué porcentaje de sus
 * adjudicaciones publica adjudicatario cada organismo. Si el resto del canal publica y uno solo no,
 * no es una limitación del canal.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 2025: 109.465 releases con adjudicación y monto válido, por 178.059 millones de pesos.
 *   - 539 de ellos (11.642 millones, 6,5% del dinero) no traen ningún proveedor.
 *   - 538 de esos 539 —11.641 millones— son de ANTEL: el 99,5% de todo lo que ANTEL publicó
 *     como adjudicado ese año (11.697 millones, tercer comprador del Estado).
 *   - Control por canal en 2025: el Banco de Seguros publica adjudicatario en el 100% de sus
 *     2.806 registros, el BROU en el 100% de 2.117, la Intendencia de Montevideo en el 98,1% de
 *     15.457, ANCAP en 97,6% y OSE en 92,2%. ANTEL, en el 0%.
 *
 * QUÉ NO PRUEBA. Que el adjudicatario no esté publicado en ninguna parte: sí lo está, pero dentro
 * del acta en PDF enlazada en la ficha, y al menos una de las que abrimos es un escaneo sin capa
 * de texto. Lo que el script mide es que no está en el registro estructurado. Tampoco mide las 23
 * compras de 2025 sin ningún documento de resolución, que se verificaron a mano contra el sitio.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const ANIO_2025 = { $gte: new Date("2025-01-01"), $lt: new Date("2026-01-01") };
const CON_ADJUDICACION = { "awards.0": { $exists: true }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } };

/** Cuenta los proveedores de todos los awards del release, sin desarmar el documento. */
const PROVEEDORES = {
  $size: {
    $reduce: {
      input: { $ifNull: ["$awards", []] },
      initialValue: [],
      in: { $concatArrays: ["$$value", { $ifNull: ["$$this.suppliers", []] }] },
    },
  },
};

async function main(): Promise<void> {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  console.log("=== 2025: universo de adjudicaciones con monto válido ===");
  const universo: any = (
    await rel
      .aggregate(
        [
          { $match: { date: ANIO_2025, ...CON_ADJUDICACION } },
          { $group: { _id: null, n: { $sum: 1 }, pesos: { $sum: "$amount.primaryAmount" } } },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  )[0];
  console.log(`  ${universo.n.toLocaleString("es-UY")} releases · ${(universo.pesos / 1e6).toLocaleString("es-UY", { maximumFractionDigits: 0 })} millones de pesos`);

  console.log("\n=== los que no nombran a ningún proveedor, por comprador ===");
  const sinProveedor = await rel
    .aggregate(
      [
        { $match: { date: ANIO_2025, ...CON_ADJUDICACION } },
        { $addFields: { sup: PROVEEDORES } },
        { $match: { sup: 0 } },
        { $group: { _id: "$buyer.name", releases: { $sum: 1 }, pesos: { $sum: "$amount.primaryAmount" } } },
        { $sort: { pesos: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  let totalSin = 0;
  let pesosSin = 0;
  for (const b of sinProveedor as any[]) {
    totalSin += b.releases;
    pesosSin += b.pesos;
    console.log(`  ${String(b.releases).padStart(4)} releases · ${(b.pesos / 1e6).toFixed(0).padStart(7)}M UYU · ${String(b._id).slice(0, 60)}`);
  }
  console.log(
    `  TOTAL: ${totalSin} releases · ${(pesosSin / 1e6).toFixed(0)}M UYU` +
    ` = ${((100 * pesosSin) / universo.pesos).toFixed(1)}% del dinero adjudicado del año`
  );

  console.log("\n=== cuánto pesa eso dentro de ANTEL ===");
  const antel: any = (
    await rel
      .aggregate(
        [
          { $match: { date: ANIO_2025, ...CON_ADJUDICACION, "buyer.name": /Telecomunicaciones/i } },
          { $addFields: { sup: PROVEEDORES } },
          {
            $group: {
              _id: null,
              n: { $sum: 1 },
              pesos: { $sum: "$amount.primaryAmount" },
              sinN: { $sum: { $cond: [{ $eq: ["$sup", 0] }, 1, 0] } },
              sinPesos: { $sum: { $cond: [{ $eq: ["$sup", 0] }, "$amount.primaryAmount", 0] } },
            },
          },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  )[0];
  console.log(`  ANTEL 2025: ${antel.n} adjudicaciones · ${(antel.pesos / 1e6).toFixed(0)}M UYU`);
  console.log(
    `  sin adjudicatario: ${antel.sinN} (${((100 * antel.sinN) / antel.n).toFixed(1)}%) ·` +
    ` ${(antel.sinPesos / 1e6).toFixed(0)}M UYU = ${((100 * antel.sinPesos) / antel.pesos).toFixed(1)}% de su dinero`
  );

  console.log("\n=== control: el MISMO canal de publicación (ocid ocds-yfs5dr-i…), 2025 ===");
  const canal = await rel
    .aggregate(
      [
        { $match: { ocid: /^ocds-yfs5dr-i/, date: ANIO_2025, "awards.0": { $exists: true } } },
        { $addFields: { sup: PROVEEDORES } },
        {
          $group: {
            _id: "$buyer.name",
            n: { $sum: 1 },
            con: { $sum: { $cond: [{ $gt: ["$sup", 0] }, 1, 0] } },
          },
        },
        { $match: { n: { $gte: 200 } } },
        { $sort: { n: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const b of canal as any[]) {
    console.log(
      `  ${((100 * b.con) / b.n).toFixed(1).padStart(5)}% publica adjudicatario · ${String(b.n).padStart(6)} registros · ${String(b._id).slice(0, 55)}`
    );
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
