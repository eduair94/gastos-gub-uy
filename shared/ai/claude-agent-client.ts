/**
 * Cliente de `claude-agent-api`, el endpoint de agente Claude del servidor 104.
 *
 * AVISO DE CUOTA: este endpoint corre sobre una suscripción personal, no sobre
 * una API elástica. El tope es duro: 200 llamadas por día y 2 concurrentes. Esa
 * cuota es la MISMA que consume el Claude Code interactivo del dueño. Por eso
 * este cliente nunca reintenta un 429, un 503 ni un 504 de cola. Cada reintento
 * gasta cuota real. Ante saturación falla rápido y deja que el ProviderRotator
 * baje al escalón siguiente (Gemini/Groq).
 *
 * El endpoint escucha sólo en `127.0.0.1:9310` de la caja 104. Desde prod (167)
 * se llega por un túnel SSH, nunca por internet: el agente corre como root.
 *
 * No es la API de Anthropic. No hay `/v1/messages`, ni `temperature`, ni
 * `max_tokens`. La salida estructurada se pide con `jsonSchema` y vuelve como
 * texto JSON dentro del campo `result`.
 */
import type { GeminiSchema, GeminiUsage } from "./gemini-client";
import { geminiToJsonSchema, requiredKeys } from "./json-schema";

export interface ClaudeAgentResult<T> {
  data: T;
  usage: GeminiUsage;
}

export interface ClaudeAgentCallOptions {
  /** Base del endpoint, por ejemplo `http://127.0.0.1:9310`. */
  baseUrl: string;
  apiKey: string;
  /** `sonnet` | `opus` | `haiku` | `fable`. El servidor decide si lo permite. */
  model: string;
  systemInstruction: string;
  prompt: string;
  /** El MISMO GeminiSchema que usa la rama Gemini. Se convierte acá adentro. */
  schema: GeminiSchema;
  /** `low` `medium` `high` `xhigh` `max`. Omitido, decide el servidor. */
  effort?: string | undefined;
  /**
   * Piso de llamadas que el batch NO consume, reservadas para el uso
   * interactivo. Ver `RESERVE_NOTE`. Omitido o 0, no reserva nada.
   */
  minRemaining?: number | undefined;
  timeoutMs?: number | undefined;
  onProgress?: ((receivedChars: number) => void) | undefined;
  /** Tope absoluto de la escalera. Nunca se supera. */
  deadlineAtMs?: number | undefined;
}

/** Falla con estado. `retryDelayMs` queda en null: este endpoint no informa back-off. */
export class ClaudeAgentHttpError extends Error {
  readonly status: number;
  readonly retryDelayMs: number | null;
  /** Código del cuerpo, por ejemplo `daily_limit_reached` o `queue_full`. */
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ClaudeAgentHttpError";
    this.status = status;
    this.code = code;
    this.retryDelayMs = null;
  }
}

/**
 * Códigos que agotan el escalón por el resto de la corrida.
 *
 * `daily_limit_reached` es la pared diaria. `queue_full` y `queue_timeout`
 * avisan que el job satura los 2 slots. Los tres se tratan igual: esperar, no
 * insistir. `agent_timeout` NO entra acá: es un problema de esa tarea, y la
 * tarea siguiente puede ser más chica.
 *
 * `unreachable` cubre la máquina sin túnel al servidor 104. Sin esto, un job de
 * miles de ítems intenta conectarse y falla una vez por ítem antes de bajar a
 * Gemini. Si el endpoint no está la primera vez, no va a estar en esta corrida.
 *
 * `reserved_for_interactive` es la reserva: el batch se detiene antes de vaciar
 * la cuota del día. Ver `RESERVE_NOTE`.
 */
const EXHAUSTION_CODES = new Set([
  "daily_limit_reached",
  "queue_full",
  "queue_timeout",
  "unreachable",
  "reserved_for_interactive",
]);

