#!/usr/bin/env tsx
/**
 * HALLAZGO «plazos-publicacion» — lo que el Estado compra chico se publica el mismo día; lo que
 * compra grande, meses después.
 *
 *   npx tsx tests/unit/hallazgo-plazos-publicacion.verify.ts
 *
 * QUÉ MIDE. La distancia entre la fecha de la resolución de adjudicación y la fecha en que esa
 * adjudicación se publicó en el sitio de Compras Estatales, sobre las adjudicaciones publicadas
 * entre el 1/1/2022 y hoy. Primero VALIDA que el campo de fecha del release es la fecha de
 * publicación, comparándolo contra la fecha de publicación del acta adjunta. Después corta por
 * procedimiento (cruzando cada adjudicación con su pliego hermano por ocid), por monto, por año y
 * por organismo, y separa los casos donde el Tribunal de Cuentas observó el gasto.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Universo 480.178 · sin fecha de resolución 4.502 · medibles 475.676.
 *   - La fecha del release ES la de publicación: en los 221.595 registros con acta adjunta coincide
 *     con la del documento en 221.547 casos, el 99,98%.
 *   - Mediana 1 día · p75 7 · p90 35 · p95 88. Dentro de los diez días: 378.247 = 79,52%. Con
 *     catorce días corridos (techo de diez hábiles sin feriados): 82,94%. Más de 90 días: 23.240
 *     (4,89%). Más de un año: 5.155 (1,08%). Publicación anterior a la resolución: 265 (0,06%).
 *   - En la banda que el art. 50 obliga a publicar (monto ≥ 130.800, el 20% del tope de 2026), el
 *     cumplimiento cae a 68,86%: 45.463 de 145.985 fuera de plazo. Y baja año a año: 70,1% en 2022,
 *     72,7% en 2023, 68,6% en 2024, 67,7% en 2025, 60,3% en 2026.
 *   - EL GRADIENTE: Compra Directa 88,1% en diez días (mediana 0) · Compra por Excepción 68,5% (3) ·
 *     Concurso de Precios 59,8% (7) · Licitación Abreviada 30,3% (27) · Licitación Pública 15,7%
 *     (mediana 56 días, p90 208).
 *   - Los 5.134 registros donde el Tribunal observó el gasto cumplen los diez días el 26,6% de las
 *     veces contra el 70,6% de los que no lo traen.
 *
 * QUÉ NO PRUEBA. Que haya ocultamiento. El reloj del art. 50 arranca «luego de producido el acto», y
 * en un procedimiento formal el acto no termina el día que se firma: la resolución va al Tribunal de
 * Cuentas, si la observa el organismo reitera, y recién después se notifica. Un organismo puede leer
 * que «el acto» es el acto firme e intervenido. El dato lo respalda, y por eso está medido acá. Y
 * hay sesgo de supervivencia: sólo podemos medir lo que se publicó, así que el incumplimiento
 * medido es un PISO.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const DESDE = new Date("2022-01-01T00:00:00.000Z");
/** 20% del tope de compra directa de 2026 ($654.000). Aproximación: el tope se indexa cada año. */
const UMBRAL_ART50 = 130_800;
const DIA = 86_400_000;

