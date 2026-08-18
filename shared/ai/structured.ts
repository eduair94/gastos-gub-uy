/**
 * `callStructured` — reemplazo directo de `callGeminiStructured` que antepone
 * el escalón Claude del servidor 104.
 *
 * Existe para que los jobs que llaman a Gemini de forma directa ganen la
 * escalera sin reescribir su lógica. La firma y el retorno son los de
 * `callGeminiStructured`, así que en cada sitio se cambia un identificador.
 *
 * Qué agrega:
 * 1. Prueba Claude primero. Al chocar la pared diaria de 200 llamadas, banca ese
 *    escalón y sigue con el mismo modelo de Gemini que el job pedía.
 * 2. El bancado es de todo el proceso. Un `Set` compartido evita que cada job
 *    vuelva a gastar una llamada para redescubrir que la cuota se acabó.
 *
 * Qué NO cambia: si Claude no está configurado, o ya está bancado, el
 * comportamiento es el mismo de antes, con el mismo modelo y el mismo error.
 */
import type { GeminiCallOptions, GeminiResult } from "./gemini-client";
import { callGeminiStructured } from "./gemini-client";
import { claudeRungFromEnv, ProviderRotator } from "./rotator";

export interface StructuredResult<T> extends GeminiResult<T> {
  /** Etiqueta trazable del modelo que respondió, por ejemplo `claude:sonnet`. */
  modelUsed: string;
}

/** Bancados compartidos por todo el proceso. Ver el punto 2 del encabezado. */
const SHARED_COOLDOWN = new Set<string>();

/** Un rotator por modelo de Gemini pedido. Todos comparten el bancado. */
const rotators = new Map<string, ProviderRotator>();

function rotatorFor(apiKey: string, model: string): ProviderRotator {
  const cacheKey = `${model}::${apiKey.slice(-8)}`;
  const existing = rotators.get(cacheKey);
  if (existing) return existing;

  const built = new ProviderRotator({
    ...claudeRungFromEnv(),
    cooldown: SHARED_COOLDOWN,
    // Sólo el modelo que el job pidió. No agregamos Groq acá: el objetivo es
    // anteponer Claude, no cambiar el resto de la escalera del job.
    ...(apiKey ? { geminiApiKey: apiKey, geminiModels: [model] } : {}),
  });
  rotators.set(cacheKey, built);
  return built;
}

export async function callStructured<T>(options: GeminiCallOptions): Promise<StructuredResult<T>> {
  // El agente de 104 recibe texto, no binarios. Un PDF escaneado va derecho a
  // Gemini: es el único proveedor de la escalera que lee `inlineData`.
  if (options.inlineData?.length) {
    const result = await callGeminiStructured<T>(options);
    return { ...result, modelUsed: options.model };
  }

  const rotator = rotatorFor(options.apiKey, options.model);
  if (!rotator.available) {
    const result = await callGeminiStructured<T>(options);
    return { ...result, modelUsed: options.model };
  }

  const result = await rotator.generateStructured<T>({
    systemInstruction: options.systemInstruction,
    prompt: options.prompt,
    schema: options.schema,
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.maxRetries === undefined ? {} : { maxRetriesPerModel: options.maxRetries }),
    ...(options.stream === undefined ? {} : { stream: options.stream }),
    ...(options.onProgress === undefined ? {} : { onProgress: (p) => options.onProgress?.(p.receivedChars) }),
  });

  return { data: result.data, usage: result.usage, modelUsed: result.modelUsed };
}

/** Modelos bancados en lo que va del proceso. Para diagnóstico y tests. */
export function benchedModels(): string[] {
  return [...SHARED_COOLDOWN];
}

/** Limpia el estado compartido. Sólo para tests. */
export function resetStructuredState(): void {
  SHARED_COOLDOWN.clear();
  rotators.clear();
}
