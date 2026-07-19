// src/jobs/enrich/resolvers/dei.ts
import type { Db } from "mongodb";
import type { ContactResolver, ResolverInput, ResolverResult } from "../types";

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
      const row = await db.collection("dei_companies")
        .findOne({ rut: input.rut }, { projection: { email: 1, sitioWeb: 1, telefono: 1 } });
      if (!row) return { emails: [] };
      const emails = row.email ? [{ email: String(row.email), source: "dei" as const, confidence: 0.9 }] : [];
      return {
        emails,
        website: normalizeSiteUrl(row.sitioWeb),
        phone: row.telefono ? String(row.telefono) : null,
      };
    },
  };
}
