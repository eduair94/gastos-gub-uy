/**
 * ProviderRotator — an ordered ladder of free-tier models across providers.
 *
 * Free-tier rate limits (RPM/TPM/RPD) are enforced PER MODEL PER PROJECT, not as
 * one shared pool for the whole key — on Gemini and on Groq alike. So rotating
 * across models multiplies the effective daily budget. This walks a ladder
 * (Gemini models first, then Groq), and when a model returns a hard rate-limit
 * (a 429 whose back-off is a daily wall, not a per-minute blip) it benches that
 * model for the rest of the process run and advances to the next. A single
 * rotator instance shared across many summaries keeps that cooldown between them.
 */
import type { GeminiSchema } from "./gemini-client";
import { callGeminiStructured, GeminiHttpError } from "./gemini-client";
import { callGroqStructured, GroqHttpError } from "./groq-client";

export type Provider = "gemini" | "groq";

export interface RotatorModel {
  provider: Provider;
  model: string;
}

export interface RotatorOptions {
  geminiApiKey?: string | undefined;
  groqApiKey?: string | undefined;
  /** Ordered Gemini model ids to try first. */
  geminiModels?: string[] | undefined;
  /** Ordered Groq model ids to try after Gemini is exhausted. */
  groqModels?: string[] | undefined;
}

export interface GenerateArgs {
  systemInstruction: string;
  prompt: string;
  schema: GeminiSchema;
  temperature?: number | undefined;
  timeoutMs?: number | undefined;
}

export interface GenerateResult<T> {
  data: T;
  /** Traceable label of the model that produced it, e.g. "gemini-3.0-flash-lite"
   *  or "groq:llama-3.3-70b-versatile". Stored on the summary. */
  modelUsed: string;
}

// All free-tier Gemini text models available to the key (ListModels-verified,
// 2026-07-21), ordered by daily-quota headroom: lite first (cheapest/highest RPD),
// then flash, then pro (best quality, lowest free RPD) as the last Gemini resort.
// Each id is a SEPARATE per-model-per-project free quota, so listing more = more
// total daily budget. gemini-3.0-flash-lite is intentionally absent — it 404s
// (not GA under that id); add it back here when it lists for the key.
const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-pro",
];
// Free-tier Groq chat models (ListModels-verified for the key, 2026-07-21),
// ordered best-quality first, 8b-instant last as the fast fallback. All have a
// 131k context (fits a pliego) and support response_format json_object. Excluded:
// allam-2-7b (4k ctx — too small for a pliego), orpheus/whisper/tts (audio), and
// groq/compound* (agentic tool-use systems, not plain structured chat). Each id
// is its own free quota, so this widens the daily budget after Gemini.
const DEFAULT_GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
  "llama-3.1-8b-instant",
];

/** A back-off this long means a daily/quota wall, not a per-minute blip → bench the model. */
const DAILY_WALL_MS = 60_000;

function label(m: RotatorModel): string {
  return m.provider === "groq" ? `groq:${m.model}` : m.model;
}

export class ProviderRotator {
  private readonly ladder: RotatorModel[] = [];
  private readonly geminiApiKey: string | undefined;
  private readonly groqApiKey: string | undefined;
  private readonly cooldown = new Set<string>();

  constructor(opts: RotatorOptions) {
    this.geminiApiKey = opts.geminiApiKey || undefined;
    this.groqApiKey = opts.groqApiKey || undefined;

    const geminiModels = (opts.geminiModels && opts.geminiModels.length ? opts.geminiModels : DEFAULT_GEMINI_MODELS);
    const groqModels = (opts.groqModels && opts.groqModels.length ? opts.groqModels : DEFAULT_GROQ_MODELS);

    if (this.geminiApiKey) for (const model of geminiModels) this.ladder.push({ provider: "gemini", model });
    if (this.groqApiKey) for (const model of groqModels) this.ladder.push({ provider: "groq", model });
  }

  /** True when at least one usable provider/model is configured. */
  get available(): boolean {
    return this.ladder.length > 0;
  }

  /** Model ids currently benched for the rest of this run (diagnostics/tests). */
  get benched(): string[] {
    return [...this.cooldown];
  }

  /**
   * Walk the ladder (skipping benched models) and return the first structured
   * result. A hard rate-limit benches the model for the rest of the run; any
   * other per-model failure just advances to the next. Throws only when the
   * whole ladder is exhausted.
   */
  async generateStructured<T>(args: GenerateArgs): Promise<GenerateResult<T>> {
    if (!this.available) throw new Error("ProviderRotator: no providers configured");

    let lastError: Error | null = null;

    for (const m of this.ladder) {
      const key = label(m);
      if (this.cooldown.has(key)) continue;

      try {
        if (m.provider === "gemini") {
          const { data } = await callGeminiStructured<T>({
            apiKey: this.geminiApiKey!,
            model: m.model,
            systemInstruction: args.systemInstruction,
            prompt: args.prompt,
            schema: args.schema,
            temperature: args.temperature ?? 0,
            timeoutMs: args.timeoutMs ?? 45_000,
          });
          return { data, modelUsed: key };
        } else {
          const { data } = await callGroqStructured<T>({
            apiKey: this.groqApiKey!,
            model: m.model,
            systemInstruction: args.systemInstruction,
            prompt: args.prompt,
            schema: args.schema,
            temperature: args.temperature ?? 0,
            timeoutMs: args.timeoutMs ?? 45_000,
          });
          return { data, modelUsed: key };
        }
      } catch (error) {
        const err = error as Error;
        lastError = err;
        if (isHardRateLimit(err)) this.cooldown.add(key);
        // else: transient/other per-model failure — just try the next model.
      }
    }

    throw lastError ?? new Error("ProviderRotator: ladder exhausted with no error");
  }
}

/** A 429 (or a 429 whose server back-off is a daily wall) means the model is out of budget. */
function isHardRateLimit(err: Error): boolean {
  if (err instanceof GeminiHttpError || err instanceof GroqHttpError) {
    if (err.status !== 429) return false;
    // No back-off info, or a long one → daily/quota wall → bench it.
    return err.retryDelayMs === null || err.retryDelayMs >= DAILY_WALL_MS;
  }
  return false;
}
