// src/jobs/enrich/resolvers/google-maps.ts
//
// Fills address / lat-lng / phone / website / hours from the Google Maps proxy.
// Query registered address/locality first, then progressively broader fallbacks.
// Candidates still pass a name + geographic identity gate before their details
// are trusted. Official address overlap allows legitimate foreign RUPE suppliers.
// Emits NO emails (Places has none) — its value is the location block + phone/website.
import type { ContactResolver, ResolverInput, ResolverResult, PlaceInfo } from "../types";
import type { FindPlaceOptions, PlaceCandidate, PlaceDetails } from "../backends";
import type { JudgeFn, MatchPair } from "../match-judge";
import {
  scoreMatch,
  scoreAddressOverlap,
  addressInUruguay,
  ADDRESS_MATCH_SCORE,
  HIGH_SCORE,
  LOW_SCORE,
  normalizeCompanyName,
} from "../match-score";

export interface GoogleMapsDeps {
  findPlace: (query: string, options?: FindPlaceOptions) => Promise<PlaceCandidate[]>;
  placeDetails: (placeId: string) => Promise<PlaceDetails | null>;
  judge: JudgeFn;
  /** Max uncertain candidates sent to the judge per supplier. */
  maxJudge?: number;
}

function cleanPart(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Exact-location query first, then locality and country/name fallbacks. */
export function googleMapsQueries(input: ResolverInput): string[] {
  const name = cleanPart(input.name);
  if (!name) return [];

  const address = cleanPart(input.knownAddress).slice(0, 220);
  const locality = cleanPart(input.knownLocality).slice(0, 100);
  const addressHasLocality = locality
    ? normalizeCompanyName(address).includes(normalizeCompanyName(locality))
    : false;
  const location = [address, addressHasLocality ? "" : locality].filter(Boolean).join(", ");
  const queries = [
    location ? `${name} ${location}` : "",
    locality && !addressHasLocality ? `${name} ${locality}` : "",
    input.supplierId.startsWith("X/") ? name : `${name} Uruguay`,
  ];

  const seen = new Set<string>();
  return queries
    .map(cleanPart)
    .filter(query => {
      if (!query) return false;
      const key = normalizeCompanyName(query);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function createGoogleMapsResolver(deps: GoogleMapsDeps): ContactResolver {
  const maxJudge = deps.maxJudge ?? 3;
  return {
    name: "googleMaps",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      if (!input.name.trim()) return { emails: [] };

      const knownLocation = [cleanPart(input.knownAddress), cleanPart(input.knownLocality)]
        .filter(Boolean)
        .join(", ");
      const globalSearch = input.supplierId.startsWith("X/") && !addressInUruguay(knownLocation);
      const seenPlaceIds = new Set<string>();

      for (const query of googleMapsQueries(input)) {
        const candidates = await deps.findPlace(
          query,
          globalSearch ? { locationBias: null } : undefined,
        ).catch(() => []);
        const scored = candidates
          .filter(c => {
            if (!c.placeId || seenPlaceIds.has(c.placeId)) return false;
            seenPlaceIds.add(c.placeId);
            return true;
          })
          .map(c => ({
            c,
            nameScore: scoreMatch(input.name, c.name),
            addressScore: knownLocation
              ? scoreAddressOverlap(knownLocation, c.address ?? "")
              : 0,
          }))
          .filter(x => addressInUruguay(x.c.address) || x.addressScore >= ADDRESS_MATCH_SCORE)
          .sort((a, b) =>
            (b.nameScore + b.addressScore * 0.25) - (a.nameScore + a.addressScore * 0.25));

        if (!scored.length) continue;

        const accepted: PlaceCandidate[] = scored
          .filter(x => x.nameScore >= HIGH_SCORE
            && (!knownLocation || x.addressScore >= ADDRESS_MATCH_SCORE))
          .map(x => x.c);
        const acceptedIds = new Set(accepted.map(c => c.placeId));

        // A known address prevents a same-name but wrong-location candidate from
        // being auto-accepted. The judge gets both addresses for the final call.
        const uncertain = scored
          .filter(x => !acceptedIds.has(x.c.placeId)
            && (x.nameScore > LOW_SCORE || x.addressScore >= ADDRESS_MATCH_SCORE))
          .slice(0, maxJudge);
        if (uncertain.length) {
          const pairs: MatchPair[] = uncertain.map((x, i) => ({
            i,
            name: input.name,
            candidate: x.c.name,
            expectedAddress: knownLocation,
            address: x.c.address,
          }));
          const verdicts = await deps.judge(pairs).catch(() => new Map());
          for (let i = 0; i < uncertain.length; i++) {
            if (verdicts.get(i)?.match) accepted.push(uncertain[i].c);
          }
        }

        for (const candidate of accepted) {
          const d = await deps.placeDetails(candidate.placeId).catch(() => null);
          if (!d) continue;

          const place: PlaceInfo = {
            address: d.address ?? candidate.address ?? null,
            locality: null,
            lat: d.lat ?? null,
            lng: d.lng ?? null,
            hours: d.hours ?? null,
            mapsUrl: d.mapsUrl ?? null,
            placeId: candidate.placeId,
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
        }
      }
      return { emails: [] };
    },
  };
}
