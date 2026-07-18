import type { IVariantAttr } from "../../../shared/models/product_variants";

// Pure aggregation of scraped item características into a per-code variant
// distribution. Kept side-effect-free so it can be unit-tested without a DB and
// reused client-side (the product page mirrors these axes for its lazy panel).

export interface MatchedItem {
  features: { name: string; value: string }[];
  variation?: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// The características we roll up, in display order. `match` lists normalized
// substrings that identify the gov page's row label; `key` axes drive `varies`.
const AXES: { label: string; match: string[]; key?: boolean }[] = [
  { label: "Marca", match: ["marca"], key: true },
  { label: "Nombre comercial/modelo", match: ["nombre comercial", "modelo"], key: true },
  { label: "Presentación", match: ["presentacion"], key: true },
  { label: "Concentración", match: ["concentracion"] },
  { label: "Medida presentación", match: ["medida"] },
  { label: "Variación", match: ["__variation__"] },
];

export function rollupVariants(matched: MatchedItem[]): {
  attributes: IVariantAttr[];
  varies: boolean;
  sampledContracts: number;
} {
  const counts = new Map<string, Map<string, number>>(); // axis label -> value -> count
  for (const ax of AXES) counts.set(ax.label, new Map());

  for (const m of matched) {
    for (const ax of AXES) {
      let value: string | undefined;
      if (ax.match[0] === "__variation__") {
        value = m.variation;
      } else {
        const hit = m.features.find(f => ax.match.some(w => norm(f.name).includes(w)));
        value = hit?.value;
      }
      if (!value) continue;
      const bucket = counts.get(ax.label)!;
      bucket.set(value, (bucket.get(value) ?? 0) + 1);
    }
  }

  const attributes: IVariantAttr[] = [];
  let varies = false;
  for (const ax of AXES) {
    const bucket = counts.get(ax.label)!;
    if (!bucket.size) continue;
    const values = [...bucket.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
    attributes.push({ name: ax.label, values, distinct: values.length });
    if (ax.key && values.length > 1) varies = true;
  }
  return { attributes, varies, sampledContracts: matched.length };
}
