#!/usr/bin/env tsx
/**
 * ¿Qué organismo paga MÁS por EL MISMO artículo? — dataset de la investigación.
 *
 * Control para que la comparación sea legítima: mismo código de catálogo SICE
 * (classification.id), misma moneda y misma unidad canónica. Es la misma clave con la que
 * detect-anomalies arma `item_price_baselines`, así que no inventa una normalización nueva.
 *
 * LO QUE ROMPE LA VERSIÓN INGENUA (medido el 2026-08-13, y por eso están los filtros):
 * en los SERVICIOS la unidad no significa nada. UTE y Aduanas registran el contrato entero
 * como "1 unidad a $1" y la cantidad lleva el monto, así que "LIMPIEZA INTEGRAL DE LOCALES"
 * daba una brecha de ×17.206.393 entre organismos. Eso no es un sobreprecio: es una práctica
 * de carga. Por eso sólo entran unidades FÍSICAS (nunca anual/mensual/hora/global), precios
 * unitarios por encima de un piso, y cantidades de más de una unidad.
 *
 * Emite JSON entre <<<DATASET y DATASET>>>. Sólo lectura.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(30 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { canonicalUnit } from "../../shared/utils/units";

const YEAR = Number(process.env.YEAR ?? 2025);

/** Unidades que NO miden una cosa contable: ahí "precio unitario" es el precio del contrato. */
const TIME_UNITS = new Set([
  "anual", "mensual", "bimestral", "trimestral", "semestral", "diario", "hora", "horas",
  "jornal", "jornada", "mes", "año", "global", "servicio", "contrato", "ficto", "porcentaje",
  "viaje", "evento", "curso", "licencia", "suscripcion", "abono",
]);
/** Un unitario de $1 (o centavos) es el marcador del contrato cargado como una unidad. */
const MIN_UNIT_PRICE = 20;
/** Y una compra de una sola unidad no compara contra una compra de mil. */
const MIN_QTY = 2;
const MIN_LINES_PER_CELL = 2;
const MIN_BUYERS_PER_CODE = 4;
const MIN_CODES_PER_BUYER = 20;

