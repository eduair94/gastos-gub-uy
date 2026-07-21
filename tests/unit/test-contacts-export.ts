// tests/unit/test-contacts-export.ts
// The public contact directory's serialize layer: every displayable/exportable
// field is surfaced (email + ALL emails, website, phone, locality, ADDRESS,
// rubro), and the ToS strip (googleMaps-sourced phone/website/place) is enforced
// in the one choke point before any export.
import assert from "node:assert";
import { sanitizeContact, toCsv, toVcard, type PublicContact } from "../../app/server/utils/contacts";

// --- sanitizeContact: web/DEI fields shown, googleMaps fields stripped ---
const webDoc = sanitizeContact({
  supplierId: "R100", rut: "100", name: "ACME SA",
  primaryEmail: "info@acme.uy",
  emails: [
    { email: "info@acme.uy", source: "website", mxValid: true, status: "valid", isRoleAccount: true } as never,
    { email: "ventas@acme.uy", source: "webSearch", mxValid: true, status: "valid", isRoleAccount: false } as never,
    { email: "bounced@acme.uy", source: "website", mxValid: false, status: "suppressed", isRoleAccount: false } as never,
  ],
  website: "https://acme.uy", websiteSource: "webSearch",
  phone: "+59829001234", phoneSource: "dei",
  address: "Av. Siempreviva 742", locality: "Montevideo", placeSource: "dei",
} as never);
assert.equal(webDoc.website, "https://acme.uy");
assert.equal(webDoc.websiteSource, "webSearch", "provenance of a verified website is surfaced");
assert.equal(webDoc.phone, "+59829001234");
assert.equal(webDoc.phoneSource, "dei", "provenance of phone is surfaced");
assert.equal(webDoc.address, "Av. Siempreviva 742");
assert.equal(webDoc.email, "info@acme.uy");
// suppressed email is dropped; both valid ones remain
assert.equal(webDoc.emails.length, 2);
assert.ok(webDoc.emails.some(e => e.email === "ventas@acme.uy"));
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
assert.ok(row.includes("webSearch"), "CSV row carries the website origin");
assert.ok(header.includes("Sitio web") && header.includes("Teléfono"), "website + phone columns");
assert.ok(row.includes("Av. Siempreviva 742"), "CSV row carries the address");
assert.ok(row.includes("info@acme.uy; ventas@acme.uy"), "CSV Emails column joins ALL emails");

// --- vCard: address, all emails, website, phone ---
const vcf = toVcard([webDoc]);
assert.ok(/ADR;TYPE=WORK:.*Av\. Siempreviva 742/.test(vcf), "vCard ADR carries address");
assert.equal((vcf.match(/EMAIL/g) || []).length, 2, "vCard lists all emails");
assert.ok(/URL:https:\/\/acme\.uy/.test(vcf), "vCard URL carries website");
assert.ok(/TEL;TYPE=WORK,VOICE:/.test(vcf), "vCard TEL carries phone");

// A PublicContact still type-checks with address (compile-time guard).
const _typed: PublicContact = webDoc;
void _typed;

console.log("ok: contacts export");
