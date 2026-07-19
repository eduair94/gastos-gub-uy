#!/usr/bin/env tsx

/**
 * AI context for state suppliers — what each one IS, plus a filterable category.
 *
 * Rankings across the site read as a wall of raw legal names ("BTL URUGUAY
 * S.R.L.", "S.A. EMISORAS DE TELEVISION Y ANEXOS SAETA"). This job asks a cheap
 * LLM to classify a supplier and describe it in one line, so the pauta page (and
 * later the supplier directory / anomalies) can show a category chip and a
 * plain-language hint of who the recipient is.
 *
 * Scope is deliberately TARGETED, not the whole 42k-supplier tail:
 *   - default target is the pauta recipients (the advertising-class top
 *     suppliers), which is the immediate consumer;
 *   - `--names="A,B"` enriches an explicit list;
 *   - `--top=N` enriches the N biggest suppliers overall by spend.
 *
 * The output is ADVISORY AI context, never a fact of record — consumers must
 * label it and keep the confidence visible. Personal names are tagged `persona`
 * and left without a biography on purpose (privacy).
 *
 * ## Cost: rules first, model only for the tail
 *
 * ~97% of suppliers (companies, people, co-ops, public bodies) are classified
 * for FREE by name rules — they never needed a description. Only media/agency-
 * shaped or unmatched names reach the LLM, so even a full 40k pass costs cents.
 * `--rules-only` does a pure-free pass; the default fills the tail with the
 * model. Gemini flash-lite also has a free tier (~1.5k req/day) — throttle to
 * it and the model part is $0 too.
 *
 * No web grounding: the Gemini client is structured-output only, incompatible
 * with the Search tool in one call. Well-known media/agencies are answered from
 * model knowledge; obscure names come back `otro` / low confidence.
 *
 * Usage:
 *   npx tsx src/jobs/enrich-suppliers.ts --dry-run          # plan + cost estimate, no calls
 *   npx tsx src/jobs/enrich-suppliers.ts --top=2000 --rules-only   # free: rules only, no model
 *   npx tsx src/jobs/enrich-suppliers.ts --top=2000         # rules + model for the tail
 *   npx tsx src/jobs/enrich-suppliers.ts --names="EL PAIS S A,LA DIARIA  S.A."
 *   npx tsx src/jobs/enrich-suppliers.ts --no-rules --top=50       # force model on everything
 *   npx tsx src/jobs/enrich-suppliers.ts --all              # re-enrich even if already stored
 */

import { mongoose } from "../../shared/connection/database";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { SUPPLIER_CATEGORIES, SupplierEnrichmentModel } from "../../shared/models/supplier_enrichment";
import { callGeminiStructured, estimateCostUsd, FLASH_LITE_PRICING, GeminiSchema, GeminiUsage } from "./ai/gemini-client";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const PAUTA_CLASS = "PUBLICIDAD Y PROPAGANDA";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const SYSTEM_INSTRUCTION = `Identificás proveedores del Estado uruguayo a partir de su razón social tal como figura en Compras Estatales.

Para cada proveedor devolvés:
- category: una de estas categorías EXACTAS: ${SUPPLIER_CATEGORIES.join(", ")}.
  · medio-tv: canal de televisión. medio-radio: emisora de radio. medio-prensa: diario/semanario/revista en papel. medio-digital: portal/medio online. medio-via-publica: publicidad exterior (carteles, vallas, pantallas).
  · agencia-publicidad: agencia de publicidad/marketing. productora: productora audiovisual/eventos.
  · organismo-publico: es en realidad un organismo o empresa del propio Estado. empresa: empresa privada de otro rubro. cooperativa. persona: nombre de una persona física (no una empresa). otro: no lo podés determinar.
- description: UNA línea en español, concreta, de qué es (marca comercial conocida si aplica). Vacía si es 'persona'.
- descriptionEn: la misma línea en inglés. Vacía si es 'persona'.
- confidence: 0 a 1. Qué tan seguro estás de la identificación.

Reglas: NO inventes. Si no reconocés el nombre con razonable certeza, usá category 'otro' y confidence baja (<0.4) y una description honesta ("proveedor no identificado"). Un nombre de persona física va a 'persona' con description vacía. No agregues datos personales de individuos.`;

interface EnrichResult {
  category: string;
  description: string;
  descriptionEn: string;
  confidence: number;
}

const SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING", enum: [...SUPPLIER_CATEGORIES] },
    description: { type: "STRING" },
    descriptionEn: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
  required: ["category", "description", "confidence"],
  propertyOrdering: ["category", "description", "descriptionEn", "confidence"],
};

