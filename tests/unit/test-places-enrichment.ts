// tests/unit/test-places-enrichment.ts
// Match-score prefilter + Gemini match-judge (stubbed) + googleMaps resolver (fake
// backends). No network, no DB — mirrors the node:assert convention of the repo.
import assert from "node:assert";
import {
  normalizeCompanyName, contentTokens, scoreMatch, scoreAddressOverlap,
  addressInUruguay, ADDRESS_MATCH_SCORE, HIGH_SCORE, LOW_SCORE,
} from "../../src/jobs/enrich/match-score";
import { createGeminiJudge, type MatchPair } from "../../src/jobs/enrich/match-judge";
import { createGoogleMapsResolver, googleMapsQueries } from "../../src/jobs/enrich/resolvers/google-maps";
import { withMapsRetry, type PlaceCandidate, type PlaceDetails } from "../../src/jobs/enrich/backends";

// --- Maps rate-limit retry --------------------------------------------------
(async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withMapsRetry(async () => {
    calls++;
    if (calls === 1) {
      throw { response: { status: 429, headers: { "retry-after": "2" } } };
    }
    return "ok";
  }, {
    attempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 3000,
    random: () => 0,
    sleep: async delay => { delays.push(delay); },
  });
  assert.equal(result, "ok");
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000], "Retry-After must override the shorter exponential delay");

  let badRequestCalls = 0;
  await assert.rejects(
    withMapsRetry(async () => {
      badRequestCalls++;
      throw { response: { status: 400, headers: {} } };
    }, { attempts: 5, sleep: async () => undefined }),
  );
  assert.equal(badRequestCalls, 1, "non-transient 4xx responses must not be retried");
  console.log("ok: Maps 429 retry");
})();

// --- match-score ------------------------------------------------------------
(async () => {
  // Accent fold + legal-suffix stripping.
  assert.equal(normalizeCompanyName("GARINO HNÓS. S.A."), "garino hnos s a");
  assert.deepEqual(contentTokens("GARINO HNOS S A"), ["garino"]); // hnos/s/a are legal/short → dropped

  // Exact-ish name → high band (accept without LLM). "GARINO HNOS S A" vs "Garino Hnos. S.A."
  assert.ok(scoreMatch("GARINO HNOS S A", "Garino Hnos. S.A.") >= HIGH_SCORE);

  // Letter-spaced acronym is glued back so the identifying token survives; the real
  // match "AGAM LIMITADA" vs "Laboratorio Agam Ltda." is no longer auto-rejected.
  assert.equal(contentTokens("A G A M LIMITADA").join(","), "agam"); // not [] anymore
  const agam = scoreMatch("A G A M LIMITADA", "Laboratorio Agam Ltda.");
  assert.ok(agam > LOW_SCORE, `AGAM should not be auto-rejected, got ${agam}`);
  // "C I E M S A CONSTRUCCIONES…" vs "CIEMSA" lands in the uncertain band (→ judge).
  const ciemsa = scoreMatch("C I E M S A CONSTRUCCIONES E INSTALACIONES", "CIEMSA");
  assert.ok(ciemsa > LOW_SCORE && ciemsa < HIGH_SCORE, `CIEMSA should be uncertain, got ${ciemsa}`);

  // Clear non-match → low band (auto-reject). "SURYPARK S.A." vs "SoluPark".
  assert.ok(scoreMatch("SURYPARK S.A.", "SoluPark") <= LOW_SCORE);

  // Geographic gate.
  assert.ok(addressInUruguay("Bolonia 2280, 11500 Montevideo, Uruguay"));
  assert.ok(!addressInUruguay("Via Stradonetto, 185, Pescara PE, Italy"));
  assert.ok(!addressInUruguay(null));
  assert.ok(
    scoreAddressOverlap(
      "Cnel. Brandzen 1956, Montevideo",
      "Coronel Brandzen 1956, Montevideo, Uruguay",
    ) >= ADDRESS_MATCH_SCORE,
  );
  assert.ok(
    scoreAddressOverlap(
      "3, PLACES DES BERGUES, 1211 GENEVA",
      "Pl. des Bergues 3, 1201 Genève, Switzerland",
    ) >= ADDRESS_MATCH_SCORE,
  );
  assert.ok(scoreAddressOverlap("Brandzen 1956, Montevideo", "Ruta 8, Pando") < ADDRESS_MATCH_SCORE);
  console.log("ok: match-score");
})();

