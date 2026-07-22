/**
 * Minimal Gemini REST client (moved here from src/jobs/ai so BOTH the root batch
 * jobs and the Nitro API can import it — the pliego summarizer runs on both sides).
 *
 * Deliberately dependency-free (uses the global `fetch`, Node >=18) so it adds
 * nothing to install and stays trivially testable. It speaks the v1beta
 * generateContent endpoint with structured output (responseSchema), which is
 * all the callers need: a bounded classification/summary, not open chat.
 *
 * The API key is read by the caller from process.env and passed in — this module
 * never touches the environment, so it can be unit-tested with a stub key and a
 * mocked fetch.
 */

import { readSseData } from "./sse";

/** Gemini's Schema `type` enum is UPPERCASE (OpenAPI 3 proto). */
export type GeminiType = "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";

export interface GeminiSchema {
  type: GeminiType;
  description?: string;
  enum?: string[];
  format?: string;
  nullable?: boolean;
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  /** Gemini honours this to keep the JSON key order stable. */
  propertyOrdering?: string[];
}

export interface GeminiUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

export interface GeminiResult<T> {
  data: T;
  usage: GeminiUsage;
}

export interface GeminiCallOptions {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  /** Binary inputs supported by Gemini (for example, a scanned PDF). */
  inlineData?: Array<{ mimeType: string; data: string }> | undefined;
  schema: GeminiSchema;
  /** 0 keeps the classification deterministic run-to-run. */
  temperature?: number;
  /** Per-request wall-clock budget. */
  timeoutMs?: number;
  /** Attempts on 429 / 5xx / network error before giving up. */
  maxRetries?: number;
  /** Stream response fragments and treat each received chunk as activity. */
  stream?: boolean;
  onProgress?: ((receivedChars: number) => void) | undefined;
  /** Absolute ladder deadline; activity may renew inactivity, never this cap. */
  deadlineAtMs?: number | undefined;
}

/** Thrown when a Gemini request fails with a status. `retryDelayMs` carries the
 *  server's RetryInfo when present, so a rotator can tell a per-minute blip
 *  (short) from a daily-cap wall (long/absent) and bench the model accordingly. */
export class GeminiHttpError extends Error {
  readonly status: number;
  readonly retryDelayMs: number | null;
  constructor(status: number, message: string, retryDelayMs: number | null) {
    super(message);
    this.name = "GeminiHttpError";
    this.status = status;
    this.retryDelayMs = retryDelayMs;
  }
}

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Retryable: rate limit, and the transient server-side 5xx family. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Longest RetryInfo delay we will actually wait out. Beyond this a 429 is a daily-cap wall, not a
 *  per-minute blip — better to fail the request and let the next run pick it up than hang for hours. */
const MAX_HONORED_RETRY_MS = 65_000;

/**
 * A 429 body carries the server's own back-off in `error.details[].retryDelay` ("52s") — honouring it
 * is far more reliable than a blind exponential guess, especially on the free tier whose per-minute
 * window is ~60s. Returns the delay in ms, or null when absent.
 */
