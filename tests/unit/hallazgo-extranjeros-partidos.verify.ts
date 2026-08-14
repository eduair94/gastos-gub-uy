#!/usr/bin/env tsx
/**
 * HALLAZGO «extranjeros-partidos» — nueve proveedores de combustible de ANCAP figuran con dos
 * identificadores distintos, y con eso la mitad del dinero extranjero queda partido en dos, también
 * en NUESTRO ranking de proveedores.
 *
 *   npx tsx tests/unit/hallazgo-extranjeros-partidos.verify.ts
 *
 * QUÉ MIDE. Sobre supplier_patterns —la colección que alimenta nuestro propio ranking— separa los
 * proveedores sin RUT uruguayo (prefijo X o E, los que la ficha oficial rotula «Empresa
 * Extranjera»), pliega primero los identificadores que son iguales una vez quitada la puntuación
 * (ese es el arreglo del OTRO defecto conocido, el cambio de formato de 2026 que borró la barra), y
 * recién después agrupa por nombre normalizado para contar cuántas empresas siguen partidas. Cruza
 * los identificadores cortos contra el RUPE, el registro que publica la propia ARCE.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 1.408 identificadores extranjeros con 417,28 mil millones de pesos = 25,3% de todo el corpus.
 *   - Aun después de plegar la puntuación quedan 39 empresas partidas en 86 identificadores, con
 *     222,35 mil millones = 53,3% de la plata extranjera y 13,5% de todo el corpus.
 *   - Nueve empresas son el 99% de esa plata (220,17 mil millones) y las nueve le venden crudo o
 *     combustible a ANCAP: TRAFIGURA 85,90 · VITOL 68,50 · GUNVOR 18,65 · SHELL WESTERN 17,07 ·
 *     SOCAR 10,15 · SAHARA 7,66 · PETROBRAS 5,12 · YPF 4,02 · GEOGAS 3,10.
 *   - 28 identificadores tienen forma X/{PAÍS}2xxxxx (seis dígitos entre 200052 y 205379) y suman
 *     59,49 mil millones. Ninguno de esos 28 números figura en el RUPE; el otro identificador de
 *     cada par sí coincide dígito a dígito con el registro.
 *   - El efecto sobre lo que publicamos: TRAFIGURA está en el puesto 1 y otra vez en el 38; VITOL en
 *     el 2 y otra vez en el 18; GUNVOR en el 15 y otra vez en el 1.311.
 *   - parties[].identifier —el campo del estándar OCDS que resolvería esto de raíz— está vacío en
 *     los 2.184.332 registros del corpus.
 *
 * QUÉ NO PRUEBA. Que a alguna de estas empresas le faltara la inscripción: las nueve están hoy en el
 * RUPE, activas. La explicación que compite es fuerte: el identificador impreso en una adjudicación
 * es el que estaba vigente el día en que se adjudicó, y reescribir un expediente viejo para ponerle
 * un número nuevo sería alterar un documento histórico. En ocho de los nueve pares los dos
 * identificadores no se superponen nunca y el número corto viene primero. Lo que se rompe es la
 * clave con la que se juntan, y esa clave la elegimos nosotros.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const MMM = (n: number): string => (n / 1e9).toLocaleString("es-UY", { maximumFractionDigits: 2 });

/** Extranjero: X seguido de tres letras de país (con o sin barra) o E seguido de barra. */
const ES_EXTRANJERO = /^(X\/?[A-Z]{3}|E\/)/i;
/** El número asignado, no el registrado: X/{PAÍS} + un 2 y cinco dígitos. */
const CORTO = /^X\/?[A-Z]{3}2\d{5}$/i;

