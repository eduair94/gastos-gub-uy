#!/usr/bin/env tsx
/**
 * Vuelve a medir las cifras de /investigaciones/sunca. Necesita MONGODB_URI, así que `npm test` lo
 * saltea por la convención `.verify.ts`.
 *
 *   npx tsx tests/unit/sunca.verify.ts
 *
 * TRAMPA 1 — MONEDAS DENTRO DEL MISMO CONTRATO. `awards.items.unit.value` mezcla UYU y USD en la
 * misma adjudicación. Sumar sin agrupar por `currency` da un número sin significado. Todas las
 * cifras de rubros de la página son UYU, y este script agrupa por moneda para probarlo.
 *
 * TRAMPA 2 — EL TECHO DE ARTEFACTO. Sin el corte de 50.000 millones, 2019 da 111.056 millones en
 * rubros de obra: más que todo el gasto registrado de ese año. El corte es la convención del sitio.
 *
 * TRAMPA 3 — LAS DOS GRAFÍAS DEL RUT. SACEEM medido por nombre da 43.859 millones; por
 * `awards.suppliers.id` con las dos grafías da 48.034. Se mide por id, nunca por nombre.
 *
 * TRAMPA 4 — DUPLICADOS POR OCID. El feed publica varios registros por compra. Todo se agrupa por
 * `ocid` antes de sumar.
 *
 * El corpus carga todos los días, así que las cifras suben. El script imprime lo publicado al lado
 * de lo medido en vez de fallar por una diferencia chica. Falla sólo si una afirmación de la página
 * deja de sostenerse.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(20 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

/** Techo de artefacto del sitio. */
const GUARD = { $gt: 0, $lt: 50e9 };

/** Tasa vigente del Aporte Unificado de la Construcción (BPS, Ley 14.411). */
const APORTE_UNIFICADO = 0.718;

/** El contrato que la página abre rubro por rubro. */
const OSE_OCID = "ocds-yfs5dr-i410825";

/** Los siete contratos que la página dice que son el 71,56% de la obra registrada. */
const SIETE = [
  "ocds-yfs5dr-531644", // Circuito 3 · Ruta 14 centro-oeste
  "ocds-yfs5dr-606124", // Circuito 5 · Rutas 14 y 15
  "ocds-yfs5dr-510455", // Grupo Vial Oriental uno
  "ocds-yfs5dr-510466", // Grupo Vial Oriental dos
  "ocds-yfs5dr-985182", // UIPPL Libertad
  "ocds-yfs5dr-615984", // Circuito 6 · Cuchilla Grande
  "ocds-yfs5dr-630070", // Grupo San José
];

/** Las dos grafías del RUT de SACEEM. */
const SACEEM_IDS = ["R/210002980010", "R210002980010"];

/** Publicado el 2026-08-16. La página cita estas cifras. */
const PUBLICADO = {
  obraUyu: 159_853e6,
  obraAdj: 9_874,
  sieteUyu: 114_391e6,
  sieteShare: 71.56,
  oseUyu: 30_266_489_896.64,
  oseObra: 22_875_003_794.03,
  oseAjuste: 3_407_843_458.86,
  oseLlss: 2_823_784_792,
  oseImprev: 1_159_857_851.75,
  oseAjustePct: 11.26,
  oseLlssPct: 9.33,
  oseAjusteMasLlssPct: 20.59,
  oseJornal: 3_933e6,
  oseManoDeObraPct: 20.16,
  ajusteCorpusPct: 8.9,
  llssCorpusPct: 6.46,
  organismos: 4,
  saceemUyu: 48_034e6,
  saceemAdj: 130,
};

const M = (n: number) => `${(n / 1e6).toLocaleString("es-UY", { maximumFractionDigits: 0 })}M`;
const pct = (a: number, b: number) => (b === 0 ? 0 : (a / b) * 100);

/** Falla dura: una afirmación de la página dejó de sostenerse. */
const fallos: string[] = [];
function exigir(condicion: boolean, mensaje: string) {
  if (!condicion) fallos.push(mensaje);
}

