/**
 * Converts a Gemini `responseSchema` (UPPERCASE OpenAPI-proto types) to a plain
 * JSON Schema (lowercase types) — the shape OpenAI-compatible providers (Groq)
 * expect. Keeping ONE schema (the GeminiSchema in the summarizer) as the single
 * source of truth and deriving the Groq one avoids the two drifting apart.
 */
import type { GeminiSchema } from "./gemini-client";

export type JsonSchema = {
  type: string | string[];
  description?: string;
  enum?: string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
};

const TYPE_MAP: Record<GeminiSchema["type"], string> = {
  OBJECT: "object",
  ARRAY: "array",
  STRING: "string",
  NUMBER: "number",
  INTEGER: "integer",
  BOOLEAN: "boolean",
};

export function geminiToJsonSchema(s: GeminiSchema): JsonSchema {
  const base = TYPE_MAP[s.type];
  // JSON Schema has no `nullable`; express it as a type union with "null".
  const type: string | string[] = s.nullable ? [base, "null"] : base;
  const out: JsonSchema = { type };

  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.items) out.items = geminiToJsonSchema(s.items);
  if (s.properties) {
    const props: Record<string, JsonSchema> = {};
    for (const [k, v] of Object.entries(s.properties)) props[k] = geminiToJsonSchema(v);
    out.properties = props;
    out.additionalProperties = false;
  }
  if (s.required) out.required = s.required;

  return out;
}

/** The keys a caller must see present to accept a structured response as valid. */
export function requiredKeys(s: GeminiSchema): string[] {
  return s.required ?? [];
}
