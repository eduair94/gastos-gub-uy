#!/usr/bin/env tsx
/**
 * HALLAZGO «anomalias-cantidad» — NUESTRO detector de anomalías miró una compra de UTE de 12.265
 * millones y no la marcó: mide precios unitarios y nunca mira cantidades.
 *
 *   npx tsx tests/unit/hallazgo-anomalias-cantidad.verify.ts
 *
 * QUÉ MIDE. Seis cosas, todas en lectura pura, sin escribir en la base ni ejecutar ningún job:
 *   (1) el caso, y que la colección de anomalías devuelve cero documentos para ese release;
 *   (2) la línea de base viva que lo juzgó;
 *   (3) el veredicto, importando el scorer de PRODUCCIÓN (src/jobs/anomaly-stats) y alimentándolo
 *       con esa línea de base leída de la base: devuelve nulo;
 *   (4) cuántos registros más tienen la misma forma dentro de la ventana propia del detector;
 *   (5) el subconjunto que no necesita estadística: unidades que son períodos de calendario
 *       compradas cien mil veces o más;
 *   (6) la cobertura del detector, para poder comparar lo que marcó con lo que dejó pasar.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - ocds-yfs5dr-1315467 (UTE, ESTILO S.R.L., 21/05/2026): un solo ítem, «SERVICIO DE CHOFER»,
 *     clasificación 32917, cantidad 27.000.000, unitario 454,29, monto 12.265.830.000. Anomalías
 *     sobre ese release: 0.
 *   - Línea de base 32917 / UYU / «unidad»: n=12, p25 59.683,11, p50 223.095,49, p95 3.800.439,46,
 *     mínimo 454,29. Los 454,29 no sólo pasaron el filtro: son el precio unitario MÁS BAJO de toda
 *     su categoría, y el mínimo de esa línea de base es esta misma compra. El detector la miró, la
 *     incorporó a su propia referencia de precios y la clasificó como barata.
 *   - En los últimos 24 meses, las líneas con cantidad ≥ 100.000 y cantidad×unitario ≥ 100 millones
 *     son 46 líneas en 42 registros, por 513.859.359.636 pesos. Marcadas: cero.
 *   - Las que no necesitan estadística (unidad MENSUAL o ANUAL comprada ≥ 100.000 veces): 7 líneas
 *     por 9.059.627.358 pesos, las 7 de UTE. Incluye 9.600.000 unidades «MENSUAL» de vigilancia
 *     (800.000 años) y 4.146.624 «ANUAL» de limpieza (4,1 millones de años).
 *   - La colección de anomalías tiene 6.307 documentos, TODOS de tipo price_spike. Sumando su valor
 *     de línea, todo lo que el detector marcó en su historia vale 10.846.892.139 pesos. Una sola
 *     línea que no marcó vale 12.265.830.000.
 *   - «outlier_quantity» está declarado en el esquema Mongo, en los tipos compartidos, en el enum
 *     público de la API, en el esquema del servidor MCP y en el frontend con color, ícono, etiqueta
 *     y formateador propio. Documentos de ese tipo en la base: 0 de 6.307.
 *
 * QUÉ NO PRUEBA. Que el detector esté mal hecho. Nunca prometió esto: emite un único tipo, pico de
 * precio, y acertó las dos veces —454,29 la hora de chofer y 395 la hora de administrativo son
 * tarifas corrientes—. Un detector de cantidades ingenuo sería una fuente de falsos positivos: el
 * Estado compra de verdad 200.000.000 de litros de fuel oil y 4.568.020 raciones escolares. Y la
 * regla exacta que dejó pasar el caso es una corrección medida: el piso de cola superior se agregó
 * porque sacaba un 24% del conjunto de precios sin explicación, y todo lo que sacaba estaba por
 * debajo del percentil 95.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { scoreUnitPrice } from "../../src/jobs/anomaly-stats";

const RELEASE = "adjudicacion-1315467";
const CLASIFICACION = "32917";
const CANT_MIN = 100_000;
const VALOR_MIN = 100_000_000;
const fmt = (n: number): string => Math.round(n).toLocaleString("es-UY");

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");
  const anomalias = db.collection("anomalies");

  console.log("=== 1. el caso, y que nuestro detector no lo marcó ===");
  const r: any = await rel.findOne({ id: RELEASE });
  if (r) {
    const it = r.awards[0].items[0];
    console.log(`  ${r.ocid} · ${r.buyer?.name?.slice(0, 40)} · ${r.awards[0].suppliers?.[0]?.name}`);
    console.log(`  «${it.description}» · clasificación ${it.classification?.id} · cantidad ${it.quantity} · unidad ${it.unit?.name} · unitario ${it.unit?.value?.amount}`);
    console.log(`  monto publicado: $${fmt(r.amount.primaryAmount)}`);
  }
  console.log(`  anomalías sobre ${RELEASE}: ${await anomalias.countDocuments({ releaseId: RELEASE })}`);

  console.log("\n=== 2. la línea de base VIVA que lo juzgó ===");
  const bl: any = await db.collection("item_price_baselines").findOne({ classificationId: CLASIFICACION, currency: "UYU", unitName: "unidad" });
  if (!bl) {
    console.log("  no hay línea de base para 32917/UYU/unidad: el hallazgo cambió de forma, hay que releerlo");
  } else {
    console.log(`  n=${bl.n} · p25 ${bl.p25} · p50 ${bl.p50} · p75 ${bl.p75} · p95 ${bl.p95} · min ${bl.min} · max ${bl.max}`);
    console.log(`  el MÍNIMO de esa línea de base es ${bl.min}: es esta misma compra. El detector la incorporó a su propia referencia.`);

    console.log("\n=== 3. el veredicto, con el scorer de PRODUCCIÓN, sin adivinar ===");
    const veredicto = scoreUnitPrice(454.29, {
      n: bl.n,
      medianLn: bl.medianLn,
      madLn: bl.madLn,
      p25: bl.p25,
      p75: bl.p75,
      p95: bl.p95,
      recurringPrices: new Set<number>(bl.recurringPrices ?? []),
      modePrice: bl.modePrice,
      modeShare: bl.modeShare,
    });
    console.log(`  scoreUnitPrice(454.29, línea de base 32917/UYU/unidad) → ${veredicto === null ? "null (no hay pico)" : JSON.stringify(veredicto)}`);
    console.log(`  la regla: si el precio no supera el p95 (${bl.p95}) no hay pico. 454,29 es el precio más bajo de su categoría.`);
  }

  console.log("\n=== 4. cuántos registros más tienen la misma forma (ventana propia del detector: 24 meses) ===");
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 24);
  const t0 = Date.now();
  const poblacion = await rel
    .aggregate(
      [
        { $match: { tag: "award", date: { $gte: desde } } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.quantity": { $gte: CANT_MIN }, "awards.items.unit.value.amount": { $gt: 0 } } },
        {
          $project: {
            _id: 0,
            id: 1,
            ocid: 1,
            buyer: "$buyer.name",
            unidad: "$awards.items.unit.name",
            cantidad: "$awards.items.quantity",
            unitario: "$awards.items.unit.value.amount",
            valor: { $multiply: ["$awards.items.quantity", "$awards.items.unit.value.amount"] },
            monto: "$amount.primaryAmount",
          },
        },
        { $match: { valor: { $gte: VALOR_MIN } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const registros = [...new Set((poblacion as any[]).map((p) => p.id))];
  const valorTotal = (poblacion as any[]).reduce((a, p) => a + p.valor, 0);
  console.log(`  ${poblacion.length} líneas en ${registros.length} registros · $${fmt(valorTotal)} de valor de línea · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const marcados = await anomalias.countDocuments({ releaseId: { $in: registros } });
  console.log(`  de esos ${registros.length} registros, marcados por el detector: ${marcados}`);
  const bajoTecho = (poblacion as any[]).filter((p) => typeof p.monto === "number" && p.monto < 50e9);
  console.log(`  bajo el techo de validez de 50.000 millones (lo que sí entra en nuestros totales publicados): ${bajoTecho.length} líneas, $${fmt(bajoTecho.reduce((a, p) => a + p.valor, 0))}`);

  console.log("\n=== 5. el subconjunto que NO necesita estadística: unidades que son períodos de calendario ===");
  const calendario = await rel
    .aggregate(
      [
        { $match: { tag: "award", "amount.primaryAmount": { $gte: VALOR_MIN } } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        {
          $match: {
            "awards.items.quantity": { $gte: CANT_MIN },
            "awards.items.unit.name": { $in: ["MENSUAL", "ANUAL", "Mensual", "Anual", "mensual", "anual"] },
          },
        },
        {
          $project: {
            _id: 0,
            id: 1,
            buyer: "$buyer.name",
            desc: "$awards.items.description",
            unidad: "$awards.items.unit.name",
            cantidad: "$awards.items.quantity",
            unitario: "$awards.items.unit.value.amount",
            valor: { $multiply: ["$awards.items.quantity", { $ifNull: ["$awards.items.unit.value.amount", 0] }] },
          },
        },
        { $sort: { valor: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  let valorCal = 0;
  for (const c of calendario as any[]) {
    valorCal += c.valor;
    const anios = c.unidad.toUpperCase() === "MENSUAL" ? c.cantidad / 12 : c.cantidad;
    console.log(
      `  ${String(c.buyer).slice(0, 22).padEnd(22)} ${String(c.desc).slice(0, 26).padEnd(26)} ${String(c.cantidad).padStart(10)} ${String(c.unidad).padEnd(8)}` +
        ` × ${String(c.unitario).padStart(8)} = $${fmt(c.valor).padStart(14)} · ${fmt(anios)} años`
    );
  }
  const idsCal = [...new Set((calendario as any[]).map((c) => c.id))];
  console.log(`  ${calendario.length} líneas · $${fmt(valorCal)} · marcadas por el detector: ${await anomalias.countDocuments({ releaseId: { $in: idsCal } })}`);
  console.log("  «9.600.000 unidades MENSUAL» es inválido leyendo únicamente la definición del campo en OCDS 1.1:");
  console.log("  Item.quantity es «The number of units to be provided» y Item.unit.value «The monetary value of a single unit».");

  console.log("\n=== 6. la cobertura del detector: qué marcó en toda su historia ===");
  const tipos = await anomalias.aggregate([{ $group: { _id: "$type", n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray();
  for (const t of tipos as any[]) console.log(`  tipo ${String(t._id).padEnd(18)} ${t.n}`);
  const cobertura: any = (
    await anomalias
      .aggregate([
        {
          $group: {
            _id: null,
            n: { $sum: 1 },
            valor: { $sum: { $multiply: [{ $ifNull: ["$detectedValue", 0] }, { $ifNull: ["$metadata.itemQuantity", 0] }] } },
            maxQty: { $max: "$metadata.itemQuantity" },
            sobre100k: { $sum: { $cond: [{ $gte: [{ $ifNull: ["$metadata.itemQuantity", 0] }, 100000] }, 1, 0] } },
          },
        },
      ])
      .toArray()
  )[0];
  console.log(`  todo lo que marcó en su historia vale $${fmt(cobertura.valor)} de valor de línea (${cobertura.n} marcas)`);
  console.log(`  una sola línea que NO marcó, la de UTE, vale $12.265.830.000`);
  console.log(`  la mayor cantidad que aparece en cualquiera de las marcas es ${fmt(cobertura.maxQty)}; sólo ${cobertura.sobre100k} de ${cobertura.n} superan las 100.000 unidades`);
  console.log(`  documentos de tipo outlier_quantity: ${await anomalias.countDocuments({ type: "outlier_quantity" })}`);
  console.log("  El tipo está declarado en shared/models/anomaly.ts, shared/types/database.ts, app/types/index.ts,");
  console.log("  app/composables/useAnomalies.ts (color, ícono, etiqueta y formateador propio),");
  console.log("  app/server/utils/openapi.ts y packages/mcp/src/tools.ts. El job que lo emita no existe.");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