const soloAlfanum = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Normalización de nombre: sin diacríticos, sin puntuación, siglas pegadas, cortada a `corte`. */
function normNombre(s: string, corte: number, sinSufijos = false): string {
  let n = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  // «S A», «S R L», «P T E» → «SA», «SRL», «PTE»: si no, dos escrituras del mismo nombre se separan.
  n = n.replace(/\b(?:[A-Z]\s){1,4}[A-Z]\b/g, (m) => m.replace(/\s/g, ""));
  if (sinSufijos) n = n.replace(/\b(SA|SRL|SAS|LTDA|LTD|PTE|INC|BV|NV|GMBH|PLC|CORP|LLC)\b/g, "").replace(/\s+/g, " ").trim();
  return n.slice(0, corte);
}

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;

  console.log("=== supplier_patterns, la colección que alimenta nuestro ranking ===");
  const todos = (await db
    .collection("supplier_patterns")
    .find({}, { projection: { _id: 0, supplierId: 1, name: 1, totalValue: 1 } })
    .toArray()) as unknown as Array<{ supplierId: string; name: string; totalValue: number }>;
  const totalCorpus = todos.reduce((a, s) => a + (s.totalValue || 0), 0);
  console.log(`  ${todos.length.toLocaleString("es-UY")} fichas · ${MMM(totalCorpus)} mil millones de pesos`);

  const extranjeros = todos.filter((s) => ES_EXTRANJERO.test(String(s.supplierId ?? "")));
  const totalExt = extranjeros.reduce((a, s) => a + (s.totalValue || 0), 0);
  console.log(`  sin RUT uruguayo (prefijo X o E): ${extranjeros.length.toLocaleString("es-UY")} identificadores · ${MMM(totalExt)} mil millones = ${((100 * totalExt) / totalCorpus).toFixed(1)}% del corpus`);
  console.log("  (esperado el 14/08/2026: 1.408 identificadores, 417,28 mil millones, 25,3%)");

  console.log("\n=== paso 1: plegar el OTRO defecto, el de la barra que 2026 borró ===");
  const plegado = new Map<string, { ids: Set<string>; name: string; total: number }>();
  for (const s of extranjeros) {
    const k = soloAlfanum(String(s.supplierId));
    const v = plegado.get(k) ?? { ids: new Set<string>(), name: s.name, total: 0 };
    v.ids.add(String(s.supplierId));
    v.total += s.totalValue || 0;
    if (String(s.name ?? "").length > String(v.name ?? "").length) v.name = s.name;
    plegado.set(k, v);
  }
  const colapsados = extranjeros.length - plegado.size;
  console.log(`  ${extranjeros.length} identificadores → ${plegado.size} después de quitar puntuación (${colapsados} colapsan por el cambio de formato)`);

  console.log("\n=== paso 2: cuántas empresas siguen partidas, agrupando por nombre ===");
  for (const [etiqueta, corte, sinSuf] of [
    ["exacta normalizada", 200, false],
    ["sin sufijos societarios", 200, true],
    ["cortada a 22 caracteres", 22, false],
  ] as const) {
    const porNombre = new Map<string, { ids: Set<string>; total: number; name: string }>();
    for (const [, v] of plegado) {
      const nombre = String(v.name ?? "");
      if (!nombre || /^unknown$/i.test(nombre)) continue;
      const k = normNombre(nombre, corte, sinSuf);
      if (!k) continue;
      const g = porNombre.get(k) ?? { ids: new Set<string>(), total: 0, name: nombre };
      for (const id of v.ids) g.ids.add(id);
      g.total += v.total;
      porNombre.set(k, g);
    }
    const partidas = [...porNombre.values()].filter((g) => g.ids.size > 1);
    const monto = partidas.reduce((a, g) => a + g.total, 0);
    const ids = partidas.reduce((a, g) => a + g.ids.size, 0);
    console.log(
      `  ${etiqueta.padEnd(26)} ${String(partidas.length).padStart(3)} empresas partidas en ${String(ids).padStart(3)} identificadores · ` +
        `${MMM(monto).padStart(7)} mil millones = ${((100 * monto) / totalExt).toFixed(1)}% de lo extranjero`
    );
    if (corte === 22 && !sinSuf) {
      console.log(`  → esa última es la buena (el feed trunca nombres) y vale el ${((100 * monto) / totalCorpus).toFixed(1)}% de TODO el corpus`);
      console.log("\n=== las nueve empresas que son el 99% de esa plata ===");
      let acum = 0;
      for (const g of partidas.sort((a, b) => b.total - a.total).slice(0, 9)) {
        acum += g.total;
        console.log(`  ${String(g.name).slice(0, 34).padEnd(34)} ${MMM(g.total).padStart(6)} mm · ${[...g.ids].sort().join(" + ")}`);
      }
      console.log(`  las nueve: ${MMM(acum)} mil millones = ${((100 * acum) / monto).toFixed(0)}% de lo partido y ${((100 * acum) / totalExt).toFixed(1)}% de lo extranjero`);
    }
  }

  console.log("\n=== el patrón: identificadores X/{PAÍS}2xxxxx que el RUPE no conoce ===");
  const cortos = extranjeros.filter((s) => CORTO.test(String(s.supplierId)));
  const montoCortos = cortos.reduce((a, s) => a + (s.totalValue || 0), 0);
  const digitos = cortos.map((s) => String(s.supplierId).replace(/\D/g, ""));
  const rupe = db.collection("rupe_registry");
  const enRupe: string[] = [];
  for (const d of [...new Set(digitos)]) if (await rupe.countDocuments({ rut: d }, { limit: 1 })) enRupe.push(d);
  console.log(`  ${cortos.length} identificadores cortos · ${MMM(montoCortos)} mil millones · números entre ${Math.min(...digitos.map(Number))} y ${Math.max(...digitos.map(Number))}`);
  console.log(`  de esos ${new Set(digitos).size} números, en el RUPE hay ${enRupe.length} (esperado 0)`);
  const noUy = await rupe.countDocuments({ pais: { $ne: "URUGUAY" } });
  console.log(`  el RUPE publicado tiene ${(await rupe.estimatedDocumentCount()).toLocaleString("es-UY")} registros, ${noUy.toLocaleString("es-UY")} no uruguayos`);
  console.log("  y la identificación extranjera más corta que trae es de ocho dígitos");

  console.log("\n=== el otro identificador de cada par SÍ coincide con el registro ===");
  for (const [empresa, rut, pais] of [
    ["VITOL S.A.", "116346864", "Suiza"],
    ["TRAFIGURA PTE LTD", "199601595", "Singapur"],
    ["GUNVOR", "112675659", "—"],
    ["SOCAR", "113990112", "—"],
    ["GEOGAS", "106480892", "—"],
    ["YPF", "30546689979", "Argentina"],
    ["SHELL WESTERN", "106835834", "Bahamas"],
  ] as const) {
    const f: any = await rupe.findOne({ rut }, { projection: { _id: 0, rut: 1, denominacionSocial: 1, pais: 1, estado: 1 } });
    console.log(`  ${empresa.padEnd(20)} ${rut.padEnd(12)} → ${f ? `${String(f.denominacionSocial).slice(0, 28)} · ${f.pais} · ${f.estado}` : "NO está en el RUPE"}  (esperado ${pais})`);
  }
  console.log("  En tres casos con montos grandes las letras de país del número corto no coinciden con el");
  console.log("  registro: TRAFIGURA figura como CHE y el RUPE dice Singapur; SAHARA como CHE y el RUPE");
  console.log("  dice Reino Unido; SHELL WESTERN como BRB y el RUPE dice Bahamas.");

  console.log("\n=== el efecto sobre NUESTRO ranking ===");
  const ranking = [...todos].sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0));
  for (const clave of ["TRAFIGURA", "VITOL", "GUNVOR"]) {
    const puestos = ranking
      .map((s, i) => [s, i + 1] as const)
      .filter(([s]) => normNombre(String(s.name ?? ""), 22).startsWith(clave))
      .map(([s, p]) => `${p} (${s.supplierId})`);
    console.log(`  ${clave.padEnd(10)} aparece en los puestos ${puestos.join(" y ")}`);
  }

  console.log("\n=== el campo del estándar que cerraría el problema está vacío ===");
  const rel = db.collection("releases");
  const conIdentifier = await rel.countDocuments({ "parties.identifier": { $exists: true, $ne: null } }, { limit: 1 });
  console.log(`  releases con parties[].identifier: ${conIdentifier} de ${(await rel.estimatedDocumentCount()).toLocaleString("es-UY")}`);

  console.log("\n=== control de moneda: ninguno de estos montos es un dólar contado como peso ===");
  const ids18 = extranjeros
    .filter((s) => /TRAFIGURA|VITOL|GUNVOR|SHELL WESTERN|SOCAR|SAHARA|PETROBRAS GLOBAL|^YPF|GEOGAS/i.test(normNombre(String(s.name ?? ""), 40)))
    .map((s) => s.supplierId);
  const monedas = await rel
    .aggregate(
      [
        { $match: { "awards.suppliers.id": { $in: ids18 } } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.suppliers.id": { $in: ids18 } } },
        { $group: { _id: { $ifNull: ["$awards.items.unit.value.currency", null] }, n: { $sum: 1 } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  console.log(`  ${ids18.length} identificadores · ítems por moneda: ${(monedas as any[]).map((m) => `${m._id ?? "(nula)"}=${m.n}`).join(", ")}`);

  console.log("\n=== contraste en la fuente, dos fichas del Estado ===");
  console.log("  /consultas/detalle/id/i294674 (06/09/2019): «VITOL S.A. (Empresa Extranjera CHE201056)»");
  console.log("  /consultas/detalle/id/i325405 (19/02/2021): «Empresa Extranjera CHECHE-116.346.864»");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
