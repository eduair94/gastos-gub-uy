/**
 * Web Push transport (VAPID). `web-push` behind a small interface so the jobs stay
 * testable and, exactly like the mailer, it degrades to a no-op when the VAPID keys
 * are not configured — dev runs never crash and no push is attempted.
 */
import webpush from "web-push";

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushResult {
  ok: boolean;
  skipped?: boolean;
  /** The subscription is dead (404/410) — the caller should deactivate it. */
  gone?: boolean;
  statusCode?: number;
  error?: string;
}

export interface Pusher {
  send(target: PushTarget, payload: string): Promise<PushResult>;
}

class VapidPusher implements Pusher {
  constructor(publicKey: string, privateKey: string, subject: string) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(target: PushTarget, payload: string): Promise<PushResult> {
    try {
      const res = await webpush.sendNotification(
        { endpoint: target.endpoint, keys: target.keys },
        payload,
        { TTL: 60 * 60 * 24 }, // a llamado alert is worth a day of retries, not more
      );
      return { ok: true, statusCode: res.statusCode };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      const gone = status === 404 || status === 410;
      return {
        ok: false,
        gone,
        ...(status !== undefined ? { statusCode: status } : {}),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

class NoopPusher implements Pusher {
  async send(target: PushTarget): Promise<PushResult> {
    // eslint-disable-next-line no-console
    console.warn(`[webpush] VAPID keys not set — skipping push to ${target.endpoint.slice(0, 48)}…`);
    return { ok: false, skipped: true };
  }
}

let cached: Pusher | null = null;

export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function createPusher(): Pusher {
  if (cached) return cached;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:alertas@gastos.gub.uy";
  cached = publicKey && privateKey ? new VapidPusher(publicKey, privateKey, subject) : new NoopPusher();
  return cached;
}
