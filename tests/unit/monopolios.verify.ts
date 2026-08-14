#!/usr/bin/env tsx
/**
 * Vuelve a medir las cifras de /investigaciones/monopolios. Necesita MONGODB_URI, así que
 * `npm test` lo saltea por la convención `.verify.ts`.
 *
 *   npx tsx tests/unit/monopolios.verify.ts
 *
 * LA TRAMPA QUE JUSTIFICA ESTE ARCHIVO: cada empresa pública aparece con DOS identidades distintas
 * en el corpus, y ninguna sirve para las dos caras. Como PROVEEDOR figura con su RUT, en dos
 * grafías (`R/210475730011` y `R210475730011`). Como COMPRADOR figura con su nombre, que a veces
 * está mal escrito: el del Correo es «Adminstración Nacional de Correos», sin la «i». Sumar por
 * nombre de proveedor da de menos, y buscar el Correo bien escrito no devuelve nada.
 *
 * ÍNDICES: `awards.suppliers.id` y `buyer.name` están indexados. `buyer.id` NO, y una agregación
 * que arranque por ahí barre los 2,18M de documentos.
 *
 * El corpus carga todos los días, así que las cifras suben. El script imprime la diferencia contra
 * lo publicado en vez de fallar: lo que se controla es que ningún número se mueva de forma que
 * cambie una afirmación de la página.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(20 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const GUARD = { $gt: 0, $lt: 50e9 };

/** Publicado el 2026-08-14. La página cita estas cifras. */
const PUBLICADO = {
  totalAdj: 1_400_478,
  totalUyu: 1_645_669e6,
  provAdj: 16_930,
  provUyu: 32_979e6,
  compAdj: 102_451,
  compUyu: 734_993e6,
  intraShare: 69.1,
  ancapShare: 28.67,
};

/** Las dos grafías del RUT de cada empresa, del lado proveedor. */
const IDS = [
  "R/210475730011", "R210475730011",                   // ANCAP
  "R/210778720012", "R210778720012",                   // UTE
  "R/211962820014", "R211962820014",                   // OSE
  "R/211003420017", "R211003420017",                   // ANTEL
  "R/210465050018", "R210465050018",                   // BSE
  "R/214130990011", "R214130990011",                   // ANC
  "T/99042", "R/99042", "C/9999999",                   // IMPO
  "R/213427900012", "R213427900012",                   // ANP
  "R/212596710018", "R212596710018", "R/212636440016", // AFE
];

/** Los nombres tal como el corpus los escribe, con el error de tipeo del Correo incluido. */
const NOMBRES = [
  "Administración Nacional de Combustible, Alcohol y Portland",
  "Administración Nacional de Usinas y Trasmisiones Eléctricas",
  "Administración de las Obras Sanitarias del Estado",
  "Administración Nacional de Telecomunicaciones",
  "Banco de Seguros del Estado",
  "Adminstración Nacional de Correos",
  "Administración Nacional de Correos",
  "Administración Nacional de Puertos",
  "Administración de los Ferrocarriles del Estado",
];

const M = (n: number) => (n / 1e6).toLocaleString("es-UY", { maximumFractionDigits: 0 }) + "M";
const share = (a: number, b: number) => (100 * a) / b;

/** Imprime el valor medido junto al publicado. La deriva del corpus es esperable, no un fallo. */
function linea(label: string, medido: number, publicado: number, fmt: (n: number) => string): void {
  const delta = ((100 * (medido - publicado)) / publicado).toFixed(2);
  console.log(`  ${label.padEnd(34)} ${fmt(medido).padStart(14)}   publicado ${fmt(publicado).padStart(14)}   ${delta}%`);
}

