// tests/unit/test-contact-resolvers.ts
import assert from "node:assert";
import { createDeiResolver } from "../../src/jobs/enrich/resolvers/dei";
import { extractEmailsFromHtml, createWebsiteResolver } from "../../src/jobs/enrich/resolvers/website";
import { createWebSearchResolver } from "../../src/jobs/enrich/resolvers/web-search";
import { createImpoResolver } from "../../src/jobs/enrich/resolvers/impo";
import { extractWebsiteContactDetails } from "../../src/jobs/enrich/website-contact-details";

// Minimal fake of the mongodb Db surface the resolver uses.
function fakeDb(rows: any[]) {
  return {
    collection: () => ({
      findOne: async (q: any) => rows.find(r => r.rut === q.rut) ?? null,
    }),
  } as any;
}

(async () => {
  const db = fakeDb([{
    rut: "214843360014", email: "admin@murry.uy", sitioWeb: "https://murry.uy", telefono: "099...",
    direccion: "Av. Italia 1234", lat: -34.9, lng: -56.1, localidad: "Montevideo", departamento: "Montevideo",
  }]);
  const r = createDeiResolver(db);
  assert.equal(r.name, "dei");
  const out = await r.resolve({ supplierId: "R/214843360014", rut: "214843360014", name: "MURRY S A" });
  assert.equal(out.emails.length, 1);
  assert.equal(out.emails[0].email, "admin@murry.uy");
  assert.equal(out.emails[0].source, "dei");
  assert.ok(out.emails[0].confidence >= 0.85);
  assert.equal(out.website, "https://murry.uy");
  // Rescued address/geo — previously discarded — with dei provenance.
  assert.equal(out.phoneSource, "dei");
  assert.equal(out.phones?.length, 1);
  assert.equal(out.phones?.[0]?.source, "dei");
  assert.ok(out.place, "expected a place block from the rescued DEI fields");
  assert.equal(out.place!.source, "dei");
  assert.equal(out.place!.address, "Av. Italia 1234");
  assert.equal(out.place!.lat, -34.9);
  assert.equal(out.place!.locality, "Montevideo, Montevideo");

  // No DEI row → empty result, no throw. rut must be length >= 8 so this
  // genuinely exercises the findOne → null branch (not the length guard).
  const empty = await createDeiResolver(fakeDb([])).resolve({ supplierId: "R/x", rut: "99999999", name: "x" });
  assert.deepEqual(empty.emails, []);
  console.log("ok: dei resolver");
})();

(async () => {
  const html = `
    <a href="mailto:Ventas@empresa.com.uy">escribinos</a>
    <p>Contacto: gerencia@empresa.com.uy y también juan@gmail.com</p>
    <img src="x@2x.png"> <span>soporte@otra-empresa.uy</span>`;
  const cands = extractEmailsFromHtml(html, "empresa.com.uy", "https://empresa.com.uy/contacto");
  const emails = cands.map(c => c.email).sort();
  // same-domain emails ranked/higher-confidence; @2x.png is NOT an email; gmail kept but lower.
  assert.ok(emails.includes("ventas@empresa.com.uy"));
  assert.ok(emails.includes("gerencia@empresa.com.uy"));
  assert.ok(!emails.some(e => e.includes("2x.png")));
  const sameDomain = cands.find(c => c.email === "ventas@empresa.com.uy")!;
  assert.equal(sameDomain.sourceUrl, "https://empresa.com.uy/contacto");
  const offDomain = cands.find(c => c.email === "juan@gmail.com");
  if (offDomain) assert.ok(sameDomain.confidence > offDomain.confidence);

  // resolver walks home + /contacto via the injected fetcher, no network.
  const fetcher = async (url: string) =>
    url.includes("/contacto") ? `<a href="mailto:hola@empresa.com.uy">x</a>` : html;
  const r = createWebsiteResolver(fetcher);
  const out = await r.resolve({ supplierId: "R/1", rut: "1", name: "Empresa", website: "https://empresa.com.uy" });
  assert.ok(out.emails.some(e => e.email === "hola@empresa.com.uy"));
  assert.equal(r.name, "website");

  // No website → empty, no throw.
  const empty = await r.resolve({ supplierId: "R/1", rut: "1", name: "x", website: null });
  assert.deepEqual(empty.emails, []);
  console.log("ok: website resolver");
})();

