// src/jobs/enrich/resolvers/rupe.ts
//
// Fills address / locality / lat-lng from the RUPE registry (rupe_registry,
// loaded by load-rupe.ts + geocode-rupe.ts). RUPE is official open data, so the
// place block is freely displayable (source:"rupe"), like DEI and unlike the
// ToS-restricted Google Places source.
//
// Match: RUT-first (digits-exact, false-positive-free, 91.7% of suppliers), then
// a normalized-name fallback that accepts ONLY when the name resolves to exactly
// one registry row — an ambiguous name is dropped rather than risk a wrong pin.
//
// Emits NO emails/website/phone — the open dataset carries none. Its value is the
// location block.
import type { Db } from "mongodb";
import type { ContactResolver, ResolverInput, ResolverResult, PlaceInfo } from "../types";
import { normalizeText } from "../../../../shared/utils/text";

interface RupeDoc {
  domicilioFiscal?: string | null;
  localidad?: string | null;
  departamento?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
}

const PROJECTION = { domicilioFiscal: 1, localidad: 1, departamento: 1, lat: 1, lng: 1, placeId: 1 } as const;

export function createRupeResolver(db: Db): ContactResolver {
  return {
    name: "rupe",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      const coll = db.collection("rupe_registry");

      // 1. RUT-exact.
      let row: RupeDoc | null = null;
      if (input.rut && input.rut.length >= 8) {
        row = (await coll.findOne({ rut: input.rut }, { projection: PROJECTION })) as RupeDoc | null;
      }

      // 2. Normalized-name fallback — accept only a unique match.
      if (!row) {
        const key = normalizeText(input.name);
        if (key.length >= 4) {
          const hits = (await coll.find({ normalizedName: key }, { projection: PROJECTION }).limit(2).toArray()) as RupeDoc[];
          if (hits.length === 1) row = hits[0];
        }
      }
      if (!row) return { emails: [] };

      const locality = [row.localidad, row.departamento]
        .map((v) => (v ? String(v).trim() : "")).filter(Boolean).join(", ") || null;
      const lat = typeof row.lat === "number" ? row.lat : null;
      const lng = typeof row.lng === "number" ? row.lng : null;
      const hasPlace = row.domicilioFiscal || locality || lat !== null;
      if (!hasPlace) return { emails: [] };

      const place: PlaceInfo = {
        address: row.domicilioFiscal ? String(row.domicilioFiscal) : null,
        locality,
        lat,
        lng,
        placeId: row.placeId ? String(row.placeId) : null,
        source: "rupe",
      };
      return { emails: [], place };
    },
  };
}
