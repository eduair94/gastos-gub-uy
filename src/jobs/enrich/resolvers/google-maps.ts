// src/jobs/enrich/resolvers/google-maps.ts
//
// Fills address / lat-lng / phone / website / hours from the Google Maps proxy.
// Two-stage match gate so we never trust `findPlaceFromText` blindly (it always
// returns candidates — "Innovaluy SRL" → Italian firms):
//   1. hard filter: candidate address must be in Uruguay
//   2. fuzzy score: ≥HIGH accept, ≤LOW reject, and ONLY the uncertain band goes to
//      the Gemini judge (batched, cheap). See match-score.ts / match-judge.ts.
// Emits NO emails (Places has none) — its value is the location block + phone/website.
import type { ContactResolver, ResolverInput, ResolverResult, PlaceInfo } from "../types";
import type { PlaceCandidate, PlaceDetails } from "../backends";
import type { JudgeFn, MatchPair } from "../match-judge";
import { scoreMatch, addressInUruguay, HIGH_SCORE, LOW_SCORE } from "../match-score";

export interface GoogleMapsDeps {
  findPlace: (query: string) => Promise<PlaceCandidate[]>;
  placeDetails: (placeId: string) => Promise<PlaceDetails | null>;
  judge: JudgeFn;
  /** Max uncertain candidates sent to the judge per supplier. */
  maxJudge?: number;
}

export function createGoogleMapsResolver(deps: GoogleMapsDeps): ContactResolver {
  const maxJudge = deps.maxJudge ?? 3;
  return {
    name: "googleMaps",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      if (!input.name.trim()) return { emails: [] };

      const cands = await deps.findPlace(`${input.name} Uruguay`).catch(() => []);
      const uy = cands.filter(c => addressInUruguay(c.address));
      if (!uy.length) return { emails: [] };

      // Highest fuzzy score first.
      const scored = uy
        .map(c => ({ c, s: scoreMatch(input.name, c.name) }))
        .sort((a, b) => b.s - a.s);

      let accepted: PlaceCandidate | null = null;
      const high = scored.find(x => x.s >= HIGH_SCORE);
      if (high) {
        accepted = high.c;
      } else {
        // Only the ambiguous middle band costs an LLM call.
        const uncertain = scored.filter(x => x.s > LOW_SCORE && x.s < HIGH_SCORE).slice(0, maxJudge);
        if (uncertain.length) {
          const pairs: MatchPair[] = uncertain.map((x, i) => ({ i, name: input.name, candidate: x.c.name, address: x.c.address }));
          const verdicts = await deps.judge(pairs).catch(() => new Map());
          // Accept the highest-scored candidate the judge confirms.
          for (let i = 0; i < uncertain.length; i++) {
            if (verdicts.get(i)?.match) { accepted = uncertain[i].c; break; }
          }
        }
      }
      if (!accepted) return { emails: [] };

      const d = await deps.placeDetails(accepted.placeId).catch(() => null);
      if (!d) return { emails: [] };

      const place: PlaceInfo = {
        address: d.address ?? accepted.address ?? null,
        locality: null,
        lat: d.lat ?? null,
        lng: d.lng ?? null,
        hours: d.hours ?? null,
        mapsUrl: d.mapsUrl ?? null,
        placeId: accepted.placeId,
        source: "googleMaps",
      };
      return {
        emails: [],
        website: d.website ?? null,
        websiteSource: d.website ? "googleMaps" : null,
        phone: d.phone ?? null,
        phoneSource: d.phone ? "googleMaps" : null,
        phones: d.phone ? [{
          phone: d.phone,
          source: "googleMaps",
          confidence: 0.7,
          sourceUrl: d.mapsUrl ?? null,
        }] : [],
        place,
      };
    },
  };
}
