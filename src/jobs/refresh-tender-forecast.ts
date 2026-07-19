#!/usr/bin/env tsx
/**
 * Monthly precompute of recurring-tender forecasts per (buyer.id × mid-level SICE
 * rubro node), written to `tender_forecast` via compute-then-swap-by-dataVersion.
 *
 * Two COLLSCANs over `releases` (buyer.id unindexed, allowDiskUse, monthly only):
 *   E. events     — tender-phase releases → per (buyer, leaf) event {date, compra, method}
 *   W. incumbents — award-phase releases  → per (buyer, leaf) latest award supplier
 * Then in memory: leaf → rubro node (sice_catalog), regroup (buyer, node), dedupe
 * events by compra, compute cadence/window/confidence, attach evidence + incumbent
 * + expected amount (item_price_baselines), suppress groups already open, write.
 *
 * DERIVED / DESCRIPTIVE — the feed has no pre-publication signal. Run manually with
 * `npm run refresh-tender-forecast`. Scheduled monthly by cronserver.ts.
 *
 * SCHEMA NOTES (validated against the live DB, 2026-07-19 — these drove the shape
 * of the pipelines and are NOT guesses):
 *   - Tender-phase releases carry `tender.items[].classification.id` (string) and a
 *     real Date at `tender.tenderPeriod.startDate` (5000/5000 sampled `llamado-`).
 *   - Award-phase releases carry NO `tender` object at all (`tender.items` missing on
 *     5000/5000 sampled `adjudicacion-`). Their leaf codes live at
 *     `awards[].items[].classification.id`, so the award pipeline unwinds awards+items.
 *   - `awards[].date` is a Date in 4999/5000 and a string in 1/5000, hence the $cond
 *     type-guard with a fallback to the (always-Date) release-level `date`.
 *   - `ocid` is 1:1 with a compra across phases, so it is the event dedupe key.
 *   - classification.id "0" is a real placeholder value in the data and is absent from
 *     sice_catalog, so it drops out naturally at the pickRubroNode step.
 */
import { connectToDatabase } from "../../shared/connection/database";
import {
  ItemPriceBaselineModel, OpenCallModel, ReleaseModel, SiceCatalogModel, TenderForecastModel,
} from "../../shared/models";
import type { ITenderForecast } from "../../shared/models";
import { releaseKind } from "./open-calls/project";
import type { ReleaseKind } from "./open-calls/project";
import { computeCadence, expectedWindow, confidenceScore } from "../../shared/forecast/recurrence";
import { pickRubroNode, ancestorsForLeaf } from "../../shared/forecast/rubro-node";
import type { CatalogNodeFields } from "../../shared/forecast/rubro-node";
import {
  MIN_EVENTS, RUBRO_LEVEL, EVIDENCE_TOP, DISPLAY_THRESHOLD,
} from "../../shared/forecast/constants";

// One deduped event of a llamado for a (buyer, leaf) pair.
interface EventRow {
  _id: { b: string; leaf: string };
  bn: string | null;
  events: { d: Date; compra: string; m: string | null }[];
}
interface AwardRow {
  _id: { b: string; leaf: string };
  top: { d: Date; name: string | null; id: string | null };
}

const RUBRO_LVL = RUBRO_LEVEL as 2 | 3;
const WRITE_CHUNK = 500;

// The pipelines classify a release by its `id` prefix server-side. Keep those regexes
// provably in sync with the shared releaseKind() helper rather than hand-duplicating it.
const TENDER_KINDS = ["llamado", "aclar_llamado", "ajuste_llamado"] as const satisfies readonly ReleaseKind[];
const AWARD_KINDS = ["adjudicacion", "ajuste_adjudicacion"] as const satisfies readonly ReleaseKind[];
for (const k of [...TENDER_KINDS, ...AWARD_KINDS]) {
  if (releaseKind(`${k}-1`) !== k) throw new Error(`[tender-forecast] releaseKind drift for "${k}"`);
}
const TENDER_RE = `^(${TENDER_KINDS.join("|")})-`;
const AWARD_RE = `^(${AWARD_KINDS.join("|")})-`;

/** ocid "ocds-yfs5dr-100001" → 100001; falls back to the raw string when non-numeric. */
function compraKey(ocid: string): number | string {
  const n = Number(ocid.slice(ocid.lastIndexOf("-") + 1));
  return Number.isFinite(n) ? n : ocid;
}

