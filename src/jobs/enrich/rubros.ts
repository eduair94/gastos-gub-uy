// src/jobs/enrich/rubros.ts
import type { Db } from "mongodb";
import type { IRubro } from "../../../shared/models/supplier_contacts";

/**
 * Top SICE rubros for a supplier, by award-item count. Leads with the indexed
 * `awards.suppliers.id`; unwinds awards→items; a $facet computes, from the
 * same unwound item stream, both the top-N groups (by classification.id ==
 * sice_catalog.code) AND the grand total item count across ALL rubros — so
 * `share` in deriveRubros is a true fraction of the supplier's universe, not
 * just of the top-N returned. Labels are joined in deriveRubros.
 */
export function buildRubroPipeline(supplierId: string, topN = 5): object[] {
  return [
    { $match: { "awards.suppliers.id": supplierId } },
    { $unwind: "$awards" },
    { $match: { "awards.suppliers.id": supplierId } },
    { $unwind: "$awards.items" },
    { $match: { "awards.items.classification.id": { $ne: null } } },
    { $facet: {
      top: [
        { $group: {
          _id: "$awards.items.classification.id",
          itemCount: { $sum: 1 },
          anyDesc: { $first: "$awards.items.classification.description" },
        } },
        { $sort: { itemCount: -1 } },
        { $limit: topN },
      ],
      grand: [
        { $count: "n" },
      ],
    } },
  ];
}

export async function deriveRubros(db: Db, supplierId: string, topN = 5): Promise<IRubro[]> {
  const [facetResult] = await db.collection("releases")
    .aggregate<{
      top: { _id: string; itemCount: number; anyDesc: string }[];
      grand: { n: number }[];
    }>(buildRubroPipeline(supplierId, topN), { allowDiskUse: true }).toArray();

  const rows = facetResult?.top ?? [];
  if (!rows.length) return [];

  // Denominator is the supplier's total unwound award items across ALL
  // rubros (not just the top-N above), so `share` reflects true concentration.
  const total = facetResult?.grand?.[0]?.n || 1;
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