function parseRetryDelayMs(body: string): number | null {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (!match) return null;
  const ms = Math.ceil(Number.parseFloat(match[1]!) * 1000) + 500; // small cushion past the window edge
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One structured generateContent call. Resolves to the parsed object (validated
 * against `schema` server-side by Gemini) plus token usage, or throws after
 * exhausting retries. HTTP failures throw `GeminiHttpError`.
 */
export async function callGeminiStructured<T>(options: GeminiCallOptions): Promise<GeminiResult<T>> {
  const { apiKey, model, systemInstruction, prompt, inlineData = [], schema, temperature = 0, timeoutMs = 30_000, maxRetries = 4, stream = false, onProgress, deadlineAtMs } = options;

  if (!apiKey) {
    throw new Error("callGeminiStructured: missing apiKey");
  }

  const operation = stream ? "streamGenerateContent" : "generateContent";
  const query = stream ? `alt=sse&key=${encodeURIComponent(apiKey)}` : `key=${encodeURIComponent(apiKey)}`;
  const url = `${API_ROOT}/${encodeURIComponent(model)}:${operation}?${query}`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        ...inlineData.map(item => ({ inlineData: item })),
      ],
    }],
    generationConfig: {
      temperature,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const renewTimeout = (): void => {
      if (timer) clearTimeout(timer);
      const deadlineRemaining = deadlineAtMs === undefined ? timeoutMs : deadlineAtMs - Date.now();
      const delay = Math.max(1, Math.min(timeoutMs, deadlineRemaining));
      timer = setTimeout(() => controller.abort(), delay);
    };
    renewTimeout();

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const retryDelay = response.status === 429 ? parseRetryDelayMs(text) : null;
        if (isRetryableStatus(response.status) && attempt < maxRetries && (retryDelay === null || retryDelay <= MAX_HONORED_RETRY_MS)) {
          lastError = new GeminiHttpError(response.status, `Gemini ${response.status}: ${text.slice(0, 300)}`, retryDelay);
          // Prefer the server's own RetryInfo (429s carry it); fall back to exponential backoff with
          // a fixed jitter step (no Math.random — keeps runs reproducible).
          await sleep(retryDelay ?? Math.min(1000 * 2 ** attempt, 15_000) + attempt * 137);
          continue;
        }
        throw new GeminiHttpError(response.status, `Gemini ${response.status}: ${text.slice(0, 500)}`, retryDelay);
      }

      let json: GeminiRawResponse;
      let textPart = "";
      if (stream) {
        json = {};
        await readSseData(response, (data) => {
          if (data === "[DONE]") return;
          const chunk = JSON.parse(data) as GeminiRawResponse;
          const chunkText = chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
          textPart += chunkText;
          if (chunk.promptFeedback !== undefined) json.promptFeedback = chunk.promptFeedback;
          if (chunk.usageMetadata !== undefined) json.usageMetadata = chunk.usageMetadata;
          const finishReason = chunk.candidates?.[0]?.finishReason;
          if (finishReason) json.candidates = [{ finishReason }];
          try { onProgress?.(textPart.length); } catch { /* diagnostics must not break generation */ }
        }, () => renewTimeout());
      } else {
        json = (await response.json()) as GeminiRawResponse;
        textPart = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      }

      const blockReason = json.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error(`Gemini blocked the prompt: ${blockReason}`);
      }

      const candidate = json.candidates?.[0];
      const finish = candidate?.finishReason;
      // MAX_TOKENS still yields usable JSON sometimes, but SAFETY/RECITATION do not.
      if (finish && finish !== "STOP" && finish !== "MAX_TOKENS") {
        throw new Error(`Gemini finished with ${finish}`);
      }

      if (!textPart.trim()) {
        throw new Error("Gemini returned an empty response");
      }

      let parsed: T;
      try {
        parsed = JSON.parse(textPart) as T;
      } catch {
        throw new Error(`Gemini returned non-JSON despite responseSchema: ${textPart.slice(0, 300)}`);
      }

      const usageMeta = json.usageMetadata ?? {};
      return {
        data: parsed,
        usage: {
          promptTokens: usageMeta.promptTokenCount ?? 0,
          candidatesTokens: usageMeta.candidatesTokenCount ?? 0,
          totalTokens: usageMeta.totalTokenCount ?? 0,
        },
      };
    } catch (error) {
      const err = error as Error;
      // AbortError (timeout) and network errors are retryable too.
      const retryable = err.name === "AbortError" || err.name === "TypeError" || (err instanceof GeminiHttpError && isRetryableStatus(err.status));
      lastError = err;
      if (retryable && attempt < maxRetries) {
        await sleep(Math.min(1000 * 2 ** attempt, 15_000) + attempt * 137);
        continue;
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("callGeminiStructured: exhausted retries");
}

/** Per-1M-token USD pricing, so the job can report an estimated spend. */
export interface GeminiPricing {
  inputPerM: number;
  outputPerM: number;
}

/** Published Gemini 2.5 Flash-Lite pricing (USD / 1M tokens). Override via the job if it drifts. */
export const FLASH_LITE_PRICING: GeminiPricing = { inputPerM: 0.1, outputPerM: 0.4 };

export function estimateCostUsd(usage: GeminiUsage, pricing: GeminiPricing = FLASH_LITE_PRICING): number {
  return (usage.promptTokens / 1_000_000) * pricing.inputPerM + (usage.candidatesTokens / 1_000_000) * pricing.outputPerM;
}

// ---- Raw response shapes (only the fields we read) ----

interface GeminiRawResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
