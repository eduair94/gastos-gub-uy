#!/usr/bin/env tsx

/**
 * Second-stage LLM triage of statistical price anomalies.
 *
 * The statistical detector (src/jobs/detect-anomalies.ts) is a pure price-outlier
 * finder: it flags a unit price that sits far above its category baseline. Many of
 * those flags have a perfectly ordinary explanation the numbers cannot see —
 * a small lot bought at a unit premium, a genuinely different product pooled under
 * one catalogue code, a branded/specialised variant, an urgent purchase, a price
 * that bundles installation/service, or a data-entry slip. This job reads the item
 * description AND the surrounding contract (the whole basket, the subject, the
 * procurement procedure, the buyer/supplier) and asks a cheap LLM to decide whether
 * the gap is EXPLAINABLE or genuinely unexplained.
 *
 * It is deliberately a SECOND stage, not a replacement:
 *   - Statistics find the candidates over ~1.4M award lines for free.
 *   - The LLM only adjudicates the tail (high + critical by default), so the spend
 *     is a few US dollars for the whole corpus and pennies per nightly delta.
 *   - The verdict is ADVISORY: it annotates the flag, never deletes it. The
 *     `explainable: 'no'` flags are the real signal surfaced to readers.
 *
 * Incremental by construction: a flag is re-triaged only when its `dataVersion`
 * changed since the last verdict, so a stable finding is never re-charged.
 *
 * Every run also writes a JSON dump under data/anomaly-ai-verdicts/ — a full record
 * plus a `latest.json` whose decisive section is the unexplained flags, worst first.
 *
 * Usage:
 *   npx tsx src/jobs/score-anomalies-ai.ts                 # high+critical, only new/changed
 *   npx tsx src/jobs/score-anomalies-ai.ts --limit=20      # cheap real sample
 *   npx tsx src/jobs/score-anomalies-ai.ts --min-rank=2    # include medium
 *   npx tsx src/jobs/score-anomalies-ai.ts --all           # re-triage everything in scope
 *   npx tsx src/jobs/score-anomalies-ai.ts --dry-run       # plan + cost estimate, no API calls, no writes
 *   npx tsx src/jobs/score-anomalies-ai.ts --reset         # clear every stored verdict, then exit
 *   npx tsx src/jobs/score-anomalies-ai.ts --concurrency=8 --model=gemini-2.5-flash-lite
 */

import fs from "fs";
import path from "path";
import { AnomalyModel, ContractItemFeaturesModel, ReleaseModel } from "../../shared/models";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { callGeminiStructured, estimateCostUsd, FLASH_LITE_PRICING, GeminiSchema, GeminiUsage } from "./ai/gemini-client";
import { adjudicacionUrl, compraIdFromOcid, llamadoUrl, ScrapedItem, scrapeCompraFeatures } from "./ai/item-features";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_MIN_RANK = 3; // high + critical
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_SCRAPE_CONCURRENCY = 4; // parallel gov-page fetches when populating the características cache
const MAX_SIBLING_ITEMS = 15;
const MAX_FEATURE_ROWS = 12; // características rows fed per item
const MAX_DOCS = 6; // attached documents surfaced per contract
const MAX_TEXT_LEN = 220; // cap free-text fields fed to the model

const EXPLAINABLE_VALUES = ["yes", "no", "uncertain"] as const;
const CATEGORY_VALUES = [
  "cantidad-baja",
  "producto-distinto",
  "marca-especializado",
  "urgencia",
  "servicio-incluido",
  "error-carga",
  "moneda-erronea",
  "sin-explicacion",
  "otro",
] as const;

type Explainable = (typeof EXPLAINABLE_VALUES)[number];
type Category = (typeof CATEGORY_VALUES)[number];

interface Verdict {
  explainable: Explainable;
  category: Category;
  reason: string;
  analysis: string;
  evidence: string[];
  confidence: number;
}