function pct(x: number, y: number): string {
  return y === 0 ? "n/d" : `${((100 * x) / y).toFixed(2)}%`;
}
function percentil(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

interface Cubo {
  n: number;
  ok10: number;
  over90: number;
  diffs: number[];
}
const cubo = (): Cubo => ({ n: 0, ok10: 0, over90: 0, diffs: [] });
function sumar(c: Cubo, d: number): void {
  c.n += 1;
  if (d <= 10) c.ok10 += 1;
  if (d > 90) c.over90 += 1;
  c.diffs.push(d);
}
function linea(nombre: string, c: Cubo): string {
  return (
    `  ${nombre.padEnd(26)} ${String(c.n).padStart(6)} adjudicaciones · ${pct(c.ok10, c.n).padStart(7)} en diez días · ` +
    `mediana ${String(percentil(c.diffs, 50)).padStart(3)} · p90 ${String(percentil(c.diffs, 90)).padStart(4)} · más de 90 días ${pct(c.over90, c.n)}`
  );
}

async function main(): Promise<void> {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  console.log("=== paso 1: mapa de ocid a procedimiento, desde los releases de pliego ===");
  const t0 = Date.now();
  const metodos = new Map<string, string>();
  for await (const d of rel.aggregate(
    [
      { $match: { sourceYear: { $gte: 2021 }, "tender.procurementMethodDetails": { $ne: null } } },
      { $group: { _id: "$ocid", m: { $first: "$tender.procurementMethodDetails" } } },
    ],
    { allowDiskUse: true }
  ) as any) {
    metodos.set(d._id, d.m);
  }
  console.log(`  ${metodos.size.toLocaleString("es-UY")} ocid con procedimiento conocido · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log("  (no uses $lookup sobre 475 mil documentos, y no esperes que el release de adjudicación traiga tender: es nulo en las 480.178)");

  console.log("\n=== paso 2: una pasada sobre las adjudicaciones publicadas desde el 1/1/2022 ===");
  const t1 = Date.now();
  const cursor = rel.find(
    { tag: "award", date: { $gte: DESDE } },
    {
      projection: {
        _id: 0,
        ocid: 1,
        date: 1,
        "buyer.name": 1,
        "amount.primaryAmount": 1,
        "awards.date": 1,
        "awards.documents.documentType": 1,
        "awards.documents.datePublished": 1,
      },
    }
  );

  let universo = 0;
  let sinAward = 0;
  let sinFechaResolucion = 0;
  let medibles = 0;
  let ok10 = 0;
  let ok14 = 0;
  let over90 = 0;
  let over365 = 0;
  let negativos = 0;
  let cero = 0;
  let fechaResDate = 0;
  let fechaResTexto = 0;
  let anioImposible = 0;
  const todos: number[] = [];
  const porProcedimiento = new Map<string, Cubo>();
  const porTramo = new Map<string, Cubo>();
  const bandaPorAnio = new Map<number, { n: number; ok: number }>();
  const conReiteracion = cubo();
  const sinReiteracion = cubo();
  const porOrganismo = new Map<string, { n: number; ok: number; over365: number }>();
  const porDia = new Map<string, { n: number; over90: number; masViejo: number }>();
  let conActa = 0;
  let actaCoincide = 0;

  for await (const doc of cursor as any) {
    universo += 1;
    const awards: any[] = doc.awards ?? [];
    if (awards.length === 0) {
      sinAward += 1;
      continue;
    }
    const pub: Date | null = doc.date instanceof Date ? doc.date : doc.date ? new Date(doc.date) : null;
    const cruda = awards[0]?.date;
    let res: Date | null = null;
    if (cruda instanceof Date) {
      res = cruda;
      fechaResDate += 1;
    } else if (typeof cruda === "string" && cruda) {
      res = new Date(cruda);
      fechaResTexto += 1;
    }
    if (!pub || !res || Number.isNaN(res.getTime())) {
      sinFechaResolucion += 1;
      continue;
    }
    const anio = res.getUTCFullYear();
    if (anio < 1990 || anio > 2100) anioImposible += 1;

    // Control: la fecha del release ¿es la de publicación del acta?
    const acta = awards.flatMap((a: any) => a.documents ?? []).find((x: any) => x?.documentType === "awardNotice" && x?.datePublished);
    if (acta) {
      conActa += 1;
      const dp = acta.datePublished instanceof Date ? acta.datePublished : new Date(acta.datePublished);
      if (Math.abs(dp.getTime() - pub.getTime()) < 1000) actaCoincide += 1;
    }

    medibles += 1;
    const dias = Math.floor((pub.getTime() - res.getTime()) / DIA);
    todos.push(dias);
    if (dias < 0) negativos += 1;
    if (dias === 0) cero += 1;
    if (dias <= 10) ok10 += 1;
    if (dias <= 14) ok14 += 1;
    if (dias > 90) over90 += 1;
    if (dias > 365) over365 += 1;

    const monto: number | undefined = doc.amount?.primaryAmount;

    // Corte por procedimiento (sólo los que tienen pliego hermano).
    const m = metodos.get(doc.ocid);
    if (m) {
      if (!porProcedimiento.has(m)) porProcedimiento.set(m, cubo());
      sumar(porProcedimiento.get(m)!, dias);
    }

    // Corte por monto.
    if (typeof monto === "number" && monto > 0) {
      const tramo =
        monto < 1e5 ? "menos de 100.000" : monto < 1e6 ? "100.000 a 1 millón" : monto < 1e7 ? "1 a 10 millones" : monto < 1e8 ? "10 a 100 millones" : "más de 100 millones";
      if (!porTramo.has(tramo)) porTramo.set(tramo, cubo());
      sumar(porTramo.get(tramo)!, dias);
    }

    // Banda que el art. 50 obliga a publicar.
    if (typeof monto === "number" && monto >= UMBRAL_ART50 && monto < 50e9) {
      const y = pub.getUTCFullYear();
      const v = bandaPorAnio.get(y) ?? { n: 0, ok: 0 };
      v.n += 1;
      if (dias <= 10) v.ok += 1;
      bandaPorAnio.set(y, v);
    }

    // ¿El Tribunal de Cuentas observó el gasto?
    const reitera = awards.some((a: any) => (a.documents ?? []).some((x: any) => x?.documentType === "reiteracionGasto"));
    if (acta) sumar(reitera ? conReiteracion : sinReiteracion, dias);

    // Organismos, período reciente.
    const y = pub.getUTCFullYear();
    if (y >= 2025) {
      const b = String(doc.buyer?.name ?? "");
      const v = porOrganismo.get(b) ?? { n: 0, ok: 0, over365: 0 };
      v.n += 1;
      if (dias <= 10) v.ok += 1;
      if (dias > 365) v.over365 += 1;
      porOrganismo.set(b, v);
    }

    // Descargas en bloque.
    const k = `${String(doc.buyer?.name ?? "").slice(0, 40)}|${pub.toISOString().slice(0, 10)}`;
    const dv = porDia.get(k) ?? { n: 0, over90: 0, masViejo: 0 };
    dv.n += 1;
    if (dias > 90) dv.over90 += 1;
    if (dias > dv.masViejo) dv.masViejo = dias;
    porDia.set(k, dv);
  }
  console.log(`  ${universo.toLocaleString("es-UY")} releases de adjudicación · ${((Date.now() - t1) / 1000).toFixed(0)}s`);

  console.log("\n=== el control que no asumimos: ¿la fecha del release es la de publicación? ===");
  console.log(`  registros con acta adjunta: ${conActa.toLocaleString("es-UY")} · coincide con la fecha de publicación del acta: ${actaCoincide.toLocaleString("es-UY")} = ${pct(actaCoincide, conActa)}`);

  console.log("\n=== el universo ===");
  console.log(`  universo ${universo.toLocaleString("es-UY")} · sin ningún award ${sinAward.toLocaleString("es-UY")} · sin fecha de resolución ${sinFechaResolucion.toLocaleString("es-UY")} · medibles ${medibles.toLocaleString("es-UY")}`);
  console.log(`  fecha de resolución como fecha ${fechaResDate.toLocaleString("es-UY")} · como texto ${fechaResTexto.toLocaleString("es-UY")} · años imposibles ${anioImposible}`);
  console.log(`  → por los años imposibles se trabaja con MEDIANAS y umbrales, nunca con medias`);
  console.log(`  mediana ${percentil(todos, 50)} días · p75 ${percentil(todos, 75)} · p90 ${percentil(todos, 90)} · p95 ${percentil(todos, 95)}`);
  console.log(`  dentro de 10 días corridos: ${ok10.toLocaleString("es-UY")} = ${pct(ok10, medibles)} · dentro de 14: ${ok14.toLocaleString("es-UY")} = ${pct(ok14, medibles)}`);
  console.log(`  más de 90 días: ${over90.toLocaleString("es-UY")} = ${pct(over90, medibles)} · más de un año: ${over365.toLocaleString("es-UY")} = ${pct(over365, medibles)} · publicación anterior a la resolución: ${negativos}`);
  console.log(`  diferencia CERO: ${cero.toLocaleString("es-UY")} = ${pct(cero, medibles)} — no distinguimos «resolvió y publicó el mismo día» de «el sistema copió la fecha»; el error infla el cumplimiento`);

  console.log("\n=== la banda que el art. 50 SÍ obliga a publicar (monto ≥ 130.800) ===");
  let bandaN = 0;
  let bandaOk = 0;
  for (const y of [...bandaPorAnio.keys()].sort()) {
    const v = bandaPorAnio.get(y)!;
    bandaN += v.n;
    bandaOk += v.ok;
    console.log(`  ${y}: ${String(v.n).padStart(6)} adjudicaciones · ${String(v.ok).padStart(6)} en plazo = ${pct(v.ok, v.n)}`);
  }
  console.log(`  total ${bandaN.toLocaleString("es-UY")} · ${bandaOk.toLocaleString("es-UY")} en plazo = ${pct(bandaOk, bandaN)} · fuera de plazo ${(bandaN - bandaOk).toLocaleString("es-UY")}`);

  console.log("\n=== EL GRADIENTE: cuanto más formal la compra, más tarde se entera el público ===");
  const conPliego = [...porProcedimiento.values()].reduce((a, c) => a + c.n, 0);
  console.log(`  (sobre ${conPliego.toLocaleString("es-UY")} de ${medibles.toLocaleString("es-UY")} adjudicaciones = ${pct(conPliego, medibles)}, las que tienen pliego hermano por ocid)`);
  const orden = ["Compra Directa", "Compra por Excepción", "Concurso de Precios", "Licitación Abreviada", "Licitación Pública"];
  for (const m of orden) if (porProcedimiento.has(m)) console.log(linea(m, porProcedimiento.get(m)!));

  console.log("\n=== lo mismo por monto ===");
  for (const t of ["menos de 100.000", "100.000 a 1 millón", "1 a 10 millones", "10 a 100 millones", "más de 100 millones"]) {
    if (porTramo.has(t)) console.log(linea(t, porTramo.get(t)!));
  }
  console.log("  El tramo por encima de cien millones NO se usa: está contaminado por el artefacto de suma alzada.");

  console.log("\n=== la explicación que compite, medida: los casos donde el Tribunal observó el gasto ===");
  console.log(linea("con reiteración", conReiteracion));
  console.log(linea("sin reiteración", sinReiteracion));
  console.log(`  los casos con reiteración son el ${pct(conReiteracion.n, conReiteracion.n + sinReiteracion.n)} del universo con acta: explican la FORMA de la cola, no el grueso del volumen`);
  console.log("  Y el propio art. 50 exige publicar TAMBIÉN los actos de reiteración: el paso por el Tribunal");
  console.log("  agrega una publicación, no suspende la primera.");

  console.log("\n=== descargas en bloque: hay que leerlas como tales ===");
  for (const [k, v] of [...porDia.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5)) {
    const [b, dia] = k.split("|");
    console.log(`  ${String(dia)} · ${String(b).slice(0, 40).padEnd(40)} ${String(v.n).padStart(5)} adjudicaciones · ${v.over90} con más de 90 días · la más vieja de ${v.masViejo} días atrás`);
  }

  console.log("\n=== comportamiento reciente por organismo (2025-2026, con 200 adjudicaciones o más) ===");
  const orgs = [...porOrganismo.entries()].filter(([, v]) => v.n >= 200).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
  console.log(`  ${orgs.length} organismos. Los diez más bajos:`);
  for (const [b, v] of orgs.slice(0, 10)) console.log(`  ${pct(v.ok, v.n).padStart(7)} · ${String(v.n).padStart(5)} adjudicaciones · ${String(v.over365).padStart(3)} publicadas más de un año tarde · ${b.slice(0, 46)}`);
  console.log("  Los cinco más altos:");
  for (const [b, v] of orgs.slice(-5).reverse()) console.log(`  ${pct(v.ok, v.n).padStart(7)} · ${String(v.n).padStart(5)} adjudicaciones · ${b.slice(0, 46)}`);

  console.log("\n=== dos casos verificados contra la ficha oficial del Estado ===");
  console.log("  OSE, Licitación Pública 17311/2021, SECURITAS URUGUAY S.A., $212.557.261,48:");
  console.log("    «Fecha de la Resolución: 27/07/2021» y «Publicación: 21/04/2025 23:02hs» = 1.364 días");
  console.log("    comprasestatales.gub.uy/consultas/detalle/id/i329228");
  console.log("  Dirección General de Casinos (MEF), compra por excepción art. 33 num. 3, CIA RIOPLATENSE DE HOTELES S.A.:");
  console.log("    resolución del 24/03/2023, publicada el 17/12/2025 a las 14:25 = 999 días (sin citar monto: patrón de suma alzada)");
  console.log("    comprasestatales.gub.uy/consultas/detalle/id/1292798");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
