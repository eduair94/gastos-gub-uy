import type { IOpenCall } from "../types/monitor";

// ONE rich content model for a matched llamado, rendered per channel (email,
// telegram, push, in-app inbox). Everything a company needs to decide whether to
// bid: objeto, organismo, presupuesto, deadline (+ countdown), rubro, modalidad,
// pliego link, AI objeto, why-it-matched, and deep links (llamado + estimate).
//
// The "cuánto ofertar para ganar" estimate is deliberately NOT computed here — it
// needs the app-side aggregation. The card carries `url`/`estimateUrl` so every
// channel links to the llamado page, which already renders the estimate.

export type Locale = "es" | "en";

export interface AlertCardMoney {
  value: number | null;
  currency: string | null;
  formatted: string | null;
}

export interface AlertCardDeadline {
  date: Date | null;
  /** Whole days until close (ceil), or null if no deadline / already past. */
  closesInDays: number | null;
}

export interface AlertCard {
  compraId: string;
  objeto: string;
  organismo: string | null;
  presupuesto: AlertCardMoney;
  deadline: AlertCardDeadline;
  rubros: string[];
  modalidad: string | null;
  pliegoUrl: string | null;
  aiObjeto: string | null;
  matchedOn: { categories: string[]; keywords: string[] };
  url: string;
  estimateUrl: string;
}

type CallInput = Pick<
  IOpenCall,
  | "compraId"
  | "title"
  | "buyer"
  | "procurementMethodDetails"
  | "tenderPeriod"
  | "estimatedValue"
  | "currency"
  | "documents"
  | "items"
  | "classificationSet"
  | "aiSummary"
>;

export interface BuildAlertCardOptions {
  appBaseUrl: string;
  matchedOn?: { categories?: string[] | undefined; keywords?: string[] | undefined } | undefined;
  now?: Date;
  /** Cap on rubro labels shown. Default 4. */
  maxRubros?: number;
}

/** `$ 1.234.567` (UYU) / `US$ 12.345` (USD) — es-UY grouping, no decimals. */
export function formatMoney(value: number | null | undefined, currency: string | null | undefined): AlertCardMoney {
  if (value == null || !Number.isFinite(value)) {
    return { value: null, currency: currency ?? null, formatted: null };
  }
  const cur = (currency ?? "UYU").toUpperCase();
  const symbol = cur === "USD" ? "US$" : cur === "UYU" || cur === "$U" ? "$" : cur + " ";
  const n = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 }).format(Math.round(value));
  return { value, currency: cur, formatted: `${symbol} ${n}` };
}

function daysUntil(date: Date | null | undefined, now: Date): number | null {
  if (!date) return null;
  const ms = date.getTime() - now.getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.ceil(ms / 86_400_000);
}

/** Human rubro labels from item classification labels, de-duped, capped. */
function rubrosFrom(call: CallInput, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of call.items ?? []) {
    const label = it.classificationLabel?.trim();
    if (label && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      out.push(label);
      if (out.length >= max) return out;
    }
  }
  // Fallback to raw classification codes if no labels were carried.
  if (!out.length) {
    for (const code of call.classificationSet ?? []) {
      if (code && !seen.has(code)) {
        seen.add(code);
        out.push(code);
        if (out.length >= max) break;
      }
    }
  }
  return out;
}

/** Prefer a real pliego document; otherwise the first attached document. */
function pliegoUrlFrom(call: CallInput): string | null {
  const docs = call.documents ?? [];
  if (!docs.length) return null;
  const pliego = docs.find(d => /pliego|tenderNotice|biddingDocuments/i.test(`${d.documentType ?? ""} ${d.title ?? ""}`));
  return (pliego ?? docs[0])?.url ?? null;
}