/** The pauta recipients: top suppliers of the advertising catalogue class. */
async function pautaOutlets(limit: number): Promise<string[]> {
  const col = mongoose.connection.db!.collection("product_analytics");
  const rows = await col
    .aggregate([
      { $match: { clasName: PAUTA_CLASS } },
      { $unwind: "$topSuppliers" },
      { $group: { _id: "$topSuppliers.name", spend: { $sum: "$topSuppliers.spendUYU" } } },
      { $sort: { spend: -1 } },
      { $limit: limit },
    ])
    .toArray();
  return rows.map((r) => r._id as string).filter(Boolean);
}

/** The N biggest suppliers overall, from supplier_patterns (spend is `totalValue`). */
async function topSuppliers(limit: number): Promise<string[]> {
  const col = mongoose.connection.db!.collection("supplier_patterns");
  const rows = await col.find({}, { projection: { name: 1 } }).sort({ totalValue: -1 }).limit(limit).toArray();
  return rows.map((r) => (r as { name?: string }).name ?? "").filter(Boolean);
}

const RULE_MODEL = "rules-v1";

interface RuleResult {
  category: string;
  confidence: number;
  /** True when the name deserves the model (media/agency needing a real
   *  description, or nothing matched). */
  needsLLM: boolean;
}

/**
 * Free, deterministic classification for the boring bulk — companies, people,
 * co-ops, public bodies — which are ~97% of suppliers and never needed a
 * description anyway. Anything media/advertising-shaped, or that no rule
 * matches, returns needsLLM so the model names it precisely. This is what keeps
 * the spend near zero: the LLM only ever sees the interesting tail.
 */
