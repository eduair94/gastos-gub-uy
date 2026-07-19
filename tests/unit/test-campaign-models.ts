import assert from "node:assert";
import { EmailSuppressionModel } from "../../shared/models/email_suppression";
import { EmailCampaignModel } from "../../shared/models/email_campaign";
import { CampaignSendModel } from "../../shared/models/campaign_send";

const sup = new EmailSuppressionModel({ email: "a@b.uy", reason: "unsubscribe", source: "campaign:promo1" });
assert.equal(sup.validateSync(), undefined);
assert.equal(sup.collection.name, "email_suppressions");

const camp = new EmailCampaignModel({ key: "promo1", name: "Promo llamados", subjectTemplate: "{{n}} licitaciones en {{rubro}}" });
assert.equal(camp.validateSync(), undefined);
assert.equal(camp.status, "draft");

const send = new CampaignSendModel({ campaignId: "promo1", supplierId: "R/1", email: "a@b.uy", rubroKey: "28267", token: "tok123" });
assert.equal(send.validateSync(), undefined);
assert.equal(send.status, "queued");
console.log("ok: campaign models");
