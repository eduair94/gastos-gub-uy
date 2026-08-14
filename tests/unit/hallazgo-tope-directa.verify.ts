#!/usr/bin/env tsx
/**
 * HALLAZGO «tope-directa» — cuando el tope de la compra directa pasó a $654.000, el amontonamiento
 * de compras justo debajo del tope se mudó con él.
 *
 *   npx tsx tests/unit/hallazgo-tope-directa.verify.ts
 *
 * QUÉ MIDE. Sobre adjudicaciones en pesos de enero a julio de 2024, 2025 y 2026, deduplicadas por
 * ocid, cuántas caen justo debajo del tope de la compra directa y cuántas justo arriba. La
 * corrección que hay que hacer antes de mirar cualquier número: el corpus guarda los montos SIN
 * impuestos y el tope legal es CON impuestos, así que a la tasa básica de 22% el tope de 2025
 * ($263.000) se ve en la base como $215.574 y el de 2026 ($654.000) como $536.066.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Adjudicaciones en pesos enero-julio: 69.026 (2024), 55.792 (2025), 37.466 (2026).
 *   - Ventana ±1,1% del punto VIEJO ($215.574): razón debajo/arriba 0,51 · 2,98 · 1,03.
 *     El amontonamiento de 2025 se deshizo en 2026.
 *   - Ventana ±1,1% del punto NUEVO ($536.066): 0,37 · 0,69 · 3,71, con 126 debajo contra 34 arriba.
 *   - Se sostiene en ventanas de ±3.000 a ±15.000 pesos (2026: 4,40 · 3,76 · 2,93 · 2,38, contra
 *     0,65 · 0,69 · 0,85 · 0,91 en 2025) y no lo arrastra un organismo: excluyendo al Hospital
 *     Maciel la razón de 2026 sube a 4,09.
 *   - 16 adjudicaciones de 2026 caen exactamente en $536.066, 10 de ellas del CODICEN de ANEP;
 *     en 2025 y en 2024 no hay ninguna.
 *
 * LO QUE CORRE EN CONTRA Y ES PARTE DEL HALLAZGO. No hay corrida hacia la compra directa: la banda
 * que la ley abrió pasó de 9,09% de las adjudicaciones en 2025 a 10,40% en 2026, contra 8,88% en
 * 2024. Y el método de compra NO está en los datos abiertos: cero de las 42.544 adjudicaciones de
 * enero-julio de 2026 traen tender.procurementMethodDetails, así que el rótulo «Compra Directa»
 * sólo se puede leer en el HTML de cada ficha, de a una.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const PERIODOS = [
  { anio: 2024, desde: "2024-01-01", hasta: "2024-08-01" },
  { anio: 2025, desde: "2025-01-01", hasta: "2025-08-01" },
  { anio: 2026, desde: "2026-01-01", hasta: "2026-08-01" },
] as const;

/** Tasa básica de IVA. El corpus guarda montos sin impuestos; el tope legal es con impuestos. */
const IVA = 1.22;
const TOPE_VIEJO = 263000 / IVA; // $215.573,77
const TOPE_NUEVO = 654000 / IVA; // $536.065,57

const filtroBase = (desde: string, hasta: string) => ({
  date: { $gte: new Date(desde), $lt: new Date(hasta) },
  tag: "award",
  "amount.primaryAmount": { $gt: 0, $lt: 50e9 },
  "amount.primaryCurrency": "UYU",
  "amount.currencies": ["UYU"],
});

