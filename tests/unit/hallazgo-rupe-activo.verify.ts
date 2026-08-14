#!/usr/bin/env tsx
/**
 * HALLAZGO «rupe-activo» — RESULTADO NEGATIVO, y se publica igual. El padrón obligatorio de
 * proveedores cierra: el 99,78% de lo adjudicado desde 2024 fue a proveedores activos. Lo que aporta
 * la ficha es el método: cruzar sin alinear las fechas inventa 75 veces más incumplimiento del que
 * hay.
 *
 *   npx tsx tests/unit/hallazgo-rupe-activo.verify.ts
 *
 * QUÉ MIDE. Baja los cortes mensuales del RUPE que ARCE publica en catalogodatos (datos abiertos,
 * sin registro), saca del corpus los pares de adjudicación × proveedor desde 2024, y para cada
 * adjudicación mira el estado del proveedor en el corte INMEDIATAMENTE ANTERIOR y en el
 * INMEDIATAMENTE POSTERIOR a su fecha. Ese alineamiento es todo el hallazgo: sin él, el mismo dato
 * devuelve 2.331 adjudicaciones irregulares en vez de 31. Los CSV se cachean en el directorio
 * temporal del sistema, así que la segunda corrida no vuelve a bajarlos.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 285.925 releases de adjudicación con proveedor desde el 1/1/2024 → 371.847 pares de
 *     adjudicación × proveedor con RUT uruguayo, sobre 13.736 RUT privados distintos más 460 RUT
 *     que son organismos públicos actuando como proveedores (8.998 pares, 2,42%).
 *   - Padrón: de 100.289 proveedores en enero de 2024 a 116.550 en junio de 2026. Cuatro estados:
 *     ACTIVO 57.462 · EN INGRESO 39.622 · BAJA DGI 19.428 · BAJA VOLUNTARIA 45.
 *   - CRUCE ALINEADO: 371.029 pares (99,78%) con estado ACTIVO en al menos uno de los dos cortes;
 *     213 (0,057%) no activos en ambos; 605 (0,163%) sin ficha en ninguno.
 *   - LA TRAMPA: cruzando el padrón de junio de 2026 contra las adjudicaciones de 2024 en adelante,
 *     sin alinear, aparecen 2.331 adjudicaciones a 365 empresas dadas de baja. Alineado son 31.
 *     Factor 75. La firma del artefacto está en la forma de la curva: 341 RUT con baja de DGI entre
 *     los adjudicatarios de 2024, 133 en 2025 y 7 en 2026 — la curva de «cerraron después».
 *
 * QUÉ NO PRUEBA, y acá gana la explicación inocente. El padrón es una FOTO DEL PRESENTE y las
 * adjudicaciones son PASADO: una empresa que le vendió al Estado en 2024 y cerró su RUT en 2025
 * aparece hoy como baja sin que nadie haya hecho nada, y eso explica 2.300 de las 2.331. La norma
 * exime de inscripción a las contrataciones por debajo del 35% del tope de compra directa.
 * «EN INGRESO» no es incumplir: el art. 12 del Decreto 202/024 pone en manos del organismo validar
 * la inscripción DESPUÉS de la apertura. Y una persona física que se convierte en SAS tiene dos RUT
 * y dos fichas: la vieja queda en baja y el feed puede guardar la vieja — que es exactamente lo que
 * pasó con el caso más grande, que se nos cayó al abrir la ficha oficial.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const CACHE = join(tmpdir(), "conlatuya-rupe-cortes");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
/** Once cortes: enero, abril, julio y octubre de 2024 y 2025; enero, abril y junio de 2026. */
const CORTES: Array<[number, number]> = [
  [2024, 1], [2024, 4], [2024, 7], [2024, 10],
  [2025, 1], [2025, 4], [2025, 7], [2025, 10],
  [2026, 1], [2026, 4], [2026, 6],
];
/**
 * 35% del tope de compra directa del año, dividido por 1,22 porque el corpus guarda montos SIN
 * impuestos y el tope legal es CON impuestos. 2024 usa el tope de 2025: es cota superior, o sea un
 * umbral más exigente, que señala menos casos y no más.
 */