interface CliOptions {
  all: boolean;
  dryRun: boolean;
  reset: boolean;
  minRank: number;
  limit: number | null;
  concurrency: number;
  model: string;
  severities: string[] | null;
  /** detectedValue tiebreak within severity. `asc` samples the moderate low end (for QA). */
  order: "asc" | "desc";
  /** Cap request STARTS per minute. Set to ~18 to stay under the Gemini free tier's 20 RPM. null = unthrottled (paid tier). */
  rpm: number | null;
  /** Scrape+cache missing item características from the gov HTML pages before triage. */
  scrapeFeatures: boolean;
  /** Parallel gov-page fetches when populating the características cache. */
  scrapeConcurrency: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const RESPONSE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    explainable: { type: "STRING", enum: [...EXPLAINABLE_VALUES], description: "yes=hay explicación legítima plausible; no=ninguna encontrada (señal real); uncertain=falta contexto para decidir" },
    category: { type: "STRING", enum: [...CATEGORY_VALUES], description: "bucket de la razón; sin-explicacion va con explainable=no" },
    reason: { type: "STRING", description: "resumen de UNA sola línea en español, concreto, citando el indicio principal" },
    analysis: {
      type: "STRING",
      description: "análisis detallado en español (2 a 4 oraciones) para periodistas/investigadores: qué se pagó, contra qué referencia, y por qué es o no explicable. Solo hechos del contexto dado, sin inventar.",
    },
    evidence: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "de 1 a 4 puntos concretos y verificables que sustentan el veredicto (cantidad, característica del ítem, renglón vecino, procedimiento, proveedor, etc.)",
    },
    confidence: { type: "NUMBER", description: "confianza en el veredicto, 0 a 1" },
  },
  required: ["explainable", "category", "reason", "analysis", "evidence", "confidence"],
  propertyOrdering: ["explainable", "category", "reason", "analysis", "evidence", "confidence"],
};

