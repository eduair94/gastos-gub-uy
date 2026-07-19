import { CampaignSendModel } from "../../../shared/models/campaign_send";
import { suppress as suppressReal } from "./suppression";

// The minimal shape resolveUnsubscribe needs from a campaign_sends document.
export interface UnsubscribeSend {
  email: string;
  campaignId: string;
}

export interface UnsubscribeDeps {
  findSend: (token: string) => Promise<UnsubscribeSend | null>;
  markUnsub: (token: string) => Promise<void>;
  suppress: (email: string, reason: "unsubscribe", source: string) => Promise<void>;
}

const defaultDeps: UnsubscribeDeps = {
  findSend: async (token) => {
    const send = await CampaignSendModel.findOne({ token }).lean();
    return send ? { email: send.email, campaignId: send.campaignId } : null;
  },
  markUnsub: async (token) => {
    await CampaignSendModel.updateOne({ token }, { $set: { status: "unsubscribed" } });
  },
  suppress: suppressReal,
};

// Non-user unsubscribe: resolves a campaign_sends token, marks the send
// unsubscribed, and suppresses the email for future campaign sends.
// Idempotent — calling twice with the same token is harmless (markUnsub and
// suppress are both no-op-safe on repeat, and the second findSend still hits).
// Unknown token -> null (no side effects).
export async function resolveUnsubscribe(
  token: string,
  deps: UnsubscribeDeps = defaultDeps
): Promise<{ email: string } | null> {
  const send = await deps.findSend(token);
  if (!send) return null;
  await deps.markUnsub(token);
  await deps.suppress(send.email, "unsubscribe", "campaign:" + send.campaignId);
  return { email: send.email };
}