/** Una fila por ocid: el monto y el comprador, para poder excluir un organismo después. */
async function montosPorOcid(desde: string, hasta: string): Promise<{ amt: number; buyer: string }[]> {
  const rel = mongoose.connection.db!.collection("releases");
  const filas = await rel
    .aggregate(
      [
        { $match: filtroBase(desde, hasta) },
        { $group: { _id: "$ocid", amt: { $max: "$amount.primaryAmount" }, buyer: { $first: "$buyer.name" } } },
        { $project: { _id: 0, amt: 1, buyer: { $ifNull: ["$buyer", ""] } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  return filas as { amt: number; buyer: string }[];
}

const razon = (filas: { amt: number }[], punto: number, ancho: number) => {
  const debajo = filas.filter(f => f.amt >= punto - ancho && f.amt <= punto).length;
  const arriba = filas.filter(f => f.amt > punto && f.amt <= punto + ancho).length;
  return { debajo, arriba, r: debajo / Math.max(arriba, 1) };
};

async function main(): Promise<void> {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  const datos = new Map<number, { amt: number; buyer: string }[]>();
  for (const p of PERIODOS) datos.set(p.anio, await montosPorOcid(p.desde, p.hasta));

  console.log("=== universo: adjudicaciones en pesos, enero a julio, deduplicadas por ocid ===");
  for (const p of PERIODOS) console.log(`  ${p.anio}: ${datos.get(p.anio)!.length.toLocaleString("es-UY")}`);

  for (const [etiqueta, topeBruto, punto] of [
    ["tope VIEJO $263.000", 263000, TOPE_VIEJO],
    ["tope NUEVO $654.000", 654000, TOPE_NUEVO],
  ] as const) {
    const ancho = punto * 0.011;
    console.log(`\n=== ${etiqueta} → neto $${punto.toFixed(0)} · ventana ±1,1% (±$${ancho.toFixed(0)}) ===`);
    for (const p of PERIODOS) {
      const { debajo, arriba, r } = razon(datos.get(p.anio)!, punto, ancho);
      console.log(`  ${p.anio}: ${String(debajo).padStart(4)} debajo vs ${String(arriba).padStart(4)} arriba = ${r.toFixed(2)}`);
    }
  }

  console.log("\n=== robustez: la razón alrededor del punto nuevo con otros anchos de ventana ===");
  const anchos = [3000, 6000, 10000, 15000];
  console.log(`  ancho:      ${anchos.map(a => `±${(a / 1000).toFixed(0)}k`.padStart(7)).join("")}`);
  for (const p of PERIODOS) {
    const fila = anchos.map(a => razon(datos.get(p.anio)!, TOPE_NUEVO, a).r.toFixed(2).padStart(7)).join("");
    console.log(`  ${p.anio}:      ${fila}`);
  }

  console.log("\n=== no lo arrastra un organismo: 2026 sin el Hospital Maciel (ventana ±1,1%) ===");
  const ancho11 = TOPE_NUEVO * 0.011;
  const sinMaciel = datos.get(2026)!.filter(f => !/maciel/i.test(f.buyer));
  const conM = razon(datos.get(2026)!, TOPE_NUEVO, ancho11);
  const sinM = razon(sinMaciel, TOPE_NUEVO, ancho11);
  console.log(`  con Maciel:  ${conM.debajo} debajo vs ${conM.arriba} arriba = ${conM.r.toFixed(2)}`);
  console.log(`  sin Maciel:  ${sinM.debajo} debajo vs ${sinM.arriba} arriba = ${sinM.r.toFixed(2)}`);

  console.log("\n=== adjudicaciones clavadas exactamente en $536.066 (= $654.000 / 1,22) ===");
  for (const p of PERIODOS) {
    const exactas = datos.get(p.anio)!.filter(f => f.amt >= 536064 && f.amt <= 536067);
    console.log(`  ${p.anio}: ${exactas.length}`);
    if (p.anio === 2026) {
      const porComprador = new Map<string, number>();
      for (const e of exactas) porComprador.set(e.buyer, (porComprador.get(e.buyer) ?? 0) + 1);
      for (const [b, n] of [...porComprador].sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(2)} · ${b.slice(0, 60)}`);
    }
  }

  console.log("\n=== la contracara: NO hay corrida hacia la banda que la ley abrió ===");
  console.log(`  (adjudicaciones entre $${TOPE_VIEJO.toFixed(0)} y $${TOPE_NUEVO.toFixed(0)}, sobre el total del período)`);
  for (const p of PERIODOS) {
    const todas = datos.get(p.anio)!;
    const enBanda = todas.filter(f => f.amt > TOPE_VIEJO && f.amt <= TOPE_NUEVO).length;
    const sm = todas.filter(f => !/maciel/i.test(f.buyer));
    const enBandaSm = sm.filter(f => f.amt > TOPE_VIEJO && f.amt <= TOPE_NUEVO).length;
    console.log(
      `  ${p.anio}: ${((100 * enBanda) / todas.length).toFixed(2)}% (${enBanda} de ${todas.length})` +
      ` · sin Maciel ${((100 * enBandaSm) / sm.length).toFixed(2)}%`
    );
  }

  console.log("\n=== por qué el % de compras directas de la banda NO se puede medir con el feed ===");
  const enero_julio_2026 = { date: { $gte: new Date("2026-01-01"), $lt: new Date("2026-08-01") }, tag: "award" };
  const adj2026 = await rel.countDocuments(enero_julio_2026);
  const conMetodo = await rel.countDocuments({
    $and: [enero_julio_2026, { "tender.procurementMethodDetails": { $exists: true, $ne: null } }],
  });
  console.log(`  adjudicaciones enero-julio 2026: ${adj2026} · con tender.procurementMethodDetails: ${conMetodo}`);
  console.log("  El rótulo «Compra Directa» sólo existe en el HTML de cada ficha; el «27 de 30» de la nota es una muestra, no una tasa.");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