const UMBRAL_INSCRIPCION: Record<number, number> = { 2024: 75451, 2025: 75451, 2026: 187623 };

interface Corte {
  clave: string;
  fecha: Date;
  estados: Map<string, string>;
}

async function urlsDelPadron(anio: number): Promise<Map<string, string>> {
  const res = await fetch(`https://catalogodatos.gub.uy/api/3/action/package_show?id=arce-registro-unico-de-proveedores-del-estado-rupe-${anio}`);
  const j: any = await res.json();
  const m = new Map<string, string>();
  for (const r of j?.result?.resources ?? []) {
    const mes = MESES.findIndex((x) => String(r.name ?? "").toLowerCase().includes(x));
    if (mes >= 0 && String(r.format ?? "").toUpperCase() === "CSV" && !/diccionario/i.test(String(r.name))) m.set(`${anio}-${String(mes + 1).padStart(2, "0")}`, r.url);
  }
  return m;
}

async function bajarCorte(clave: string, url: string): Promise<Map<string, string>> {
  mkdirSync(CACHE, { recursive: true });
  const archivo = join(CACHE, `${clave}-${createHash("sha1").update(url).digest("hex").slice(0, 8)}.csv`);
  if (!existsSync(archivo)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${clave}: HTTP ${res.status}`);
    writeFileSync(archivo, Buffer.from(await res.arrayBuffer()));
    await new Promise((r) => setTimeout(r, 1000));
  }
  const estados = new Map<string, string>();
  const texto = readFileSync(archivo, "utf8");
  let i = texto.indexOf("\n") + 1; // saltar el encabezado
  while (i < texto.length) {
    const fin = texto.indexOf("\n", i);
    const linea = texto.slice(i, fin === -1 ? texto.length : fin);
    i = fin === -1 ? texto.length : fin + 1;
    const c = linea.split(";");
    if (c.length < 7) continue;
    const rut = String(c[1] ?? "").replace(/\D/g, "");
    // El estado es la ÚLTIMA columna, no la séptima: hay domicilios que traen punto y coma adentro
    // y corren las columnas, y leyendo por índice el estado sale «Montevideo» o «Sin dato».
    if (rut) estados.set(rut, String(c.at(-1) ?? "").trim().replace(/\r$/, ""));
  }
  return estados;
}

async function main(): Promise<void> {
  console.log("=== los once cortes mensuales del padrón (datos abiertos, sin registro) ===");
  const urls = new Map<string, string>();
  for (const anio of [2024, 2025, 2026]) for (const [k, v] of await urlsDelPadron(anio)) urls.set(k, v);
  const cortes: Corte[] = [];
  for (const [anio, mes] of CORTES) {
    const clave = `${anio}-${String(mes).padStart(2, "0")}`;
    const url = urls.get(clave);
    if (!url) {
      console.log(`  ${clave}: no publicado`);
      continue;
    }
    const estados = await bajarCorte(clave, url);
    cortes.push({ clave, fecha: new Date(`${clave}-01T00:00:00.000Z`), estados });
    const cuenta = new Map<string, number>();
    for (const e of estados.values()) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
    console.log(
      `  ${clave}: ${estados.size.toLocaleString("es-UY")} proveedores` +
        (clave === "2026-06" ? ` · ${[...cuenta].sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e} ${n.toLocaleString("es-UY")}`).join(" · ")}` : "")
    );
  }
  cortes.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const ultimo = cortes.at(-1)!;

  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");

  console.log("\n=== los pares de adjudicación × proveedor desde el 1/1/2024 ===");
  const t0 = Date.now();
  const cursor = rel.find(
    { sourceYear: { $gte: 2024 }, "awards.suppliers.0": { $exists: true } },
    { projection: { _id: 0, ocid: 1, date: 1, sourceYear: 1, "buyer.name": 1, "amount.primaryAmount": 1, "awards.suppliers.id": 1, "awards.suppliers.name": 1 } }
  );

  interface Par { ocid: string; fecha: Date; anio: number; comprador: string; rut: string; nombre: string; publico: boolean; monto: number }
  const pares: Par[] = [];
  let releases = 0;
  for await (const doc of cursor as any) {
    releases += 1;
    const fecha: Date = doc.date instanceof Date ? doc.date : new Date(doc.date);
    const vistos = new Set<string>();
    for (const a of doc.awards ?? []) {
      for (const s of a.suppliers ?? []) {
        const id = String(s?.id ?? "");
        // R = RUT uruguayo · X, G, N, E = extranjeros · T = unidades del Estado
        const esPublico = /^T/i.test(id);
        if (!/^[RT]/i.test(id)) continue;
        const rut = id.replace(/\D/g, "");
        if (!rut) continue;
        const k = `${doc.ocid}|${rut}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        pares.push({
          ocid: doc.ocid,
          fecha,
          anio: doc.sourceYear,
          comprador: String(doc.buyer?.name ?? ""),
          rut,
          nombre: String(s?.name ?? ""),
          publico: esPublico,
          monto: Number(doc.amount?.primaryAmount) || 0,
        });
      }
    }
  }
  const privados = pares.filter((p) => !p.publico);
  const publicos = pares.filter((p) => p.publico);
  console.log(`  ${releases.toLocaleString("es-UY")} releases · ${pares.length.toLocaleString("es-UY")} pares · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`  RUT privados distintos: ${new Set(privados.map((p) => p.rut)).size.toLocaleString("es-UY")} · organismos públicos como proveedor: ${new Set(publicos.map((p) => p.rut)).size} RUT en ${publicos.length.toLocaleString("es-UY")} pares (${((100 * publicos.length) / pares.length).toFixed(2)}%)`);
  const porAnio = new Map<number, number>();
  for (const p of pares) porAnio.set(p.anio, (porAnio.get(p.anio) ?? 0) + 1);
  console.log(`  por año: ${[...porAnio].sort().map(([a, n]) => `${a} ${n.toLocaleString("es-UY")}`).join(" · ")}`);

  console.log("\n=== CRUCE ALINEADO EN EL TIEMPO: corte anterior y corte posterior a cada adjudicación ===");
  const estadoAlineado = (p: Par): "activo" | "no-activo" | "ausente" => {
    const antes = [...cortes].reverse().find((c) => c.fecha <= p.fecha);
    const despues = cortes.find((c) => c.fecha >= p.fecha);
    const ea = antes?.estados.get(p.rut);
    const ed = despues?.estados.get(p.rut);
    if (ea === "ACTIVO" || ed === "ACTIVO") return "activo";
    if (ea === undefined && ed === undefined) return "ausente";
    return "no-activo";
  };
  let activos = 0;
  let noActivos = 0;
  let ausentes = 0;
  const bajaAmbos: Par[] = [];
  const enIngreso: Par[] = [];
  const sinFicha: Par[] = [];
  // El denominador son los proveedores PRIVADOS: los organismos públicos que se venden entre sí no
  // están sujetos al padrón, y dejarlos adentro ensucia el porcentaje sin decir nada.
  for (const p of privados) {
    const e = estadoAlineado(p);
    if (e === "activo") activos += 1;
    else if (e === "ausente") {
      ausentes += 1;
      sinFicha.push(p);
    } else {
      noActivos += 1;
      const antes = [...cortes].reverse().find((c) => c.fecha <= p.fecha)?.estados.get(p.rut);
      const despues = cortes.find((c) => c.fecha >= p.fecha)?.estados.get(p.rut);
      if (antes === "EN INGRESO" || despues === "EN INGRESO") enIngreso.push(p);
      else bajaAmbos.push(p);
    }
  }
  console.log(`  sobre ${privados.length.toLocaleString("es-UY")} pares de proveedores privados:`);
  console.log(`  ACTIVO en al menos uno de los dos cortes: ${activos.toLocaleString("es-UY")} = ${((100 * activos) / privados.length).toFixed(2)}%`);
  console.log(`  no activos en ambos: ${noActivos} = ${((100 * noActivos) / privados.length).toFixed(3)}% · sin ficha en ambos: ${ausentes} = ${((100 * ausentes) / privados.length).toFixed(3)}%`);
  console.log(`  abriendo esos casos: ${bajaAmbos.length} adjudicaciones de ${new Set(bajaAmbos.map((p) => p.rut)).size} RUT con BAJA en ambos cortes,`);
  console.log(`  ${enIngreso.length} de ${new Set(enIngreso.map((p) => p.rut)).size} RUT en EN INGRESO (que la norma contempla y NO es incumplimiento), ${sinFicha.length} de ${new Set(sinFicha.map((p) => p.rut)).size} RUT sin ficha`);
  const porRutSinFicha = new Map<string, { nombre: string; n: number }>();
  for (const p of sinFicha) {
    const v = porRutSinFicha.get(p.rut) ?? { nombre: p.nombre, n: 0 };
    v.n += 1;
    porRutSinFicha.set(p.rut, v);
  }
  console.log("  los diez «sin ficha» con más adjudicaciones —hay que mirarlos antes de contarlos como incumplimiento—:");
  for (const [rut, v] of [...porRutSinFicha.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10)) {
    console.log(`    ${String(v.n).padStart(4)} adjudicaciones · RUT ${rut.padEnd(13)} · ${String(v.nombre).slice(0, 48)}`);
  }

  console.log("\n=== aplicando la exención por monto que la propia norma concede (art. 2, Decreto 202/024) ===");
  const obligado = (p: Par): boolean => p.monto >= (UMBRAL_INSCRIPCION[p.anio] ?? UMBRAL_INSCRIPCION[2026]!);
  const sobre = privados.filter(obligado);
  console.log(`  el ${((100 * sobre.length) / privados.length).toFixed(1)}% de los pares queda por encima del umbral de obligación`);
  for (const [etiqueta, lista] of [["dadas de baja", bajaAmbos], ["sin ficha", sinFicha], ["EN INGRESO", enIngreso]] as const) {
    const f = lista.filter(obligado);
    console.log(`  ${etiqueta.padEnd(14)} ${String(f.length).padStart(4)} adjudicaciones de ${String(new Set(f.map((p) => p.rut)).size).padStart(3)} empresas`);
  }
  console.log("  Los montos por proveedor son COTAS SUPERIORES: el monto normalizado es del release y");
  console.log("  cuando hay varios adjudicatarios atribuirle el total a cada uno infla todo.");

  console.log("\n=== LA TRAMPA: el mismo dato, cruzado contra el ÚLTIMO corte y sin alinear ===");
  const sinAlinear = pares.filter((p) => !p.publico && /^BAJA/.test(ultimo.estados.get(p.rut) ?? ""));
  console.log(`  cruzando el padrón de ${ultimo.clave} contra todas las adjudicaciones desde 2024:`);
  console.log(`  ${sinAlinear.length.toLocaleString("es-UY")} adjudicaciones a ${new Set(sinAlinear.map((p) => p.rut)).size} empresas «dadas de baja»`);
  console.log(`  alineado en el tiempo son ${bajaAmbos.length}: factor ${(sinAlinear.length / Math.max(1, bajaAmbos.length)).toFixed(0)}`);

  console.log("\n=== la firma del artefacto: la curva de «cerraron después» ===");
  const curva = new Map<number, Set<string>>();
  for (const p of sinAlinear) {
    if (!curva.has(p.anio)) curva.set(p.anio, new Set());
    curva.get(p.anio)!.add(p.rut);
  }
  for (const a of [...curva.keys()].sort()) console.log(`  ${a}: ${curva.get(a)!.size} RUT con baja de DGI entre los adjudicatarios`);
  const primero = cortes[0]!;
  let bajaEnero24 = 0;
  let siguenIgual = 0;
  let volvieron = 0;
  for (const [rut, e] of primero.estados) {
    if (!/^BAJA/.test(e)) continue;
    bajaEnero24 += 1;
    const hoy = ultimo.estados.get(rut);
    if (hoy === "ACTIVO") volvieron += 1;
    else if (hoy && /^BAJA/.test(hoy)) siguenIgual += 1;
  }
  console.log(`  el estado casi no se revierte: de los ${bajaEnero24.toLocaleString("es-UY")} con baja en ${primero.clave}, ${siguenIgual.toLocaleString("es-UY")} siguen igual en ${ultimo.clave} y sólo ${volvieron} (${((100 * volvieron) / bajaEnero24).toFixed(1)}%) volvieron a activo`);
  console.log("  Por eso el corte anterior y el posterior alcanzan como prueba.");

  console.log("\n=== dato lateral firme: lo que el padrón no alcanza por diseño legal ===");
  const extranjeros: any = (
    await rel
      .aggregate(
        [
          { $match: { sourceYear: { $gte: 2024 }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 }, "awards.suppliers.0": { $exists: true } } },
          {
            $project: {
              monto: "$amount.primaryAmount",
              extranjero: { $anyElementTrue: { $map: { input: { $reduce: { input: "$awards.suppliers", initialValue: [], in: { $concatArrays: ["$$value", "$$this"] } } }, as: "s", in: { $regexMatch: { input: { $ifNull: ["$$s.id", ""] }, regex: /^[XGNE]/ } } } } },
            },
          },
          { $group: { _id: "$extranjero", n: { $sum: 1 }, monto: { $sum: "$monto" } } },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  ).reduce((acc: any, g: any) => ({ ...acc, [g._id ? "ext" : "uy"]: g }), {});
  const ext = extranjeros.ext ?? { n: 0, monto: 0 };
  const uy = extranjeros.uy ?? { n: 0, monto: 0 };
  console.log(`  ${ext.n.toLocaleString("es-UY")} adjudicaciones por $${Math.round(ext.monto).toLocaleString("es-UY")} fueron a proveedores sin RUT uruguayo`);
  console.log(`  = ${((100 * ext.monto) / (ext.monto + uy.monto)).toFixed(1)}% de lo adjudicado en el período, y la norma los EXIME del padrón`);

  console.log("\n=== lo que el padrón abierto NO publica, y es lo que más importa ===");
  console.log("  Los arts. 5 y 6 del Decreto 202/024 ponen dentro del RUPE las sanciones firmes y las");
  console.log("  inhibiciones o prohibiciones de contratar. El archivo mensual sólo trae los cuatro estados");
  console.log("  administrativos. Con datos abiertos NO se puede responder si alguien le adjudicó a un");
  console.log("  proveedor sancionado o inhibido: eso es un pedido de acceso a la información.");

  console.log("\n=== antes de escribir un nombre, abrir la ficha del gobierno ===");
  console.log("  Compra 1099770 (Intendencia de Colonia): era el caso mayor por monto y SE CAYÓ. La ficha");
  console.log("  oficial adjudica a HECTOR JAVIER BELEN DUPUY SAS, RUT 060126020012, activo en el padrón;");
  console.log("  el feed guardó el RUT de la persona física, 060056190011, que sí está en baja.");
  console.log("  Compra 1060457 (ASSE, Instituto Nacional de Reumatología): se sostiene. COOPERATIVA DE");
  console.log("  TRABAJO COMPROMISO SOCIAL, RUT 215146320019, sin ficha en ninguno de los once cortes.");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