// --- match-judge (stubbed Gemini) ------------------------------------------
(async () => {
  // Empty input → no call, empty map.
  let calls = 0;
  const countingCall = (async () => { calls++; return { data: { verdicts: [] }, usage: { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 } }; }) as any;
  const emptyJudge = createGeminiJudge({ apiKey: "k", call: countingCall });
  assert.equal((await emptyJudge([])).size, 0);
  assert.equal(calls, 0, "judge must not call Gemini for empty input");

  // Verdicts are de-multiplexed by index.
  let lastPrompt = "";
  const call = (async (opts: any) => {
    lastPrompt = opts.prompt as string;
    // echo a match for the item whose candidate contains "agam"
    const verdicts = (opts.prompt as string).split("\n").map((line: string) => {
      const i = Number(line.split(".")[0]);
      const match = /agam/i.test(line);
      return { i, match, conf: match ? 0.9 : 0.2 };
    });
    return { data: { verdicts }, usage: { promptTokens: 1, candidatesTokens: 1, totalTokens: 2 } };
  }) as any;
  const judge = createGeminiJudge({ apiKey: "k", call });
  const pairs: MatchPair[] = [
    {
      i: 0,
      name: "AGAM LIMITADA",
      candidate: "Laboratorio Agam Ltda.",
      expectedAddress: "Camino Carrasco 123",
      address: "Camino Carrasco 123, Montevideo, Uruguay",
    },
    { i: 1, name: "SURYPARK S.A.", candidate: "SoluPark", address: "Montevideo, Uruguay" },
  ];
  const verdicts = await judge(pairs);
  assert.equal(verdicts.get(0)?.match, true);
  assert.equal(verdicts.get(1)?.match, false);
  assert.match(lastPrompt, /direcciones_conocidas="Camino Carrasco 123"/);
  assert.match(lastPrompt, /direccion_candidata="Camino Carrasco 123, Montevideo, Uruguay"/);

  // A throwing Gemini call must not accept anything (fail closed).
  const throwing = createGeminiJudge({ apiKey: "k", call: (async () => { throw new Error("boom"); }) as any });
  assert.equal((await throwing(pairs)).size, 0);
  console.log("ok: match-judge");
})();

// --- googleMaps resolver ----------------------------------------------------
const DETAILS: PlaceDetails = {
  name: "Garino Hnos. S.A.", phone: "+598 2 000 0000", website: "https://garino.com.uy",
  address: "Camino X 100, Montevideo, Uruguay", lat: -34.8, lng: -56.2, hours: "Lun: 9-17", mapsUrl: "https://maps.google.com/?cid=1",
};
function fakeBackends(candidates: PlaceCandidate[], details: PlaceDetails | null = DETAILS) {
  return {
    findPlace: async (_q: string) => candidates,
    placeDetails: async (_id: string) => details,
  };
}
const yesJudge = (async (_p: MatchPair[]) => new Map(_p.map(p => [p.i, { i: p.i, match: true, conf: 0.9 }]))) as any;
const noJudge = (async (_p: MatchPair[]) => new Map()) as any;