async function main() {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  console.log("=== rubros de obra: la familia 6 del catálogo SICE ===");
  const codigos: string[] = await db.collection("sice_catalog").distinct("code", { famiCode: "6" });
  console.log(`  ${codigos.length} códigos de artículo en la familia 6`);
  exigir(codigos.length > 400, `la familia 6 devolvió ${codigos.length} códigos: el catálogo cambió`);

  const obra: any[] = await rel
    .aggregate(
      [
        {
          $match: {
            "awards.items.classification.id": { $in: codigos },
            "sourceYear": { $gte: 2019 },
            "amount.primaryAmount": GUARD,
          },
        },
        { $group: { _id: "$ocid", amt: { $max: "$amount.primaryAmount" } } },
        { $group: { _id: null, n: { $sum: 1 }, sum: { $sum: "$amt" } } },
      ],
      { allowDiskUse: true, maxTimeMS: 900_000 },
    )
    .toArray();
  const totalObra = obra[0]?.sum ?? 0;
  console.log(`  2019-2026 · ${obra[0]?.n.toLocaleString("es-UY")} adjudicaciones · ${M(totalObra)} (publicado ${M(PUBLICADO.obraUyu)} · ${PUBLICADO.obraAdj})`);

  console.log("\n=== los siete contratos que concentran la serie ===");
  const siete: any[] = await rel
    .aggregate(
      [
        { $match: { ocid: { $in: SIETE }, "amount.primaryAmount": { $gt: 0 } } },
        { $group: { _id: "$ocid", amt: { $max: "$amount.primaryAmount" } } },
        { $group: { _id: null, n: { $sum: 1 }, sum: { $sum: "$amt" } } },
      ],
      { maxTimeMS: 300_000 },
    )
    .toArray();
  const sumSiete = siete[0]?.sum ?? 0;
  const shareSiete = pct(sumSiete, totalObra);
  console.log(`  ${siete[0]?.n} contratos · ${M(sumSiete)} · ${shareSiete.toFixed(2)}% de la obra registrada (publicado ${PUBLICADO.sieteShare}%)`);
  exigir(siete[0]?.n === 7, `se esperaban 7 contratos y el corpus devolvió ${siete[0]?.n}`);
  exigir(shareSiete > 50, `los siete contratos cayeron a ${shareSiete.toFixed(2)}%: la página afirma que son la mayoría de la serie`);

  console.log("\n=== el contrato de OSE, rubro por rubro (sólo UYU) ===");
  const rubros: any[] = await rel
    .aggregate(
      [
        { $match: { ocid: OSE_OCID, id: `adjudicacion-${OSE_OCID.split("-").pop()}` } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.unit.value.currency": "UYU" } },
        {
          $project: {
            desc: "$awards.items.classification.description",
            v: {
              $multiply: [
                { $ifNull: ["$awards.items.quantity", 1] },
                { $ifNull: ["$awards.items.unit.value.amount", 0] },
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $regexMatch: { input: "$desc", regex: "LL ?SS|LSS", options: "i" } }, then: "leyes sociales" },
                  { case: { $regexMatch: { input: "$desc", regex: "Ajuste", options: "i" } }, then: "ajuste paramétrico" },
                  { case: { $regexMatch: { input: "$desc", regex: "Imprevis", options: "i" } }, then: "imprevistos" },
                ],
                default: "obra",
              },
            },
            total: { $sum: "$v" },
            n: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ],
      { maxTimeMS: 300_000 },
    )
    .toArray();

  const bucket = (k: string) => rubros.find(r => r._id === k)?.total ?? 0;
  const ladoPesos = rubros.reduce((a, b) => a + b.total, 0);
  for (const r of rubros) {
    console.log(`  ${String(r._id).padEnd(20)} ${M(r.total).padStart(9)} · ${pct(r.total, ladoPesos).toFixed(2).padStart(6)}% · ${String(r.n).padStart(3)} líneas`);
  }
  const ajuste = bucket("ajuste paramétrico");
  const llss = bucket("leyes sociales");
  const ajusteMasLlss = pct(ajuste + llss, ladoPesos);
  console.log(`  lado en pesos: ${M(ladoPesos)} (publicado ${M(PUBLICADO.oseUyu)})`);
  console.log(`  ajuste paramétrico + leyes sociales: ${ajusteMasLlss.toFixed(2)}% (publicado ${PUBLICADO.oseAjusteMasLlssPct}%)`);
  exigir(Math.abs(ajusteMasLlss - PUBLICADO.oseAjusteMasLlssPct) < 0.5, `el 20,59% de la portada se movió a ${ajusteMasLlss.toFixed(2)}%`);

  console.log("\n=== la derivación del jornal desde las leyes sociales ===");
  const jornal = llss / APORTE_UNIFICADO;
  const contrato: any[] = await rel
    .aggregate([{ $match: { ocid: OSE_OCID, "amount.primaryAmount": { $gt: 0 } } }, { $group: { _id: null, amt: { $max: "$amount.primaryAmount" } } }], { maxTimeMS: 120_000 })
    .toArray();
  const totalContrato = contrato[0]?.amt ?? 0;
  const manoDeObraPct = pct(jornal + llss, totalContrato);
  console.log(`  jornal imponible ≈ ${M(jornal)} (publicado ${M(PUBLICADO.oseJornal)}), al ${(APORTE_UNIFICADO * 100).toFixed(1)}% de aporte unificado`);
  console.log(`  jornal + leyes sociales = ${manoDeObraPct.toFixed(2)}% del contrato completo (publicado ${PUBLICADO.oseManoDeObraPct}%)`);
  console.log(`  un +10,00% de costo horario agrega ${M((jornal + llss) * 0.1)}: ${(manoDeObraPct * 0.1).toFixed(2)}% del contrato`);
  exigir(manoDeObraPct < 50, `la mano de obra llegó a ${manoDeObraPct.toFixed(2)}%: la página afirma que está muy por debajo del 100% que exigiría la cifra del 10%`);

  console.log("\n=== el ajuste paramétrico en todo el corpus ===");
  const corpus: any[] = await rel
    .aggregate(
      [
        {
          $match: {
            "sourceYear": { $gte: 2019 },
            "awards.items.classification.description": { $regex: "Ajuste Param", $options: "i" },
          },
        },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.unit.value.currency": "UYU" } },
        {
          $project: {
            desc: "$awards.items.classification.description",
            v: {
              $multiply: [
                { $ifNull: ["$awards.items.quantity", 1] },
                { $ifNull: ["$awards.items.unit.value.amount", 0] },
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $regexMatch: { input: "$desc", regex: "LL ?SS|LSS|LEYES SOCIALES", options: "i" } }, then: "leyes sociales" },
                  { case: { $regexMatch: { input: "$desc", regex: "Ajuste", options: "i" } }, then: "ajuste paramétrico" },
                  { case: { $regexMatch: { input: "$desc", regex: "Imprevis", options: "i" } }, then: "imprevistos" },
                ],
                default: "obra",
              },
            },
            total: { $sum: "$v" },
          },
        },
      ],
      { allowDiskUse: true, maxTimeMS: 900_000 },
    )
    .toArray();
  const corpusTotal = corpus.reduce((a, b) => a + b.total, 0);
  const corpusAjuste = corpus.find(r => r._id === "ajuste paramétrico")?.total ?? 0;
  const corpusLlss = corpus.find(r => r._id === "leyes sociales")?.total ?? 0;
  console.log(`  ajuste paramétrico ${pct(corpusAjuste, corpusTotal).toFixed(2)}% (publicado ${PUBLICADO.ajusteCorpusPct}%)`);
  console.log(`  leyes sociales     ${pct(corpusLlss, corpusTotal).toFixed(2)}% (publicado ${PUBLICADO.llssCorpusPct}%)`);

  const organismos: string[] = await rel.distinct("buyer.name", {
    "sourceYear": { $gte: 2019 },
    "awards.items.classification.description": { $regex: "Ajuste Param", $options: "i" },
  });
  console.log(`  organismos que publican el rubro: ${organismos.length} (publicado ${PUBLICADO.organismos})`);
  for (const o of organismos) console.log(`    · ${o}`);
  exigir(
    organismos.length <= 8,
    `${organismos.length} organismos publican el rubro: la página afirma que son pocos y los nombra uno por uno`,
  );

  console.log("\n=== SACEEM, por RUT y con las dos grafías ===");
  const saceem: any[] = await rel
    .aggregate(
      [
        { $match: { "awards.suppliers.id": { $in: SACEEM_IDS }, "amount.primaryAmount": GUARD } },
        { $group: { _id: "$ocid", amt: { $max: "$amount.primaryAmount" } } },
        { $group: { _id: null, n: { $sum: 1 }, sum: { $sum: "$amt" } } },
      ],
      { maxTimeMS: 300_000 },
    )
    .toArray();
  console.log(`  ${saceem[0]?.n} adjudicaciones · ${M(saceem[0]?.sum ?? 0)} (publicado ${PUBLICADO.saceemAdj} · ${M(PUBLICADO.saceemUyu)})`);

  console.log("\n=== la aritmética de las cuatro horas, sin base de datos ===");
  const bajaHoras = (4 / 44) * 100;
  const subeCosto = (44 / 40 - 1) * 100;
  console.log(`  4 ÷ 44 = −${bajaHoras.toFixed(2)}% de horas (publicado −9,09%)`);
  console.log(`  44 ÷ 40 = +${subeCosto.toFixed(2)}% de costo por hora (publicado +10,00%)`);
  exigir(Math.abs(bajaHoras - 9.09) < 0.01, "la reducción de jornada dejó de dar 9,09%");
  exigir(Math.abs(subeCosto - 10) < 0.01, "el aumento de costo horario dejó de dar 10,00%");

  await disconnectFromDatabase();

  if (fallos.length > 0) {
    console.error(`\n${fallos.length} afirmación(es) de la página dejaron de sostenerse:`);
    for (const f of fallos) console.error(`  · ${f}`);
    process.exit(1);
  }
  console.log("\nOK · todas las afirmaciones de la página se sostienen.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
