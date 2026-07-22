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
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse } from "dotenv";
import { OpenCallModel } from "../models/open_call";
import type { IOpenCall, IPliegoSummary } from "../types/monitor";
import { extractPliegoText, isPdfDocument, isSupportedPliegoDocument } from "../services/pliego-extractor";
import { extractScannedPdfText } from "../services/pliego-ocr";
import { pliegoDocsSignature } from "./docs-signature";
import { buildPliegoCorpus } from "./document-corpus";
import type { ExtractedPliegoDocument } from "./document-corpus";
import { applyVerifiedPliegoFacts, extractVerifiedPliegoFacts, normalizeGeneratedPliegoSummary } from "./verified-facts";
import type { OfficialPliegoDates } from "./verified-facts";
import type { GeminiSchema } from "../ai/gemini-client";
import { ProviderRotator } from "../ai/rotator";
import type { ModelGenerationProgress } from "../ai/rotator";

const DISCLAIMER = "Resumen generado por IA. Verificá siempre el pliego oficial.";
const MAX_INPUT_CHARS = 60_000;
// Groq's smallest free-tier bucket caps the whole request at 6k TPM. Real
// Spanish pliegos reached 6.3–6.5k tokens with a 16k-char corpus once the
// instructions/schema were included, so 12k leaves deterministic headroom.
const GROQ_MAX_INPUT_CHARS = 12_000;

export type GeneratedSummary = Omit<
  IPliegoSummary,
  "model" | "generatedAt" | "sourceDocs" | "unreadableDocs" | "disclaimer"
>;

export interface PliegoGenerationOptions {
  timeoutMs?: number | undefined;
  maxRetriesPerModel?: number | undefined;
  totalTimeoutMs?: number | undefined;
  stream?: boolean | undefined;
  onProgress?: ((progress: ModelGenerationProgress) => void) | undefined;
  /** Preserve the concrete failure for interactive diagnostics. */
  throwOnFailure?: boolean | undefined;
  /** Rebuild even when the current document signature matches the cache. */
  force?: boolean | undefined;
}

const AI_ENV_KEYS = [
  "FREE_GEMINI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "FREE_GROQ_API_KEY",
  "PLIEGO_GEMINI_MODELS",
  "PLIEGO_GROQ_MODELS",
  "PLIEGO_AI_MODEL",
] as const;
let aiEnvironmentLoaded = false;

/** Load repo-root AI secrets at runtime when PM2 runs the dashboard from app/. */
function loadAiEnvironment(): void {
  if (aiEnvironmentLoaded) return;
  aiEnvironmentLoaded = true;
  const cwd = process.cwd();
  const candidates = basename(cwd).toLowerCase() === "app"
    ? [resolve(cwd, "../.env"), resolve(cwd, ".env")]
    : [resolve(cwd, ".env")];

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const values = parse(readFileSync(file));
      for (const key of AI_ENV_KEYS) {
        if (!process.env[key] && values[key]) process.env[key] = values[key];
      }
    } catch {
      // Explicit process env remains usable when an optional file is unreadable.
    }
  }
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
  loadAiEnvironment();
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

