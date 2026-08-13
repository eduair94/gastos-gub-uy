#!/usr/bin/env tsx
/**
 * Para los 8 pares publicados en /investigaciones/competencia-aparente: ¿a qué organismos
 * le facturan LAS DOS empresas, aunque no hayan competido en ese llamado? Sólo lectura.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(20 * 60 * 1000);
import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
const digits = (s: any) => String(s ?? "").replace(/\D/g, "");
const PAIRS: Array<[string, string, string, string]> = [
  ["213985010015", "214964620017", "DECOSTAR S A", "FULLSYSTEM S R L"],
  ["212605270011", "213352490017", "SEVITEC LTDA", "CONVI SOCIEDAD ANONIMA"],
  ["030256490017", "218710800016", "GONZALEZ MOURA S R L", "GRUPO OD S A S"],
  ["210572130015", "210591790017", "RUTAS DEL SOL LTDA", "CROMIN S A"],
  ["211984310019", "214679320019", "ELECTROSISTEMAS S.A", "UNION ELECTRICA S.A."],
  ["160000820016", "210237200015", "CHADRE S A", "AGENCIA CENTRAL S A"],
  ["211454500015", "218037410011", "MERCOLUZ S A", "FESCOMEL S.A."],
  ["030147340014", "212629730012", "LA FLOTTA LIMITADA", "DECATUR S R L"],
];
async function main() {
  await connectToDatabase();
  const rel = mongoose.connection.db!.collection("releases");
  const want = new Set(PAIRS.flatMap(p => [p[0], p[1]]));
  const rows = await rel.aggregate([
    { $match: { tag: "award", "amount.primaryAmount": { $gt: 0, $lt: 50e9 }, date: { $gte: new Date("2020-01-01") }, "buyer.name": { $ne: null } } },
    { $set: { sid: { $arrayElemAt: [{ $arrayElemAt: ["$awards.suppliers.id", 0] }, 0] } } },
    { $match: { sid: { $type: "string", $ne: "" } } },
    { $group: { _id: { s: "$sid", b: "$buyer.name" }, uyu: { $sum: "$amount.primaryAmount" }, n: { $sum: 1 } } },
  ], { allowDiskUse: true }).toArray();
  const by = new Map<string, Map<string, { uyu: number; n: number }>>();
  for (const r of rows as any[]) {
    const rut = digits(r._id.s); if (!want.has(rut)) continue;
    const m = by.get(rut) ?? new Map(); const p = m.get(r._id.b) ?? { uyu: 0, n: 0 };
    p.uyu += r.uyu; p.n += r.n; m.set(r._id.b, p); by.set(rut, m);
  }
  const out: any[] = [];
  for (const [ra, rb, na, nb] of PAIRS) {
    const A = by.get(ra) ?? new Map(), B = by.get(rb) ?? new Map();
    const shared = [...A.keys()].filter(k => B.has(k)).map(k => ({ buyer: k, a: A.get(k)!, b: B.get(k)! })).sort((x, y) => (y.a.uyu + y.b.uyu) - (x.a.uyu + x.b.uyu));
    const totA = [...A.values()].reduce((s, v) => s + v.uyu, 0), totB = [...B.values()].reduce((s, v) => s + v.uyu, 0);
    console.log(`\n${na} + ${nb}: ${shared.length} organismos donde facturan las dos (desde 2020). Total ${(totA / 1e6).toFixed(1)}M + ${(totB / 1e6).toFixed(1)}M`);
    for (const s of shared.slice(0, 5)) console.log(`   ${((s.a.uyu + s.b.uyu) / 1e6).toFixed(1).padStart(8)}M  ${String(s.buyer).slice(0, 40).padEnd(40)} ${(s.a.uyu / 1e6).toFixed(1)}M/${s.a.n} + ${(s.b.uyu / 1e6).toFixed(1)}M/${s.b.n}`);
    out.push({ ra, rb, na, nb, totA: Math.round(totA), totB: Math.round(totB), sharedCount: shared.length, shared: shared.slice(0, 3).map(s => ({ buyer: s.buyer, aUyu: Math.round(s.a.uyu), aN: s.a.n, bUyu: Math.round(s.b.uyu), bN: s.b.n })) });
  }
  console.log("\n<<<DATASET"); console.log(JSON.stringify(out)); console.log("DATASET>>>");
  await disconnectFromDatabase();
}
main().catch(e => { console.error(e); process.exit(1); });
