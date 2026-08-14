#!/usr/bin/env tsx
/**
 * HALLAZGO «maciel-enoxaparina» — el Hospital Maciel compra enoxaparina en compras directas que
 * quedan pegadas al tope legal, y cuando el tope subió 2,5 veces la compra subió 2,4 veces.
 *
 *   npx tsx tests/unit/hallazgo-maciel-enoxaparina.verify.ts
 *
 * QUÉ MIDE. Las adjudicaciones del Hospital Maciel (ASSE) del artículo ARCE 69888 (enoxaparina
 * inyectable) desde 2022, separando las compras directas con llamado propio de las ampliaciones de
 * contrato, que ARCE publica con un id_compra distinto y contarlas juntas inflaría el conteo. Para
 * cada año se toma la mediana del monto y se la compara contra el tope de compra directa vigente.
 *
 * DOS CORRECCIONES SIN LAS CUALES EL NÚMERO NO SIGNIFICA NADA. (1) El art. 156 del TOCAF dice que
 * el monto de cada gasto se determina CON IVA, y el corpus lo guarda sin impuestos: el factor 1,122
 * está medido contra el «Monto Total de la Compra» de la página oficial, no supuesto. (2) El tope
 * cambia todos los años por IPC, así que hay una tabla por año y no una línea fija.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   anio  compras  amplia  mediana_s/imp  mediana_c/imp  tope     %tope
 *   2022  36       46      180000         201960         220000   91,8%
 *   2023  48       48      207000         232254         239000   97,2%
 *   2024  33       30      216000         242352         251000   96,6%
 *   2025  44       44      230868         259034         263000   98,5%
 *   2026  13       0       564344         633194         654000   96,8%
 *
 *   El 1/1/2026 el tope pasó de $263.000 a $654.000 (×2,49, Ley 20.446 art. 28) y la compra
 *   mediana pasó de $230.868 a $564.344 (×2,44), con el MISMO precio unitario ($206,70 la jeringa)
 *   y de 1.100 a 2.500 jeringas por compra.
 *
 *   A nivel de todo el hospital, 403 de sus 682 compras propias de 2026 (59%) superan, con
 *   impuestos, el tope que regía en 2025. Y en 2025 gastó $20.130.820 sin impuestos sólo en este
 *   artículo, por encima del tope de licitación abreviada de ese año ($13.166.000).
 *
 * QUÉ NO PRUEBA, Y ES LO MÁS IMPORTANTE DE LA FICHA. En Uruguay fraccionar no es ilegal: el art. 43
 * del TOCAF es una facultad del ordenador condicionada a dejar constancia escrita del fundamento.
 * Esas constancias no están en el feed ni en la ficha pública, así que la medición NO prueba que el
 * fraccionamiento sea el «artificial» que ARCE califica de falta grave: prueba que el tamaño de la
 * compra está determinado por el tope. Y hay una explicación que corre en contra: las dos vías
 * competitivas que el hospital intentó no cerraron —la Licitación Pública 9/2024 de enoxaparina se
 * publicó el 10/12/2024 y su registro de adjudicación aparece recién el 30/7/2026, vacío—, y si
 * estuvo trabada, las compras directas son el puente inevitable.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

/** Topes de compra directa común por año, en pesos y CON impuestos (INE / Ley 20.446 art. 28). */
const TOPE: Record<number, number> = { 2022: 220000, 2023: 239000, 2024: 251000, 2025: 263000, 2026: 654000 };
/** Medido: «Monto Total de la Compra» de ARCE dividido por amount.primaryAmount del feed. */
const IVA = 1.122;
const ENOXAPARINA = "69888";

const mediana = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2;
};

