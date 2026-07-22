/** Gemini document-understanding fallback for scanned, image-only PDFs. */
import type { GeminiSchema } from "../ai/gemini-client";
import { callGeminiStructured } from "../ai/gemini-client";
import { normalizePliegoDownloadUrl } from "./pliego-extractor";

const MAX_OCR_PDF_BYTES = 12 * 1024 * 1024;
const DEFAULT_OCR_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];

const OCR_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: { text: { type: "STRING" } },
  required: ["text"],
};

function modelCandidates(value: string | undefined): string[] {
  const configured = (value ?? "").split(",").map(item => item.trim()).filter(Boolean);
  return configured.length ? configured : DEFAULT_OCR_MODELS;
}

export interface PliegoOcrOptions {
  apiKey: string;
  models?: string[] | undefined;
  downloadTimeoutMs?: number | undefined;
  modelTimeoutMs?: number | undefined;
}

/** Returns null when the PDF is too large, unreachable, or every OCR model fails. */
export async function extractScannedPdfText(
  rawUrl: string,
  options: PliegoOcrOptions,
): Promise<string | null> {
  if (!options.apiKey) return null;

  let bytes: Uint8Array;
  try {
    const response = await fetch(normalizePliegoDownloadUrl(rawUrl), {
      signal: AbortSignal.timeout(options.downloadTimeoutMs ?? 30_000),
    });
    if (!response.ok) return null;
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_OCR_PDF_BYTES) return null;
    bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_OCR_PDF_BYTES) return null;
  } catch {
    return null;
  }

  const encoded = Buffer.from(bytes).toString("base64");
  const models = options.models?.length
    ? options.models
    : modelCandidates(process.env.PLIEGO_OCR_GEMINI_MODELS);

  for (const model of models) {
    try {
      const result = await callGeminiStructured<{ text: string }>({
        apiKey: options.apiKey,
        model,
        systemInstruction: "Transcribis documentos oficiales escaneados con fidelidad. No resumas ni inventes contenido.",
        prompt: "Transcribi todo el texto legible de este PDF en espanol, respetando el orden de las paginas.",
        inlineData: [{ mimeType: "application/pdf", data: encoded }],
        schema: OCR_SCHEMA,
        temperature: 0,
        timeoutMs: options.modelTimeoutMs ?? 45_000,
        maxRetries: 0,
      });
      const text = result.data.text.replace(/\u0000/g, "").trim();
      if (text) return text;
    } catch {
      // A retired/rate-limited model must not prevent trying the next candidate.
    }
  }
  return null;
}
