import nodemailer from "nodemailer";
import type { Mailer, MailMessage, MailResult } from "./mailer";

/**
 * Cold-outreach transport — nodemailer over SMTP (Brevo), kept SEPARATE from the
 * transactional Resend mailer (`./mailer`) so the campaign never touches the
 * Resend account. nodemailer is the library, not the provider: the SMTP backend
 * is swappable by env alone. No-op (skipped) when COLD_SMTP_* is unset, so dev
 * runs never crash — same contract as createMailer().
 */
export class ColdMailer implements Mailer {
  constructor(private transport: nodemailer.Transporter, private from: string, private replyTo?: string) {}
  async send(msg: MailMessage): Promise<MailResult> {
    try {
      const info = await this.transport.sendMail({
        from: this.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
        ...(msg.headers ? { headers: msg.headers } : {}),
      });
      return { ok: true, id: info.messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

class NoopColdMailer implements Mailer {
  async send(msg: MailMessage): Promise<MailResult> {
    // eslint-disable-next-line no-console
    console.warn(`[cold-mailer] COLD_SMTP_* not set — skipping cold email to ${msg.to}: "${msg.subject}"`);
    return { ok: false, skipped: true };
  }
}

let cached: Mailer | null = null;

export function createColdMailer(): Mailer {
  if (cached) return cached;
  const host = process.env.COLD_SMTP_HOST, user = process.env.COLD_SMTP_USER, pass = process.env.COLD_SMTP_PASS;
  const from = process.env.COLD_SMTP_FROM, replyTo = process.env.COLD_SMTP_REPLY_TO || undefined;
  const port = Number(process.env.COLD_SMTP_PORT ?? "587");
  if (!host || !user || !pass || !from) { cached = new NoopColdMailer(); return cached; }
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  cached = new ColdMailer(transport, from, replyTo);
  return cached;
}
