/**
 * Canonical unit-of-measure folding for the overpricing detector.
 *
 * Award item `unit.name` is free text, so the SAME unit fragments the price
 * baseline across spelling/case variants — `Unidad` / `UNIDAD` / `u` / `un` /
 * `unid` all denote one unit but split into separate, thinner baselines, which
 * weakens the like-for-like comparison. Folding them to one canonical string
 * makes each `{classificationId, currency, unit}` baseline fuller and the outlier
 * test sharper — WITHOUT merging genuinely different units (a box price and a
 * per-unit price must stay apart), so only the ambiguous "unidad" family is
 * collapsed, plus case/whitespace.
 *
 * The Mongo `$group` builds baselines server-side (streaming, memory-bounded), so
 * the same folding must exist as an MQL expression (`canonicalUnitExpr`) AND as a
 * JS function (`canonicalUnit`, used in the scoring path). They are kept
 * deliberately identical — lowercase, trim whitespace, then map the unidad set —
 * so a baseline key and its scoring lookup key always agree.
 */

// Lowercased, whitespace-trimmed spellings that all mean "one unit".
export const UNIDAD_ALIASES = [
  "u", "un", "uni", "unid", "unids", "und", "uds", "unidad", "unidades", "u.", "c/u", "c/u.",
];

const UNIDAD_SET = new Set(UNIDAD_ALIASES);

/** JS folding — used by the scorer's row normalization. Identical to canonicalUnitExpr. */
export function canonicalUnit(raw: string | null | undefined): string {
  const s = (raw ?? "unit").toLowerCase().trim();
  return UNIDAD_SET.has(s) ? "unidad" : s;
}

/**
 * MQL mirror of canonicalUnit for a field reference (e.g. "$awards.items.unit.name").
 * Lowercase → $trim (whitespace) → map the unidad set. `$trim` with no `chars`
 * trims whitespace, matching JS `String.prototype.trim`.
 */
export function canonicalUnitExpr(fieldRef: string): Record<string, unknown> {
  return {
    $let: {
      vars: { s: { $trim: { input: { $toLower: { $ifNull: [fieldRef, "unit"] } } } } },
      in: { $cond: [{ $in: ["$$s", UNIDAD_ALIASES] }, "unidad", "$$s"] },
    },
  };
}
