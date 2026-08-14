#!/usr/bin/env tsx
/**
 * HALLAZGO «antel-monto» — el monto de las compras de ANTEL está publicado en la web del Estado
 * desde al menos 2010 y entró a los datos abiertos el 2 de enero de 2025.
 *
 *   npx tsx tests/unit/hallazgo-antel-monto.verify.ts
 *
 * QUÉ MIDE. La serie de ANTEL dentro del canal comparable —los archivos OCDS mensuales
 * `a-MM-AAAA.json`, mismo archivo y mismo lector todos los años—: cuántos registros hay por año y
 * cuántos traen monto. Comparar años sin acotar el canal no diría nada, porque desde 2025 hay
 * además un scrapeo web propio que no existe hacia atrás. El segundo bloque busca la fecha del
 * primer registro con monto, que es el corte que hay que explicar.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Canal comparable, 2008-2024: 2.362 registros de ANTEL y sólo 17 con monto (0,7%).
 *   - Canal comparable, 2025: 499 de 533 con monto (93,6%), por 11.395.505.626 pesos.
 *   - Quedan 2.345 registros del canal comparable sin monto, y 2.882 adjudicaciones de ANTEL
 *     anteriores a 2025 sin monto sumando todos los canales.
 *   - La serie arranca el 2 de enero de 2025, primer día hábil del año y dos meses ANTES del
 *     cambio de gobierno del 1º de marzo: no coincide con el cambio de gestión.
 *   - Desde el 1/1/2025, contando todos los canales: 748 adjudicaciones con monto por
 *     14.024.289.516 pesos (11.697.454.124 en 2025 y 2.326.835.392 en 2026).
 *
 * LA APERTURA ES A MEDIAS, Y ESO ESTÁ EN LA MISMA FICHA. 473 de esas 499 adjudicaciones de 2025
 * (el 99,5% del dinero) publican el monto pero no nombran al adjudicatario. Ese lado está medido
 * aparte, en hallazgo-antel-sin-adjudicatario.verify.ts.
 *
 * QUÉ NO PRUEBA. Que el monto estuviera oculto: NO lo estaba. Se abrieron 14 fichas de ANTEL en el
 * sitio de ARCE entre 2010 y 2024 y las 14 muestran «Monto Total de la Compra». Lo que faltaba era
 * en los datos abiertos, no en la web. El script no puede medir eso: se verifica con
 *   curl -s https://www.comprasestatales.gub.uy/consultas/detalle/id/i220663 | grep -o 'Monto Total de la Compra.\{0,120\}'
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const ANTEL = "Administración Nacional de Telecomunicaciones";
/** Los archivos OCDS mensuales publicados por ARCE: el único canal comparable año contra año. */
const CANAL_COMPARABLE = /^a-\d{2}-\d{4}\.json$/;
const MONTO_VALIDO = { $gt: 0, $lt: 50e9 };

