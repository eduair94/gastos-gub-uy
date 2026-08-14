#!/usr/bin/env tsx
/**
 * HALLAZGO «mides-cooperativas» — el MIDES es el único ministerio donde las sociedades comerciales
 * no reciben la mayor parte del dinero.
 *
 *   npx tsx tests/unit/hallazgo-mides-cooperativas.verify.ts
 *
 * QUÉ MIDE. Reparte el monto normalizado de cada release entre sus adjudicaciones en proporción al
 * total crudo de cada una, y de ahí entre sus proveedores; agrupa por inciso y por RUT en dígitos;
 * y clasifica al proveedor por la forma jurídica que lleva su nombre registral, evaluando primero la
 * regla de sin fines de lucro (cooperativa, fundación, asociación, obra social, congregación,
 * parroquia, sociedad de fomento) y después la comercial (S.A., S.R.L., Ltda., SAS, EIRL, y Cía),
 * para que «COOPERATIVA … LTDA» cuente como cooperativa. La misma regla, idéntica, a los catorce
 * ministerios.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Inciso 15 (MIDES), 2021-2026: 5.581 releases, 23.634.950.532 pesos, 1.354 adjudicatarios
 *     distintos. Ningún award del inciso tiene más de un proveedor (0 de 8.150), así que no hay
 *     reparto ambiguo.
 *   - 42,3% del dinero fue a entidades con forma jurídica sin fines de lucro en el nombre. El
 *     segundo ministerio es el MGAP con 10,0%; los otros doce quedan en 8,3% o menos.
 *   - El espejo: sólo el 20,9% del dinero del MIDES fue a sociedades comerciales. En los otros trece
 *     ministerios ese número no baja de 63,4% (MEC) y llega a 93,1% (Economía).
 *   - El 42,3% es un PISO: la regla clasifica por el nombre y el mayor proveedor del ministerio,
 *     OTRAS MANOS (RUT 216136900010, 1.844.215.526 pesos, 7,8% del inciso), no lleva ninguna palabra
 *     de forma jurídica. Está entre 473 proveedores con el 31,5% del dinero en esa situación.
 *   - No es de este gobierno ni del anterior: 45,8% en 2015, 41,9% en 2019, 50,8% en 2021, 42,8% en
 *     2024, 47,2% en 2025, 40,8% en 2026. Atraviesa tres gobiernos de dos partidos y es anterior a
 *     la redacción actual del num. 30, que es de diciembre de 2023.
 *   - El mecanismo se verificó a mano: de las 50 compras adjudicadas más grandes del inciso en 2026
 *     (3.374.385.225 pesos, el 75,2% del año), 44 son compra por excepción invocando «Art. 33, 30».
 *     El método de compra NO vive en el feed, por eso hubo que leer 50 fichas del Estado.
 *
 * QUÉ NO PRUEBA. Que la excepción salga más cara: los objetos no son comparables y esta ficha no
 * compara precios. La explicación la escribió el Parlamento: el num. 30 existe para que la
 * continuidad de la atención a personas en situación de calle no dependa del calendario de una
 * licitación, y nombra al MIDES y al MGAP, que son exactamente los dos primeros de la tabla.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const MINISTERIOS: Record<string, string> = {
  "2": "Presidencia",
  "3": "Defensa Nacional",
  "4": "Interior",
  "5": "Economía y Finanzas",
  "6": "Relaciones Exteriores",
  "7": "Ganadería, Agricultura y Pesca",
  "8": "Industria, Energía y Minería",
  "9": "Turismo",
  "10": "Transporte y Obras Públicas",
  "11": "Educación y Cultura",
  "12": "Salud Pública",
  "13": "Trabajo y Seguridad Social",
  "14": "Vivienda",
  "15": "Desarrollo Social",
};

const SIN_FINES = /(COOPERATIVA|FUNDACION|ASOCIACION|OBRA SOCIAL|CONGREGACION|PARROQUIA|SOCIEDAD DE FOMENTO)/;
/**
 * OJO: el feed escribe la misma forma societaria de muchas maneras («S.A.», «S. A.», «SA»,
 * «S. R. L.»). Se comparan sobre el nombre con los puntos quitados y los espacios colapsados, si no
 * «ABASTO DE CARNES SATURNO S. R. L.» queda sin clasificar y el porcentaje comercial sale hundido.
 */
const COMERCIAL = /\b(S\s?A|S\s?R\s?L|S\s?C\s?A|LTDA|LIMITADA|SAS|EIRL|Y CIA)\b/;

const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();

type Forma = "sin-fines" | "comercial" | "sin-forma";
function clasificar(nombre: string): Forma {
  const n = norm(nombre);
  if (SIN_FINES.test(n)) return "sin-fines"; // primero, para que «COOPERATIVA … LTDA» sea cooperativa
  if (COMERCIAL.test(n)) return "comercial";
  return "sin-forma";
}

