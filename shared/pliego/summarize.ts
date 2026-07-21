/**
 * AI pliego summarizer (importable from both the batch jobs and the Nitro API).
 * Downloads a call's pliego PDFs, extracts text, and asks a free-tier model
 * (Gemini → Groq ladder, see ProviderRotator) for a structured Spanish summary
 * cached on `open_calls.aiSummary`.
 *
 * GUARDRAIL: the deadline shown to users always comes from the OCDS tenderPeriod,
 * never from this summary. `plazos` here are informational and labeled as such.
 */
import { OpenCallModel } from "../models/open_call";
import type { IOpenCall, IPliegoSummary } from "../types/monitor";
import { extractPdfText, isPdfDocument } from "../services/pliego-extractor";
import { pliegoDocsSignature } from "./docs-signature";
import type { GeminiSchema } from "../ai/gemini-client";
import { ProviderRotator } from "../ai/rotator";

const DISCLAIMER = "Resumen generado por IA. Verificá siempre el pliego oficial.";
const MAX_PDFS = 3;
const MAX_INPUT_CHARS = 60_000;

type GeneratedSummary = Omit<IPliegoSummary, "model" | "generatedAt" | "sourceDocs" | "disclaimer">;

const SUMMARY_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    objeto: { type: "STRING", description: "Qué se licita, en 1-2 frases." },
    requisitosClave: { type: "ARRAY", items: { type: "STRING" }, description: "Requisitos de admisibilidad clave." },
    plazos: {
      type: "OBJECT",
      properties: {
        recepcionOfertas: { type: "STRING", nullable: true },
        aperturaOfertas: { type: "STRING", nullable: true },
        consultas: { type: "STRING", nullable: true },
      },
    },
    garantias: { type: "STRING", nullable: true },
    criteriosEvaluacion: { type: "ARRAY", items: { type: "STRING" } },
    montoReferencia: { type: "STRING", nullable: true },
    observaciones: { type: "ARRAY", items: { type: "STRING" }, description: "Condiciones inusuales o a tener en cuenta." },
  },
  required: ["objeto", "requisitosClave", "criteriosEvaluacion", "observaciones"],
  propertyOrdering: ["objeto", "requisitosClave", "plazos", "garantias", "criteriosEvaluacion", "montoReferencia", "observaciones"],
};

const SYSTEM_INSTRUCTION =
  "Sos un asistente para PYMES uruguayas que resume pliegos de compras públicas. "
  + "Resumí en español claro y conciso, sin inventar datos. Si un dato no está en el texto, omitilo o dejalo vacío. "
  + "No afirmes fechas o montos que no aparezcan explícitamente en el pliego.";

function csv(v: string | undefined): string[] {
  return (v ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Builds a rotator from env. Gemini prefers the free key; Groq uses its free key.
 * Legacy PLIEGO_AI_MODEL, if set, becomes the first Gemini model tried.
 */
export function buildPliegoRotator(): ProviderRotator {
  const geminiApiKey = process.env.FREE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const groqApiKey = process.env.FREE_GROQ_API_KEY;

  const geminiModels = csv(process.env.PLIEGO_GEMINI_MODELS);
  const legacy = process.env.PLIEGO_AI_MODEL?.trim();
  if (legacy && !geminiModels.includes(legacy)) geminiModels.unshift(legacy);

  return new ProviderRotator({
    geminiApiKey,
    groqApiKey,
    geminiModels: geminiModels.length ? geminiModels : undefined,
    groqModels: csv(process.env.PLIEGO_GROQ_MODELS).length ? csv(process.env.PLIEGO_GROQ_MODELS) : undefined,
  });
}

/**
 * Generates and caches a summary for one call, or null when not possible
 * (no key, no pliego, no extractable text, or the whole model ladder failed).
 * Pass a shared `rotator` to reuse its per-run model cooldowns across calls.
 */
export async function summarizeOpenCall(compraId: string, rotator?: ProviderRotator): Promise<IPliegoSummary | null> {
  const rot = rotator ?? buildPliegoRotator();
  if (!rot.available) return null;

  const call = (await OpenCallModel.findOne({ compraId }).lean()) as unknown as IOpenCall | null;
  if (!call) return null;

  const currentSig = pliegoDocsSignature(call.documents);

  // Idempotent, but pliego-aware: reuse the cached summary ONLY while the pliego
  // is unchanged. A modification (aclaración/ajuste that adds or replaces a pliego)
  // shifts the signature → regenerate. Legacy summaries with no stored signature
  // are treated as fresh (not force-regenerated) to protect the free budget.
  if (call.aiSummary && (call.aiSummary.docsSignature === undefined || call.aiSummary.docsSignature === currentSig)) {
    return call.aiSummary;
  }

  const pdfs = (call.documents ?? []).filter(isPdfDocument).slice(0, MAX_PDFS);
  if (!pdfs.length) return null;

  const texts: string[] = [];
  for (const doc of pdfs) {
    const text = await extractPdfText(doc.url);
    if (text) texts.push(text);
  }
  if (!texts.length) return null;

  const combined = texts.join("\n\n---\n\n").slice(0, MAX_INPUT_CHARS);
  const prompt = `Título del llamado: ${call.title}\n\nTexto del/los pliego(s):\n${combined}`;

  let generated: GeneratedSummary;
  let modelUsed: string;
  try {
    const res = await rot.generateStructured<GeneratedSummary>({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
      schema: SUMMARY_SCHEMA,
      temperature: 0,
      timeoutMs: 45_000,
    });
    generated = res.data;
    modelUsed = res.modelUsed;
  } catch {
    return null; // whole ladder exhausted — retried on a later run
  }

  const summary: IPliegoSummary = {
    ...generated,
    model: modelUsed,
    generatedAt: new Date(),
    sourceDocs: pdfs.map(d => d.url),
    disclaimer: DISCLAIMER,
    docsSignature: currentSig,
  };

  await OpenCallModel.updateOne({ compraId }, { $set: { aiSummary: summary } });
  return summary;
}