const SYSTEM_INSTRUCTION = [
  "Sos un auditor de compras públicas de Uruguay (datos OCDS del portal de Compras Estatales).",
  "Recibís UNA alerta estadística: un precio unitario que se aparta mucho de lo que se suele pagar por el mismo código de artículo.",
  "Tu tarea NO es recalcular la estadística: es decidir si esa diferencia de precio tiene una explicación legítima leyendo la descripción del ítem y TODO el contexto del contrato: la canasta completa, el asunto, el procedimiento, el comprador, el proveedor, y sobre todo las CARACTERÍSTICAS del ítem scrapeadas de la página oficial (p. ej. 'Presentación: ENVASE / Medida: 250 G' cambia lo que significa un precio 'por G') y los DOCUMENTOS adjuntos.",
  "",
  "Marcá explainable='yes' cuando haya una explicación legítima plausible, y elegí la categoría:",
  "- cantidad-baja: se compró muy poca cantidad, y el precio unitario sube por lote chico / mínimo.",
  "- producto-distinto: bajo el mismo código de catálogo hay productos realmente distintos; este es más caro por ser otro producto/gama.",
  "- marca-especializado: marca premium, importado, hecho a medida o de especificación técnica superior.",
  "- urgencia: compra urgente / por excepción (el procedimiento o el asunto lo sugieren).",
  "- servicio-incluido: el precio incluye instalación, flete, garantía extendida, capacitación u otro servicio.",
  "- error-carga: el número parece un error de carga (unidad equivocada, decimales corridos, precio total cargado como unitario).",
  "- moneda-erronea: el precio parece estar en otra moneda que la declarada (p. ej. USD cargado como UYU).",
  "",
  "Marcá explainable='no' con categoría 'sin-explicacion' SOLO cuando, con el contexto dado, NINGUNA de esas explicaciones aplica de forma plausible: un sobreprecio genuino sin justificación visible. Estos son la señal real.",
  "Marcá explainable='uncertain' cuando el contexto no alcanza para decidir.",
  "",
  "Sé conservador: ante una explicación legítima razonable, NO marques 'no'. No inventes datos que no están.",
  "",
  "Este es un producto de transparencia sobre el gasto del Estado; periodistas e investigadores usarán tu salida para reportar. Por eso, además del veredicto, devolvé:",
  "- reason: un resumen de una línea.",
  "- analysis: 2 a 4 oraciones detalladas, SOLO con hechos del contexto dado, explicando qué se pagó, contra qué referencia, y el porqué del veredicto.",
  "- evidence: 1 a 4 puntos concretos y verificables (cantidad, característica, renglón vecino, procedimiento, proveedor…). Cada punto debe poder chequearse contra los datos.",
  "Sé factual y prudente: no afirmes corrupción; describí lo que los datos muestran y lo que falta para explicarlo.",
].join("\n");

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    all: false,
    dryRun: false,
    reset: false,
    minRank: DEFAULT_MIN_RANK,
    limit: null,
    concurrency: DEFAULT_CONCURRENCY,
    model: DEFAULT_MODEL,
    severities: null,
    order: "desc",
    rpm: null,
    scrapeFeatures: true,
    scrapeConcurrency: DEFAULT_SCRAPE_CONCURRENCY,
  };

  for (const arg of argv) {
    if (arg === "--all") options.all = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--reset") options.reset = true;
    else if (arg.startsWith("--min-rank=")) {
      const n = Number.parseInt(arg.slice("--min-rank=".length), 10);
      if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error(`Invalid --min-rank (1-4): ${arg}`);
      options.minRank = n;
    } else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid --limit: ${arg}`);
      options.limit = n;
    } else if (arg.startsWith("--concurrency=")) {
      const n = Number.parseInt(arg.slice("--concurrency=".length), 10);
      if (!Number.isInteger(n) || n < 1 || n > 32) throw new Error(`Invalid --concurrency (1-32): ${arg}`);
      options.concurrency = n;
    } else if (arg.startsWith("--model=")) {
      options.model = arg.slice("--model=".length);
    } else if (arg.startsWith("--severity=")) {
      options.severities = arg
        .slice("--severity=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--order=asc" || arg === "--order=desc") {
      options.order = arg.slice("--order=".length) as "asc" | "desc";
    } else if (arg.startsWith("--rpm=")) {
      const n = Number.parseInt(arg.slice("--rpm=".length), 10);
      if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid --rpm: ${arg}`);
      options.rpm = n;
    } else if (arg === "--no-scrape-features") {
      options.scrapeFeatures = false;
    } else if (arg.startsWith("--scrape-concurrency=")) {
      const n = Number.parseInt(arg.slice("--scrape-concurrency=".length), 10);
      if (!Number.isInteger(n) || n < 1 || n > 16) throw new Error(`Invalid --scrape-concurrency (1-16): ${arg}`);
      options.scrapeConcurrency = n;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function truncate(value: unknown, max = MAX_TEXT_LEN): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** id_compra for the official public page is derived from the OCID, never `id`. */
function publicUrlFromOcid(ocid: unknown): string | null {
  if (typeof ocid !== "string" || !ocid) return null;
  const idCompra = ocid.replace(/^ocds-[^-]+-/, "");
  if (!idCompra || idCompra === ocid) return null;
  return `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/${idCompra}`;
}

interface SiblingItem {
  description: string | null;
  classificationId: string | null;
  unitName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  currency: string | null;
  isTarget: boolean;
}

interface DocRef {
  type: string | null;
  url: string;
  format: string | null;
}

interface AnomalyContext {
  subject: string | null; // tender.description / title — what the contract is about
  procedure: string | null; // procurementMethodDetails
  siblings: SiblingItem[];
  /** The flagged item's scraped "Características" rows (Tipo/Presentación/Medida…), when found. */
  features: { name: string; value: string }[];
  /** The flagged item's "Variación" note, when present. */
  variation: string | null;
  /** Attached contract documents (resolutions, pliegos) — links, for the model and for journalists. */
  documents: DocRef[];
  compraId: string | null;
  llamadoUrl: string | null;
  adjudicacionUrl: string | null;
}

function collectDocuments(release: ReleaseDoc, award: ReleaseAward | undefined): DocRef[] {
  const raw = [...(award?.documents ?? []), ...(release.tender?.documents ?? [])];
  const seen = new Set<string>();
  const docs: DocRef[] = [];
  for (const d of raw) {
    const url = typeof d?.url === "string" && d.url ? d.url : null;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    docs.push({ type: truncate(d?.documentType, 40), url, format: truncate(d?.format, 60) });
    if (docs.length >= MAX_DOCS) break;
  }
  return docs;
}

/** Locate the anomaly's own award + item inside a release doc, and gather the full context. */
function buildContext(anomaly: AnomalyDoc, release: ReleaseDoc | undefined, featuresByCompra: Map<string, ScrapedItem[]>): AnomalyContext {
  const empty: AnomalyContext = { subject: null, procedure: null, siblings: [], features: [], variation: null, documents: [], compraId: null, llamadoUrl: null, adjudicacionUrl: null };
  if (!release) return empty;

  const subject = truncate(release.tender?.description) ?? truncate(release.tender?.title);
  const procedure = truncate(release.tender?.procurementMethodDetails, 80);
  const compraId = compraIdFromOcid(release.ocid);

  const awards = Array.isArray(release.awards) ? release.awards : [];
  const award = anomaly.awardId ? awards.find((a) => a?.id === anomaly.awardId) : awards[0];
  const items = Array.isArray(award?.items) ? award!.items : [];

  const targetClsId = anomaly.metadata?.itemClassification?.id ?? null;
  const targetUnit = anomaly.metadata?.itemUnit?.name ?? null;
  const targetPrice = anomaly.detectedValue;

  let targetMatched = false;
  // The OCDS award item `id` is a plain integer and equals the características "Ítem Nº" (nro), so
  // once we identify the flagged line we can attach EXACTLY its characteristics — never a sibling's.
  let targetNro: number | null = null;
  const siblings: SiblingItem[] = items.slice(0, MAX_SIBLING_ITEMS).map((item) => {
    const clsId = item?.classification?.id ?? null;
    const unitName = item?.unit?.name ?? null;
    const unitPrice = num(item?.unit?.value?.amount);
    const isTarget = !targetMatched && clsId === targetClsId && unitName === targetUnit && unitPrice === targetPrice;
    if (isTarget) {
      targetMatched = true;
      targetNro = num(item?.id);
    }
    return {
      description: truncate(item?.description),
      classificationId: typeof clsId === "string" ? clsId : null,
      unitName: truncate(unitName, 40),
      quantity: num(item?.quantity),
      unitPrice,
      currency: truncate(item?.unit?.value?.currency, 8),
      isTarget,
    };
  });

  // Attach the flagged item's características by nro. Conservative: no nro match (or no scrape) => no
  // characteristics, rather than risk feeding a different item's — this audits public money.
  let features: { name: string; value: string }[] = [];
  let variation: string | null = null;
  const scraped = compraId ? featuresByCompra.get(compraId) : undefined;
  if (scraped && targetNro !== null) {
    const hit = scraped.find((s) => s.nro === targetNro);
    if (hit) {
      features = hit.features.slice(0, MAX_FEATURE_ROWS).map((f) => ({ name: truncate(f.name, 60) ?? "", value: truncate(f.value, 120) ?? "" })).filter((f) => f.name && f.value);
      variation = truncate(hit.variation, 300);
    }
  }

  return {
    subject,
    procedure,
    siblings,
    features,
    variation,
    documents: collectDocuments(release, award),
    compraId,
    llamadoUrl: llamadoUrl(release.ocid),
    adjudicacionUrl: adjudicacionUrl(release.ocid),
  };
}

function buildPrompt(anomaly: AnomalyDoc, ctx: AnomalyContext): string {
  const currency = anomaly.currency ?? anomaly.metadata?.currency ?? "UYU";
  const cls = anomaly.metadata?.itemClassification;
  const lines: string[] = [];

  lines.push("ALERTA A EVALUAR:");
  lines.push(`- Artículo: ${truncate(cls?.description) ?? truncate(anomaly.metadata?.itemDescription) ?? cls?.id ?? "—"}`);
  if (cls?.id) lines.push(`- Código de catálogo: ${cls.id}`);
  lines.push(`- Unidad de medida: ${anomaly.metadata?.itemUnit?.name ?? "—"}`);
  const qty = num(anomaly.metadata?.itemQuantity);
  if (qty !== null) lines.push(`- Cantidad adjudicada: ${qty}`);
  lines.push(`- Precio unitario pagado: ${anomaly.detectedValue} ${currency}`);
  const min = num(anomaly.expectedRange?.min);
  const max = num(anomaly.expectedRange?.max);
  if (min !== null && max !== null) {
    lines.push(`- Rango habitual para ese código (p25–p95): ${min} – ${max} ${currency}`);
  }
  const baselineN = num(anomaly.metadata?.baselineN);
  if (baselineN !== null) lines.push(`- Comparables en la referencia: ${baselineN}`);
  const z = num(anomaly.metadata?.zScore);
  if (z !== null) lines.push(`- Desvío robusto (z): ${z.toFixed(1)}`);
  lines.push(`- Severidad estadística: ${anomaly.severity}`);

  lines.push("");
  lines.push("CONTEXTO DEL CONTRATO:");
  if (ctx.subject) lines.push(`- Objeto/asunto: ${ctx.subject}`);
  if (ctx.procedure) lines.push(`- Procedimiento: ${ctx.procedure}`);
  if (anomaly.metadata?.buyerName) lines.push(`- Comprador: ${truncate(anomaly.metadata.buyerName)}`);
  if (anomaly.metadata?.supplierName) lines.push(`- Proveedor: ${truncate(anomaly.metadata.supplierName)}`);
  const year = anomaly.sourceYear ?? anomaly.metadata?.year;
  if (year) lines.push(`- Año: ${year}`);

  // Características scraped from the official page for the FLAGGED item — the highest-value context
  // (e.g. "Presentación: ENVASE / Medida: 250 G" reframes a "per G" price), so it goes right after
  // the alert, before the basket.
  if (ctx.features.length || ctx.variation) {
    lines.push("");
    lines.push("CARACTERÍSTICAS DEL ÍTEM ALERTADO (de la página oficial):");
    for (const f of ctx.features) lines.push(`  - ${f.name}: ${f.value}`);
    if (ctx.variation) lines.push(`  - Variación: ${ctx.variation}`);
  }

  if (ctx.siblings.length) {
    lines.push("");
    lines.push(`RENGLONES DE LA ADJUDICACIÓN (${ctx.siblings.length}${ctx.siblings.length >= MAX_SIBLING_ITEMS ? "+" : ""}):`);
    for (const s of ctx.siblings) {
      const parts = [
        s.isTarget ? "»" : "-",
        s.description ?? "(sin descripción)",
        s.quantity !== null ? `x${s.quantity}` : null,
        s.unitName ? `/${s.unitName}` : null,
        s.unitPrice !== null ? `@ ${s.unitPrice} ${s.currency ?? currency}` : null,
        s.isTarget ? "  ← ALERTA" : null,
      ].filter(Boolean);
      lines.push(`  ${parts.join(" ")}`);
    }
  }

  if (ctx.documents.length) {
    lines.push("");
    lines.push("DOCUMENTOS ADJUNTOS (no leídos; su tipo puede ser indicio):");
    for (const d of ctx.documents) lines.push(`  - ${d.type ?? "documento"}${d.format ? ` (${d.format})` : ""}`);
  }

  lines.push("");
  lines.push("¿Tiene el precio de la ALERTA una explicación legítima? Devolvé veredicto, resumen (reason), análisis detallado (analysis) y evidencia (evidence) según el esquema.");
  return lines.join("\n");
}

function isValidVerdict(v: unknown): v is Verdict {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    EXPLAINABLE_VALUES.includes(o.explainable as Explainable) &&
    CATEGORY_VALUES.includes(o.category as Category) &&
    typeof o.reason === "string" &&
    typeof o.analysis === "string" &&
    Array.isArray(o.evidence) &&
    typeof o.confidence === "number" &&
    Number.isFinite(o.confidence)
  );
}

