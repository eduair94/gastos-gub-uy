/** Scanned-PDF OCR fallback: binary input, model fallback and size guard.
 * Run: npx tsx tests/unit/test-pliego-ocr.ts
 */
import assert from "node:assert/strict";
import { extractScannedPdfText } from "../../shared/services/pliego-ocr";

const realFetch = globalThis.fetch;

async function run(): Promise<void> {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const calledModels: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("comprasestatales.gub.uy")) {
      assert.ok(url.startsWith("https://"), "government PDF must be upgraded to HTTPS");
      return new Response(pdf, { status: 200, headers: { "content-length": String(pdf.length) } });
    }

    const model = decodeURIComponent(url.match(/models\/([^:]+):/)?.[1] ?? "");
    calledModels.push(model);
    const body = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<{ inlineData?: { mimeType: string; data: string } }> }>;
    };
    const binary = body.contents[0]?.parts[1]?.inlineData;
    assert.equal(binary?.mimeType, "application/pdf");
    assert.equal(binary?.data, Buffer.from(pdf).toString("base64"));
    if (model === "retired-model") return new Response("gone", { status: 404 });
    return new Response(JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ text: "  texto OCR  " }) }] } }],
      usageMetadata: {},
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const text = await extractScannedPdfText(
    "http://www.comprasestatales.gub.uy/Aclaraciones/scan.pdf",
    { apiKey: "test", models: ["retired-model", "working-model"] },
  );
  assert.equal(text, "texto OCR");
  assert.deepEqual(calledModels, ["retired-model", "working-model"]);

  let modelCalled = false;
  globalThis.fetch = (async () => {
    if (modelCalled) throw new Error("model must not be called for oversized PDFs");
    modelCalled = true;
    return new Response(new Uint8Array(), {
      status: 200,
      headers: { "content-length": String(13 * 1024 * 1024) },
    });
  }) as typeof fetch;
  assert.equal(await extractScannedPdfText("https://x/huge.pdf", { apiKey: "test" }), null);
}

run()
  .then(() => console.log("test-pliego-ocr: OK"))
  .catch(error => {
    console.error("test-pliego-ocr: FAILED", error);
    process.exitCode = 1;
  })
  .finally(() => { globalThis.fetch = realFetch; });
