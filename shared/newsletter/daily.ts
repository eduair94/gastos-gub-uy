import type { INewsletterDailyIssue } from "../models/newsletter_daily_issue";

/**
 * El correo diario.
 *
 * TRAE DOS SALIDAS, NO UNA. Además del enlace de baja lleva uno de «quiero sólo el semanal».
 * Los suscriptos existentes pasaron a cadencia diaria sin pedirlo, y sin una salida intermedia
 * el que se molesta sólo tiene el botón de baja o el de spam. Perder un suscriptor es caro;
 * una denuncia de spam es peor, porque castiga la entrega de todo el resto.
 */

const URUGUAY_TZ = "America/Montevideo";

export interface DailyMail {
  subject: string;
  html: string;
  text: string;
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
    timeZone: URUGUAY_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** RFC 8058: un clic, sin confirmación, o el proveedor de correo lo penaliza. */
export function dailyListUnsubscribeHeaders(appBaseUrl: string, unsubscribeToken: string): Record<string, string> {
  const base = appBaseUrl.replace(/\/+$/, "");
  const oneClickUrl = `${base}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function renderDailyMail(
  issue: Pick<INewsletterDailyIssue, "title" | "excerpt" | "slug" | "dayKey" | "periodStart" | "notes" | "topExpenses" | "newAnomalies" | "eligibleExpenseCount" | "totalAmountUyu">,
  options: { appBaseUrl: string; unsubscribeToken: string },
): DailyMail {
  const base = options.appBaseUrl.replace(/\/+$/, "");
  const issueUrl = `${base}/blog/${encodeURIComponent(issue.slug)}`;
  const unsubscribeUrl = `${base}/newsletter/unsubscribe?token=${encodeURIComponent(options.unsubscribeToken)}`;
  const weeklyOnlyUrl = `${base}/api/newsletter/frequency?token=${encodeURIComponent(options.unsubscribeToken)}&to=weekly`;
  const day = formatDate(issue.periodStart);

  const notesHtml = issue.notes.map(note => {
    const noteUrl = `${base}/investigaciones/diario/${encodeURIComponent(note.slug)}`;
    return `
    <div style="margin:0 0 22px;padding:0 0 18px;border-bottom:1px solid #e6eaed">
      <a href="${noteUrl}" style="color:#0f2233;font-size:19px;font-weight:700;text-decoration:none;line-height:1.3">${escapeHtml(note.title)}</a>
      <p style="margin:8px 0 10px;color:#39505f;line-height:1.6">${escapeHtml(note.dek)}</p>
      <p style="margin:0 0 12px;color:#596b76;line-height:1.6;font-size:14px">${escapeHtml(note.measured)}</p>
      <a href="${noteUrl}" style="display:inline-block;background:#3c6d9c;color:#fff;padding:9px 14px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">Leer la nota completa</a>
    </div>`;
  }).join("");

  const expensesHtml = issue.topExpenses.slice(0, 5).map(expense => `
    <li style="margin:0 0 12px">
      <span style="color:#0f2233;font-weight:600">${escapeHtml(expense.title)}</span><br>
      <span style="color:#596b76;font-size:13px">${escapeHtml(expense.buyerName ?? "Organismo no informado")} · ${escapeHtml(expense.supplierNames.join(", ") || "Proveedor no informado")}</span><br>
      <strong>${escapeHtml(formatUyu(expense.amountUyu))}</strong>
    </li>`).join("");

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#eef1f2;color:#0f2233;font-family:Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:28px 18px">
    <div style="background:#0f2233;color:#fff;padding:24px;border-radius:10px 10px 0 0">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#dce8f3">Con la tuya, contribuyente · ${escapeHtml(day)}</div>
      <h1 style="font-size:25px;line-height:1.2;margin:10px 0">${escapeHtml(issue.title)}</h1>
      <p style="margin:0;color:#dce8f3;line-height:1.5">${escapeHtml(issue.excerpt)}</p>
    </div>
    <div style="background:#fff;border:1px solid #d3dade;border-top:0;padding:24px">
      ${notesHtml}
      ${expensesHtml ? `<h2 style="font-size:17px;margin:24px 0 12px">Lo más grande que se adjudicó ayer</h2><ol style="padding-left:22px;margin:0">${expensesHtml}</ol>` : ""}
      <p style="line-height:1.6;color:#596b76;font-size:14px;margin:22px 0 0">${issue.newAnomalies} señal(es) de precio nueva(s) en las últimas 24 horas. Una alerta estadística no prueba irregularidad.</p>
      <p style="margin:22px 0 0"><a href="${issueUrl}" style="color:#3c6d9c;font-weight:700">Ver la edición completa en el sitio</a></p>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#596b76;padding:0 8px">
      Recibís este correo porque te suscribiste al newsletter de Con la tuya, contribuyente.<br>
      ¿Demasiado seguido? <a href="${weeklyOnlyUrl}" style="color:#3c6d9c;font-weight:700">Pasate al resumen semanal</a> · <a href="${unsubscribeUrl}" style="color:#3c6d9c">Cancelar suscripción</a>
    </p>
  </div>
</body></html>`;

  const notesText = issue.notes
    .map(note => `${note.title}\n${note.dek}\n${note.measured}\n${base}/investigaciones/diario/${note.slug}`)
    .join("\n\n");
  const expensesText = issue.topExpenses.slice(0, 5)
    .map(e => `${e.rank}. ${e.title} — ${formatUyu(e.amountUyu)}`)
    .join("\n");

  const text = `${issue.title}\n${day}\n\n${issue.excerpt}\n\n${notesText}`
    + (expensesText ? `\n\nLO MÁS GRANDE QUE SE ADJUDICÓ AYER\n${expensesText}` : "")
    + `\n\n${issue.newAnomalies} señal(es) de precio nueva(s). Una alerta estadística no prueba irregularidad.`
    + `\n\nEdición completa: ${issueUrl}`
    + `\n¿Demasiado seguido? Pasate al resumen semanal: ${weeklyOnlyUrl}`
    + `\nCancelar suscripción: ${unsubscribeUrl}`;

  return { subject: issue.title, html, text };
}
