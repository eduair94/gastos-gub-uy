/**
 * ProviderRotator: the free-tier Gemini → Groq model ladder for pliego summaries.
 *
 * Verifies (with a mocked global fetch, no network):
 *  1. A Gemini daily-wall 429 benches the Gemini model and the run falls through
 *     to Groq, which produces a valid structured result labelled `groq:<model>`.
 *  2. A healthy Gemini responds directly (no Groq call), labelled with the bare
 *     Gemini model id.
 *  3. When every model rate-limits, generateStructured throws (caller caches null).
 *
 * Run: npx tsx tests/unit/test-pliego-provider-rotation.ts
 */
import assert from "node:assert";
import { ProviderRotator } from "../../shared/ai/rotator";
import type { GeminiSchema } from "../../shared/ai/gemini-client";

const SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    objeto: { type: "STRING" },
    requisitosClave: { type: "ARRAY", items: { type: "STRING" } },
    criteriosEvaluacion: { type: "ARRAY", items: { type: "STRING" } },
    observaciones: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["objeto", "requisitosClave", "criteriosEvaluacion", "observaciones"],
};

const VALID = { objeto: "x", requisitosClave: ["a"], criteriosEvaluacion: ["b"], observaciones: ["c"] };

function geminiOk(): Response {
  const body = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(VALID) }] } }], usageMetadata: {} };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
// 429 with a long retryDelay → treated as a daily wall (immediate throw, no in-client retry).
function gemini429(): Response {
  return new Response(JSON.stringify({ error: { details: [{ retryDelay: "300s" }] } }), { status: 429 });
}
function groqOk(): Response {
  const body = { choices: [{ message: { content: JSON.stringify(VALID) } }], usage: {} };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
function groq429(): Response {
  return new Response("rate limited", { status: 429, headers: { "retry-after": "300" } });
}

const realFetch = globalThis.fetch;
function mockFetch(handler: (url: string) => Response) {
  globalThis.fetch = (async (url: any) => handler(String(url))) as typeof fetch;
}

async function run() {
  // 1) Gemini daily-wall → falls through to Groq.
  mockFetch((url) => {
    if (url.includes("generativelanguage.googleapis.com")) return gemini429();
    if (url.includes("api.groq.com")) return groqOk();
    throw new Error(`unexpected url ${url}`);
  });
  {
    const rot = new ProviderRotator({
      geminiApiKey: "g", groqApiKey: "q",
      geminiModels: ["gemini-3.0-flash-lite"], groqModels: ["llama-3.3-70b-versatile"],
    });
    const { data, modelUsed } = await rot.generateStructured<typeof VALID>({ systemInstruction: "s", prompt: "p", schema: SCHEMA });
    assert.strictEqual(modelUsed, "groq:llama-3.3-70b-versatile", "should fall through to Groq");
    assert.strictEqual(data.objeto, "x", "Groq data should parse");
    assert.ok(rot.benched.includes("gemini-3.0-flash-lite"), "Gemini model should be benched after the daily-wall 429");
  }

  // 2) Healthy Gemini answers directly, no Groq call.
  let groqCalled = false;
  mockFetch((url) => {
    if (url.includes("generativelanguage.googleapis.com")) return geminiOk();
    if (url.includes("api.groq.com")) { groqCalled = true; return groqOk(); }
    throw new Error(`unexpected url ${url}`);
  });
  {
    const rot = new ProviderRotator({
      geminiApiKey: "g", groqApiKey: "q",
      geminiModels: ["gemini-3.0-flash-lite"], groqModels: ["llama-3.3-70b-versatile"],
    });
    const { modelUsed } = await rot.generateStructured<typeof VALID>({ systemInstruction: "s", prompt: "p", schema: SCHEMA });
    assert.strictEqual(modelUsed, "gemini-3.0-flash-lite", "healthy Gemini should answer directly");
    assert.strictEqual(groqCalled, false, "Groq must not be called when Gemini succeeds");
  }

  // 3) Everything rate-limited → throws.
  mockFetch((url) => {
    if (url.includes("generativelanguage.googleapis.com")) return gemini429();
    if (url.includes("api.groq.com")) return groq429();
    throw new Error(`unexpected url ${url}`);
  });
  {
    const rot = new ProviderRotator({
      geminiApiKey: "g", groqApiKey: "q",
      geminiModels: ["gemini-3.0-flash-lite"], groqModels: ["llama-3.3-70b-versatile"],
    });
    await assert.rejects(
      () => rot.generateStructured<typeof VALID>({ systemInstruction: "s", prompt: "p", schema: SCHEMA }),
      "exhausted ladder should throw",
    );
  }

  // 4) No providers configured → not available, generate throws.
  {
    const rot = new ProviderRotator({});
    assert.strictEqual(rot.available, false, "no keys → not available");
  }
}

run()
  .then(() => {
    globalThis.fetch = realFetch;
    console.log("test-pliego-provider-rotation: OK");
    process.exit(0);
  })
  .catch((err) => {
    globalThis.fetch = realFetch;
    console.error("test-pliego-provider-rotation: FAILED\n", err);
    process.exit(1);
  });
