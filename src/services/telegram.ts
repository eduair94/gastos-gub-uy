/**
 * Telegram Bot API transport. Uses the HTTP API via global fetch (Node 18+), so
 * no SDK dependency. Like the mailer/pusher it degrades to a no-op when
 * TELEGRAM_BOT_TOKEN is absent, so dev runs never crash.
 */

export interface TelegramButton {
  text: string;
  url: string;
}

export interface TelegramMessage {
  chatId: string;
  /** HTML (parse_mode: HTML). */
  html: string;
  buttons?: TelegramButton[];
}

export interface TelegramResult {
  ok: boolean;
  skipped?: boolean;
  /** The user blocked the bot (403) — the caller should deactivate the link. */
  blocked?: boolean;
  statusCode?: number;
  error?: string;
}

export interface Telegram {
  sendMessage(msg: TelegramMessage): Promise<TelegramResult>;
}

const API = "https://api.telegram.org";

class BotTelegram implements Telegram {
  constructor(private token: string) {}

  async sendMessage(msg: TelegramMessage): Promise<TelegramResult> {
    try {
      const body: Record<string, unknown> = {
        chat_id: msg.chatId,
        text: msg.html,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      };
      if (msg.buttons?.length) {
        body.reply_markup = { inline_keyboard: [msg.buttons.map(b => ({ text: b.text, url: b.url }))] };
      }
      const res = await fetch(`${API}/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true, statusCode: res.status };
      const blocked = res.status === 403;
      let error = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { description?: string };
        if (j.description) error = j.description;
      } catch {
        // non-JSON error body — keep the status code
      }
      return { ok: false, blocked, statusCode: res.status, error };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

class NoopTelegram implements Telegram {
  async sendMessage(msg: TelegramMessage): Promise<TelegramResult> {
    // eslint-disable-next-line no-console
    console.warn(`[telegram] TELEGRAM_BOT_TOKEN not set — skipping message to chat ${msg.chatId}`);
    return { ok: false, skipped: true };
  }
}

let cached: Telegram | null = null;

export function isTelegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export function createTelegram(): Telegram {
  if (cached) return cached;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  cached = token ? new BotTelegram(token) : new NoopTelegram();
  return cached;
}