export function buildAlertCard(call: CallInput, opts: BuildAlertCardOptions): AlertCard {
  const now = opts.now ?? new Date();
  const base = opts.appBaseUrl.replace(/\/+$/, "");
  const url = `${base}/llamados/${encodeURIComponent(call.compraId)}`;
  const endDate = call.tenderPeriod?.endDate ?? null;

  return {
    compraId: call.compraId,
    objeto: call.title,
    organismo: call.buyer?.name ?? null,
    presupuesto: formatMoney(call.estimatedValue, call.currency),
    deadline: { date: endDate, closesInDays: daysUntil(endDate, now) },
    rubros: rubrosFrom(call, opts.maxRubros ?? 4),
    modalidad: call.procurementMethodDetails ?? null,
    pliegoUrl: pliegoUrlFrom(call),
    aiObjeto: call.aiSummary?.objeto?.trim() || null,
    matchedOn: {
      categories: opts.matchedOn?.categories ?? [],
      keywords: opts.matchedOn?.keywords ?? [],
    },
    url,
    estimateUrl: `${url}#estimacion`,
  };
}

// ---- Locale strings + compact renderers reused by push/telegram ----

const STR = {
  es: {
    closes: "Cierra",
    closesIn: (d: number) => (d === 0 ? "cierra hoy" : d === 1 ? "cierra mañana" : `cierra en ${d} días`),
    noDeadline: "sin fecha de cierre",
    budget: "Presupuesto",
    noBudget: "presupuesto no informado",
    method: "Modalidad",
    viewCall: "Ver llamado",
    viewPliego: "Ver pliego",
    why: "Coincide con",
  },
  en: {
    closes: "Closes",
    closesIn: (d: number) => (d === 0 ? "closes today" : d === 1 ? "closes tomorrow" : `closes in ${d} days`),
    noDeadline: "no closing date",
    budget: "Budget",
    noBudget: "budget not disclosed",
    method: "Method",
    viewCall: "View tender",
    viewPliego: "View documents",
    why: "Matches",
  },
} as const;

/** "Organismo · $presupuesto · cierra en 6 días" — the compact one-liner. */
export function cardMetaLine(card: AlertCard, locale: Locale = "es"): string {
  const s = STR[locale];
  const bits: string[] = [];
  if (card.organismo) bits.push(card.organismo);
  if (card.presupuesto.formatted) bits.push(card.presupuesto.formatted);
  else bits.push(s.noBudget);
  bits.push(card.deadline.closesInDays != null ? s.closesIn(card.deadline.closesInDays) : s.noDeadline);
  return bits.join(" · ");
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  compraId: string;
}

/** Compact Web Push payload (≤~4KB). Detail lives behind the deep link. */
export function renderPushPayload(card: AlertCard, locale: Locale = "es"): PushPayload {
  return {
    title: card.objeto.length > 80 ? card.objeto.slice(0, 77) + "…" : card.objeto,
    body: cardMetaLine(card, locale),
    url: card.url,
    compraId: card.compraId,
  };
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

/** Telegram HTML message body (parse_mode: HTML). Buttons are added by the sender. */
export function renderTelegramHtml(card: AlertCard, locale: Locale = "es"): string {
  const s = STR[locale];
  const lines: string[] = [];
  lines.push(`<b>${esc(card.objeto)}</b>`);
  if (card.organismo) lines.push(esc(card.organismo));
  const meta: string[] = [];
  meta.push(card.presupuesto.formatted ? `${s.budget}: ${esc(card.presupuesto.formatted)}` : s.noBudget);
  if (card.modalidad) meta.push(`${s.method}: ${esc(card.modalidad)}`);
  lines.push(meta.join("  ·  "));
  lines.push(card.deadline.closesInDays != null
    ? `⏳ ${s.closesIn(card.deadline.closesInDays)}`
    : s.noDeadline);
  if (card.rubros.length) lines.push(`🏷️ ${esc(card.rubros.join(", "))}`);
  if (card.aiObjeto) lines.push(`\n${esc(card.aiObjeto)}`);
  const why = [...card.matchedOn.keywords, ...card.matchedOn.categories];
  if (why.length) lines.push(`\n<i>${s.why}: ${esc(why.slice(0, 6).join(", "))}</i>`);
  return lines.join("\n");
}
