#!/usr/bin/env tsx
/**
 * HALLAZGO «ejercito-cerdo» — el Ejército adjudicó 394,4 millones de pesos en carne de cerdo a una
 * cooperativa de productores familiares, en seis licitaciones públicas con tres a cinco oferentes.
 *
 *   npx tsx tests/unit/hallazgo-ejercito-cerdo.verify.ts
 *
 * QUÉ MIDE. Las adjudicaciones del Comando General del Ejército (buyer.id 3-4) del artículo 13960
 * «CARNE PORCINA (USO HUMANO)» a Caluprocerd (RUT 080194250014): cuántas, cuánto suman sin
 * impuestos y cuántos kilos. Después la posición de esa cooperativa en el artículo dentro de todo
 * el Estado, la serie de precio por kilo del Ejército, y el volumen contratado año a año.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Seis licitaciones públicas entre el 3/4/2024 y el 16/12/2025 por 394.423.507 pesos sin
 *     impuestos (433.865.858 con IVA del 10%) y 1.874.338 kilos, siempre al mismo adjudicatario.
 *   - Los seis llamados: 1111858, 1112103, 1187731, 1190452, 1287113 y 1287125.
 *   - En todo el Estado desde 2018 la cooperativa concentra 926.770.715 de los 1.076.373.124 pesos
 *     gastados en ese artículo (86,1% del dinero y 84,2% de los kilos), frente a otros 66
 *     proveedores repartidos entre 42 organismos compradores. OJO: hay que agrupar por RUT y no
 *     por nombre — el corpus la guarda con dos grafías, «LIMITADA» y «LIMITATA», y agrupar por
 *     nombre parte su total en dos y da 56,2%.
 *   - El precio está planchado: 213,80 $/kg en la licitación grande de un año y 213,40 $/kg en la
 *     del año siguiente — una caída en términos reales.
 *   - Lo que sí se movió es el volumen: de 55.000 kilos adjudicados en 2022 a 485.690 en 2023 y a
 *     665.814 contratados en diciembre de 2025 para el suministro de 2026.
 *
 * EL CONTEXTO QUE VA EN LA FICHA, NO ES UN HALLAZGO CONTRA NADIE. La norma empuja exactamente en
 * esta dirección: la Ley 19.292 reserva a organizaciones de productores familiares un 30% de las
 * compras centralizadas de alimentos y el 100% de las no centralizadas, siempre que exista oferta.
 * Y hubo competencia real: de tres a cinco oferentes por llamado, verificado en el bloque
 * «Proveedores participantes» de cada ficha.
 *
 * QUÉ NO PRUEBA. A cuánto ofertaron los perdedores: las actas de adjudicación son PDF escaneados
 * como imagen. Sin eso no se puede afirmar que la cooperativa ganó por precio ni descartar que los
 * demás quedaran fuera por incumplimiento formal. Tampoco hay un precio de referencia externo del
 * kilo de cuarto de cerdo, así que decir que 213 $/kg es caro o barato sería opinión.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const EJERCITO = "3-4";
const CARNE_PORCINA = "13960";
const CALUPROCERD = ["R/080194250014", "R080194250014", "080194250014"];
const MONTO_VALIDO = { $gt: 0, $lt: 50e9 };

async function main(): Promise<void> {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  console.log("=== las seis licitaciones del Ejército a Caluprocerd (2024-2025) ===");
  const seis = await rel
    .aggregate(
      [
        {
          $match: {
            "buyer.id": EJERCITO,
            sourceYear: { $in: [2024, 2025] },
            tag: "award",
            "awards.suppliers.id": { $in: CALUPROCERD },
            "awards.items.classification.id": CARNE_PORCINA,
            "amount.primaryAmount": MONTO_VALIDO,
          },
        },
        {
          $group: {
            _id: "$ocid",
            fecha: { $first: "$date" },
            monto: { $first: "$amount.primaryAmount" },
            items: { $first: "$awards.items" },
          },
        },
        { $sort: { fecha: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  let total = 0;
  let kilos = 0;
  for (const c of seis as any[]) {
    const lineas = (c.items as any[][]).flat().filter(i => i?.classification?.id === CARNE_PORCINA);
    const kg = lineas.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const unit = lineas[0]?.unit?.value?.amount;
    total += c.monto;
    kilos += kg;
    console.log(
      `  ${new Date(c.fecha).toISOString().slice(0, 10)} · ${String(c._id).replace(/^ocds-[a-z0-9]+-/, "")} ·` +
      ` $${Math.round(c.monto).toLocaleString("es-UY").padStart(12)} · ${kg.toLocaleString("es-UY").padStart(9)} kg · ${Number(unit).toFixed(2)} $/kg`
    );
  }
  console.log(`  TOTAL: ${seis.length} licitaciones · $${Math.round(total).toLocaleString("es-UY")} sin impuestos`);
  console.log(`         $${Math.round(total * 1.1).toLocaleString("es-UY")} con IVA del 10% · ${kilos.toLocaleString("es-UY")} kilos`);

  console.log("\n=== el artículo 13960 en todo el Estado desde 2018: quién lo provee ===");
  const estado = await rel
    .aggregate(
      [
        {
          $match: {
            tag: "award",
            sourceYear: { $gte: 2018 },
            "awards.items.classification.id": CARNE_PORCINA,
            "amount.primaryAmount": MONTO_VALIDO,
          },
        },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.id": CARNE_PORCINA } },
        {
          // Por RUT y NO por nombre: el corpus guarda a esta cooperativa con dos grafías
          // («LIMITADA» y «LIMITATA»), y agrupar por nombre parte su total en dos.
          $group: {
            _id: { $arrayElemAt: ["$awards.suppliers.id", 0] },
            nombre: { $first: { $arrayElemAt: ["$awards.suppliers.name", 0] } },
            pesos: { $sum: { $multiply: [{ $ifNull: ["$awards.items.quantity", 0] }, { $ifNull: ["$awards.items.unit.value.amount", 0] }] } },
            kg: { $sum: { $ifNull: ["$awards.items.quantity", 0] } },
            organismos: { $addToSet: "$buyer.name" },
          },
        },
        { $sort: { pesos: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const totalPesos = (estado as any[]).reduce((s, p) => s + p.pesos, 0);
  const totalKg = (estado as any[]).reduce((s, p) => s + p.kg, 0);
  const organismos = new Set((estado as any[]).flatMap(p => p.organismos));
  const coop = (estado as any[]).find(p => CALUPROCERD.includes(p._id));
  console.log(
    `  proveedores del artículo: ${estado.length} · organismos compradores: ${organismos.size}` +
    ` · total $${Math.round(totalPesos).toLocaleString("es-UY")} · ${Math.round(totalKg).toLocaleString("es-UY")} kg`
  );
  if (coop) {
    console.log(
      `  Caluprocerd: $${Math.round(coop.pesos).toLocaleString("es-UY")} = ${((100 * coop.pesos) / totalPesos).toFixed(1)}% del dinero` +
      ` · ${((100 * coop.kg) / totalKg).toFixed(1)}% de los kilos`
    );
  }
  for (const p of (estado as any[]).slice(0, 5)) {
    console.log(`    $${Math.round(p.pesos).toLocaleString("es-UY").padStart(13)} · ${String(p.nombre).slice(0, 45)}`);
  }

  console.log("\n=== el precio y el volumen del Ejército, año a año ===");
  const serie = await rel
    .aggregate(
      [
        {
          $match: {
            "buyer.id": EJERCITO,
            tag: "award",
            "awards.items.classification.id": CARNE_PORCINA,
            "amount.primaryAmount": MONTO_VALIDO,
          },
        },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.id": CARNE_PORCINA } },
        {
          $group: {
            _id: { $year: "$date" },
            kg: { $sum: { $ifNull: ["$awards.items.quantity", 0] } },
            precios: { $push: "$awards.items.unit.value.amount" },
          },
        },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const a of serie as any[]) {
    const p = (a.precios as number[]).filter(x => typeof x === "number" && x > 0);
    const min = p.length ? Math.min(...p) : 0;
    const max = p.length ? Math.max(...p) : 0;
    console.log(`  ${a._id}: ${Math.round(a.kg).toLocaleString("es-UY").padStart(9)} kg · precio unitario ${min.toFixed(2)} a ${max.toFixed(2)} $/kg`);
  }

  console.log("\n=== contraste: el mismo proveedor a otro organismo ===");
  const otros = await rel
    .aggregate(
      [
        {
          $match: {
            tag: "award",
            "awards.suppliers.id": { $in: CALUPROCERD },
            "awards.items.classification.id": CARNE_PORCINA,
            date: { $gte: new Date("2025-01-01") },
            "amount.primaryAmount": MONTO_VALIDO,
          },
        },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.id": CARNE_PORCINA } },
        {
          $group: {
            _id: { comprador: "$buyer.name", fecha: "$date" },
            kg: { $sum: "$awards.items.quantity" },
            precio: { $max: "$awards.items.unit.value.amount" },
          },
        },
        { $sort: { kg: -1 } },
        { $limit: 6 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const o of otros as any[]) {
    console.log(
      `  ${new Date(o._id.fecha).toISOString().slice(0, 10)} · ${Math.round(o.kg).toLocaleString("es-UY").padStart(8)} kg ·` +
      ` ${Number(o.precio).toFixed(2)} $/kg · ${String(o._id.comprador).slice(0, 45)}`
    );
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
