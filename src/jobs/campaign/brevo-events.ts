import type { SendStatus } from "../../../shared/models/campaign_send";
import type { SuppressionReason } from "../../../shared/models/email_suppression";

export interface BrevoEvent {
  event: string;
  messageId?: string;
  email?: string;
}

export interface BrevoEventMapping {
  status?: SendStatus;
  suppress?: SuppressionReason;
}

// Pure mapping from a Brevo webhook event name to a campaign_send status
// update and (optionally) a suppression reason. No I/O — the caller applies
// the result to the DB.
export function mapBrevoEvent(ev: BrevoEvent): BrevoEventMapping {
  switch (ev.event) {
    case "delivered":
      return { status: "delivered" };
    case "opened":
    case "unique_opened":
      return { status: "opened" };
    case "click":
      return { status: "clicked" };
    case "soft_bounce":
      return { status: "bounced" };
    case "hard_bounce":
      return { status: "bounced", suppress: "bounce" };
    case "spam":
    case "complaint":
      return { status: "complained", suppress: "complaint" };
    case "unsubscribed":
      return { status: "unsubscribed", suppress: "unsubscribe" };
    default:
      return {};
  }
}
