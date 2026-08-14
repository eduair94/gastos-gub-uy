#!/usr/bin/env tsx
/**
 * HALLAZGO «ecografia-precio» — la misma empresa le cobró a ASSE 875 pesos en Pando y 2.290 en Rocha
 * por la misma ecografía mamaria, en el mismo año y en la misma moneda.
 *
 *   npx tsx tests/unit/hallazgo-ecografia-precio.verify.ts
 *
 * QUÉ MIDE. Las líneas de adjudicación del código de catálogo 41238 (ECOGRAFIA MAMARIA), su limpieza
 * —fuera los convenios cargados en el precio unitario y fuera los timbres profesionales—, la mediana
 * de 2026 por unidad ejecutora de ASSE, el precio del mismo proveedor por comprador, tres códigos
 * hermanos de ecografía, la serie de Pando y de Rocha, y cómo se compró (compra directa vs llamado).
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 1.640 líneas del código 41238 entre 2007 y 2026, las 1.640 en pesos: la trampa de la moneda
 *     nula no aplica acá.
 *   - Se descartan 6 líneas con unitario ≥ 20.000 pesos de hoy (convenio entero cargado en el
 *     unitario) y 31 con unitario ≤ 250 (timbre profesional: el valor legal es 170 en 2026 y 160 en
 *     2025). Quedan 1.603.
 *   - 2026: 126 líneas limpias en 12 unidades de ASSE. Mediana de 892 en Pando a 3.163 en Florida.
 *   - GASTROCLINICA S.R.L. (RUT 213506820011) en 2026, mismo código y misma moneda: 875 en Pando,
 *     2.290 en Rocha, 2.290,7 en San Carlos, 2.460 en RAP Colonia, 2.405-3.105 en RAP San José,
 *     3.105 en Florida y 3.105 en el Cerro.
 *   - Pando pagó 2.524 en 2024, 2.345 en 2025 y 875 en 2026, nominales, por el mismo estudio.
 *   - 91% de los pliegos hermanos de 2024-2026 son compra directa.
 *
 * QUÉ NO PRUEBA. Que el precio de Rocha sea abusivo. El feed no describe la prestación: no dice si
 * el 2.290 incluye informe radiológico, traslado o guardia y el 875 no. Volumen y empaquetado
 * explican parte: el 875 es una línea de un contrato de 5.660 estudios y el 2.290 sale de 56 compras
 * directas de unos tres estudios. ASSE compra descentralizado por unidad ejecutora y no existe un
 * precio ASSE único. Lo que limita esa explicación: la RAP Colonia compró MÁS volumen que Rocha, por
 * licitación abreviada, y paga 2.460.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const CODIGO = "41238";
const HERMANOS: Record<string, string> = {
  "104040": "ecografía abdominal de adulto",
  "104048": "ecografía de partes blandas",
  "42807": "ecografía testicular",
};
/** El mismo RUT vive con dos identificadores en el feed. Filtrar por uno solo pierde líneas. */
const GASTROCLINICA = ["R213506820011", "R/213506820011"];
const UI_HOY = 6.633093; // Unidad Indexada de agosto de 2026

interface Linea {
  ocid: string;
  fecha: Date;
  anio: number;
  comprador: string;
  proveedorId: string;
  proveedor: string;
  cantidad: number;
  unitario: number;
  moneda: string | null;
}

