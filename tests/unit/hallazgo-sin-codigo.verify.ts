#!/usr/bin/env tsx
/**
 * HALLAZGO «sin-codigo» — más de la mitad del dinero adjudicado se publica sin código de artículo, y
 * dos tercios de eso es ANCAP comprando crudo.
 *
 *   npx tsx tests/unit/hallazgo-sin-codigo.verify.ts
 *
 * QUÉ MIDE. El feed publica los ítems adjudicados bajo dos esquemas de clasificación:
 * `x_catalogo_arce`, que trae el código del artículo del catálogo SICE, y `x_ODG` (objeto del
 * gasto), que trae siempre `classification.id` igual a «0» —ningún código— y sólo un texto libre.
 * El script mide cuánto dinero cae de cada lado entre 2016 y 2025, quién usa cada esquema, y la
 * consecuencia: una línea sin código no tiene contra qué compararse.
 *
 * ESTO NOS APUNTA A NOSOTROS. Nuestra propia página de productos se construye sobre un rollup que
 * excluye ese bloque llamándolo «junk sentinel», sin decirle al lector que deja afuera más de la
 * mitad del gasto.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Entre 2016 y 2025 el Estado adjudicó $1.275.480 millones; $697.010 millones (54,6%), en
 *     214.230 registros, no llevan código de artículo en ninguna de sus líneas.
 *   - Dos tercios de ese bloque es ANCAP: $467.430 millones (67,1%). Descontando ANCAP quedan
 *     $229.570 millones sin código, el 18,0% de todo lo adjudicado en la década.
 *   - Ningún registro mezcla los dos esquemas: o está todo codificado o no lo está nada.
 *   - Sólo 9 organismos usan `x_ODG`, todos entes autónomos, servicios descentralizados o
 *     intendencias, con sistemas propios que se conectan al feed por una cañería distinta a la del
 *     SICE de la Administración Central.
 *   - `item_price_baselines` no tiene NI UNA línea de base para el código «0».
 *
 * LA EXPLICACIÓN VA PRIMERO Y CUBRE DOS TERCIOS. Un cargamento de «CRUDO BONNY LIGHT» o de «CRUDO
 * WTI MIDLAND» no es un artículo de catálogo: se paga contra el Brent o el WTI del día y no contra
 * un histórico de compras uruguayas, así que codificarlo no habilitaría ninguna comparación. Lo
 * mismo, en menor medida, vale para el gasoil de UTE y para las obras llave en mano de OSE y ANP,
 * donde el «artículo» es un proyecto entero.
 *
 * QUÉ NO PRUEBA. Ninguna norma se viola de forma clara. La única disposición en juego (art. 331
 * num. 4 de la Ley 19.889) recae sobre ARCE —coordinar la aplicación efectiva del catálogo— y no
 * sobre cada organismo como deber sancionable, y habla de «bienes», no de servicios ni de obras.
 * Desde la base tampoco se puede saber si el código existe adentro y se pierde al exportar: sólo
 * vemos lo que el feed trae.
 *
 * TRAMPA: 2026 queda fuera de toda la serie porque ese año el feed trae `classification.scheme`
 * nulo en el 100% de las líneas, así que no es comparable.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const DESDE = 2016;
const HASTA = 2025;

/** Las líneas de `awards[].items[]` aplanadas SIN `$unwind`: el corpus es de 2,18M documentos. */
const LINEAS = {
  $reduce: {
    input: { $reduce: { input: { $ifNull: ["$awards", []] }, initialValue: [], in: { $concatArrays: ["$$value", { $ifNull: ["$$this.items", []] }] } } },
    initialValue: [],
    in: { $concatArrays: ["$$value", [{ e: { $ifNull: ["$$this.classification.scheme", null] }, c: { $ifNull: ["$$this.classification.id", null] } }]] },
  },
};

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  const base = { tag: "award", sourceYear: { $gte: DESDE, $lte: HASTA }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } };

  console.log(`=== el titular: cuánto dinero se publica sin código de artículo, ${DESDE}-${HASTA} ===`);
  const titular = await rel
    .aggregate(
      [
        { $match: base },
        { $project: { amt: "$amount.primaryAmount", comprador: "$buyer.name", l: LINEAS } },
        {
          $project: {
            amt: 1,
            comprador: 1,
            odg: { $size: { $filter: { input: "$l", cond: { $eq: ["$$this.e", "x_ODG"] } } } },
            arce: { $size: { $filter: { input: "$l", cond: { $eq: ["$$this.e", "x_catalogo_arce"] } } } },
          },
        },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $and: [{ $gt: ["$odg", 0] }, { $gt: ["$arce", 0] }] }, then: "mixto" },
                  { case: { $gt: ["$odg", 0] }, then: "sin código (x_ODG)" },
                  { case: { $gt: ["$arce", 0] }, then: "con código (x_catalogo_arce)" },
                ],
                default: "sin esquema declarado",
              },
            },
            n: { $sum: 1 },
            monto: { $sum: "$amt" },
            ancap: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ["$comprador", ""] }, regex: "ANCAP|Administraci.n Nacional de Combustibles" } }, "$amt", 0] } },
          },
        },
        { $sort: { monto: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const total = (titular as any[]).reduce((a, b) => a + b.monto, 0);
  for (const t of titular as any[]) {
    console.log(`  $${String(Math.round(t.monto / 1e6).toLocaleString("es-UY")).padStart(9)} millones · ${((100 * t.monto) / total).toFixed(1).padStart(5)}% · ${String(t.n).padStart(7)} registros · ${t._id}`);
  }
  const sinCodigo: any = (titular as any[]).find((t) => t._id === "sin código (x_ODG)");
  const mixto: any = (titular as any[]).find((t) => t._id === "mixto");
  console.log(`  Total adjudicado: $${Math.round(total / 1e6).toLocaleString("es-UY")} millones`);
  console.log(`  De ANCAP, dentro del bloque sin código: $${Math.round(sinCodigo.ancap / 1e6).toLocaleString("es-UY")} millones (${((100 * sinCodigo.ancap) / sinCodigo.monto).toFixed(1)}% del bloque)`);
  console.log(`  Descontando ANCAP quedan $${Math.round((sinCodigo.monto - sinCodigo.ancap) / 1e6).toLocaleString("es-UY")} millones sin código, el ${((100 * (sinCodigo.monto - sinCodigo.ancap)) / total).toFixed(1)}% de todo lo adjudicado en la década.`);
  console.log(`  Los dos esquemas son EXCLUYENTES: ${mixto ? mixto.n : 0} registros mezclan los dos.`);

  console.log("\n=== `x_ODG` nunca trae código: el id es siempre «0» ===");
  const esquemas = await rel
    .aggregate(
      [
        { $match: base },
        { $project: { l: LINEAS } },
        { $unwind: "$l" },
        { $match: { "l.e": { $ne: null } } },
        { $group: { _id: { e: "$l.e", conCodigo: { $cond: [{ $in: ["$l.c", [null, "0", ""]] }, "sin código", "con código real"] } }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const e of esquemas as any[]) console.log(`  ${String(e.n).padStart(8).toLocaleString("es-UY")} líneas · ${String(e._id.e).padEnd(18)} · ${e._id.conCodigo}`);

  console.log("\n=== quién usa `x_ODG`, sobre su propio gasto ===");
  const organismos = await rel
    .aggregate(
      [
        { $match: base },
        { $project: { amt: "$amount.primaryAmount", comprador: "$buyer.name", l: LINEAS } },
        { $project: { amt: 1, comprador: 1, odg: { $size: { $filter: { input: "$l", cond: { $eq: ["$$this.e", "x_ODG"] } } } } } },
        { $group: { _id: "$comprador", propio: { $sum: "$amt" }, sinCodigo: { $sum: { $cond: [{ $gt: ["$odg", 0] }, "$amt", 0] } } } },
        { $match: { sinCodigo: { $gt: 0 } } },
        { $sort: { sinCodigo: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  console.log(`  ${organismos.length} organismos publican alguna línea bajo x_ODG.`);
  for (const o of (organismos as any[]).slice(0, 10)) {
    console.log(`  ${((100 * o.sinCodigo) / o.propio).toFixed(0).padStart(4)}% de su gasto · $${String(Math.round(o.sinCodigo / 1e6).toLocaleString("es-UY")).padStart(8)} millones · ${String(o._id ?? "").slice(0, 46)}`);
  }
  console.log("  Son entes autónomos, servicios descentralizados y dos intendencias: sistemas propios que llegan");
  console.log("  al feed por una cañería distinta a la del SICE de la Administración Central. La vía es institucional.");

  console.log("\n=== la proporción no fue siempre así ===");
  const serie = await rel
    .aggregate(
      [
        { $match: { tag: "award", sourceYear: { $gte: 2012, $lte: 2025 }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        { $project: { anio: "$sourceYear", amt: "$amount.primaryAmount", l: LINEAS } },
        { $project: { anio: 1, amt: 1, odg: { $size: { $filter: { input: "$l", cond: { $eq: ["$$this.e", "x_ODG"] } } } } } },
        { $group: { _id: "$anio", total: { $sum: "$amt" }, sinCodigo: { $sum: { $cond: [{ $gt: ["$odg", 0] }, "$amt", 0] } } } },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const s of serie as any[]) console.log(`  ${s._id}: ${((100 * s.sinCodigo) / s.total).toFixed(1).padStart(5)}% del dinero sin código`);
  console.log("  El salto de 2015 a 2016 hay que confirmarlo contra el historial de integraciones de ARCE antes de leerlo como un deterioro.");

  console.log("\n=== dónde la explicación del mercado internacional deja de alcanzar ===");
  const etiquetas = await rel
    .aggregate(
      [
        { $match: base },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.scheme": "x_ODG" } },
        { $group: { _id: "$awards.items.classification.description", n: { $sum: 1 }, monto: { $sum: { $ifNull: ["$awards.items.unit.value.amount", 0] } } } },
        { $match: { _id: /RUBROS|NO CATALOGADO|IMPREVISTOS|GLOBALES|LL SS|VARIOS|OTROS/i } },
        { $sort: { monto: -1 } },
        { $limit: 8 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const e of etiquetas as any[]) console.log(`  ${String(e.n).padStart(6)} líneas · ${String(e._id ?? "").slice(0, 62)}`);
  console.log("  Ahí no hay explicación de mercado internacional posible: hace falta el pliego de cada uno.");

  console.log("\n=== el texto libre no agrupa: no reemplaza a un código ===");
  const libre = await rel
    .aggregate(
      [
        { $match: { tag: "award", sourceYear: { $gte: 2020, $lte: 2025 }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $group: { _id: { e: "$awards.items.classification.scheme", d: { $ifNull: ["$awards.items.classification.description", "$awards.items.classification.id"] } }, n: { $sum: 1 } } },
        { $group: { _id: "$_id.e", distintas: { $sum: 1 }, lineas: { $sum: "$n" }, unaVez: { $sum: { $cond: [{ $eq: ["$n", 1] }, 1, 0] } } } },
        { $sort: { lineas: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const l of libre as any[]) {
    if (!l._id) continue;
    console.log(`  ${String(l._id).padEnd(18)} · ${String(l.distintas).padStart(7)} etiquetas distintas para ${String(l.lineas).padStart(7)} líneas · ${((100 * l.unaVez) / l.distintas).toFixed(1)}% aparecen una sola vez`);
  }

  console.log("\n=== la consecuencia, que es medible y no una insinuación ===");
  const baselines = db.collection("item_price_baselines");
  const nBase = await baselines.countDocuments();
  const nCero = await baselines.countDocuments({ classificationId: { $in: ["0", null] } });
  console.log(`  ${nBase.toLocaleString("es-UY")} líneas de base de precio · ${nCero} para el código «0»`);
  console.log("  Una línea sin código no puede compararse contra ningún precio de referencia, por construcción.");

  console.log("\n=== la hipótesis con la que empezamos, DESCARTADA ===");
  const genericos = await db
    .collection("product_analytics")
    .aggregate(
      [
        { $match: { $or: [{ canonicalName: /^(OTROS|VARIOS|GENERIC|SIN ESPECIFICAR|NO CATALOGAD)/i }, { description: /^(OTROS|VARIOS|GENERIC|SIN ESPECIFICAR|NO CATALOGAD)/i }] } },
        { $group: { _id: null, n: { $sum: 1 }, monto: { $sum: { $ifNull: ["$totalValue", 0] } } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const g: any = genericos[0] ?? { n: 0, monto: 0 };
  console.log(`  Artículos genéricos tipo «otros» o «varios» dentro del catálogo: ${g.n} códigos · $${Math.round(g.monto / 1e6).toLocaleString("es-UY")} millones`);
  console.log("  El catálogo es específico. Lo que no pasa por él es la mitad del dinero.");

  console.log("\n=== 2026 queda fuera: el feed de ese año trae el esquema nulo ===");
  const dosMilVeintiseis = await rel
    .aggregate(
      [
        { $match: { tag: "award", sourceYear: 2026 } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $group: { _id: { $ifNull: ["$awards.items.classification.scheme", "nulo"] }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const d of dosMilVeintiseis as any[]) console.log(`  ${String(d.n).padStart(7)} líneas de 2026 · esquema ${d._id}`);

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
