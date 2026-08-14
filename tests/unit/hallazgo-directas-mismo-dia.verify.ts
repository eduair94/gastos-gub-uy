#!/usr/bin/env tsx
/**
 * HALLAZGO «directas-mismo-dia» — ¿por qué el Centro Auxiliar de Bella Unión resolvió doce compras
 * directas el mismo día al mismo prestador?
 *
 *   npx tsx tests/unit/hallazgo-directas-mismo-dia.verify.ts
 *
 * QUÉ MIDE. Ráfagas: combinaciones de organismo, proveedor y código de artículo con seis o más
 * compras separadas dentro de una ventana móvil de 15 días, todas por debajo del tope de compra
 * directa de su año. Después baja las fichas oficiales de los tres casos que sobreviven a la
 * verificación, y los CONTRAFÁCTICOS que hay que correr para no equivocarse.
 *
 * LAS TRES TRAMPAS QUE HAY QUE RESPETAR, Y QUE SON LA MITAD DEL HALLAZGO.
 *   1. La ráfaga se mide sobre `awards[].date` (fecha de resolución), NO sobre la fecha del release:
 *      medido sobre la del release aparecen falsos positivos grandes que son cargas masivas del feed.
 *   2. El tipo de procedimiento NO está en el feed: el release de adjudicación no trae `tender`.
 *      Sin abrir la ficha no se sabe si una compra es directa, un concurso de precios o una compra
 *      por excepción — y la excepción NO tiene tope, así que no hay tope que esquivar.
 *   3. El feed publica montos SIN impuestos y el tope se mide CON impuestos: la compra 1281409
 *      figura con $215.573,77 en el feed y $263.000,00 en la ficha. Comparar el monto del feed
 *      contra el tope subestima, nunca exagera.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - 556 combinaciones con seis o más compras en 15 días bajo el tope; 144 con diez o más.
 *   - Tres casos sobreviven: ASSE Bella Unión (12 compras el 9/7/2026), DINACIA (22 compras
 *     mensuales desde el 28/8/2025, tras seis años de contrato anual) e INAU Paysandú (5 el
 *     22/12/2025).
 *
 * LA EXPLICACIÓN QUE LA PROPIA FICHA SUGIERE VA DENTRO DEL TEXTO. El Centro Auxiliar de Bella Unión
 * no tiene servicio de traumatología: opera a sus pacientes en un sanatorio privado de Salto, y cada
 * cirugía es un servicio distinto a un paciente distinto, así que entra como una compra separada. El
 * precio del mismo código varía entre $353.146 y $654.000 el mismo día, de modo que NO se puede
 * afirmar que el monto lo haya fijado el tope y no la complejidad de cada intervención. En DINACIA,
 * la explicación habitual es que el contrato anual se agotó y el servicio no se puede cortar
 * mientras se tramita el nuevo llamado.
 *
 * QUÉ NO PRUEBA. Nada de lo medido muestra que alguien haya dividido un gasto. El art. 32 del TOCAF
 * exige que el fraccionamiento sea ARTIFICIAL, y ese juicio es del ordenador del gasto y del
 * Tribunal de Cuentas, con los expedientes que no están publicados. Nunca se puede escribir que el
 * Tribunal observó algo a partir del dato: la observación vive en el expediente y en el PDF.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

/** Topes del art. 33 lit. C, tabla del INE «Montos Límites de las Adquisiciones Estatales». */
const TOPE: Record<number, { general: number; departamental: number }> = {
  2024: { general: 251_000, departamental: 940_000 },
  2025: { general: 263_000, departamental: 987_000 },
  2026: { general: 654_000, departamental: 1_024_000 },
};
const VENTANA_DIAS = 15;
const MINIMO = 6;

