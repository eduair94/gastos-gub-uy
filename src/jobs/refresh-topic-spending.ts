#!/usr/bin/env tsx
/**
 * Weekly refresh of a spending topic (shared/spending-topics.ts).
 *
 * The procurement feed has no "policy area" field, so a topic is recovered from the
 * free text a public servant typed. This job runs that recovery in two stages:
 *
 *   1. RULES — a loose regex pre-filter in Mongo, then the guarded matcher in JS.
 *      Cheap, deterministic, and the guards are what stop "género"=tela and
 *      "trans"⊂"transporte" from entering. Produces CANDIDATES, not a verdict.
 *   2. MODEL — Gemini Flash-Lite reads the whole contract and returns
 *      { inTopic, category, confidence, reason }. Only `inTopic: yes` counts towards
 *      the totals; rejects stay in `topic_contracts` and are reported as discarded.
 *
 * The verdict is cached against `rulesVersion` (a hash of the topic's term list), so
 * a stable contract is classified once and never re-charged. The whole corpus is a
 * few hundred documents — a full run costs cents.
 *
 * Writes:
 *   - `topic_contracts`  accumulative; `firstSeenAt` is what powers "novedades".
 *   - `topic_spending`   the rollup the API reads, compute-then-swap by dataVersion.
 *
 * Usage:
 *   npx tsx src/jobs/refresh-topic-spending.ts                    # all topics
 *   npx tsx src/jobs/refresh-topic-spending.ts --topic=genero-diversidad
 *   npx tsx src/jobs/refresh-topic-spending.ts --dry-run          # plan + cost, no API, no writes
 *   npx tsx src/jobs/refresh-topic-spending.ts --limit=25         # cheap real sample
 *   npx tsx src/jobs/refresh-topic-spending.ts --reclassify       # ignore cached verdicts
 *   npx tsx src/jobs/refresh-topic-spending.ts --no-ai            # rules only (strong terms qualify)
 */
import crypto from "crypto";
import type { PipelineStage } from "mongoose";
import {
  OpenCallModel,
  ReleaseModel,
  TopicContractModel,
  TopicSpendingModel,
} from "../../shared/models";
import type {
  ITopicBuyerStat,
  ITopicCategoryStat,
  ITopicContract,
  ITopicContractRef,
  ITopicOpenCall,
  ITopicPartyStat,
  ITopicSpending,
  ITopicSupplierStat,
  ITopicYearStat,
} from "../../shared/models";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { PARTY_META, mandateForBuyer } from "../../shared/political-mandates";
import type { PartyCode } from "../../shared/political-mandates";
import { SPENDING_TOPICS, getTopic, matchTopic, topicRegex } from "../../shared/spending-topics";
import type { SpendingTopic } from "../../shared/spending-topics";
import { compraIdFromOcid } from "../../shared/utils/ocid";
import { FLASH_LITE_PRICING, estimateCostUsd } from "./ai/gemini-client";
import { callStructured } from "../../shared/ai/structured";
import type { GeminiSchema, GeminiUsage } from "./ai/gemini-client";

/** Single releases above this are data artefacts (one IM release reports ~1.8e11 UYU). */
const CORRUPT_CEIL = 5e10;
const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 45_000;
const RECENT_WINDOW_DAYS = 7;
const MAX_TOP_CONTRACTS = 60;
const MAX_RECENT = 40;
const MAX_TEXT = 400;
const MAX_ITEMS_IN_PROMPT = 12;

interface Options {
  topics: string[];
  dryRun: boolean;
  limit: number | null;
  reclassify: boolean;
  useAi: boolean;
  model: string;
}

