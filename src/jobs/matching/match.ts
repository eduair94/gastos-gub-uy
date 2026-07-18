/**
 * Pure watch↔call matcher. No DB, no I/O — exhaustively unit testable.
 *
 * A call matches a watch when a TRIGGER fires AND all REFINEMENTS pass:
 *   triggers (OR)     : category intersection, or keyword hit (any/all)
 *   refinements (AND) : buyer, value range, procurement method
 * A watch with no category/keyword triggers but a buyer/method filter is treated
 * as buyer-/method-triggered (matches every call satisfying that refinement).
 */
import { phraseMatches } from "../../../shared/utils/text";

export interface WatchInput {
  categories: string[];
  keywords: string[];
  keywordMode: "any" | "all";
  buyers: string[];
  minValue?: number | undefined;
  maxValue?: number | undefined;
  procurementMethods?: string[] | undefined;
}

export interface OpenCallMatchView {
  classificationSet: string[];
  /** Already normalized (shared/utils/text.normalizeText). */
  searchText: string;
  buyerId?: string | undefined;
  estimatedValue?: number | undefined;
  procurementMethodDetails?: string | undefined;
}

export interface MatchReason {
  categories: string[];
  keywords: string[];
}

export function watchMatchesCall(watch: WatchInput, call: OpenCallMatchView): MatchReason | null {
  // --- Refinements (cheap rejects) ---
  if (watch.buyers?.length) {
    if (!call.buyerId || !watch.buyers.includes(call.buyerId)) return null;
  }
  if (watch.procurementMethods?.length) {
    if (!call.procurementMethodDetails || !watch.procurementMethods.includes(call.procurementMethodDetails)) {
      return null;
    }
  }
  // Value range only excludes a call that HAS a value outside the range. A call
  // with no published estimate is never excluded (deadlines matter more).
  if (typeof call.estimatedValue === "number") {
    if (typeof watch.minValue === "number" && call.estimatedValue < watch.minValue) return null;
    if (typeof watch.maxValue === "number" && call.estimatedValue > watch.maxValue) return null;
  }

  const categories = watch.categories ?? [];
  const keywords = watch.keywords ?? [];
  const hasTriggers = categories.length > 0 || keywords.length > 0;

  // --- No category/keyword triggers: buyer-/method-only watch ---
  if (!hasTriggers) {
    if ((watch.buyers?.length ?? 0) > 0 || (watch.procurementMethods?.length ?? 0) > 0) {
      return { categories: [], keywords: [] };
    }
    return null; // an empty watch matches nothing
  }

  // --- Triggers (OR) ---
  const matchedCategories = categories.filter(c => call.classificationSet.includes(c));

  let matchedKeywords: string[] = [];
  if (keywords.length) {
    const hits = keywords.filter(k => phraseMatches(call.searchText, k));
    matchedKeywords = watch.keywordMode === "all"
      ? (hits.length === keywords.length ? hits : [])
      : hits;
  }

  if (matchedCategories.length === 0 && matchedKeywords.length === 0) return null;
  return { categories: matchedCategories, keywords: matchedKeywords };
}