const RESOL = { $convert: { input: { $arrayElemAt: ["$awards.date", 0] }, to: "date", onError: null, onNull: null } };

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  console.log("=== trampa 1: la fecha de resolución NO es la del release ===");
  const fechas = await rel
    .aggregate(
      [
        { $match: { tag: "award", sourceYear: { $gte: 2024 }, date: { $type: "date" } } },
        { $sample: { size: 60_000 } }, // sorteo, no `$limit`: los primeros 60.000 en orden natural sesgan
        { $project: { pub: "$date", r: RESOL } },
        { $match: { r: { $ne: null } } },
        {
          $group: {
            _id: null,
            n: { $sum: 1 },
            iguales: { $sum: { $cond: [{ $eq: [{ $dateToString: { date: "$pub", format: "%Y-%m-%d" } }, { $dateToString: { date: "$r", format: "%Y-%m-%d" } }] }, 1, 0] } },
            rezago: { $avg: { $divide: [{ $subtract: ["$pub", "$r"] }, 86_400_000] } },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const f: any = fechas[0];
  console.log(`  En ${f.n.toLocaleString("es-UY")} releases, sólo ${((100 * f.iguales) / f.n).toFixed(1)}% comparten día · rezago promedio ${Math.round(f.rezago)} días`);

  console.log("\n=== trampa 2: el tipo de procedimiento no está en el feed ===");
  const conTender = await rel.countDocuments({ tag: "award", "tender.procurementMethodDetails": { $exists: true } });
  console.log(`  Releases de adjudicación que traen tender.procurementMethodDetails: ${conTender}`);
  // $sample, no `distinct().slice()`: los ocids ordenados alfabéticamente son una muestra sesgada.
  const muestra300 = (
    await rel.aggregate([{ $match: { tag: "award", sourceYear: { $gte: 2024 } } }, { $sample: { size: 300 } }, { $project: { ocid: 1 } }], { allowDiskUse: true }).toArray()
  ).map((d: any) => d.ocid);
  const conHermano = await rel.distinct("ocid", { ocid: { $in: muestra300 }, "tender.procurementMethodDetails": { $exists: true, $ne: null } });
  console.log(`  De 300 ocids de adjudicación sorteados, ${(conHermano as string[]).length} tienen un release hermano con el método.`);

  console.log("\n=== las ráfagas: 6+ compras del mismo artículo al mismo proveedor en 15 días, bajo el tope ===");
  const grupos = await rel
    .aggregate(
      [
        { $match: { tag: "award", sourceYear: { $gte: 2024 }, "awards.items.0": { $exists: true }, "amount.primaryAmount": { $gt: 0, $lt: 50e9 } } },
        {
          $project: {
            ocid: 1,
            buyer: "$buyer.id",
            comprador: "$buyer.name",
            amt: "$amount.primaryAmount",
            r: RESOL,
            sup: { $reduce: { input: "$awards.suppliers", initialValue: [], in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] } } },
            cods: {
              $reduce: {
                input: {
                  $reduce: { input: "$awards.items", initialValue: [], in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] } },
                },
                initialValue: [],
                in: { $concatArrays: ["$$value", [{ $ifNull: ["$$this.classification.id", "0"] }]] },
              },
            },
          },
        },
        { $match: { r: { $ne: null } } },
        // Sólo compras de UN proveedor: si hay varios el monto no es atribuible al par.
        { $project: { ocid: 1, buyer: 1, comprador: 1, amt: 1, r: 1, cods: { $setUnion: ["$cods", []] }, rut: { $setUnion: ["$sup.id", []] } } },
        { $match: { "rut.0": { $exists: true }, "rut.1": { $exists: false } } },
        { $unwind: "$cods" },
        { $match: { cods: { $ne: "0" } } }, // el código «0» es la línea SIN codificar, no un artículo
        {
          $group: {
            _id: {
              buyer: "$buyer",
              // La barra se saca para que el corte de identificador de 2026 no parta el mismo RUT.
              rut: { $replaceAll: { input: { $arrayElemAt: ["$rut", 0] }, find: "/", replacement: "" } },
              cod: "$cods",
            },
            comprador: { $first: "$comprador" },
            compras: { $addToSet: { ocid: "$ocid", r: "$r", amt: "$amt" } },
          },
        },
        { $project: { comprador: 1, compras: 1, n: { $size: "$compras" } } },
        { $match: { n: { $gte: MINIMO } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  console.log(`  ${grupos.length.toLocaleString("es-UY")} combinaciones organismo × proveedor × artículo con ${MINIMO}+ compras desde 2024`);

  const esDepartamental = (nombre: string) => /^\s*(Intendencia|Junta Departamental|Gobierno Departamental)/i.test(String(nombre ?? ""));
  type Rafaga = { clave: any; comprador: string; n: number; monto: number; dia: string; total: number };
  const rafagas: Rafaga[] = [];
  for (const g of grupos as any[]) {
    const compras = (g.compras as any[])
      .map((c) => ({ ...c, t: new Date(c.r).getTime(), anio: new Date(c.r).getUTCFullYear() }))
      .filter((c) => TOPE[c.anio])
      .sort((a, b) => a.t - b.t);
    const tope = (anio: number) => (esDepartamental(g.comprador) ? TOPE[anio]!.departamental : TOPE[anio]!.general);
    // Ventana móvil de 15 días: todas las compras de la ventana por debajo del tope de su año.
    let mejor: Rafaga | null = null;
    for (let i = 0; i < compras.length; i++) {
      const dentro = compras.filter((c) => c.t >= compras[i]!.t && c.t <= compras[i]!.t + VENTANA_DIAS * 86_400_000 && c.amt < tope(c.anio));
      if (dentro.length >= MINIMO && (!mejor || dentro.length > mejor.n)) {
        mejor = {
          clave: g._id,
          comprador: g.comprador,
          n: dentro.length,
          monto: dentro.reduce((a, c) => a + c.amt, 0),
          dia: new Date(compras[i]!.t).toISOString().slice(0, 10),
          total: compras.reduce((a, c) => a + c.amt, 0),
        };
      }
    }
    if (mejor) rafagas.push(mejor);
  }
  const diez = rafagas.filter((r) => r.n >= 10);
  console.log(`  ${rafagas.length} combinaciones tienen una ráfaga de ${MINIMO}+ en 15 días bajo el tope · ${diez.length} llegan a diez o más`);
  console.log(`  En esas ventanas hay $${Math.round(rafagas.reduce((a, r) => a + r.monto, 0) / 1e6).toLocaleString("es-UY")} millones adjudicados`);
  console.log(`  Sumando TODAS las compras de esos ${rafagas.length} pares desde 2024: $${Math.round(rafagas.reduce((a, r) => a + r.total, 0) / 1e6).toLocaleString("es-UY")} millones`);
  console.log("\n  Las diez ráfagas más numerosas:");
  for (const r of [...rafagas].sort((a, b) => b.n - a.n).slice(0, 10)) {
    console.log(`  ${String(r.n).padStart(3)} compras desde ${r.dia} · $${String(Math.round(r.monto).toLocaleString("es-UY")).padStart(11)} · art. ${String(r.clave.cod).padStart(6)} · ${String(r.comprador ?? "").slice(0, 44)}`);
  }
  console.log("\n  ATENCIÓN: publicar este ranking crudo contaría otra cosa. Los casos más grandes por dinero se caen");
  console.log("  al abrir la ficha: medicamentos oncológicos que se compran dosis por dosis bajo «Compra por Excepción»");
  console.log("  —figura SIN tope— y sillas de ruedas del BPS que son «Concurso de Precios», un procedimiento competitivo.");

  console.log("\n=== el primer caso: ASSE, Centro Auxiliar de Bella Unión, 9 de julio de 2026 ===");
  const bellaUnion = ["1354617", "1354621", "1354625", "1354630", "1354639", "1354644", "1354678", "1354687", "1354722", "1354753", "1354757", "1354766"];
  const leidas = await leerFichas(bellaUnion);
  const totalBU = leidas.reduce((a, l) => a + (l.total ?? 0), 0);
  console.log(`  ${leidas.length} fichas leídas · $${Math.round(totalBU).toLocaleString("es-UY")} con impuestos`);
  const tope2026 = TOPE[2026]!.general;
  const alTope = leidas.filter((l) => l.total === tope2026);
  const cerca = leidas.filter((l) => (l.total ?? 0) >= 640_000 && (l.total ?? 0) <= tope2026);
  console.log(`  ${cerca.length} de ${leidas.length} entre $640.000 y $${tope2026.toLocaleString("es-UY")} · ${alTope.length} exactamente en el tope de 2026`);
  const montos = leidas.map((l) => l.total ?? 0).filter(Boolean).sort((a, b) => a - b);
  console.log(`  El monto del mismo día va de $${montos[0]?.toLocaleString("es-UY")} a $${montos[montos.length - 1]?.toLocaleString("es-UY")}: el tope NO explica la dispersión.`);
  for (const l of leidas.slice(0, 4)) console.log(`  ${l.id} · ${l.procedimiento ?? "—"} · $${(l.total ?? 0).toLocaleString("es-UY")} · ${l.item ?? "—"} · ${l.proveedor ?? "—"}`);
  console.log("  Cada ficha es una cirugía a un paciente distinto: el hospital no tiene servicio de traumatología");
  console.log("  y opera en un sanatorio privado de Salto, así que cada intervención entra como una compra separada.");

  console.log("\n=== el segundo caso: DINACIA, del contrato anual a la compra mensual ===");
  const dinacia = await leerFichas(["1153985", "1272528", "1281409", "1281391", "1281405", "1283903"]);
  for (const l of dinacia) console.log(`  ${l.id} · ${String(l.procedimiento ?? "—").padEnd(28)} · $${(l.total ?? 0).toLocaleString("es-UY").padStart(11)} · ${String(l.item ?? "—").slice(0, 40)}`);
  const feed = await rel.findOne({ ocid: "ocds-yfs5dr-1281409", tag: "award" }, { projection: { "amount.primaryAmount": 1 } });
  console.log(`  Trampa 3 medida: la compra 1281409 figura con $${Math.round((feed as any)?.amount?.primaryAmount ?? 0).toLocaleString("es-UY")} en el feed (sin impuestos) y $263.000 en la ficha (con impuestos).`);

  console.log("\n=== el tercer caso: INAU, Dirección Departamental de Paysandú, 22 de diciembre de 2025 ===");
  const inau = await leerFichas(["1305366", "1305392", "1305431", "1305459", "1305466"]);
  const totalInau = inau.reduce((a, l) => a + (l.total ?? 0), 0);
  const tope2025 = TOPE[2025]!.general;
  for (const l of inau) console.log(`  ${l.id} · ${String(l.procedimiento ?? "—").padEnd(28)} · $${(l.total ?? 0).toLocaleString("es-UY").padStart(11)} · ${(((l.total ?? 0) / tope2025) * 100).toFixed(1)}% del tope`);
  console.log(`  Total leído: $${Math.round(totalInau).toLocaleString("es-UY")}`);

  console.log("\n=== los contrafácticos: lo que HAY que correr para no equivocarse ===");
  for (const l of await leerFichas(["1128729", "1160651", "1183872", "1197380", "1201477"])) {
    console.log(`  ${l.id} · ${l.procedimiento ?? "—"}`);
  }
  console.log("  Los tres primeros son «Compra por Excepción» (sin tope) y los dos últimos «Concurso de Precios» (competitivo).");
  console.log("  Ninguno de los cinco es una compra directa, así que ninguno puede leerse como troceo.");

  await disconnectFromDatabase();

  /** Baja la ficha oficial: procedimiento, «Monto Total de la Compra» (CON impuestos), ítem y proveedor. */
  async function leerFichas(ids: string[]): Promise<Array<{ id: string; procedimiento?: string; item?: string; proveedor?: string; total?: number }>> {
    const out: Array<{ id: string; procedimiento?: string; item?: string; proveedor?: string; total?: number }> = [];
    for (const id of ids) {
      try {
        const res = await fetch(`https://www.comprasestatales.gub.uy/consultas/detalle/id/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) { out.push({ id }); continue; }
        const texto = (await res.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&sol;/g, "/").replace(/\s+/g, " ");
        const procedimiento = /(Compra Directa(?: Ampliada)?|Compra por Excepci[oó]n|Concurso de Precios|Licitaci[oó]n (?:Abreviada|P[uú]blica))\s*(?:Nro\.?\s*)?[\dA-Z]*\/?\d{0,4}/i.exec(texto)?.[0]?.trim();
        const totalTxt = /Monto Total de la Compra[^\d]{0,40}([\d.]+,\d{2})/i.exec(texto)?.[1];
        const item = /Ítem Nº\s*1\s+(.{0,70}?)\s*\(C[oó]d\. Art[ií]culo/i.exec(texto)?.[1]?.trim();
        const proveedor = /Proveedor:\s*(.{0,60}?)\s*\(RUT/i.exec(texto)?.[1]?.trim();
        out.push({
          id,
          ...(procedimiento ? { procedimiento } : {}),
          ...(item ? { item } : {}),
          ...(proveedor ? { proveedor } : {}),
          ...(totalTxt ? { total: Number(totalTxt.replace(/\./g, "").replace(",", ".")) } : {}),
        });
      } catch {
        out.push({ id });
      }
      await new Promise((r) => setTimeout(r, 900));
    }
    return out;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