/**
 * Snap an event to its UTC day. `tender.tenderPeriod.startDate` carries a time of day,
 * and an organism routinely publishes several distinct llamados of the same rubro within
 * the same afternoon. Left at full precision those minutes-apart timestamps ARE the
 * cadence: a first run produced 86 forecasts with medianDays≈0.002 (≈3 minutes), one of
 * them cv=0 → confidence 0.83 for four llamados published inside a quarter of an hour.
 * A procurement occasion is a day, not an instant, so cadence is computed on UTC days —
 * which also makes computeCadence's identical-timestamp dedupe collapse those batches and
 * makes cadence.eventCount read as "distinct days", the unit MIN_EVENTS is meant to gate.
 * (UTC, not Montevideo local, to stay consistent with computeCadence's getUTCMonth.)
 */
function toUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function run(): Promise<void> {
  const started = Date.now();
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) process.env.MONGO_SOCKET_TIMEOUT_MS = String(15 * 60 * 1000);
  const dataVersion = `v${Date.now()}`;
  console.log("[tender-forecast] connecting…");
  await connectToDatabase();

  // ---- Catalog: 90k small docs, cheaper and safer than a 5-figure $in list ----
  console.log("[tender-forecast] loading sice_catalog…");
  const catByCode = new Map<string, CatalogNodeFields & { canonicalName?: string }>();
  for await (const c of SiceCatalogModel.find({}).select("code rubroTokens subfName clasName canonicalName").lean().cursor()) {
    catByCode.set(c.code, c as CatalogNodeFields & { canonicalName?: string });
  }
  console.log(`[tender-forecast] catalog: ${catByCode.size} articles`);

  // ---- Fold (buyer × leaf) events into (buyer × rubroNode) groups ----
  interface Group {
    buyerId: string; buyerName: string;
    rubroNodeId: string; rubroLabel: string; rubroLevel: number;
    dates: Date[]; compras: Set<number | string>;
    leafCounts: Map<string, number>; leafLabels: Map<string, string>;
    ancestors: Set<string>; methods: { tender: number; total: number };
  }
  const groups = new Map<string, Group>();

  // ---- E. events: tender-phase releases → per (buyer, leaf) event list ----
  // Event date = tender.tenderPeriod.startDate, fallback release-level date.
  // Pre-grouped by compra so aclaraciones/ajustes of the same llamado collapse to one
  // event server-side (keeps the driver-side payload and the MIN_EVENTS prune honest).
  console.log("[tender-forecast] E: events…");
  let eventRows = 0;
  const eventCursor = ReleaseModel.aggregate<EventRow>([
    // Filter on the id prefix in the FIRST stage: only ~1 release in 4 is tender-phase,
    // so this keeps 3/4 of the collection out of the $unwind + $group spill.
    { $match: { "id": { $regex: TENDER_RE }, "buyer.id": { $type: "string", $ne: "" } } },
    {
      $project: {
        b: "$buyer.id",
        bn: "$buyer.name",
        compra: "$ocid",
        m: "$tender.procurementMethodDetails",
        d: { $ifNull: ["$tender.tenderPeriod.startDate", "$date"] },
        leaves: "$tender.items.classification.id",
      },
    },
    { $match: { d: { $type: "date" }, leaves: { $type: "array", $ne: [] } } },
    { $unwind: "$leaves" },
    { $match: { leaves: { $type: "string", $ne: "" } } },
    // one compra = one event, whatever its release count
    {
      $group: {
        _id: { b: "$b", leaf: "$leaves", compra: "$compra" },
        bn: { $first: "$bn" },
        d: { $min: "$d" },
        m: { $first: "$m" },
      },
    },
    {
      $group: {
        _id: { b: "$_id.b", leaf: "$_id.leaf" },
        bn: { $first: "$bn" },
        events: { $push: { d: "$d", compra: "$_id.compra", m: "$m" } },
      },
    },
    { $match: { $expr: { $gte: [{ $size: "$events" }, MIN_EVENTS] } } },
  ]).option({ allowDiskUse: true }).cursor();

  for await (const e of eventCursor) {
    eventRows++;
    const cat = catByCode.get(e._id.leaf);
    const node = pickRubroNode(cat, RUBRO_LVL);
    if (!node) continue; // leaf not in catalog → no rubro node → skip
    const key = `${e._id.b}|${node.nodeId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        buyerId: e._id.b, buyerName: e.bn ?? "",
        rubroNodeId: node.nodeId, rubroLabel: node.label, rubroLevel: node.level,
        dates: [], compras: new Set(), leafCounts: new Map(), leafLabels: new Map(),
        ancestors: new Set(), methods: { tender: 0, total: 0 },
      };
      groups.set(key, g);
    }
    if (!g.buyerName && e.bn) g.buyerName = e.bn;
    for (const anc of ancestorsForLeaf(cat)) g.ancestors.add(anc);
    // Label the leaf with its ARTICLE name. clasName is the clase name — the same string
    // for every leaf of a level-3 group, which would render the evidence list as five
    // repetitions of the rubro title instead of the five articles behind it. canonicalName
    // is the field open-calls already uses as the item label (enrichProjectionWithCatalog).
    g.leafLabels.set(e._id.leaf, cat?.canonicalName || cat?.clasName || cat?.subfName || e._id.leaf);
    for (const ev of e.events) {
      // Evidence counts are per LEAF and must not be swallowed by the group-level compra
      // dedupe below: a llamado listing two articles of the same clase is one occasion but
      // is evidence for both articles. Counting inside the dedupe made whichever leaf the
      // cursor happened to yield second score 0 — an order-dependent, non-reproducible doc.
      // Pipeline E already collapsed a compra's releases, so this is "distinct llamados
      // that included this article".
      g.leafCounts.set(e._id.leaf, (g.leafCounts.get(e._id.leaf) ?? 0) + 1);
      const ck = compraKey(ev.compra);
      if (g.compras.has(ck)) continue; // one llamado is one cadence event per group
      g.compras.add(ck);
      g.dates.push(toUtcDay(ev.d instanceof Date ? ev.d : new Date(ev.d)));
      g.methods.total++;
      if (typeof ev.m === "string" && /licitaci/i.test(ev.m)) g.methods.tender++;
    }
  }
  console.log(`[tender-forecast] E: ${eventRows} (buyer,leaf) rows → ${groups.size} (buyer,rubro) groups`);

  // ---- W. incumbents: award-phase releases → latest award supplier per (buyer, leaf) ----
  // Award releases have NO tender.items; their leaves live under awards[].items[].
  // $max over a {d,name,id} document picks the latest by date without a global $sort.
  console.log("[tender-forecast] W: incumbents…");
  const incByGroup = new Map<string, { date: Date; name: string | null; id: string | null }>();
  const forecastBuyers = [...new Set([...groups.values()].map(g => g.buyerId))];
  let awardRows = 0;
  const awardCursor = ReleaseModel.aggregate<AwardRow>([
    // Narrowed to the buyers that actually produced a candidate group — output-neutral
    // (an incumbent for any other buyer would be discarded below anyway) and it keeps
    // the awards+items double-$unwind from spilling the whole collection to disk.
    {
      $match: {
        "id": { $regex: AWARD_RE },
        "buyer.id": { $in: forecastBuyers },
        "awards": { $type: "array", $ne: [] },
      },
    },
    { $project: { b: "$buyer.id", awards: 1, date: 1 } },
    { $unwind: "$awards" },
    { $unwind: "$awards.items" },
    {
      $project: {
        b: 1,
        leaf: "$awards.items.classification.id",
        d: { $cond: [{ $eq: [{ $type: "$awards.date" }, "date"] }, "$awards.date", "$date"] },
        sup: { $arrayElemAt: ["$awards.suppliers", 0] },
      },
    },
    { $match: { leaf: { $type: "string", $ne: "" }, d: { $type: "date" } } },
    {
      $group: {
        _id: { b: "$b", leaf: "$leaf" },
        top: { $max: { d: "$d", name: "$sup.name", id: "$sup.id" } },
      },
    },
  ]).option({ allowDiskUse: true }).cursor();

  for await (const a of awardCursor) {
    awardRows++;
    const cat = catByCode.get(a._id.leaf);
    const node = pickRubroNode(cat, RUBRO_LVL);
    if (!node) continue;
    const key = `${a._id.b}|${node.nodeId}`;
    if (!groups.has(key)) continue; // no forecast group → no need for an incumbent
    const d = a.top?.d instanceof Date ? a.top.d : new Date(a.top?.d as unknown as string);
    if (!Number.isFinite(d.getTime())) continue;
    const cur = incByGroup.get(key);
    if (!cur || d.getTime() > cur.date.getTime()) {
      incByGroup.set(key, { date: d, name: a.top?.name ?? null, id: a.top?.id ?? null });
    }
  }
  console.log(`[tender-forecast] W: ${awardRows} (buyer,leaf) award rows → ${incByGroup.size} incumbents`);

  // ---- Expected amount: item_price_baselines (41k docs; load whole, keep best-n per code) ----
  const baselineByLeaf = new Map<string, { currency: string; p25: number; p50: number; n: number }>();
  for await (const b of ItemPriceBaselineModel.find({}).select("classificationId currency p25 p50 n").lean().cursor()) {
    const cur = baselineByLeaf.get(b.classificationId);
    if (!cur || b.n > cur.n) baselineByLeaf.set(b.classificationId, { currency: b.currency, p25: b.p25, p50: b.p50, n: b.n });
  }
  console.log(`[tender-forecast] baselines: ${baselineByLeaf.size} classification codes`);

  // ---- Build docs ----
  const docs: ITenderForecast[] = [];
  for (const g of groups.values()) {
    const cadence = computeCadence(g.dates);
    if (!cadence || cadence.eventCount < MIN_EVENTS) continue;
    if (cadence.medianDays < 1) continue; // degenerate: day-granular events are >=1 day apart
    const lastEventDate = new Date(Math.max(...g.dates.map(d => d.getTime())));
    const raw = expectedWindow(lastEventDate, cadence.medianDays, cadence.cvDays);
    // MIN_DISP_DAYS (15) is a floor on the window half-width, and cv>1 makes the
    // half-width exceed the interval itself, so for short or erratic cadences the raw
    // window opens BEFORE the event it is predicting from. That is unreadable ("next
    // expected: before the last one"), so the start is truncated to the day after the
    // last observed event. The end — the informative edge — is never moved.
    const minStart = lastEventDate.getTime() + 86_400_000;
    const window = { start: new Date(Math.max(raw.start.getTime(), minStart)), end: raw.end };
    if (window.end.getTime() <= window.start.getTime()) continue; // fully-elapsed window
    const tenderShare = g.methods.total ? g.methods.tender / g.methods.total : 0;
    const confidence = confidenceScore({ cvDays: cadence.cvDays, eventCount: cadence.eventCount, tenderShare });
    if (confidence < DISPLAY_THRESHOLD) continue;

    const top = [...g.leafCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, EVIDENCE_TOP);
    if (!top.length) continue;
    const evidenceItems = top.map(([leaf, count]) => ({ classificationId: leaf, label: g.leafLabels.get(leaf) ?? leaf, count }));
    const amount = top.map(([leaf]) => baselineByLeaf.get(leaf)).find(Boolean);
    const inc = incByGroup.get(`${g.buyerId}|${g.rubroNodeId}`);

    docs.push({
      buyerId: g.buyerId,
      buyerName: g.buyerName,
      rubroNodeId: g.rubroNodeId,
      rubroLabel: g.rubroLabel,
      rubroLevel: g.rubroLevel,
      rubroAncestors: [...g.ancestors],
      evidenceItems,
      cadence,
      lastEventDate,
      expectedWindow: window,
      confidence,
      ...(inc?.name ? { incumbentSupplier: { name: inc.name, ...(inc.id ? { id: inc.id } : {}) } } : {}),
      ...(amount ? { expectedAmount: { currency: amount.currency, p25: amount.p25, p50: amount.p50 } } : {}),
      basis: "recurrence",
      dataVersion,
      generatedAt: new Date(),
    });
  }
  console.log(`[tender-forecast] ${docs.length} groups passed cadence + confidence gates`);

  // ---- Suppress groups that already have a live open_call in-window ----
  // (avoid duplicating the reactive surface). Cheap: pull open buyers+classes once.
  const liveOpen = await OpenCallModel.find({ status: { $in: ["open", "clarification", "amended"] } })
    .select("buyer.id classificationSet")
    .lean();
  const openKeys = new Set<string>();
  for (const c of liveOpen) {
    const bid = (c.buyer as { id?: string } | undefined)?.id;
    if (!bid) continue;
    for (const code of (c.classificationSet ?? [])) openKeys.add(`${bid}|${code}`);
  }
  // If any ancestor/leaf of this group is already live for this buyer, suppress.
  const kept = docs.filter(d => !d.rubroAncestors.some(a => openKeys.has(`${d.buyerId}|${a}`)));

  // Compute-then-swap deletes everything not carrying this run's dataVersion, so an empty
  // result set would silently EMPTY the collection. Zero forecasts is always a bug here
  // (a field-path or regex mismatch), never a legitimate outcome — fail before the sweep
  // and leave the previous generation serving.
  if (!kept.length) {
    throw new Error(
      `[tender-forecast] produced 0 forecasts (${groups.size} groups, ${docs.length} passed gates) — `
      + "refusing to sweep the existing collection; investigate the pipelines before re-running",
    );
  }

  console.log(`[tender-forecast] writing ${kept.length} forecasts (suppressed ${docs.length - kept.length} already-open)…`);
  for (let i = 0; i < kept.length; i += WRITE_CHUNK) {
    const chunk = kept.slice(i, i + WRITE_CHUNK);
    await TenderForecastModel.bulkWrite(chunk.map(doc => ({
      replaceOne: { filter: { buyerId: doc.buyerId, rubroNodeId: doc.rubroNodeId }, replacement: doc, upsert: true },
    })), { ordered: false });
  }
  const swept = await TenderForecastModel.deleteMany({ dataVersion: { $ne: dataVersion } });

  console.log(`[tender-forecast] done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${kept.length} forecasts, ${new Set(kept.map(d => d.buyerId)).size} buyers (swept ${swept.deletedCount} stale).`);
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((err) => { console.error("[tender-forecast] failed:", err); process.exit(1); });
}

export { run };