async function main(): Promise<void> {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  console.log("=== ANTEL en el canal comparable (archivos a-MM-AAAA.json), por año ===");
  const serie = await rel
    .aggregate(
      [
        { $match: { "buyer.name": ANTEL, sourceFileName: CANAL_COMPARABLE } },
        {
          $group: {
            _id: "$sourceYear",
            releases: { $sum: 1 },
            conMonto: { $sum: { $cond: [{ $and: [{ $gt: ["$amount.primaryAmount", 0] }, { $lt: ["$amount.primaryAmount", 50e9] }] }, 1, 0] } },
            monto: { $sum: { $cond: [{ $and: [{ $gt: ["$amount.primaryAmount", 0] }, { $lt: ["$amount.primaryAmount", 50e9] }] }, "$amount.primaryAmount", 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  let viejosN = 0;
  let viejosConMonto = 0;
  for (const a of serie as any[]) {
    if (Number(a._id) < 2025) {
      viejosN += a.releases;
      viejosConMonto += a.conMonto;
    }
    console.log(
      `  ${a._id}: ${String(a.releases).padStart(4)} registros · ${String(a.conMonto).padStart(4)} con monto` +
      ` (${((100 * a.conMonto) / a.releases).toFixed(1).padStart(5)}%) · ${(a.monto / 1e6).toFixed(0).padStart(6)}M UYU`
    );
  }
  console.log(`  ANTES de 2025: ${viejosN} registros, ${viejosConMonto} con monto (${((100 * viejosConMonto) / viejosN).toFixed(1)}%)`);
  console.log(`  quedan ${viejosN - viejosConMonto} registros del canal comparable sin monto`);

  // El agujero real es mayor que el del canal comparable: contando TODOS los canales.
  const agujero = await rel.countDocuments({
    "buyer.name": ANTEL,
    sourceYear: { $lt: 2025 },
    "awards.0": { $exists: true },
    "amount.primaryAmount": { $not: { $gt: 0, $lt: 50e9 } } as never,
  });
  console.log(`  sumando TODOS los canales: ${agujero} adjudicaciones de ANTEL anteriores a 2025 sin monto`);

  console.log("\n=== la fecha del corte: primeras adjudicaciones de ANTEL con monto ===");
  const primeras = await rel
    .find(
      { "buyer.name": ANTEL, sourceFileName: CANAL_COMPARABLE, sourceYear: { $gte: 2025 }, "amount.primaryAmount": MONTO_VALIDO },
      { projection: { _id: 0, id: 1, date: 1, "amount.primaryAmount": 1 }, sort: { date: 1 }, limit: 5 }
    )
    .toArray();
  for (const p of primeras as any[]) {
    console.log(`  ${new Date(p.date).toISOString().slice(0, 10)} · ${p.id} · ${(p.amount.primaryAmount / 1e6).toFixed(1)}M UYU`);
  }
  console.log("  (el cambio de gobierno fue el 1º de marzo de 2025: la serie arranca dos meses antes)");

  console.log("\n=== todos los canales juntos: ANTEL desde el 1/1/2025 ===");
  const total: any = (
    await rel
      .aggregate(
        [
          { $match: { "buyer.name": ANTEL, date: { $gte: new Date("2025-01-01") }, "amount.primaryAmount": MONTO_VALIDO } },
          {
            $group: {
              _id: { $year: "$date" },
              n: { $sum: 1 },
              monto: { $sum: "$amount.primaryAmount" },
            },
          },
          { $sort: { _id: 1 } },
          { $group: { _id: null, porAnio: { $push: "$$ROOT" }, n: { $sum: "$n" }, monto: { $sum: "$monto" } } },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  )[0];
  for (const a of total.porAnio) console.log(`  ${a._id}: ${a.n} adjudicaciones · $${Math.round(a.monto).toLocaleString("es-UY")}`);
  console.log(`  TOTAL: ${total.n} adjudicaciones · $${Math.round(total.monto).toLocaleString("es-UY")}`);

  console.log("\n=== la otra mitad: de esas adjudicaciones de 2025, cuántas nombran al adjudicatario ===");
  const prov: any = (
    await rel
      .aggregate(
        [
          { $match: { "buyer.name": ANTEL, sourceFileName: CANAL_COMPARABLE, sourceYear: 2025, "amount.primaryAmount": MONTO_VALIDO } },
          {
            $addFields: {
              sup: {
                $size: {
                  $reduce: {
                    input: { $ifNull: ["$awards", []] },
                    initialValue: [],
                    in: { $concatArrays: ["$$value", { $ifNull: ["$$this.suppliers", []] }] },
                  },
                },
              },
            },
          },
          {
            $group: {
              _id: null,
              n: { $sum: 1 },
              monto: { $sum: "$amount.primaryAmount" },
              sinN: { $sum: { $cond: [{ $eq: ["$sup", 0] }, 1, 0] } },
              sinMonto: { $sum: { $cond: [{ $eq: ["$sup", 0] }, "$amount.primaryAmount", 0] } },
            },
          },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  )[0];
  console.log(
    `  ${prov.sinN} de ${prov.n} no nombran adjudicatario · ${(prov.sinMonto / 1e6).toFixed(0)}M de ${(prov.monto / 1e6).toFixed(0)}M UYU` +
    ` = ${((100 * prov.sinMonto) / prov.monto).toFixed(1)}% del dinero`
  );

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
