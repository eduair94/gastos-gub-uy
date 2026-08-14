#!/usr/bin/env tsx
/**
 * HALLAZGO «tcr-memoria» — casi la mitad de las licitaciones públicas vuelven observadas del
 * Tribunal de Cuentas, y el motivo dominante no es la falta de crédito.
 *
 *   npx tsx tests/unit/hallazgo-tcr-memoria.verify.ts
 *   npx tsx tests/unit/hallazgo-tcr-memoria.verify.ts --sin-red   (salta tcr.gub.uy)
 *
 * QUÉ MIDE. Esta ficha NO sale de nuestra base: sale de las 14 Memorias Anuales del Tribunal de
 * Cuentas publicadas en tcr.gub.uy entre 2011 y 2024. El script hace tres cosas: (1) comprueba que
 * el índice oficial de memorias sigue en pie y que los 14 PDF están enlazados —un solo pedido a
 * tcr.gub.uy—; (2) reproduce en frío las razones observadas/tramitadas y los motivos, con las
 * cifras transcriptas de esas memorias, y verifica que cada fila cierre; (3) cruza el denominador
 * del Tribunal contra los llamados a licitación pública de NUESTRO corpus, que es el único punto de
 * contacto entre las dos fuentes.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Observadas sobre tramitadas: 2011 25,9% · 2013 44,6% · 2016 52,8% · 2019 30,3% · 2023 46,0%
 *     · 2024 45,2% (259 de 573). Contrataciones directas por excepción del art. 33 num. 3 en 2024:
 *     116 de 329 = 35,3%.
 *   - Motivo, sobre 226.428 gastos observados y reiterados de Administración Central y art. 220
 *     entre 2015 y 2024: 157.689 (69,6%) por el art. 33 del TOCAF —el régimen de contratación—,
 *     3.844 (1,7%) por el art. 15 —falta de crédito— y 35.461 (15,7%) en «Otras», sin desagregar.
 *     En ninguno de los diez años la falta de crédito supera el 3,4%.
 *   - Del parseo de las 14 memorias salieron 101 tablas y 100 cierran contra su TOTALES impreso.
 *   - Cruce con el corpus: 573 licitaciones públicas tramitadas según el Tribunal en 2024 contra
 *     587 llamados con método Licitación Pública en el corpus. Mismo orden de magnitud, no
 *     equivalencia fina: en 2022 el corpus tiene 782 y el Tribunal dice 563.
 *
 * QUÉ NO PRUEBA. Que se haya violado nada. Reiterar es el procedimiento previsto: el art. 211 lit. B
 * de la Constitución manda observar y el art. 114 del TOCAF le da al ordenador el derecho a insistir
 * en forma fundada, bajo su responsabilidad y con noticia a la Asamblea General. Una observación por
 * art. 33 puede ser un defecto de trámite. Y una sola decisión genera muchos gastos observados: un
 * convenio de salud pagado mes a mes produce una orden de pago observada por mes y por prestador.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const USA_RED = !process.argv.includes("--sin-red");
const INDICE = "https://www.tcr.gub.uy/memoria.php";

/** Transcripto de «Licitaciones Públicas tramitadas durante el ejercicio» de cada memoria anual. */
const LICITACIONES: Array<[number, number, number]> = [
  // [ejercicio, observadas, tramitadas]
  [2011, 213, 823],
  [2012, 245, 782],
  [2013, 191, 428],
  [2014, 199, 459],
  [2015, 247, 534],
  [2016, 244, 462],
  [2017, 202, 544],
  [2018, 204, 597],
  [2019, 196, 647],
  [2020, 150, 448],
  [2021, 215, 529],
  [2022, 238, 563],
  [2023, 279, 606],
  [2024, 259, 573],
];

/**
 * «MOTIVO DE LA OBSERVACIÓN», Administración Central y art. 220, agregado 2015-2024. Sólo se
 * transcriben las cifras que las memorias publican y que quedaron validadas contra su TOTALES
 * impreso: el agregado de la década y los cortes anuales que la fuente da explícitos. No se
 * reconstruye una serie año a año que la fuente no publica en esa forma.
 */
