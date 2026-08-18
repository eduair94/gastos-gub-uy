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
import { callClaudeAgentStructured, isClaudeAgentExhausted } from "./claude-agent-client";
import type { GeminiSchema, GeminiUsage } from "./gemini-client";
import { callGeminiStructured, GeminiHttpError } from "./gemini-client";
import { callGroqStructured, GroqHttpError } from "./groq-client";

export type Provider = "claude" | "gemini" | "groq";

export interface RotatorModel {
  provider: Provider;
  model: string;
}

export interface RotatorOptions {
  /** Base de `claude-agent-api`, por ejemplo `http://127.0.0.1:9310`. */
  claudeAgentUrl?: string | undefined;
  claudeAgentApiKey?: string | undefined;
  /** Ordered Claude model ids to try before Gemini. */
  claudeModels?: string[] | undefined;
  /** Reasoning effort for the Claude rung: `low` … `max`. */
  claudeEffort?: string | undefined;
  /**
   * Llamadas del día que el batch deja sin usar, para el Claude Code
   * interactivo del dueño. Al llegar al piso el escalón se banca y sigue Gemini.
   */
  claudeMinRemaining?: number | undefined;
  /** Wall-clock budget for one Claude call. A call takes 5-60s, not 5s. */
  claudeTimeoutMs?: number | undefined;
  geminiApiKey?: string | undefined;
  groqApiKey?: string | undefined;
  /** Ordered Gemini model ids to try first. */
  geminiModels?: string[] | undefined;
  /** Ordered Groq model ids to try after Gemini is exhausted. */
  groqModels?: string[] | undefined;
  /**
   * Set de bancados compartido entre varias instancias.
   *
   * Sirve para que la pared diaria de Claude valga en todo el proceso, aunque
   * cada job arme su propio rotator con otro modelo de Gemini. Omitido, cada
   * instancia lleva el suyo.
   */
  cooldown?: Set<string> | undefined;
}

export interface GenerateArgs {
  systemInstruction: string;
  prompt: string;
  /** Smaller provider-specific corpus for Groq free-tier TPM limits. */
  groqPrompt?: string | undefined;
  schema: GeminiSchema;
  temperature?: number | undefined;
  timeoutMs?: number | undefined;
  /** Retries inside each provider/model. Batch defaults stay unchanged. */
  maxRetriesPerModel?: number | undefined;
  /** Overall wall-clock budget across the full model ladder. */
  totalTimeoutMs?: number | undefined;
  /** Prefer provider SSE and report partial response activity. */
  stream?: boolean | undefined;
  onProgress?: ((progress: ModelGenerationProgress) => void) | undefined;
}

export interface ModelGenerationProgress {
  modelUsed: string;
  receivedChars: number;
}

export interface GenerateResult<T> {
  data: T;
  usage: GeminiUsage;
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
  "gemini-2.5-flash",
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

// El escalón Claude corre sobre la suscripción personal del servidor 104: 600
// llamadas por día, 2 concurrentes. Va PRIMERO porque da la mejor redacción, y
// al chocar la pared diaria el rotator lo banca y sigue con Gemini/Groq. Un solo
// modelo alcanza: los alias de abajo comparten la MISMA cuota, así que listar
// más no agranda el presupuesto — al revés de Gemini y Groq.
//
// El tope de 600 sale de medir: la demanda real es ~150 llamadas por día
// (~2,6 anomalías por corrida horaria más ~56 pliegos diarios). El resto es
// margen para picos y para drenar el atraso de pliegos.
const DEFAULT_CLAUDE_MODELS = ["sonnet"];

/** Una llamada al agente tarda entre 5 y 60 segundos. 45s corta demasiado pronto. */
const DEFAULT_CLAUDE_TIMEOUT_MS = 180_000;

/** Porción máxima de la ventana total que puede consumir el escalón Claude. */
const CLAUDE_BUDGET_SHARE = 0.6;

/** A back-off this long means a daily/quota wall, not a per-minute blip → bench the model. */
const DAILY_WALL_MS = 60_000;

function label(m: RotatorModel): string {
  return m.provider === "gemini" ? m.model : `${m.provider}:${m.model}`;
}

export class ProviderRotator {
  private readonly ladder: RotatorModel[] = [];
  private readonly claudeAgentUrl: string | undefined;
  private readonly claudeAgentApiKey: string | undefined;
  private readonly claudeEffort: string | undefined;
  private readonly claudeMinRemaining: number | undefined;
  private readonly claudeTimeoutMs: number;
  private readonly geminiApiKey: string | undefined;
  private readonly groqApiKey: string | undefined;
  private readonly cooldown: Set<string>;

