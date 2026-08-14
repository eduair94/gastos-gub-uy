#!/usr/bin/env tsx
/**
 * HALLAZGO «ampliacion-invisible» — 395 obras se duplicaron con una ampliación y en los datos
 * abiertos figuran como un contrato nuevo.
 *
 *   npx tsx tests/unit/hallazgo-ampliacion-invisible.verify.ts            (caso testigo + base)
 *   npx tsx tests/unit/hallazgo-ampliacion-invisible.verify.ts --census   (además, las 570 fichas)
 *
 * EL CASO TESTIGO SE VERIFICA SIN BASE DE DATOS: son dos fichas del portal del Estado, y el script
 * las baja y las compara antes de conectarse a nada. Si sólo se quiere ver el hallazgo, alcanza con
 * abrir estas dos direcciones y mirar el encabezado de cada una:
 *   https://www.comprasestatales.gub.uy/consultas/detalle/id/529774   (la original, con el bloque
 *       «Ampliación/Renovación de contrato» que dice «Ampliación Nro. 1 — 07/08/2017»)
 *   https://www.comprasestatales.gub.uy/consultas/detalle/id/610468   (la ampliación: misma
 *       carátula «Licitación Pública 595/2016», mismo monto al centavo, pero arriba dice
 *       «Ver Compra Original» en lugar de «Ver Detalle del Llamado»)
 * El contrato de la Intendencia de Montevideo con GRINOR S.A. pasó de $69.726.649,99 a $139.453.299,98.
 *
 * QUÉ MIDE EN LA BASE. Que ese vínculo no existe en el dato abierto: ningún release tiene la etapa
 * `contracts` del estándar OCDS —donde el OCDS guarda las modificaciones—, ninguno tiene
 * `awards.amendments`, y ningún pliego declara un método que diga ampliación. Después, la huella
 * que sí se puede medir: compras distintas del mismo organismo al mismo RUT por exactamente el
 * mismo monto al centavo dentro de la familia de obra del catálogo SICE.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 0 releases con etapa `contracts`; 0 con `awards.amendments`; 0 pliegos con método «ampliación».
 *   - El único tag de enmienda, `awardUpdate`, es un canal de CORRECCIÓN de datos: de las
 *     adjudicaciones que corrige, la mayoría baja el monto.
 *   - Obra pública 2015-2025: 486 grupos y 570 compras repetidas al centavo. Verificadas contra la
 *     ficha pública, 395 (69%) llevan «Ver Compra Original», es decir son ampliaciones.
 *   - 395 de 395 llegan al feed SIN release de pliego: sin procedimiento, sin título, sin método y
 *     sin ninguna referencia a la compra original.
 *
 * AMPLIAR HASTA EL 100% ES LEGAL Y ESTÁ PUBLICADO, Y ESO VA ANTES QUE EL RESTO. El art. 74 del
 * TOCAF lo autoriza con acuerdo del adjudicatario y en las mismas condiciones pactadas, sin exigir
 * un llamado nuevo; en caminería suele ser la vía más barata porque la empresa ya está movilizada.
 * La ampliación aparece en la ficha pública con su resolución en PDF, su fecha y su monto. Y el
 * dinero no está mal sumado: el feed cuenta las dos compras, que es lo que se gastó.
 *
 * QUÉ NO PRUEBA. La huella sólo ve las ampliaciones del 100% EXACTO, porque son las únicas que
 * duplican el monto al centavo: las parciales, del 20% o del 50%, son invisibles en el corpus, así
 * que las 395 son un piso y no un total. Y en las cuatro obras con dos ampliaciones del 100% no se
 * puede afirmar incumplimiento sin leer la resolución en PDF: si la segunda se acumula sobre el
 * mismo objeto el techo quedó atrás, y si re-registra a la primera, no.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { compraIdFromOcid } from "../../shared/utils/ocid";

const CENSO_COMPLETO = process.argv.includes("--census");
const FAMILIA = "CONSTRUCCIONES, MEJORAS Y REPARACIONES EXTRAORDINARIAS";

/**
 * El portal NO sirve todas sus páginas en UTF-8: los acentos llegan rotos. Por eso ningún patrón de
 * este script exige una vocal acentuada — se usa `.` en su lugar.
 */