/** Run `worker` over `items` with at most `concurrency` in flight. Order of results matches input. */
async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function loop(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!, i);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => loop());
  await Promise.all(runners);
  return results;
}

interface ScoredResult {
  anomalyId: string;
  releaseId: string;
  ocid: string | null;
  publicUrl: string | null;
  severity: string;
  severityRank: number | null;
  zScore: number | null;
  item: {
    description: string | null;
    classificationId: string | null;
    classificationDescription: string | null;
    unitName: string | null;
    quantity: number | null;
  };
  paid: { amount: number; currency: string };
  usualRange: { min: number | null; max: number | null };
  baselineN: number | null;
  buyer: string | null;
  supplier: string | null;
  year: number | null;
  verdict: Verdict;
  /** Provenance for journalists: exactly what extra context informed the verdict + the source links. */
  features: { name: string; value: string }[];
  variation: string | null;
  documents: DocRef[];
  compraId: string | null;
  llamadoUrl: string | null;
  adjudicacionUrl: string | null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const runStart = new Date();
  const runStamp = runStart.toISOString().replace(/[:.]/g, "-");

  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
    process.env.MONGO_SOCKET_TIMEOUT_MS = String(30 * 60 * 1000);
  }

  console.log(`🤖 AI anomaly triage starting (model=${options.model})`);
  await connectToDatabase();

  if (options.reset) {
    const res = await AnomalyModel.updateMany({ "aiVerdict.explainable": { $exists: true } }, { $unset: { aiVerdict: "" } });
    console.log(`🧹 --reset: cleared aiVerdict on ${res.modifiedCount} anomalies. Exiting.`);
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (!apiKey && !options.dryRun) {
    throw new Error("GEMINI_API_KEY is not set (add it to .env). Use --dry-run to plan without it.");
  }

  // ---- Selection ----
  const filter: Record<string, unknown> = { type: "price_spike", severityRank: { $gte: options.minRank } };
  if (options.severities?.length) filter.severity = { $in: options.severities };
  // Incremental: only flags that were never triaged, or whose finding changed since the last verdict.
  if (!options.all) {
    filter.$expr = { $ne: ["$aiVerdict.dataVersion", "$dataVersion"] };
  }

  const query = AnomalyModel.find(filter).sort({ severityRank: -1, detectedValue: options.order === "asc" ? 1 : -1 }).lean();
  if (options.limit) query.limit(options.limit);
  const anomalies = (await query) as unknown as AnomalyDoc[];

  console.log(`   candidates in scope     : ${anomalies.length} (min-rank ${options.minRank}${options.all ? ", --all" : ", new/changed only"}${options.limit ? `, limit ${options.limit}` : ""})`);

  if (anomalies.length === 0) {
    console.log(`   nothing to triage. Exiting.`);
    return;
  }

  if (options.dryRun) {
    // ~500 input + ~120 output tokens per item is the measured envelope; report the estimate.
    const estUsage: GeminiUsage = { promptTokens: anomalies.length * 500, candidatesTokens: anomalies.length * 120, totalTokens: anomalies.length * 620 };
    console.log(`   🧪 --dry-run: would triage ${anomalies.length} flags.`);
    console.log(`   estimated tokens        : ~${estUsage.totalTokens.toLocaleString()} (≈${estUsage.promptTokens.toLocaleString()} in / ${estUsage.candidatesTokens.toLocaleString()} out)`);
    console.log(`   estimated cost          : ≈US$${estimateCostUsd(estUsage).toFixed(4)} at Flash-Lite pricing`);
    return;
  }

  // ---- Batch-load the releases for context (dedupe by releaseId) ----
  const releaseIds = [...new Set(anomalies.map((a) => a.releaseId).filter(Boolean))];
  const releaseById = new Map<string, ReleaseDoc>();
  const RELEASE_BATCH = 500;
  for (let i = 0; i < releaseIds.length; i += RELEASE_BATCH) {
    const batch = releaseIds.slice(i, i + RELEASE_BATCH);
    const docs = (await ReleaseModel.find(
      { id: { $in: batch } },
      { id: 1, ocid: 1, "tender.title": 1, "tender.description": 1, "tender.procurementMethodDetails": 1, "tender.documents": 1, "awards.id": 1, "awards.items": 1, "awards.documents": 1 }
    ).lean()) as unknown as ReleaseDoc[];
    for (const doc of docs) releaseById.set(doc.id, doc);
  }
  console.log(`   releases loaded         : ${releaseById.size}/${releaseIds.length}`);

  // ---- Item características (Tipo/Presentación/Medida + Variación) scraped from the gov pages ----
  // These are the highest-value context for judging a price: cache-first, and only scrape (then
  // cache, benefitting the contract page too) the compras that are missing when --scrape-features.
  const compraByRelease = new Map<string, string>();
  const compraIds = new Set<string>();
  for (const rel of releaseById.values()) {
    const compraId = compraIdFromOcid(rel.ocid);
    if (compraId) {
      compraByRelease.set(rel.id, compraId);
      compraIds.add(compraId);
    }
  }

  const featuresByCompra = new Map<string, ScrapedItem[]>();
  const cached = (await ContractItemFeaturesModel.find({ compraId: { $in: [...compraIds] } }, { compraId: 1, items: 1 }).lean()) as unknown as Array<{ compraId: string; items: ScrapedItem[] }>;
  for (const c of cached) featuresByCompra.set(c.compraId, c.items ?? []);
  console.log(`   características cached    : ${featuresByCompra.size}/${compraIds.size}`);

  if (options.scrapeFeatures) {
    const missing = [...compraIds].filter((id) => !featuresByCompra.has(id));
    if (missing.length) {
      // Map compraId -> a release that has awards, so scrape tries the adjudicación page first.
      const relByCompra = new Map<string, ReleaseDoc>();
      for (const rel of releaseById.values()) {
        const cid = compraIdFromOcid(rel.ocid);
        if (cid && !relByCompra.has(cid)) relByCompra.set(cid, rel);
      }
      let scraped = 0;
      let scrapeFail = 0;
      await runPool(missing, options.scrapeConcurrency, async (compraId) => {
        const rel = relByCompra.get(compraId);
        const hasAward = (rel?.awards?.length ?? 0) > 0;
        const result = await scrapeCompraFeatures(rel?.ocid ?? null, hasAward).catch(() => null);
        if (!result) {
          scrapeFail++;
          return null;
        }
        featuresByCompra.set(compraId, result.items);
        // Cache exactly like the contract page does — but never poison the cache with an empty result
        // that was only empty because a page failed transiently.
        if (!(result.items.length === 0 && result.transient)) {
          await ContractItemFeaturesModel.updateOne(
            { compraId },
            { $set: { compraId, items: result.items, source: result.source, fetchedAt: new Date() } },
            { upsert: true }
          ).catch(() => {});
        }
        scraped++;
        if (scraped % 50 === 0) console.log(`   … scraped ${scraped}/${missing.length} características`);
        return null;
      });
      console.log(`   características scraped   : ${scraped} ok, ${scrapeFail} unreachable`);
    }
  }

  // ---- Triage ----
  const totalUsage: GeminiUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
  let errors = 0;
  let done = 0;

  // Optional request-start spacer to stay under a per-minute quota (Gemini free tier = 20 RPM).
  // A single shared "next slot" timestamp serialises starts even across the concurrent pool.
  const spacingMs = options.rpm ? Math.ceil(60_000 / options.rpm) : 0;
  let nextSlot = 0;
  const acquireSlot = async (): Promise<void> => {
    if (!spacingMs) return;
    const slot = Math.max(Date.now(), nextSlot);
    nextSlot = slot + spacingMs;
    const wait = slot - Date.now();
    if (wait > 0) await sleep(wait);
  };
  if (spacingMs) console.log(`   throttle                : ${options.rpm} req/min (${spacingMs}ms spacing) for free-tier quota`);

  const outcomes = await runPool(anomalies, options.concurrency, async (anomaly): Promise<ScoredResult | null> => {
    const ctx = buildContext(anomaly, releaseById.get(anomaly.releaseId), featuresByCompra);
    const prompt = buildPrompt(anomaly, ctx);
    try {
      await acquireSlot();
      const { data, usage } = await callGeminiStructured<Verdict>({
        apiKey,
        model: options.model,
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt,
        schema: RESPONSE_SCHEMA,
      });
      totalUsage.promptTokens += usage.promptTokens;
      totalUsage.candidatesTokens += usage.candidatesTokens;
      totalUsage.totalTokens += usage.totalTokens;

      if (!isValidVerdict(data)) {
        errors++;
        console.warn(`   ⚠️  invalid verdict for ${anomaly._id}: ${JSON.stringify(data).slice(0, 160)}`);
        return null;
      }

      const verdict: Verdict = {
        explainable: data.explainable,
        category: data.category,
        reason: truncate(data.reason, 400) ?? "",
        analysis: truncate(data.analysis, 1200) ?? "",
        evidence: (Array.isArray(data.evidence) ? data.evidence : [])
          .map((e) => truncate(e, 300))
          .filter((e): e is string => !!e)
          .slice(0, 6),
        confidence: Math.min(Math.max(data.confidence, 0), 1),
      };

      await AnomalyModel.updateOne(
        { _id: anomaly._id },
        {
          $set: {
            aiVerdict: {
              ...verdict,
              model: options.model,
              dataVersion: anomaly.dataVersion,
              scoredAt: runStart,
              usedFeatures: ctx.features.length,
              documents: ctx.documents.length ? ctx.documents : undefined,
            },
          },
        }
      );

      done++;
      if (done % 50 === 0) console.log(`   … ${done}/${anomalies.length} triaged`);

      const currency = anomaly.currency ?? anomaly.metadata?.currency ?? "UYU";
      return {
        anomalyId: String(anomaly._id),
        releaseId: anomaly.releaseId,
        ocid: releaseById.get(anomaly.releaseId)?.ocid ?? null,
        publicUrl: publicUrlFromOcid(releaseById.get(anomaly.releaseId)?.ocid),
        severity: anomaly.severity,
        severityRank: num(anomaly.severityRank),
        zScore: num(anomaly.metadata?.zScore),
        item: {
          description: truncate(anomaly.metadata?.itemDescription, 400),
          classificationId: anomaly.metadata?.itemClassification?.id ?? null,
          classificationDescription: truncate(anomaly.metadata?.itemClassification?.description, 400),
          unitName: anomaly.metadata?.itemUnit?.name ?? null,
          quantity: num(anomaly.metadata?.itemQuantity),
        },
        paid: { amount: anomaly.detectedValue, currency },
        usualRange: { min: num(anomaly.expectedRange?.min), max: num(anomaly.expectedRange?.max) },
        baselineN: num(anomaly.metadata?.baselineN),
        buyer: truncate(anomaly.metadata?.buyerName, 200),
        supplier: truncate(anomaly.metadata?.supplierName, 200),
        year: (anomaly.sourceYear ?? anomaly.metadata?.year) as number | null,
        verdict,
        features: ctx.features,
        variation: ctx.variation,
        documents: ctx.documents,
        compraId: ctx.compraId,
        llamadoUrl: ctx.llamadoUrl,
        adjudicacionUrl: ctx.adjudicacionUrl,
      };
    } catch (error) {
      errors++;
      console.warn(`   ⚠️  triage failed for ${anomaly._id}: ${(error as Error).message}`);
      return null;
    }
  });

  const results = outcomes.filter((r): r is ScoredResult => r !== null);

  // ---- Summary ----
  const explainableCounts: Record<Explainable, number> = { yes: 0, no: 0, uncertain: 0 };
  const categoryCounts: Record<string, number> = {};
  for (const r of results) {
    explainableCounts[r.verdict.explainable]++;
    categoryCounts[r.verdict.category] = (categoryCounts[r.verdict.category] ?? 0) + 1;
  }
  const durationMs = Date.now() - runStart.getTime();
  const summary = {
    generatedAt: runStart.toISOString(),
    model: options.model,
    scope: { minRank: options.minRank, all: options.all, limit: options.limit, severities: options.severities },
    scored: results.length,
    errors,
    explainable: explainableCounts,
    categories: categoryCounts,
    tokens: totalUsage,
    estimatedCostUsd: Number(estimateCostUsd(totalUsage, FLASH_LITE_PRICING).toFixed(4)),
    durationMs,
  };

  console.log(`   ✅ triaged              : ${results.length} (${errors} errors)`);
  console.log(`     explainable=yes       : ${explainableCounts.yes}`);
  console.log(`     explainable=no        : ${explainableCounts.no}   ← sin explicación (señal real)`);
  console.log(`     explainable=uncertain : ${explainableCounts.uncertain}`);
  console.log(`   tokens                  : ${totalUsage.totalTokens.toLocaleString()} (${totalUsage.promptTokens.toLocaleString()} in / ${totalUsage.candidatesTokens.toLocaleString()} out)`);
  console.log(`   estimated cost          : US$${summary.estimatedCostUsd}`);

  // ---- JSON dump: full record + decisive latest.json (the unexplained flags, worst first) ----
  const outDir = path.resolve(__dirname, "../../data/anomaly-ai-verdicts");
  fs.mkdirSync(outDir, { recursive: true });

  const bySeverityThenConfidence = (a: ScoredResult, b: ScoredResult): number =>
    (b.severityRank ?? 0) - (a.severityRank ?? 0) || (b.verdict.confidence ?? 0) - (a.verdict.confidence ?? 0);

  const unexplained = results.filter((r) => r.verdict.explainable === "no").sort(bySeverityThenConfidence);
  const uncertain = results.filter((r) => r.verdict.explainable === "uncertain").sort(bySeverityThenConfidence);

  // A run that triaged nothing (e.g. every request 429'd on a rate-limited key) must NOT overwrite
  // the per-run dump or the decisive latest.json — that would destroy a previous good result. Only
  // persist when there is something to record.
  if (results.length === 0) {
    console.log(`   ⚠️  0 successful verdicts (${errors} errors) — leaving previous dumps untouched.`);
    console.log(`🎉 AI anomaly triage completed in ${(durationMs / 1000).toFixed(1)}s`);
    return;
  }

  const fullPath = path.join(outDir, `verdicts-${runStamp}.json`);
  fs.writeFileSync(fullPath, JSON.stringify({ summary, results: results.sort(bySeverityThenConfidence) }, null, 2));

  const latestPath = path.join(outDir, "latest.json");
  fs.writeFileSync(
    latestPath,
    JSON.stringify(
      {
        summary,
        // The decisive output: genuinely unexplained overpricing, then the ones needing a human look.
        unexplained,
        uncertain,
      },
      null,
      2
    )
  );

  console.log(`   📝 dump written         : ${path.relative(process.cwd(), fullPath)}`);
  console.log(`   📝 decisive latest      : ${path.relative(process.cwd(), latestPath)} (${unexplained.length} sin explicación)`);
  console.log(`🎉 AI anomaly triage completed in ${(durationMs / 1000).toFixed(1)}s`);
}

