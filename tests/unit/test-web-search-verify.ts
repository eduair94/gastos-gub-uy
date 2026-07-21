// tests/unit/test-web-search-verify.ts
import assert from "node:assert";
import type { SearchHit } from "../../src/jobs/enrich/resolvers/web-search";
import { createWebSearchResolver } from "../../src/jobs/enrich/resolvers/web-search";

const HITS: SearchHit[] = [
  { url: "https://first-directory.uy", title: "Directorio", snippet: "" },
  { url: "https://real.com.uy", title: "Real SA", snippet: "" },
];

async function main() {
  // WITHOUT a verifier → legacy behaviour: website = first hit whose page loads.
  {
    const resolver = createWebSearchResolver({
      search: async () => HITS,
      fetchHtml: async () => "<p>contacto@real.com.uy</p>",
    });
    const res = await resolver.resolve({ supplierId: "1", rut: "210001", name: "REAL SA" });
    assert.equal(res.website, "https://first-directory.uy");
  }

  // WITH a verifier → website is whatever the verifier returns, over ALL hits.
  {
    let gotInput: any = null;
    let gotHits: SearchHit[] = [];
    const resolver = createWebSearchResolver({
      search: async () => HITS,
      fetchHtml: async () => "<p>contacto@real.com.uy</p>",
      verifyWebsite: async (input, hits) => { gotInput = input; gotHits = hits; return "https://real.com.uy"; },
    });
    const res = await resolver.resolve({ supplierId: "1", rut: "210001", name: "REAL SA" });
    assert.equal(res.website, "https://real.com.uy");
    assert.equal(res.websiteSource, "webSearch", "a verified website is tagged webSearch (provenance)");
    assert.deepEqual(gotInput, { name: "REAL SA", rut: "210001" });
    assert.equal(gotHits.length, 2, "verifier receives all hits, not just the first");
    assert.deepEqual(res.emails.map(e => e.email), ["contacto@real.com.uy"], "directory role accounts are rejected");
  }

  // Verifier returns null (nothing verified) → website is null, not a wrong guess.
  {
    const resolver = createWebSearchResolver({
      search: async () => HITS,
      fetchHtml: async () => "<p>x@y.uy</p>",
      verifyWebsite: async () => null,
    });
    const res = await resolver.resolve({ supplierId: "1", rut: "210001", name: "REAL SA" });
    assert.equal(res.website ?? null, null);
    assert.deepEqual(res.emails.map(e => e.email), ["x@y.uy"], "person-level directory evidence is retained with low confidence");
    assert.equal(res.emails[0]?.confidence, 0.25);
    assert.equal(res.emails[0]?.sourceUrl, "https://first-directory.uy");
  }

  // A verified corporate inbox and a person-level directory contact coexist;
  // each retains the exact page where it was observed.
  {
    const hits: SearchHit[] = [
      { url: "https://uy.todosnegocios.com/entre-lagos", title: "Entre Lagos SA", snippet: "Mariano: mariano.y@gmail.com" },
      { url: "https://entrelagos.uy/contacto", title: "Entre Lagos", snippet: "entrelagos@gmail.com" },
    ];
    const resolver = createWebSearchResolver({
      search: async () => hits,
      fetchHtml: async url => url.includes("todosnegocios")
        ? "<p>mariano.y@gmail.com</p>"
        : "<p>entrelagos@gmail.com</p>",
      verifyWebsite: async () => "https://entrelagos.uy/contacto",
    });
    const res = await resolver.resolve({ supplierId: "1", rut: "214811130013", name: "ENTRE LAGOS SA" });
    assert.deepEqual(res.emails.map(e => e.email).sort(), ["entrelagos@gmail.com", "mariano.y@gmail.com"]);
    assert.equal(res.emails.find(e => e.email === "mariano.y@gmail.com")?.sourceUrl, "https://uy.todosnegocios.com/entre-lagos");
  }

  // A data broker mentioning the supplier must not contribute its own inbox.
  {
    const resolver = createWebSearchResolver({
      search: async () => [{ url: "https://databasesets.com/company/real", title: "REAL SA", snippet: "contact@databasesets.com" }],
      fetchHtml: async () => "<p>contact@databasesets.com</p>",
      verifyWebsite: async () => null,
    });
    const res = await resolver.resolve({ supplierId: "1", rut: "210001", name: "REAL SA" });
    assert.deepEqual(res.emails, []);
  }

  console.log("ok: web-search verify wiring");
}
main().catch((e) => { console.error(e); process.exit(1); });