/** Pure generation entry point used by the DB job and read-only diagnostics. */
export async function generatePliegoSummaryFromExtracted(
  title: string,
  extracted: ExtractedPliegoDocument[],
  rotator: ProviderRotator,
  officialDates: OfficialPliegoDates = {},
  generationOptions: PliegoGenerationOptions = {},
): Promise<{ generated: GeneratedSummary; modelUsed: string }> {
  const combined = buildPliegoCorpus(extracted, MAX_INPUT_CHARS);
  const groqCombined = buildPliegoCorpus(extracted, GROQ_MAX_INPUT_CHARS);
  const prompt = `Título del llamado: ${title}\n\nTexto del/los pliego(s):\n${combined}`;
  const groqPrompt = `Título del llamado: ${title}\n\nTexto del/los pliego(s):\n${groqCombined}`;
  const result = await rotator.generateStructured<GeneratedSummary>({
    systemInstruction: SYSTEM_INSTRUCTION + DOCUMENT_PRECEDENCE_INSTRUCTION,
    prompt,
    groqPrompt,
    schema: SUMMARY_SCHEMA,
    temperature: 0,
    timeoutMs: generationOptions.timeoutMs ?? 45_000,
    maxRetriesPerModel: generationOptions.maxRetriesPerModel,
    totalTimeoutMs: generationOptions.totalTimeoutMs,
    stream: generationOptions.stream,
    onProgress: generationOptions.onProgress,
  });
  return {
    generated: applyVerifiedPliegoFacts(
      normalizeGeneratedPliegoSummary(result.data),
      extractVerifiedPliegoFacts(extracted.map(item => item.text)),
      officialDates,
    ),
    modelUsed: result.modelUsed,
  };
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
  if (!rot.available) {
    if (generationOptions.throwOnFailure) throw new Error("No AI provider is configured in the dashboard runtime");
    return null;
  }

  const call = (await OpenCallModel.findOne({ compraId }).lean()) as unknown as IOpenCall | null;
  if (!call) {
    if (generationOptions.throwOnFailure) throw new Error(`Open call ${compraId} was not found`);
    return null;
  }

  const currentSig = pliegoDocsSignature(call.documents);

  // Idempotent, but pliego-aware: reuse the cached summary ONLY while the pliego
  // is unchanged. A modification (aclaración/ajuste that adds or replaces a pliego)
  // shifts the signature → regenerate. Legacy summaries with no stored signature
  // are treated as fresh (not force-regenerated) to protect the free budget.
  if (!generationOptions.force
    && call.aiSummary
    && (call.aiSummary.docsSignature === undefined || call.aiSummary.docsSignature === currentSig)) {
    return call.aiSummary;
  }

  const documents = (call.documents ?? []).filter(isSupportedPliegoDocument);
  if (!documents.length) {
    if (generationOptions.throwOnFailure) throw new Error("No supported pliego documents were found");
    return null;
  }

  const extracted: ExtractedPliegoDocument[] = [];
  const ocrApiKey = process.env.FREE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  for (const document of documents) {
    let text = await extractPliegoText(document);
    // PDFs published as scans have no text layer. Gemini can read the original
    // PDF directly, avoiding a heavyweight OCR/runtime dependency in Nitro.
    if (!text && ocrApiKey && document.url && isPdfDocument(document)) {
      text = await extractScannedPdfText(document.url, { apiKey: ocrApiKey });
    }
    if (text) extracted.push({ document, text });
  }
  const extractedUrls = new Set(extracted.map(item => item.document.url));
  const failedDocuments = documents.filter(document => !extractedUrls.has(document.url));
  // Scanned PDFs commonly have no text layer. Analyze the readable sources and
  // disclose the rest rather than leaving the call permanently stuck. Never
  // replace a cached summary when no source at all can be read.
  if (!extracted.length) {
    if (generationOptions.throwOnFailure) {
      throw new Error(`Could not extract any pliego document: ${failedDocuments.map(document => document.url).join(", ")}`);
    }
    return null;
  }

  let generated: GeneratedSummary;
  let modelUsed: string;
  try {
    const result = await generatePliegoSummaryFromExtracted(
      call.title,
      extracted,
      rot,
      { reception: call.tenderPeriod?.endDate, enquiries: call.enquiryPeriod?.endDate },
      generationOptions,
    );
    generated = result.generated;
    modelUsed = result.modelUsed;
  } catch (error) {
    if (generationOptions.throwOnFailure) throw error;
    return null; // whole ladder exhausted — retried on a later run
  }

  const summary: IPliegoSummary = {
    ...generated,
    model: modelUsed,
    generatedAt: new Date(),
    sourceDocs: extracted.map(item => item.document.url),
    ...(failedDocuments.length ? { unreadableDocs: failedDocuments.map(document => document.url) } : {}),
    disclaimer: DISCLAIMER,
    docsSignature: currentSig,
  };

  await OpenCallModel.updateOne({ compraId }, { $set: { aiSummary: summary } });
  return summary;
}