const fmt = (n: number): string => Math.round(n).toLocaleString("es-UY");

interface Fila {
  inciso: string;
  rut: string;
  nombre: string;
  monto: number;
  anio: number;
}

async function main(): Promise<void> {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  console.log("=== barrido: incisos 2 a 15 (los catorce ministerios), 2021-2026 ===");
  const t0 = Date.now();
  const cursor = rel.find(
    {
      sourceYear: { $gte: 2021, $lte: 2026 },
      "amount.primaryAmount": { $gt: 0, $lt: 50e9 },
      "buyer.id": { $regex: "^(2|3|4|5|6|7|8|9|10|11|12|13|14|15)-" },
      "awards.0": { $exists: true },
    },
    { projection: { _id: 0, sourceYear: 1, "buyer.id": 1, "amount.primaryAmount": 1, "awards.items": 1, "awards.suppliers": 1 } }
  );

  const filas: Fila[] = [];
  let releases = 0;
  let awardsInciso15 = 0;
  let awardsMultiproveedor15 = 0;
  for await (const doc of cursor as any) {
    const inciso = String(doc.buyer?.id ?? "").split("-")[0]!;
    if (!MINISTERIOS[inciso]) continue;
    releases += 1;
    const total: number = doc.amount.primaryAmount;
    const awards: any[] = doc.awards ?? [];
    const crudos = awards.map((a) =>
      (a.items ?? []).reduce((s: number, it: any) => s + (Number(it?.quantity) || 0) * (Number(it?.unit?.value?.amount) || 0), 0)
    );
    const sumaCruda = crudos.reduce((a, b) => a + b, 0);
    for (let i = 0; i < awards.length; i += 1) {
      const a = awards[i]!;
      const sups: any[] = a.suppliers ?? [];
      if (inciso === "15") {
        awardsInciso15 += 1;
        if (sups.length > 1) awardsMultiproveedor15 += 1;
      }
      if (sups.length === 0) continue;
      const share = sumaCruda > 0 ? (crudos[i]! / sumaCruda) * total : total / awards.length;
      const porProveedor = share / sups.length;
      for (const s of sups) {
        const rut = String(s?.id ?? "").replace(/\D/g, "") || `?${s?.name ?? ""}`;
        filas.push({ inciso, rut, nombre: String(s?.name ?? ""), monto: porProveedor, anio: doc.sourceYear });
      }
    }
  }
  console.log(`  ${releases.toLocaleString("es-UY")} releases · ${filas.length.toLocaleString("es-UY")} filas de award por proveedor · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`  awards del inciso 15: ${awardsInciso15.toLocaleString("es-UY")} · con más de un proveedor: ${awardsMultiproveedor15} (esperado 8.150 y 0)`);

  console.log("\n=== dinero por ministerio y por forma jurídica del nombre ===");
  const porInciso = new Map<string, { total: number; sinFines: number; comercial: number; sinForma: number; ruts: Set<string> }>();
  for (const f of filas) {
    const v = porInciso.get(f.inciso) ?? { total: 0, sinFines: 0, comercial: 0, sinForma: 0, ruts: new Set<string>() };
    v.total += f.monto;
    v.ruts.add(f.rut);
    const c = clasificar(f.nombre);
    if (c === "sin-fines") v.sinFines += f.monto;
    else if (c === "comercial") v.comercial += f.monto;
    else v.sinForma += f.monto;
    porInciso.set(f.inciso, v);
  }
  const orden = [...porInciso.entries()].sort((a, b) => b[1].sinFines / b[1].total - a[1].sinFines / a[1].total);
  console.log("  ministerio                        sin fines de lucro   comercial   sin forma en el nombre");
  for (const [inc, v] of orden) {
    console.log(
      `  ${String(MINISTERIOS[inc]).padEnd(32)} ${((100 * v.sinFines) / v.total).toFixed(1).padStart(6)}%   ` +
        `${((100 * v.comercial) / v.total).toFixed(1).padStart(6)}%   ${((100 * v.sinForma) / v.total).toFixed(1).padStart(6)}%`
    );
  }

  const m15 = porInciso.get("15")!;
  console.log(`\n  MIDES (inciso 15): $${fmt(m15.total)} a ${m15.ruts.size.toLocaleString("es-UY")} adjudicatarios distintos`);
  console.log("  (esperado el 14/08/2026: 23.634.950.532 pesos y 1.354 adjudicatarios)");

  console.log("\n=== el 42,3% es un PISO: los que no llevan forma jurídica en el nombre ===");
  const f15 = filas.filter((f) => f.inciso === "15");
  const porRut = new Map<string, { nombre: string; monto: number }>();
  for (const f of f15) {
    const v = porRut.get(f.rut) ?? { nombre: f.nombre, monto: 0 };
    v.monto += f.monto;
    porRut.set(f.rut, v);
  }
  const sinForma = [...porRut.entries()].filter(([, v]) => clasificar(v.nombre) === "sin-forma");
  const montoSinForma = sinForma.reduce((a, [, v]) => a + v.monto, 0);
  console.log(`  ${sinForma.length} proveedores sin palabra de forma jurídica, con $${fmt(montoSinForma)} = ${((100 * montoSinForma) / m15.total).toFixed(1)}% del inciso`);
  for (const [rut, v] of sinForma.sort((a, b) => b[1].monto - a[1].monto).slice(0, 8)) {
    console.log(`    ${String(v.nombre).slice(0, 46).padEnd(46)} RUT ${rut.padEnd(13)} $${fmt(v.monto).padStart(14)} · ${((100 * v.monto) / m15.total).toFixed(1)}%`);
  }

  console.log("\n=== no es de este gobierno ni del anterior: serie larga del inciso 15 ===");
  const serie = await rel
    .aggregate(
      [
        { $match: { "amount.primaryAmount": { $gt: 0, $lt: 50e9 }, "buyer.id": { $regex: "^15-" }, "awards.0": { $exists: true } } },
        { $project: { sourceYear: 1, "amount.primaryAmount": 1, "awards.items": 1, "awards.suppliers": 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const porAnio = new Map<number, { total: number; sinFines: number }>();
  for (const d of serie as any[]) {
    // Misma atribución proporcional que arriba, para que la serie sea comparable con el corte.
    const awards: any[] = d.awards ?? [];
    const crudos = awards.map((a) =>
      (a.items ?? []).reduce((s: number, it: any) => s + (Number(it?.quantity) || 0) * (Number(it?.unit?.value?.amount) || 0), 0)
    );
    const sumaCruda = crudos.reduce((a, b) => a + b, 0);
    const v = porAnio.get(d.sourceYear) ?? { total: 0, sinFines: 0 };
    for (let i = 0; i < awards.length; i += 1) {
      const sups: any[] = awards[i]!.suppliers ?? [];
      if (sups.length === 0) continue;
      const share = sumaCruda > 0 ? (crudos[i]! / sumaCruda) * d.amount.primaryAmount : d.amount.primaryAmount / awards.length;
      const cuota = share / sups.length;
      for (const s of sups) {
        v.total += cuota;
        if (clasificar(String(s?.name ?? "")) === "sin-fines") v.sinFines += cuota;
      }
    }
    porAnio.set(d.sourceYear, v);
  }
  for (const anio of [2015, 2019, 2021, 2024, 2025, 2026]) {
    const v = porAnio.get(anio);
    if (v) console.log(`  ${anio}: ${((100 * v.sinFines) / v.total).toFixed(1)}% del dinero a entidades sin fines de lucro por nombre`);
  }

  console.log("\n=== el método de compra NO vive en el feed: por eso hubo que leer 50 fichas ===");
  const ocids15 = await rel.distinct("ocid", { sourceYear: { $gte: 2021, $lte: 2026 }, "buyer.id": { $regex: "^15-" } });
  const conMetodo = await rel.distinct("ocid", { ocid: { $in: ocids15 }, "tender.procurementMethodDetails": { $ne: null } });
  console.log(`  ${ocids15.length.toLocaleString("es-UY")} ocid del inciso 15 desde 2021 · con procurementMethodDetails en algún release hermano: ${conMetodo.length.toLocaleString("es-UY")} = ${((100 * conMetodo.length) / ocids15.length).toFixed(1)}%`);
  console.log("  Las cuatro fichas que muestran el mecanismo, para abrir en el sitio del Estado:");
  console.log("    /consultas/detalle/id/1323802 — Compra por Excepción 29/2026, «Art. 33, 30», OTRAS MANOS, un solo participante");
  console.log("    /consultas/detalle/id/1332102 — Compra por Excepción 260/2025, mismo numeral, OTRAS MANOS, un solo participante");
  console.log("    /consultas/detalle/id/1135850 — Licitación Pública 5/2024, misma unidad: OCHO organizaciones participantes");
  console.log("    /consultas/detalle/id/1160325 — Licitación Pública 13/2024: DIEZ organizaciones participantes");
  console.log("  El numeral, en impo.com.uy/bases/tocaf-tcr/150-2012/33 (no en tocaf2012, que está desactualizada).");

  console.log("\n=== trampa del organismo ===");
  const falso = await rel.countDocuments({ "buyer.id": "24-15" });
  console.log(`  existe un buyer.id 24-15 llamado «Ministerio de Desarrollo Social» con ${falso} releases: es el inciso 24 y queda fuera`);

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