const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const quantile = (xs: number[], q: number): number => {
  const s = xs.slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i]!;
};

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;

  const rows = await db
    .collection("releases")
    .aggregate(
      [
        {
          $match: {
            tag: "award",
            date: { $gte: new Date(`${YEAR}-01-01`), $lt: new Date(`${YEAR + 1}-01-01`) },
            "buyer.id": { $type: "string", $ne: "" },
          },
        },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        {
          $match: {
            "awards.items.classification.id": { $type: "string", $ne: "" },
            "awards.items.unit.value.amount": { $gte: MIN_UNIT_PRICE },
            "awards.items.quantity": { $gte: MIN_QTY },
          },
        },
        {
          $project: {
            code: "$awards.items.classification.id",
            desc: "$awards.items.classification.description",
            cur: { $ifNull: ["$awards.items.unit.value.currency", "UYU"] },
            unit: { $ifNull: ["$awards.items.unit.name", ""] },
            price: "$awards.items.unit.value.amount",
            qty: "$awards.items.quantity",
            buyerId: "$buyer.id",
            buyerName: "$buyer.name",
            ocid: 1,
          },
        },
        {
          $group: {
            _id: { code: "$code", cur: "$cur", unit: "$unit", b: "$buyerId" },
            desc: { $first: "$desc" },
            buyerName: { $first: "$buyerName" },
            n: { $sum: 1 },
            qty: { $sum: "$qty" },
            prices: { $push: "$price" },
            ocids: { $addToSet: "$ocid" },
          },
        },
        { $match: { n: { $gte: MIN_LINES_PER_CELL } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();

  type Cell = { buyerId: string; buyerName: string; med: number; n: number; qty: number; ocid: string };
  const buckets = new Map<string, { code: string; cur: string; unit: string; desc: string; cells: Cell[] }>();
  for (const r of rows as any[]) {
    const unit = canonicalUnit(r._id.unit);
    if (TIME_UNITS.has(unit)) continue;
    const key = `${r._id.code}|${r._id.cur}|${unit}`;
    const b = buckets.get(key) ?? { code: r._id.code, cur: r._id.cur, unit, desc: r.desc, cells: [] };
    b.cells.push({ buyerId: r._id.b, buyerName: r.buyerName, med: median(r.prices), n: r.n, qty: r.qty, ocid: String(r.ocids?.[0] ?? "") });
    buckets.set(key, b);
  }
  const usable = [...buckets.values()].filter(b => b.cells.length >= MIN_BUYERS_PER_CODE);

  // Ratio de cada organismo contra la mediana del código.
  const perBuyer = new Map<string, { name: string; rs: number[]; extra: number; worst: { code: string; desc: string; ratio: number; med: number; mid: number; qty: number; ocid: string } | null }>();
  const gaps: Array<{ code: string; cur: string; unit: string; desc: string; buyers: number; mid: number; p10: number; p90: number; ratio: number; lo: Cell; hi: Cell }> = [];

  for (const b of usable) {
    const meds = b.cells.map(c => c.med);
    const mid = median(meds);
    if (!(mid > 0)) continue;
    const p10 = quantile(meds, 0.1);
    const p90 = quantile(meds, 0.9);
    const sorted = b.cells.slice().sort((x, y) => x.med - y.med);
    gaps.push({ code: b.code, cur: b.cur, unit: b.unit, desc: b.desc, buyers: b.cells.length, mid, p10, p90, ratio: p10 > 0 ? p90 / p10 : 0, lo: sorted[0]!, hi: sorted[sorted.length - 1]! });
    for (const c of b.cells) {
      const e = perBuyer.get(c.buyerId) ?? { name: c.buyerName, rs: [], extra: 0, worst: null };
      const ratio = c.med / mid;
      e.rs.push(ratio);
      e.extra += (c.med - mid) * c.qty;
      if (!e.worst || ratio > e.worst.ratio) e.worst = { code: b.code, desc: b.desc, ratio, med: c.med, mid, qty: c.qty, ocid: c.ocid };
      perBuyer.set(c.buyerId, e);
    }
  }

  const rank = [...perBuyer.entries()]
    .filter(([, e]) => e.rs.length >= MIN_CODES_PER_BUYER)
    .map(([id, e]) => ({ id, name: e.name, codes: e.rs.length, medRatio: median(e.rs), above: e.rs.filter(r => r > 1).length, extra: Math.round(e.extra), worst: e.worst }))
    .sort((a, b) => b.medRatio - a.medRatio);

  console.log(`año ${YEAR}: ${rows.length} celdas; ${buckets.size} códigos; ${usable.length} con >=${MIN_BUYERS_PER_CODE} organismos; ${rank.length} organismos rankeables`);
  for (const r of rank.slice(0, 12)) console.log(`  ×${r.medRatio.toFixed(2)}  ${String(r.codes).padStart(3)} códigos  ${r.above} por encima  ${String(r.name).slice(0, 46)}`);
  console.log("  ...");
  for (const r of rank.slice(-4)) console.log(`  ×${r.medRatio.toFixed(2)}  ${String(r.codes).padStart(3)} códigos  ${r.above} por encima  ${String(r.name).slice(0, 46)}`);

  const topGaps = gaps.filter(g => g.ratio > 1 && g.buyers >= 6).sort((a, b) => b.ratio - a.ratio).slice(0, 20);
  console.log("\n=== mayores brechas p90/p10 dentro de un mismo artículo ===");
  for (const g of topGaps) console.log(`  ×${g.ratio.toFixed(1)}  ${String(g.buyers).padStart(3)} org.  ${g.code}/${g.unit}  ${String(g.desc).slice(0, 38)}  |  ${g.lo.med.toFixed(0)} (${String(g.lo.buyerName).slice(0, 24)}) → ${g.hi.med.toFixed(0)} (${String(g.hi.buyerName).slice(0, 24)})`);

  console.log("\n<<<DATASET");
  console.log(JSON.stringify({
    year: YEAR,
    counts: { cells: rows.length, codes: buckets.size, usable: usable.length, buyers: rank.length },
    rank: rank.slice(0, 25),
    cheapest: rank.slice(-10).reverse(),
    gaps: topGaps.map(g => ({ code: g.code, cur: g.cur, unit: g.unit, desc: g.desc, buyers: g.buyers, mid: g.mid, p10: g.p10, p90: g.p90, ratio: g.ratio, lo: g.lo, hi: g.hi })),
  }));
  console.log("DATASET>>>");

  await disconnectFromDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
