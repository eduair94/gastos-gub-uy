import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Who else bid — recovered from the acta de adjudicación, one document per CALL (`ocid`).
 *
 * Bidders are a property of the call, not of the award, which is why this is keyed on ocid rather
 * than on a release id.
 *
 * EVERY PROBED CALL GETS A DOCUMENT, including the ones where the acta says nothing (`found:false`).
 * That is what makes the job resumable without re-fetching, and — more importantly — what lets the
 * UI distinguish "the acta did not say" from "not looked at yet". Those two must never render the
 * same, because at roughly 6-8% enumeration coverage the silent case is the overwhelming majority.
 *
 * Written by src/jobs/extract-acta-bidders.ts. See shared/acta-bidders.ts for why this is published
 * as a per-contract fact and never aggregated into an organism-level "single bidding" indicator.
 */
export interface IActaBidders {
  ocid: string;
  compraId: string;
  actaUrl: string;
  /** When the acta was last fetched and parsed. Present even when nothing was found. */
  probedAt: Date;
  /** Did the acta enumerate the offers, or state there was exactly one? */
  found: boolean;
  /** Offers the acta accounts for. Null when it said nothing. */
  count: number | null;
  /** Names as written in the acta. Empty on an explicit sole-bidder statement that named nobody. */
  bidders: string[];
  /** Which phrasing matched, for provenance. */
  marker: string | null;
  /** The sentence the names came from, so a reader can check it against the PDF. */
  excerpt: string | null;
  /** Characters of text recovered from the PDF. 0 means the acta had no text layer. */
  textChars: number;
}

const ActaBiddersSchema = new Schema<IActaBidders>(
  {
    ocid: { type: String, required: true },
    compraId: { type: String, required: true },
    actaUrl: { type: String, required: true },
    probedAt: { type: Date, required: true },
    found: { type: Boolean, required: true, default: false },
    count: { type: Number, default: null },
    bidders: { type: [String], default: [] },
    marker: { type: String, default: null },
    excerpt: { type: String, default: null },
    textChars: { type: Number, default: 0 },
  },
  { collection: "acta_bidders" }
);

// Built by scripts/ensure-indexes.ts only — autoIndex is off.
ActaBiddersSchema.index({ ocid: 1 }, { unique: true });
ActaBiddersSchema.index({ found: 1, probedAt: -1 });

export const ActaBiddersModel =
  mongoose.models.ActaBidders || mongoose.model<IActaBidders>("ActaBidders", ActaBiddersSchema);
