#!/usr/bin/env tsx
// src/jobs/seed-rupe-only-contacts.ts
//
// Seeds supplier_contacts with RUPE-registered companies that never won an
// award — the "Sin adjudicaciones" tier of the public contact directory (see
// docs/superpowers/specs/2026-07-21-rupe-only-companies-contact-directory-design.md).
// RUPE carries name + fiscal address + estado only (no email/phone/website); the
// seeded row is address-only until a future Tier-2 enrichment pass (not built
// here) finds contact details.
//
// Anti-joins rupe_registry against the awarded-supplier RUT set
// (supplier_patterns), upserts a registry row for every RUT that never won, and
// reconciles the reverse case (a registry row whose company has since won an
// award) by flipping neverAwarded back to false.
if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
  process.env.MONGO_SOCKET_TIMEOUT_MS = String(10 * 60 * 1000);
}
import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { SupplierContactModel } from "../../shared/models/supplier_contacts";
import { accountSuccessfulBulkResult, accountUnorderedBulkError, parseSeedLimit } from "./seed-rupe-only/batch";
import { buildRegistryRow, type RegistryRowSet, type RupeSeedInput } from "./seed-rupe-only/build-row";
import {
  buildAwardedReconciliation,
  buildRegistryUpsert,
  normalizeRupeRut,
  seedableRupeRut,
} from "./seed-rupe-only/operations";

const flag = (name: string) => process.argv.includes(`--${name}`);
const BULK_BATCH_SIZE = 500;

interface SeedCandidate {
  rut: string;
  row: RegistryRowSet;
}

/** Chunk an array for a bounded `$in` (avoids one huge round-trip). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const dryRun = flag("dry-run");
  const onlyActive = flag("only-active");
  const limit = parseSeedLimit(process.argv.slice(2));
  let connected = false;

  try {
    await connectToDatabase();
    connected = true;
    const db = mongoose.connection.db!;

    console.log("📥 loading awarded-supplier RUT set from supplier_patterns...");
    const awardedRuts = new Set<string>();
    const patternsCursor = db.collection("supplier_patterns").find({}, { projection: { supplierId: 1 } });
    for await (const doc of patternsCursor as AsyncIterable<{ supplierId?: string }>) {
      const rut = normalizeRupeRut(doc.supplierId);
      if (rut) awardedRuts.add(rut);
    }
    console.log(`   ${awardedRuts.size} awarded RUTs`);

    const rupeFilter: Record<string, unknown> = onlyActive ? { estado: "ACTIVO" } : {};
    const rupeCursor = db.collection("rupe_registry").find(rupeFilter, {
      projection: {
        rut: 1, denominacionSocial: 1, domicilioFiscal: 1, localidad: 1,
        departamento: 1, estado: 1, lat: 1, lng: 1, placeId: 1, geocodeStatus: 1,
      },
    });

    let seen = 0, processed = 0, upserted = 0, matchedExisting = 0, unclassified = 0;
    let skippedAwarded = 0, errors = 0;
    let pending: SeedCandidate[] = [];

    const flushPending = async () => {
      if (!pending.length) return;
      const batch = pending;
      pending = [];
      const ops = batch.map(({ row }) => buildRegistryUpsert(row));

      try {
        const result = await SupplierContactModel.bulkWrite(ops, { ordered: false, throwOnValidationError: true });
        const accounting = accountSuccessfulBulkResult(result, batch.length);
        processed += accounting.processed;
        upserted += accounting.upserted;
        matchedExisting += accounting.matchedExisting;
        unclassified += accounting.unclassified;
      } catch (error) {
        const accounting = accountUnorderedBulkError(error, batch.length);
        if (!accounting) throw error;
        processed += accounting.successful;
        unclassified += accounting.successful;
        errors += accounting.failures.length;
        for (const failure of accounting.failures) {
          console.error(`   ⚠️ rut ${batch[failure.index]!.rut} failed, skipping: ${failure.message}`);
        }
      }
      console.log(`   …${processed} processed: ${upserted} inserted/upserted, ${matchedExisting} matched existing, ${unclassified} unclassified (${seen} scanned, ${errors} error(s))`);
    };

    for await (const doc of rupeCursor as AsyncIterable<RupeSeedInput>) {
      if (processed >= limit) break;
      seen++;
      const rut = seedableRupeRut(doc.rut, awardedRuts);
      if (!rut) { skippedAwarded++; continue; }

      let row: RegistryRowSet;
      try {
        row = buildRegistryRow({ ...doc, rut });
      } catch (e) {
        errors++;
        console.error(`   ⚠️ rut ${doc.rut} failed, skipping:`, e instanceof Error ? e.message : e);
        continue;
      }
      if (dryRun) {
        processed++;
        if (processed <= 10) console.log(`   would seed: ${row.name} (${row.supplierId}) — ${row.address ?? "(sin dirección)"}`);
        continue;
      }
      pending.push({ rut: doc.rut, row });
      const remaining = limit - processed;
      if (pending.length >= Math.min(BULK_BATCH_SIZE, remaining)) await flushPending();
    }
    if (!dryRun) await flushPending();
    const outcome = dryRun
      ? `${processed} would seed`
      : `${processed} processed (${upserted} inserted/upserted, ${matchedExisting} matched existing, ${unclassified} unclassified)`;
    console.log(`✅ scan complete: ${seen} RUPE rows scanned, ${outcome}, ${skippedAwarded} already-awarded (skipped), ${errors} error(s)`);
    if (errors) throw new Error(`RUPE-only contact seeding completed with ${errors} row error(s)`);

    // Reconcile the reverse case: a row seeded as neverAwarded whose company has
    // since won an award (a later supplier_patterns refresh added it).
    if (!dryRun && awardedRuts.size) {
      console.log("🔄 reconciling neverAwarded → false for RUTs that now have an award...");
      let flipped = 0;
      for (const batch of chunk([...awardedRuts], 5000)) {
        const reconciliation = buildAwardedReconciliation(batch);
        const res = await SupplierContactModel.updateMany(
          reconciliation.filter,
          reconciliation.update,
        );
        flipped += res.modifiedCount;
      }
      console.log(`   ${flipped} row(s) flipped back to awarded`);
    }

    const registryTotal = await SupplierContactModel.countDocuments({ neverAwarded: true });
    console.log(`📊 supplier_contacts rows currently marked neverAwarded: ${registryTotal}`);
  } finally {
    if (connected) await disconnectFromDatabase();
  }
}

main().catch(e => {
  console.error("❌ seed-rupe-only-contacts failed:", e);
  process.exitCode = 1;
});
