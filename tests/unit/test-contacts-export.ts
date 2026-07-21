// tests/unit/test-contacts-export.ts
// The public contact directory's serialize layer: every displayable/exportable
// field is surfaced (email + ALL emails, website, phone, locality, ADDRESS,
// rubro), and the ToS strip (googleMaps-sourced phone/website/place) is enforced
// in the one choke point before any export.
import assert from "node:assert";
import { sanitizeContact, toCsv, toJsonExport, toVcard, contactMethods, type PublicContact } from "../../app/server/utils/contacts";

// --- contactMethods: which enrichment methods touched a record (from RAW sources) ---
assert.deepEqual(contactMethods({} as never), []);
assert.deepEqual(
  contactMethods({ emails: [{ source: "dei" } as never], websiteSource: "webSearch", placeSource: "googleMaps" } as never),
  ["dei", "crawl4ai", "googleMaps"], // stable official-first order
);
assert.deepEqual(contactMethods({ emails: [{ source: "website" } as never] } as never), ["crawl4ai"]);
assert.deepEqual(contactMethods({ phoneSource: "rupe" } as never), ["rupe"]);
// a Maps-only record (all its fields get ToS-stripped) still reports the method
assert.deepEqual(contactMethods({ placeSource: "googleMaps" } as never), ["googleMaps"]);
assert.deepEqual(contactMethods({ emails: [{ source: "impo" } as never] } as never), ["impo"]);
// Retained history survives source ranking: Maps may have returned evidence even
// when an official field eventually became the displayed value.
assert.deepEqual(
  contactMethods({ enrichmentMethods: ["googleMaps"], placeSource: "dei" } as never),
  ["dei", "googleMaps"],
);
// Existing rows can be recognized without a backfill when a stable place id remains.
assert.deepEqual(contactMethods({ placeId: "ChIJ-test", placeSource: "dei" } as never), ["dei", "googleMaps"]);

// --- sanitizeContact: web/DEI fields shown, googleMaps fields stripped ---
const webDoc = sanitizeContact({
  supplierId: "R100", rut: "100", name: "ACME SA",
  primaryEmail: "info@acme.uy",
  emails: [
    { email: "info@acme.uy", source: "website", sourceUrl: "https://acme.uy/contacto", mxValid: true, status: "valid", isRoleAccount: true } as never,
    { email: "ventas@acme.uy", source: "webSearch", sourceUrl: "https://directorio.example/acme", mxValid: true, status: "valid", isRoleAccount: false } as never,
    { email: "bounced@acme.uy", source: "website", mxValid: false, status: "suppressed", isRoleAccount: false } as never,
  ],
  website: "https://acme.uy", websiteSource: "webSearch",
  phone: "+59829001234", phoneSource: "dei",
  phones: [
    { phone: "+59829001234", source: "dei", sourceUrl: null, confidence: 0.9 },
    { phone: "2407 0000", source: "website", sourceUrl: "https://acme.uy/contacto", confidence: 0.8 },
  ],
  websitePhone: "2407 0000",
  websiteAddress: "Cnel. Brandzen 1956",
  contactFormUrl: "https://acme.uy/#contacto",
  socialLinks: [{ platform: "instagram", url: "https://instagram.com/acme/", label: "@acme", source: "website", sourceUrl: "https://acme.uy/contacto" }],
  address: "Av. Siempreviva 742", locality: "Montevideo", placeSource: "dei",
  onlyDirectAward: true, directAwardCount: 4,
} as never);
assert.equal(webDoc.website, "https://acme.uy");
assert.equal(webDoc.websiteSource, "webSearch", "provenance of a verified website is surfaced");
assert.equal(webDoc.phone, "+59829001234");
assert.equal(webDoc.phoneSource, "dei", "provenance of phone is surfaced");
assert.equal(webDoc.phones.length, 2, "all independently sourced phones are surfaced");
assert.equal(webDoc.phones[1]?.sourceUrl, "https://acme.uy/contacto");
assert.equal(webDoc.address, "Av. Siempreviva 742");
assert.equal(webDoc.websitePhone, "2407 0000");
assert.equal(webDoc.websiteAddress, "Cnel. Brandzen 1956");
assert.equal(webDoc.contactFormUrl, "https://acme.uy/#contacto");
assert.equal(webDoc.socialLinks[0].platform, "instagram");
assert.equal(webDoc.socialLinks[0].sourceUrl, "https://acme.uy/contacto");
assert.equal(webDoc.email, "info@acme.uy");
assert.equal(webDoc.neverAwarded, false, "default false when the doc doesn't set it");
assert.equal(webDoc.rupeEstado, null);
assert.equal(webDoc.onlyDirectAward, true);
assert.equal(webDoc.directAwardCount, 4);
// suppressed email is dropped; both valid ones remain
assert.equal(webDoc.emails.length, 2);
assert.ok(webDoc.emails.some(e => e.email === "ventas@acme.uy"));
assert.equal(webDoc.emails.find(e => e.email === "ventas@acme.uy")?.sourceUrl, "https://directorio.example/acme");
assert.ok(!webDoc.emails.some(e => e.email === "bounced@acme.uy"));

