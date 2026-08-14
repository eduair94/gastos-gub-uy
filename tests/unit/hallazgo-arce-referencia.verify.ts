#!/usr/bin/env tsx
/**
 * HALLAZGO «arce-referencia» — un techo legal para un solo producto: los precios de referencia que
 * ARCE casi nunca publicó, y que el Presupuesto borró el 1º de enero de 2026.
 *
 *   npx tsx tests/unit/hallazgo-arce-referencia.verify.ts
 *   npx tsx tests/unit/hallazgo-arce-referencia.verify.ts --sin-red   (salta gub.uy y catalogodatos)
 *
 * QUÉ MIDE. El hallazgo es una AUSENCIA, y se mide por los dos lados. Del lado del documento: el
 * archivo completo de comunicados de ARCE y los datasets que publica en el catálogo nacional de
 * datos abiertos. Del lado del corpus: el tamaño del catálogo único que el techo decía cubrir, el
 * gasto que pasó formalmente por debajo de él, y cuántos expedientes lo invocan. NO se golpea
 * comprasestatales.gub.uy en ningún momento.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Archivo COMPLETO de comunicados de ARCE: 57 entradas. De esas 57, exactamente 2 son precios de
 *     referencia, y las 2 son del mismo producto: leche fresca (Resolución MEF 104/023 de mayo de
 *     2023 y 162/024 de junio de 2024). Una tercera entrada indexada por buscadores devuelve 403.
 *     Las otras 55 son convenios marco, prórrogas, planes anuales, SICE y RUPE: ninguna trae precio.
 *   - El precio vive DENTRO de un .xlsx que es un formulario de pedido: $42,34/L «entregada por el
 *     proveedor» y $37,26/L «a retirar en planta». No hay CSV, ni API, ni serie histórica.
 *   - ARCE tampoco lo calcula: el PDF adjunto es la Resolución MEF 162/024, que fija los precios
 *     MÁXIMOS DE VENTA de la leche tarifada en todo el país. ARCE lo retransmite.
 *   - Datos abiertos: la API del catálogo devuelve 10 datasets de ARCE (RUPE 2020-2026, datos
 *     históricos de compras, publicaciones del sitio y catálogo de artículos). CERO de precios.
 *   - Catálogo único: 90.368 artículos; 80.788 bienes; 74.770 vigentes. ARCE publicó un precio para
 *     UN producto = 0,001% del catálogo.
 *   - Gasto en BIENES 2021-2025 (el universo del art. 318 de la LUC): 215.682.798.432 UYU en
 *     1.001.565 líneas de adjudicación. Rubro alimentos (universo del art. 33 D)16): 1.823 artículos
 *     en el catálogo, 852 efectivamente comprados, 17.766.912.252 UYU en 96.172 líneas.
 *   - NADIE invoca el techo: sobre 2,18 millones de expedientes, «precio máximo de adquisición» 0 ·
 *     «precio testigo» 0 · «precios máximos» 0. Los 26 que sí mencionan «precio de referencia» o
 *     «precio máximo» se leyeron uno por uno y ninguno invoca un precio publicado por ARCE.
 *
 * QUÉ NO PRUEBA, y hay que decirlo tres veces. (1) Ninguna compra medida está en infracción: el tope
 * de la leche cubre SÓLO la bolsita de polietileno con ≥2,6% de grasa y el registro OCDS no dice la
 * presentación, así que las compras del código 2988 a 60-90 $/L son una pregunta abierta y NUNCA una
 * violación. (2) Los 17.766 millones de alimentos son la COTA SUPERIOR del rubro, no el monto
 * alcanzado por el num. 16, que es una causal estrecha que el feed no permite aislar. (3) El «cero»
 * de menciones se mide sobre los campos de texto del OCDS, no sobre los pliegos en PDF: un pliego
 * puede invocar el techo sin que lo veamos.
 *
 * Y la explicación que compite es fuerte: el art. 318 mandaba al PODER EJECUTIVO a reglamentarlo, y
 * sin decreto ARCE no tenía instrumento jurídico para publicar nada. El silencio del organismo puede
 * ser, literalmente, el silencio de otro. Además la definición era técnicamente frágil, y la leche
 * lo demuestra: el código 2988 cubre bolsita tarifada, botella, distintos tenores grasos, entrega a
 * domicilio y retiro en planta, con precios legítimos de $37,26 a más de $60.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const USA_RED = !process.argv.includes("--sin-red");
const LECHE = "2988"; // LECHE FRESCA PASTEURIZADA (USO HUMANO)
const SUBFAMILIA_ALIMENTOS = "ALIMENTOS Y PRODUCTOS AGROPECUARIOS, FORESTALES Y MARITIMOS";

const fmt = (n: number): string => Math.round(n).toLocaleString("es-UY");
function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? NaN : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

async function main(): Promise<void> {
  if (USA_RED) {
    console.log("=== el archivo COMPLETO de comunicados de ARCE ===");
    try {
      const enlaces = new Set<string>();
      const conPrecio = new Set<string>();
      for (let p = 0; p < 6; p += 1) {
        const res = await fetch(`https://www.gub.uy/agencia-reguladora-compras-estatales/comunicacion/comunicados?page=${p}`, {
          headers: { "user-agent": "conlatuya-verify/1.0" },
        });
        const html = res.status === 200 ? await res.text() : "";
        for (const m of html.matchAll(/href="([^"]*\/comunicados\/[^"#?]+)"/g)) {
          const u = m[1]!;
          enlaces.add(u);
          if (/precio/i.test(u)) conPrecio.add(u);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      console.log(`  ${enlaces.size} comunicados en las seis páginas del listado`);
      console.log(`  de esos, con «precio» en la URL: ${conPrecio.size}`);
      for (const u of [...conPrecio].sort()) console.log(`    ${u}`);
      console.log("  Las dos vigentes son de LECHE FRESCA (mayo 2023 y junio 2024). Ninguna otra trae un precio.");
    } catch (e) {
      console.log(`  no se pudo consultar el listado (${(e as Error).message})`);
    }

    console.log("\n=== el comunicado que hoy no se puede abrir ===");
    try {
      const res = await fetch("https://www.gub.uy/agencia-reguladora-compras-estatales/comunicacion/comunicados/precios-referencia-para-adquisicion-leche-fresca", {
        headers: { "user-agent": "conlatuya-verify/1.0" },
        redirect: "manual",
      });
      console.log(`  HTTP ${res.status} (medido el 14/08/2026: 403, «Acceso denegado»)`);
    } catch (e) {
      console.log(`  no respondió (${(e as Error).message})`);
    }

    console.log("\n=== datos abiertos: qué publica ARCE en el catálogo nacional ===");
    try {
      const j: any = await (await fetch("https://catalogodatos.gub.uy/api/3/action/organization_show?id=acce&include_datasets=true")).json();
      const ds: any[] = j?.result?.packages ?? [];
      console.log(`  ${ds.length} datasets · ${ds.map((d) => String(d.title ?? d.name)).slice(0, 14).join(" | ")}`);
      console.log(`  con «precio» en el título: ${ds.filter((d) => /precio/i.test(String(d.title ?? d.name))).length}`);
    } catch (e) {
      console.log(`  el catálogo no respondió (${(e as Error).message})`);
    }
  } else {
    console.log("(--sin-red: se saltó gub.uy y catalogodatos)");
  }

  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  console.log("\n=== el universo que el techo decía cubrir: el catálogo único ===");
  const cat = db.collection("sice_catalog");
  const total = await cat.countDocuments({});
  const bienes = await cat.countDocuments({ isService: false });
  const vigentes = await cat.countDocuments({ isService: false, retired: false });
  console.log(`  ${total.toLocaleString("es-UY")} artículos · ${bienes.toLocaleString("es-UY")} bienes · ${vigentes.toLocaleString("es-UY")} vigentes`);
  console.log(`  ARCE publicó un precio para 1 producto = ${((100 * 1) / total).toFixed(4)}% del catálogo`);

  console.log("\n=== el gasto que pasó formalmente por debajo del art. 318 de la LUC (bienes, 2021-2025) ===");
  const gasto = await db
    .collection("product_analytics")
    .aggregate(
      [
        { $match: { isService: false } },
        { $project: { byYear: 1 } },
        { $unwind: "$byYear" },
        { $match: { "byYear.year": { $gte: 2021, $lte: 2025 } } },
        { $group: { _id: "$byYear.year", spend: { $sum: "$byYear.spendUYU" }, lines: { $sum: "$byYear.lines" } } },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  let gTotal = 0;
  let gLineas = 0;
  for (const g of gasto as any[]) {
    gTotal += g.spend;
    gLineas += g.lines;
    console.log(`  ${g._id}: $${fmt(g.spend).padStart(16)} en ${g.lines.toLocaleString("es-UY")} líneas`);
  }
  console.log(`  2021-2025: $${fmt(gTotal)} en ${gLineas.toLocaleString("es-UY")} líneas de adjudicación`);
  console.log("  Es un PISO: sólo cuenta líneas con código de catálogo y monto plausible.");

  console.log("\n=== el universo del art. 33 D) num. 16: el rubro alimentos ===");
  const codigosAlimentos = await cat.distinct("code", { subfName: SUBFAMILIA_ALIMENTOS });
  const alimentos: any = (
    await db
      .collection("product_analytics")
      .aggregate(
        [
          { $match: { code: { $in: codigosAlimentos } } },
          { $project: { code: 1, byYear: 1 } },
          { $unwind: "$byYear" },
          { $match: { "byYear.year": { $gte: 2021, $lte: 2025 } } },
          { $group: { _id: null, spend: { $sum: "$byYear.spendUYU" }, lines: { $sum: "$byYear.lines" }, codes: { $addToSet: "$code" } } },
        ],
        { allowDiskUse: true }
      )
      .toArray()
  )[0];
  console.log(`  ${codigosAlimentos.length.toLocaleString("es-UY")} artículos en la subfamilia · ${alimentos.codes.length} efectivamente comprados 2021-2025`);
  console.log(`  $${fmt(alimentos.spend)} en ${alimentos.lines.toLocaleString("es-UY")} líneas`);
  console.log("  COTA SUPERIOR del rubro, NO el monto con techo: el num. 16 sólo alcanzaba lo comprado directo");
  console.log("  a productores familiares, cooperativas de trabajo y organizaciones de la Ley 19.292, y el feed");
  console.log("  no permite aislar esa fracción.");

  console.log("\n=== nadie invoca el techo: frase exacta sobre el índice de texto de releases ===");
  for (const frase of [
    "precio maximo de adquisicion",
    "precio máximo de adquisición",
    "precio testigo",
    "precios maximos",
    "precio maximo",
    "precio de referencia",
    "precios de referencia",
  ]) {
    const n = await rel.countDocuments({ $text: { $search: `"${frase}"` } });
    console.log(`  «${frase}»${" ".repeat(Math.max(0, 30 - frase.length))} → ${n}`);
  }
  console.log("  Los 26 que sí aparecen se leyeron uno por uno: 11 son la muletilla de OSE («participar en el");
  console.log("  Concurso de Precios de referencia»), 7 son pedidos de cotización indicativa del Hospital");
  console.log("  Pasteur, 2 son regularizaciones de 2003-2004 y los 7 de «precio máximo» son topes propios del");
  console.log("  pliego. Ninguno invoca un precio publicado por ARCE.");
  console.log("  El cero se mide sobre los campos de TEXTO del OCDS, no sobre los pliegos en PDF.");

  console.log("\n=== el único caso verificable: leche fresca pasteurizada, código 2988 ===");
  const lineas = (await rel
    .aggregate(
      [
        { $match: { "awards.items.classification.id": LECHE, date: { $gte: new Date("2023-01-01") } } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.id": LECHE } },
        {
          $project: {
            _id: 0,
            anio: { $year: "$date" },
            buyer: "$buyer.name",
            supplier: { $arrayElemAt: ["$awards.suppliers.name", 0] },
            unidad: { $toLower: "$awards.items.unit.name" },
            precio: "$awards.items.unit.value.amount",
            moneda: "$awards.items.unit.value.currency",
          },
        },
        { $match: { precio: { $gt: 0 } } },
      ],
      { allowDiskUse: true }
    )
    .toArray()) as any[];
  const litros = lineas.filter((l) => /^(l|lt|litro)/.test(String(l.unidad ?? "")));
  const monedas = new Map<string, number>();
  for (const l of litros) monedas.set(l.moneda ?? "(nula)", (monedas.get(l.moneda ?? "(nula)") ?? 0) + 1);
  console.log(`  ${lineas.length} líneas desde 2023 · ${litros.length} en litros · monedas: ${[...monedas].map(([m, n]) => `${m}=${n}`).join(", ")}`);
  for (const a of [2023, 2024, 2025, 2026]) {
    const xs = litros.filter((l) => l.anio === a).map((l) => l.precio);
    if (xs.length === 0) continue;
    console.log(`  ${a}: n=${String(xs.length).padStart(3)} · rango ${Math.min(...xs)} – ${Math.max(...xs)} · mediana ${mediana(xs).toFixed(2)}`);
  }

  console.log("\n  el precio de referencia de junio de 2024 aparece LITERAL en el corpus:");
  const alTope = litros.filter((l) => Math.abs(l.precio - 42.34) < 0.005);
  console.log(`  ${alTope.length} líneas a $42,34 exactos · compradores: ${[...new Set(alTope.map((l) => String(l.buyer).slice(0, 26)))].slice(0, 6).join(", ")}`);
  console.log(`  proveedor: ${[...new Set(alTope.map((l) => String(l.supplier)))].join(", ") || "s/d"}`);
  console.log("  → el instrumento existe y se usa. No es que fuera imposible: se hizo para un producto.");

  console.log("\n  y en el mismo período el MISMO código se compró muy por encima:");
  const caras = litros.filter((l) => l.precio >= 60).sort((a, b) => b.precio - a.precio);
  for (const l of caras.slice(0, 8)) console.log(`    $${String(l.precio).padStart(6)}/L · ${l.anio} · ${String(l.buyer).slice(0, 46)}`);
  console.log(`  ${caras.length} líneas a 60 $/L o más, por encima incluso del precio máximo al público a domicilio ($43,30).`);
  console.log("  CAVEAT QUE MATA EL TITULAR FÁCIL: la resolución del MEF sólo topea la leche en bolsita de");
  console.log("  polietileno con ≥2,6% de grasa, y el registro OCDS no dice la presentación. NO se puede");
  console.log("  afirmar que esas compras violaran un tope: se puede afirmar que nadie puede saberlo.");

  console.log("\n=== la línea de base precomputada del mismo código ===");
  const bl: any = await db.collection("item_price_baselines").findOne({ classificationId: LECHE, currency: "UYU", unitName: "l" });
  if (bl) console.log(`  n=${bl.n} · min ${bl.min} · p25 ${bl.p25} · p50 ${bl.p50} · p75 ${bl.p75} · p95 ${bl.p95} · max ${bl.max} · precio más frecuente ${bl.modePrice}`);
  else console.log("  no hay línea de base para 2988/UYU/l");

  console.log("\n=== los textos legales, verbatim en impo.com.uy (sin login) ===");
  console.log("  LUC art. 318 original: /bases/leyes-originales/19889-2020/318 · ficha con la derogación: /bases/leyes/19889-2020/318");
  console.log("  LUC art. 314 (el techo del num. 16): /bases/leyes-originales/19889-2020/314");
  console.log("  Ley 19.996 art. 35 (redacción final del num. 16): /bases/leyes-originales/19996-2021/35");
  console.log("  Ley 20.446 arts. 3, 24 y 29 (la derogación y su vigencia): /bases/leyes/20446-2025/3, /24, /29");
  console.log("  OJO: un boletín jurídico atribuye la derogación del art. 318 al art. 25; en impo es el art. 24.");
  console.log("  El 25 deroga el último inciso del art. 40 de la Ley 20.075 y el 26 deroga el art. 330 de la LUC.");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
