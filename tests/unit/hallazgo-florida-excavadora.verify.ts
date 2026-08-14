#!/usr/bin/env tsx
/**
 * HALLAZGO «florida-excavadora» — la Intendencia de Florida registró 72.580 horas de excavadora por
 * compra directa: el 55,7% de lo que compró en 2017.
 *
 *   npx tsx tests/unit/hallazgo-florida-excavadora.verify.ts
 *
 * QUÉ MIDE. El registro (ocid ocds-yfs5dr-617955) tal como está en el corpus y en la ficha oficial:
 * cantidad, precio unitario, moneda, adjudicatario y objeto declarado. Después su peso dentro del
 * año 2017 de la Intendencia, convirtiendo CADA registro al tipo de cambio BCU de su propio mes
 * desde `exchange_rates` —no a `amount.primaryAmount`, que para este release está calculado con el
 * tipo de cambio del 10/08/2025 sobre dólares de 2017 y NO se puede citar—. Por último, los cruces
 * que dieron cero y el barrido de proveedores de un solo año del que salió el caso.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Un solo ítem: 72.580 horas a U$S 94,9999 = U$S 6.895.092,74 sin impuestos. La ficha oficial
 *     publica U$S 8.412.013,15 de «Monto Total de la Compra».
 *   - Adjudicatario CYCLATER S.A. (R/217270870013), que aparece UNA sola vez como adjudicatario en
 *     los 2,18 millones de registros del corpus, y fue el único proveedor participante.
 *   - Es el 55,7% de todo lo que la Intendencia reportó comprar en 2017 (U$S 12.380.053 en 49
 *     registros) y por sí solo 1,26 veces todo el resto del año junto.
 *   - A 2.000 horas por año-máquina, 72.580 horas son unos 36 años-máquina: para consumirlas dentro
 *     de 2017 harían falta unas 36 excavadoras a jornada completa todo el año.
 *
 * HAY TRES EXPLICACIONES ADMINISTRATIVAS Y NINGUNA ESTÁ DESCARTADA. (1) Un error de carga: el
 * precio unitario, U$S 95 la hora, es una tarifa de mercado corriente para una excavadora, y lo
 * único fuera de escala es la CANTIDAD — por eso nuestro propio detector de anomalías no marcó el
 * registro: compara precios unitarios y no mira cantidades. (2) Si el monto fuera real, la que
 * declara la propia ficha: un temporal destruyó caminería rural y el TOCAF habilita contratar sin
 * licitar ante situaciones imprevistas y urgentes; eso explicaría el único oferente. (3) Que 72.580
 * sea un tope contractual y no lo efectivamente consumido. Cualquiera de las tres desactiva el caso.
 *
 * QUÉ NO PRUEBA. Nada de esto es una infracción constatada, y que un proveedor aparezca un solo año
 * no viola ninguna norma. El «Monto Total de la Compra» oficial se calcula multiplicando cantidad
 * por precio unitario, así que no es una confirmación independiente de lo pagado.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const OCID = "ocds-yfs5dr-617955";
const FLORIDA = "86-1";
const CYCLATER = "217270870013";

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  console.log("=== el registro, tal como está en el corpus ===");
  const doc: any = await rel.findOne({ ocid: OCID, tag: "award" });
  if (!doc) throw new Error(`no encontré ${OCID}: el hallazgo no se puede verificar`);
  const item = doc.awards?.[0]?.items?.[0];
  console.log(`  ocid ${doc.ocid} · id ${doc.id} · tag ${JSON.stringify(doc.tag)} · buyer ${doc.buyer?.id} ${doc.buyer?.name}`);
  const resol = doc.awards?.[0]?.date;
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "—").slice(0, 10));
  console.log(`  sourceYear ${doc.sourceYear} · resolución ${iso(resol)} · publicado ${iso(doc.date)}`);
  console.log(`  ítems: ${doc.awards?.[0]?.items?.length ?? 0} · cantidad ${item?.quantity?.toLocaleString("es-UY")} ${item?.unit?.name}`);
  console.log(`  precio unitario ${item?.unit?.value?.amount} ${item?.unit?.value?.currency} · clasificación ${item?.classification?.id} ${item?.classification?.description}`);
  console.log(`  objeto en el corpus: «${String(item?.description ?? doc.tender?.title ?? "— vacío: el objeto sólo está en la ficha oficial —").slice(0, 130)}»`);
  console.log(`  amount.totalAmounts: ${JSON.stringify(doc.amount?.totalAmounts)}`);
  console.log(`  adjudicatarios: ${JSON.stringify(doc.awards?.[0]?.suppliers?.map((s: any) => `${s.id} ${s.name}`))}`);
  const totalUSD = doc.amount?.totalAmounts?.USD ?? 0;
  console.log(`  ${(item?.quantity ?? 0).toLocaleString("es-UY")} × ${item?.unit?.value?.amount} = U$S ${totalUSD.toLocaleString("es-UY", { maximumFractionDigits: 2 })} sin impuestos`);

  console.log("\n=== por qué NO se puede citar el monto en pesos de nuestra propia base ===");
  console.log(`  amount.primaryAmount = $${Math.round(doc.amount?.primaryAmount ?? 0).toLocaleString("es-UY")}`);
  console.log(`  amount.exchangeRateDate = ${doc.amount?.exchangeRateDate instanceof Date ? doc.amount.exchangeRateDate.toISOString().slice(0, 10) : doc.amount?.exchangeRateDate}`);
  console.log("  Es el tipo de cambio de 2025 aplicado a dólares de 2017: la cifra en pesos está mal y no se usa.");

  console.log("\n=== el proveedor: cuántas veces aparece en los 2,18 millones de registros ===");
  const apariciones = await rel
    .find({ "awards.suppliers.id": { $in: [`R/${CYCLATER}`, `R${CYCLATER}`, CYCLATER] } }, { projection: { ocid: 1, sourceYear: 1, "buyer.name": 1 } })
    .toArray();
  console.log(`  ${apariciones.length} registro(s): ${apariciones.map((a: any) => `${a.ocid} (${a.sourceYear}, ${a.buyer?.name})`).join(" · ")}`);

  console.log("\n=== el peso dentro del año 2017 de la Intendencia, al tipo de cambio BCU de cada mes ===");
  const tasas = new Map<string, { usd?: number; eur?: number }>();
  for (const t of await db.collection("exchange_rates").find({ month: /^201[6-8]/ }).toArray()) {
    tasas.set((t as any).month, { usd: (t as any).usd, eur: (t as any).eur });
  }
  const del2017 = await rel
    .find({ "buyer.id": FLORIDA, tag: "award", sourceYear: 2017 }, { projection: { ocid: 1, date: 1, "amount.totalAmounts": 1 } })
    .toArray();
  let totalAnio = 0;
  let elCaso = 0;
  const porOcid = new Map<string, number>();
  for (const d of del2017 as any[]) {
    const mes = d.date instanceof Date ? d.date.toISOString().slice(0, 7) : "2017-01";
    const tc = tasas.get(mes) ?? tasas.get("2017-11")!;
    const t = d.amount?.totalAmounts ?? {};
    // Todo a dólares del propio mes del registro: los pesos se dividen por el tipo de cambio del mes.
    const usd = (t.USD ?? 0) + (t.UYU ?? 0) / (tc?.usd ?? 29.231) + ((t.EUR ?? 0) * (tc?.eur ?? 33)) / (tc?.usd ?? 29.231);
    porOcid.set(d.ocid, (porOcid.get(d.ocid) ?? 0) + usd);
  }
  for (const [ocid, usd] of porOcid) {
    totalAnio += usd;
    if (ocid === OCID) elCaso = usd;
  }
  console.log(`  ${porOcid.size} registros en 2017 · U$S ${Math.round(totalAnio).toLocaleString("es-UY")} en total`);
  console.log(`  El caso: U$S ${Math.round(elCaso).toLocaleString("es-UY")} · ${((100 * elCaso) / totalAnio).toFixed(1)}% del año`);
  console.log(`  Todo el resto del año junto: U$S ${Math.round(totalAnio - elCaso).toLocaleString("es-UY")} · el caso es ${(elCaso / (totalAnio - elCaso)).toFixed(2)} veces eso`);
  console.log(`  A 2.000 horas por año-máquina, ${(72580).toLocaleString("es-UY")} horas son ${Math.round(72580 / 2000)} años-máquina.`);

  console.log("\n=== los cruces que dieron CERO (y que hay que rehacer antes de publicar) ===");
  const releaseId = doc.id ?? doc._id;
  for (const [col, filtro] of [
    ["anomalies", { releaseId }],
    ["call_bidders", { ocid: OCID }],
    ["acta_bidders", { ocid: OCID }],
    ["bidder_competition", { ocid: OCID }],
  ] as Array<[string, Record<string, unknown>]>) {
    const existe = await db.listCollections({ name: col }).hasNext();
    const n = existe ? await db.collection(col).countDocuments(filtro) : -1;
    console.log(`  ${col.padEnd(20)} ${n < 0 ? "(la colección no existe)" : `${n} documento(s)`}`);
  }
  const tcr = await db.listCollections({ name: "tcr_resolutions" }).hasNext();
  if (tcr) {
    const n = await db.collection("tcr_resolutions").countDocuments({ $or: [{ text: /CYCLATER/i }, { title: /CYCLATER/i }, { summary: /CYCLATER/i }] });
    console.log(`  tcr_resolutions      ${n} resolución(es) del Tribunal de Cuentas mencionan a CYCLATER`);
  }
  console.log("  Nuestro detector de anomalías no lo marcó: compara PRECIOS unitarios contra su línea de base y no mira cantidades.");

  console.log("\n=== el barrido del que salió el caso: proveedores que aparecen en un solo año ===");
  const unAnio = (await db
    .collection("supplier_patterns")
    .find(
      { yearCount: 1, years: { $elemMatch: { $gte: 2015, $lte: 2024 } } },
      { projection: { supplierId: 1, name: 1, totalValue: 1, years: 1 } }
    )
    .toArray()) as any[];
  const suma = unAnio.reduce((a, s) => a + (s.totalValue ?? 0), 0);
  console.log(`  ${unAnio.length.toLocaleString("es-UY")} proveedores de un solo año entre 2015 y 2024 · $${Math.round(suma / 1e6).toLocaleString("es-UY")} millones`);
  const top = [...unAnio].sort((a, b) => (b.totalValue ?? 0) - (a.totalValue ?? 0)).slice(0, 6);
  let acumTop = 0;
  for (const s of top) {
    acumTop += s.totalValue ?? 0;
    console.log(`  $${String(Math.round((s.totalValue ?? 0) / 1e6)).padStart(7)} millones · ${String(s.name ?? "").slice(0, 46)}`);
  }
  console.log(`  Los 6 primeros son el ${((100 * acumTop) / suma).toFixed(1)}% del total, y son todos lo mismo: sociedades de propósito específico`);
  console.log("  de las PPP viales y carcelaria, y proveedores de ANCAP. Eso, más el crudo, explica el 95,4% del barrido.");
  console.log("  El barrido en sí NO encontró un patrón. Lo que sobrevive es este caso, no una regla.");

  console.log("\n=== la ficha oficial, que es la fuente ===");
  try {
    const res = await fetch("https://www.comprasestatales.gub.uy/consultas/detalle/id/617955", { signal: AbortSignal.timeout(30_000) });
    const html = res.ok ? await res.text() : "";
    // El portal escribe las barras como `&sol;`: sin decodificarlas no se leen las fechas.
    const texto = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&sol;/g, "/").replace(/\s+/g, " ");
    console.log(`  HTTP ${res.status} · «Compra Directa 213/2017»: ${/Compra Directa\s*213\/2017/i.test(texto) ? "sí" : "no"}`);
    console.log(`  «Monto Total de la Compra»: ${/8\.?412\.?013[,.]15/.test(texto) ? "U$S 8.412.013,15 — coincide" : "no leí el número esperado"}`);
    console.log(`  72.580 horas en la ficha: ${/72\.?580/.test(texto) ? "sí" : "no"}`);
    console.log(`  «Compra por Excepción» en la ficha: ${/Compra por Excepci/i.test(texto) ? "SÍ (cambiaría la lectura)" : "no — el Estado la rotula compra directa a secas"}`);
    const objeto = /(Contratacion de Horas de Excavadora[^<]{0,120})/i.exec(texto)?.[1];
    console.log(`  objeto declarado (sólo en la ficha, con sus erratas): «${objeto ? objeto.trim() : "no lo pude leer"}»`);
    console.log(`  fecha de la compra en la ficha: ${/19\/01\/2017/.test(texto) ? "19/01/2017" : "no leí la fecha esperada"}`);
  } catch (e: any) {
    console.log(`  no pude bajar la ficha: ${e?.message ?? e}`);
  }
  console.log("  https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/617955");

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
