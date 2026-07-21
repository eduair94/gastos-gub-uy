/**
 * Minimal Groq client (OpenAI-compatible chat/completions), dependency-free.
 *
 * Used as the free-tier fallback/rotation partner for Gemini in the pliego
 * summarizer. To stay portable across the whole model ladder (some Groq models
 * support `json_schema` structured outputs, others only `json_object`), this
 * uses `response_format: { type: "json_object" }` and embeds the JSON Schema in
 * the system prompt, then validates the required top-level keys after parsing.
 * That works on every Groq model, which is what a rotation ladder needs.
 */
import type { GeminiSchema } from "./gemini-client";
import { geminiToJsonSchema, requiredKeys } from "./json-schema";

export interface GroqUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

export interface GroqResult<T> {
  data: T;
  usage: GroqUsage;
}

export interface GroqCallOptions {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  /** The SAME GeminiSchema the Gemini path uses — converted internally. */
  schema: GeminiSchema;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export class GroqHttpError extends Error {
  readonly status: number;
  readonly retryDelayMs: number | null;
  constructor(status: number, message: string, retryDelayMs: number | null) {
    super(message);
    this.name = "GroqHttpError";
    this.status = status;
    this.retryDelayMs = retryDelayMs;
  }
}

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_HONORED_RETRY_MS = 65_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Groq sends its back-off in the `Retry-After` header (seconds) on 429. */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const secs = Number.parseFloat(header);
  if (!Number.isFinite(secs) || secs <= 0) return null;
  return Math.ceil(secs * 1000) + 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callGroqStructured<T>(options: GroqCallOptions): Promise<GroqResult<T>> {
  const { apiKey, model, systemInstruction, prompt, schema, temperature = 0, timeoutMs = 45_000, maxRetries = 3 } = options;

  if (!apiKey) throw new Error("callGroqStructured: missing apiKey");

  const jsonSchema = geminiToJsonSchema(schema);
  const system =
    `${systemInstruction}\n\n`
    + "Respondé EXCLUSIVAMENTE con un único objeto JSON válido que cumpla este JSON Schema. "
    + "No incluyas texto, comentarios ni markdown fuera del JSON.\n"
    + `JSON Schema:\n${JSON.stringify(jsonSchema)}`;

  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    temperature,
    response_format: { type: "json_object" as const },
  };

  const needed = requiredKeys(schema);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const retryDelay = response.status === 429 ? parseRetryAfterMs(response.headers.get("retry-after")) : null;
        if (isRetryableStatus(response.status) && attempt < maxRetries && (retryDelay === null || retryDelay <= MAX_HONORED_RETRY_MS)) {
          lastError = new GroqHttpError(response.status, `Groq ${response.status}: ${text.slice(0, 300)}`, retryDelay);
          await sleep(retryDelay ?? Math.min(1000 * 2 ** attempt, 15_000) + attempt * 137);
          continue;
        }
        throw new GroqHttpError(response.status, `Groq ${response.status}: ${text.slice(0, 500)}`, retryDelay);
      }

      const json = (await response.json()) as GroqRawResponse;
      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) throw new Error("Groq returned an empty response");

      let parsed: T;
      try {
        parsed = JSON.parse(content) as T;
      } catch {
        throw new Error(`Groq returned non-JSON despite json_object: ${content.slice(0, 300)}`);
      }

      // json_object guarantees valid JSON, not schema adherence — enforce the required keys
      // so a malformed response triggers rotation to the next model instead of caching garbage.
      const obj = parsed as Record<string, unknown>;
      const missing = needed.filter((k) => obj[k] === undefined || obj[k] === null);
      if (missing.length) {
        throw new Error(`Groq response missing required keys: ${missing.join(", ")}`);
      }

      const usage = json.usage ?? {};
      return {
        data: parsed,
        usage: {
          promptTokens: usage.prompt_tokens ?? 0,
          candidatesTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        },
      };
    } catch (error) {
      const err = error as Error;
      const retryable = err.name === "AbortError" || err.name === "TypeError" || (err instanceof GroqHttpError && isRetryableStatus(err.status));
      lastError = err;
      if (retryable && attempt < maxRetries) {
        await sleep(Math.min(1000 * 2 ** attempt, 15_000) + attempt * 137);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("callGroqStructured: exhausted retries");
}

interface GroqRawResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}