async function main(): Promise<void> {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  const [tot]: any[] = await rel
    .aggregate(
      [
        { $match: { tag: "award", "amount.primaryAmount": GUARD } },
        { $group: { _id: null, n: { $sum: 1 }, sum: { $sum: "$amount.primaryAmount" } } },
      ],
      { allowDiskUse: true, maxTimeMS: 900_000 },
    )
    .toArray();

  console.log("=== el denominador: todo el gasto adjudicado registrado ===");
  linea("adjudicaciones", tot.n, PUBLICADO.totalAdj, n => n.toLocaleString("es-UY"));
  linea("monto", tot.sum, PUBLICADO.totalUyu, M);

  console.log("\n=== las nueve COMO PROVEEDOR (por awards.suppliers.id) ===");
  const [prov]: any[] = await rel
    .aggregate(
      [
        { $match: { tag: "award", "awards.suppliers.id": { $in: IDS }, "amount.primaryAmount": GUARD } },
        { $group: { _id: null, n: { $sum: 1 }, sum: { $sum: "$amount.primaryAmount" } } },
      ],
      { allowDiskUse: true, maxTimeMS: 900_000 },
    )
    .toArray();
  linea("adjudicaciones", prov.n, PUBLICADO.provAdj, n => n.toLocaleString("es-UY"));
  linea("monto", prov.sum, PUBLICADO.provUyu, M);
  console.log(`  share del gasto registrado: ${share(prov.sum, tot.sum).toFixed(2)}% (publicado 2,00%)`);

  console.log("\n=== las nueve COMO COMPRADOR (por buyer.name) ===");
  const comp: any[] = await rel
    .aggregate(
      [
        { $match: { tag: "award", "buyer.name": { $in: NOMBRES }, "amount.primaryAmount": GUARD } },
        { $group: { _id: "$buyer.name", n: { $sum: 1 }, sum: { $sum: "$amount.primaryAmount" } } },
        { $sort: { sum: -1 } },
      ],
      { allowDiskUse: true, maxTimeMS: 900_000 },
    )
    .toArray();
  for (const c of comp) {
    console.log(`  ${M(c.sum).padStart(12)} · ${String(c.n).padStart(6)} adj · ${share(c.sum, tot.sum).toFixed(2).padStart(6)}% · ${c._id}`);
  }
  const compN = comp.reduce((a, b) => a + b.n, 0);
  const compSum = comp.reduce((a, b) => a + b.sum, 0);
  linea("total adjudicaciones", compN, PUBLICADO.compAdj, n => n.toLocaleString("es-UY"));
  linea("total monto", compSum, PUBLICADO.compUyu, M);
  console.log(`  share del gasto registrado: ${share(compSum, tot.sum).toFixed(2)}% (publicado 44,66%)`);
  console.log(`  compran ${(compSum / prov.sum).toFixed(1)} veces lo que el Estado les compra (publicado 22,3)`);

  const ancap = comp.find(c => String(c._id).includes("Combustible"));
  if (ancap) {
    console.log(`  ANCAP sola: ${share(ancap.sum, tot.sum).toFixed(2)}% (publicado ${PUBLICADO.ancapShare}%)`);
  }

  console.log("\n=== el circuito interno: cuánto de lo que facturan se lo paga otra de las nueve ===");
  const [intra]: any[] = await rel
    .aggregate(
      [
        {
          $match: {
            tag: "award",
            "awards.suppliers.id": { $in: IDS },
            "buyer.name": { $in: NOMBRES },
            "amount.primaryAmount": GUARD,
          },
        },
        { $group: { _id: null, n: { $sum: 1 }, sum: { $sum: "$amount.primaryAmount" } } },
      ],
      { allowDiskUse: true, maxTimeMS: 900_000 },
    )
    .toArray();
  console.log(`  ${intra.n.toLocaleString("es-UY")} adjudicaciones · ${M(intra.sum)}`);
  console.log(`  share de lo que facturan: ${share(intra.sum, prov.sum).toFixed(1)}% (publicado ${PUBLICADO.intraShare}%)`);

  console.log("\n=== el eje del circuito: ANCAP le vende combustible a UTE ===");
  const eje: any[] = await rel
    .aggregate(
      [
        {
          $match: {
            tag: "award",
            "awards.suppliers.id": { $in: ["R/210475730011", "R210475730011"] },
            "buyer.name": "Administración Nacional de Usinas y Trasmisiones Eléctricas",
            "amount.primaryAmount": GUARD,
          },
        },
        { $group: { _id: "$sourceYear", n: { $sum: 1 }, sum: { $sum: "$amount.primaryAmount" } } },
        { $sort: { sum: -1 } },
      ],
      { allowDiskUse: true, maxTimeMS: 900_000 },
    )
    .toArray();
  const ejeSum = eje.reduce((a, b) => a + b.sum, 0);
  for (const y of eje.slice(0, 5)) {
    console.log(`  ${y._id} · ${M(y.sum).padStart(12)} · ${String(y.n).padStart(3)} adj · ${share(y.sum, ejeSum).toFixed(1).padStart(5)}% de la relación`);
  }
  console.log(`  total ${M(ejeSum)} (publicado 17.295M). La página afirma que 2023 concentra el 94%.`);

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
