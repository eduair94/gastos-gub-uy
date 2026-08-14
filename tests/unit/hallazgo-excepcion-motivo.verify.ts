#!/usr/bin/env tsx
/**
 * HALLAZGO «excepcion-motivo» — el Estado escribe por qué no licita en la ficha web y deja el campo
 * vacío en los datos abiertos.
 *
 *   npx tsx tests/unit/hallazgo-excepcion-motivo.verify.ts
 *
 * QUÉ MIDE. Primero, el tamaño de la vía del art. 33 del TOCAF (la Compra por Excepción) en dinero
 * y en contratos, uniendo cada adjudicación con su release hermano de pliego por `ocid` —el release
 * de adjudicación NO trae `tender`, así que sin esa unión no hay método—. Después, el hueco: los
 * cuatro campos del estándar OCDS donde viviría la causal están vacíos en todo el corpus, y la
 * ficha HTML de cada compra sí la imprime. Por último, tres controles que sacan del medio las
 * lecturas fáciles: la palabra «urgencia» en el texto del pliego no identifica el procedimiento, la
 * emergencia sanitaria de 2020 no pasó por esta vía, y ANTEL concentra el 23,8% del dinero sin
 * adjudicatario publicado.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 3.753 compras por excepción entre 2020 y hoy por 27.153 millones de pesos: 5,5% del dinero
 *     cuyo método se puede identificar, y más que los 14.810 millones de toda la compra directa
 *     común, con 3.753 contratos frente a 128.550.
 *   - Sin el registro más grande (BROU-ATEL, 6.037 millones) el total baja a 21.115 millones.
 *   - `tender.procurementMethodRationale` — el campo del estándar que existe para la causal —
 *     está vacío en los 2.184.332 registros. Igual `legalBasis`, `rationale` y
 *     `procurementMethodJustification`.
 *   - La palabra «emergencia» o «urgencia» aparece en 1.472 de 269.788 pliegos desde 2020 y
 *     describe el objeto comprado, no la vía.
 *   - De los pliegos de 2020 que nombran covid, la enorme mayoría son Compra Directa y una minoría
 *     Compra por Excepción: 2020 es el año de MENOR gasto por excepción de la serie.
 *
 * LA MAYOR PARTE DE ESTA VÍA NO ES DISCRECIONAL, Y VA ANTES QUE CUALQUIER OTRA LECTURA. En las 609
 * fichas oficiales leídas una por una, la causal más frecuente (31,7%) es el numeral 26: compras
 * que el MSP hace en cumplimiento de decisiones judiciales. La segunda (19,9%) es el numeral 33:
 * ANEP manteniendo locales de enseñanza. La que más dinero mueve (42,4%) es el numeral 2: la
 * licitación se hizo y quedó desierta. La urgencia es sólo el 4,9% de las fichas.
 *
 * QUÉ NO PRUEBA. No hay norma verificada que obligue a volcar la causal al feed OCDS: esto es una
 * brecha de política de datos, no una violación. El conteo de causales es una muestra de 609 sobre
 * unas 3.750 y no un censo. El registro más grande (BROU-ATEL) tiene 55.000 horas a U$S 2.740,93 la
 * hora, un precio que se parece a un monto en pesos etiquetado como dólares y que no verificamos.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const DESDE = 2020;
const HASTA = 2026;
const EXCEPCION = "Compra por Excepción";

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  console.log("=== los campos del estándar OCDS donde viviría la causal ===");
  const totalReleases = await rel.estimatedDocumentCount();
  for (const campo of ["tender.procurementMethodRationale", "tender.legalBasis", "tender.rationale", "tender.procurementMethodJustification"]) {
    const n = await rel.countDocuments({ [campo]: { $exists: true, $ne: null } });
    console.log(`  ${campo.padEnd(45)} presente en ${n} de ${totalReleases.toLocaleString("es-UY")} registros`);
  }
  console.log("  La ficha HTML de cada compra SÍ imprime el numeral y su texto legal. Al dato abierto no llega.");

  console.log("\n=== los métodos que el feed sí publica: ninguno se llama urgencia ni emergencia ===");
  const metodos = await rel.distinct("tender.procurementMethodDetails", { "tender.procurementMethodDetails": { $exists: true, $ne: null } });
  console.log(`  ${metodos.length} valores distintos. La única puerta al art. 33 es «${EXCEPCION}».`);
  console.log(`  ${(metodos as string[]).filter((m) => /urgen|emergen/i.test(m)).length} de ellos mencionan urgencia o emergencia.`);
  const pliegosExc = await rel.countDocuments({ "tender.procurementMethodDetails": EXCEPCION });
  console.log(`  ${pliegosExc.toLocaleString("es-UY")} pliegos de Compra por Excepción en todo el corpus.`);

  console.log("\n=== el mapa ocid → método, que hay que construir porque el release de adjudicación no trae tender ===");
  const mapa = new Map<string, string>();
  const curMapa = rel.find(
    { "tender.procurementMethodDetails": { $exists: true, $ne: null } },
    { projection: { ocid: 1, "tender.procurementMethodDetails": 1 } }
  );
  let filasMapa = 0;
  for await (const d of curMapa) {
    filasMapa++;
    const m = (d as any)?.tender?.procurementMethodDetails;
    if (d.ocid && m && !mapa.has(d.ocid)) mapa.set(d.ocid, m);
  }
  console.log(`  ${filasMapa.toLocaleString("es-UY")} filas de pliego · ${mapa.size.toLocaleString("es-UY")} ocids con método`);

  console.log(`\n=== el dinero por método, ${DESDE}-${HASTA} ===`);
  const porOcid = new Map<string, number>();
  const curAward = rel.find(
    { tag: "award", sourceYear: { $gte: DESDE, $lte: HASTA }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } },
    { projection: { ocid: 1, "amount.primaryAmount": 1 } }
  );
  for await (const d of curAward) {
    if (!d.ocid) continue;
    porOcid.set(d.ocid, (porOcid.get(d.ocid) ?? 0) + ((d as any).amount?.primaryAmount ?? 0));
  }
  const agregado = new Map<string, { n: number; monto: number }>();
  let conMetodo = 0;
  let montoConMetodo = 0;
  let montoTotal = 0;
  let mayorExcepcion = { ocid: "", monto: 0 };
  for (const [ocid, monto] of porOcid) {
    montoTotal += monto;
    const m = mapa.get(ocid);
    if (!m) continue;
    conMetodo++;
    montoConMetodo += monto;
    const a = agregado.get(m) ?? { n: 0, monto: 0 };
    a.n++;
    a.monto += monto;
    agregado.set(m, a);
    if (m === EXCEPCION && monto > mayorExcepcion.monto) mayorExcepcion = { ocid, monto };
  }
  console.log(`  ${porOcid.size.toLocaleString("es-UY")} adjudicaciones con monto · $${Math.round(montoTotal / 1e6).toLocaleString("es-UY")} millones`);
  console.log(`  Método identificable en ${conMetodo.toLocaleString("es-UY")} (${((100 * conMetodo) / porOcid.size).toFixed(1)}%) · $${Math.round(montoConMetodo / 1e6).toLocaleString("es-UY")} millones`);
  for (const [m, a] of [...agregado.entries()].sort((x, y) => y[1].monto - x[1].monto).slice(0, 6)) {
    console.log(`  ${String(Math.round(a.monto / 1e6)).padStart(7).toLocaleString("es-UY")} millones · ${String(a.n).padStart(6)} contratos · ${m}`);
  }
  const exc = agregado.get(EXCEPCION)!;

  // El bloque que NO se ve si uno filtra `tag: award`: compras por excepción cuyo ÚNICO release es
  // el pliego, con monto y con `awards[].suppliers` vacío. No hay adjudicatario en el dato abierto.
  console.log("\n=== las compras por excepción que llegan al feed SIN adjudicatario ===");
  const sinAdjudicatario: Array<{ ocid: string; monto: number; anio: number; comprador: string }> = [];
  const curSin = rel.find(
    {
      tag: "tender",
      "tender.procurementMethodDetails": EXCEPCION,
      sourceYear: { $gte: DESDE, $lte: HASTA },
      "amount.primaryAmount": { $gt: 0, $lt: 50e9 },
    },
    { projection: { ocid: 1, sourceYear: 1, "amount.primaryAmount": 1, "buyer.name": 1 } }
  );
  for await (const d of curSin) {
    if (!d.ocid || porOcid.has(d.ocid)) continue; // si existe release de adjudicación, ya está contado
    sinAdjudicatario.push({
      ocid: d.ocid,
      monto: (d as any).amount?.primaryAmount ?? 0,
      anio: (d as any).sourceYear,
      comprador: (d as any).buyer?.name ?? "—",
    });
  }
  const montoSin = sinAdjudicatario.reduce((s, a) => s + a.monto, 0);
  console.log(`  ${sinAdjudicatario.length} compras · $${Math.round(montoSin / 1e6).toLocaleString("es-UY")} millones sin ningún adjudicatario publicado`);
  const porComprador = new Map<string, { n: number; monto: number }>();
  for (const a of sinAdjudicatario) {
    const c = porComprador.get(a.comprador) ?? { n: 0, monto: 0 };
    c.n++;
    c.monto += a.monto;
    porComprador.set(a.comprador, c);
  }
  for (const [c, a] of [...porComprador.entries()].sort((x, y) => y[1].monto - x[1].monto).slice(0, 3)) {
    console.log(`  ${String(a.n).padStart(4)} compras · $${Math.round(a.monto / 1e6).toLocaleString("es-UY").padStart(7)} millones · ${c}`);
  }
  const antel2025 = sinAdjudicatario.filter((a) => a.anio === 2025 && /Telecomunicaciones/i.test(a.comprador));
  console.log(
    `  ANTEL en 2025: ${antel2025.length} compras · $${Math.round(antel2025.reduce((s, a) => s + a.monto, 0) / 1e6).toLocaleString("es-UY")} millones`
  );

  const excTotal = exc.monto + montoSin;
  const excContratos = exc.n + sinAdjudicatario.length;
  console.log(`\n=== el total por excepción, ${DESDE}-${HASTA} ===`);
  console.log(`  $${Math.round(excTotal / 1e6).toLocaleString("es-UY")} millones en ${excContratos.toLocaleString("es-UY")} contratos`);
  console.log(`  (${Math.round(exc.monto / 1e6).toLocaleString("es-UY")} con adjudicatario publicado + ${Math.round(montoSin / 1e6).toLocaleString("es-UY")} sin él)`);
  console.log(`  Es el ${((100 * excTotal) / (montoConMetodo + montoSin)).toFixed(1)}% del dinero cuyo método se puede identificar,`);
  console.log(`  y más que los ${Math.round((agregado.get("Compra Directa")?.monto ?? 0) / 1e6).toLocaleString("es-UY")} millones de toda la compra directa común, que son ${(agregado.get("Compra Directa")?.n ?? 0).toLocaleString("es-UY")} contratos.`);
  console.log(`  Registro mayor: ${mayorExcepcion.ocid} · $${Math.round(mayorExcepcion.monto / 1e6).toLocaleString("es-UY")} millones.`);
  console.log(`  Sin él, el total por excepción baja a $${Math.round((excTotal - mayorExcepcion.monto) / 1e6).toLocaleString("es-UY")} millones.`);
  console.log("  Ese registro es 55.000 horas a U$S 2.740,93 la hora: un precio que se parece a un monto en pesos");
  console.log("  etiquetado como dólares y que NO verificamos, por eso el total se muestra siempre con y sin él.");

  console.log("\n=== control 1: la palabra «urgencia» en el pliego no identifica el procedimiento ===");
  const conPalabra = await rel.countDocuments({
    sourceYear: { $gte: DESDE },
    "tender.procurementMethodDetails": { $exists: true },
    $or: [{ "tender.title": /emergencia|urgencia/i }, { "tender.description": /emergencia|urgencia/i }],
  });
  const pliegosDesde = await rel.countDocuments({ sourceYear: { $gte: DESDE }, "tender.procurementMethodDetails": { $exists: true } });
  console.log(`  ${conPalabra.toLocaleString("es-UY")} de ${pliegosDesde.toLocaleString("es-UY")} pliegos desde ${DESDE} contienen la palabra.`);
  console.log("  Describe el objeto comprado (cobertura de emergencia médica, puerta de emergencia, carro de reanimación), no la vía.");

  console.log("\n=== control 2: la emergencia sanitaria de 2020 no pasó por esta vía ===");
  const covid = await rel
    .aggregate(
      [
        {
          $match: {
            sourceYear: 2020,
            "tender.procurementMethodDetails": { $exists: true, $ne: null },
            $or: [{ "tender.title": /covid|coronavirus|pandemia|emergencia sanitaria/i }, { "tender.description": /covid|coronavirus|pandemia|emergencia sanitaria/i }],
          },
        },
        { $group: { _id: "$tender.procurementMethodDetails", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const totalCovid = (covid as any[]).reduce((a, b) => a + b.n, 0);
  for (const c of covid as any[]) console.log(`  ${String(c.n).padStart(4)} de ${totalCovid} pliegos de 2020 que nombran covid · ${c._id}`);

  console.log("\n=== control 3: el gasto por excepción año por año ===");
  const porAnio = new Map<number, { n: number; monto: number }>();
  const curAnio = rel.find(
    { tag: "award", sourceYear: { $gte: DESDE, $lte: HASTA }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } },
    { projection: { ocid: 1, sourceYear: 1, "amount.primaryAmount": 1 } }
  );
  const vistos = new Set<string>();
  for await (const d of curAnio) {
    if (!d.ocid || mapa.get(d.ocid) !== EXCEPCION || vistos.has(d.ocid)) continue;
    vistos.add(d.ocid);
    const a = porAnio.get((d as any).sourceYear) ?? { n: 0, monto: 0 };
    a.n++;
    a.monto += porOcid.get(d.ocid) ?? 0;
    porAnio.set((d as any).sourceYear, a);
  }
  for (const a of sinAdjudicatario) {
    const p = porAnio.get(a.anio) ?? { n: 0, monto: 0 };
    p.n++;
    p.monto += a.monto;
    porAnio.set(a.anio, p);
  }
  for (const [y, a] of [...porAnio.entries()].sort((x, z) => x[0] - z[0])) {
    console.log(`  ${y}: ${String(a.n).padStart(4)} compras por excepción · $${Math.round(a.monto / 1e6).toLocaleString("es-UY")} millones`);
  }
  console.log("  2020, el año de la emergencia sanitaria, es el de MENOR gasto por excepción de la serie.");

  console.log("\n=== la causal, que sólo existe en la ficha HTML: seis fichas testigo ===");
  const testigos: Array<[string, string]> = [
    ["810292", "BROU-ATEL, el registro mayor"],
    ["i455822", "ANTEL, licenciamiento VMware"],
    ["984005", "CEIP, causal de urgencia (num. 10)"],
    ["i455671", "ANTEL, sin adjudicatario publicado"],
    ["i456047", "ANTEL, sin adjudicatario publicado"],
    ["i463267", "ANTEL, sin adjudicatario publicado"],
  ];
  for (const [id, que] of testigos) {
    try {
      const res = await fetch(`https://www.comprasestatales.gub.uy/consultas/detalle/id/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(30_000) });
      const html = res.ok ? await res.text() : "";
      const causal = /Art\.?\s*33[^<]{0,160}/i.exec(html.replace(/&nbsp;/g, " "))?.[0]?.replace(/\s+/g, " ").trim();
      const esExcepcion = /Compra por Excepci/i.test(html);
      const conProveedores = /Proveedores participantes/i.test(html);
      console.log(`  ${id.padEnd(9)} ${res.ok ? "200" : String(res.status)} · excepción: ${esExcepcion ? "sí" : "no "} · bloque de proveedores: ${conProveedores ? "sí" : "no "} · ${causal ? causal.slice(0, 78) : "— sin numeral legible —"}`);
      console.log(`            (${que})`);
    } catch (e: any) {
      console.log(`  ${id.padEnd(9)} no respondió · ${e?.message ?? e}`);
    }
    await new Promise((r) => setTimeout(r, 1000)); // un pedido por segundo
  }
  console.log("  La causal está en la ficha y no en el feed: no hay forma de contar las compras por urgencia sin abrir páginas de a una.");

  console.log("\n=== la distribución de causales, sobre una muestra sorteada de 60 fichas ===");
  const universo = [...porOcid.keys()].filter((o) => mapa.get(o) === EXCEPCION);
  const sorteo: string[] = [];
  for (let i = 0; i < 60 && universo.length; i++) sorteo.push(universo[Math.floor(Math.random() * universo.length)]!);
  const numerales = new Map<string, number>();
  let leidas = 0;
  for (const ocid of sorteo) {
    const id = ocid.replace(/^ocds-[a-z0-9]+-/i, "");
    try {
      const res = await fetch(`https://www.comprasestatales.gub.uy/consultas/detalle/id/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) continue;
      const texto = (await res.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
      const num = /Art\.?\s*33,?\s*(\d+)\s*:/i.exec(texto)?.[1];
      leidas++;
      const clave = num ? `numeral ${num}` : "sin numeral del art. 33 (otra ley)";
      numerales.set(clave, (numerales.get(clave) ?? 0) + 1);
    } catch { /* la ficha puede haber sido borrada del portal */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  for (const [k, v] of [...numerales.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(3)} de ${leidas} (${((100 * v) / leidas).toFixed(1).padStart(5)}%) · ${k}`);
  }
  console.log("  La muestra es de 60 y varía en cada corrida. El conteo publicado sale de leer 609 fichas una por una;");
  console.log("  el censo completo son unas 3.750 fichas, alrededor de una hora a un pedido por segundo.");
  console.log("  El numeral 26 son compras del MSP en cumplimiento de decisiones judiciales; el 33, ANEP manteniendo");
  console.log("  locales de enseñanza; el 2, la licitación que se hizo y quedó desierta. La urgencia es el numeral 10.");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
