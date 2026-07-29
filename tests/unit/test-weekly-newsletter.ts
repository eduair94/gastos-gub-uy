import assert from "node:assert";
import {
  newsletterListUnsubscribeHeaders,
  normalizeNewsletterAnalysis,
  previousUruguayWeek,
  renderNewsletterMail,
} from "../../shared/newsletter/weekly";

const week = previousUruguayWeek(new Date("2026-07-28T15:00:00.000Z"));
assert.equal(week.key, "2026-07-20");
assert.equal(week.slug, "resumen-semanal-2026-07-20");
assert.equal(week.start.toISOString(), "2026-07-20T03:00:00.000Z");
assert.equal(week.end.toISOString(), "2026-07-27T03:00:00.000Z");

const analysis = normalizeNewsletterAnalysis({
  headline: "  Una semana de compras concentradas  ",
  overview: ["Primer párrafo.", "Segundo párrafo."],
  spendingPatterns: ["Patrón verificable."],
  cautions: ["No implica irregularidad."],
});
assert.equal(analysis.headline, "Una semana de compras concentradas");
assert.throws(() => normalizeNewsletterAnalysis({ headline: "Incompleto" }));

const mail = renderNewsletterMail({
  title: "Resumen <semanal>",
  excerpt: "Hechos & análisis.",
  slug: week.slug,
  periodStart: week.start,
  periodEnd: week.end,
  topExpenses: [{
    rank: 1,
    releaseId: "release-1",
    ocid: "ocds-1",
    title: "Compra <principal>",
    supplierNames: ["Proveedor & Cía."],
    amountUyu: 1_250_000,
    publishedAt: new Date("2026-07-22T12:00:00Z"),
  }],
  anomalySummary: {
    total: 7,
    highCritical: 2,
    unexplained: 1,
    dataErrors: 3,
    pendingAiReview: 1,
    bySeverity: { low: 1, medium: 4, high: 2, critical: 0 },
  },
  analysis,
} as never, {
  appBaseUrl: "https://example.test/",
  unsubscribeToken: "token 123",
});

assert.ok(mail.subject.includes("Resumen"));
assert.ok(mail.html.includes("Compra &lt;principal&gt;"));
assert.ok(mail.html.includes("Proveedor &amp; Cía."));
assert.ok(mail.html.includes("https://example.test/blog/resumen-semanal-2026-07-20"));
assert.ok(mail.html.includes("token%20123"));
assert.ok(mail.text.includes("$ 1.250.000"));
assert.ok(mail.text.includes("Una alerta estadística no prueba irregularidad."));
assert.ok(mail.text.includes("26/07/2026"));
assert.ok(!mail.text.includes("27/07/2026"));

assert.deepEqual(
  newsletterListUnsubscribeHeaders("https://example.test/", "token 123"),
  {
    "List-Unsubscribe": "<https://example.test/api/newsletter/unsubscribe?token=token%20123>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
);

console.log("ok: weekly newsletter helpers");
