#!/usr/bin/env tsx
/**
 * State suppliers × consumer-protection sanctions — the cross-reference.
 *
 * One document per sanctioned firm that also sells to the State, written to `udeco_supplier_stats`
 * by compute-then-swap. The read endpoint is then a plain indexed find.
 *
 * WHY A JOB AND NOT A REQUEST-PATH JOIN. `supplier_patterns.supplierId` stores the same RUT in at
 * least four shapes, all present in the live corpus:
 *
 *     "R/214803890012"      prefix + slash
 *     "R/214803890012 "     …with a trailing space
 *     "R211003420017"       prefix, NO slash
 *     "214803890012"        bare
 *
 * so an `$in` of exact strings under-matches badly — measured, 379 firms against the 530 a
 * normalised comparison finds, a 28% miss. Normalising to the 12 digits is the only correct join,
 * and it cannot use an index, so it belongs in a job rather than on every request.
 *
 * Twelve digits, not "all digits": a Uruguayan RUT is 12, an 8-digit id is a cédula and
 * `X/USA351167154` is a foreign registration. Requiring the full 12 is what stops those colliding.
 *
 * WHAT THIS MEANS. A UDECO sanction is about how the firm treated CONSUMERS. It is not a finding
 * about any public contract and does not make one irregular. The published fact is narrower: the
 * State's own consumer agency fined this firm, and the State keeps buying from it.
 *
 * Usage:
 *   npx tsx src/jobs/refresh-udeco-crossref.ts
 *   npx tsx src/jobs/refresh-udeco-crossref.ts --dry-run
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { SupplierPatternModel, UdecoSanctionModel, UdecoSupplierStatsModel } from "../../shared/models";

const RUT_DIGITS = 12;
const BULK_BATCH = 500;

/** The 12-digit RUT inside any of the id shapes the corpus uses, or null. */
export function rutFromSupplierId(supplierId: unknown): string | null {
  const digits = String(supplierId ?? "").replace(/\D/g, "");
  return digits.length === RUT_DIGITS ? digits : null;
}

