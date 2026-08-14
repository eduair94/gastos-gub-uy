#!/usr/bin/env tsx
/**
 * HALLAZGO «dgi-31dic» — la DGI resuelve el 13% de sus compras el 31 de diciembre, y el 94,8% de
 * esas resoluciones son ampliaciones de contratos anteriores.
 *
 *   npx tsx tests/unit/hallazgo-dgi-31dic.verify.ts            (sólo la base + 20 fichas de muestra)
 *   npx tsx tests/unit/hallazgo-dgi-31dic.verify.ts --census   (además, el censo de las 215 fichas)
 *
 * QUÉ MIDE. La fecha usada es la de RESOLUCIÓN (`awards[].date`, «Fecha Resolución» en la ficha
 * oficial), no la de publicación del registro. Se agrupa por organismo la proporción de
 * adjudicaciones resueltas el 31 de diciembre, en cantidad y en monto, con un piso de 300
 * adjudicaciones entre 2019 y 2025. Después, tres controles que son los que hacen el hallazgo:
 * el histograma por día del año dentro de la DGI, la serie por año de la proporción del valor, y
 * la demora de publicación partida en cuatro celdas.
 *
 * TRAMPA DE MEDICIÓN. 55.321 documentos traen `awards[].date` como texto y no como fecha, así que
 * hay que convertirla con `$convert ... onError: null`; sin eso el pipeline aborta. El techo de
 * `amount.primaryAmount` en 50e9 saca los artefactos de monto a tanto alzado ya documentados.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 212 organismos con 300+ adjudicaciones. Mediana 0,10% de sus compras el 31/12; p97 1,50%.
 *   - DGI (buyer.id 5-5): 13,03% de sus adjudicaciones (215 de 1.650) y 26,1% de su dinero
 *     (472 de 1.807 millones de pesos). El segundo organismo de la lista está en 4,64%.
 *   - Dentro de los diciembres de la DGI, 215 de 465 adjudicaciones (46,2%) caen el día 31; en el
 *     resto del Estado esa proporción es 2,64%, y diciembre es el mes en que MENOS se resuelve el
 *     último día del mes en el promedio nacional.
 *   - Demora de publicación: DGI 31/12 mediana 53 días; DGI otros días 1 día; resto del Estado
 *     31/12 9 días; resto del Estado en general 2 días.
 *   - Censo del portal: 201 de 212 fichas en línea (94,8%) llevan «Ver Compra Original», es decir
 *     son ampliaciones de una compra anterior. Grupo de control: 18 de 100.
 *
 * LA EXPLICACIÓN ADMINISTRATIVA VA PRIMERO Y CUBRE BUENA PARTE. Los contratos de servicio corren
 * del 1º de enero al 31 de diciembre; la prórroga del año siguiente tiene que estar resuelta antes
 * de que cierre el ejercicio, porque el crédito presupuestal que la paga muere con el año, y el 31
 * de diciembre es el último día en que se puede firmar. Los proveedores se repiten año tras año, e
 * INFOTECH aparece por el mismo importe (U$S 280.600) en 2022, 2023 y 2024: eso es una renovación.
 *
 * QUÉ NO PRUEBA. Resolver una compra el 31 de diciembre no viola ninguna norma, y ampliar un
 * contrato tampoco. No medimos el acumulado de cada contrato contra su monto original —la ficha de
 * una ampliación no publica el acumulado—, así que nada de esto dice que se haya superado el tope
 * del art. 74 del TOCAF. La serie es comparable hasta 2024: estas resoluciones se publican con 53
 * días de demora mediana y caen en el feed del año siguiente.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { compraIdFromOcid } from "../../shared/utils/ocid";

const DGI = "5-5";
const PISO = 300;
const CENSO_COMPLETO = process.argv.includes("--census");

/** `awards[0].date` convertida a fecha; null si el documento la trae como texto ilegible. */
const RESOL = { $convert: { input: { $arrayElemAt: ["$awards.date", 0] }, to: "date", onError: null, onNull: null } };

function percentil(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[i]!;
}

/** Mediana a partir de un histograma valor→frecuencia. El servidor es Mongo 4.4: no hay `$median`. */
function medianaDeHistograma(pares: Array<{ v: number; n: number }>): number {
  const s = [...pares].sort((a, b) => a.v - b.v);
  const total = s.reduce((a, b) => a + b.n, 0);
  let acum = 0;
  for (const p of s) {
    acum += p.n;
    if (acum >= total / 2) return p.v;
  }
  return NaN;
}

