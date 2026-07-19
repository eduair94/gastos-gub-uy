import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless Telegram account-linking token: `<uidB64>.<expEpochSec>.<sigB64url>`.
// The app issues it (signed with TELEGRAM_LINK_SECRET) and embeds it in the
// t.me/<bot>?start=<token> deep link; the bot webhook verifies it and writes the
// chatId. No DB row needed — the signature + expiry are the whole contract.
// Telegram's `/start` payload allows [A-Za-z0-9_-] only, so base64url is safe.

const DEFAULT_TTL_SEC = 15 * 60; // 15 minutes

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function unb64url(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}
function sign(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Issue a linking token for `uid`, valid for `ttlSec` seconds. */
export function createLinkToken(uid: string, secret: string, ttlSec: number = DEFAULT_TTL_SEC, now: Date = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + ttlSec;
  const uidB64 = b64url(uid);
  const body = `${uidB64}.${exp}`;
  return `${body}.${sign(secret, body)}`;
}

/** Verify a linking token → the uid, or null if malformed/expired/tampered. */
export function verifyLinkToken(token: string, secret: string, now: Date = new Date()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [uidB64, expStr, sig] = parts as [string, string, string];
  const body = `${uidB64}.${expStr}`;
  const expected = sign(secret, body);
  // Constant-time compare; lengths must match first (timingSafeEqual throws otherwise).
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(now.getTime() / 1000)) return null;
  try {
    return unb64url(uidB64);
  } catch {
    return null;
  }
}