(() => {
  const html = `
    <section id="contact"><h1>Escribinos</h1>
      <form id="contact-form" name="segalerba-contact">
        <input name="name"><input type="email" name="email"><textarea name="message"></textarea>
      </form>
    </section>
    <footer>
      <div>2407 0000 · 099 195 441</div>
      <div>Cnel. Brandzen 1956 | 501, MVD</div>
      <a>estudio_segalerba</a>
      <a href="https://www.linkedin.com/company/acme">LinkedIn</a>
      <a href="https://www.linkedin.com/company/vitol-b.v./">&lt;img src="linkedin.svg" alt="LinkedIn logo" /&gt;</a>
      <a href="https://facebook.com/acme">Facebook</a>
      <a href="https://wa.me/59899123456">WhatsApp</a>
      <a href="https://github.com/acme">GitHub</a>
      <a href="https://discord.gg/acme">Discord</a>
      <a href="https://linktr.ee/acme">Contactos de ACME</a>
      <a href="https://t.me/acme">Telegram</a>
      <a href="https://www.threads.net/@acme">Threads</a>
    </footer>`;
  const details = extractWebsiteContactDetails(html, "https://segalerba.com.uy/");
  assert.equal(details.phone, "2407 0000");
  assert.deepEqual(details.phones, ["2407 0000", "099 195 441"]);
  assert.equal(details.address, "Cnel. Brandzen 1956 | 501, MVD");
  assert.equal(details.contactFormUrl, "https://segalerba.com.uy/#contact-form");
  assert.ok(details.socialLinks.some(link => link.platform === "instagram" && link.url.includes("estudio_segalerba")));
  assert.ok(details.socialLinks.some(link => link.platform === "linkedin"));
  assert.equal(details.socialLinks.find(link => link.url.includes("vitol-b.v"))?.label, "LinkedIn");
  assert.ok(details.socialLinks.some(link => link.platform === "facebook"));
  assert.ok(details.socialLinks.some(link => link.platform === "whatsapp"));
  assert.ok(details.socialLinks.some(link => link.platform === "github"));
  assert.ok(details.socialLinks.some(link => link.platform === "discord"));
  assert.ok(details.socialLinks.some(link => link.platform === "linktree"));
  assert.ok(details.socialLinks.some(link => link.platform === "telegram"));
  assert.ok(details.socialLinks.some(link => link.platform === "threads"));
  assert.ok(details.socialLinks.every(link => link.source === "website" && link.sourceUrl === "https://segalerba.com.uy/"));
  console.log("ok: website contact details");
})();

(() => {
  // A page without a real contact scope previously promoted the entire body
  // (including CSS) to `websiteAddress`.
  const html = `<main>Avenida Falsa 1234 ${"body{display:block}".repeat(30)}</main>`;
  const details = extractWebsiteContactDetails(html, "https://example.com/");
  assert.equal(details.address, null);
  console.log("ok: oversized website body is not an address");
})();

(() => {
  // Production regression: Grupo Vía Central groups the last four landline
  // digits as 2+2 and wraps the country code, while exposing a canonical tel:.
  const html = `
    <section class="intro-sec contacto-page">
      <p><a href="mailto:contacto@grupoviacentral.com">contacto@grupoviacentral.com</a></p>
      <p><a href="tel:+59829148414">(+598) 2914 84 14</a></p>
    </section>`;
  const details = extractWebsiteContactDetails(html, "https://grupoviacentral.com/contacto/");
  assert.equal(details.phone, "(+598) 2914 84 14");
  assert.deepEqual(details.phones, ["(+598) 2914 84 14"]);
  console.log("ok: website grouped Uruguay phone");
})();

(async () => {
  const search = async (_q: string) => [{ url: "https://empresa.uy/contacto", title: "Empresa", snippet: "escribinos a hola@empresa.uy" }];
  const fetchHtml = async (_u: string) => `<a href="mailto:hola@empresa.uy">x</a>`;
  const r = createWebSearchResolver({ search, fetchHtml });
  assert.equal(r.name, "webSearch");
  const out = await r.resolve({ supplierId: "R/1", rut: "217231960015", name: "ANFANG S R L" });
  assert.ok(out.emails.some(e => e.email === "hola@empresa.uy"));
  assert.ok(out.emails.every(e => e.confidence <= 0.5)); // capped
  assert.ok(out.emails.every(e => e.sourceUrl === "https://empresa.uy/contacto"));
  console.log("ok: web-search resolver");
})();

(async () => {
  const searchGazette = async (_q: string) => [
    "EDICTO ... la sociedad ANFANG SRL, RUT 217231960015, correo admin@cultocafe.uy ...",
    "sin datos de contacto",
  ];
  const r = createImpoResolver(searchGazette);
  assert.equal(r.name, "impo");
  const out = await r.resolve({ supplierId: "R/1", rut: "217231960015", name: "ANFANG S R L" });
  assert.ok(out.emails.some(e => e.email === "admin@cultocafe.uy"));
  assert.ok(out.emails.every(e => e.source === "impo" && e.confidence <= 0.3));
  console.log("ok: impo resolver");
})();