async function ficha(id: string): Promise<string> {
  const res = await fetch(`https://www.comprasestatales.gub.uy/consultas/detalle/id/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return "";
  return (await res.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&sol;/g, "/").replace(/\s+/g, " ");
}

async function main(): Promise<void> {
  console.log("=== el caso testigo, que se verifica SIN base de datos ===");
  const original = await ficha("529774");
  await new Promise((r) => setTimeout(r, 1100));
  const ampliacion = await ficha("610468");
  const monto = /69\.726\.649,99/;
  console.log(`  529774 (original)  · «Licitación Pública 595/2016»: ${/Licitaci.n P.blica 595\/2016/i.test(original) ? "sí" : "no"}` +
    ` · «Ver Compra Original»: ${/Ver Compra Original/i.test(original) ? "SÍ" : "no"}` +
    ` · bloque «Ampliación/Renovación de contrato»: ${/Ampliaci.n\/Renovaci.n de contrato/i.test(original) ? "sí" : "no"}` +
    ` · «Ampliación Nro. 1 · 07/08/2017»: ${/Ampliaci.n Nro\. 1 07\/08\/2017/i.test(original) ? "sí" : "no"}`);
  console.log(`  610468 (ampliación) · «Licitación Pública 595/2016»: ${/Licitaci.n P.blica 595\/2016/i.test(ampliacion) ? "sí" : "no"}` +
    ` · «Ver Compra Original»: ${/Ver Compra Original/i.test(ampliacion) ? "SÍ" : "no"}`);
  console.log(`  Mismo monto al centavo en las dos ($69.726.649,99): ${monto.test(original) && monto.test(ampliacion) ? "sí" : "no"}`);
  console.log("  El contrato pasó de $69.726.649,99 a $139.453.299,98. El botón «Ver Compra Original» existe en la web.");

  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  console.log("\n=== lo que NO existe en el dato abierto ===");
  const total = await rel.estimatedDocumentCount();
  console.log(`  releases con etapa \`contracts\`:      ${await rel.countDocuments({ contracts: { $exists: true } })} de ${total.toLocaleString("es-UY")}`);
  console.log(`  releases con \`awards.amendments\`:    ${await rel.countDocuments({ "awards.amendments": { $exists: true } })}`);
  console.log(`  pliegos con método que diga ampliación: ${await rel.countDocuments({ "tender.procurementMethodDetails": /ampliaci/i })}`);
  const llamados = await rel.countDocuments({ tag: "tender" });
  console.log(`  (sobre ${llamados.toLocaleString("es-UY")} releases de llamado)`);

  console.log("\n=== el único tag de enmienda que existe es un canal de CORRECCIÓN de datos ===");
  const upd = await rel.countDocuments({ tag: "awardUpdate" });
  console.log(`  ${upd.toLocaleString("es-UY")} releases con tag \`awardUpdate\`.`);
  const correcciones = await rel
    .aggregate(
      [
        { $match: { tag: { $in: ["award", "awardUpdate"] }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        { $group: { _id: "$ocid", base: { $max: { $cond: [{ $in: ["award", { $ifNull: ["$tag", []] }] }, "$amount.primaryAmount", null] } }, corr: { $max: { $cond: [{ $in: ["awardUpdate", { $ifNull: ["$tag", []] }] }, "$amount.primaryAmount", null] } } } },
        { $match: { base: { $ne: null }, corr: { $ne: null } } },
        {
          $group: {
            _id: null,
            n: { $sum: 1 },
            baja: { $sum: { $cond: [{ $lt: ["$corr", "$base"] }, 1, 0] } },
            igual: { $sum: { $cond: [{ $eq: ["$corr", "$base"] }, 1, 0] } },
            sube: { $sum: { $cond: [{ $gt: ["$corr", "$base"] }, 1, 0] } },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const c: any = correcciones[0] ?? { n: 0, baja: 0, igual: 0, sube: 0 };
  console.log(`  De las ${c.n.toLocaleString("es-UY")} adjudicaciones que corrige: ${c.baja} bajan el monto, ${c.igual} lo dejan igual y ${c.sube} lo suben.`);
  console.log(`  No es un canal de ampliaciones: una ampliación SUBE el gasto, y acá el ${((100 * (c.baja + c.igual)) / c.n).toFixed(1)}% no lo sube.`);

  console.log(`\n=== la huella medible: obra pública 2015-2025, familia «${FAMILIA}» ===`);
  const codigos = (await db.collection("sice_catalog").distinct("code", { famiName: FAMILIA })) as string[];
  console.log(`  ${codigos.length} códigos en la familia`);
  const obras = await rel
    .aggregate(
      [
        {
          $match: {
            tag: "award",
            sourceYear: { $gte: 2015, $lte: 2025 },
            "amount.primaryAmount": { $gt: 0, $lt: 50e9 },
            "awards.items.classification.id": { $in: codigos },
          },
        },
        {
          $project: {
            ocid: 1,
            buyer: "$buyer.id",
            comprador: "$buyer.name",
            amt: "$amount.primaryAmount",
            moneda: { $ifNull: [{ $arrayElemAt: [{ $objectToArray: { $ifNull: ["$amount.totalAmounts", {}] } }, 0] }, null] },
            rut: {
              $setUnion: [
                { $reduce: { input: "$awards.suppliers.id", initialValue: [], in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] } } },
                [],
              ],
            },
          },
        },
        { $match: { "rut.0": { $exists: true } } },
        {
          $group: {
            _id: {
              buyer: "$buyer",
              rut: { $replaceAll: { input: { $arrayElemAt: ["$rut", 0] }, find: "/", replacement: "" } },
              monto: { $round: ["$amt", 2] },
            },
            comprador: { $first: "$comprador" },
            ocids: { $addToSet: "$ocid" },
            moneda: { $first: "$moneda.k" },
          },
        },
        { $project: { comprador: 1, ocids: 1, moneda: 1, n: { $size: "$ocids" } } },
        { $match: { n: { $gte: 2 } } },
        { $sort: { "_id.monto": -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const adjudicacionesObra = await rel.countDocuments({
    tag: "award",
    sourceYear: { $gte: 2015, $lte: 2025 },
    "amount.primaryAmount": { $gt: 0, $lt: 50e9 },
    "awards.items.classification.id": { $in: codigos },
  });
  const repetidas = (obras as any[]).reduce((a, g) => a + (g.n - 1), 0);
  console.log(`  ${adjudicacionesObra.toLocaleString("es-UY")} adjudicaciones de obra · ${obras.length} grupos del mismo organismo, mismo RUT y mismo monto al centavo`);
  console.log(`  ${repetidas} compras repetidas (las que NO son la primera de su grupo)`);
  const monedas = new Map<string, number>();
  for (const g of obras as any[]) monedas.set(g.moneda ?? "—", (monedas.get(g.moneda ?? "—") ?? 0) + 1);
  console.log(`  Control de moneda de los grupos: ${[...monedas.entries()].map(([k, v]) => `${v} ${k}`).join(" · ")}`);

  console.log("\n=== 395 de 395: las ampliaciones confirmadas llegan al feed SIN release de pliego ===");
  const candidatas: string[] = [];
  const primeras: string[] = [];
  for (const g of obras as any[]) {
    const ordenados = [...g.ocids].sort();
    primeras.push(ordenados[0]);
    candidatas.push(...ordenados.slice(1));
  }
  // El método NO siempre vive en un release con tag `tender`: en el caso testigo está en un
  // `tenderUpdate` (aclar_llamado-529774-1). Filtrar por tag pierde la mitad de los pliegos.
  const conMetodo = { "tender.procurementMethodDetails": { $exists: true, $ne: null } };
  const conPliego = await rel.distinct("ocid", { ocid: { $in: candidatas }, ...conMetodo });
  const conPliegoPrimeras = await rel.distinct("ocid", { ocid: { $in: primeras }, ...conMetodo });
  console.log(`  De las ${candidatas.length} candidatas a ampliación, ${(conPliego as string[]).length} traen el procedimiento (${((100 * (candidatas.length - (conPliego as string[]).length)) / candidatas.length).toFixed(1)}% llegan sin nada).`);
  console.log(`  De las ${primeras.length} compras «primeras», ${(conPliegoPrimeras as string[]).length} SÍ lo traen (${((100 * (conPliegoPrimeras as string[]).length) / primeras.length).toFixed(1)}%).`);
  const metodosPrimeras = await rel
    .aggregate(
      [
        { $match: { ocid: { $in: primeras }, "tender.procurementMethodDetails": { $exists: true, $ne: null } } },
        { $group: { _id: "$tender.procurementMethodDetails", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 4 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const m of metodosPrimeras as any[]) console.log(`    ${String(m.n).padStart(4)} · ${m._id}`);
  console.log("  Un contrato que se duplicó sin volver a competir queda registrado como una adjudicación suelta,");
  console.log("  indistinguible de una compra directa. Cualquier estadística de competencia hecha sobre ese feed");
  console.log("  —incluidas las nuestras de oferente único y competencia aparente— la cuenta mal.");

  console.log("\n=== las cuatro obras con DOS ampliaciones del 100% cada una: la pregunta que se publica como pregunta ===");
  const dobles: Array<[string, string, string, string]> = [
    ["453562", "474310", "474325", "Intendencia de Colonia · EBAFOX S.A."],
    ["1003514", "1289863", "1289877", "Intendencia de Salto · JOSE CUJO S.A."],
    ["1015718", "1190516", "1198929", "Intendencia de Florida · INSUR S.A.S."],
    ["1135421", "1253629", "1253698", "Intendencia de Salto · BATISTA OLIVERA HONORIO BENITO"],
  ];
  for (const [orig, a1, a2, quien] of dobles) {
    const t1 = await ficha(a1);
    await new Promise((r) => setTimeout(r, 1100));
    const t2 = await ficha(a2);
    await new Promise((r) => setTimeout(r, 1100));
    console.log(`  ${quien}: original ${orig} · ampliación ${a1} «Ver Compra Original» ${/Ver Compra Original/i.test(t1) ? "sí" : "NO"} · ampliación ${a2} ${/Ver Compra Original/i.test(t2) ? "sí" : "NO"}`);
  }
  console.log("  Si las dos se acumulan sobre el mismo objeto el resultado es 200%; si la segunda re-registra a la");
  console.log("  primera, no. Eso lo dirime la resolución en PDF, no la base.");

  if (CENSO_COMPLETO) {
    console.log(`\n=== censo completo: las ${candidatas.length} candidatas contra la ficha pública ===`);
    const confirmadas: string[] = [];
    let leidas = 0;
    for (const ocid of candidatas) {
      const id = compraIdFromOcid(ocid);
      if (!id) continue;
      try {
        const t = await ficha(id);
        if (t) { leidas++; if (/Ver Compra Original/i.test(t)) confirmadas.push(ocid); }
      } catch { /* la ficha puede haber sido borrada del portal */ }
      await new Promise((r) => setTimeout(r, 1100));
    }
    console.log(`  ${confirmadas.length} de ${leidas} llevan «Ver Compra Original» (${leidas ? ((100 * confirmadas.length) / leidas).toFixed(0) : "—"}%): son ampliaciones.`);
    // El número que ordena todo: de las CONFIRMADAS, cuántas traen el procedimiento en el feed.
    const confirmadasConMetodo = await rel.distinct("ocid", { ocid: { $in: confirmadas }, ...conMetodo });
    console.log(`  De esas ${confirmadas.length} ampliaciones confirmadas, ${(confirmadasConMetodo as string[]).length} traen el procedimiento en el dato abierto.`);
    console.log("  El resto llega como una adjudicación suelta: sin procedimiento, sin título, sin método y sin");
    console.log("  ninguna referencia a la compra original que está ampliando.");
  } else {
    console.log(`\n  (con --census se verifican las ${candidatas.length} candidatas contra la ficha pública, a un pedido cada 1,1 s)`);
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