function parseArgs(argv: string[]): Options {
  const arg = (name: string): string | null => {
    const hit = argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const topic = arg("topic");
  const limit = arg("limit");
  return {
    topics: topic ? [topic] : SPENDING_TOPICS.map(t => t.key),
    dryRun: argv.includes("--dry-run"),
    limit: limit ? Number(limit) : null,
    reclassify: argv.includes("--reclassify"),
    useAi: !argv.includes("--no-ai"),
    model: arg("model") ?? DEFAULT_MODEL,
  };
}

/** Hash of the term list: change a term and every verdict is re-adjudicated. */
function rulesVersionOf(topic: SpendingTopic): string {
  const payload = JSON.stringify({
    terms: topic.terms.map(t => [t.term, t.strength, t.guards ?? []]),
    categories: topic.categories.map(c => c.key),
  });
  return crypto.createHash("sha1").update(payload).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// Stage 1 — candidates
// ---------------------------------------------------------------------------

interface RawRelease {
  id?: string;
  ocid?: string;
  sourceYear?: number;
  date?: Date;
  buyer?: { id?: string; name?: string };
  tender?: {
    title?: string;
    description?: string;
    procurementMethodDetails?: string;
    items?: Array<{ description?: string; classification?: { id?: string; description?: string } }>;
  };
  awards?: Array<{
    title?: string;
    suppliers?: Array<{ id?: string; name?: string }>;
    items?: Array<{ description?: string; classification?: { id?: string; description?: string } }>;
  }>;
  amount?: { primaryAmount?: number };
}

/** Every free-text field of a release the matcher looks at. */
function textFieldsOf(r: RawRelease): string[] {
  const out: string[] = [];
  if (r.tender?.title) out.push(r.tender.title);
  if (r.tender?.description) out.push(r.tender.description);
  for (const it of r.tender?.items ?? []) {
    if (it.description) out.push(it.description);
    if (it.classification?.description) out.push(it.classification.description);
  }
  for (const a of r.awards ?? []) {
    if (a.title) out.push(a.title);
    for (const it of a.items ?? []) {
      if (it.description) out.push(it.description);
      if (it.classification?.description) out.push(it.classification.description);
    }
  }
  return out;
}

/** SICE article codes present on the release — some qualify a topic on their own. */
function classificationIdsOf(r: RawRelease): string[] {
  const ids = new Set<string>();
  for (const it of r.tender?.items ?? []) if (it.classification?.id) ids.add(String(it.classification.id));
  for (const a of r.awards ?? []) for (const it of a.items ?? []) if (it.classification?.id) ids.add(String(it.classification.id));
  return [...ids];
}

async function findCandidates(topic: SpendingTopic, limit: number | null): Promise<RawRelease[]> {
  const rx = topicRegex(topic);
  const codes = topic.catalogCodes.map(c => c.code);
  const filter = {
    $or: [
      { "tender.title": rx },
      { "tender.description": rx },
      { "awards.title": rx },
      { "awards.items.description": rx },
      { "awards.items.classification.description": rx },
      { "tender.items.description": rx },
      { "tender.items.classification.description": rx },
      { "awards.items.classification.id": { $in: codes } },
    ],
  };

  const q = ReleaseModel.find(filter, {
    id: 1,
    ocid: 1,
    sourceYear: 1,
    date: 1,
    "buyer.id": 1,
    "buyer.name": 1,
    "tender.title": 1,
    "tender.description": 1,
    "tender.procurementMethodDetails": 1,
    "tender.items.description": 1,
    "tender.items.classification": 1,
    "awards.title": 1,
    "awards.suppliers": 1,
    "awards.items.description": 1,
    "awards.items.classification": 1,
    "amount.primaryAmount": 1,
  }).lean<RawRelease[]>();

  if (limit) q.limit(limit);
  return q.maxTimeMS(15 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Stage 2 — model verdict
// ---------------------------------------------------------------------------

interface Verdict {
  inTopic: "yes" | "no" | "uncertain";
  category: string;
  confidence: number;
  reason: string;
}

function verdictSchema(topic: SpendingTopic): GeminiSchema {
  return {
    type: "OBJECT",
    properties: {
      inTopic: {
        type: "STRING",
        enum: ["yes", "no", "uncertain"],
        description: "¿El contrato pertenece realmente al tema?",
      },
      category: {
        type: "STRING",
        enum: topic.categories.map(c => c.key),
        description: "Categoría del gasto. Usá 'falso-positivo' si inTopic es 'no'.",
      },
      confidence: { type: "NUMBER", description: "0 a 1." },
      reason: { type: "STRING", description: "Una frase en español, máximo 200 caracteres." },
    },
    required: ["inTopic", "category", "confidence", "reason"],
    propertyOrdering: ["inTopic", "category", "confidence", "reason"],
  };
}

function systemInstructionFor(topic: SpendingTopic): string {
  const cats = topic.categories.map(c => `- ${c.key}: ${c.labelEs}`).join("\n");
  return [
    "Sos un analista de compras públicas del Uruguay. Clasificás contratos del portal",
    "de Compras Estatales para una investigación periodística sobre gasto público.",
    "",
    `TEMA: ${topic.labelEs}.`,
    "",
    "Tu única tarea es decidir si el contrato pertenece REALMENTE al tema, y en qué",
    "categoría cae. No opinás sobre si el gasto está bien o mal; no es tu trabajo.",
    "",
    "Reglas duras:",
    "- «género» en compras uruguayas también significa TELA (esterilla de género,",
    "  géneros textiles, metros de género). Eso es inTopic=no, category=falso-positivo.",
    "- «Plan de Equidad» es una transferencia monetaria del MIDES sin relación con",
    "  género. «Equidad Racial» refiere a afrodescendencia, no a género: si el contrato",
    "  es sólo eso, usá category=afrodescendencia con inTopic=yes.",
    "- Un insumo común (clavos, pintura, agua, limpieza) comprado PARA un dispositivo",
    "  del tema (por ejemplo una ComunaMujer) SÍ pertenece: category=insumo-generico.",
    "- Una obra edilicia para una sede del tema (juzgado de violencia de género, centro",
    "  de atención) pertenece: category=obra-infraestructura.",
    "- Si el texto no alcanza para decidir, inTopic=uncertain.",
    "",
    "Categorías disponibles:",
    cats,
  ].join("\n");
}

function promptFor(topic: SpendingTopic, doc: ITopicContract, raw: RawRelease): string {
  const clip = (s?: string | null): string => (s ? String(s).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : "");
  const items: string[] = [];
  for (const a of raw.awards ?? []) {
    for (const it of a.items ?? []) {
      if (items.length >= MAX_ITEMS_IN_PROMPT) break;
      const line = [clip(it.description), it.classification?.description ? `[${clip(it.classification.description)}]` : ""].filter(Boolean).join(" ");
      if (line) items.push(`  - ${line}`);
    }
  }
  return [
    `Tema: ${topic.labelEs}`,
    `Organismo comprador: ${doc.buyerName ?? "(sin dato)"} (${doc.buyerId ?? "?"})`,
    `Año: ${doc.sourceYear ?? "?"}   Procedimiento: ${doc.procurementMethod ?? "(sin dato)"}`,
    `Monto registrado: ${doc.hasAmount ? `${Math.round(doc.amount).toLocaleString("es-UY")} UYU` : "SIN MONTO en el feed"}`,
    `Proveedores: ${doc.suppliers.map(s => s.name).filter(Boolean).join(", ") || "(sin dato)"}`,
    "",
    `Título: ${clip(doc.title)}`,
    `Descripción: ${clip(doc.description)}`,
    items.length ? `Ítems adjudicados:\n${items.join("\n")}` : "",
    "",
    `Términos que dispararon la detección: ${doc.hits.map(h => `"${h.term}"`).join(", ")}`,
    `Contexto de la coincidencia: ${doc.hits.map(h => h.snippet).filter(Boolean).slice(0, 3).join(" … ")}`,
  ].filter(Boolean).join("\n");
}

/** Bounded-concurrency map — the corpus is small, this is all the pool we need. */
async function mapPool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// Rollup
// ---------------------------------------------------------------------------

function cappedAmount(n: number | undefined | null): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0 || v > CORRUPT_CEIL) return 0;
  return v;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : (((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

function toRef(d: ITopicContract): ITopicContractRef {
  return {
    ocid: d.ocid,
    ...(d.releaseId ? { releaseId: d.releaseId } : {}),
    ...(d.compraId ? { compraId: d.compraId } : {}),
    ...(d.title ? { title: d.title } : {}),
    ...(d.description ? { description: d.description.slice(0, 400) } : {}),
    ...(d.buyerId ? { buyerId: d.buyerId } : {}),
    ...(d.buyerName ? { buyerName: d.buyerName } : {}),
    ...(d.suppliers[0]?.name ? { supplierName: d.suppliers[0].name } : {}),
    ...(d.sourceYear ? { sourceYear: d.sourceYear } : {}),
    ...(d.date ? { date: d.date } : {}),
    amount: d.amount,
    hasAmount: d.hasAmount,
    category: d.category,
    ...(d.procurementMethod ? { procurementMethod: d.procurementMethod } : {}),
    ...(d.party ? { party: d.party } : {}),
    ...(d.partyLabel ? { partyLabel: d.partyLabel } : {}),
    ...(d.firstSeenAt ? { firstSeenAt: d.firstSeenAt } : {}),
  };
}

/**
 * Total (capped) procurement of the given buyers, per year — the denominator for
 * every share on the page.
 *
 * Per YEAR, not just per buyer, because the party view has to be honest: MIDES bought
 * under four national administrations, so attributing its whole history to whoever
 * governed in its most recent year would invent the entire finding.
 */
async function buyerYearTotals(buyerIds: string[]): Promise<Map<string, Map<number, number>>> {
  const out = new Map<string, Map<number, number>>();
  if (!buyerIds.length) return out;
  const pipeline: PipelineStage[] = [
    {
      $match: {
        "buyer.id": { $in: buyerIds },
        "amount.primaryAmount": { $gt: 0, $lte: CORRUPT_CEIL },
        "sourceYear": { $gt: 0 },
      },
    },
    { $group: { _id: { b: "$buyer.id", y: "$sourceYear" }, total: { $sum: "$amount.primaryAmount" } } },
  ];
  const rows = await ReleaseModel.aggregate<{ _id: { b: string; y: number }; total: number }>(pipeline)
    .option({ allowDiskUse: true, maxTimeMS: 15 * 60 * 1000 });
  for (const r of rows) {
    const byYear = out.get(r._id.b) ?? new Map<number, number>();
    byYear.set(r._id.y, (byYear.get(r._id.y) ?? 0) + r.total);
    out.set(r._id.b, byYear);
  }
  return out;
}

async function openCallsFor(topic: SpendingTopic): Promise<ITopicOpenCall[]> {
  const rx = topicRegex(topic);
  // "Abierto" has to mean biddable TODAY. The status vocabulary in `open_calls` is
  // {open, clarification, amended, awarded, closed, cancelled}: `awarded` is already
  // decided, so excluding only closed/cancelled would have advertised settled calls.
  // The deadline is the real guarantee, so both conditions are applied.
  const rows = await OpenCallModel.find(
    {
      $or: [{ title: rx }, { description: rx }, { "items.description": rx }],
      "status": { $in: ["open", "clarification", "amended"] },
      "tenderPeriod.endDate": { $gte: new Date() },
    },
    { compraId: 1, title: 1, description: 1, "buyer.name": 1, status: 1, "tenderPeriod.endDate": 1, items: 1 },
  )
    .sort({ "tenderPeriod.endDate": 1 })
    .limit(40)
    .lean<Array<{
      compraId?: string;
      title?: string;
      description?: string;
      buyer?: { name?: string };
      status?: string;
      tenderPeriod?: { endDate?: Date };
      items?: Array<{ description?: string }>;
    }>>()
    .maxTimeMS(120_000);

  // Re-run the guarded matcher: the Mongo regex is a deliberately loose superset.
  return rows
    .filter((r) => {
      const fields = [r.title, r.description, ...(r.items ?? []).map(i => i.description)];
      return matchTopic(topic, fields).matched;
    })
    .map(r => ({
      compraId: String(r.compraId ?? ""),
      ...(r.title ? { title: r.title } : {}),
      ...(r.buyer?.name ? { buyerName: r.buyer.name } : {}),
      ...(r.status ? { status: r.status } : {}),
      ...(r.tenderPeriod?.endDate ? { endDate: r.tenderPeriod.endDate } : {}),
    }))
    .filter(c => c.compraId);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runTopic(topic: SpendingTopic, opts: Options): Promise<void> {
  const started = Date.now();
  const rulesVersion = rulesVersionOf(topic);
  console.log(`\n[topic:${topic.key}] rules ${rulesVersion} — scanning releases…`);

  const raws = await findCandidates(topic, opts.limit);
  console.log(`[topic:${topic.key}] regex pre-filter returned ${raws.length} releases`);

  // --- Stage 1: guarded matcher --------------------------------------------
  const codes = new Set(topic.catalogCodes.map(c => c.code));
  const candidates: Array<{ raw: RawRelease; doc: ITopicContract }> = [];
  const now = new Date();

  for (const r of raws) {
    if (!r.ocid) continue;
    const match = matchTopic(topic, textFieldsOf(r));
    const byCode = classificationIdsOf(r).some(id => codes.has(id));
    if (!match.matched && !byCode) continue;

    const amount = cappedAmount(r.amount?.primaryAmount);
    const buyerId = r.buyer?.id ? String(r.buyer.id) : undefined;
    const mandate = buyerId ? mandateForBuyer(buyerId, r.sourceYear ?? null) : null;
    const suppliers = (r.awards ?? [])
      .flatMap(a => a.suppliers ?? [])
      .map(s => ({ ...(s.id ? { id: String(s.id) } : {}), ...(s.name ? { name: s.name } : {}) }))
      .filter(s => s.id || s.name);

    candidates.push({
      raw: r,
      doc: {
        topicKey: topic.key,
        ocid: r.ocid,
        ...(r.id ? { releaseId: String(r.id) } : {}),
        ...(compraIdFromOcid(r.ocid) ? { compraId: compraIdFromOcid(r.ocid) as string } : {}),
        ...(buyerId ? { buyerId } : {}),
        ...(r.buyer?.name ? { buyerName: r.buyer.name } : {}),
        ...(r.sourceYear ? { sourceYear: r.sourceYear } : {}),
        ...(r.date ? { date: r.date } : {}),
        ...(r.tender?.title ? { title: r.tender.title } : {}),
        ...(r.tender?.description ? { description: r.tender.description.slice(0, 1200) } : {}),
        ...(r.tender?.procurementMethodDetails ? { procurementMethod: r.tender.procurementMethodDetails } : {}),
        amount,
        hasAmount: amount > 0,
        suppliers,
        hits: match.hits,
        ruleStrong: match.strong || byCode,
        inTopic: match.strong || byCode,
        category: "",
        ...(mandate?.party ? { party: mandate.party } : {}),
        ...(mandate?.partyLabel ? { partyLabel: mandate.partyLabel } : {}),
        ...(mandate?.holder ? { mandateHolder: mandate.holder } : {}),
        ...(mandate?.isTransition ? { isTransition: true } : {}),
        rulesVersion,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
  }
  // One row per COMPRA, not per release. A compra shows up several times in
  // `releases` (the award, then each ajuste/aclaración), and every version can carry
  // its own `amount.primaryAmount` — summing them double-counts the contract. Keep the
  // largest amount, which is the reconciled figure once
  // src/jobs/reconcile-award-amendments.ts has folded the corrections in. Deterministic
  // on purpose: a "last write wins" upsert made the published total depend on cursor order.
  const byOcid = new Map<string, { raw: RawRelease; doc: ITopicContract }>();
  for (const c of candidates) {
    const prev = byOcid.get(c.doc.ocid);
    if (!prev
      || c.doc.amount > prev.doc.amount
      || (c.doc.amount === prev.doc.amount && c.doc.hits.length > prev.doc.hits.length)) {
      byOcid.set(c.doc.ocid, c);
    }
  }
  const deduped = [...byOcid.values()];
  console.log(
    `[topic:${topic.key}] guarded matcher kept ${candidates.length} candidates `
    + `(${raws.length - candidates.length} dropped by guards), ${deduped.length} distinct compras`,
  );

  if (opts.dryRun) {
    const strong = deduped.filter(c => c.doc.ruleStrong).length;
    console.log(`[topic:${topic.key}] DRY RUN — ${strong} qualify on strong terms, ${deduped.length - strong} would need the model`);
    console.log(`[topic:${topic.key}] estimated model cost: ~USD ${(deduped.length * 0.0000_9).toFixed(4)} (flash-lite, ~700 in / 60 out tokens each)`);
    return;
  }

  // --- Persist candidates (accumulative; firstSeenAt survives) ---------------
  const existing = await TopicContractModel.find(
    { topicKey: topic.key },
    { ocid: 1, ai: 1, rulesVersion: 1, firstSeenAt: 1 },
  ).lean<Array<{ ocid: string; ai?: ITopicContract["ai"]; rulesVersion?: string; firstSeenAt?: Date }>>();
  const prior = new Map(existing.map(e => [e.ocid, e]));

  const bulk = deduped.map(({ doc }) => {
    const was = prior.get(doc.ocid);
    // `inTopic`/`category` are NOT re-`$set` here. They are the reconciliation's output
    // (rules seed them, the model overrides them), and re-setting the rules' answer on
    // every run silently discarded every cached verdict — the published total moved by
    // a quarter just from re-running the job.
    const { firstSeenAt: _drop, inTopic, category, ...rest } = doc;
    return {
      updateOne: {
        filter: { topicKey: topic.key, ocid: doc.ocid },
        update: {
          $set: rest,
          $setOnInsert: { firstSeenAt: was?.firstSeenAt ?? now, inTopic, category },
        },
        upsert: true,
      },
    };
  });
  if (bulk.length) await TopicContractModel.bulkWrite(bulk, { ordered: false });

  // --- Stage 2: model verdicts ---------------------------------------------
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  const needsVerdict = deduped.filter(({ doc }) => {
    const was = prior.get(doc.ocid);
    if (opts.reclassify) return true;
    return !was?.ai || was.rulesVersion !== rulesVersion;
  });

  let verdicts = 0;
  const usageTotal: GeminiUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };

  if (opts.useAi && apiKey && needsVerdict.length) {
    console.log(`[topic:${topic.key}] adjudicating ${needsVerdict.length} contracts with ${opts.model}…`);
    const schema = verdictSchema(topic);
    const system = systemInstructionFor(topic);

    await mapPool(needsVerdict, CONCURRENCY, async ({ raw, doc }) => {
      try {
        const res = await callStructured<Verdict>({
          apiKey,
          model: opts.model,
          systemInstruction: system,
          prompt: promptFor(topic, doc, raw),
          schema,
          timeoutMs: REQUEST_TIMEOUT_MS,
        });
        usageTotal.promptTokens += res.usage.promptTokens;
        usageTotal.candidatesTokens += res.usage.candidatesTokens;
        usageTotal.totalTokens += res.usage.totalTokens;
        verdicts++;

        const v = res.data;
        const inTopic = v.inTopic === "yes";
        await TopicContractModel.updateOne(
          { topicKey: topic.key, ocid: doc.ocid },
          {
            $set: {
              ai: {
                inTopic: v.inTopic,
                category: v.category,
                confidence: Number(v.confidence) || 0,
                reason: String(v.reason ?? "").slice(0, 300),
                model: opts.model,
                at: new Date(),
              },
              inTopic,
              category: inTopic ? v.category : "falso-positivo",
              rulesVersion,
            },
          },
        );
      } catch (err) {
        // A failed verdict leaves the rules' own answer in place — never drops the row.
        console.warn(`[topic:${topic.key}] verdict failed for ${doc.ocid}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    console.log(`[topic:${topic.key}] ${verdicts} verdicts, est. USD ${estimateCostUsd(usageTotal, FLASH_LITE_PRICING).toFixed(4)}`);
  } else if (opts.useAi && !apiKey) {
    console.warn(`[topic:${topic.key}] no GEMINI_API_KEY — falling back to rules only (strong terms qualify)`);
  }

  // Reconciliation — the single place the final verdict is decided, so it cannot drift
  // between an upsert and a cached verdict. The model wins when it has spoken; the
  // rules answer only where it has not (no API key, a failed call, --no-ai).
  await TopicContractModel.updateMany({ topicKey: topic.key }, [
    {
      $set: {
        inTopic: {
          $cond: [{ $ifNull: ["$ai", false] }, { $eq: ["$ai.inTopic", "yes"] }, "$ruleStrong"],
        },
        category: {
          $cond: [
            { $ifNull: ["$ai", false] },
            { $cond: [{ $eq: ["$ai.inTopic", "yes"] }, "$ai.category", "falso-positivo"] },
            { $cond: ["$ruleStrong", "insumo-generico", "falso-positivo"] },
          ],
        },
      },
    },
  ]);

  // A contract the rules no longer match (a term was tightened, a guard added) must
  // stop counting — otherwise the published total only ever grows. Full runs only:
  // with --limit the un-scanned remainder is not evidence of anything.
  if (!opts.limit) {
    const dropped = await TopicContractModel.updateMany(
      { topicKey: topic.key, lastSeenAt: { $lt: now }, inTopic: true },
      { $set: { inTopic: false, category: "falso-positivo" } },
    );
    if (dropped.modifiedCount) {
      console.log(`[topic:${topic.key}] ${dropped.modifiedCount} previously-kept contracts no longer match the rules`);
    }
  }

  // --- Rollup ---------------------------------------------------------------
  const all = await TopicContractModel.find({ topicKey: topic.key }).lean<ITopicContract[]>();
  const kept = all.filter(d => d.inTopic);
  const discarded = all.length - kept.length;

  const byYearMap = new Map<number, ITopicYearStat>();
  const byBuyerMap = new Map<string, ITopicBuyerStat>();
  const bySupplierMap = new Map<string, ITopicSupplierStat & { buyerSet: Set<string> }>();
  const byCategoryMap = new Map<string, ITopicCategoryStat>();

  let total = 0;
  let withAmount = 0;
  for (const d of kept) {
    total += d.amount;
    if (d.hasAmount) withAmount++;

    if (d.sourceYear) {
      const y = byYearMap.get(d.sourceYear) ?? { year: d.sourceYear, total: 0, contracts: 0, withoutAmount: 0 };
      y.total += d.amount;
      y.contracts += 1;
      if (!d.hasAmount) y.withoutAmount += 1;
      byYearMap.set(d.sourceYear, y);
    }

    if (d.buyerId) {
      const b = byBuyerMap.get(d.buyerId) ?? {
        buyerId: d.buyerId,
        buyerName: d.buyerName ?? "",
        total: 0,
        contracts: 0,
        buyerTotalSpend: 0,
        shareBp: 0,
        minYear: null,
        maxYear: null,
      };
      b.total += d.amount;
      b.contracts += 1;
      if (d.buyerName) b.buyerName = d.buyerName;
      if (d.sourceYear) {
        b.minYear = b.minYear === null ? d.sourceYear : Math.min(b.minYear, d.sourceYear);
        b.maxYear = b.maxYear === null ? d.sourceYear : Math.max(b.maxYear, d.sourceYear);
      }
      byBuyerMap.set(d.buyerId, b);
    }

    for (const s of d.suppliers) {
      const key = s.id || s.name;
      if (!key) continue;
      const row = bySupplierMap.get(key) ?? {
        supplierId: s.id ?? "",
        name: s.name ?? "",
        total: 0,
        contracts: 0,
        buyers: 0,
        buyerSet: new Set<string>(),
      };
      // A release's amount is the contract's, not the supplier's line — with one
      // supplier (the norm here) they coincide; with several the row is an upper
      // bound and the page says so.
      row.total += d.amount;
      row.contracts += 1;
      if (s.name) row.name = s.name;
      if (d.buyerId) row.buyerSet.add(d.buyerId);
      bySupplierMap.set(key, row);
    }

    const cat = d.category || "insumo-generico";
    const c = byCategoryMap.get(cat) ?? { category: cat, total: 0, contracts: 0 };
    c.total += d.amount;
    c.contracts += 1;
    byCategoryMap.set(cat, c);
  }

  // Denominators + mandate for the buyer table.
  const yearTotals = await buyerYearTotals([...byBuyerMap.keys()]);
  const buyerTotalOf = (id: string): number => {
    let sum = 0;
    for (const v of yearTotals.get(id)?.values() ?? []) sum += v;
    return sum;
  };
  for (const b of byBuyerMap.values()) {
    b.buyerTotalSpend = buyerTotalOf(b.buyerId);
    b.shareBp = b.buyerTotalSpend > 0 ? (b.total / b.buyerTotalSpend) * 10_000 : 0;
    // Labelled with the mandate of its most recent year IN THIS TOPIC. The page says
    // so; the per-contract chip is the year-accurate one.
    const m = mandateForBuyer(b.buyerId, b.maxYear);
    if (m.party) b.party = m.party;
    if (m.partyLabel) b.partyLabel = m.partyLabel;
    b.jurisdiction = m.jurisdiction;
  }

  // Party view — per CONTRACT-YEAR, and normalized only.
  //
  // Per contract-year because a buyer outlives an administration: MIDES bought under
  // four national governments, so folding its whole history into whoever governed last
  // would manufacture the finding. Each contract carries the mandate of ITS year.
  //
  // Normalized only because the Intendencia de Montevideo is ~83% of the measured
  // spend and Montevideo was governed by one party throughout: a raw peso ranking
  // measures who governs Montevideo, not who spends on gender policy. The denominator
  // is what those same organisms spent on EVERYTHING in the same years.
  const partyAgg = new Map<string, { total: number; contracts: number; buyers: Set<string>; pairs: Set<string> }>();
  for (const d of kept) {
    if (!d.party || !d.buyerId) continue;
    const p = partyAgg.get(d.party) ?? { total: 0, contracts: 0, buyers: new Set<string>(), pairs: new Set<string>() };
    p.total += d.amount;
    p.contracts += 1;
    p.buyers.add(d.buyerId);
    if (d.sourceYear) p.pairs.add(`${d.buyerId}|${d.sourceYear}`);
    partyAgg.set(d.party, p);
  }

  const byParty: ITopicPartyStat[] = [...partyAgg.entries()].map(([party, p]) => {
    // Denominator: every peso those buyers spent in the very years they appear here.
    let denom = 0;
    const perBuyerShare = new Map<string, { topic: number; all: number }>();
    for (const pair of p.pairs) {
      const [buyerId, yearRaw] = pair.split("|");
      const year = Number(yearRaw);
      const all = yearTotals.get(buyerId as string)?.get(year) ?? 0;
      denom += all;
      const row = perBuyerShare.get(buyerId as string) ?? { topic: 0, all: 0 };
      row.all += all;
      perBuyerShare.set(buyerId as string, row);
    }
    for (const d of kept) {
      if (d.party !== party || !d.buyerId) continue;
      const row = perBuyerShare.get(d.buyerId);
      if (row) row.topic += d.amount;
    }
    // Median over the organisms that actually have measured topic spend. Including the
    // ones whose whole topic total is unpriced would pin the median at 0 and say nothing.
    const shares = [...perBuyerShare.values()]
      .filter(r => r.all > 0 && r.topic > 0)
      .map(r => (r.topic / r.all) * 10_000);
    return {
      party,
      partyLabel: PARTY_META[party as PartyCode]?.label ?? party,
      total: p.total,
      contracts: p.contracts,
      organisms: p.buyers.size,
      weightedShareBp: denom > 0 ? (p.total / denom) * 10_000 : 0,
      medianShareBp: median(shares),
    };
  }).sort((a, b) => b.weightedShareBp - a.weightedShareBp);

  // How big the topic is against what these same organisms spent on EVERYTHING. The
  // only denominator the data supports without a full-corpus scan, and the one that
  // answers the question a reader actually has ("is this a lot?").
  const allBuyersSpend = [...byBuyerMap.values()].reduce((s2, b) => s2 + b.buyerTotalSpend, 0);
  const allBuysSpendBp = allBuyersSpend > 0 ? (total / allBuyersSpend) * 10_000 : 0;

  const recentCutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const years = kept.map(d => d.sourceYear).filter((y): y is number => typeof y === "number" && y > 0);

  const bySupplier: ITopicSupplierStat[] = [...bySupplierMap.values()]
    .map(({ buyerSet, ...row }) => ({ ...row, buyers: buyerSet.size }))
    .sort((a, b) => b.total - a.total || b.contracts - a.contracts)
    .slice(0, 60);

  const dataVersion = `v${Date.now()}`;
  const doc: ITopicSpending = {
    topicKey: topic.key,
    slug: topic.slug,
    total,
    contracts: kept.length,
    contractsWithAmount: withAmount,
    contractsWithoutAmount: kept.length - withAmount,
    coverage: kept.length ? withAmount / kept.length : 0,
    candidates: all.length,
    discarded,
    buyers: byBuyerMap.size,
    suppliers: bySupplierMap.size,
    buyersTotalSpend: allBuyersSpend,
    overallShareBp: allBuysSpendBp,
    minYear: years.length ? Math.min(...years) : null,
    maxYear: years.length ? Math.max(...years) : null,
    byYear: [...byYearMap.values()].sort((a, b) => a.year - b.year),
    byBuyer: [...byBuyerMap.values()].sort((a, b) => b.total - a.total || b.contracts - a.contracts),
    bySupplier,
    byCategory: [...byCategoryMap.values()].sort((a, b) => b.total - a.total),
    byParty,
    topContracts: kept
      .slice()
      .sort((a, b) => b.amount - a.amount || (b.sourceYear ?? 0) - (a.sourceYear ?? 0))
      .slice(0, MAX_TOP_CONTRACTS)
      .map(toRef),
    recent: kept
      .filter(d => d.firstSeenAt && d.firstSeenAt >= recentCutoff)
      .sort((a, b) => (b.firstSeenAt?.getTime() ?? 0) - (a.firstSeenAt?.getTime() ?? 0))
      .slice(0, MAX_RECENT)
      .map(toRef),
    openCalls: await openCallsFor(topic),
    aiModel: verdicts ? opts.model : "",
    aiVerdicts: verdicts,
    rulesVersion,
    dataVersion,
    calculatedAt: new Date(),
  };

  // Compute-then-swap. Collect the generations we are replacing BEFORE writing, then
  // delete exactly those. `{ $ne: dataVersion }` would let two overlapping runs delete
  // each other's generation and leave the collection empty.
  const stale = await TopicSpendingModel.find({ topicKey: topic.key }, { dataVersion: 1 }).lean<Array<{ dataVersion: string }>>();
  const staleVersions = stale.map(s => s.dataVersion).filter(v => v && v !== dataVersion);

  await TopicSpendingModel.create(doc);
  if (staleVersions.length) {
    await TopicSpendingModel.deleteMany({ topicKey: topic.key, dataVersion: { $in: staleVersions } });
  }

  console.log(
    `[topic:${topic.key}] done in ${Math.round((Date.now() - started) / 1000)}s — `
    + `${kept.length} contracts, ${discarded} discarded, ${Math.round(total).toLocaleString("es-UY")} UYU, `
    + `coverage ${(doc.coverage * 100).toFixed(0)}%, ${doc.openCalls.length} open calls, ${doc.recent.length} new this week`,
  );
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
    process.env.MONGO_SOCKET_TIMEOUT_MS = String(20 * 60 * 1000);
  }
  await connectToDatabase();

  for (const key of opts.topics) {
    const topic = getTopic(key);
    if (!topic) {
      console.error(`Unknown topic "${key}". Known: ${SPENDING_TOPICS.map(t => t.key).join(", ")}`);
      process.exitCode = 1;
      continue;
    }
    await runTopic(topic, opts);
  }

  await disconnectFromDatabase();
}

main().catch(async (err) => {
  console.error("[topic-spending] failed:", err instanceof Error ? err.message : err);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(1);
});
