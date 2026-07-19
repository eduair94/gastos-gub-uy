// src/jobs/enrich/rubros.ts
import type { Db } from "mongodb";
import type { IRubro } from "../../../shared/models/supplier_contacts";

/**
 * Top SICE rubros for a supplier, by award-item count. Leads with the indexed
 * `awards.suppliers.id`; unwinds awards→items; a $group counts items per
 * classification.id (== sice_catalog.code). Labels are joined in deriveRubros.
 */
export function buildRubroPipeline(supplierId: string, topN = 5): object[] {
  return [
    { $match: { "awards.suppliers.id": supplierId } },
    { $unwind: "$awards" },
    { $match: { "awards.suppliers.id": supplierId } },
    { $unwind: "$awards.items" },
    { $group: {
      _id: "$awards.items.classification.id",
      itemCount: { $sum: 1 },
      anyDesc: { $first: "$awards.items.classification.description" },
    } },
    { $match: { _id: { $ne: null } } },
    { $sort: { itemCount: -1 } },
    { $limit: topN },
  ];
}

export async function deriveRubros(db: Db, supplierId: string, topN = 5): Promise<IRubro[]> {
  const rows = await db.collection("releases")
    .aggregate<{ _id: string; itemCount: number; anyDesc: string }>(
      buildRubroPipeline(supplierId, topN),
      { allowDiskUse: true },
    ).toArray();
  if (!rows.length) return [];

  const total = rows.reduce((s, r) => s + r.itemCount, 0) || 1;
  const codes = rows.map(r => r._id).filter(Boolean);
  const cat = await db.collection("sice_catalog")
    .find({ code: { $in: codes } }, { projection: { code: 1, canonicalName: 1 } })
    .toArray();
  const label = new Map(cat.map((c: any) => [c.code, c.canonicalName as string]));

  return rows.map(r => ({
    classificationId: r._id,
    label: label.get(r._id) || r.anyDesc || r._id,
    itemCount: r.itemCount,
    share: r.itemCount / total,
  }));
}
