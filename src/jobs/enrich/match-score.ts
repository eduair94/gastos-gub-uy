// src/jobs/enrich/match-score.ts
//
// Local, zero-cost prefilter that decides whether a Google Maps candidate is the
// same company as a state supplier, BEFORE spending an LLM call. `findPlaceFromText`
// always returns *something* (querying "Innovaluy SRL" returns Italian firms), so a
// geographic gate plus a fuzzy name score keeps the obvious accepts/rejects off
// the judge and sends only the ambiguous middle band to Gemini. A registered
// address can also validate foreign suppliers, which are legitimate RUPE entries.

// Legal-form tokens carry no identifying signal — "S.A." / "SRL" / "Ltda" appear on
// half the padrón — so they are stripped before scoring to avoid false matches on them.
const LEGAL_TOKENS = new Set([
  "sa", "sas", "srl", "s", "r", "l", "a", "ltda", "ltd", "cia", "compania",
  "sociedad", "anonima", "responsabilidad", "limitada", "hnos", "hermanos", "e", "y",
]);

/** Fold accents, lowercase, drop punctuation, collapse whitespace. */
export function normalizeCompanyName(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Acronyms are often written letter-spaced on the padrón ("A G A M LIMITADA",
// "C I E M S A CONSTRUCCIONES"). Splitting on spaces would drop every single letter
// and lose the whole identifying token, so consecutive single-char words are glued
// back together ("a g a m" → "agam") before filtering.
function mergeAcronymRuns(words: string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) out.push(run.join(""));
    else if (run.length === 1) out.push(run[0]);
    run = [];
  };
  for (const w of words) {
    if (w.length === 1) run.push(w);
    else { flush(); out.push(w); }
  }
  flush();
  return out;
}

/** Content tokens (>2 chars, not a legal form) used for the overlap score. */
export function contentTokens(s: string): string[] {
  const words = normalizeCompanyName(s).split(" ").filter(Boolean);
  return mergeAcronymRuns(words).filter(t => t.length > 2 && !LEGAL_TOKENS.has(t));
}

/**
 * Similarity in [0,1] of a candidate name against the supplier's legal name.
 * Weighted toward recall (did we find the supplier's words?) over precision (does
 * the candidate carry extra words?), because Google names add branch/location noise
 * ("Garino Hnos. S.A." vs "GARINO HNOS S A"; "Uruguay Innova (U+I)").
 */
export function scoreMatch(supplierName: string, candidateName: string): number {
  const q = contentTokens(supplierName);
  const c = new Set(contentTokens(candidateName));
  if (!q.length || !c.size) return 0;
  let hit = 0;
  for (const t of q) if (c.has(t)) hit++;
  const recall = hit / q.length;
  const precision = hit / c.size;
  return recall * 0.7 + precision * 0.3;
}

const ADDRESS_STOP_TOKENS = new Set([
  "calle", "avenida", "avenue", "street", "strasse", "strada", "ruta", "route",
  "camino", "road", "departamento", "department", "codigo", "postal",
]);

/** Stable address fragments used to compare a registered address with Maps. */
export function addressTokens(s: string): string[] {
  return normalizeCompanyName(s)
    .split(" ")
    .filter(t => (/\d/.test(t) || t.length >= 4) && !ADDRESS_STOP_TOKENS.has(t));
}

function addressTokenMatches(reference: string, candidate: string): boolean {
  if (reference === candidate) return true;
  // Handles small language/spelling variants such as Geneva / Genève.
  return reference.length >= 5 && candidate.length >= 5
    && reference.slice(0, 5) === candidate.slice(0, 5);
}

/**
 * Recall-oriented overlap of the registered address against a Maps address.
 * Numbers and distinctive street/city tokens carry the strongest signal.
 */
export function scoreAddressOverlap(referenceAddress: string, candidateAddress: string): number {
  const reference = [...new Set(addressTokens(referenceAddress))];
  const candidate = [...new Set(addressTokens(candidateAddress))];
  if (!reference.length || !candidate.length) return 0;
  const hits = reference.filter(r => candidate.some(c => addressTokenMatches(r, c))).length;
  return hits / reference.length;
}

/** True when Maps explicitly places the candidate in Uruguay. */
export function addressInUruguay(address: string | null | undefined): boolean {
  return /\buruguay\b/i.test(address || "");
}

/** Registered-address overlap that is strong enough to relax the Uruguay gate. */
export const ADDRESS_MATCH_SCORE = 0.35;

/** ≥ HIGH_SCORE → accept without asking the LLM. */
export const HIGH_SCORE = 0.75;
/** ≤ LOW_SCORE → reject without asking the LLM. Between the two → judge. */
export const LOW_SCORE = 0.35;
