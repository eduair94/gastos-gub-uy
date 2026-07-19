import type { Db } from "mongodb";
import { SupplierContactModel } from "../../../shared/models/supplier_contacts";
import { UserModel } from "../../../shared/models/user";
import { isSuppressed } from "./suppression";

export interface RecipientRubro {
  classificationId: string;
  label: string;
  share: number;
}

export interface Recipient {
  supplierId: string;
  name: string;
  email: string;
  rubroCode: string;
  rubroLabel: string;
}

export interface BuildRecipientsOptions {
  rubro?: string;
}

// PURE: picks the highest-share rubro for a contact. Null when the contact
// has no rubros (nothing to segment the outreach copy by).
export function pickRecipientRubro(rubros: RecipientRubro[]): { code: string; label: string } | null {
  if (rubros.length === 0) return null;
  const top = rubros.reduce((best, r) => (r.share > best.share ? r : best));
  return { code: top.classificationId, label: top.label };
}

// Streams supplier_contacts (highest priorityScore first) into campaign
// recipients: emailable, not suppressed, not already a registered user, and
// with a top rubro to personalize the send.
export async function* buildRecipients(_db: Db, opts?: BuildRecipientsOptions): AsyncGenerator<Recipient> {
  const query = {
    primaryEmail: { $ne: null },
    ...(opts?.rubro ? { "rubros.classificationId": opts.rubro } : {}),
  };
  const cursor = SupplierContactModel.find(query).sort({ priorityScore: -1 }).lean().cursor();
  for await (const contact of cursor) {
    const email = contact.primaryEmail;
    if (!email) continue;
    if (await isSuppressed(email)) continue;
    if (await UserModel.exists({ email })) continue;
    const picked = pickRecipientRubro(contact.rubros);
    if (!picked) continue;
    yield {
      supplierId: contact.supplierId,
      name: contact.name,
      email,
      rubroCode: picked.code,
      rubroLabel: picked.label,
    };
  }
}