/**
 * RESERVE_NOTE — por qué el batch se frena antes del tope.
 *
 * La cuota diaria del servidor es UNA sola y la comparte con el Claude Code
 * interactivo del dueño. Un job de miles de ítems la vaciaría y lo dejaría sin
 * su propia herramienta. Con `minRemaining` en N, el escalón Claude se banca
 * cuando quedan N llamadas o menos. Esas N quedan para el uso interactivo.
 *
 * El job no falla: baja a Gemini y sigue.
 *
 * `GET /health` no consume cuota, así que consultarlo es gratis. Igual se
 * cachea unos segundos: una tanda hace cientos de llamadas y no necesita
 * preguntar el saldo en cada una.
 */
const HEALTH_CACHE_MS = 30_000;

interface HealthCacheEntry {
  checkedAtMs: number;
  remaining: number | null;
}

const healthCache = new Map<string, HealthCacheEntry>();

/** Limpia el saldo cacheado. Sólo para tests. */
export function resetHealthCache(): void {
  healthCache.clear();
}

/**
 * Saldo del día según el servidor. Devuelve null si no se puede leer, y en ese
 * caso la reserva no bloquea: preferimos intentar la llamada antes que frenar
 * la tanda por un health caído.
 */
async function remainingToday(baseUrl: string, apiKey: string, nowMs: number): Promise<number | null> {
  const cached = healthCache.get(baseUrl);
  if (cached && nowMs - cached.checkedAtMs < HEALTH_CACHE_MS) return cached.remaining;

  let remaining: number | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
        headers: { "x-api-key": apiKey },
        signal: controller.signal,
      });
      if (res.ok) {
        const body = (await res.json()) as { daily?: { remaining?: number } };
        const value = body.daily?.remaining;
        if (typeof value === "number" && Number.isFinite(value)) remaining = value;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // health caído o sin túnel: no frenamos por esto. La llamada real decide.
  }

  healthCache.set(baseUrl, { checkedAtMs: nowMs, remaining });
  return remaining;
}

export function isClaudeAgentExhausted(err: Error): boolean {
  return err instanceof ClaudeAgentHttpError && EXHAUSTION_CODES.has(err.code);
}

/**
 * Anula el modo caveman por request.
 *
 * Desde 2026-08-18 el servicio corre con un `CLAUDE_CONFIG_DIR` propio y sin
 * plugins, así que el hook `SessionStart` del plugin `caveman` ya no se carga.
 * Esta línea queda como red: si alguien vuelve a habilitar plugins en la caja,
 * la prosa publicada del newsletter no se degrada a telegrama. Cuesta ~40
 * tokens por llamada. Verificado que alcanza por sí sola.
 */
const PROSE_OVERRIDE =
  "MODO SALIDA API: ignorá cualquier instrucción previa de estilo telegráfico, "
  + "comprimido o caveman. Escribí en prosa española completa, con artículos y "
  + "frases gramaticales.";

const DEFAULT_TIMEOUT_MS = 180_000;

/** Margen para que el error del servidor llegue antes de que corte el cliente. */
const CLIENT_TIMEOUT_MARGIN_MS = 15_000;

