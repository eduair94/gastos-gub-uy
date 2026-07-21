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
import { buildRegistryRow, type RupeSeedInput } from "./seed-rupe-only/build-row";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const digits = (s: string) => (s || "").replace(/\D/g, "");

/** Chunk an array for a bounded `$in` (avoids one huge round-trip). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const dryRun = flag("dry-run");
  const onlyActive = flag("only-active");
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;

  await connectToDatabase();
  const db = mongoose.connection.db!;

  console.log("📥 loading awarded-supplier RUT set from supplier_patterns...");
  const awardedRuts = new Set<string>();
  const patternsCursor = db.collection("supplier_patterns").find({}, { projection: { supplierId: 1 } });
  for await (const doc of patternsCursor as AsyncIterable<{ supplierId?: string }>) {
    const rut = digits(doc.supplierId ?? "");
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

  let seen = 0, seeded = 0, skippedAwarded = 0, errors = 0;
  for await (const doc of rupeCursor as AsyncIterable<RupeSeedInput>) {
    if (seeded >= limit) break;
    seen++;
    const rut = digits(doc.rut);
    if (!rut || awardedRuts.has(rut)) { skippedAwarded++; continue; }

    try {
      const row = buildRegistryRow({ ...doc, rut });
      seeded++;
      if (dryRun) {
        if (seeded <= 10) console.log(`   would seed: ${row.name} (${row.supplierId}) — ${row.address ?? "(sin dirección)"}`);
        continue;
      }
      await SupplierContactModel.updateOne(
        { supplierId: row.supplierId },
        {
          $set: row,
          $setOnInsert: {
            status: "registry",
            priorityScore: 0,
            emails: [],
            primaryEmail: null,
            website: null,
            websiteSource: null,
            phone: null,
            phoneSource: null,
            hours: null,
            mapsUrl: null,
            rubros: [],
            enrichedAt: null,
          },
        },
        { upsert: true },
      );
      if (seeded % 5000 === 0) console.log(`   …${seeded} seeded (${seen} scanned)`);
    } catch (e) {
      errors++;
      console.error(`   ⚠️ rut ${doc.rut} failed, skipping:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`✅ scan complete: ${seen} RUPE rows scanned, ${seeded} seeded, ${skippedAwarded} already-awarded (skipped), ${errors} error(s)`);

  // Reconcile the reverse case: a row seeded as neverAwarded whose company has
  // since won an award (a later supplier_patterns refresh added it).
  if (!dryRun && awardedRuts.size) {
    console.log("🔄 reconciling neverAwarded → false for RUTs that now have an award...");
    let flipped = 0;
    for (const batch of chunk([...awardedRuts], 5000)) {
      const res = await SupplierContactModel.updateMany(
        { neverAwarded: true, rut: { $in: batch } },
        { $set: { neverAwarded: false } },
      );
      flipped += res.modifiedCount;
    }
    console.log(`   ${flipped} row(s) flipped back to awarded`);
  }

  const registryTotal = await SupplierContactModel.countDocuments({ neverAwarded: true });
  console.log(`📊 supplier_contacts rows currently marked neverAwarded: ${registryTotal}`);
  await disconnectFromDatabase();
}

main().catch(e => { console.error("❌ seed-rupe-only-contacts failed:", e); process.exit(1); });
