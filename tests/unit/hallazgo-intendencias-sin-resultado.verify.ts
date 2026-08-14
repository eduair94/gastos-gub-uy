#!/usr/bin/env tsx
/**
 * HALLAZGO «intendencias-sin-resultado» — llamados departamentales a licitación que el registro
 * nacional publicó y cuyo desenlace nunca publicó.
 *
 *   npx tsx tests/unit/hallazgo-intendencias-sin-resultado.verify.ts
 *   npx tsx tests/unit/hallazgo-intendencias-sin-resultado.verify.ts --sin-red   (salta la red)
 *
 * QUÉ MIDE. Agrupa por ocid los llamados a Licitación Abreviada y Licitación Pública de las
 * intendencias publicados entre el 1/7/2020 y el 1/7/2025, y busca si alguna vez apareció bajo el
 * mismo ocid un release con tag award, awardUpdate, awardCancellation o tenderCancellation. Después
 * chequea contra el endpoint OCDS del propio Estado (/ocds/record/{id}) una muestra de llamados sin
 * desenlace y una muestra de control con desenlace, para descartar que el hueco sea nuestro.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 137.273 releases de intendencias desde el 1/7/2020.
 *   - 1.480 licitaciones en la ventana; 685 con desenlace publicado = 46,3%.
 *   - Lavalleja 11/0 (0%) · Soriano 60/0 (0%) · Cerro Largo 43/0 (0%) · Rocha 62/1 (1,6%) ·
 *     Maldonado 107/3 (2,8%) · Durazno 247/58 (23,5%) · … · Paysandú 47/45 (95,7%).
 *   - Las cinco primeras suman 283 licitaciones y 279 sin ningún desenlace publicado.
 *   - 0 de 924 llamados sin desenlace del corpus completo traen amount.primaryAmount.
 *   - Montevideo y Canelones quedan FUERA: sus ocid llevan prefijo «i» y /ocds/record devuelve 404
 *     para ellos. Tres fichas HTML de Montevideo sin release en el feed (i322321, i288892, i447021)
 *     tienen resolución publicada «Declarada sin efecto»: para esas, «sin award» ≠ «no publicó».
 *
 * QUÉ NO PRUEBA. Que haya un contrato oculto. El registro emite un dato nuevo cuando hay
 * adjudicación y no tiene dónde anotar que la licitación murió sin adjudicar; Montevideo lo prueba.
 * Buena parte de estos 279 llamados pueden ser licitaciones desiertas o dejadas sin efecto.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const DESDE = new Date("2020-07-01T00:00:00.000Z");
const HASTA = new Date("2025-07-01T00:00:00.000Z");
const METODOS = new Set(["Licitación Abreviada", "Licitación Pública"]);
const DESENLACE = new Set(["award", "awardUpdate", "awardCancellation", "tenderCancellation"]);
const USA_RED = !process.argv.includes("--sin-red");

interface Llamado {
  ocid: string;
  buyer: string;
  fecha: Date | null;
  metodo: string | null;
  desenlace: boolean;
  monto: number | null;
}

async function pedir(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { headers: { "user-agent": "conlatuya-verify/1.0" } });
  return { status: res.status, body: res.status === 200 ? await res.text() : "" };
}

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  console.log("=== barrido de releases de intendencias desde el 1/7/2020 ===");
  const t0 = Date.now();
  const cursor = rel.find(
    { "buyer.name": { $regex: "^Intendencia de " }, date: { $gte: DESDE } },
    {
      projection: {
        _id: 0,
        ocid: 1,
        date: 1,
        tag: 1,
        "buyer.name": 1,
        "tender.procurementMethodDetails": 1,
        "amount.primaryAmount": 1,
      },
    }
  );

  const porOcid = new Map<string, Llamado>();
  let docs = 0;
  for await (const doc of cursor as any) {
    docs += 1;
    const ocid: string = doc.ocid;
    if (!ocid) continue;
    let l = porOcid.get(ocid);
    if (!l) {
      l = { ocid, buyer: doc.buyer?.name ?? "", fecha: null, metodo: null, desenlace: false, monto: null };
      porOcid.set(ocid, l);
    }
    if (!l.buyer && doc.buyer?.name) l.buyer = doc.buyer.name;
    // OJO: `tag` es un ARRAY en el corpus, no un string. Tratarlo como string devuelve 0 filas.
    const tags: string[] = Array.isArray(doc.tag) ? doc.tag : doc.tag ? [doc.tag] : [];
    const esLlamado = tags.includes("tender");
    const fecha: Date | null = doc.date instanceof Date ? doc.date : doc.date ? new Date(doc.date) : null;
    if (esLlamado && fecha && (l.fecha === null || fecha < l.fecha)) {
      l.fecha = fecha;
      l.metodo = doc.tender?.procurementMethodDetails ?? l.metodo;
    }
    if (esLlamado && l.metodo === null) l.metodo = doc.tender?.procurementMethodDetails ?? null;
    if (tags.some((t) => DESENLACE.has(t))) l.desenlace = true;
    const monto = doc.amount?.primaryAmount;
    if (typeof monto === "number" && monto > 0 && l.monto === null) l.monto = monto;
  }
  console.log(`  ${docs.toLocaleString("es-UY")} releases · ${porOcid.size.toLocaleString("es-UY")} ocid · ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log("\n=== licitaciones (abreviada + pública) llamadas entre el 1/7/2020 y el 1/7/2025 ===");
  const ventana = [...porOcid.values()].filter(
    (l) => l.fecha !== null && l.fecha >= DESDE && l.fecha < HASTA && l.metodo !== null && METODOS.has(l.metodo)
  );
  const conDesenlace = ventana.filter((l) => l.desenlace).length;
  console.log(`  ${ventana.length} licitaciones · ${conDesenlace} con desenlace = ${((100 * conDesenlace) / ventana.length).toFixed(1)}%`);
  console.log(`  (esperado el 14/08/2026: 1.480 y 685 = 46,3%)`);

  console.log("\n=== por intendencia ===");
  const porBuyer = new Map<string, { n: number; d: number }>();
  for (const l of ventana) {
    const k = l.buyer;
    const v = porBuyer.get(k) ?? { n: 0, d: 0 };
    v.n += 1;
    if (l.desenlace) v.d += 1;
    porBuyer.set(k, v);
  }
  const filas = [...porBuyer.entries()].sort((a, b) => a[1].d / a[1].n - b[1].d / b[1].n);
  for (const [nombre, v] of filas) {
    console.log(`  ${nombre.padEnd(30)} ${String(v.n).padStart(4)} llamados · ${String(v.d).padStart(4)} con desenlace · ${((100 * v.d) / v.n).toFixed(1)}%`);
  }
  const sinMvdCan = filas.filter(([n]) => n !== "Intendencia de Montevideo" && n !== "Intendencia de Canelones");
  const cinco = sinMvdCan.slice(0, 5);
  const cincoN = cinco.reduce((a, [, v]) => a + v.n, 0);
  const cincoD = cinco.reduce((a, [, v]) => a + v.d, 0);
  console.log(`  las cinco más bajas SIN Montevideo/Canelones (${cinco.map(([n]) => n.replace("Intendencia de ", "")).join(", ")}):`);
  console.log(`  ${cincoN} licitaciones, ${cincoN - cincoD} sin ningún desenlace publicado (esperado 283 y 279)`);
  const sN = sinMvdCan.reduce((a, [, v]) => a + v.n, 0);
  const sD = sinMvdCan.reduce((a, [, v]) => a + v.d, 0);
  console.log(`  sin Montevideo ni Canelones: ${sD} de ${sN} = ${((100 * sD) / sN).toFixed(1)}% (esperado 637 de 1.191 = 53,5%)`);

  console.log("\n=== ningún llamado sin desenlace trae monto ===");
  const todosSin = [...porOcid.values()].filter((l) => l.fecha !== null && l.metodo !== null && METODOS.has(l.metodo) && !l.desenlace);
  console.log(`  ${todosSin.length} llamados sin desenlace desde el 1/7/2020 · con monto: ${todosSin.filter((l) => l.monto !== null).length}`);

  const CINCO = new Set(cinco.map(([n]) => n));
  const muestra = ventana
    .filter((l) => !l.desenlace && CINCO.has(l.buyer))
    .sort((a, b) => a.ocid.localeCompare(b.ocid))
    .slice(0, 3)
    .map((l) => l.ocid.replace("ocds-yfs5dr-", ""));
  const control = ventana
    .filter((l) => l.desenlace && (l.buyer === "Intendencia de Colonia" || l.buyer === "Intendencia de Paysandú"))
    .sort((a, b) => a.ocid.localeCompare(b.ocid))
    .slice(0, 3)
    .map((l) => l.ocid.replace("ocds-yfs5dr-", ""));
  console.log(`  muestra sin desenlace: ${muestra.join(", ")} · control con desenlace: ${control.join(", ")}`);

  console.log("\n=== los ocid con prefijo «i» (Montevideo, Canelones) ===");
  const conI = [...porOcid.values()].filter((l) => /^ocds-yfs5dr-i/.test(l.ocid));
  console.log(`  ${conI.length.toLocaleString("es-UY")} ocid «i» en el barrido. El endpoint /ocds/record devuelve 404 para ellos,`);
  console.log("  y tres fichas HTML de Montevideo sin release en el feed (i322321, i288892, i447021) SÍ tienen");
  console.log("  resolución publicada, «Declarada sin efecto». Por eso quedan fuera de la medición.");

  if (USA_RED) {
    console.log("\n=== contraste contra el endpoint OCDS del Estado (1 pedido por segundo, 6 pedidos) ===");
    for (const [grupo, ids] of [
      ["sin desenlace en nuestra base", muestra],
      ["CONTROL: con desenlace en nuestra base", control],
    ] as const) {
      for (const id of ids) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const { status, body } = await pedir(`https://www.comprasestatales.gub.uy/ocds/record/${id}`);
          if (status !== 200) {
            console.log(`  ${id} (${grupo}): HTTP ${status}`);
            continue;
          }
          const tags = [...body.matchAll(/"tag"\s*:\s*\[([^\]]*)\]/g)].flatMap((m) => m[1]!.match(/[a-zA-Z]+/g) ?? []);
          const unicos = [...new Set(tags)].sort();
          const tieneAward = unicos.some((t) => t.toLowerCase().startsWith("award"));
          console.log(`  ${id} (${grupo}): tags oficiales = ${unicos.join(",") || "s/d"} · award: ${tieneAward ? "SÍ" : "no"}`);
        } catch (e) {
          console.log(`  ${id} (${grupo}): no se pudo consultar (${(e as Error).message})`);
        }
      }
    }
    console.log("  Si los CONTROLES no traen award, el método está roto y hay que parar.");
  } else {
    console.log("\n(--sin-red: se saltó el contraste contra comprasestatales.gub.uy)");
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