function mediana(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const fmt = (n: number): string => n.toLocaleString("es-UY", { maximumFractionDigits: 2 });

async function lineasDe(codigo: string, desde: Date): Promise<Linea[]> {
  const rel = mongoose.connection.db!.collection("releases");
  const filas = await rel
    .aggregate(
      [
        { $match: { "awards.items.classification.id": codigo, date: { $gte: desde } } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.id": codigo } },
        {
          $project: {
            _id: 0,
            ocid: 1,
            fecha: "$date",
            anio: { $year: "$date" },
            comprador: "$buyer.name",
            proveedorId: { $arrayElemAt: ["$awards.suppliers.id", 0] },
            proveedor: { $arrayElemAt: ["$awards.suppliers.name", 0] },
            cantidad: "$awards.items.quantity",
            unitario: "$awards.items.unit.value.amount",
            moneda: "$awards.items.unit.value.currency",
          },
        },
        { $match: { unitario: { $gt: 0 } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  return filas as unknown as Linea[];
}

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;

  const ui = new Map<string, number>();
  for (const r of (await db.collection("exchange_rates").find({}, { projection: { _id: 0, month: 1, ui: 1 } }).toArray()) as any[]) {
    if (typeof r.ui === "number" && r.ui > 0) ui.set(r.month, r.ui);
  }
  const aHoy = (l: Linea): number => {
    const mes = `${l.fecha.getUTCFullYear()}-${String(l.fecha.getUTCMonth() + 1).padStart(2, "0")}`;
    const u = ui.get(mes);
    return u ? l.unitario * (UI_HOY / u) : l.unitario;
  };

  console.log("=== el universo del código 41238 (ECOGRAFIA MAMARIA) ===");
  const crudas = await lineasDe(CODIGO, new Date("2000-01-01"));
  const monedas = new Map<string, number>();
  for (const l of crudas) monedas.set(l.moneda ?? "(nula)", (monedas.get(l.moneda ?? "(nula)") ?? 0) + 1);
  console.log(`  ${crudas.length} líneas · monedas: ${[...monedas].map(([m, n]) => `${m}=${n}`).join(", ")}`);
  console.log("  (esperado el 14/08/2026: 1.640 líneas, las 1.640 en pesos)");

  const convenios = crudas.filter((l) => aHoy(l) >= 20000);
  const timbres = crudas.filter((l) => l.unitario <= 250);
  const limpias = crudas.filter((l) => aHoy(l) < 20000 && l.unitario > 250);
  console.log(`  descartadas: ${convenios.length} con unitario ≥ 20.000 de hoy (convenio en el unitario) · ${timbres.length} con unitario ≤ 250 (timbre profesional)`);
  console.log(`  quedan ${limpias.length} líneas limpias (esperado 6, 31 y 1.603)`);

  console.log("\n=== 2026: mediana del MISMO estudio por unidad ejecutora ===");
  const l2026 = limpias.filter((l) => l.anio === 2026);
  const porComprador = new Map<string, number[]>();
  for (const l of l2026) porComprador.set(l.comprador, [...(porComprador.get(l.comprador) ?? []), l.unitario]);
  const orden = [...porComprador.entries()].map(([c, xs]) => [c, mediana(xs), xs.length] as const).sort((a, b) => a[1] - b[1]);
  console.log(`  ${l2026.length} líneas limpias en ${porComprador.size} unidades`);
  for (const [c, med, n] of orden) console.log(`  ${String(c).slice(0, 52).padEnd(52)} mediana $${fmt(med).padStart(9)} (n=${n})`);
  if (orden.length > 1) console.log(`  brecha punta a punta: ${(orden.at(-1)![1] / orden[0]![1]).toFixed(1)} veces`);

  console.log("\n=== el spread se sostiene con el MISMO vendedor: GASTROCLINICA S.R.L. en 2026 ===");
  const gastro = l2026.filter((l) => GASTROCLINICA.includes(l.proveedorId));
  const gPorComprador = new Map<string, number[]>();
  for (const l of gastro) gPorComprador.set(l.comprador, [...(gPorComprador.get(l.comprador) ?? []), l.unitario]);
  console.log(`  ${gastro.length} líneas en ${gPorComprador.size} unidades de ASSE`);
  for (const [c, xs] of [...gPorComprador.entries()].sort((a, b) => mediana(a[1]) - mediana(b[1]))) {
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    console.log(`  ${String(c).slice(0, 52).padEnd(52)} $${fmt(min)}${min === max ? "" : ` – $${fmt(max)}`} (n=${xs.length})`);
  }
  const todasGastro = limpias.filter((l) => GASTROCLINICA.includes(l.proveedorId));
  for (const id of GASTROCLINICA) {
    const soloUno = todasGastro.filter((l) => l.proveedorId === id).length;
    console.log(`  filtrando sólo por «${id}» quedan ${soloUno} de ${todasGastro.length} líneas del RUT en todo el corpus: se pierden ${todasGastro.length - soloUno}`);
  }
  console.log("  el mismo RUT vive con dos identificadores; nunca agrupar por nombre");

  console.log("\n=== no es sólo la mamaria: tres códigos hermanos, mediana 2026 por comprador ===");
  for (const [cod, nombre] of Object.entries(HERMANOS)) {
    const hs = (await lineasDe(cod, new Date("2026-01-01"))).filter((l) => l.unitario > 250 && aHoy(l) < 20000);
    const m = new Map<string, number[]>();
    for (const l of hs) m.set(l.comprador, [...(m.get(l.comprador) ?? []), l.unitario]);
    const top = [...m.entries()].map(([c, xs]) => [c, mediana(xs), xs.length] as const).sort((a, b) => a[1] - b[1]);
    console.log(`  ${cod} (${nombre}): ${hs.length} líneas en ${top.length} compradores`);
    for (const [c, v, n] of [top[0]!, ...top.filter(([c]) => /Rocha|Colonia/.test(c)), top.at(-1)!].filter(Boolean)) {
      console.log(`      ${String(c).slice(0, 48).padEnd(48)} $${fmt(v).padStart(9)} (n=${n})`);
    }
  }

  console.log("\n=== el precio se mueve dentro de una misma unidad ===");
  for (const clave of ["Pando", "Rocha"]) {
    const filas = limpias.filter((l) => l.comprador.includes(clave));
    const porAnio = new Map<number, number[]>();
    for (const l of filas) if (l.anio >= 2021) porAnio.set(l.anio, [...(porAnio.get(l.anio) ?? []), l.unitario]);
    const serie = [...porAnio.entries()].sort((a, b) => a[0] - b[0]).map(([a, xs]) => `${a}: $${fmt(mediana(xs))} (n=${xs.length})`);
    console.log(`  ${clave} → ${serie.join(" · ")}`);
  }

  console.log("\n=== cómo se compró: pliegos hermanos por ocid ===");
  const ocids2426 = [...new Set(limpias.filter((l) => l.anio >= 2024).map((l) => l.ocid))];
  const pliegos = await db
    .collection("releases")
    .aggregate(
      [
        { $match: { ocid: { $in: ocids2426 }, "tender.procurementMethodDetails": { $ne: null } } },
        { $group: { _id: "$tender.procurementMethodDetails", n: { $addToSet: "$ocid" } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const totalPliegos = (pliegos as any[]).reduce((a, p) => a + p.n.length, 0);
  for (const p of (pliegos as any[]).sort((a, b) => b.n.length - a.n.length)) {
    console.log(`  ${String(p._id).padEnd(24)} ${String(p.n.length).padStart(4)} ocid · ${((100 * p.n.length) / totalPliegos).toFixed(0)}%`);
  }
  console.log(`  ${totalPliegos} pliegos hermanos de 2024-2026 (esperado 187, de los que 171 = 91% son compra directa)`);

  const ocids2026 = [...new Set(limpias.filter((l) => l.anio === 2026).map((l) => l.ocid))];
  const conLlamado = await db.collection("releases").distinct("ocid", { ocid: { $in: ocids2026 }, tag: "tender" });
  console.log(`  de los ${ocids2026.length} ocid con línea de 41238 en 2026, sólo ${conLlamado.length} tienen algún release de llamado`);

  console.log("\n=== las dos puntas, para abrir en el sitio del Estado ===");
  console.log("  Pando: comprasestatales.gub.uy/consultas/detalle/id/1312418 (63 ecografías a $875, compra directa)");
  console.log("  Rocha: comprasestatales.gub.uy/consultas/detalle/id/1310750 (18 ecografías a $2.290, un solo participante)");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
