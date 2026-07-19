/**
 * Email templates for the Monitor de Llamados. Plain, DESIGN.md-toned HTML with
 * inline styles (email clients ignore <style>).
 *
 * The budget figure is now included: it is the single strongest "should I bid?"
 * signal, so an alert that omits it forces the reader to click through just to
 * triage. It is rendered as plain bold ink (not gold) — email clients strip the
 * design system, and gold-on-white reads as spam decoration rather than money.
 *
 * Every email includes a one-click unsubscribe (footer link + the caller adds the
 * List-Unsubscribe headers).
 */

export type Locale = "es" | "en";

export interface EmailCall {
  compraId: string;
  title: string;
  buyerName?: string | undefined;
  procurementMethodDetails?: string | undefined;
  endDate?: Date | undefined;
  url: string;
  // Enriched decide-to-bid fields (from the shared AlertCard).
  closesInDays?: number | null | undefined;
  budget?: string | null | undefined;
  rubros?: string[] | undefined;
  matchedOn?: { categories?: string[] | undefined; keywords?: string[] | undefined } | undefined;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const INK = "#0f2233";
const CELESTE = "#3c6d9c";
const MUTED = "#64757f";
const PAPER = "#eef1f2";
const RULE = "#dfe4e7";

function esc(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function fmtDate(d: Date | undefined, locale: Locale): string {
  if (!d) return locale === "en" ? "no deadline published" : "sin fecha de cierre publicada";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "es-UY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function layout(innerHtml: string, opts: { unsubscribeUrl: string; appBaseUrl: string; locale: Locale }): string {
  const foot = opts.locale === "en"
    ? `You receive this because you have active alerts. <a href="${esc(opts.unsubscribeUrl)}" style="color:${MUTED}">Unsubscribe</a>.`
    : `Recibís esto porque tenés alertas activas. <a href="${esc(opts.unsubscribeUrl)}" style="color:${MUTED}">Darte de baja</a>.`;
  return `<!doctype html><html><body style="margin:0;background:${PAPER};padding:24px 0;font-family:'Public Sans',Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid ${RULE};border-radius:12px;overflow:hidden">
<tr><td style="padding:20px 28px;border-bottom:1px solid ${RULE}">
<span style="font-weight:800;font-size:16px;letter-spacing:-0.02em">Con la tuya, contribuyente</span>
</td></tr>
<tr><td style="padding:24px 28px">${innerHtml}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid ${RULE};font-size:12px;color:${MUTED};line-height:1.5">
<a href="${esc(opts.appBaseUrl)}" style="color:${CELESTE};text-decoration:none">${esc(opts.appBaseUrl.replace(/^https?:\/\//, ""))}</a><br>${foot}
</td></tr>
</table></td></tr></table></body></html>`;
}

function countdown(days: number | null | undefined, locale: Locale): string | null {
  if (days == null) return null;
  if (locale === "en") return days === 0 ? "closes today" : days === 1 ? "closes tomorrow" : `closes in ${days} days`;
  return days === 0 ? "cierra hoy" : days === 1 ? "cierra mañana" : `cierra en ${days} días`;
}

function callBlock(call: EmailCall, locale: Locale): string {
  const meta: string[] = [];
  if (call.buyerName) meta.push(esc(call.buyerName));
  if (call.procurementMethodDetails) meta.push(esc(call.procurementMethodDetails));
  const deadlineLabel = locale === "en" ? "Closes" : "Cierra";
  const budgetLabel = locale === "en" ? "Budget" : "Presupuesto";
  const cd = countdown(call.closesInDays, locale);
  const rubros = (call.rubros ?? []).filter(Boolean);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">
<tr><td style="padding:14px 16px;border:1px solid ${RULE};border-radius:10px">
<a href="${esc(call.url)}" style="color:${INK};text-decoration:none;font-weight:700;font-size:15px;line-height:1.35">${esc(call.title)}</a>
${meta.length ? `<div style="color:${MUTED};font-size:13px;margin-top:4px">${meta.join(" · ")}</div>` : ""}
${call.budget ? `<div style="font-size:13px;margin-top:6px"><strong>${budgetLabel}:</strong> ${esc(call.budget)}</div>` : ""}
<div style="font-size:13px;margin-top:6px"><strong>${deadlineLabel}:</strong> ${esc(fmtDate(call.endDate, locale))}${cd ? ` <span style="color:${MUTED}">(${esc(cd)})</span>` : ""}</div>
${rubros.length ? `<div style="color:${MUTED};font-size:12px;margin-top:6px">${esc(rubros.join(" · "))}</div>` : ""}
</td></tr></table>`;
}

function callText(call: EmailCall, locale: Locale): string {
  const deadlineLabel = locale === "en" ? "Closes" : "Cierra";
  const budgetLabel = locale === "en" ? "Budget" : "Presupuesto";
  const lines = [`• ${call.title}`];
  if (call.buyerName) lines.push(`  ${call.buyerName}`);
  if (call.budget) lines.push(`  ${budgetLabel}: ${call.budget}`);
  const cd = countdown(call.closesInDays, locale);
  lines.push(`  ${deadlineLabel}: ${fmtDate(call.endDate, locale)}${cd ? ` (${cd})` : ""}`);
  lines.push(`  ${call.url}`);
  return lines.join("\n");
}

export interface AlertParams {
  calls: EmailCall[];
  appBaseUrl: string;
  unsubscribeUrl: string;
  locale?: Locale;
  digest?: boolean;
}

export function renderAlertEmail(params: AlertParams): RenderedEmail {
  const locale = params.locale ?? "es";
  const n = params.calls.length;
  const subject = locale === "en"
    ? `${n} new tender${n === 1 ? "" : "s"} matching your alerts`
    : `${n} ${n === 1 ? "nuevo llamado" : "nuevos llamados"} para tu rubro`;

  const intro = locale === "en"
    ? `We found ${n} new open call${n === 1 ? "" : "s"} matching your alerts.`
    : `Encontramos ${n} ${n === 1 ? "llamado nuevo" : "llamados nuevos"} que coinciden con tus alertas.`;

  const inner = `<p style="margin:0 0 18px;font-size:14px;line-height:1.5">${intro}</p>${params.calls.map(c => callBlock(c, locale)).join("")}`;
  const html = layout(inner, { unsubscribeUrl: params.unsubscribeUrl, appBaseUrl: params.appBaseUrl, locale });
  const text = `${intro}\n\n${params.calls.map(c => callText(c, locale)).join("\n\n")}\n\n${params.unsubscribeUrl}`;
  return { subject, html, text };
}

export interface ReminderParams {
  call: EmailCall;
  daysBefore: number;
  appBaseUrl: string;
  unsubscribeUrl: string;
  locale?: Locale;
}

export function renderReminderEmail(params: ReminderParams): RenderedEmail {
  const locale = params.locale ?? "es";
  const subject = locale === "en"
    ? `Reminder: a saved tender closes in ${params.daysBefore} day${params.daysBefore === 1 ? "" : "s"}`
    : `Recordatorio: un llamado guardado cierra en ${params.daysBefore} día${params.daysBefore === 1 ? "" : "s"}`;
  const intro = locale === "en"
    ? `A call you saved is about to close.`
    : `Un llamado que guardaste está por cerrar.`;
  const inner = `<p style="margin:0 0 18px;font-size:14px;line-height:1.5">${intro}</p>${callBlock(params.call, locale)}`;
  const html = layout(inner, { unsubscribeUrl: params.unsubscribeUrl, appBaseUrl: params.appBaseUrl, locale });
  const text = `${intro}\n\n${callText(params.call, locale)}\n\n${params.unsubscribeUrl}`;
  return { subject, html, text };
}

export interface AwardParams {
  call: EmailCall;
  appBaseUrl: string;
  unsubscribeUrl: string;
  locale?: Locale;
}

export function renderAwardEmail(params: AwardParams): RenderedEmail {
  const locale = params.locale ?? "es";
  const subject = locale === "en"
    ? `A tender you followed was awarded`
    : `Se adjudicó un llamado que seguías`;
  const intro = locale === "en"
    ? `A call you were following has been awarded.`
    : `Un llamado que seguías fue adjudicado.`;
  const inner = `<p style="margin:0 0 18px;font-size:14px;line-height:1.5">${intro}</p>${callBlock(params.call, locale)}`;
  const html = layout(inner, { unsubscribeUrl: params.unsubscribeUrl, appBaseUrl: params.appBaseUrl, locale });
  const text = `${intro}\n\n${callText(params.call, locale)}\n\n${params.unsubscribeUrl}`;
  return { subject, html, text };
}