(async () => {
  assert.deepEqual(
    googleMapsQueries({
      supplierId: "R/1",
      rut: "216...",
      name: "ACME S.A.",
      knownAddress: "Cnel. Brandzen 1956",
      knownLocality: "Montevideo",
      knownWebsiteAddress: "Av. Italia 1234",
    }),
    [
      "ACME S.A. Cnel. Brandzen 1956, Montevideo",
      "ACME S.A. Av. Italia 1234, Montevideo",
      "ACME S.A. Montevideo",
      "ACME S.A. Uruguay",
    ],
  );

  // High-score candidate → accepted WITHOUT the judge (judge would throw if called).
  const throwJudge = (async () => { throw new Error("judge should not be called"); }) as any;
  const r = createGoogleMapsResolver({ ...fakeBackends([
    { placeId: "p1", name: "Garino Hnos. S.A.", address: "Camino X 100, Montevideo, Uruguay" },
  ]), judge: throwJudge });
  assert.equal(r.name, "googleMaps");
  const out = await r.resolve({ supplierId: "R/1", rut: "216...", name: "GARINO HNOS S A" });
  assert.equal(out.emails.length, 0, "Places supplies no emails");
  assert.equal(out.phone, "+598 2 000 0000");
  assert.equal(out.phoneSource, "googleMaps");
  assert.equal(out.website, "https://garino.com.uy");
  assert.ok(out.place);
  assert.equal(out.place!.source, "googleMaps");
  assert.equal(out.place!.placeId, "p1");
  assert.equal(out.place!.lat, -34.8);

  // Non-UY candidates filtered out → empty, no details fetch.
  const foreign = createGoogleMapsResolver({ ...fakeBackends([
    { placeId: "it", name: "INNOVALUE Srl", address: "Via Stradonetto, Pescara PE, Italy" },
  ]), judge: yesJudge });
  const outF = await foreign.resolve({ supplierId: "R/2", rut: "218121080019", name: "Innovaluy SRL" });
  assert.deepEqual(outF.place ?? null, null);
  assert.equal(outF.emails.length, 0);

  // A foreign RUPE supplier is valid when its registered address matches Maps.
  const vitolDetails: PlaceDetails = {
    ...DETAILS,
    name: "Vitol SA",
    address: "Pl. des Bergues 3, 1201 Genève, Switzerland",
    mapsUrl: "https://maps.google.com/?cid=vitol",
  };
  const foreignSearchOptions: Array<{ locationBias?: string | null } | undefined> = [];
  const foreignRegistered = createGoogleMapsResolver({
    findPlace: async (_query, options) => {
      foreignSearchOptions.push(options);
      return [{
        placeId: "vitol",
        name: "Vitol SA",
        address: "Pl. des Bergues 3, 1201 Genève, Switzerland",
      }];
    },
    placeDetails: async () => vitolDetails,
    judge: throwJudge,
  });
  const outForeignRegistered = await foreignRegistered.resolve({
    supplierId: "X/100",
    rut: "",
    name: "VITOL S.A.",
    knownAddress: "3, PLACES DES BERGUES, 1211 GENEVA",
  });
  assert.equal(outForeignRegistered.place?.placeId, "vitol");
  assert.match(outForeignRegistered.place?.address ?? "", /Bergues/);
  assert.equal(foreignSearchOptions[0]?.locationBias, null);

  // A verified website address can locate a business whose RUPE fiscal address differs.
  let segalerbaPairs: MatchPair[] = [];
  const segalerba = createGoogleMapsResolver({
    findPlace: async query => query.includes("Brandzen")
      ? [{
        placeId: "segalerba",
        name: "Segalerba & Asociados - Estudio Contable",
        address: "C. Cnel. Brandzen 1956, Montevideo, Uruguay",
      }]
      : [],
    placeDetails: async () => ({
      ...DETAILS,
      name: "Segalerba & Asociados - Estudio Contable",
      address: "C. Cnel. Brandzen 1956, Montevideo, Uruguay",
    }),
    judge: async pairs => {
      segalerbaPairs = pairs;
      return new Map([[0, { i: 0, match: true, conf: 0.95 }]]);
    },
  });
  const outSegalerba = await segalerba.resolve({
    supplierId: "R/217210370014",
    rut: "217210370014",
    name: "SEGALERBA VANNI LUCIA",
    knownAddress: "COLONIA 2276",
    knownLocality: "Montevideo",
    knownWebsiteAddress: "Cnel. Brandzen 1956 | 501, MVD",
  });
  assert.equal(outSegalerba.place?.placeId, "segalerba");
  assert.match(segalerbaPairs[0]?.expectedAddress ?? "", /COLONIA 2276/);
  assert.match(segalerbaPairs[0]?.expectedAddress ?? "", /Brandzen 1956/);

  // Same legal name at a contradictory address is not auto-accepted.
  const wrongAddress = createGoogleMapsResolver({ ...fakeBackends([{
    placeId: "wrong",
    name: "ACME S.A.",
    address: "Ruta 8, Pando, Uruguay",
  }]), judge: noJudge });
  const outWrongAddress = await wrongAddress.resolve({
    supplierId: "R/5",
    rut: "2...",
    name: "ACME S.A.",
    knownAddress: "Cnel. Brandzen 1956",
    knownLocality: "Montevideo",
  });
  assert.equal(outWrongAddress.place ?? null, null);

  // If the exact-address query has no result, the broader fallback still runs.
  const attemptedQueries: string[] = [];
  const fallback = createGoogleMapsResolver({
    findPlace: async query => {
      attemptedQueries.push(query);
      return query.endsWith("Uruguay")
        ? [{ placeId: "fallback", name: "ACME S.A.", address: "Montevideo, Uruguay" }]
        : [];
    },
    placeDetails: async () => DETAILS,
    judge: yesJudge,
  });
  const outFallback = await fallback.resolve({
    supplierId: "R/6",
    rut: "2...",
    name: "ACME S.A.",
    knownAddress: "Dirección desactualizada 999",
  });
  assert.equal(outFallback.place?.placeId, "fallback");
  assert.deepEqual(attemptedQueries, [
    "ACME S.A. Dirección desactualizada 999",
    "ACME S.A. Uruguay",
  ]);

  // Uncertain band (CIEMSA ≈ 0.53) + judge says YES → accepted.
  const uncertainYes = createGoogleMapsResolver({ ...fakeBackends([
    { placeId: "cm", name: "CIEMSA", address: "Camino Carrasco, Montevideo, Uruguay" },
  ]), judge: yesJudge });
  const outY = await uncertainYes.resolve({ supplierId: "R/3", rut: "2...", name: "C I E M S A CONSTRUCCIONES E INSTALACIONES" });
  assert.ok(outY.place, "judge YES on uncertain band should accept");

  // Uncertain band + judge says NO → rejected.
  const uncertainNo = createGoogleMapsResolver({ ...fakeBackends([
    { placeId: "cm", name: "CIEMSA", address: "Camino Carrasco, Montevideo, Uruguay" },
  ]), judge: noJudge });
  const outN = await uncertainNo.resolve({ supplierId: "R/4", rut: "2...", name: "C I E M S A CONSTRUCCIONES E INSTALACIONES" });
  assert.equal(outN.place ?? null, null, "judge NO on uncertain band should reject");

  const throttled = createGoogleMapsResolver({
    findPlace: async () => { throw { response: { status: 429, headers: {} } }; },
    placeDetails: async () => DETAILS,
    judge: yesJudge,
  });
  await assert.rejects(
    throttled.resolve({ supplierId: "R/429", rut: "2...", name: "ACME S.A." }),
    "an exhausted Maps throttle must reach the worker so it can avoid checkpointing",
  );
  console.log("ok: googleMaps resolver");
})();
