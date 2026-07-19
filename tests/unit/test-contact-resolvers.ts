// tests/unit/test-contact-resolvers.ts
import assert from "node:assert";
import { createDeiResolver } from "../../src/jobs/enrich/resolvers/dei";
import { extractEmailsFromHtml, createWebsiteResolver } from "../../src/jobs/enrich/resolvers/website";
import { createWebSearchResolver } from "../../src/jobs/enrich/resolvers/web-search";
import { createImpoResolver } from "../../src/jobs/enrich/resolvers/impo";

// Minimal fake of the mongodb Db surface the resolver uses.
function fakeDb(rows: any[]) {
  return {
    collection: () => ({
      findOne: async (q: any) => rows.find(r => r.rut === q.rut) ?? null,
    }),
  } as any;
}

(async () => {
  const db = fakeDb([{ rut: "214843360014", email: "admin@murry.uy", sitioWeb: "https://murry.uy", telefono: "099..." }]);
  const r = createDeiResolver(db);
  assert.equal(r.name, "dei");
  const out = await r.resolve({ supplierId: "R/214843360014", rut: "214843360014", name: "MURRY S A" });
  assert.equal(out.emails.length, 1);
  assert.equal(out.emails[0].email, "admin@murry.uy");
  assert.equal(out.emails[0].source, "dei");
  assert.ok(out.emails[0].confidence >= 0.85);
  assert.equal(out.website, "https://murry.uy");

  // No DEI row → empty result, no throw.
  const empty = await createDeiResolver(fakeDb([])).resolve({ supplierId: "R/x", rut: "999", name: "x" });
  assert.deepEqual(empty.emails, []);
  console.log("ok: dei resolver");
})();

(async () => {
  const html = `
    <a href="mailto:Ventas@empresa.com.uy">escribinos</a>
    <p>Contacto: gerencia@empresa.com.uy y también juan@gmail.com</p>
    <img src="x@2x.png"> <span>soporte@otra-empresa.uy</span>`;
  const cands = extractEmailsFromHtml(html, "empresa.com.uy");
  const emails = cands.map(c => c.email).sort();
  // same-domain emails ranked/higher-confidence; @2x.png is NOT an email; gmail kept but lower.
  assert.ok(emails.includes("ventas@empresa.com.uy"));
  assert.ok(emails.includes("gerencia@empresa.com.uy"));
  assert.ok(!emails.some(e => e.includes("2x.png")));
  const sameDomain = cands.find(c => c.email === "ventas@empresa.com.uy")!;
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

(async () => {
  const search = async (_q: string) => [{ url: "https://empresa.uy/contacto", title: "Empresa", snippet: "escribinos a hola@empresa.uy" }];
  const fetchHtml = async (_u: string) => `<a href="mailto:hola@empresa.uy">x</a>`;
  const r = createWebSearchResolver({ search, fetchHtml });
  assert.equal(r.name, "webSearch");
  const out = await r.resolve({ supplierId: "R/1", rut: "217231960015", name: "ANFANG S R L" });
  assert.ok(out.emails.some(e => e.email === "hola@empresa.uy"));
  assert.ok(out.emails.every(e => e.confidence <= 0.5)); // capped
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
