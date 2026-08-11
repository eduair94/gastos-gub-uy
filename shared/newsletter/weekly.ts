import type { INewsletterAiAnalysis, INewsletterIssue } from "../types/newsletter";

const URUGUAY_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface NewsletterWeek {
  start: Date;
  end: Date;
  key: string;
  slug: string;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Last completed Monday–Sunday in America/Montevideo. Uruguay has remained at
 * UTC-03:00 since 2015; the explicit shift keeps this deterministic even when
 * the cron process itself runs in UTC.
 */
export function previousUruguayWeek(reference = new Date()): NewsletterWeek {
  const local = new Date(reference.getTime() - URUGUAY_OFFSET_MS);
  const mondayIndex = (local.getUTCDay() + 6) % 7;
  const thisMondayLocalMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - mondayIndex,
  );
  const start = new Date(thisMondayLocalMs - (7 * DAY_MS) + URUGUAY_OFFSET_MS);
  const end = new Date(thisMondayLocalMs + URUGUAY_OFFSET_MS);
  const key = isoDay(new Date(start.getTime() - URUGUAY_OFFSET_MS));
  return { start, end, key, slug: `resumen-semanal-${key}` };
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

/** Runtime validation after Gemini's response-schema validation. */
export function normalizeNewsletterAnalysis(value: unknown): INewsletterAiAnalysis {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const analysis: INewsletterAiAnalysis = {
    headline: cleanText(input.headline, 140),
    overview: cleanList(input.overview, 4, 900),
    spendingPatterns: cleanList(input.spendingPatterns, 6, 500),
    cautions: cleanList(input.cautions, 5, 500),
  };
  if (!analysis.headline || analysis.overview.length < 2 || analysis.spendingPatterns.length < 1) {
    throw new Error("Gemini returned an incomplete newsletter analysis");
  }
  return analysis;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatUyu(value: number): string {
  return `$ ${new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 }).format(Math.round(value))}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export interface NewsletterMail {
  subject: string;
  html: string;
  text: string;
}

/** RFC 8058 one-click headers for the newsletter-only unsubscribe endpoint. */
export function newsletterListUnsubscribeHeaders(
  appBaseUrl: string,
  unsubscribeToken: string,
): Record<string, string> {
  const base = appBaseUrl.replace(/\/+$/, "");
  const oneClickUrl = `${base}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function renderNewsletterMail(
  issue: Pick<INewsletterIssue,
    "title" | "excerpt" | "slug" | "periodStart" | "periodEnd" | "topExpenses"
    | "anomalySummary" | "analysis"> & Partial<Pick<INewsletterIssue, "topicHighlights">>,
  options: { appBaseUrl: string; unsubscribeToken: string },
): NewsletterMail {
  const base = options.appBaseUrl.replace(/\/+$/, "");
  const issueUrl = `${base}/blog/${encodeURIComponent(issue.slug)}`;
  const unsubscribeUrl = `${base}/newsletter/unsubscribe?token=${encodeURIComponent(options.unsubscribeToken)}`;
  const period = `${formatDate(issue.periodStart)}–${formatDate(new Date(issue.periodEnd.getTime() - 1))}`;
  const expensesHtml = issue.topExpenses.slice(0, 5).map(expense => `
    <li style="margin:0 0 14px">
      <a href="${issueUrl}#gasto-${expense.rank}" style="color:#3c6d9c;font-weight:700;text-decoration:none">${escapeHtml(expense.title)}</a><br>
      <span style="color:#596b76">${escapeHtml(expense.buyerName ?? "Organismo no informado")} · ${escapeHtml(expense.supplierNames.join(", ") || "Proveedor no informado")}</span><br>
      <strong>${escapeHtml(formatUyu(expense.amountUyu))}</strong>
    </li>`).join("");
  const overviewHtml = issue.analysis.overview.map(p => `<p style="line-height:1.6">${escapeHtml(p)}</p>`).join("");

  // Spending topics: only rendered when the week actually moved one. An empty block
  // that says "0 new contracts" every week trains the reader to skip the section.
  const topicsHtml = (issue.topicHighlights ?? []).length
    ? `<h2 style="font-size:18px;margin:28px 0 10px">Temas de gasto</h2>`
      + (issue.topicHighlights ?? []).map(topic => `
      <p style="line-height:1.6;margin:0 0 6px"><strong>${escapeHtml(topic.label)}</strong>: ${topic.newContracts} contrato(s) visibles por primera vez esta semana${topic.newTotalUyu > 0 ? `, ${escapeHtml(formatUyu(topic.newTotalUyu))} con monto cargado` : ""}.</p>
      <ul style="padding-left:22px;margin:0 0 16px">${topic.items.map(item => `
        <li style="margin:0 0 8px"><span style="color:#0f2233">${escapeHtml(item.title)}</span><br>
        <span style="color:#596b76">${escapeHtml(item.buyerName ?? "Organismo no informado")}${item.hasAmount ? ` · ${escapeHtml(formatUyu(item.amountUyu))}` : " · sin monto en el feed"}</span></li>`).join("")}</ul>
      <p style="margin:0 0 8px"><a href="${base}/analytics/${encodeURIComponent(topic.slug)}" style="color:#3c6d9c">Ver el tema completo</a></p>`).join("")
    : "";

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#eef1f2;color:#0f2233;font-family:Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:28px 18px">
    <div style="background:#0f2233;color:#fff;padding:26px;border-radius:10px 10px 0 0">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#dce8f3">Expediente semanal · ${escapeHtml(period)}</div>
      <h1 style="font-size:28px;line-height:1.15;margin:10px 0">${escapeHtml(issue.title)}</h1>
      <p style="margin:0;color:#dce8f3;line-height:1.5">${escapeHtml(issue.excerpt)}</p>
    </div>
    <div style="background:#fff;border:1px solid #d3dade;border-top:0;padding:26px">
      ${overviewHtml}
      <h2 style="font-size:18px;margin:28px 0 14px">Las adjudicaciones más grandes</h2>
      <ol style="padding-left:22px">${expensesHtml}</ol>
      ${topicsHtml}
      <h2 style="font-size:18px;margin:28px 0 10px">Alertas detectadas</h2>
      <p style="line-height:1.6"><strong>${issue.anomalySummary.total}</strong> señales nuevas; <strong>${issue.anomalySummary.highCritical}</strong> de severidad alta o crítica y <strong>${issue.anomalySummary.unexplained}</strong> sin explicación suficiente tras la revisión automática.</p>
      <p style="font-size:13px;line-height:1.5;color:#596b76">Una alerta estadística no prueba irregularidad. El reporte distingue señales sin explicación, posibles errores de carga y revisiones pendientes.</p>
      <p style="margin:28px 0 0"><a href="${issueUrl}" style="display:inline-block;background:#3c6d9c;color:#fff;padding:11px 16px;border-radius:6px;text-decoration:none;font-weight:700">Leer el expediente completo</a></p>
    </div>
    <p style="font-size:12px;line-height:1.5;color:#596b76;padding:0 8px">Recibís este correo porque te suscribiste al resumen semanal. <a href="${unsubscribeUrl}" style="color:#3c6d9c">Cancelar suscripción</a>.</p>
  </div>
</body></html>`;

  const expensesText = issue.topExpenses.slice(0, 5)
    .map(e => `${e.rank}. ${e.title} — ${formatUyu(e.amountUyu)}`)
    .join("\n");
  const topicLines = (issue.topicHighlights ?? []).map(topic =>
    `${topic.label}: ${topic.newContracts} contrato(s) visibles por primera vez esta semana`
    + `${topic.newTotalUyu > 0 ? `, ${formatUyu(topic.newTotalUyu)} con monto` : ""}.`,
  );
  const topicsText = topicLines.length ? `\n\nTEMAS DE GASTO\n${topicLines.join("\n")}` : "";
  const text = `${issue.title}\n${period}\n\n${issue.excerpt}\n\n${issue.analysis.overview.join("\n\n")}\n\nLAS ADJUDICACIONES MÁS GRANDES\n${expensesText}\n\nALERTAS DETECTADAS\n${issue.anomalySummary.total} señales nuevas; ${issue.anomalySummary.highCritical} altas o críticas; ${issue.anomalySummary.unexplained} sin explicación suficiente.${topicsText}\n\nUna alerta estadística no prueba irregularidad.\n\nLeer: ${issueUrl}\nCancelar suscripción: ${unsubscribeUrl}`;

  return { subject: issue.title, html, text };
}
