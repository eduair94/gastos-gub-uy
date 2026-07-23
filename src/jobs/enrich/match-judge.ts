// src/jobs/enrich/match-judge.ts
//
// The LLM is used here as a JUDGE, never a searcher: given a supplier's legal name
// and a Google Maps candidate, decide if they are the SAME company. On the pilot
// (2026-07-19) gemini-2.5-flash-lite scored 18/18 on the ambiguous band, recovering
// real matches a fuzzy score rejects ("AGAM LIMITADA" ↔ "Laboratorio Agam Ltda.")
// and killing the false ones ("SURYPARK S.A." ↔ "SoluPark"). Cost ≈ US$1.80 / 40k.
//
// The Gemini call is INJECTED (`deps.call`) so the resolver stays unit-testable with
// a stub and no network — mirroring the factory style of the other resolvers.
import { callGeminiStructured, type GeminiSchema } from "../ai/gemini-client";

export interface MatchPair {
  /** Caller-chosen id echoed back on the verdict so batches can be de-multiplexed. */
  i: number;
  name: string;
  candidate: string;
  expectedAddress?: string;
  address?: string;
}
export interface MatchVerdict { i: number; match: boolean; conf: number }
export type JudgeFn = (pairs: MatchPair[]) => Promise<Map<number, MatchVerdict>>;

export interface JudgeDeps {
  apiKey: string;
  model?: string;
  /** Defaults to the real Gemini client; tests inject a stub. */
  call?: typeof callGeminiStructured;
  /** Max pairs per Gemini request. */
  batchSize?: number;
}

const SYSTEM =
  "Sos un verificador de identidad de empresas uruguayas. Te doy la razon social legal de un " +
  "proveedor del Estado y un candidato de Google Maps. Decidis si son LA MISMA empresa. Las razones " +
  "sociales suelen diferir del nombre comercial (ej: 'BALUMA S.A.' opera como 'Enjoy Punta del Este'), " +
  "La direccion_registro es la direccion oficial conocida y direccion_candidata es la de Maps: una " +
  "coincidencia clara de calle, numero o localidad es evidencia fuerte, incluso para proveedores del " +
  "exterior; una contradiccion clara es motivo para rechazar. NO aceptes coincidencias por una sola " +
  "palabra generica ni por rubro parecido. Ante la duda, " +
  "match=false. Devolves un veredicto por cada item, con su indice i.";

const SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    verdicts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          i: { type: "INTEGER" },
          match: { type: "BOOLEAN" },
          conf: { type: "NUMBER" },
        },
        required: ["i", "match", "conf"],
      },
    },
  },
  required: ["verdicts"],
};

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Build a judge bound to a Gemini key. Returns an empty map for empty input (no call). */
export function createGeminiJudge(deps: JudgeDeps): JudgeFn {
  const model = deps.model ?? "gemini-2.5-flash-lite";
  const call = deps.call ?? callGeminiStructured;
  const batchSize = deps.batchSize ?? 25;

  return async (pairs: MatchPair[]): Promise<Map<number, MatchVerdict>> => {
    const out = new Map<number, MatchVerdict>();
    if (!pairs.length) return out;
    for (const group of chunk(pairs, batchSize)) {
      const prompt = group
        .map(p => `${p.i}. razon_social="${p.name}" | candidato="${p.candidate}" | ` +
          `direccion_registro="${p.expectedAddress ?? ""}" | direccion_candidata="${p.address ?? ""}"`)
        .join("\n");
      try {
        const res = await call<{ verdicts: MatchVerdict[] }>({
          apiKey: deps.apiKey, model, systemInstruction: SYSTEM, prompt, schema: SCHEMA, temperature: 0,
        });
        for (const v of res.data?.verdicts ?? []) {
          if (typeof v?.i === "number") out.set(v.i, { i: v.i, match: !!v.match, conf: Number(v.conf) || 0 });
        }
      } catch {
        // A judge failure must not accept a match — leave these pairs unresolved
        // (absent from the map = treated as "not confirmed" by the resolver).
      }
    }
    return out;
  };
}
