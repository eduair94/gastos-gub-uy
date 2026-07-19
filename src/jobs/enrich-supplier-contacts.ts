#!/usr/bin/env tsx
// src/jobs/enrich-supplier-contacts.ts
import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { SupplierContactModel } from "../../shared/models/supplier_contacts";
import type { ContactResolver, ContactCandidate, ResolverResult } from "./enrich/types";
import { mergeCandidates, pickPrimary } from "./enrich/hygiene";
import { deriveRubros } from "./enrich/rubros";
import { createDeiResolver } from "./enrich/resolvers/dei";
import { createWebsiteResolver } from "./enrich/resolvers/website";
import { createWebSearchResolver } from "./enrich/resolvers/web-search";
import { createImpoResolver } from "./enrich/resolvers/impo";
import { fetchHtml, search, searchGazette } from "./enrich/backends";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const digits = (s: string) => (s || "").replace(/\D/g, "");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const dryRun = flag("dry-run");
  const limit = Number(arg("limit") ?? "100");
  const minPriority = Number(arg("minPriority") ?? "0");
  const staleDays = Number(arg("stale-days") ?? "90");
  const wanted = new Set((arg("sources") ?? "dei,website,webSearch,impo").split(","));

  await connectToDatabase();
  const db = mongoose.connection.db!;

  const resolvers: ContactResolver[] = [];
  if (wanted.has("dei")) resolvers.push(createDeiResolver(db));
  if (wanted.has("website")) resolvers.push(createWebsiteResolver(fetchHtml));
  if (wanted.has("webSearch")) resolvers.push(createWebSearchResolver({ search, fetchHtml }));
  if (wanted.has("impo")) resolvers.push(createImpoResolver(searchGazette));

  // Candidate suppliers by spend priority, skipping fresh ones.
  const staleBefore = new Date(Date.now() - staleDays * 864e5);
  const suppliers = await db.collection("supplier_patterns")
    .find({}, { projection: { supplierId: 1, name: 1, totalValue: 1, totalContracts: 1 } })
    .sort({ totalValue: -1 })
    .limit(limit * 4) // over-fetch; we filter fresh ones below
    .toArray();

  let processed = 0;
  for (const s of suppliers) {
    if (processed >= limit) break;
    const supplierId = String(s.supplierId);
    const priorityScore = Number(s.totalValue ?? 0) / Math.max(1, Number(s.totalContracts ?? 1));
    if (priorityScore < minPriority) continue;

    const existing = await SupplierContactModel.findOne({ supplierId }, { enrichedAt: 1, status: 1 }).lean();
    if (existing && existing.status !== "pending" && existing.enrichedAt && existing.enrichedAt > staleBefore) continue;

    const rut = digits(supplierId);
    const name = String(s.name ?? "");
    const input = { supplierId, rut, name, website: null as string | null };

    // DEI first (may supply the website the later resolvers use).
    const all: ContactCandidate[] = [];
    let website: string | null = null;
    let phone: string | null = null;
    for (const r of resolvers) {
      const res: ResolverResult = await r.resolve({ ...input, website }).catch((): ResolverResult => ({ emails: [] as ContactCandidate[] }));
      all.push(...res.emails);
      if (!website && res.website) website = res.website;
      if (!phone && res.phone) phone = res.phone;
      await sleep(r.name === "dei" ? 0 : 800); // throttle external calls
    }

    const emails = await mergeCandidates(all);
    const primaryEmail = pickPrimary(emails);
    const rubros = await deriveRubros(db, supplierId, 5).catch(() => []);
    const status = emails.length ? "enriched" : "no_contact";

    processed++;
    if (dryRun) {
      console.log(`${processed}. ${name} — ${primaryEmail ?? "(none)"} [${emails.length} email(s), ${rubros.length} rubro(s)]`);
      continue;
    }
    await SupplierContactModel.updateOne(
      { supplierId },
      { $set: { supplierId, rut, name, emails, primaryEmail, website, phone, rubros, status, priorityScore, enrichedAt: new Date() } },
      { upsert: true },
    );
    if (processed % 25 === 0) console.log(`   …${processed}/${limit}`);
  }

  const withEmail = await SupplierContactModel.countDocuments({ primaryEmail: { $ne: null } });
  console.log(`✅ processed ${processed}; supplier_contacts with a primary email: ${withEmail}`);
  await disconnectFromDatabase();
}

main().catch(e => { console.error("❌ enrich-supplier-contacts failed:", e); process.exit(1); });
