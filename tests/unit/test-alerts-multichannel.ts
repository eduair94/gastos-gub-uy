/**
 * Pure-logic assertions for the multi-channel alert stack (no DB).
 *   npx tsx tests/unit/test-alerts-multichannel.ts
 */
import assert from "node:assert";
import {
  buildAlertCard,
  cardMetaLine,
  formatMoney,
  renderPushPayload,
  renderTelegramHtml,
} from "../../shared/alerts/build-alert-content";
import { resolveChannels, DEFAULT_CHANNELS } from "../../shared/alerts/channels";
import { createLinkToken, verifyLinkToken } from "../../shared/alerts/link-token";

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.ok(cond, name);
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("formatMoney");
ok("UYU formats with $ + es-UY grouping", formatMoney(1234567, "UYU").formatted === "$ 1.234.567");
ok("USD formats with US$", formatMoney(12345, "USD").formatted === "US$ 12.345");
ok("null value → null formatted", formatMoney(null, "UYU").formatted === null);
ok("default currency is UYU", formatMoney(100, undefined).currency === "UYU");

console.log("buildAlertCard");
const now = new Date("2026-07-19T12:00:00Z");
const call = {
  compraId: "12345",
  title: "Adquisición de tóner para impresoras",
  buyer: { id: "1-2", name: "Ministerio de Salud Pública" },
  procurementMethodDetails: "Licitación Abreviada",
  tenderPeriod: { endDate: new Date("2026-07-25T12:00:00Z") },
  estimatedValue: 850000,
  currency: "UYU",
  documents: [{ url: "https://x/pliego.pdf", documentType: "biddingDocuments", title: "Pliego" }],
  items: [
    { classificationLabel: "Tóner", classificationId: "44103103" },
    { classificationLabel: "Tóner", classificationId: "44103103" },
    { classificationLabel: "Cartuchos", classificationId: "44103105" },
  ],
  classificationSet: ["44103103", "44103105"],
  aiSummary: { objeto: "Compra de insumos de impresión para hospitales." },
} as unknown as Parameters<typeof buildAlertCard>[0];

const card = buildAlertCard(call, { appBaseUrl: "https://gastos.gub.uy/", matchedOn: { keywords: ["toner"], categories: ["44103103"] }, now });
ok("objeto = title", card.objeto === "Adquisición de tóner para impresoras");
ok("organismo = buyer name", card.organismo === "Ministerio de Salud Pública");
ok("presupuesto formatted", card.presupuesto.formatted === "$ 850.000");
ok("closesInDays = 6", card.deadline.closesInDays === 6);
ok("rubros deduped", card.rubros.length === 2 && card.rubros[0] === "Tóner");
ok("pliegoUrl picked", card.pliegoUrl === "https://x/pliego.pdf");
ok("aiObjeto carried", card.aiObjeto === "Compra de insumos de impresión para hospitales.");
ok("url built (no double slash)", card.url === "https://gastos.gub.uy/llamados/12345");
ok("matchedOn carried", card.matchedOn.keywords[0] === "toner");

console.log("renderers");
const meta = cardMetaLine(card, "es");
ok("meta line has organismo + budget + countdown", meta.includes("Ministerio") && meta.includes("$ 850.000") && meta.includes("6 días"));
const pp = renderPushPayload(card, "es");
ok("push title = objeto", pp.title === card.objeto);
ok("push url = card url", pp.url === card.url);
const longCard = buildAlertCard({ ...(call as object), title: "x".repeat(120) } as never, { appBaseUrl: "https://g", now });
ok("push title truncated to ≤80", renderPushPayload(longCard).title.length <= 80);
const tg = renderTelegramHtml(card, "es");
ok("telegram html bold objeto", tg.includes("<b>Adquisición"));
ok("telegram html budget label", tg.includes("Presupuesto:") && tg.includes("$ 850.000"));

console.log("resolveChannels");
ok("enabled=false → all off", Object.values(resolveChannels({ notificationPrefs: { enabled: false, frequency: "instant" } } as never)).every(v => v === false));
ok("no channels → default", JSON.stringify(resolveChannels({ notificationPrefs: { enabled: true, frequency: "instant" } } as never)) === JSON.stringify(DEFAULT_CHANNELS));
const partial = resolveChannels({ notificationPrefs: { enabled: true, frequency: "instant", channels: { push: true } } } as never);
ok("partial channels merge push=true", partial.push === true);
ok("partial channels keep email default true", partial.email === true);
ok("partial channels keep telegram default false", partial.telegram === false);

console.log("link-token");
const secret = "test-secret-abc";
const tok = createLinkToken("uid-XYZ", secret, 900, now);
ok("valid token verifies to uid", verifyLinkToken(tok, secret, now) === "uid-XYZ");
ok("wrong secret → null", verifyLinkToken(tok, "other", now) === null);
ok("tampered token → null", verifyLinkToken(tok.slice(0, -2) + "zz", secret, now) === null);
ok("expired token → null", verifyLinkToken(tok, secret, new Date(now.getTime() + 901_000)) === null);
ok("garbage → null", verifyLinkToken("not.a.token", secret, now) === null);

console.log(`\n✅ ${passed} assertions passed`);
