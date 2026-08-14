#!/usr/bin/env tsx
/**
 * HALLAZGO «bps-sillas» — el BPS compró 1.457 sillas de ruedas de a una por llamado y el 94% las
 * ganó la misma empresa.
 *
 *   npx tsx tests/unit/hallazgo-bps-sillas.verify.ts
 *
 * QUÉ MIDE. Las compras adjudicadas del Banco de Previsión Social (buyer.id 28-1) con ítems de
 * silla de ruedas: cuántas son, cuánto suman, y qué parte se llevó MEDI IMPORT S.A. El monto de
 * MEDI se prorratea entre adjudicatarios en las pocas compras con más de uno, para no atribuirle
 * dinero que no ganó. El RUT se busca en sus tres formas —el corpus guarda el mismo RUT como
 * `212291040019`, `R212291040019` y `R/212291040019`— porque filtrar por una sola pierde casos.
 *
 * Después, lo que cambia el hallazgo: los oferentes, leídos del bloque «Proveedores participantes»
 * de la ficha del gobierno (colección `call_bidders`). Sólo cuentan las compras donde el bloque se
 * publicó (`found: true`): leer un silencio como «sin competencia» fabricaría el hallazgo.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 1.457 compras adjudicadas entre 2016 y 2026 por 289.630.923 pesos.
 *   - 1.369 (94,0%) y 255.782.057 pesos (88,3%) para MEDI IMPORT S.A. (RUT 212291040019).
 *   - No son compras al por mayor: 1.205 de las 1.216 compras del código 15230 son por una sola
 *     silla, y de las 1.125 compras donde el corpus registra el método, 1.117 son Concurso de
 *     Precios, un procedimiento MÁS competitivo que el que el tope legal le exigiría.
 *
 * LAS DOS EXPLICACIONES QUE CORREN EN CONTRA, Y QUE VAN EN LA FICHA. (1) Hoy hay competencia: de
 * los 129 llamados con el bloque leído, uno solo de los 65 de 2025 (1,5%) y 8 de los 64 de 2026
 * (12,5%) tuvieron oferente único, con 2,3 a 2,9 oferentes por llamado. (2) El precio bajó: la
 * mediana del unitario del código 15230 que cobra MEDI pasó de 233.607 pesos en 2022 a 131.148 en
 * 2026. El hallazgo NO es que el BPS pague caro hoy.
 *
 * QUÉ NO PRUEBA, Y ES EL LÍMITE DURO. La historia de oferentes anterior a 2025 no existe en la
 * base: sólo 129 de las 1.457 compras tienen leído el bloque «Proveedores participantes», y
 * ninguna es anterior a 2025. Así que no se puede afirmar que antes hubiera menos competencia —no
 * está medido, y no medido no es cero—. Tampoco hay nada sobre los precios de las ofertas
 * perdedoras: el corpus guarda sólo al ganador y las ofertas en línea de ARCE no son públicas. Y
 * la serie de precios mezcla modelos: el catálogo tiene UN código para toda silla de ruedas.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const BPS = "28-1";
const SILLA = /silla de ruedas/i;
/** El mismo RUT, en las tres formas en que el corpus lo guarda. */
const MEDI_IMPORT = ["R/212291040019", "R212291040019", "212291040019"];

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  console.log("=== compras de sillas de ruedas del BPS y cuánto se lleva MEDI IMPORT ===");
  const total: any = (
    await rel
      .aggregate(
        [
          {
            $match: {
              "buyer.id": BPS,
              "awards.items.classification.description": SILLA,
              tag: "award",
              "amount.primaryAmount": { $gt: 0, $lt: 50e9 },
            },
          },
          {
            $group: {
              _id: "$ocid",
              amt: { $first: "$amount.primaryAmount" },
              anio: { $first: { $year: "$date" } },
              sup: {
                $first: {
                  $reduce: { input: "$awards.suppliers.id", initialValue: [], in: { $concatArrays: ["$$value", "$$this"] } },
                },
              },
            },
          },
          {
            $project: {
              amt: 1,
              anio: 1,
              // Prorrateo entre adjudicatarios: no se le atribuye a MEDI dinero que no ganó.
              k: { $size: { $setUnion: ["$sup", []] } },
              hit: { $gt: [{ $size: { $setIntersection: ["$sup", MEDI_IMPORT] } }, 0] },
            },
          },
          {
            $group: {
              _id: null,
              compras: { $sum: 1 },
              monto: { $sum: "$amt" },
              comprasMedi: { $sum: { $cond: ["$hit", 1, 0] } },
              montoMedi: { $sum: { $cond: ["$hit", { $divide: ["$amt", { $max: ["$k", 1] }] }, 0] } },
              anioMin: { $min: "$anio" },
              anioMax: { $max: "$anio" },
            },
          },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  )[0];
  console.log(`  ${total.compras} compras adjudicadas entre ${total.anioMin} y ${total.anioMax} · $${Math.round(total.monto).toLocaleString("es-UY")}`);
  console.log(
    `  MEDI IMPORT: ${total.comprasMedi} compras (${((100 * total.comprasMedi) / total.compras).toFixed(1)}%) ·` +
    ` $${Math.round(total.montoMedi).toLocaleString("es-UY")} (${((100 * total.montoMedi) / total.monto).toFixed(1)}%)`
  );

  console.log("\n=== no son compras al por mayor: cantidad por compra del código 15230 ===");
  const porCantidad = await rel
    .aggregate(
      [
        { $match: { "buyer.id": BPS, tag: "award", "awards.items.classification.id": "15230" } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.id": "15230" } },
        { $group: { _id: "$ocid", q: { $sum: "$awards.items.quantity" } } },
        { $group: { _id: { $cond: [{ $lte: ["$q", 1] }, "una silla", "más de una"] }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const totalCod = (porCantidad as any[]).reduce((a, b) => a + b.n, 0);
  for (const c of porCantidad as any[]) console.log(`  ${String(c.n).padStart(5)} de ${totalCod} compras · ${c._id}`);

  console.log("\n=== el procedimiento, donde el corpus lo registra ===");
  const ocids = await rel.distinct("ocid", { "buyer.id": BPS, tag: "award", "awards.items.classification.description": SILLA });
  const metodos = await rel
    .aggregate(
      [
        { $match: { ocid: { $in: ocids }, "tender.procurementMethodDetails": { $exists: true, $ne: null } } },
        { $group: { _id: "$ocid", m: { $first: "$tender.procurementMethodDetails" } } },
        { $group: { _id: "$m", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const conMetodo = (metodos as any[]).reduce((a, b) => a + b.n, 0);
  for (const m of metodos as any[]) console.log(`  ${String(m.n).padStart(5)} de ${conMetodo} con método registrado · ${m._id}`);
  console.log(`  (con sillas de 150.000 a 300.000 pesos el BPS podría comprar DIRECTO; abre llamado igual)`);

  console.log("\n=== los oferentes, del bloque «Proveedores participantes» de la ficha del gobierno ===");
  const cb = db.collection("call_bidders");
  const porAnio = await cb
    .aggregate(
      [
        { $match: { ocid: { $in: ocids }, found: true, count: { $gte: 1 } } },
        {
          $group: {
            _id: "$sourceYear",
            llamados: { $sum: 1 },
            unico: { $sum: { $cond: [{ $eq: ["$count", 1] }, 1, 0] } },
            oferentes: { $avg: "$count" },
          },
        },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const a of porAnio as any[]) {
    console.log(
      `  ${a._id}: ${String(a.unico).padStart(3)} de ${String(a.llamados).padStart(3)} con oferente único` +
      ` (${((100 * a.unico) / a.llamados).toFixed(1).padStart(5)}%) · ${a.oferentes.toFixed(1)} oferentes por llamado`
    );
  }
  const sondeados = (porAnio as any[]).reduce((s, a) => s + a.llamados, 0);
  console.log(`  ATENCIÓN: sólo ${sondeados} de las ${total.compras} compras tienen el bloque leído, y ninguna es anterior a 2025.`);
  console.log("  Con esto NO se puede decir si antes había menos competencia: no está medido, y no medido no es cero.");

  console.log("\n=== quién se presenta y quién gana (sobre los llamados sondeados) ===");
  const presentaciones = await cb
    .aggregate(
      [
        { $match: { ocid: { $in: ocids }, found: true } },
        { $unwind: "$bidders" },
        { $group: { _id: "$bidders.name", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 6 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const p of presentaciones as any[]) console.log(`  ${String(p.n).padStart(4)} presentaciones · ${String(p._id).slice(0, 55)}`);

  console.log("\n=== el precio, que corre EN CONTRA del hallazgo: mediana del código 15230 que cobra MEDI ===");
  const precios = await rel
    .aggregate(
      [
        { $match: { "buyer.id": BPS, tag: "award", "awards.suppliers.id": { $in: MEDI_IMPORT }, date: { $gte: new Date("2022-01-01") } } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.id": "15230", "awards.items.unit.value.amount": { $gt: 0 } } },
        { $group: { _id: { $year: "$date" }, precios: { $push: "$awards.items.unit.value.amount" } } },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const a of precios as any[]) {
    const s = (a.precios as number[]).sort((x, y) => x - y);
    const m = s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2;
    console.log(`  ${a._id}: mediana $${Math.round(m).toLocaleString("es-UY")} (n=${s.length})`);
  }
  console.log("  El catálogo tiene un solo código para toda silla de ruedas: la serie mezcla modelos y no es un precio comparable.");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