function classifyByRules(rawName: string): RuleResult {
  const name = rawName.replace(/\s+/g, " ").trim();
  const U = name.toUpperCase();

  // Media / advertising cues — worth a precise type + description → defer to the model.
  if (/\b(CANAL|TELEVISOR|TELEVISION|RADIO|EMISORA|DIARIO|SEMANARIO|PERIODICO|FM|PUBLICIDAD|PUBLICITARI|BROADCAST|COMUNICACION|PRENSA|EDITORIAL|PRODUCTORA|AGENCIA)\b/.test(U)) {
    return { category: "otro", confidence: 0, needsLLM: true };
  }

  // Co-op.
  if (/\bCOOPERATIVA\b|\bCOOP\b/.test(U)) {
    return { category: "cooperativa", confidence: 0.85, needsLLM: false };
  }

  // Public body — appearing as a supplier is itself an anomaly, but the name is unambiguous.
  if (
    /^(INTENDENCIA|MINISTERIO|ADMINISTRACION NACIONAL|DIRECCION NACIONAL|DIRECCION GENERAL|INTENDENCIA|INSTITUTO NACIONAL|COMISION NACIONAL|FONDO NACIONAL|PRESIDENCIA|CONTADURIA|CONSEJO)\b/.test(U)
    || /\b(ANCAP|ANTEL|ANEP|UDELAR|BROU|BPS|BSE|UTE|OSE|AFE|ANP|ANV)\b/.test(U)
  ) {
    return { category: "organismo-publico", confidence: 0.85, needsLLM: false };
  }

  // A registered company (has a legal form) → category is safe, no description needed.
  const hasCompanyForm
    = /\b(S\.?A\.?S?|S\.?R\.?L|SAS|SRL|LTDA|LIMITADA|SOCIEDAD ANONIMA)\b/.test(U)
      || /\b(ASOCIACION|FUNDACION|CAMARA|FEDERACION)\b/.test(U);
  if (hasCompanyForm) {
    return { category: "empresa", confidence: 0.8, needsLLM: false };
  }

  // No legal form and 2–5 all-letter words → almost certainly a person (unipersonal).
  const words = name.split(" ").filter(Boolean);
  const looksPersonal = words.length >= 2 && words.length <= 5
    && words.every(w => /^[A-Za-zÀ-ÿ.'-]+$/.test(w));
  if (looksPersonal) {
    return { category: "persona", confidence: 0.7, needsLLM: false };
  }

  // Unsure — let the model try.
  return { category: "otro", confidence: 0, needsLLM: true };
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  const model = arg("model") ?? DEFAULT_MODEL;
  const dryRun = flag("dry-run");
  const all = flag("all");
  const limit = arg("limit") ? Number.parseInt(arg("limit")!, 10) : Infinity;

  await connectToDatabase();

  // Build the target name list.
  let names: string[];
  const namesArg = arg("names");
  if (namesArg) {
    names = namesArg.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (arg("top")) {
    names = await topSuppliers(Number.parseInt(arg("top")!, 10));
  } else {
    names = await pautaOutlets(40);
  }
  // Dedup, keep order.
  names = [...new Set(names)];

  // Skip already-enriched unless --all.
  if (!all) {
    const done = new Set(
      (await SupplierEnrichmentModel.find({ name: { $in: names } }, { name: 1 }).lean()).map((d) => d.name)
    );
    names = names.filter((n) => !done.has(n));
  }
  if (Number.isFinite(limit)) names = names.slice(0, limit);

  console.log(`[enrich] model=${model} targets=${names.length}${all ? " (re-enriching)" : " (new only)"}${dryRun ? " DRY-RUN" : ""}`);
  if (!names.length) {
    console.log("[enrich] nothing to do.");
    await disconnectFromDatabase();
    return;
  }
  console.log(names.map((n, i) => `  ${i + 1}. ${n}`).join("\n"));

  // Rules-first: classify the obvious bulk (companies, people, co-ops, public
  // bodies) for FREE. Only media/agency-shaped or unmatched names reach the model.
  const noRules = flag("no-rules");
  const rulesOnly = flag("rules-only");
  let ruled = 0;
  const needLLM: string[] = [];
  for (const name of names) {
    const r = noRules ? { needsLLM: true, category: "otro", confidence: 0 } : classifyByRules(name);
    if (!r.needsLLM) {
      if (!dryRun) {
        await SupplierEnrichmentModel.updateOne(
          { name },
          { $set: { name, category: r.category, description: "", descriptionEn: "", confidence: r.confidence, grounded: false, model: RULE_MODEL, enrichedAt: new Date() } },
          { upsert: true }
        );
      }
      ruled++;
    }
    else {
      needLLM.push(name);
    }
  }
  console.log(`[enrich] rules classified ${ruled} for free; ${needLLM.length} left for the model`);

  if (dryRun) {
    console.log(`[enrich] dry-run: would call ${model} for ${needLLM.length} suppliers (~$${(needLLM.length * 0.00008).toFixed(4)} est.). Rules would cover ${ruled} for $0.`);
    await disconnectFromDatabase();
    return;
  }

  if (rulesOnly) {
    console.log(`[enrich] rules-only: ${ruled} stored free; ${needLLM.length} left (run without --rules-only to fill with the model).`);
    await disconnectFromDatabase();
    return;
  }

  if (!needLLM.length) {
    console.log(`[enrich] done: ${ruled} classified by rules, nothing left for the model. cost=$0`);
    await disconnectFromDatabase();
    return;
  }

  if (!apiKey) {
    console.error("[enrich] GEMINI_API_KEY is not set — cannot call the API. Set it and re-run (or use --rules-only for the free pass).");
    await disconnectFromDatabase();
    process.exit(1);
  }

  const totalUsage: GeminiUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
  let ok = 0;
  let failed = 0;

  for (const name of needLLM) {
    try {
      const { data, usage } = await callGeminiStructured<EnrichResult>({
        apiKey,
        model,
        systemInstruction: SYSTEM_INSTRUCTION,
        prompt: `Proveedor del Estado uruguayo: "${name}". Clasificalo y describilo.`,
        schema: SCHEMA,
        temperature: 0,
      });
      totalUsage.promptTokens += usage.promptTokens;
      totalUsage.candidatesTokens += usage.candidatesTokens;
      totalUsage.totalTokens += usage.totalTokens;

      const category = (SUPPLIER_CATEGORIES as readonly string[]).includes(data.category) ? data.category : "otro";
      const isPerson = category === "persona";
      await SupplierEnrichmentModel.updateOne(
        { name },
        {
          $set: {
            name,
            category,
            description: isPerson ? "" : (data.description ?? "").trim().slice(0, 240),
            descriptionEn: isPerson ? "" : (data.descriptionEn ?? "").trim().slice(0, 240),
            confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
            grounded: false,
            model,
            enrichedAt: new Date(),
          },
        },
        { upsert: true }
      );
      ok++;
      console.log(`  ✓ [${category}] ${name}  ·  conf ${(data.confidence ?? 0).toFixed(2)}  ·  ${(data.description || "—").slice(0, 70)}`);
    } catch (error) {
      failed++;
      console.warn(`  ✗ ${name}: ${(error as Error).message}`);
    }
  }

  const cost = estimateCostUsd(totalUsage, FLASH_LITE_PRICING);
  console.log(`[enrich] done: ${ruled} by rules (free) + ${ok} by model, ${failed} failed. tokens=${totalUsage.totalTokens} est.cost=$${cost.toFixed(4)}`);

  await disconnectFromDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