// googleMaps-sourced phone/website/place must be stripped before display/export
const gmapsDoc = sanitizeContact({
  supplierId: "R200", rut: "200", name: "BETA SA",
  emails: [], website: "https://beta.example", websiteSource: "googleMaps",
  phone: "+59824445555", phoneSource: "googleMaps",
  address: "Rambla 100", locality: "Punta del Este", placeSource: "googleMaps",
} as never);
assert.equal(gmapsDoc.website, null, "googleMaps website stripped");
assert.equal(gmapsDoc.websiteSource, null, "stripped website carries no origin");
assert.equal(gmapsDoc.phone, null, "googleMaps phone stripped");
assert.equal(gmapsDoc.phoneSource, null, "stripped phone carries no origin");
assert.equal(gmapsDoc.address, null, "googleMaps address stripped");

// --- CSV: address column present; all emails joined ---
const csv = toCsv([webDoc]);
const [header, row] = csv.split("\r\n");
assert.ok(header.includes("Dirección"), "CSV must carry a Dirección column");
assert.ok(header.includes("Origen sitio"), "CSV must carry the website-origin column");
assert.ok(!/Fuentes|methods/i.test(header), "method badges are UI-only — never in the export");
assert.ok(!/compra directa|onlyDirectAward/i.test(header), "direct-award badge is UI-only — never in tabular exports");
assert.ok(row.includes("webSearch"), "CSV row carries the website origin");
assert.ok(header.includes("Sitio web") && header.includes("Teléfono"), "website + phone columns");
assert.ok(header.includes("Formulario de contacto") && header.includes("Redes sociales"), "first-party contact details are exported");
assert.ok(row.includes("Av. Siempreviva 742"), "CSV row carries the address");
assert.ok(row.includes("info@acme.uy") && row.includes("ventas@acme.uy"), "CSV Emails column joins ALL emails");
assert.ok(row.includes("https://directorio.example/acme"), "CSV keeps the exact email evidence URL");
assert.ok(row.includes("https://acme.uy/contacto"), "CSV keeps phone/social evidence URLs");

// JSON exposes the full decorated PublicContact shape (the route attaches the
// supplier-pattern signal before it reaches this serializer).
const [jsonContact] = JSON.parse(toJsonExport([webDoc]));
assert.equal(jsonContact.onlyDirectAward, true);
assert.equal(jsonContact.directAwardCount, 4);

// --- vCard: address, all emails, website, phone ---
const vcf = toVcard([webDoc]);
assert.ok(/ADR;TYPE=WORK:.*Av\. Siempreviva 742/.test(vcf), "vCard ADR carries address");
assert.equal((vcf.match(/EMAIL/g) || []).length, 2, "vCard lists all emails");
assert.ok(/URL:https:\/\/acme\.uy/.test(vcf), "vCard URL carries website");
assert.ok(/TEL;TYPE=WORK,VOICE:/.test(vcf), "vCard TEL carries phone");
assert.equal((vcf.match(/TEL;TYPE=WORK,VOICE:/g) || []).length, 2, "vCard keeps official and website phones");
assert.ok(vcf.includes("X-SOCIALPROFILE;TYPE=instagram:"), "vCard carries social profiles");

// A PublicContact still type-checks with address (compile-time guard).
const _typed: PublicContact = webDoc;
void _typed;

// --- RUPE-only "never awarded" row: address-only, chip data present, not ToS-stripped ---
const registryDoc = sanitizeContact({
  supplierId: "R300", rut: "300", name: "GAMMA SA",
  emails: [], website: null, websiteSource: null, phone: null, phoneSource: null,
  address: "Ruta 5 km 30", locality: "Canelones, Canelones", placeSource: "rupe",
  neverAwarded: true, rupeEstado: "ACTIVO",
} as never);
assert.equal(registryDoc.neverAwarded, true);
assert.equal(registryDoc.rupeEstado, "ACTIVO");
assert.equal(registryDoc.address, "Ruta 5 km 30", "rupe placeSource is not ToS-stripped");
assert.equal(registryDoc.email, null);

// --- CSV: "Adjudicó" column reflects neverAwarded (Sí = won an award, No = registry-only) ---
const csv2 = toCsv([webDoc, registryDoc]);
const [header2, row1, row2] = csv2.split("\r\n");
assert.ok(header2.includes("Adjudicó"), "CSV must carry the Adjudicó column");
assert.ok(row1.includes(",Sí,"), "an awarded row shows Adjudicó=Sí");
assert.ok(row2.includes(",No,"), "a never-awarded row shows Adjudicó=No");

console.log("ok: contacts export");
