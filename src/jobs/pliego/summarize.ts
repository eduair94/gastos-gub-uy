/**
 * AI pliego summarizer (importable). Downloads a call's pliego PDFs, extracts
 * text, and asks Gemini for a structured Spanish summary cached on
 * `open_calls.aiSummary`. Used by the pliego-summary entry script and eagerly by
 * the sync job for freshly-matched calls.
 *
 * GUARDRAIL: the deadline shown to users always comes from the OCDS tenderPeriod,
 * never from this summary. `plazos` here are informational and labeled as such.
 */
import { OpenCallModel } from "../../../shared/models/open_call";
import type { IOpenCall, IPliegoSummary } from "../../../shared/types/monitor";
import { extractPdfText, isPdfDocument } from "../../services/pliego-extractor";
import { callGeminiStructured } from "../ai/gemini-client";
import type { GeminiSchema } from "../ai/gemini-client";

const DISCLAIMER = "Resumen generado por IA. Verificá siempre el pliego oficial.";
const MAX_PDFS = 3;
const MAX_INPUT_CHARS = 80_000;

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

type GeneratedSummary = Omit<IPliegoSummary, "model" | "generatedAt" | "sourceDocs" | "disclaimer">;

/** Generates and caches a summary for one call, or null when not possible. */
export async function summarizeOpenCall(compraId: string): Promise<IPliegoSummary | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const call = (await OpenCallModel.findOne({ compraId }).lean()) as unknown as IOpenCall | null;
  if (!call) return null;

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

  const model = process.env.PLIEGO_AI_MODEL || "gemini-2.5-flash-lite";
  const { data } = await callGeminiStructured<GeneratedSummary>({
    apiKey,
    model,
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    schema: SUMMARY_SCHEMA,
    temperature: 0,
    timeoutMs: 45_000,
  });

  const summary: IPliegoSummary = {
    ...data,
    model,
    generatedAt: new Date(),
    sourceDocs: pdfs.map(d => d.url),
    disclaimer: DISCLAIMER,
  };

  await OpenCallModel.updateOne({ compraId }, { $set: { aiSummary: summary } });
  return summary;
}