/** Días del mes, calculados a mano porque `$dateAdd` no existe en Mongo 4.4. */
const DIAS_DEL_MES = {
  $switch: {
    branches: [
      { case: { $in: ["$m", [1, 3, 5, 7, 8, 10, 12]] }, then: 31 },
      { case: { $in: ["$m", [4, 6, 9, 11]] }, then: 30 },
      {
        case: {
          $or: [
            { $and: [{ $eq: [{ $mod: ["$y", 4] }, 0] }, { $ne: [{ $mod: ["$y", 100] }, 0] }] },
            { $eq: [{ $mod: ["$y", 400] }, 0] },
          ],
        },
        then: 29,
      },
    ],
    default: 28,
  },
};

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  const base = { tag: "award", sourceYear: { $gte: 2018, $lte: 2026 }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } };

  console.log("=== cobertura del campo de fecha de resolución ===");
  const cobertura: any = (
    await rel
      .aggregate(
        [
          { $match: { tag: "award", sourceYear: { $gte: 2018, $lte: 2026 } } },
          { $group: { _id: null, total: { $sum: 1 }, con: { $sum: { $cond: [{ $ne: [RESOL, null] }, 1, 0] } } } },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  )[0];
  console.log(`  ${cobertura.con.toLocaleString("es-UY")} de ${cobertura.total.toLocaleString("es-UY")} adjudicaciones traen fecha de resolución legible (${((100 * cobertura.con) / cobertura.total).toFixed(1)}%)`);

  console.log("\n=== proporción de adjudicaciones resueltas el 31 de diciembre, por organismo (2019-2025, piso de 300) ===");
  const porOrganismo = await rel
    .aggregate(
      [
        { $match: base },
        { $project: { buyer: "$buyer.id", nombre: "$buyer.name", amt: "$amount.primaryAmount", r: RESOL } },
        { $match: { r: { $ne: null } } },
        { $project: { buyer: 1, nombre: 1, amt: 1, y: { $year: "$r" }, m: { $month: "$r" }, d: { $dayOfMonth: "$r" } } },
        { $match: { y: { $gte: 2019, $lte: 2025 } } },
        {
          $group: {
            _id: "$buyer",
            nombre: { $first: "$nombre" },
            n: { $sum: 1 },
            monto: { $sum: "$amt" },
            dic: { $sum: { $cond: [{ $eq: ["$m", 12] }, 1, 0] } },
            n31: { $sum: { $cond: [{ $and: [{ $eq: ["$m", 12] }, { $eq: ["$d", 31] }] }, 1, 0] } },
            monto31: { $sum: { $cond: [{ $and: [{ $eq: ["$m", 12] }, { $eq: ["$d", 31] }] }, "$amt", 0] } },
          },
        },
        { $match: { n: { $gte: PISO } } },
        { $project: { nombre: 1, n: 1, monto: 1, dic: 1, n31: 1, monto31: 1, pct: { $multiply: [100, { $divide: ["$n31", "$n"] }] } } },
        { $sort: { pct: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  const pcts = (porOrganismo as any[]).map((o) => o.pct);
  console.log(`  ${porOrganismo.length} organismos superan el piso · mediana ${percentil(pcts, 50).toFixed(2)}% · p97 ${percentil(pcts, 97).toFixed(2)}%`);
  for (const o of (porOrganismo as any[]).slice(0, 6)) {
    console.log(
      `  ${o.pct.toFixed(2).padStart(6)}%  ${String(o.n31).padStart(4)} de ${String(o.n).padStart(5)} · ` +
      `${((100 * o.monto31) / o.monto).toFixed(1).padStart(5)}% del dinero ($${Math.round(o.monto31 / 1e6).toLocaleString("es-UY")} de ${Math.round(o.monto / 1e6).toLocaleString("es-UY")} millones) · ` +
      `${o._id} ${String(o.nombre ?? "").slice(0, 40)}`
    );
  }

  const dgi = (porOrganismo as any[]).find((o) => o._id === DGI);
  if (dgi) {
    console.log(`\n  Dentro de los diciembres de la DGI: ${dgi.n31} de ${dgi.dic} adjudicaciones (${((100 * dgi.n31) / dgi.dic).toFixed(1)}%) caen el día 31.`);
    const resto = (porOrganismo as any[]).filter((o) => o._id !== DGI).reduce((a, o) => ({ dic: a.dic + o.dic, n31: a.n31 + o.n31 }), { dic: 0, n31: 0 });
    console.log(`  En el resto de los ${porOrganismo.length - 1} organismos que superan el piso: ${resto.n31} de ${resto.dic} (${((100 * resto.n31) / resto.dic).toFixed(2)}%).`);
    const todos: any = (
      await rel
        .aggregate(
          [
            { $match: { ...base, "buyer.id": { $ne: DGI } } },
            { $project: { r: RESOL } },
            { $match: { r: { $ne: null } } },
            { $project: { y: { $year: "$r" }, m: { $month: "$r" }, d: { $dayOfMonth: "$r" } } },
            { $match: { y: { $gte: 2019, $lte: 2025 }, m: 12 } },
            { $group: { _id: null, dic: { $sum: 1 }, n31: { $sum: { $cond: [{ $eq: ["$d", 31] }, 1, 0] } } } },
          ],
          { allowDiskUse: true }
        )
        .toArray()
    )[0];
    console.log(`  En TODO el resto del Estado, sin piso de adjudicaciones: ${todos.n31} de ${todos.dic} (${((100 * todos.n31) / todos.dic).toFixed(2)}%).`);
  }

  console.log("\n=== control: qué parte de cada mes se resuelve el ÚLTIMO día del mes, en todo el Estado ===");
  const porMes = await rel
    .aggregate(
      [
        { $match: base },
        { $project: { r: RESOL } },
        { $match: { r: { $ne: null } } },
        { $project: { y: { $year: "$r" }, m: { $month: "$r" }, d: { $dayOfMonth: "$r" } } },
        { $match: { y: { $gte: 2019, $lte: 2025 } } },
        { $group: { _id: "$m", n: { $sum: 1 }, fin: { $sum: { $cond: [{ $eq: ["$d", DIAS_DEL_MES] }, 1, 0] } } } },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const m of porMes as any[]) {
    console.log(`  mes ${String(m._id).padStart(2)}: ${((100 * m.fin) / m.n).toFixed(2).padStart(5)}% del mes cae el último día (${m.fin} de ${m.n})`);
  }

  console.log("\n=== la DGI por año: qué parte de su valor anual se resuelve el 31 de diciembre ===");
  const serie = await rel
    .aggregate(
      [
        { $match: { ...base, "buyer.id": DGI } },
        { $project: { amt: "$amount.primaryAmount", r: RESOL } },
        { $match: { r: { $ne: null } } },
        { $project: { amt: 1, y: { $year: "$r" }, m: { $month: "$r" }, d: { $dayOfMonth: "$r" } } },
        { $match: { y: { $gte: 2019, $lte: 2025 } } },
        {
          $group: {
            _id: "$y",
            n: { $sum: 1 },
            monto: { $sum: "$amt" },
            n31: { $sum: { $cond: [{ $and: [{ $eq: ["$m", 12] }, { $eq: ["$d", 31] }] }, 1, 0] } },
            monto31: { $sum: { $cond: [{ $and: [{ $eq: ["$m", 12] }, { $eq: ["$d", 31] }] }, "$amt", 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const a of serie as any[]) {
    console.log(`  ${a._id}: ${String(a.n31).padStart(3)} de ${String(a.n).padStart(4)} adjudicaciones · ${((100 * a.monto31) / a.monto).toFixed(1).padStart(5)}% del valor del año`);
  }
  console.log("  La serie es comparable hasta 2024: en 2025 la DGI aparece con pocos registros del 31/12 porque estas");
  console.log("  resoluciones se publican con 53 días de demora mediana y caen en el feed del año siguiente.");

  console.log("\n=== histograma por día del año dentro de la DGI (todo se apoya en un solo día) ===");
  const dias = await rel
    .aggregate(
      [
        { $match: { ...base, "buyer.id": DGI } },
        { $project: { r: RESOL } },
        { $match: { r: { $ne: null } } },
        { $project: { y: { $year: "$r" }, md: { $dateToString: { date: "$r", format: "%d/%m" } } } },
        { $match: { y: { $gte: 2019, $lte: 2025 } } },
        { $group: { _id: "$md", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 5 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const d of dias as any[]) console.log(`  ${String(d.n).padStart(4)} adjudicaciones · ${d._id}`);

  console.log("\n=== demora de publicación: días entre la resolución y el release, en cuatro celdas ===");
  const demora = await rel
    .aggregate(
      [
        { $match: { ...base, date: { $type: "date" } } },
        { $project: { buyer: "$buyer.id", pub: "$date", r: RESOL } },
        { $match: { r: { $ne: null } } },
        {
          $project: {
            buyer: 1,
            y: { $year: "$r" },
            m: { $month: "$r" },
            d: { $dayOfMonth: "$r" },
            // `$dateDiff` es de Mongo 5.0 y el servidor es 4.4: la resta de dos fechas da milisegundos.
            dias: { $floor: { $divide: [{ $subtract: ["$pub", "$r"] }, 86_400_000] } },
          },
        },
        { $match: { y: { $gte: 2019, $lte: 2025 }, dias: { $gte: 0 } } },
        {
          $group: {
            _id: {
              quien: { $cond: [{ $eq: ["$buyer", DGI] }, "DGI", "resto del Estado"] },
              cuando: { $cond: [{ $and: [{ $eq: ["$m", 12] }, { $eq: ["$d", 31] }] }, "31 de diciembre", "otros días"] },
              dias: "$dias",
            },
            n: { $sum: 1 },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const celdas = new Map<string, Array<{ v: number; n: number }>>();
  for (const c of demora as any[]) {
    const k = `${c._id.quien} ${c._id.cuando}`;
    if (!celdas.has(k)) celdas.set(k, []);
    celdas.get(k)!.push({ v: c._id.dias, n: c.n });
  }
  for (const [k, pares] of [...celdas.entries()].sort()) {
    const [quien, cuando] = k.split(" ");
    const n = pares.reduce((a, b) => a + b.n, 0);
    console.log(`  ${String(quien).padEnd(17)} · ${String(cuando).padEnd(16)} · mediana ${String(medianaDeHistograma(pares)).padStart(4)} días (n=${n.toLocaleString("es-UY")})`);
  }
  const dgi31 = celdas.get(`DGI 31 de diciembre`) ?? [];
  const tot31 = dgi31.reduce((a, b) => a + b.n, 0);
  const mas30 = dgi31.filter((p) => p.v > 30).reduce((a, b) => a + b.n, 0);
  const mas180 = dgi31.filter((p) => p.v > 180).reduce((a, b) => a + b.n, 0);
  const mas365 = dgi31.filter((p) => p.v > 365).reduce((a, b) => a + b.n, 0);
  const maxDias = dgi31.reduce((a, b) => Math.max(a, b.v), 0);
  console.log(`  De las ${tot31} del 31/12 de la DGI: ${mas30} tardan más de un mes, ${mas180} más de seis meses y ${mas365} más de un año (máximo ${maxDias} días).`);

  console.log("\n=== censo: qué son esos registros del 31/12 en el portal («Ver Compra Original» = ampliación) ===");
  const ocids = (
    await rel
      .aggregate(
        [
          { $match: { ...base, "buyer.id": DGI } },
          { $project: { ocid: 1, amt: "$amount.primaryAmount", r: RESOL } },
          { $match: { r: { $ne: null } } },
          { $project: { ocid: 1, amt: 1, y: { $year: "$r" }, m: { $month: "$r" }, d: { $dayOfMonth: "$r" } } },
          { $match: { y: { $gte: 2019, $lte: 2025 }, m: 12, d: 31 } },
          { $group: { _id: "$ocid", amt: { $first: "$amt" } } },
          { $sort: { amt: -1 } },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  ).map((o: any) => o._id as string);
  console.log(`  ${ocids.length} compras del 31 de diciembre para censar.`);

  await censar("31 de diciembre", CENSO_COMPLETO ? ocids : ocids.slice(0, 20));
  if (!CENSO_COMPLETO) console.log(`  (muestra de 20; con --census se censan las ${ocids.length} y además el grupo de control, unos 5 minutos)`);

  if (CENSO_COMPLETO) {
    console.log("\n=== grupo de control: las 100 adjudicaciones de la DGI de mayor monto que NO son del 31/12 ===");
    const control = (
      await rel
        .aggregate(
          [
            { $match: { ...base, "buyer.id": DGI } },
            { $project: { ocid: 1, amt: "$amount.primaryAmount", r: RESOL } },
            { $match: { r: { $ne: null } } },
            { $project: { ocid: 1, amt: 1, y: { $year: "$r" }, m: { $month: "$r" }, d: { $dayOfMonth: "$r" } } },
            { $match: { y: { $gte: 2019, $lte: 2025 }, $expr: { $not: { $and: [{ $eq: ["$m", 12] }, { $eq: ["$d", 31] }] } } } },
            { $group: { _id: "$ocid", amt: { $first: "$amt" } } },
            { $sort: { amt: -1 } },
            { $limit: 100 },
          ],
          { allowDiskUse: true }
        )
        .toArray()
    ).map((o: any) => o._id as string);
    await censar("control", control);
  }

  await disconnectFromDatabase();

  /** Baja cada ficha del portal y cuenta el cartel «Ver Compra Original», que marca una ampliación. */
  async function censar(etiqueta: string, lista: string[]): Promise<void> {
    let ampliacion = 0;
    let leidas = 0;
    let caidas = 0;
    for (const ocid of lista) {
      const id = compraIdFromOcid(ocid);
      if (!id) continue;
      try {
        const res = await fetch(`https://www.comprasestatales.gub.uy/consultas/detalle/id/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) { caidas++; continue; }
        const html = await res.text();
        leidas++;
        if (html.includes("Ver Compra Original")) ampliacion++;
      } catch {
        caidas++;
      }
      await new Promise((r) => setTimeout(r, 800)); // un pedido cada 0,8 s: no se castiga al portal
    }
    console.log(
      `  [${etiqueta}] ${ampliacion} de ${leidas} fichas leídas llevan «Ver Compra Original» (${leidas ? ((100 * ampliacion) / leidas).toFixed(1) : "—"}%)` +
      `${caidas ? ` · ${caidas} no respondieron o fueron borradas del portal` : ""}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
