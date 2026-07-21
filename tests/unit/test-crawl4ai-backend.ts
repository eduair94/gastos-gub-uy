// tests/unit/test-crawl4ai-backend.ts
import assert from "node:assert";
import {
  parseDdgMarkdown,
  crawl4aiBaseUrl,
  createCrawl4aiTransport,
} from "../../src/jobs/enrich/crawl4ai";

// A real fragment of what crawl4ai's /md returns for the DDG HTML endpoint:
// results are `[title](https://duckduckgo.com/l/?uddg=<ENCODED REAL URL>&…)`.
const DDG_MD = `
##  [ANCAP - Contacto](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.ancap.com.uy%2F2178%2F1%2Fcontacto.html&rut=e30fba)
[ www.ancap.com.uy/2178/1/contacto.html ](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.ancap.com.uy%2F2178%2F1%2Fcontacto.html&rut=e30fba)
##  [Datos de Contacto - ANCAP](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.ancap.com.uy%2F6169%2F1%2Fdatos%2Dde%2Dcontacto.html&rut=50001b)
##  [ANCAP Facebook](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.facebook.com%2FANCAPuy&rut=aaa)
`;

// --- parseDdgMarkdown: decode uddg, dedup, order preserved ---
const hits = parseDdgMarkdown(DDG_MD);
assert.ok(hits.length >= 3, `expected >=3 hits, got ${hits.length}`);
assert.equal(hits[0].url, "https://www.ancap.com.uy/2178/1/contacto.html");
assert.equal(hits[1].url, "https://www.ancap.com.uy/6169/1/datos-de-contacto.html");
assert.equal(hits[2].url, "https://www.facebook.com/ANCAPuy");
// deduped: the 2178 URL appears twice in the md (heading + bare link) → one hit
assert.equal(hits.filter(h => h.url.includes("2178")).length, 1);
// title carried through
assert.ok(/ANCAP/i.test(hits[0].title));

// empty / no results → []
assert.deepEqual(parseDdgMarkdown(""), []);
assert.deepEqual(parseDdgMarkdown("no results here"), []);

// --- crawl4aiBaseUrl: env, trimmed, null when empty ---
const savedEnv = process.env.CRAWL4AI_BASE_URL;
process.env.CRAWL4AI_BASE_URL = "  https://crawl4ai.example  ";
assert.equal(crawl4aiBaseUrl(), "https://crawl4ai.example");
delete process.env.CRAWL4AI_BASE_URL;
assert.equal(crawl4aiBaseUrl(), null);
process.env.CRAWL4AI_BASE_URL = "";
assert.equal(crawl4aiBaseUrl(), null);
if (savedEnv === undefined) delete process.env.CRAWL4AI_BASE_URL;
else process.env.CRAWL4AI_BASE_URL = savedEnv;

// --- transport over an injected fetch ---
interface Rec { url: string; body: any; at: number }
function fakeFetch(records: Rec[], respond: (url: string, body: any) => any) {
  return async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    records.push({ url, body, at: Date.now() });
    const payload = respond(url, body);
    if (payload === "THROW") throw new Error("network");
    if (payload && payload.__status && payload.__status >= 400) {
      return { ok: false, status: payload.__status, json: async () => ({}) } as any;
    }
    return { ok: true, status: 200, json: async () => payload } as any;
  };
}

async function main() {
  // fetchHtml posts to /crawl and returns the rendered raw HTML so link
  // attributes survive for social-profile extraction.
  {
    const recs: Rec[] = [];
    const t = createCrawl4aiTransport({
      baseUrl: "https://c4.test",
      minIntervalMs: 0,
      fetchImpl: fakeFetch(recs, (_u, b) => ({ success: true, results: [{ url: b.urls[0], html: "<p>hola contacto@x.uy</p>" }] })),
    });
    const html = await t.fetchHtml("https://foo.uy/contacto");
    assert.equal(html, "<p>hola contacto@x.uy</p>");
    assert.ok(recs[0].url.endsWith("/crawl"), `posted to ${recs[0].url}`);
    assert.deepEqual(recs[0].body.urls, ["https://foo.uy/contacto"]);
  }

  // fetchHtml swallows transport errors and HTTP errors → null
  {
    const t1 = createCrawl4aiTransport({ baseUrl: "https://c4.test", minIntervalMs: 0, fetchImpl: fakeFetch([], () => "THROW") });
    assert.equal(await t1.fetchHtml("https://foo.uy"), null);
    const t2 = createCrawl4aiTransport({ baseUrl: "https://c4.test", minIntervalMs: 0, fetchImpl: fakeFetch([], () => ({ __status: 500 })) });
    assert.equal(await t2.fetchHtml("https://foo.uy"), null);
  }

  // search posts to /md and parses the DDG markdown
  {
    const recs: Rec[] = [];
    const t = createCrawl4aiTransport({
      baseUrl: "https://c4.test",
      minIntervalMs: 0,
      fetchImpl: fakeFetch(recs, () => ({ markdown: DDG_MD, success: true })),
    });
    const found = await t.search("ANCAP uruguay contacto");
    assert.ok(found.length >= 3);
    assert.equal(found[0].url, "https://www.ancap.com.uy/2178/1/contacto.html");
    assert.ok(recs[0].url.endsWith("/md"), `posted to ${recs[0].url}`);
    // query encoded into the DDG url inside the posted body
    assert.ok(String(recs[0].body.url).includes("duckduckgo.com"));
  }

  // pacer: two calls spaced by >= minIntervalMs
  {
    const recs: Rec[] = [];
    const t = createCrawl4aiTransport({
      baseUrl: "https://c4.test",
      minIntervalMs: 50,
      fetchImpl: fakeFetch(recs, (_u, b) => ({ results: [{ url: b.urls[0], html: "x" }] })),
    });
    await t.fetchHtml("https://a.uy");
    await t.fetchHtml("https://b.uy");
    const gap = recs[1].at - recs[0].at;
    assert.ok(gap >= 45, `expected >=~50ms between paced calls, got ${gap}ms`);
  }

  console.log("ok: crawl4ai backend");
}
main().catch((e) => { console.error(e); process.exit(1); });