// ---- Loosely-typed lean-doc shapes (only the fields this job reads) ----

interface AnomalyDoc {
  _id: unknown;
  releaseId: string;
  awardId?: string | null;
  severity: string;
  severityRank?: number;
  detectedValue: number;
  expectedRange?: { min?: number; max?: number };
  currency?: string;
  sourceYear?: number;
  dataVersion?: string;
  metadata?: {
    supplierName?: string;
    buyerName?: string;
    itemDescription?: string;
    itemClassification?: { id?: string; description?: string; scheme?: string };
    itemUnit?: { id?: string; name?: string };
    itemQuantity?: number;
    baselineN?: number;
    zScore?: number;
    year?: number;
    currency?: string;
  };
}

interface ReleaseItem {
  /** OCDS award item id — a plain integer that equals the características "Ítem Nº". */
  id?: number;
  description?: string;
  classification?: { id?: string; description?: string };
  unit?: { name?: string; value?: { amount?: number; currency?: string } };
  quantity?: number;
}

interface ReleaseDocument {
  documentType?: string;
  url?: string;
  format?: string;
  title?: string;
}

interface ReleaseAward {
  id?: string;
  items?: ReleaseItem[];
  documents?: ReleaseDocument[];
}

interface ReleaseDoc {
  id: string;
  ocid?: string;
  tender?: { title?: string; description?: string; procurementMethodDetails?: string; documents?: ReleaseDocument[] };
  awards?: ReleaseAward[];
}

if (require.main === module) {
  main()
    .then(async () => {
      await disconnectFromDatabase();
      console.log("✅ Script completed successfully");
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("❌ AI anomaly triage failed:", error);
      await disconnectFromDatabase().catch(() => undefined);
      process.exit(1);
    });
}

export { parseArgs, buildPrompt, buildContext, isValidVerdict, publicUrlFromOcid, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION };
export type { CliOptions, Verdict };
