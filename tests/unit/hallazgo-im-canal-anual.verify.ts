#!/usr/bin/env tsx
/**
 * HALLAZGO «im-canal-anual» — la Intendencia de Montevideo no desapareció de 2026: sus compras
 * viajan por un canal que los datos abiertos publican una vez al año.
 *
 *   npx tsx tests/unit/hallazgo-im-canal-anual.verify.ts
 *   npx tsx tests/unit/hallazgo-im-canal-anual.verify.ts --sin-red   (salta comprasestatales y catalogodatos)
 *
 * QUÉ MIDE. Cuenta releases por organismo y año; separa los que llegaron alguna vez por el RSS
 * OCDS (marca rssPublishDate, que escribe sólo el uploader del RSS y que el importador del zip
 * anual nunca borra) de los que no; pesa cuánto gasto viajó por cada canal; y comprueba contra la
 * fuente que el RSS mensual no trae un solo identificador con prefijo «i», que la API por release
 * devuelve 404 para ellos, y que el archivo consolidado del catálogo de datos abiertos es anual y
 * todavía no tiene 2026.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Intendencia de Montevideo: 29.079 releases en 2024, 19.584 en 2025, 82 en 2026. Canelones
 *     1.669 / 1.554 / 0. Administración Nacional de Puertos 947 en 2025 y 0 en 2026. Las otras 17
 *     intendencias tienen 2026 normal: Paysandú 937, Colonia 449, Florida 330, Maldonado 238. No es
 *     un problema de las intendencias: son tres organismos.
 *   - El RSS de julio de 2026 trae 14.556 releases y cero con prefijo «i»; el de julio de 2025 trae
 *     14.912, también cero. Cero cancelaciones de adjudicación en los dos, cuando en la base son
 *     3.146 en 2025 y 3.417 en 2024.
 *   - GET /ocds/release/adjudicacion-i483583 devuelve 404 aunque sea un registro de 2025 que ya
 *     tenemos; el control /ocds/release/adjudicacion-1307316 devuelve 200.
 *   - El canal «i» es el 59,0% del gasto registrado en 2023, el 59,5% en 2024 y el 55,4% en 2025.
 *     En 2026 es 0%. De los 178,1 mil millones de 2025, 116,2 (65,2%) llegaron sin pasar por el RSS.
 *   - El archivo anual: ocds-2023.zip creado el 15/01/2024, ocds-2024.zip el 27/02/2025,
 *     ocds-2025.zip el 19/01/2026. No existe ocds-2026.zip.
 *
 * QUÉ NO PRUEBA. Que haya información oculta. ARCE publica dos cosas porque son dos cosas: un feed
 * OCDS en vivo de lo que se tramita dentro del SICE, y un archivo consolidado que además incluye lo
 * que ciertos organismos INFORMAN en lugar de tramitar. Esos organismos tienen autonomía de
 * contratación y sistemas propios. Ninguna compra queda sin publicar: están hoy en el portal, con su
 * ficha y su identificador. Lo que falta no es información pública, es un formato de descarga masiva
 * de un año que todavía no terminó.
 *
 * Y NOS INCLUYE, con línea de código: src/jobs/refresh-spending-trend.ts:811 pone
 * «partial: year >= currentYear», así que nuestra página de evolución del gasto marca 2026 como
 * parcial por el motivo equivocado —que el año no terminó— y no porque le falte un canal entero.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const USA_RED = !process.argv.includes("--sin-red");
const MMM = (n: number): string => (n / 1e9).toLocaleString("es-UY", { maximumFractionDigits: 1 });

const AFECTADOS = [
  "Intendencia de Montevideo",
  "Intendencia de Canelones",
  "Administración Nacional de Puertos",
];
const CONTROLES = ["Intendencia de Paysandú", "Intendencia de Colonia", "Intendencia de Florida", "Intendencia de Maldonado"];

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  console.log("=== releases por organismo y año: tres organismos, no «las intendencias» ===");
  const conteo = await rel
    .aggregate(
      [
        { $match: { sourceYear: { $gte: 2023, $lte: 2026 }, "buyer.name": { $in: [...AFECTADOS, ...CONTROLES] } } },
        { $group: { _id: { b: "$buyer.name", y: "$sourceYear" }, n: { $sum: 1 } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const tabla = new Map<string, Map<number, number>>();
  for (const c of conteo as any[]) {
    if (!tabla.has(c._id.b)) tabla.set(c._id.b, new Map());
    tabla.get(c._id.b)!.set(c._id.y, c.n);
  }
  for (const grupo of [
    ["AFECTADOS", AFECTADOS],
    ["CONTROL (2026 normal)", CONTROLES],
  ] as const) {
    console.log(`  — ${grupo[0]} —`);
    for (const b of grupo[1]) {
      const f = tabla.get(b) ?? new Map();
      console.log(`  ${b.padEnd(36)} 2023: ${String(f.get(2023) ?? 0).padStart(6)} · 2024: ${String(f.get(2024) ?? 0).padStart(6)} · 2025: ${String(f.get(2025) ?? 0).padStart(6)} · 2026: ${String(f.get(2026) ?? 0).padStart(6)}`);
    }
  }

  console.log("\n=== cuánto pesa el canal «i», midiendo por el prefijo del ocid ===");
  const canalI = await rel
    .aggregate(
      [
        { $match: { sourceYear: { $gte: 2023, $lte: 2026 }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        {
          $group: {
            _id: { y: "$sourceYear", i: { $regexMatch: { input: "$ocid", regex: /^ocds-yfs5dr-i/ } } },
            n: { $sum: 1 },
            monto: { $sum: "$amount.primaryAmount" },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const iPorAnio = new Map<number, { iN: number; iM: number; oN: number; oM: number }>();
  for (const c of canalI as any[]) {
    const v = iPorAnio.get(c._id.y) ?? { iN: 0, iM: 0, oN: 0, oM: 0 };
    if (c._id.i) {
      v.iN += c.n;
      v.iM += c.monto;
    } else {
      v.oN += c.n;
      v.oM += c.monto;
    }
    iPorAnio.set(c._id.y, v);
  }
  for (const y of [2023, 2024, 2025, 2026]) {
    const v = iPorAnio.get(y);
    if (!v) continue;
    console.log(`  ${y}: canal «i» ${String(v.iN).padStart(6)} releases / ${MMM(v.iM).padStart(6)} mm = ${((100 * v.iM) / (v.iM + v.oM)).toFixed(1)}% del gasto registrado`);
  }
  console.log("  Ese porcentaje no se puede dar vuelta como «a 2026 le falta el 65% de la plata»: los totales");
  console.log("  anuales son grumosos y 2026 ya suma por RSS solo. Lo que se sostiene es la cifra del canal.");

  console.log("\n=== el mismo corte visto por la marca de llegada del RSS (sólo existe desde 2025) ===");
  const canal = await rel
    .aggregate(
      [
        { $match: { sourceYear: { $gte: 2023, $lte: 2026 }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        {
          $group: {
            _id: { y: "$sourceYear", rss: { $cond: [{ $ifNull: ["$rssPublishDate", false] }, "rss", "archivo-anual"] } },
            n: { $sum: 1 },
            monto: { $sum: "$amount.primaryAmount" },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const porAnio = new Map<number, { rssN: number; rssM: number; zipN: number; zipM: number }>();
  for (const c of canal as any[]) {
    const v = porAnio.get(c._id.y) ?? { rssN: 0, rssM: 0, zipN: 0, zipM: 0 };
    if (c._id.rss === "rss") {
      v.rssN += c.n;
      v.rssM += c.monto;
    } else {
      v.zipN += c.n;
      v.zipM += c.monto;
    }
    porAnio.set(c._id.y, v);
  }
  for (const y of [2023, 2024, 2025, 2026]) {
    const v = porAnio.get(y);
    if (!v) continue;
    const total = v.rssM + v.zipM;
    console.log(
      `  ${y}: por RSS ${String(v.rssN).padStart(6)} releases / ${MMM(v.rssM).padStart(6)} mm · ` +
        `sin marca de RSS ${String(v.zipN).padStart(6)} / ${MMM(v.zipM).padStart(6)} mm = ${((100 * v.zipM) / total).toFixed(1)}% del gasto`
    );
  }
  console.log("  OJO: sólo empezamos a marcar la llegada por RSS en 2025, así que 2023 y 2024 dan 100% sin");
  console.log("  marca por construcción. Para el peso del canal vale el corte por prefijo de ocid de arriba.");

  console.log("\n=== quiénes viajan por el canal que 2026 no tiene (2025) ===");
  const top = await rel
    .aggregate(
      [
        { $match: { sourceYear: 2025, rssPublishDate: null, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        { $group: { _id: "$buyer.name", monto: { $sum: "$amount.primaryAmount" }, n: { $sum: 1 } } },
        { $sort: { monto: -1 } },
        { $limit: 8 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const t of top as any[]) console.log(`  ${MMM(t.monto).padStart(7)} mm · ${String(t.n).padStart(6)} releases · ${String(t._id).slice(0, 48)}`);

  console.log("\n=== no es por organismo, es por compra: cuánto de cada uno pasó por el RSS en 2025 ===");
  const mezcla = await rel
    .aggregate(
      [
        { $match: { sourceYear: 2025 } },
        { $group: { _id: "$buyer.name", n: { $sum: 1 }, rss: { $sum: { $cond: [{ $ifNull: ["$rssPublishDate", false] }, 1, 0] } } } },
        { $match: { n: { $gte: 100 } } },
        { $project: { n: 1, rss: 1, pct: { $multiply: [100, { $divide: ["$rss", "$n"] }] } } },
        { $sort: { pct: 1 } },
        { $limit: 6 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const m of mezcla as any[]) console.log(`  ${String(m._id).slice(0, 48).padEnd(48)} ${m.pct.toFixed(1)}% por RSS (${m.rss} de ${m.n})`);
  for (const b of ["Administración Nacional de Combustibles, Alcohol y Portland", "Administración Nacional de Usinas y Trasmisiones Eléctricas"]) {
    const r: any = (
      await rel
        .aggregate([
          { $match: { sourceYear: 2025, "buyer.name": b } },
          { $group: { _id: null, n: { $sum: 1 }, rss: { $sum: { $cond: [{ $ifNull: ["$rssPublishDate", false] }, 1, 0] } } } },
        ])
        .toArray()
    )[0];
    if (r) console.log(`  ${b.slice(0, 48).padEnd(48)} ${((100 * r.rss) / r.n).toFixed(1)}% por RSS (${r.rss} de ${r.n})`);
  }

  console.log("\n=== las cancelaciones de adjudicación nunca entran al feed en vivo ===");
  for (const y of [2024, 2025, 2026]) {
    console.log(`  ${y}: awardCancellation en la base = ${await rel.countDocuments({ sourceYear: y, tag: "awardCancellation" })}`);
  }

  console.log("\n=== cuándo entró cada archivo anual a NUESTRA base ===");
  for (const y of [2024, 2025]) {
    const r: any = (
      await rel
        .aggregate(
          [
            { $match: { sourceYear: y, rssPublishDate: null, ocid: { $regex: "^ocds-yfs5dr-i" } } },
            // webFetchDate no viaja en estos documentos: la fecha de alta se lee del ObjectId.
            { $group: { _id: null, n: { $sum: 1 }, ultima: { $max: { $toDate: "$_id" } }, primera: { $min: { $toDate: "$_id" } } } },
          ],
          { allowDiskUse: true }
        )
        .toArray()
    )[0];
    const dia = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "s/d").slice(0, 10));
    console.log(`  ${y}: ${(r?.n ?? 0).toLocaleString("es-UY")} releases del canal «i» sin marca de RSS · alta entre ${dia(r?.primera)} y ${dia(r?.ultima)}`);
  }
  console.log("  La importación del archivo anual es manual (scripts/sync-year-zip.ts), no está en el cron,");
  console.log("  y nada avisa cuando el archivo nuevo aparece en el catálogo.");

  if (USA_RED) {
    console.log("\n=== contraste en la fuente ===");
    try {
      const pkg = await (await fetch("https://catalogodatos.gub.uy/api/3/action/package_show?id=arce-datos-historicos-de-compras")).json();
      const recursos: any[] = pkg?.result?.resources ?? [];
      console.log(`  catalogodatos: ${recursos.length} recursos · últimos:`);
      for (const r of recursos.slice(-4)) console.log(`    ${String(r.name).padEnd(16)} creado ${String(r.created).slice(0, 10)}`);
      const hay2026 = recursos.some((r) => /2026/.test(String(r.name)));
      console.log(`    ¿existe el recurso de 2026?: ${hay2026 ? "SÍ (el hallazgo caducó)" : "no"}`);
    } catch (e) {
      console.log(`  catalogodatos no respondió (${(e as Error).message})`);
    }

    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch("https://www.comprasestatales.gub.uy/ocds/rss/2026/07", { headers: { "user-agent": "conlatuya-verify/1.0" } });
      const xml = res.status === 200 ? await res.text() : "";
      const releases = [...xml.matchAll(/\/ocds\/release\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1]!);
      const conI = releases.filter((r) => /-i\d/.test(r));
      const cancel = releases.filter((r) => /^cancelacion_/.test(r));
      console.log(`  RSS 2026/07: HTTP ${res.status} · ${releases.length} releases · con prefijo «i»: ${conI.length} · cancelaciones: ${cancel.length}`);
    } catch (e) {
      console.log(`  el RSS no respondió (${(e as Error).message})`);
    }

    for (const [id, esperado] of [
      ["adjudicacion-i483583", "404 (registro de 2025 que YA tenemos)"],
      ["adjudicacion-1307316", "200 (control)"],
    ] as const) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await fetch(`https://www.comprasestatales.gub.uy/ocds/release/${id}`, { headers: { "user-agent": "conlatuya-verify/1.0" } });
        console.log(`  GET /ocds/release/${id} → HTTP ${res.status} · esperado ${esperado}`);
      } catch (e) {
        console.log(`  GET /ocds/release/${id} falló (${(e as Error).message})`);
      }
    }
  } else {
    console.log("\n(--sin-red: se saltó el contraste en la fuente)");
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
