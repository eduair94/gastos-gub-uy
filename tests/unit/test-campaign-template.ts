// tests/unit/test-campaign-template.ts
import assert from "node:assert";
import { renderCampaignEmail, campaignHeaders } from "../../src/emails/campaign-templates";
const r = renderCampaignEmail({
  supplierName: "ACME SA", rubroLabel: "Alcohol rectificado", rubroCode: "28267", openCount: 3,
  unsubscribeUrl: "https://g/u?token=t", ctaUrl: "https://g/registro?rubro=28267",
  senderIdentity: "gastos-gub · Montevideo, UY",
});
assert.ok(r.subject.includes("3") && /alcohol/i.test(r.subject));
assert.ok(r.html.includes("ACME SA") && r.html.includes("https://g/registro?rubro=28267"));
assert.ok(r.html.includes("https://g/u?token=t") && r.html.includes("gastos-gub · Montevideo, UY"));
assert.ok(r.text.includes("ACME SA") && r.text.includes("https://g/u?token=t"));
const h = campaignHeaders("https://g/u?token=t", "mailto:baja@info.gastos-gub.uy");
assert.ok(h["List-Unsubscribe"].includes("https://g/u?token=t"));
assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
console.log("ok: campaign template");