interface Options { dryRun: boolean }

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function run(options: Options): Promise<void> {
  const started = Date.now();
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) process.env.MONGO_SOCKET_TIMEOUT_MS = String(15 * 60 * 1000);
  const dataVersion = `v${Date.now()}`;
  await connectToDatabase();

  // --- sanctions rolled up per firm ---
  const firms: Array<{
    _id: string;
    razonSocial: string;
    nombreComercial: string | null;
    departamento: string | null;
    sanctions: number;
    fines: number;
    totalUr: number;
    lastAt: Date | null;
    firstAt: Date | null;
    motivos: string[];
    tipos: string[];
  }> = await UdecoSanctionModel.aggregate([
    {
      $group: {
        _id: "$rut",
        razonSocial: { $first: "$razonSocial" },
        nombreComercial: { $first: "$nombreComercial" },
        departamento: { $first: "$departamento" },
        sanctions: { $sum: 1 },
        fines: { $sum: { $cond: [{ $gt: ["$montoUr", 0] }, 1, 0] } },
        totalUr: { $sum: "$montoUr" },
        lastAt: { $max: "$fechaResolucion" },
        firstAt: { $min: "$fechaResolucion" },
        motivos: { $addToSet: "$motivo" },
        tipos: { $addToSet: "$tipo" },
      },
    },
  ]);
  const byRut = new Map(firms.map((f) => [f._id, f]));
  console.log(`[udeco-xref] empresas sancionadas: ${byRut.size}`);

  // --- state procurement, folded across every id shape that resolves to the same RUT ---
  const state = new Map<string, { name: string | null; totalUyu: number; contracts: number; buyers: number; onlyDirectAward: boolean; ids: string[] }>();
  const cursor = SupplierPatternModel.find(
    {},
    { _id: 0, supplierId: 1, name: 1, totalValue: 1, totalContracts: 1, buyerCount: 1, onlyDirectAward: 1 }
  ).lean().cursor({ batchSize: 1000 });

  let scanned = 0;
  for await (const s of cursor) {
    scanned++;
    const rut = rutFromSupplierId((s as any).supplierId);
    if (!rut || !byRut.has(rut)) continue;
    const cur = state.get(rut) ?? { name: null, totalUyu: 0, contracts: 0, buyers: 0, onlyDirectAward: false, ids: [] };
    cur.totalUyu += (s as any).totalValue ?? 0;
    cur.contracts += (s as any).totalContracts ?? 0;
    cur.buyers = Math.max(cur.buyers, (s as any).buyerCount ?? 0);
    cur.onlyDirectAward = cur.onlyDirectAward || Boolean((s as any).onlyDirectAward);
    if (!cur.name && (s as any).name) cur.name = (s as any).name;
    cur.ids.push(String((s as any).supplierId ?? ""));
    state.set(rut, cur);
  }
  console.log(`[udeco-xref] proveedores escaneados: ${scanned} · sancionados que venden al Estado: ${state.size}`);

  const docs = [...state.entries()].map(([rut, s]) => {
    const f = byRut.get(rut)!;
    return {
      rut,
      razonSocial: f.razonSocial,
      nombreComercial: f.nombreComercial,
      departamento: f.departamento,
      supplierName: s.name,
      supplierIds: s.ids,
      totalUyu: s.totalUyu,
      contracts: s.contracts,
      buyers: s.buyers,
      onlyDirectAward: s.onlyDirectAward,
      sanctions: f.sanctions,
      fines: f.fines,
      totalUr: f.totalUr,
      firstSanctionAt: f.firstAt,
      lastSanctionAt: f.lastAt,
      motivos: (f.motivos ?? []).filter(Boolean).sort(),
      tipos: (f.tipos ?? []).filter(Boolean).sort(),
      // Denominators travel with the row so a page can never quote the headline alone.
      sanctionedFirmsTotal: byRut.size,
      dataVersion,
      calculatedAt: new Date(),
    };
  });

  docs.sort((a, b) => b.totalUyu - a.totalUyu);
  const totalUyu = docs.reduce((sum, d) => sum + d.totalUyu, 0);
  console.log(`[udeco-xref] ${docs.length} firmas · ${(totalUyu / 1e9).toFixed(1)}B UYU adjudicados`);
  for (const d of docs.slice(0, 10)) {
    console.log(`   ${(d.totalUyu / 1e6).toFixed(0).padStart(7)}M UYU · ${String(d.sanctions).padStart(2)} sanc (${d.totalUr} UR) · ${String(d.supplierName ?? d.razonSocial).slice(0, 40)}`);
  }

  if (options.dryRun) {
    console.log("[udeco-xref] 🧪 --dry-run: no writes performed.");
    return;
  }
  if (docs.length === 0) {
    console.warn("[udeco-xref] computed 0 documents — keeping the existing generation");
    return;
  }

  for (let i = 0; i < docs.length; i += BULK_BATCH) {
    const ops = docs.slice(i, i + BULK_BATCH).map((doc) => ({
      replaceOne: { filter: { rut: doc.rut }, replacement: doc, upsert: true },
    }));
    await UdecoSupplierStatsModel.bulkWrite(ops as never, { ordered: false });
  }
  const written = await UdecoSupplierStatsModel.countDocuments({ dataVersion });
  if (written !== docs.length) {
    throw new Error(
      `udeco_supplier_stats: only ${written}/${docs.length} docs carry ${dataVersion} — refusing to sweep the previous generation in favour of a partial one`
    );
  }
  // Sweep `$lt`, never `$ne`: two overlapping runs sweeping `$ne` delete each other's generation.
  const swept = await UdecoSupplierStatsModel.deleteMany({ dataVersion: { $lt: dataVersion } });
  console.log(`[udeco-xref] wrote ${written}, swept ${swept.deletedCount} stale · ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (require.main === module) {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${(error as Error).message}`);
    process.exit(1);
  }
  run(options)
    .then(async () => { await disconnectFromDatabase().catch(() => undefined); process.exit(0); })
    .catch(async (error) => {
      console.error("[udeco-xref] failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}

export { run as refreshUdecoCrossref, parseArgs };