  constructor(opts: RotatorOptions) {
    this.cooldown = opts.cooldown ?? new Set<string>();
    this.claudeAgentUrl = opts.claudeAgentUrl || undefined;
    this.claudeAgentApiKey = opts.claudeAgentApiKey || undefined;
    this.claudeEffort = opts.claudeEffort || undefined;
    this.claudeMinRemaining = opts.claudeMinRemaining ?? undefined;
    this.claudeTimeoutMs = opts.claudeTimeoutMs ?? DEFAULT_CLAUDE_TIMEOUT_MS;
    this.geminiApiKey = opts.geminiApiKey || undefined;
    this.groqApiKey = opts.groqApiKey || undefined;

    const claudeModels = (opts.claudeModels && opts.claudeModels.length ? opts.claudeModels : DEFAULT_CLAUDE_MODELS);
    const geminiModels = (opts.geminiModels && opts.geminiModels.length ? opts.geminiModels : DEFAULT_GEMINI_MODELS);
    const groqModels = (opts.groqModels && opts.groqModels.length ? opts.groqModels : DEFAULT_GROQ_MODELS);

    // Orden de la escalera: Claude, después Gemini, después Groq.
    if (this.claudeAgentUrl && this.claudeAgentApiKey) {
      for (const model of claudeModels) this.ladder.push({ provider: "claude", model });
    }
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
    const deadline = args.totalTimeoutMs === undefined ? null : Date.now() + args.totalTimeoutMs;

    for (const m of this.ladder) {
      const key = label(m);
      if (this.cooldown.has(key)) continue;
      const remainingMs = deadline === null ? null : deadline - Date.now();
      if (remainingMs !== null && remainingMs <= 0) break;
      const requestTimeoutMs = remainingMs === null
        ? args.timeoutMs
        : Math.max(1, Math.min(args.timeoutMs ?? 45_000, remainingMs));
      // El agente Claude tarda entre 5 y 60 segundos. El timeout por defecto de
      // los otros escalones (45s) lo cortaría a mitad de camino y gastaría la
      // cuota igual, así que este escalón usa su propio presupuesto.
      //
      // Pero no puede quedarse con toda la ventana. Si tarda y después falla,
      // los escalones de abajo tienen que llegar a tiempo: el resumen de pliego
      // interactivo corre con 180s totales y sin esto un Claude lento devuelve
      // un error donde antes devolvía un resumen de Gemini. Se le da como mucho
      // el 60% de lo que queda, salvo que sea el único escalón vivo.
      const hasFallback = this.ladder.some((x) => x.provider !== "claude" && !this.cooldown.has(label(x)));
      const claudeTimeoutMs = remainingMs === null
        ? this.claudeTimeoutMs
        : Math.max(1, Math.min(this.claudeTimeoutMs, Math.floor(remainingMs * (hasFallback ? CLAUDE_BUDGET_SHARE : 1))));

      try {
        const onProgress = (receivedChars: number): void => {
          try { args.onProgress?.({ modelUsed: key, receivedChars }); } catch { /* diagnostics only */ }
        };
        onProgress(0);
        if (m.provider === "claude") {
          const { data, usage } = await callClaudeAgentStructured<T>({
            baseUrl: this.claudeAgentUrl!,
            apiKey: this.claudeAgentApiKey!,
            model: m.model,
            systemInstruction: args.systemInstruction,
            prompt: args.prompt,
            schema: args.schema,
            timeoutMs: claudeTimeoutMs,
            onProgress,
            ...(this.claudeEffort === undefined ? {} : { effort: this.claudeEffort }),
            ...(this.claudeMinRemaining === undefined ? {} : { minRemaining: this.claudeMinRemaining }),
            ...(deadline === null ? {} : { deadlineAtMs: deadline }),
          });
          return { data, modelUsed: key, usage };
        } else if (m.provider === "gemini") {
          const { data, usage } = await callGeminiStructured<T>({
            apiKey: this.geminiApiKey!,
            model: m.model,
            systemInstruction: args.systemInstruction,
            prompt: args.prompt,
            schema: args.schema,
            temperature: args.temperature ?? 0,
            timeoutMs: requestTimeoutMs ?? 45_000,
            stream: args.stream ?? false,
            onProgress,
            ...(deadline === null ? {} : { deadlineAtMs: deadline }),
            ...(args.maxRetriesPerModel === undefined ? {} : { maxRetries: args.maxRetriesPerModel }),
          });
          return { data, modelUsed: key, usage };
        } else {
          const { data, usage } = await callGroqStructured<T>({
            apiKey: this.groqApiKey!,
            model: m.model,
            systemInstruction: args.systemInstruction,
            prompt: args.groqPrompt ?? args.prompt,
            schema: args.schema,
            temperature: args.temperature ?? 0,
            timeoutMs: requestTimeoutMs ?? 45_000,
            stream: args.stream ?? false,
            onProgress,
            ...(deadline === null ? {} : { deadlineAtMs: deadline }),
            ...(args.maxRetriesPerModel === undefined ? {} : { maxRetries: args.maxRetriesPerModel }),
          });
          return { data, modelUsed: key, usage };
        }
      } catch (error) {
        const err = error as Error;
        lastError = err;
        if (isHardRateLimit(err)) this.cooldown.add(key);
        // else: transient/other per-model failure — just try the next model.
      }
    }

    throw lastError ?? new Error("ProviderRotator: model ladder exceeded its total time budget");
  }
}

/**
 * Lee el escalón Claude del entorno.
 *
 * Devuelve un objeto vacío cuando falta la clave. Así la escalera arranca en
 * Gemini y ningún job se rompe en una máquina sin el túnel al servidor 104.
 * Spread el resultado dentro de las `RotatorOptions` del job.
 */
export function claudeRungFromEnv(): RotatorOptions {
  const claudeAgentApiKey = process.env.CLAUDE_AGENT_API_KEY?.trim();
  if (!claudeAgentApiKey) return {};

  const claudeModels = csvEnv(process.env.CLAUDE_AGENT_MODELS);
  const timeoutRaw = Number.parseInt(process.env.CLAUDE_AGENT_TIMEOUT_MS ?? "", 10);
  const minRemaining = Number.parseInt(process.env.CLAUDE_AGENT_MIN_REMAINING ?? "", 10);

  return {
    claudeAgentUrl: process.env.CLAUDE_AGENT_URL?.trim() || "http://127.0.0.1:9310",
    claudeAgentApiKey,
    ...(claudeModels.length ? { claudeModels } : {}),
    ...(process.env.CLAUDE_AGENT_EFFORT?.trim() ? { claudeEffort: process.env.CLAUDE_AGENT_EFFORT.trim() } : {}),
    ...(Number.isFinite(minRemaining) && minRemaining > 0 ? { claudeMinRemaining: minRemaining } : {}),
    ...(Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? { claudeTimeoutMs: timeoutRaw } : {}),
  };
}

function csvEnv(value: string | undefined): string[] {
  return (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** A 429 (or a 429 whose server back-off is a daily wall) means the model is out of budget. */
function isHardRateLimit(err: Error): boolean {
  // El agente Claude no manda back-off. Su propio módulo decide qué código
  // agota el escalón: la pared diaria y las dos formas de cola llena.
  if (isClaudeAgentExhausted(err)) return true;
  if (err instanceof GeminiHttpError || err instanceof GroqHttpError) {
    if (err.status !== 429) return false;
    // No back-off info, or a long one → daily/quota wall → bench it.
    return err.retryDelayMs === null || err.retryDelayMs >= DAILY_WALL_MS;
  }
  return false;
}
