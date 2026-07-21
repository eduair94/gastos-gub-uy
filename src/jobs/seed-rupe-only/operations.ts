import type { ISupplierContact } from "../../../shared/models/supplier_contacts";
import type { RegistryRowSet } from "./build-row";

type RegistryInsertDefaults = Pick<
  ISupplierContact,
  "status" | "priorityScore" | "emails" | "primaryEmail" | "website"
  | "websiteSource" | "phone" | "phoneSource" | "hours" | "mapsUrl"
  | "rubros" | "enrichedAt"
>;

export interface RegistryUpsertOperation {
  updateOne: {
    filter: { supplierId: string };
    update: {
      $set: RegistryRowSet;
      $setOnInsert: RegistryInsertDefaults;
    };
    upsert: true;
  };
}

export interface AwardedReconciliationOperation {
  filter: { neverAwarded: true; rut: { $in: string[] } };
  update: { $set: { neverAwarded: false } };
}

export function normalizeRupeRut(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Returns the normalized RUT only when the RUPE row belongs in the anti-join. */
export function seedableRupeRut(value: unknown, awardedRuts: ReadonlySet<string>): string | null {
  const rut = normalizeRupeRut(value);
  return rut && !awardedRuts.has(rut) ? rut : null;
}

export function buildRegistryUpsert(row: RegistryRowSet): RegistryUpsertOperation {
  return {
    updateOne: {
      filter: { supplierId: row.supplierId },
      update: {
        $set: row,
        $setOnInsert: {
          status: "registry",
          priorityScore: 0,
          emails: [],
          primaryEmail: null,
          website: null,
          websiteSource: null,
          phone: null,
          phoneSource: null,
          hours: null,
          mapsUrl: null,
          rubros: [],
          enrichedAt: null,
        },
      },
      upsert: true,
    },
  };
}

export function buildAwardedReconciliation(ruts: string[]): AwardedReconciliationOperation {
  return {
    filter: { neverAwarded: true, rut: { $in: ruts } },
    update: { $set: { neverAwarded: false } },
  };
}