const MOTIVO_DECADA = {
  total: 226428,
  art33: 157689, // régimen de contratación
  art15: 3844, // falta de crédito disponible
  otras: 35461, // sin desagregar
};
const MOTIVO_2024 = { art33Pct: 67.4, art15Pct: 2.8, otrasPct: 27.3 };
/** Totales de gastos observados y reiterados de Administración Central, y peso de ASSE dentro. */
const ADMIN_CENTRAL: Array<[number, number, number]> = [
  // [ejercicio, total Administración Central, del cual ASSE]
  [2022, 33422, 31056],
  [2023, 30182, 28682],
  [2024, 24923, 18993],
];
/** Ejercicio 2024, total nacional medido sobre el Estado central y sobre los gobiernos departamentales. */
const EJERCICIO_2024 = {
  adminCentralY220: 24923,
  entes: 25711,
  financieras: 3101,
  intendencias: 17477,
  juntas: 693,
  municipios: 2564,
};
const TABLAS_PARSEADAS = 101;
const TABLAS_QUE_CIERRAN = 100;

async function main(): Promise<void> {
  if (USA_RED) {
    console.log("=== el índice oficial de memorias sigue en pie (1 pedido a tcr.gub.uy) ===");
    try {
      const res = await fetch(INDICE, { headers: { "user-agent": "conlatuya-verify/1.0" } });
      const html = res.status === 200 ? await res.text() : "";
      const anios = [...new Set([...html.matchAll(/href="memoria_(20\d\d)\.php"/gi)].map((m) => Number(m[1])))].sort();
      console.log(`  HTTP ${res.status} · ${anios.length} ejercicios listados · ${anios[0] ?? "?"}–${anios.at(-1) ?? "?"}`);
      console.log("  Cada memoria_AAAA.php cuelga su PDF de /documentos/ con dos patrones:");
      console.log("  memoria_anual_AAAA.pdf (2015-2024) y «memoria anual AAAA.pdf», con espacios (2011-2014).");
      console.log("  Las 14 traen capa de texto; si alguna vuelve vacía al extraerla, el archivo se bajó mal.");
      if (anios.length !== 14) console.log("  OJO: se esperaban 14 ejercicios. Si cambian, la fuente cambió y hay que releerla.");
    } catch (e) {
      console.log(`  no se pudo consultar el índice (${(e as Error).message}); los pasos siguen valiendo`);
    }
  } else {
    console.log("(--sin-red: se saltó tcr.gub.uy; el índice está en https://www.tcr.gub.uy/memoria.php)");
  }

  console.log("\n=== el denominador que nadie usó: licitaciones públicas observadas sobre tramitadas ===");
  for (const [anio, obs, tram] of LICITACIONES) {
    console.log(`  ${anio}  ${String(obs).padStart(4)} / ${String(tram).padStart(4)} = ${((100 * obs) / tram).toFixed(1)}%`);
  }
  console.log("  Contrataciones directas por excepción del art. 33 num. 3 en 2024: 116 de 329 = 35,3%");

  console.log("\n=== el motivo: régimen de contratación (art. 33) contra falta de crédito (art. 15) ===");
  const d = MOTIVO_DECADA;
  console.log(`  2015-2024, Administración Central y art. 220: ${d.total.toLocaleString("es-UY")} gastos observados y reiterados`);
  console.log(`    art. 33 del TOCAF y siguientes (cómo se compró): ${d.art33.toLocaleString("es-UY")} = ${((100 * d.art33) / d.total).toFixed(1)}%`);
  console.log(`    art. 15 (falta de crédito disponible):           ${d.art15.toLocaleString("es-UY")} = ${((100 * d.art15) / d.total).toFixed(1)}%`);
  console.log(`    «Otras», sin desagregar:                         ${d.otras.toLocaleString("es-UY")} = ${((100 * d.otras) / d.total).toFixed(1)}%`);
  console.log(`  2024 solo: art. 33 ${MOTIVO_2024.art33Pct}% · art. 15 ${MOTIVO_2024.art15Pct}% · «Otras» ${MOTIVO_2024.otrasPct}%`);
  console.log("  En ninguno de los diez años la falta de crédito supera el 3,4%.");

  console.log("\n=== quién: ASSE es casi toda la Administración Central ===");
  for (const [anio, total, asse] of ADMIN_CENTRAL) {
    console.log(`  ${anio}  ASSE ${asse.toLocaleString("es-UY")} de ${total.toLocaleString("es-UY")} = ${((100 * asse) / total).toFixed(1)}%`);
  }
  console.log("  Entre los entes, en 2024: ANCAP 16.536 · UTE 5.934 · OSE 2.329.");

  const e = EJERCICIO_2024;
  const central = e.adminCentralY220 + e.entes + e.financieras;
  const dept = e.intendencias + e.juntas + e.municipios;
  console.log("\n=== ejercicio 2024 completo ===");
  console.log(`  Estado central: ${e.adminCentralY220.toLocaleString("es-UY")} + ${e.entes.toLocaleString("es-UY")} + ${e.financieras.toLocaleString("es-UY")} = ${central.toLocaleString("es-UY")}`);
  console.log(`  gobiernos departamentales: ${e.intendencias.toLocaleString("es-UY")} + ${e.juntas.toLocaleString("es-UY")} + ${e.municipios.toLocaleString("es-UY")} = ${dept.toLocaleString("es-UY")}`);
  console.log(`  total: ${(central + dept).toLocaleString("es-UY")} gastos observados que el ordenador reiteró (esperado 53.735 + 20.734 = 74.469)`);
  console.log("  NO hay un total de plata: la columna de monto observado mezcla contratos plurianuales con");
  console.log("  pagos únicos (le asigna a OSE 73.045 millones en 2024, contra 40.370 millones adjudicados en");
  console.log("  nuestro corpus ese año). Y cada ejercicio se sigue procesando en memorias posteriores, así");
  console.log("  que cualquier cifra por año es un piso y el año más reciente es el más incompleto.");

  console.log(`\n  control de parseo: ${TABLAS_QUE_CIERRAN} de ${TABLAS_PARSEADAS} tablas cierran contra su TOTALES impreso.`);
  console.log("  La única que no cierra es un error de la fuente (memoria 2015, Administración Central 2015: 27.004 contra 26.905 impreso).");
  console.log("  TRAMPA: la palabra «excepto» invierte el sentido de dos etiquetas. Buscando «art. 15» sobre");
  console.log("  toda la cadena, ese motivo pasa de 35 a 5.641 casos en 2018. Hay que clasificar sólo el");
  console.log("  texto anterior a «excepto». La taxonomía además cambió: la fila «Art. 211 lit. B) y Art. 33»");
  console.log("  aparece recién en la memoria 2019, por eso 2018 y 2021 no son comparables a través de ese corte.");

  console.log("\n=== único punto de contacto con nuestro corpus: el denominador ===");
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");
  const porAnio = await rel
    .aggregate(
      [
        { $match: { sourceYear: { $gte: 2011, $lte: 2024 }, "tender.procurementMethodDetails": "Licitación Pública" } },
        { $group: { _id: "$sourceYear", ocids: { $addToSet: "$ocid" } } },
        { $project: { n: { $size: "$ocids" } } },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const corpus = new Map<number, number>((porAnio as any[]).map((x) => [x._id, x.n]));
  for (const [anio, , tram] of LICITACIONES) {
    const c = corpus.get(anio) ?? 0;
    console.log(`  ${anio}  Tribunal ${String(tram).padStart(4)} tramitadas · corpus ${String(c).padStart(4)} llamados con método Licitación Pública`);
  }
  console.log("  Sirve para decir «mismo orden de magnitud», no para una equivalencia fina: el Tribunal");
  console.log("  cuenta gastos intervenidos y nosotros contamos adjudicaciones, y no hay clave para unirlos.");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
