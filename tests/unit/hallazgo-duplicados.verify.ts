#!/usr/bin/env tsx
/**
 * HALLAZGO «duplicados» — el identificador del proveedor cambió de forma en 2026 y NUESTRO sitio
 * contó 6.039 empresas de más.
 *
 *   npx tsx tests/unit/hallazgo-duplicados.verify.ts
 *
 * QUÉ MIDE. Nuestra colección `supplier_patterns` —la que alimenta el conteo de proveedores y el
 * ranking del sitio— agrupa por la cadena literal de `awards[].suppliers[].id`. En 2026 el feed
 * OCDS de ARCE dejó de escribir la barra en ese identificador («R/210002980010» pasó a
 * «R210002980010»), sin retropoblar la serie histórica, así que la misma empresa quedó partida en
 * dos fichas. El script cuenta las fichas del sitio, las cuenta otra vez normalizando el
 * identificador a alfanuméricos, mide el corte año por año en el feed, y muestra el caso testigo.
 *
 * ESTO NOS APUNTA A NOSOTROS. La mitad del defecto es del emisor (cambió el formato sin avisar ni
 * retropoblar); la otra mitad es nuestra: agrupamos por la cadena literal, y por eso publicamos
 * 43.000 proveedores donde hay 36.961, y la página de una empresa —que consulta el identificador
 * exacto— no muestra sus contratos de 2026.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 43.000 fichas en `supplier_patterns`; 36.961 identificadores distintos una vez normalizados.
 *     6.039 fichas de más, el 14,0%.
 *   - La forma del identificador por año: 2023, prácticamente todas con barra; 2025, arranca la
 *     transición; 2026, ninguna con barra.
 *   - 5.856 RUTs con dos fichas. En la ficha desprendida hay 78.726 millones de pesos brutos;
 *     descontando las filas contaminadas por el artefacto de monto a tanto alzado ya documentado
 *     (promedio por contrato de 2026 más de veinte veces el histórico) quedan 38.184 millones.
 *   - 49 de las 100 primeras filas del ranking del sitio son la mitad de un RUT partido.
 *   - `parties[].identifier` —el bloque del estándar OCDS que existe justamente para que una
 *     empresa siga siendo la misma a lo largo de los años— está vacío en los 2.184.332 registros.
 *
 * QUÉ NO PRUEBA. Ninguna norma prohíbe cambiar el formato de un identificador y acá no hay ilícito.
 * El monto bruto de 78.726 millones está contaminado por el artefacto de monto ya conocido, por eso
 * la cifra publicable es la conservadora. En los ejemplos extranjeros (TRAFIGURA, VITOL) no se pudo
 * controlar el error de moneda nula: sus montos pueden estar contados como pesos. Y 2026 está
 * deformado por la falta de un canal del feed, así que ninguna cifra de ese año se compara contra
 * años previos.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

/** El identificador sin puntuación: es lo único que hay que hacer para volver a unir las dos fichas. */
function normalizar(id: string): string {
  return String(id ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** «R/210002980010» → «A1/#12»: el perfil de formas, para ver el corte de un vistazo. */
function forma(id: string): string {
  return String(id ?? "")
    .replace(/[A-Za-z]+/g, (m) => `A${m.length}`)
    .replace(/[0-9]+/g, (m) => `#${m.length}`);
}

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");
  const sp = db.collection("supplier_patterns");

  console.log("=== cuántos proveedores publica el sitio, y cuántos son ===");
  const fichas = (await sp
    .find({}, { projection: { supplierId: 1, name: 1, totalValue: 1, totalContracts: 1, years: 1 } })
    .toArray()) as any[];
  const porRut = new Map<string, any[]>();
  for (const f of fichas) {
    const k = normalizar(f.supplierId);
    if (!porRut.has(k)) porRut.set(k, []);
    porRut.get(k)!.push(f);
  }
  console.log(`  ${fichas.length.toLocaleString("es-UY")} fichas en supplier_patterns (es el número que publica el sitio)`);
  console.log(`  ${porRut.size.toLocaleString("es-UY")} identificadores distintos una vez normalizados`);
  console.log(`  ${(fichas.length - porRut.size).toLocaleString("es-UY")} fichas de más · ${((100 * (fichas.length - porRut.size)) / fichas.length).toFixed(1)}%`);

  console.log("\n=== perfil de formas del identificador en supplier_patterns ===");
  const formas = new Map<string, number>();
  for (const f of fichas) formas.set(forma(f.supplierId), (formas.get(forma(f.supplierId)) ?? 0) + 1);
  for (const [k, n] of [...formas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`  ${String(n).padStart(6)} fichas · ${k}`);
  }

  console.log("\n=== el corte, en el feed: qué parte de las líneas adjudicación-proveedor lleva barra ===");
  for (const anio of [2022, 2023, 2024, 2025, 2026]) {
    const r: any = (
      await rel
        .aggregate(
          [
            { $match: { tag: "award", sourceYear: anio } },
            { $unwind: "$awards" },
            { $unwind: "$awards.suppliers" },
            {
              $group: {
                _id: null,
                lineas: { $sum: 1 },
                conBarra: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ["$awards.suppliers.id", ""] }, regex: "/" } }, 1, 0] } },
              },
            },
          ],
          { allowDiskUse: true }
        )
        .toArray()
    )[0];
    if (!r) { console.log(`  ${anio}: sin líneas`); continue; }
    console.log(`  ${anio}: ${String(r.conBarra).padStart(7)} de ${String(r.lineas).padStart(7)} líneas con barra (${((100 * r.conBarra) / r.lineas).toFixed(1).padStart(5)}%)`);
  }

  console.log("\n=== los RUTs partidos en dos fichas, y cuánta plata quedó en la ficha desprendida ===");
  let rutsPartidos = 0;
  let bruto = 0;
  let brutoFichas = 0;
  let conservador = 0;
  let conservadorFichas = 0;
  let contaminadas = 0;
  for (const [, fs] of porRut) {
    if (fs.length < 2) continue;
    const vieja = fs.find((f) => String(f.supplierId).includes("/"));
    const nuevas = fs.filter((f) => !String(f.supplierId).includes("/"));
    // Sólo el corte de 2026: una ficha histórica CON barra y otra SIN. Los operadores de
    // combustible tienen dos identificadores por otro motivo y no entran acá.
    if (!vieja || !nuevas.length) continue;
    rutsPartidos++;
    const promViejo = vieja.totalContracts ? vieja.totalValue / vieja.totalContracts : 0;
    for (const n of nuevas) {
      bruto += n.totalValue ?? 0;
      brutoFichas++;
      const promNuevo = n.totalContracts ? n.totalValue / n.totalContracts : 0;
      // El artefacto de monto a tanto alzado ya documentado: si el promedio por contrato explota,
      // la fila no se cuenta, para no atribuirle al corte del identificador plata que es otro bug.
      if (promViejo > 0 && promNuevo > 20 * promViejo) { contaminadas++; continue; }
      conservador += n.totalValue ?? 0;
      conservadorFichas++;
    }
  }
  console.log(`  ${rutsPartidos.toLocaleString("es-UY")} RUTs tienen hoy una ficha histórica «R/…» y otra «R…»`);
  console.log(`  Bruto: $${Math.round(bruto / 1e6).toLocaleString("es-UY")} millones en ${brutoFichas.toLocaleString("es-UY")} fichas desprendidas`);
  console.log(`  Conservador (sin las ${contaminadas} filas del artefacto de monto): $${Math.round(conservador / 1e6).toLocaleString("es-UY")} millones en ${conservadorFichas.toLocaleString("es-UY")} fichas`);

  console.log("\n=== las fichas con actividad en 2026: cuántas son un duplicado ===");
  const con2026 = fichas.filter((f) => Array.isArray(f.years) && f.years.includes(2026));
  const dup2026 = con2026.filter((f) => (porRut.get(normalizar(f.supplierId))?.length ?? 1) > 1);
  console.log(`  ${dup2026.length.toLocaleString("es-UY")} de ${con2026.length.toLocaleString("es-UY")} fichas con actividad en 2026 duplican una empresa que ya tenía ficha (${((100 * dup2026.length) / con2026.length).toFixed(0)}%)`);

  console.log("\n=== el ranking del sitio: cuántas de las 100 primeras filas son media empresa ===");
  const top = [...fichas].sort((a, b) => (b.totalValue ?? 0) - (a.totalValue ?? 0)).slice(0, 100);
  const partidasEnTop = top.filter((f) => (porRut.get(normalizar(f.supplierId))?.length ?? 1) > 1);
  console.log(`  ${partidasEnTop.length} de las 100 primeras filas por monto son la mitad de un RUT partido`);
  for (const f of partidasEnTop.slice(0, 4)) {
    const hermanas = porRut.get(normalizar(f.supplierId))!;
    const suma = hermanas.reduce((a: number, h: any) => a + (h.totalValue ?? 0), 0);
    console.log(
      `  ${String(f.name ?? "").slice(0, 34).padEnd(34)} figura con $${Math.round((f.totalValue ?? 0) / 1e6).toLocaleString("es-UY")} millones · ` +
      `entre sus ${hermanas.length} fichas son $${Math.round(suma / 1e6).toLocaleString("es-UY")} millones`
    );
  }

  console.log("\n=== el caso testigo: TEYMA URUGUAY, el mismo RUT en dos formas ===");
  for (const id of ["R/211096770013", "R211096770013"]) {
    const n = await rel.countDocuments({ "awards.suppliers.id": id });
    const anios = await rel.distinct("sourceYear", { "awards.suppliers.id": id });
    const nombre = await rel.findOne({ "awards.suppliers.id": id }, { projection: { "awards.suppliers": 1 } });
    const quien = (nombre as any)?.awards?.flatMap((a: any) => a.suppliers ?? []).find((s: any) => s.id === id)?.name;
    console.log(`  ${id.padEnd(15)} · ${String(n).padStart(4)} contratos · años ${(anios as number[]).sort().join(", ")} · ${quien ?? "—"}`);
  }
  console.log("  Mismo RUT (211096770013) y misma razón social: cualquiera que normalice el identificador puede unirlas.");

  console.log("\n=== el bloque del estándar que evitaría todo esto ===");
  const conIdentifier = await rel.countDocuments({ "parties.identifier.id": { $exists: true } });
  const totalReleases = await rel.estimatedDocumentCount();
  console.log(`  parties[].identifier presente en ${conIdentifier} de ${totalReleases.toLocaleString("es-UY")} registros.`);
  console.log("  El OCDS 1.1 lo prevé con `scheme` (UY-RUT) e `id` justamente para que una empresa siga siendo la misma.");

  console.log("\n=== dos patrones que NO son este problema y conviene distinguir ===");
  let nombresDistintos = 0;
  for (const [, fs] of porRut) {
    if (fs.length < 2) continue;
    // El nombre se compara sin puntuación ni espacios: «TEYMA URUGUAY  S.A.» y «TEYMA URUGUAY S A»
    // son la misma razón social escrita distinto, y contarlas como dos nombres sería inventar casos.
    const nombres = new Set(fs.map((f) => normalizar(f.name ?? "")).filter(Boolean));
    if (nombres.size > 1) nombresDistintos++;
  }
  console.log(`  ${nombresDistintos} RUTs con dos nombres distintos: en su mayoría cambios societarios verificables (BULL URUGUAY → ATOS, SODEXO SVC → PLUXEE).`);
  for (const nombre of ["TRAFIGURA", "VITOL"]) {
    const filas = fichas.filter((f) => String(f.name ?? "").toUpperCase().startsWith(nombre));
    console.log(
      `  ${nombre}: ${filas.length} fichas · ` +
      filas.map((f) => `${f.supplierId} $${Math.round((f.totalValue ?? 0) / 1e6).toLocaleString("es-UY")}M`).join(" · ")
    );
  }
  console.log("  El segundo identificador de los operadores de combustible es un número de secuencia interno de ARCE, no el corte de 2026.");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
