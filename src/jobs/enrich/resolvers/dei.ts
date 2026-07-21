// src/jobs/enrich/resolvers/dei.ts
import type { Db } from "mongodb";
import type { ContactResolver, ResolverInput, ResolverResult, PlaceInfo } from "../types";

// row.sitioWeb frequently has no http(s):// scheme, which makes `new URL(...)`
// in the website resolver throw and silently drop the domain.
function normalizeSiteUrl(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** DEI is official open data → highest confidence, and it's already in Mongo. */
export function createDeiResolver(db: Db): ContactResolver {
  return {
    name: "dei",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      if (!input.rut || input.rut.length < 8) return { emails: [] };
      const row = await db.collection("dei_companies").findOne(
        { rut: input.rut },
        { projection: { email: 1, sitioWeb: 1, telefono: 1, direccion: 1, lat: 1, lng: 1, departamento: 1, localidad: 1 } },
      );
      if (!row) return { emails: [] };
      const emails = row.email ? [{ email: String(row.email), source: "dei" as const, confidence: 0.9 }] : [];

      // Address/geo already sit in this same Mongo doc — carry them over instead of
      // discarding them. DEI is official open data, so the block is freely displayable.
      const locality = [row.localidad, row.departamento].map(v => (v ? String(v).trim() : "")).filter(Boolean).join(", ") || null;
      const hasPlace = row.direccion || locality || typeof row.lat === "number";
      const place: PlaceInfo | null = hasPlace
        ? {
            address: row.direccion ? String(row.direccion) : null,
            locality,
            lat: typeof row.lat === "number" ? row.lat : null,
            lng: typeof row.lng === "number" ? row.lng : null,
            source: "dei",
          }
        : null;

      const deiSite = normalizeSiteUrl(row.sitioWeb);
      return {
        emails,
        website: deiSite,
        websiteSource: deiSite ? "dei" : null,
        phone: row.telefono ? String(row.telefono) : null,
        phoneSource: row.telefono ? "dei" : null,
        place,
      };
    },
  };
}
