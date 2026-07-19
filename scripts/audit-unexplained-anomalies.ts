#!/usr/bin/env tsx
/**
 * One-off audit: assemble FULL context for every unexplained price anomaly
 * (aiVerdict.explainable === 'no') and dump it to JSON so it can be reviewed
 * item-by-item — the same context the AI triage SHOULD have had, plus a few
 * signals the triage never computes (line total, award total, baseline span,
 * whether características actually exist for the flagged line under a
 * case-insensitive unit match).
 *
 * Output: scratchpad/unexplained-context.json  (path printed at the end)
 *
 *   npx tsx scripts/audit-unexplained-anomalies.ts
 */
import fs from "fs";
import path from "path";
import { AnomalyModel, ContractItemFeaturesModel, ReleaseModel } from "../shared/models";
import { connectToDatabase, disconnectFromDatabase } from "../shared/connection/database";
import { canonicalUnit } from "../shared/utils/units";

const OUT = process.env.AUDIT_OUT ?? path.resolve(process.cwd(), "scratchpad-unexplained-context.json");

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function truncate(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
function compraIdFromOcid(ocid: unknown): string | null {
  if (typeof ocid !== "string" || !ocid) return null;
  const id = ocid.replace(/^ocds-[^-]+-/, "");
  return id && id !== ocid ? id : null;
}
function itemNro(id: unknown): number | null {
  if (typeof id === "number") return Number.isFinite(id) ? id : null;
  if (typeof id === "string") {
    const m = /^\s*(\d+)/.exec(id);
    if (m) return Number.parseInt(m[1]!, 10);
  }
  return null;
}
function compactSpec(feats: { name: string; value: string }[]): string | null {
  const pick = (re: RegExp) => feats.find((f) => re.test(f.name))?.value ?? null;
  const parts = [pick(/concentra/i), pick(/medida/i) ?? pick(/presentaci/i)].filter(Boolean);
  const base = parts.join(" · ") || (pick(/nombre comercial|modelo/i) ?? "");
  return base ? truncate(base, 70) : null;
}

async function main(): Promise<void> {
  await connectToDatabase();

  const anomalies = (await AnomalyModel.find(
    { type: "price_spike", "aiVerdict.explainable": "no" },
    {
      releaseId: 1, awardId: 1, detectedValue: 1, expectedRange: 1, currency: 1, severity: 1,
      severityRank: 1, sourceYear: 1, "metadata.itemClassification": 1, "metadata.itemUnit": 1,
      "metadata.itemQuantity": 1, "metadata.zScore": 1, "metadata.baselineN": 1,
      "metadata.supplierName": 1, "metadata.buyerName": 1, "metadata.itemDescription": 1,
      "aiVerdict.reason": 1, "aiVerdict.analysis": 1, "aiVerdict.confidence": 1, "aiVerdict.usedFeatures": 1,
    }
  ).lean()) as any[];
  console.log(`unexplained anomalies: ${anomalies.length}`);

  const releaseIds = [...new Set(anomalies.map((a) => a.releaseId).filter(Boolean))];
  const releaseById = new Map<string, any>();
  const BATCH = 400;
  for (let i = 0; i < releaseIds.length; i += BATCH) {
    const docs = (await ReleaseModel.find(
      { id: { $in: releaseIds.slice(i, i + BATCH) } },
      { id: 1, ocid: 1, "tender.title": 1, "tender.description": 1, "tender.procurementMethodDetails": 1, "tender.documents": 1, "awards.id": 1, "awards.items": 1, "awards.documents": 1 }
    ).lean()) as any[];
    for (const d of docs) releaseById.set(d.id, d);
  }

  // Borrow tender-stage objeto for award releases that lack one.
  const subjOcids = [...new Set([...releaseById.values()].filter((r) => !r.tender?.description?.trim() && !r.tender?.title?.trim()).map((r) => r.ocid).filter(Boolean))];
  const subjByOcid = new Map<string, { description?: string; title?: string }>();
  for (let i = 0; i < subjOcids.length; i += BATCH) {
    const docs = (await ReleaseModel.find({ ocid: { $in: subjOcids.slice(i, i + BATCH) }, tag: "tender" }, { ocid: 1, "tender.description": 1, "tender.title": 1 }).lean()) as any[];
    for (const d of docs) if (d.ocid) subjByOcid.set(d.ocid, { description: d.tender?.description, title: d.tender?.title });
  }

  const compraIds = [...new Set([...releaseById.values()].map((r) => compraIdFromOcid(r.ocid)).filter(Boolean))] as string[];
  const featByCompra = new Map<string, any[]>();
  const objByCompra = new Map<string, string>();
  for (let i = 0; i < compraIds.length; i += BATCH) {
    const docs = (await ContractItemFeaturesModel.find({ compraId: { $in: compraIds.slice(i, i + BATCH) } }, { compraId: 1, items: 1, object: 1 }).lean()) as any[];
    for (const c of docs) {
      featByCompra.set(c.compraId, c.items ?? []);
      if (c.object) objByCompra.set(c.compraId, c.object);
    }
  }

  const out = anomalies.map((a) => {
    const rel = releaseById.get(a.releaseId);
    const compraId = rel ? compraIdFromOcid(rel.ocid) : null;
    const borrowed = rel?.ocid ? subjByOcid.get(rel.ocid) : undefined;
    const scrapedObject = compraId ? objByCompra.get(compraId) : undefined;
    const subject = truncate(rel?.tender?.description) ?? truncate(borrowed?.description) ?? truncate(scrapedObject) ?? truncate(rel?.tender?.title) ?? truncate(borrowed?.title);
    const procedure = truncate(rel?.tender?.procurementMethodDetails, 80);

    const awards = Array.isArray(rel?.awards) ? rel.awards : [];
    const award = a.awardId ? awards.find((w: any) => w?.id === a.awardId) : awards[0];
    const items = Array.isArray(award?.items) ? award.items : [];

    const targetCls = a.metadata?.itemClassification?.id ?? null;
    const targetUnit = a.metadata?.itemUnit?.name ?? null; // canonical/lowercase
    const targetPrice = a.detectedValue;

    const scraped = compraId ? featByCompra.get(compraId) : undefined;
    const featsByNro = new Map<number, { name: string; value: string }[]>();
    if (scraped) for (const s of scraped) featsByNro.set(s.nro, s.features ?? []);

    let targetNro: number | null = null;
    let matched = false;
    let awardTotal = 0;
    const siblings = items.map((it: any) => {
      const clsId = it?.classification?.id ?? null;
      const rawUnit = it?.unit?.name ?? null;
      const price = num(it?.unit?.value?.amount);
      const qty = num(it?.quantity);
      const nro = itemNro(it?.id);
      if (price !== null && qty !== null) awardTotal += price * qty;
      // CASE-INSENSITIVE unit match (the fix): compare canonical unit, not raw.
      const isTarget = !matched && clsId === targetCls && canonicalUnit(rawUnit) === targetUnit && price === targetPrice;
      if (isTarget) { matched = true; targetNro = nro; }
      const feats = nro !== null ? featsByNro.get(nro) : undefined;
      return { desc: truncate(it?.description), clsId, rawUnit, canonUnit: canonicalUnit(rawUnit), qty, price, spec: feats ? compactSpec(feats) : null, isTarget, nro };
    });

    // Features for the flagged line (case-insensitive match); also a loose fallback:
    // if no exact match, but exactly one sibling shares the classification, use it.
    let features: { name: string; value: string }[] = [];
    let matchMode = "none";
    if (scraped && targetNro !== null) {
      const hit = scraped.find((s: any) => s.nro === targetNro);
      if (hit) { features = hit.features ?? []; matchMode = "exact"; }
    }
    if (features.length === 0 && scraped) {
      const sameCls = siblings.filter((s: any) => s.clsId === targetCls);
      if (sameCls.length === 1 && sameCls[0].nro !== null) {
        const hit = scraped.find((s: any) => s.nro === sameCls[0].nro);
        if (hit && (hit.features?.length ?? 0) > 0) { features = hit.features; matchMode = "single-cls-fallback"; }
      }
    }

    const paid = num(a.detectedValue);
    const p95 = num(a.expectedRange?.max);
    const p25 = num(a.expectedRange?.min);
    const qty = num(a.metadata?.itemQuantity);
    const lineTotal = paid !== null && qty !== null ? paid * qty : null;

    return {
      id: String(a._id),
      releaseId: a.releaseId,
      ocid: rel?.ocid ?? null,
      compraId,
      publicUrl: compraId ? `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/${compraId}` : null,
      severity: a.severity,
      year: a.sourceYear ?? a.metadata?.year ?? null,
      item: {
        clsId: targetCls,
        desc: truncate(a.metadata?.itemClassification?.description) ?? truncate(a.metadata?.itemDescription),
        canonicalName: truncate(a.metadata?.itemClassification?.canonicalName),
        rubro: truncate(a.metadata?.itemClassification?.rubro),
        unit: targetUnit,
        officialUnit: a.metadata?.itemUnit?.officialUnit ?? null,
        unitMismatch: a.metadata?.itemUnit?.mismatch ?? null,
        qty,
      },
      paid,
      currency: a.currency ?? "UYU",
      range: { p25, p95 },
      ratioOverP95: paid !== null && p95 ? paid / p95 : null,
      baselineSpan: p25 && p95 ? p95 / p25 : null,
      zScore: num(a.metadata?.zScore),
      baselineN: num(a.metadata?.baselineN),
      lineTotal,
      awardTotal: awardTotal || null,
      lineIsWholeAward: lineTotal !== null && awardTotal ? Math.abs(lineTotal - awardTotal) / awardTotal < 0.02 : null,
      supplier: truncate(a.metadata?.supplierName),
      buyer: truncate(a.metadata?.buyerName),
      subject,
      procedure,
      featureMatchMode: matchMode,
      features: features.slice(0, 12).map((f) => ({ name: truncate(f.name, 60), value: truncate(f.value, 120) })),
      siblingCount: siblings.length,
      siblings: siblings.slice(0, 15),
      currentVerdict: { reason: truncate(a.aiVerdict?.reason, 300), analysis: truncate(a.aiVerdict?.analysis, 600), confidence: a.aiVerdict?.confidence, usedFeatures: a.aiVerdict?.usedFeatures ?? 0 },
    };
  });

  // Quick bucketing stats.
  const stats = {
    total: out.length,
    hadFeaturesAvailable: out.filter((o) => o.features.length > 0).length,
    exactFeatureMatch: out.filter((o) => o.featureMatchMode === "exact").length,
    fallbackFeatureMatch: out.filter((o) => o.featureMatchMode === "single-cls-fallback").length,
    lineIsWholeAward: out.filter((o) => o.lineIsWholeAward).length,
    catchAllCode: out.filter((o) => ["0", "1", "", "5"].includes(o.item.clsId) || (o.item.clsId?.length ?? 9) <= 2).length,
    extremeSpanGt200: out.filter((o) => (o.baselineSpan ?? 0) > 200).length,
    marginalRatioLt1_25: out.filter((o) => (o.ratioOverP95 ?? 9) < 1.25).length,
    unitMismatch: out.filter((o) => o.item.unitMismatch === true).length,
    qtyGt1: out.filter((o) => (o.item.qty ?? 0) > 1).length,
  };
  console.log(JSON.stringify(stats, null, 2));

  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), stats, items: out }, null, 2));
  console.log(`\nwrote ${out.length} contexts → ${OUT}`);
}

main()
  .then(async () => { await disconnectFromDatabase(); process.exit(0); })
  .catch(async (e) => { console.error(e); await disconnectFromDatabase().catch(() => {}); process.exit(1); });
