#!/usr/bin/env tsx
// src/jobs/enrich-supplier-contacts.ts
import { promises as dns } from "node:dns";
import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { SupplierContactModel } from "../../shared/models/supplier_contacts";
import type { ContactResolver, ContactCandidate, ResolverResult } from "./enrich/types";
import { mergeCandidates, pickPrimary, CONNECTIVITY_DNS_ERROR_CODES } from "./enrich/hygiene";
import { deriveRubros } from "./enrich/rubros";
import { createDeiResolver } from "./enrich/resolvers/dei";
import { createRupeResolver } from "./enrich/resolvers/rupe";
import { createWebsiteResolver } from "./enrich/resolvers/website";
import { createWebSearchResolver } from "./enrich/resolvers/web-search";
import { createImpoResolver } from "./enrich/resolvers/impo";
import { createGoogleMapsResolver } from "./enrich/resolvers/google-maps";
import { createGeminiJudge } from "./enrich/match-judge";
import { fetchHtml, search, searchGazette, findPlace, placeDetails } from "./enrich/backends";
import { crawl4aiBaseUrl, createCrawl4aiTransport } from "./enrich/crawl4ai";
import { createWebsiteVerifier } from "./enrich/website-verify";
import type { PlaceInfo } from "./enrich/types";
import type { FieldSource } from "../../shared/models/supplier_contacts";

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
  const wanted = new Set((arg("sources") ?? "dei,rupe,website,webSearch,impo,googleMaps").split(","));

  // DNS canary: if the runtime can't reach a resolver at all, mxValid() will
  // (correctly, per hygiene.ts) return false for every domain over the whole
  // run — draining every primaryEmail to null while the job still exits 0.
  // Prove DNS works, against a name that will always have MX records, before
  // touching the DB.
  try {
    await dns.resolveMx("gmail.com");
  } catch (e: any) {
    if (CONNECTIVITY_DNS_ERROR_CODES.has(e?.code)) {
      console.error(
        "❌ DNS unavailable in this environment; MX validation would mark every email invalid " +
        "— aborting to avoid writing an all-null dataset. Run on a network-capable host.",
      );
      process.exit(1);
    }
    // Anything else (e.g. gmail.com genuinely returning no records) is not a
    // connectivity failure — DNS clearly works enough to give a definitive
    // answer, so proceed.
  }

  await connectToDatabase();
  const db = mongoose.connection.db!;

  // dei → webSearch → website → impo: dei/webSearch may discover a domain
  // that website then deep-crawls; the { ...input, website } threading below
  // carries it forward, and mergeCandidates keeps whichever source has the
  // higher confidence regardless of resolve order.
  // Fetch/search transport: crawl4ai (headless, server-side, JS-capable, paced to
  // avoid rate-limits) when CRAWL4AI_BASE_URL is set; else the direct axios backends.
  const c4Base = crawl4aiBaseUrl();
  const transport = c4Base ? createCrawl4aiTransport({ baseUrl: c4Base }) : null;
  const fetchHtmlX = transport?.fetchHtml ?? fetchHtml;
  const searchX = transport?.search ?? search;
  if (c4Base) console.log(`🕷️  crawl4ai transport: ${c4Base} (min interval ${process.env.CRAWL4AI_MIN_INTERVAL_MS ?? 1500}ms)`);
  else console.warn("⚠️ CRAWL4AI_BASE_URL unset — using direct axios fetch (no JS render; DuckDuckGo rate-limits sooner).");

  const resolvers: ContactResolver[] = [];
  if (wanted.has("dei")) resolvers.push(createDeiResolver(db));
  // rupe runs right after dei: both are official, in-Mongo, false-positive-free by
  // RUT. DEI's place still wins the first-non-null race for its 2.4k suppliers;
  // rupe fills the ~90% DEI never covers. Emits no emails/website — never clobbers those.
  if (wanted.has("rupe")) resolvers.push(createRupeResolver(db));
  if (wanted.has("webSearch")) {
    // Website discovery is verified when a Gemini key is present (match-score
    // prefilter → judge, fails closed); without it, discovery runs UNVERIFIED
    // (first hit that loads) rather than silently accepting a wrong domain.
    const apiKey = process.env.GEMINI_API_KEY;
    const verifyWebsite = apiKey ? createWebsiteVerifier({ judge: createGeminiJudge({ apiKey }) }) : undefined;
    if (!apiKey) console.warn("⚠️ webSearch: GEMINI_API_KEY unset — discovered websites are UNVERIFIED (first hit that loads).");
    resolvers.push(createWebSearchResolver({
      search: searchX,
      fetchHtml: fetchHtmlX,
      ...(verifyWebsite ? { verifyWebsite } : {}),
    }));
  }
  if (wanted.has("website")) resolvers.push(createWebsiteResolver(fetchHtmlX));
  if (wanted.has("impo")) resolvers.push(createImpoResolver(searchGazette));
  // googleMaps runs LAST so DEI's official address/geo/phone win the first-non-null
  // race; Maps only fills the gap. Needs GEMINI_API_KEY for the match judge.
  if (wanted.has("googleMaps")) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ googleMaps requested but GEMINI_API_KEY is unset — skipping the match judge would accept false matches; resolver NOT registered.");
    } else {
      resolvers.push(createGoogleMapsResolver({ findPlace, placeDetails, judge: createGeminiJudge({ apiKey }) }));
    }
  }

  // Candidate suppliers by spend priority, skipping fresh ones.
  const staleBefore = new Date(Date.now() - staleDays * 864e5);
  const suppliers = await db.collection("supplier_patterns")
    .find({}, { projection: { supplierId: 1, name: 1, totalValue: 1, totalContracts: 1 } })
    .sort({ totalValue: -1 })
    .limit(limit * 4) // over-fetch; we filter fresh ones below
    .toArray();

  let processed = 0;
  let errors = 0;
  for (const s of suppliers) {
    if (processed >= limit) break;
    const supplierId = String(s.supplierId);
    const priorityScore = Number(s.totalValue ?? 0) / Math.max(1, Number(s.totalContracts ?? 1));
    if (priorityScore < minPriority) continue;

    // Resolvers are already individually guarded (the .catch below); this
    // guards the DB ops so a transient Mongo error on ONE supplier doesn't
    // abort the whole batch.
    try {
      const existing = await SupplierContactModel.findOne({ supplierId }, { enrichedAt: 1, status: 1, website: 1 }).lean();
      if (existing && existing.status !== "pending" && existing.enrichedAt && existing.enrichedAt > staleBefore) continue;

      const rut = digits(supplierId);
      const name = String(s.name ?? "");
      const input = { supplierId, rut, name, website: null as string | null };

      // DEI first (may supply the website the later resolvers use); a
      // domain found on an earlier run is reused too, so a stale re-run
      // doesn't lose it.
      const all: ContactCandidate[] = [];
      let website: string | null = existing?.website ?? null;
      let websiteSource: FieldSource | null = existing?.websiteSource ?? null;
      let phone: string | null = null;
      let phoneSource: FieldSource | null = null;
      let place: PlaceInfo | null = null;
      for (let i = 0; i < resolvers.length; i++) {
        const r = resolvers[i];
        const res: ResolverResult = await r.resolve({ ...input, website }).catch((): ResolverResult => ({ emails: [] as ContactCandidate[] }));
        all.push(...res.emails);
        if (!website && res.website) { website = res.website; websiteSource = res.websiteSource ?? null; }
        if (!phone && res.phone) { phone = res.phone; phoneSource = res.phoneSource ?? null; }
        if (!place && res.place) place = res.place;
        // Throttle external calls, but not after the LAST resolver — that
        // sleep was pure dead time, wasting ~1/3 of runtime at full scale.
        // dei + rupe are in-Mongo lookups (no external call) → no throttle.
        const inMongo = r.name === "dei" || r.name === "rupe";
        if (i < resolvers.length - 1) await sleep(inMongo ? 0 : 800);
      }

      const emails = await mergeCandidates(all);
      const primaryEmail = pickPrimary(emails);
      const rubros = await deriveRubros(db, supplierId, 5).catch(() => []);
      const status = emails.length ? "enriched" : "no_contact";

      processed++;
      if (dryRun) {
        console.log(`${processed}. ${name} — ${primaryEmail ?? "(none)"} [${emails.length} email(s), ${rubros.length} rubro(s)]${place ? ` 📍${place.source}${phone ? " 📞" : ""}` : ""}`);
        continue;
      }
      await SupplierContactModel.updateOne(
        { supplierId },
        { $set: {
          supplierId, rut, name, emails, primaryEmail, website, websiteSource, phone, phoneSource,
          address: place?.address ?? null,
          locality: place?.locality ?? null,
          lat: place?.lat ?? null,
          lng: place?.lng ?? null,
          hours: place?.hours ?? null,
          mapsUrl: place?.mapsUrl ?? null,
          placeId: place?.placeId ?? null,
          placeSource: place?.source ?? null,
          rubros, status, priorityScore, enrichedAt: new Date(),
        } },
        { upsert: true },
      );
      if (processed % 25 === 0) console.log(`   …${processed}/${limit}`);
    } catch (e) {
      errors++;
      console.error(`   ⚠️ supplier ${supplierId} failed, skipping:`, e instanceof Error ? e.message : e);
    }
  }

  const withEmail = await SupplierContactModel.countDocuments({ primaryEmail: { $ne: null } });
  console.log(`✅ processed ${processed}; supplier_contacts with a primary email: ${withEmail}; errors: ${errors}`);
  await disconnectFromDatabase();
}

main().catch(e => { console.error("❌ enrich-supplier-contacts failed:", e); process.exit(1); });
