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
 * No web grounding: the current Gemini client is structured-output only, which is
 * incompatible with the Search tool in one call. Well-known media/agencies/entes
 * are answered from model knowledge; obscure names come back `otro` / low
 * confidence and can be re-run with grounding once that path exists.
 *
 * Usage:
 *   npx tsx src/jobs/enrich-suppliers.ts --dry-run          # plan + cost estimate, no API calls
 *   npx tsx src/jobs/enrich-suppliers.ts                    # enrich the pauta recipients (skip done)
 *   npx tsx src/jobs/enrich-suppliers.ts --limit=10         # cheap sample
 *   npx tsx src/jobs/enrich-suppliers.ts --top=500          # 500 biggest suppliers by spend
 *   npx tsx src/jobs/enrich-suppliers.ts --names="EL PAIS S A,LA DIARIA  S.A."
 *   npx tsx src/jobs/enrich-suppliers.ts --all              # re-enrich even if already stored
 *   npx tsx src/jobs/enrich-suppliers.ts --model=gemini-2.5-flash
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

  if (dryRun) {
    console.log(`[enrich] dry-run: would call ${model} for ${names.length} suppliers (~$${(names.length * 0.00008).toFixed(4)} est.).`);
    await disconnectFromDatabase();
    return;
  }

  if (!apiKey) {
    console.error("[enrich] GEMINI_API_KEY is not set — cannot call the API. Set it and re-run.");
    await disconnectFromDatabase();
    process.exit(1);
  }

  const totalUsage: GeminiUsage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
  let ok = 0;
  let failed = 0;

  for (const name of names) {
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
  console.log(`[enrich] done: ${ok} ok, ${failed} failed. tokens=${totalUsage.totalTokens} est.cost=$${cost.toFixed(4)}`);

  await disconnectFromDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