async function main(): Promise<void> {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  const adjudicaciones = await rel
    .find(
      {
        tag: "award",
        "awards.items.classification.id": ENOXAPARINA,
        "buyer.name": /Maciel/i,
        date: { $gte: new Date("2022-01-01") },
      },
      {
        projection: {
          _id: 0,
          ocid: 1,
          date: 1,
          "amount.primaryAmount": 1,
          "awards.items.quantity": 1,
          "awards.items.unit.value.amount": 1,
          "awards.items.classification.id": 1,
        },
      }
    )
    .toArray();
  console.log(`adjudicaciones de enoxaparina del Maciel desde 2022: ${adjudicaciones.length}`);

  // Una compra directa con llamado propio tiene algún release de llamado sobre el mismo ocid.
  // Las ampliaciones de contrato no: ARCE las publica con id_compra propio y sin llamado.
  const conLlamado = new Set(
    await rel.distinct("ocid", {
      ocid: { $in: (adjudicaciones as any[]).map(d => d.ocid) },
      tag: { $in: ["tender", "tenderUpdate", "tenderCancellation", "tenderAmendment"] },
    })
  );

  const linea = (d: any): any[] =>
    ((d.awards ?? []) as any[]).flatMap(a => (a.items ?? []) as any[]).filter(i => i?.classification?.id === ENOXAPARINA);

  console.log("\nanio\tcompras\tamplia\tmediana_s/imp\tmediana_c/imp\ttope\t%tope\tjeringas\tprecio_unit");
  for (const anio of Object.keys(TOPE).map(Number)) {
    const delAnio = (adjudicaciones as any[]).filter(d => new Date(d.date).getUTCFullYear() === anio);
    const propias = delAnio.filter(d => conLlamado.has(d.ocid));
    const ampliaciones = delAnio.filter(d => !conLlamado.has(d.ocid));
    if (!propias.length) continue;
    const m = mediana(propias.map(d => Number(d.amount.primaryAmount)));
    const jeringas = mediana(propias.map(d => Number(linea(d)[0]?.quantity ?? 0)));
    const unitario = mediana(propias.map(d => Number(linea(d)[0]?.unit?.value?.amount ?? 0)));
    console.log(
      [
        anio,
        propias.length,
        ampliaciones.length,
        Math.round(m),
        Math.round(m * IVA),
        TOPE[anio],
        `${((m * IVA * 100) / TOPE[anio]).toFixed(1)}%`,
        jeringas,
        unitario,
      ].join("\t")
    );
  }

  const m2025 = mediana(
    (adjudicaciones as any[]).filter(d => new Date(d.date).getUTCFullYear() === 2025 && conLlamado.has(d.ocid)).map(d => Number(d.amount.primaryAmount))
  );
  const m2026 = mediana(
    (adjudicaciones as any[]).filter(d => new Date(d.date).getUTCFullYear() === 2026 && conLlamado.has(d.ocid)).map(d => Number(d.amount.primaryAmount))
  );
  console.log(`\nel tope subió ×${(TOPE[2026] / TOPE[2025]).toFixed(2)} y la compra mediana ×${(m2026 / m2025).toFixed(2)}`);

  console.log("\n=== el hospital entero: cuántas de sus compras directas de 2026 superan el tope de 2025 ===");
  const hospital2026 = await rel
    .aggregate(
      [
        {
          $match: {
            tag: "award",
            "buyer.name": /Maciel/i,
            date: { $gte: new Date("2026-01-01"), $lt: new Date("2027-01-01") },
            "amount.primaryAmount": { $gt: 0, $lt: 50e9 },
            "amount.primaryCurrency": "UYU",
          },
        },
        { $group: { _id: "$ocid", amt: { $max: "$amount.primaryAmount" } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  // Sólo las compras con llamado propio: las ampliaciones de contrato no son una compra nueva.
  const conLlamado2026 = new Set(
    await rel.distinct("ocid", {
      ocid: { $in: (hospital2026 as any[]).map(d => d._id) },
      tag: { $in: ["tender", "tenderUpdate", "tenderCancellation", "tenderAmendment"] },
    })
  );
  const propias2026 = (hospital2026 as any[]).filter(d => conLlamado2026.has(d._id));
  const sobreTopeViejo = propias2026.filter(d => d.amt * IVA > TOPE[2025]).length;
  console.log(
    `  ${sobreTopeViejo} de ${propias2026.length} compras propias de 2026 (${((100 * sobreTopeViejo) / propias2026.length).toFixed(0)}%)` +
    " superan, con impuestos, el tope que regía en 2025"
  );

  console.log("\n=== cuánto gastó el hospital en este solo artículo, por año ===");
  for (const anio of Object.keys(TOPE).map(Number)) {
    const delAnio = (adjudicaciones as any[]).filter(d => new Date(d.date).getUTCFullYear() === anio);
    const suma = delAnio.reduce((s, d) => s + Number(d.amount.primaryAmount), 0);
    console.log(`  ${anio}: $${Math.round(suma).toLocaleString("es-UY")} sin impuestos en ${delAnio.length} adjudicaciones`);
  }
  console.log("  (el tope de licitación abreviada de 2025 era $13.166.000: el gasto anual del artículo lo supera)");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
