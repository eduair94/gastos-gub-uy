#!/usr/bin/env tsx
/**
 * HALLAZGO «inda-canastas» — un solo distribuidor ganó las cinco licitaciones de canastas del INDA
 * desde 2023, y el precio real por canasta bajó.
 *
 *   npx tsx tests/unit/hallazgo-inda-canastas.verify.ts
 *
 * QUÉ MIDE. Las adjudicaciones del Instituto Nacional de Alimentación (MIDES) del código de
 * catálogo 31999 «CANASTA DE VIVERES SECOS»: cuántas, de quién, por cuánto y cuántas canastas. El
 * precio por canasta se deflacta por Unidad Indexada a pesos de agosto de 2026, porque comparar
 * precios nominales de 2023 contra 2026 en un país con inflación no dice nada.
 *
 * OJO CON LA CANTIDAD. Una canasta se adjudica en varias líneas —una por tramo de IVA, y a veces
 * duplicadas por destino—, así que sumar `quantity` a secas cuenta la misma canasta tres veces y
 * da 562.200 en vez de 187.400. El precio por canasta es la suma de los precios unitarios
 * DISTINTOS, y la cantidad es la total dividida por esa misma cantidad de tramos.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Ocho adjudicaciones del código 31999 entre el 23/02/2023 y el 14/05/2026 por 193.095.700
 *     pesos sin impuestos (187.400 canastas), las ocho al mismo proveedor: DISTRIBUIDORA SANTA
 *     ANA S.A. (RUT 211603980013).
 *   - Tres de las ocho repiten exactamente el monto y el precio unitario de una anterior:
 *     58.135.850 pesos, el 30,1% del dinero, sin llamado nuevo. Si fueran republicaciones del
 *     mismo gasto y no ampliaciones, el total baja a 134.959.850.
 *   - El precio de la canasta, con composición idéntica producto por producto, BAJÓ en pesos
 *     constantes de agosto de 2026: 1.179 (febrero de 2023), 1.066 (setiembre de 2024) y 971
 *     (mayo de 2026), 17,6% menos en tres años. Es el dato que corre en contra del hallazgo y va
 *     dentro de la ficha, no escondido.
 *   - En 2021 el mismo suministro se repartía entre TA TA, Macromercado y Santa Ana.
 *   - El TOTAL que imprime el script (206.311.050 y 197.100 canastas) incluye además las tres
 *     compras a TA TA de 2021-2023; el titular es la parte de Santa Ana.
 *
 * QUÉ NO PRUEBA. Hubo llamado competitivo en cuatro de los cinco procedimientos, con entre 3 y 5
 * oferentes: ganar cinco veces seguidas compitiendo no es una irregularidad. Y los precios de los
 * perdedores no están: el corpus guarda sólo al ganador y las actas de apertura son escaneos sin
 * capa de texto, así que no se puede decir si Santa Ana ganó por ser la más barata.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const INDA = "Instituto Nacional de Alimentación";
const CANASTA = "31999";
/** Unidad Indexada del mes base: todo se lleva a pesos de agosto de 2026. */
const MES_BASE = "2026-08";

