/**
 * Transactional email transport. Resend behind a small interface so the provider
 * is swappable and the jobs stay testable. With no RESEND_API_KEY configured the
 * mailer is a no-op (logs + returns skipped) so dev runs never crash.
 */
import { Resend } from "resend";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface MailResult {
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<MailResult>;
}

class ResendMailer implements Mailer {
  private client: Resend;
  private from: string;
  private replyTo: string | undefined;

  constructor(apiKey: string, from: string, replyTo?: string) {
    this.client = new Resend(apiKey);
    this.from = from;
    this.replyTo = replyTo;
  }

  async send(msg: MailMessage): Promise<MailResult> {
    try {
      // Conditional spreads keep undefined off the payload (exactOptionalPropertyTypes).
      const { data, error } = await this.client.emails.send({
        from: this.from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
        ...(msg.headers ? { headers: msg.headers } : {}),
      });
      if (error) return { ok: false, error: error.message ?? String(error) };
      return { ok: true, id: data?.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

class NoopMailer implements Mailer {
  async send(msg: MailMessage): Promise<MailResult> {
    // eslint-disable-next-line no-console
    console.warn(`[mailer] RESEND_API_KEY not set — skipping email to ${msg.to}: "${msg.subject}"`);
    return { ok: false, skipped: true };
  }
}

let cached: Mailer | null = null;

export function createMailer(): Mailer {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  // Resend's shared onboarding sender works without domain verification (delivers
  // only to the account owner). Set ALERTS_FROM_EMAIL to a verified domain for prod.
  const from = process.env.ALERTS_FROM_EMAIL || "onboarding@resend.dev";
  const replyTo = process.env.ALERTS_REPLY_TO || undefined;
  cached = apiKey ? new ResendMailer(apiKey, from, replyTo) : new NoopMailer();
  return cached;
}
