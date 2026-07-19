// src/jobs/enrich/hygiene.ts
import { promises as dns } from "node:dns";
import type { IEmailEntry } from "../../../shared/models/supplier_contacts";
import type { ContactCandidate } from "./types";

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const ROLE_LOCALS = new Set([
  "info", "contacto", "contact", "ventas", "sales", "admin", "administracion",
  "administración", "compras", "hola", "consultas", "atencion", "atención",
  "soporte", "gerencia", "recepcion", "recepción", "secretaria", "secretaría",
]);

const JUNK_DOMAINS = new Set([
  "example.com", "example.org", "email.com", "test.com", "sentry.io",
  "domain.com", "yourdomain.com", "empresa.com",
]);

export function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  let e = raw.trim().toLowerCase().replace(/^mailto:/, "");
  e = e.replace(/[.,;:)>\]]+$/, "").replace(/^[(<\[]+/, "");
  if (!EMAIL_RE.test(e)) return null;
  return e;
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

export function isRoleAccount(email: string): boolean {
  const local = email.slice(0, email.indexOf("@"));
  return ROLE_LOCALS.has(local);
}

export function isJunkEmail(email: string): boolean {
  const d = domainOf(email);
  if (JUNK_DOMAINS.has(d)) return true;
  // obvious placeholders
  if (/^(no-?reply|noreply|donotreply)@/.test(email)) return true;
  if (/@(sentry|wixpress)\./.test(email)) return true;
  return false;
}

// DNS error codes that mean "couldn't reach a resolver at all" — as opposed to
// a definitive "this domain has no records" (ENOTFOUND/ENODATA/NXDOMAIN-class).
// Shared with the orchestrator's startup canary (see enrich-supplier-contacts.ts).
export const CONNECTIVITY_DNS_ERROR_CODES = new Set([
  "ECONNREFUSED", "ETIMEOUT", "ESERVFAIL", "EAI_AGAIN",
]);

const mxCache = new Map<string, boolean>();
export async function mxValid(domain: string): Promise<boolean> {
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  let ok = false;
  let definitive = true;
  try {
    const mx = await dns.resolveMx(domain);
    ok = mx.length > 0;
  } catch (e: any) {
    if (CONNECTIVITY_DNS_ERROR_CODES.has(e?.code)) {
      definitive = false;
    } else {
      // No MX → try an A record as a weak fallback (some small UY hosts).
      try {
        ok = (await dns.resolve(domain)).length > 0;
      } catch (e2: any) {
        if (CONNECTIVITY_DNS_ERROR_CODES.has(e2?.code)) definitive = false;
        else ok = false;
      }
    }
  }
  // Only cache a definitive result — a connectivity blip during a long run
  // must not permanently poison the cache with a false negative.
  if (definitive) mxCache.set(domain, ok);
  return ok;
}

export async function mergeCandidates(
  cands: ContactCandidate[],
  mx: (domain: string) => Promise<boolean> = mxValid,
): Promise<IEmailEntry[]> {
  // Normalize + drop junk, then dedupe keeping the highest-confidence source.
  const best = new Map<string, ContactCandidate>();
  for (const c of cands) {
    const email = normalizeEmail(c.email);
    if (!email || isJunkEmail(email)) continue;
    const prev = best.get(email);
    if (!prev || c.confidence > prev.confidence) best.set(email, { ...c, email });
  }
  const out: IEmailEntry[] = [];
  for (const c of best.values()) {
    const ok = await mx(domainOf(c.email));
    out.push({
      email: c.email,
      source: c.source,
      confidence: c.confidence,
      isRoleAccount: isRoleAccount(c.email),
      mxValid: ok,
      status: ok ? "valid" : "invalid",
    });
  }
  return out;
}

export function pickPrimary(entries: IEmailEntry[]): string | null {
  const valid = entries.filter(e => e.mxValid);
  if (!valid.length) return null;
  // Two-key comparator: non-role accounts first, then confidence desc. Unlike
  // the old (isRoleAccount ? 0 : 1) * 10 + confidence packing, this is robust
  // to any confidence value (the old formula broke once confidence >= 10).
  return valid.sort((a, b) => {
    if (a.isRoleAccount !== b.isRoleAccount) return a.isRoleAccount ? 1 : -1;
    return b.confidence - a.confidence;
  })[0].email;
}
