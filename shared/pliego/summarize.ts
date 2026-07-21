/**
 * AI pliego summarizer (importable from both the batch jobs and the Nitro API).
 * Downloads all supported pliego documents (PDF/Word), extracts their text,
 * and asks a free-tier model
 * (Gemini → Groq ladder, see ProviderRotator) for a structured Spanish summary
 * cached on `open_calls.aiSummary`.
 *
 * GUARDRAIL: the deadline shown to users always comes from the OCDS tenderPeriod,
 * never from this summary. `plazos` here are informational and labeled as such.
 */
import { OpenCallModel } from "../models/open_call";
import type { IOpenCall, IPliegoSummary } from "../types/monitor";
import { extractPliegoText, isSupportedPliegoDocument } from "../services/pliego-extractor";
import { pliegoDocsSignature } from "./docs-signature";
import { buildPliegoCorpus } from "./document-corpus";
import type { GeminiSchema } from "../ai/gemini-client";
import { ProviderRotator } from "../ai/rotator";
import type { ModelGenerationProgress } from "../ai/rotator";

const DISCLAIMER = "Resumen generado por IA. Verificá siempre el pliego oficial.";
const MAX_INPUT_CHARS = 60_000;

type GeneratedSummary = Omit<IPliegoSummary, "model" | "generatedAt" | "sourceDocs" | "disclaimer">;

export interface PliegoGenerationOptions {
  timeoutMs?: number | undefined;
  maxRetriesPerModel?: number | undefined;
  totalTimeoutMs?: number | undefined;
  stream?: boolean | undefined;
  onProgress?: ((progress: ModelGenerationProgress) => void) | undefined;
}

const SUMMARY_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    objeto: { type: "STRING", description: "Qué compra el Estado, en 1-2 frases claras (incluí cantidad y unidad si están)." },
    requisitosClave: { type: "ARRAY", items: { type: "STRING" }, description: "Requisitos de admisibilidad que el oferente debe cumplir para poder presentarse (habilitaciones, antecedentes, RUPE, capacidad, etc.)." },
    documentacionRequerida: { type: "ARRAY", items: { type: "STRING" }, description: "Documentos y formularios concretos que hay que presentar con la oferta." },
    formaCotizacion: { type: "STRING", nullable: true, description: "Cómo cotizar: moneda, si el precio incluye o no impuestos, si admite ajuste paramétrico, y plazo de mantenimiento de la oferta." },
    plazos: {
      type: "OBJECT",
      properties: {
        recepcionOfertas: { type: "STRING", nullable: true },
        aperturaOfertas: { type: "STRING", nullable: true },
        consultas: { type: "STRING", nullable: true },
      },
    },
    plazoEjecucion: { type: "STRING", nullable: true, description: "Plazo de entrega o ejecución del contrato." },
    garantias: { type: "STRING", nullable: true, description: "Garantías exigidas (mantenimiento de oferta, fiel cumplimiento) y sus montos si figuran." },
    criteriosEvaluacion: { type: "ARRAY", items: { type: "STRING" }, description: "Cómo se evalúan y comparan las ofertas (precio, puntajes, factores)." },
    montoReferencia: { type: "STRING", nullable: true, description: "Monto estimado, tope o precio de referencia si el pliego lo indica." },
    observaciones: { type: "ARRAY", items: { type: "STRING" }, description: "Riesgos y condiciones a tener en cuenta antes de ofertar: penalidades, cláusulas inusuales o exigencias fuertes." },
  },
  required: ["objeto", "requisitosClave", "documentacionRequerida", "criteriosEvaluacion", "observaciones"],
  propertyOrdering: ["objeto", "requisitosClave", "documentacionRequerida", "formaCotizacion", "plazos", "plazoEjecucion", "garantias", "criteriosEvaluacion", "montoReferencia", "observaciones"],
};

const SYSTEM_INSTRUCTION =
  "Sos un asistente para PYMES uruguayas que resume pliegos de compras públicas para ayudar a un proveedor a decidir si le conviene presentarse a la licitación. "
  + "Escribí en español claro, conciso y accionable, pensando en quien se presenta por primera vez: qué se licita, qué necesita para ser admitido, qué documentación presentar, cómo y en qué moneda cotizar, los plazos y los riesgos. "
  + "No inventes datos: si algo no está en el texto, omitilo o dejalo vacío. No afirmes fechas ni montos que no aparezcan explícitamente en el pliego.";

function csv(v: string | undefined): string[] {
  return (v ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

const DOCUMENT_PRECEDENCE_INSTRUCTION =
  " Analizá TODOS los documentos provistos en orden cronológico. "
  + "Las aclaraciones y ajustes posteriores complementan o corrigen el pliego base y prevalecen si hay contradicciones; "
  + "no presentes como vigente una condición sustituida.";

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
export async function summarizeOpenCall(
  compraId: string,
  rotator?: ProviderRotator,
  generationOptions: PliegoGenerationOptions = {},
): Promise<IPliegoSummary | null> {
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

  const documents = (call.documents ?? []).filter(isSupportedPliegoDocument);
  if (!documents.length) return null;

  const extracted: Array<{ document: (typeof documents)[number]; text: string }> = [];
  for (const document of documents) {
    const text = await extractPliegoText(document);
    if (text) extracted.push({ document, text });
  }
  // Never cache a partial analysis as if it covered the whole publication set.
  // A transient download/parser miss can be retried on the next run.
  if (extracted.length !== documents.length) return null;

  const combined = buildPliegoCorpus(extracted, MAX_INPUT_CHARS);
  const prompt = `Título del llamado: ${call.title}\n\nTexto del/los pliego(s):\n${combined}`;

  let generated: GeneratedSummary;
  let modelUsed: string;
  try {
    const res = await rot.generateStructured<GeneratedSummary>({
      systemInstruction: SYSTEM_INSTRUCTION + DOCUMENT_PRECEDENCE_INSTRUCTION,
      prompt,
      schema: SUMMARY_SCHEMA,
      temperature: 0,
      timeoutMs: generationOptions.timeoutMs ?? 45_000,
      maxRetriesPerModel: generationOptions.maxRetriesPerModel,
      totalTimeoutMs: generationOptions.totalTimeoutMs,
      stream: generationOptions.stream,
      onProgress: generationOptions.onProgress,
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
    sourceDocs: documents.map(d => d.url),
    disclaimer: DISCLAIMER,
    docsSignature: currentSig,
  };

  await OpenCallModel.updateOne({ compraId }, { $set: { aiSummary: summary } });
  return summary;
}