const mes = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  const ui = new Map<string, number>();
  for (const r of (await db.collection("exchange_rates").find({}, { projection: { _id: 0, month: 1, ui: 1 } }).toArray()) as any[]) {
    if (typeof r.ui === "number" && r.ui > 0) ui.set(r.month, r.ui);
  }
  const uiBase = ui.get(MES_BASE)!;
  console.log(`Unidad Indexada de ${MES_BASE}: ${uiBase}`);

  console.log("\n=== adjudicaciones del código 31999 del INDA ===");
  const crudo = await rel
    .aggregate(
      [
        { $match: { "buyer.name": INDA, "awards.items.classification.id": CANASTA } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.id": CANASTA } },
        {
          $project: {
            _id: 0,
            rel: "$id",
            fecha: { $ifNull: ["$awards.date", "$date"] },
            prov: { $arrayElemAt: ["$awards.suppliers.name", 0] },
            q: { $ifNull: ["$awards.items.quantity", 0] },
            p: { $ifNull: ["$awards.items.unit.value.amount", 0] },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  // Una canasta se adjudica en VARIAS líneas: una por tramo de IVA, y a veces duplicadas por
  // destino. Sumar `quantity` a secas cuenta la misma canasta tres veces. La forma correcta:
  // el precio por canasta es la suma de los precios unitarios DISTINTOS, y la cantidad de
  // canastas es la cantidad total dividida por esa misma cantidad de tramos.
  const porRelease = new Map<string, { fecha: Date; prov: string; q: number; precios: Set<number> }>();
  for (const l of crudo as any[]) {
    const e = porRelease.get(l.rel) ?? { fecha: new Date(l.fecha), prov: l.prov, q: 0, precios: new Set<number>() };
    e.q += l.q;
    e.precios.add(l.p);
    porRelease.set(l.rel, e);
  }
  const filas = [...porRelease.entries()]
    .map(([rel, e]) => {
      const porCanasta = [...e.precios].reduce((a, b) => a + b, 0);
      const canastas = e.q / e.precios.size;
      return { rel, fecha: e.fecha, prov: e.prov, porCanasta, canastas, neto: canastas * porCanasta };
    })
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  let total = 0;
  let canastas = 0;
  const proveedores = new Map<string, number>();
  for (const f of filas) {
    const u = ui.get(mes(f.fecha));
    const real = u ? (f.porCanasta / u) * uiBase : null;
    total += f.neto;
    canastas += f.canastas;
    proveedores.set(f.prov, (proveedores.get(f.prov) ?? 0) + f.neto);
    console.log(
      `  ${f.fecha.toISOString().slice(0, 10)} · ${f.rel.slice(0, 22).padEnd(22)} · $${Math.round(f.neto).toLocaleString("es-UY").padStart(11)} ·` +
      ` ${Math.round(f.canastas).toLocaleString("es-UY").padStart(7)} canastas · $${f.porCanasta.toFixed(0).padStart(5)}/canasta` +
      ` · real $${real ? real.toFixed(0).padStart(5) : "  s/d"} · ${String(f.prov).slice(0, 28)}`
    );
  }
  console.log(`  TOTAL: ${filas.length} adjudicaciones · $${Math.round(total).toLocaleString("es-UY")} sin impuestos · ${Math.round(canastas).toLocaleString("es-UY")} canastas`);

  console.log("\n=== a quién se le compró ===");
  for (const [p, m] of [...proveedores].sort((a, b) => b[1] - a[1])) {
    console.log(`  $${Math.round(m).toLocaleString("es-UY").padStart(11)} (${((100 * m) / total).toFixed(1).padStart(5)}%) · ${p}`);
  }

  console.log("\n=== segundas resoluciones: mismo monto y mismo precio unitario, sin llamado nuevo ===");
  const santaAna = filas.filter(f => /SANTA ANA/i.test(f.prov));
  const totalSA = santaAna.reduce((s, f) => s + f.neto, 0);
  const vistos = new Set<string>();
  let montoSegundas = 0;
  for (const f of santaAna) {
    const clave = `${Math.round(f.neto)}|${f.porCanasta}`;
    if (vistos.has(clave)) {
      montoSegundas += f.neto;
      console.log(`  ${f.fecha.toISOString().slice(0, 10)} · ${f.rel} repite $${Math.round(f.neto).toLocaleString("es-UY")} a $${f.porCanasta}/canasta`);
    }
    vistos.add(clave);
  }
  console.log(`  DISTRIBUIDORA SANTA ANA: ${santaAna.length} adjudicaciones · $${Math.round(totalSA).toLocaleString("es-UY")}`);
  console.log(
    `  repetidas: $${Math.round(montoSegundas).toLocaleString("es-UY")} = ${((100 * montoSegundas) / totalSA).toFixed(1)}% de lo suyo`
  );
  console.log(`  si fueran republicaciones del mismo gasto y no ampliaciones, su total baja a $${Math.round(totalSA - montoSegundas).toLocaleString("es-UY")}`);

  console.log("\n=== quién proveía canastas antes: el mismo código, todo el Estado, 2021 ===");
  const antes = await rel
    .aggregate(
      [
        { $match: { "awards.items.classification.id": CANASTA, sourceYear: 2021 } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.id": CANASTA } },
        {
          $group: {
            _id: { $arrayElemAt: ["$awards.suppliers.name", 0] },
            neto: { $sum: { $multiply: [{ $ifNull: ["$awards.items.quantity", 0] }, { $ifNull: ["$awards.items.unit.value.amount", 0] }] } },
            n: { $sum: 1 },
          },
        },
        { $sort: { neto: -1 } },
        { $limit: 8 },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  for (const a of antes as any[]) {
    console.log(`  $${Math.round(a.neto).toLocaleString("es-UY").padStart(11)} · ${a.n} líneas · ${String(a._id).slice(0, 45)}`);
  }

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
