/**
 * Tests del escalón Claude (servidor 104) dentro del ProviderRotator. Sin red y
 * sin base: stubea `globalThis.fetch` y enruta por URL. Corré:
 *   npx tsx tests/unit/claude-agent-rung.test.ts
 */
import {
  callClaudeAgentStructured,
  ClaudeAgentHttpError,
  isClaudeAgentExhausted,
  mapUsage,
  parseStructuredResult,
  resetHealthCache,
} from "../../shared/ai/claude-agent-client";
import type { GeminiSchema } from "../../shared/ai/gemini-client";
import { claudeRungFromEnv, ProviderRotator } from "../../shared/ai/rotator";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

const SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: { veredicto: { type: "STRING" }, razon: { type: "STRING" } },
  required: ["veredicto", "razon"],
};

const realFetch = globalThis.fetch;

/** Respuesta que imita a `claude-agent-api`: el JSON viaja como texto en `result`. */
function claudeOk(payload: unknown): Response {
  return new Response(JSON.stringify({
    ok: true,
    result: JSON.stringify(payload),
    usage: { input_tokens: 2, cache_creation_input_tokens: 35_509, cache_read_input_tokens: 0, output_tokens: 870 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function claudeError(status: number, code: string): Response {
  return new Response(JSON.stringify({ ok: false, error: code, message: code }), {
    status, headers: { "content-type": "application/json" },
  });
}

function geminiOk(payload: unknown): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

interface StubPlan { claude?: () => Response; gemini?: () => Response }

const calls: string[] = [];
function stubFetch(plan: StubPlan): void {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("9310")) { calls.push("claude"); return plan.claude!(); }
    calls.push("gemini");
    return plan.gemini!();
  }) as typeof fetch;
}

function restoreFetch(): void { globalThis.fetch = realFetch; }

const ARGS = {
  systemInstruction: "Sos un clasificador.",
  prompt: "Clasificá esto.",
  schema: SCHEMA,
};

async function main(): Promise<void> {
  console.log("🧪 escalón Claude (servidor 104)");
  console.log("=================================");

  // ---- mapUsage -----------------------------------------------------------
  const usage = mapUsage({ input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 7 });
  ok("mapUsage suma los tokens de caché a promptTokens", usage.promptTokens === 152);
  ok("mapUsage toma output_tokens como candidatesTokens", usage.candidatesTokens === 7);
  ok("mapUsage cierra el total", usage.totalTokens === 159);

  // ---- parseStructuredResult ---------------------------------------------
  ok("parsea JSON pelado", parseStructuredResult<{ a: number }>('{"a":1}').a === 1);
  ok("pela la valla de markdown", parseStructuredResult<{ a: number }>('```json\n{"a":2}\n```').a === 2);
  let threw = false;
  try { parseStructuredResult("no soy json"); } catch { threw = true; }
  ok("un result no-JSON tira error", threw);

  // ---- qué agota el escalón ----------------------------------------------
  ok("daily_limit_reached agota", isClaudeAgentExhausted(new ClaudeAgentHttpError(429, "daily_limit_reached", "x")));
  ok("queue_full agota", isClaudeAgentExhausted(new ClaudeAgentHttpError(503, "queue_full", "x")));
  ok("queue_timeout agota", isClaudeAgentExhausted(new ClaudeAgentHttpError(504, "queue_timeout", "x")));
  ok("agent_timeout NO agota (es de esa tarea)", !isClaudeAgentExhausted(new ClaudeAgentHttpError(504, "agent_timeout", "x")));
  ok("un Error común no agota", !isClaudeAgentExhausted(new Error("boom")));

  // ---- claudeRungFromEnv --------------------------------------------------
  const savedKey = process.env.CLAUDE_AGENT_API_KEY;
  const savedUrl = process.env.CLAUDE_AGENT_URL;
  delete process.env.CLAUDE_AGENT_API_KEY;
  ok("sin clave el escalón queda vacío", Object.keys(claudeRungFromEnv()).length === 0);
  process.env.CLAUDE_AGENT_API_KEY = "secreto";
  delete process.env.CLAUDE_AGENT_URL;
  ok("con clave cae al loopback de 104", claudeRungFromEnv().claudeAgentUrl === "http://127.0.0.1:9310");

  // ---- el cliente pide lo que debe pedir ---------------------------------
  let sentBody: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return claudeOk({ veredicto: "no", razon: "sin marca declarada" });
  }) as typeof fetch;
  const direct = await callClaudeAgentStructured<{ veredicto: string }>({
    baseUrl: "http://127.0.0.1:9310", apiKey: "k", model: "sonnet", ...ARGS, timeoutMs: 180_000,
  });
  ok("devuelve el objeto parseado", direct.data.veredicto === "no");
  ok("no pide herramientas", Array.isArray(sentBody.allowedTools) && (sentBody.allowedTools as unknown[]).length === 0);
  ok("manda el schema convertido a JSON Schema", (sentBody.jsonSchema as { type?: string }).type === "object");
  ok("anula el modo caveman", String(sentBody.appendSystemPrompt).includes("caveman"));
  ok("el presupuesto del servidor va por debajo del corte del cliente", (sentBody.timeoutMs as number) < 180_000);
  restoreFetch();

  // ---- una respuesta incompleta rota al modelo siguiente ------------------
  stubFetch({
    claude: () => claudeOk({ veredicto: "si" }), // falta `razon`
    gemini: () => geminiOk({ veredicto: "si", razon: "completa" }),
  });
  const incomplete = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k",
    geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"],
  });
  const rescued = await incomplete.generateStructured<{ razon: string }>(ARGS);
  ok("una respuesta sin las claves requeridas cae a Gemini", rescued.modelUsed === "gemini-2.5-flash-lite");
  ok("y el escalón NO queda bancado (no fue cuota)", !incomplete.benched.includes("claude:sonnet"));
  restoreFetch();

  // ---- orden de la escalera y etiquetas -----------------------------------
  stubFetch({ claude: () => claudeOk({ veredicto: "si", razon: "porque sí" }), gemini: () => geminiOk({}) });
  const rotator = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k",
    geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"],
    groqApiKey: "q", groqModels: ["llama-3.3-70b-versatile"],
  });
  const first = await rotator.generateStructured<{ veredicto: string }>(ARGS);
  ok("Claude encabeza la escalera", first.modelUsed === "claude:sonnet");
  ok("Gemini ni se toca cuando Claude responde", calls.length === 1 && calls[0] === "claude");
  ok("la etiqueta de Claude lleva prefijo", first.modelUsed.startsWith("claude:"));
  restoreFetch();

  // ---- la pared diaria banca el escalón por el resto de la corrida --------
  stubFetch({
    claude: () => claudeError(429, "daily_limit_reached"),
    gemini: () => geminiOk({ veredicto: "si", razon: "desde Gemini" }),
  });
  const walled = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k",
    geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"],
  });
  const fallback = await walled.generateStructured<{ razon: string }>(ARGS);
  ok("ante la pared diaria cae a Gemini", fallback.modelUsed === "gemini-2.5-flash-lite");
  ok("y no reintenta Claude en esa misma llamada", calls.filter((c) => c === "claude").length === 1);
  ok("el escalón queda bancado", walled.benched.includes("claude:sonnet"));

  const second = await walled.generateStructured<{ razon: string }>(ARGS);
  ok("la llamada siguiente ya no gasta cuota de Claude", calls.filter((c) => c === "claude").length === 1);
  ok("y sigue resolviendo por Gemini", second.modelUsed === "gemini-2.5-flash-lite");
  restoreFetch();

  // ---- el bancado compartido vale entre instancias ------------------------
  const shared = new Set<string>();
  stubFetch({
    claude: () => claudeError(429, "daily_limit_reached"),
    gemini: () => geminiOk({ veredicto: "si", razon: "desde Gemini" }),
  });
  const jobA = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k", cooldown: shared,
    geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"],
  });
  const jobB = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k", cooldown: shared,
    geminiApiKey: "g", geminiModels: ["gemini-2.5-pro"],
  });
  await jobA.generateStructured(ARGS);
  await jobB.generateStructured(ARGS);
  ok("un rotator hermano hereda el bancado y no regasta cuota", calls.filter((c) => c === "claude").length === 1);
  restoreFetch();

  // ---- la reserva frena al batch antes de vaciar la cuota ----------------
  // El servidor tiene UNA cuota diaria compartida con el Claude Code interactivo
  // del dueño. Con reserva N, el batch se detiene con N llamadas sin usar.
  calls.length = 0;
  resetHealthCache();
  let healthHits = 0;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/health")) {
      healthHits++;
      return new Response(JSON.stringify({ ok: true, daily: { limit: 600, remaining: 150 } }), { status: 200 });
    }
    if (url.includes("9310")) { calls.push("claude"); return claudeOk({ veredicto: "si", razon: "ok" }); }
    calls.push("gemini");
    return geminiOk({ veredicto: "si", razon: "desde Gemini" });
  }) as typeof fetch;

  const reserved = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k", claudeMinRemaining: 150,
    geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"],
  });
  const heldBack = await reserved.generateStructured<{ razon: string }>(ARGS);
  ok("con el saldo en el piso NO gasta la llamada", calls.filter((c) => c === "claude").length === 0);
  ok("y resuelve igual por Gemini", heldBack.modelUsed === "gemini-2.5-flash-lite");
  ok("el escalón queda bancado por la reserva", reserved.benched.includes("claude:sonnet"));
  restoreFetch();

  // Por encima del piso sí usa Claude, y no consulta el saldo una vez por ítem.
  calls.length = 0;
  resetHealthCache();
  healthHits = 0;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/health")) {
      healthHits++;
      return new Response(JSON.stringify({ ok: true, daily: { limit: 600, remaining: 400 } }), { status: 200 });
    }
    calls.push("claude");
    return claudeOk({ veredicto: "si", razon: "ok" });
  }) as typeof fetch;
  const aboveFloor = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k", claudeMinRemaining: 150,
    geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"],
  });
  const r1 = await aboveFloor.generateStructured(ARGS);
  await aboveFloor.generateStructured(ARGS);
  await aboveFloor.generateStructured(ARGS);
  ok("por encima del piso sí usa Claude", (r1 as { modelUsed: string }).modelUsed === "claude:sonnet");
  ok("y el saldo se cachea (no un /health por ítem)", healthHits === 1 && calls.length === 3);
  restoreFetch();

  // Un /health caído no debe frenar la tanda.
  calls.length = 0;
  resetHealthCache();
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/health")) return new Response("boom", { status: 500 });
    calls.push("claude");
    return claudeOk({ veredicto: "si", razon: "ok" });
  }) as typeof fetch;
  const healthDown = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k", claudeMinRemaining: 150,
    geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"],
  });
  const anyway = await healthDown.generateStructured(ARGS);
  ok("con /health caído la reserva no bloquea", (anyway as { modelUsed: string }).modelUsed === "claude:sonnet");
  restoreFetch();

  // Sin reserva configurada no se consulta el saldo en absoluto.
  calls.length = 0;
  resetHealthCache();
  let healthCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/health")) { healthCalls++; return new Response("{}", { status: 200 }); }
    calls.push("claude");
    return claudeOk({ veredicto: "si", razon: "ok" });
  }) as typeof fetch;
  const noReserve = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k",
    geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"],
  });
  await noReserve.generateStructured(ARGS);
  ok("sin reserva no consulta /health", healthCalls === 0 && calls.length === 1);
  restoreFetch();

  // ---- Claude no se queda con toda la ventana ----------------------------
  let claudeBudget = 0;
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("9310")) {
      claudeBudget = (JSON.parse(String(init?.body)) as { timeoutMs: number }).timeoutMs;
      return claudeOk({ veredicto: "si", razon: "ok" });
    }
    return geminiOk({ veredicto: "si", razon: "ok" });
  }) as typeof fetch;
  const budgeted = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k",
    geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"],
  });
  await budgeted.generateStructured({ ...ARGS, totalTimeoutMs: 180_000 });
  // 180s × 0,6 = 108s de ventana, menos el margen de 15s que reserva el cliente.
  ok("con escalón de respaldo Claude recibe ~60% de la ventana", claudeBudget > 80_000 && claudeBudget < 100_000);

  const soloClaude = new ProviderRotator({ claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k" });
  await soloClaude.generateStructured({ ...ARGS, totalTimeoutMs: 180_000 });
  ok("siendo el único escalón se queda con toda la ventana", claudeBudget > 150_000);
  restoreFetch();

  // ---- sin túnel, el escalón se banca al primer intento -------------------
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("9310")) { calls.push("claude"); throw Object.assign(new TypeError("fetch failed"), { name: "TypeError" }); }
    calls.push("gemini");
    return geminiOk({ veredicto: "si", razon: "sin túnel" });
  }) as typeof fetch;
  const noTunnel = new ProviderRotator({
    claudeAgentUrl: "http://127.0.0.1:9310", claudeAgentApiKey: "k",
    geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"],
  });
  const t1 = await noTunnel.generateStructured<{ razon: string }>(ARGS);
  await noTunnel.generateStructured<{ razon: string }>(ARGS);
  await noTunnel.generateStructured<{ razon: string }>(ARGS);
  ok("sin túnel resuelve igual por Gemini", t1.modelUsed === "gemini-2.5-flash-lite");
  ok("y sólo intenta conectarse UNA vez en toda la corrida", calls.filter((c) => c === "claude").length === 1);
  restoreFetch();

  // ---- sin escalón Claude la escalera arranca en Gemini -------------------
  stubFetch({ gemini: () => geminiOk({ veredicto: "si", razon: "sin Claude" }) });
  const noClaude = new ProviderRotator({ geminiApiKey: "g", geminiModels: ["gemini-2.5-flash-lite"] });
  const plain = await noClaude.generateStructured<{ razon: string }>(ARGS);
  ok("sin URL ni clave el escalón no se arma", plain.modelUsed === "gemini-2.5-flash-lite");
  restoreFetch();

  if (savedKey === undefined) delete process.env.CLAUDE_AGENT_API_KEY; else process.env.CLAUDE_AGENT_API_KEY = savedKey;
  if (savedUrl === undefined) delete process.env.CLAUDE_AGENT_URL; else process.env.CLAUDE_AGENT_URL = savedUrl;

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} pasaron, ${failed} fallaron`);
  if (failed > 0) process.exit(1);
}

void main().catch((err: unknown) => { console.error(err); process.exit(1); });