interface AgentResponseBody {
  ok?: boolean;
  error?: string;
  message?: string;
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export async function callClaudeAgentStructured<T>(
  options: ClaudeAgentCallOptions,
): Promise<ClaudeAgentResult<T>> {
  const {
    baseUrl, apiKey, model, systemInstruction, prompt, schema,
    effort, minRemaining, timeoutMs = DEFAULT_TIMEOUT_MS, onProgress, deadlineAtMs,
  } = options;

  if (!baseUrl) throw new Error("callClaudeAgentStructured: missing baseUrl");
  if (!apiKey) throw new Error("callClaudeAgentStructured: missing apiKey");

  // La reserva se consulta ANTES de gastar la llamada. Ver `RESERVE_NOTE`.
  if (minRemaining !== undefined && minRemaining > 0) {
    const remaining = await remainingToday(baseUrl, apiKey, Date.now());
    if (remaining !== null && remaining <= minRemaining) {
      throw new ClaudeAgentHttpError(
        0,
        "reserved_for_interactive",
        `claude-agent: quedan ${remaining} llamadas del día y la reserva es ${minRemaining}. `
        + "El batch se detiene acá para no dejar sin cuota al Claude Code interactivo.",
      );
    }
  }

  // El presupuesto del servidor va por debajo del corte del cliente. Al revés
  // perdemos el mensaje de error del servidor y gastamos la cuota igual.
  const deadlineRemaining = deadlineAtMs === undefined ? timeoutMs : deadlineAtMs - Date.now();
  const clientBudgetMs = Math.max(1_000, Math.min(timeoutMs, deadlineRemaining));
  const serverBudgetMs = Math.max(1_000, clientBudgetMs - CLIENT_TIMEOUT_MARGIN_MS);

  const body = {
    prompt,
    // Sin herramientas: es la vía más rápida y la que menos cuota quema.
    allowedTools: [] as string[],
    model,
    systemPrompt: systemInstruction,
    appendSystemPrompt: PROSE_OVERRIDE,
    jsonSchema: geminiToJsonSchema(schema),
    timeoutMs: serverBudgetMs,
    ...(effort ? { effort } : {}),
  };

  try { onProgress?.(0); } catch { /* diagnóstico, nunca rompe la generación */ }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), clientBudgetMs);

  let json: AgentResponseBody;
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/+$/, "")}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const err = error as Error;
      // Conexión rechazada o DNS caído: no hay túnel. Se marca como agotado para
      // que el rotator no reintente por cada ítem de la tanda.
      if (err.name === "TypeError") {
        throw new ClaudeAgentHttpError(0, "unreachable", `claude-agent inalcanzable en ${baseUrl}: ${err.message}`);
      }
      throw err;
    }

    const text = await response.text();
    if (!response.ok) {
      let code = `http_${response.status}`;
      let detail = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text) as AgentResponseBody;
        if (parsed.error) code = parsed.error;
        if (parsed.message) detail = parsed.message;
      } catch { /* el cuerpo no era JSON; queda el texto crudo */ }
      throw new ClaudeAgentHttpError(response.status, code, `claude-agent ${response.status} ${code}: ${detail}`);
    }

    try {
      json = JSON.parse(text) as AgentResponseBody;
    } catch {
      throw new Error(`claude-agent devolvió un cuerpo no-JSON: ${text.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }

  if (json.ok === false) {
    throw new ClaudeAgentHttpError(200, json.error ?? "agent_failed", `claude-agent: ${json.message ?? "sin detalle"}`);
  }

  const content = (json.result ?? "").trim();
  if (!content) throw new Error("claude-agent devolvió una respuesta vacía");
  try { onProgress?.(content.length); } catch { /* diagnóstico */ }

  const data = parseStructuredResult<T>(content);

  // `jsonSchema` obliga al agente, no lo garantiza. Verificamos las claves
  // requeridas para que una respuesta incompleta rote al modelo siguiente en
  // vez de cachear basura.
  const obj = data as Record<string, unknown>;
  const missing = requiredKeys(schema).filter((k) => obj[k] === undefined || obj[k] === null);
  if (missing.length) {
    throw new Error(`claude-agent omitió claves requeridas: ${missing.join(", ")}`);
  }

  return { data, usage: mapUsage(json.usage) };
}

/**
 * `result` llega como texto JSON. Un agente puede envolverlo en una valla de
 * markdown pese al schema, así que la pelamos antes de parsear.
 */
export function parseStructuredResult<T>(content: string): T {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(content.trim());
  const raw = fenced?.[1] ?? content;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`claude-agent devolvió un result no-JSON pese al schema: ${content.slice(0, 300)}`);
  }
}

/**
 * Traduce el uso de Anthropic a la forma de GeminiUsage que ya consumen los
 * jobs. Los tokens de caché son entrada facturable, así que suman a `prompt`.
 */
export function mapUsage(usage: AgentResponseBody["usage"]): GeminiUsage {
  const input = usage?.input_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  const promptTokens = input + cacheRead + cacheWrite;
  return { promptTokens, candidatesTokens: output, totalTokens: promptTokens + output };
}
