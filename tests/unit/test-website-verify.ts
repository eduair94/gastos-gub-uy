// tests/unit/test-website-verify.ts
import assert from "node:assert";
import type { SearchHit } from "../../src/jobs/enrich/resolvers/web-search";
import type { MatchPair, MatchVerdict, JudgeFn } from "../../src/jobs/enrich/match-judge";
import {
  scoreWebsiteCandidate,
  isAggregatorHost,
  isDirectoryUrl,
  websiteSourceRank,
  createWebsiteVerifier,
} from "../../src/jobs/enrich/website-verify";

// provenance ranking: official registry > crawl4ai-verified > places > unverified seed
assert.ok(websiteSourceRank("dei") > websiteSourceRank("webSearch"));
assert.ok(websiteSourceRank("webSearch") > websiteSourceRank("googleMaps"));
assert.ok(websiteSourceRank("webSearch") > websiteSourceRank(null));
assert.equal(websiteSourceRank(null), 0);

const hit = (title: string, url: string): SearchHit => ({ url, title, snippet: title });

// --- scoreWebsiteCandidate: title + domain signals ---
assert.ok(scoreWebsiteCandidate("GARINO HNOS S A", hit("Garino Hnos - Inicio", "https://garinohnos.com.uy")) >= 0.75);
assert.ok(scoreWebsiteCandidate("ANCAP", hit("ANCAP - Contacto", "https://www.ancap.com.uy/2178/1/contacto.html")) >= 0.75);
// unrelated news site → low
assert.ok(scoreWebsiteCandidate("TALLER LOPEZ", hit("Noticias del dia", "https://www.elobservador.com.uy")) < 0.35);

// --- aggregator denylist ---
assert.equal(isAggregatorHost("www.facebook.com"), true);
assert.equal(isAggregatorHost("mercadolibre.com.uy"), true);
assert.equal(isAggregatorHost("uy.linkedin.com"), true);
assert.equal(isAggregatorHost("www.ancap.com.uy"), false);
assert.equal(isAggregatorHost("garinohnos.com.uy"), false);
// data brokers / business directories are not a company's own site
assert.equal(isAggregatorHost("contactout.com"), true);
assert.equal(isAggregatorHost("somosuruguay.com.uy"), true);
assert.equal(isAggregatorHost("rocketreach.co"), true);
assert.equal(isAggregatorHost("www.dnb.com"), true);
assert.equal(isAggregatorHost("emis.com"), true);

// isDirectoryUrl: denied by host OR by a directory path pattern (even on a legit gov domain)
assert.equal(isDirectoryUrl("https://www.dnb.com/business-directory/company-profiles.x.html"), true);
assert.equal(isDirectoryUrl("https://www.emis.com/php/company-profile/UY/x_en_9918878.html"), true);
assert.equal(isDirectoryUrl("https://www.uruguayxxi.gub.uy/en/service-directory/teyma-uruguay-sa/"), true);
// the company's OWN gov page (no directory path) is NOT a directory
assert.equal(isDirectoryUrl("https://www.gub.uy/ministerio-economia-finanzas/direccion-general-casinos"), false);
assert.equal(isDirectoryUrl("https://ciemsa.com.uy/"), false);

// --- verifier ---
const throwingJudge: JudgeFn = async () => { throw new Error("judge must not be called"); };
function recordingJudge(verdicts: Record<number, { match: boolean; conf: number }>): { fn: JudgeFn; calls: MatchPair[][] } {
  const calls: MatchPair[][] = [];
  const fn: JudgeFn = async (pairs) => {
    calls.push(pairs);
    const m = new Map<number, MatchVerdict>();
    for (const p of pairs) {
      const v = verdicts[p.i];
      if (v) m.set(p.i, { i: p.i, match: v.match, conf: v.conf });
    }
    return m;
  };
  return { fn, calls };
}

async function main() {
  // strong ownership (.uy domain carrying the name) → accept WITHOUT calling the judge
  {
    const verify = createWebsiteVerifier({ judge: throwingJudge });
    const url = await verify(
      { name: "CIEMSA CONSTRUCCIONES", rut: "210001234567" },
      [hit("CIEMSA Construcciones SA", "https://www.ciemsa.com.uy")],
    );
    assert.equal(url, "https://www.ciemsa.com.uy");
  }

  // among strong .uy candidates prefer the canonical (shortest label) domain, no judge
  {
    const verify = createWebsiteVerifier({ judge: throwingJudge });
    const url = await verify(
      { name: "TIENDA INGLESA S A", rut: "210001112223" },
      [
        hit("Panel proveedores", "https://paneltiendainglesa.com.uy/contacto.php"),
        hit("Tienda Inglesa", "https://www.tiendainglesa.com.uy/"),
      ],
    );
    assert.equal(url, "https://www.tiendainglesa.com.uy/");
  }

  // namesake on a foreign TLD → goes to the judge; judge says NO → null (fails closed)
  {
    const { fn, calls } = recordingJudge({ 0: { match: false, conf: 0.9 } });
    const verify = createWebsiteVerifier({ judge: fn });
    const url = await verify(
      { name: "INNOVALUY SRL", rut: "210009999001" },
      [hit("Innovaluy - Italian Furniture", "https://www.innovaluy.it")],
    );
    assert.equal(url, null);
    assert.equal(calls.length, 1, "judge should have been consulted");
  }

  // plausible .com, judge says YES → accepted
  {
    const { fn } = recordingJudge({ 0: { match: true, conf: 0.88 } });
    const verify = createWebsiteVerifier({ judge: fn });
    const url = await verify(
      { name: "ACME SERVICIOS SA", rut: "210004440001" },
      [hit("Acme Servicios - Uruguay", "https://www.acmeservicios.com")],
    );
    assert.equal(url, "https://www.acmeservicios.com");
  }

  // judge returns nothing (transport error) → fail closed → null
  {
    const emptyJudge: JudgeFn = async () => new Map();
    const verify = createWebsiteVerifier({ judge: emptyJudge });
    const url = await verify(
      { name: "ACME SERVICIOS SA", rut: "210004440001" },
      [hit("Acme Servicios - Uruguay", "https://www.acmeservicios.com")],
    );
    assert.equal(url, null);
  }

  // all candidates are aggregators → null, judge never called
  {
    const verify = createWebsiteVerifier({ judge: throwingJudge });
    const url = await verify(
      { name: "ANCAP", rut: "210000000001" },
      [hit("ANCAP", "https://www.facebook.com/ANCAPuy"), hit("ANCAP", "https://uy.linkedin.com/company/ancap")],
    );
    assert.equal(url, null);
  }

  // empty hits → null
  {
    const verify = createWebsiteVerifier({ judge: throwingJudge });
    assert.equal(await verify({ name: "X", rut: "1" }, []), null);
  }

  // a directory listing about the company (even a title match) is never the site → null, no judge
  {
    const verify = createWebsiteVerifier({ judge: throwingJudge });
    const url = await verify(
      { name: "TEYMA URUGUAY S A", rut: "210007778889" },
      [
        hit("Teyma Uruguay SA - Uruguay XXI", "https://www.uruguayxxi.gub.uy/en/service-directory/teyma-uruguay-sa/"),
        hit("Teyma Uruguay | Dun & Bradstreet", "https://www.dnb.com/business-directory/company-profiles.teyma.html"),
      ],
    );
    assert.equal(url, null);
  }

  console.log("ok: website verify");
}
main().catch((e) => { console.error(e); process.exit(1); });
