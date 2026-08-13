#!/usr/bin/env tsx
/**
 * Genera el dataset verificado de la investigación "competencia aparente".
 * Sólo lectura. Emite JSON por stdout (bloque DATASET) para pegar en app/data/.
 *
 * Reglas de inclusión de un par (decididas tras medir los falsos positivos):
 *   - las dos empresas se presentaron AL MISMO llamado (call_bidders.found, count>=2)
 *   - y comparten domicilio declarado en RUPE (que declaren <=4 proveedores del corpus)
 *     o un teléfono que declaren <=3 proveedores.
 * Un teléfono que declaran 36 empresas es una central (terminal de ómnibus, UAM, un
 * operador logístico): no es un vínculo, y por eso queda afuera.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(30 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const digits = (s: string | null | undefined): string => String(s ?? "").replace(/\D/g, "");
const normPhone = (s: string | null | undefined): string => { const d = digits(s); return d.length >= 8 ? d.slice(-8) : ""; };
const normAddr = (s: string | null | undefined): string => String(s ?? "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

const MAX_ADDR_OWNERS = 4;
const MAX_PHONE_OWNERS = 3;

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const cb = db.collection("call_bidders");
  const sc = db.collection("supplier_contacts");
  const releases = db.collection("releases");

  // ---- cobertura global -------------------------------------------------
  const probed = await cb.countDocuments({});
  const withBlock = await cb.countDocuments({ found: true });
  const sole = await cb.countDocuments({ found: true, count: 1 });
  const multi = await cb.countDocuments({ found: true, count: { $gte: 2 } });
  const years = await cb.aggregate([{ $match: { found: true } }, { $group: { _id: "$sourceYear", n: { $sum: 1 }, sole: { $sum: { $cond: [{ $eq: ["$count", 1] }, 1, 0] } } } }, { $sort: { _id: 1 } }]).toArray();
  const buyers = (await cb.distinct("buyerId", { found: true })).length;
  const universe = await releases.countDocuments({ tag: "award" });

  // ---- contactos --------------------------------------------------------
  const contacts = await sc.find({}, { projection: { supplierId: 1, rut: 1, name: 1, phone: 1, phones: 1, websitePhone: 1, address: 1, placeSource: 1 } }).toArray();
  const byRut = new Map<string, any>();
  const phoneOwners = new Map<string, Set<string>>();
  const addrOwners = new Map<string, Set<string>>();
  const phonesOf = (c: any): string[] => Array.from(new Set([c.phone, c.websitePhone, ...(c.phones ?? []).map((p: any) => p?.phone ?? p)].map(normPhone).filter(Boolean)));
  for (const c of contacts as any[]) {
    const r = digits(c.rut || c.supplierId);
    if (r.length >= 8) byRut.set(r, c);
    for (const p of phonesOf(c)) phoneOwners.set(p, (phoneOwners.get(p) ?? new Set()).add(r));
    const a = normAddr(c.address);
    if (a.length > 8) addrOwners.set(a, (addrOwners.get(a) ?? new Set()).add(r));
  }

  // ---- pares ------------------------------------------------------------
  const calls = await cb.find({ found: true, count: { $gte: 2 } }, { projection: { ocid: 1, compraId: 1, bidders: 1, buyerName: 1, sourceYear: 1, count: 1 } }).toArray();
  type CallRow = { compraId: string; ocid: string; buyer: string; year: number; bidders: number; amount: number; winners: string[]; wonA: boolean; wonB: boolean };
  type Pair = { rutA: string; rutB: string; nameA: string; nameB: string; addr: string | null; addrOwners: number; phone: string | null; phoneOwners: number; calls: CallRow[] };
  const pairs = new Map<string, Pair>();

  for (const c of calls as any[]) {
    const ruts = Array.from(new Set((c.bidders ?? []).map((b: any) => digits(b.rut || b.docNumber)).filter((r: string) => r.length >= 8)));
    for (let i = 0; i < ruts.length; i++) {
      for (let j = i + 1; j < ruts.length; j++) {
        const [ra, rb] = [ruts[i]!, ruts[j]!].sort();
        const A = byRut.get(ra), B = byRut.get(rb);
        if (!A || !B) continue;
        const aa = normAddr(A.address), ab = normAddr(B.address);
        const sameAddr = aa.length > 8 && aa === ab && (addrOwners.get(aa)?.size ?? 99) <= MAX_ADDR_OWNERS;
        const pa = phonesOf(A), pb = phonesOf(B);
        const sharedPhone = pa.filter(p => pb.includes(p) && (phoneOwners.get(p)?.size ?? 99) <= MAX_PHONE_OWNERS)[0] ?? null;
        if (!sameAddr && !sharedPhone) continue;
        const key = `${ra}|${rb}`;
        const p = pairs.get(key) ?? {
          rutA: ra, rutB: rb, nameA: A.name, nameB: B.name,
          addr: sameAddr ? String(A.address) : null,
          addrOwners: sameAddr ? (addrOwners.get(aa)?.size ?? 0) : 0,
          phone: sharedPhone, phoneOwners: sharedPhone ? (phoneOwners.get(sharedPhone)?.size ?? 0) : 0,
          calls: [],
        };
        p.calls.push({ compraId: c.compraId, ocid: c.ocid, buyer: c.buyerName, year: c.sourceYear, bidders: c.count, amount: 0, winners: [], wonA: false, wonB: false });
        pairs.set(key, p);
      }
    }
  }

  // ganadores por llamado
  for (const p of pairs.values()) {
    for (const k of p.calls) {
      const rows = await releases.find({ ocid: k.ocid, tag: "award" }, { projection: { "awards.suppliers": 1, "amount.primaryAmount": 1 } }).toArray();
      const names = new Map<string, string>();
      for (const r of rows as any[]) {
        for (const a of r.awards ?? []) for (const s of a.suppliers ?? []) if (s?.name) names.set(digits(s.id), s.name);
        k.amount += Number(r.amount?.primaryAmount) || 0;
      }
      k.winners = Array.from(names.values());
      k.wonA = names.has(p.rutA);
      k.wonB = names.has(p.rutB);
    }
  }

  // ---- oferente único: monto y método -----------------------------------
  const soleCalls = await cb.find({ found: true, count: 1 }, { projection: { ocid: 1, compraId: 1, buyerName: 1, sourceYear: 1, bidders: 1 } }).toArray();
  const info = new Map<string, { uyu: number; title: string; method: string | null }>();
  const ocids = (soleCalls as any[]).map(s => s.ocid);
  for (let i = 0; i < ocids.length; i += 800) {
    const rows = await releases.find({ ocid: { $in: ocids.slice(i, i + 800) } }, { projection: { ocid: 1, tag: 1, "amount.primaryAmount": 1, "tender.title": 1, "tender.procurementMethodDetails": 1 } }).toArray();
    for (const r of rows as any[]) {
      const e = info.get(r.ocid) ?? { uyu: 0, title: "", method: null };
      const tags: string[] = Array.isArray(r.tag) ? r.tag : [r.tag];
      if (tags.includes("award")) e.uyu += Number(r.amount?.primaryAmount) || 0;
      if (r.tender?.title && !e.title) e.title = r.tender.title;
      if (r.tender?.procurementMethodDetails && !e.method) e.method = r.tender.procurementMethodDetails;
      info.set(r.ocid, e);
    }
  }
  const soleRows = (soleCalls as any[]).map(s => ({ compraId: s.compraId, ocid: s.ocid, buyer: s.buyerName, year: s.sourceYear, sup: s.bidders?.[0]?.name ?? "", rut: s.bidders?.[0]?.rut ?? null, ...(info.get(s.ocid) ?? { uyu: 0, title: "", method: null }) }));
  const byMethod = new Map<string, { n: number; uyu: number }>();
  for (const r of soleRows) { const k = r.method ?? "(sin método)"; const e = byMethod.get(k) ?? { n: 0, uyu: 0 }; e.n++; e.uyu += r.uyu; byMethod.set(k, e); }

  // método de TODAS las sondeadas, para poder comparar tasa por método
  const allProbed = await cb.find({ found: true }, { projection: { ocid: 1, count: 1 } }).toArray();
  const methodAll = new Map<string, { n: number; sole: number }>();
  const allOcids = (allProbed as any[]).map(s => s.ocid);
  const methodOf = new Map<string, string>();
  for (let i = 0; i < allOcids.length; i += 800) {
    const rows = await releases.find({ ocid: { $in: allOcids.slice(i, i + 800) }, "tender.procurementMethodDetails": { $type: "string" } }, { projection: { ocid: 1, "tender.procurementMethodDetails": 1 } }).toArray();
    for (const r of rows as any[]) if (!methodOf.has(r.ocid)) methodOf.set(r.ocid, r.tender.procurementMethodDetails);
  }
  for (const s of allProbed as any[]) {
    const k = methodOf.get(s.ocid) ?? "(sin método)";
    const e = methodAll.get(k) ?? { n: 0, sole: 0 };
    e.n++; if (s.count === 1) e.sole++;
    methodAll.set(k, e);
  }

  // ---- el caso raro: 677M en una abreviada ------------------------------
  const bigOne = await releases.find({ ocid: "ocds-yfs5dr-1339091", tag: "award" }, { projection: { id: 1, date: 1, "amount.primaryAmount": 1, "amount.verifiedOverride": 1, "awards.items.quantity": 1, "awards.items.unit.value.amount": 1, "awards.items.description": 1, "awards.suppliers.name": 1 } }).toArray();

  console.log("\n<<<DATASET");
  console.log(JSON.stringify({
    coverage: { probed, withBlock, sole, multi, buyers, universe, years },
    pairs: Array.from(pairs.values()).sort((a, b) => b.calls.length - a.calls.length),
    soleByMethod: Array.from(byMethod.entries()).map(([k, v]) => ({ method: k, ...v })).sort((a, b) => b.n - a.n),
    soleRateByMethod: Array.from(methodAll.entries()).map(([k, v]) => ({ method: k, ...v })).sort((a, b) => b.n - a.n),
    soleTop: soleRows.sort((a, b) => b.uyu - a.uyu).slice(0, 40),
    soleTotalUyu: soleRows.reduce((s, r) => s + r.uyu, 0),
    bigOne,
  }, null, 1));
  console.log("DATASET>>>");

  await disconnectFromDatabase();
}

main().catch((e) => { console.error(e); process.exit(1); });
