import type { IOpenCallDocument } from "../types/monitor";

export interface ExtractedPliegoDocument {
  document: IOpenCallDocument;
  text: string;
}

function dateMs(doc: IOpenCallDocument): number {
  const time = doc.datePublished ? new Date(doc.datePublished).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

const RELEVANCE_TERMS = [
  "objeto", "alcance", "requisito", "admisibilidad", "rupe", "antecedente",
  "habilitación", "documentación", "formulario", "oferta", "cotización",
  "precio", "moneda", "impuesto", "ajuste", "mantenimiento", "plazo",
  "entrega", "ejecución", "recepción", "apertura", "consulta", "visita",
  "garantía", "evaluación", "criterio", "puntaje", "adjudicación", "multa",
  "penalidad", "incumplimiento", "pago", "factura", "prórroga", "rescisión",
] as const;
const CHUNK_TARGET_CHARS = 750;
const OMITTED = "\n[… fragmento omitido …]\n";

function splitForCompression(text: string): string[] {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map(part => part.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > CHUNK_TARGET_CHARS) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length > CHUNK_TARGET_CHARS * 2) {
      if (current) chunks.push(current);
      current = "";
      for (let start = 0; start < paragraph.length; start += CHUNK_TARGET_CHARS) {
        chunks.push(paragraph.slice(start, start + CHUNK_TARGET_CHARS));
      }
    } else {
      current += `${current ? "\n\n" : ""}${paragraph}`;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function relevanceScore(chunk: string): number {
  const lower = chunk.toLocaleLowerCase("es");
  let score = 0;
  for (const term of RELEVANCE_TERMS) {
    if (lower.includes(term)) score += 3;
  }
  if (/\b\d+(?:[.,]\d+)?\s*(?:%|uyu|usd|ui|ur|días?|horas?|meses?|años?)\b/i.test(chunk)) score += 2;
  if (/^(?:\d+(?:\.\d+)*|[ivxlcdm]+)[.)\s-]+/im.test(chunk)) score += 1;
  return score;
}

function distributedSample(text: string, maxChars: number): string {
  const segmentCount = 3;
  const contentBudget = maxChars - OMITTED.length * (segmentCount - 1);
  if (contentBudget < segmentCount) return text.slice(0, maxChars);
  const segmentSize = Math.floor(contentBudget / segmentCount);
  const maxStart = text.length - segmentSize;
  return Array.from({ length: segmentCount }, (_, index) => {
    const start = Math.round((maxStart * index) / (segmentCount - 1));
    return text.slice(start, start + segmentSize);
  }).join(OMITTED).slice(0, maxChars);
}

/**
 * Query-focused extractive compression. Keeps high-value procurement clauses
 * plus evenly distributed anchors, without spending another model request.
 */
function fitAcrossDocument(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 0) return "";

  const chunks = splitForCompression(text);
  if (chunks.length <= 1) return text.slice(0, maxChars);

  // Mandatory anchors prevent a keyword-only filter from erasing the document's
  // narrative context. Relevance-ranked chunks fill the remaining budget.
  const selected = new Set<number>();
  const anchorCount = Math.min(5, chunks.length);
  for (let index = 0; index < anchorCount; index++) {
    selected.add(Math.round(((chunks.length - 1) * index) / Math.max(1, anchorCount - 1)));
  }
  const ranked = chunks
    .map((chunk, index) => ({ index, score: relevanceScore(chunk) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const projectedLength = (): number => [...selected]
    .reduce((total, index) => total + chunks[index]!.length, 0)
    + Math.max(0, selected.size - 1) * OMITTED.length;
  if (projectedLength() > maxChars) return distributedSample(text, maxChars);
  for (const candidate of ranked) {
    if (selected.has(candidate.index)) continue;
    selected.add(candidate.index);
    if (projectedLength() > maxChars) selected.delete(candidate.index);
  }

  const ordered = [...selected].sort((a, b) => a - b);
  return ordered.map(index => chunks[index]).join(OMITTED).slice(0, maxChars);
}

/**
 * Builds one chronological model input from every successfully extracted source.
 * Short corrections are kept whole; the remaining character budget is divided
 * fairly between long documents so no later clarification disappears merely
 * because the base pliego filled the input window first.
 */
export function buildPliegoCorpus(extracted: ExtractedPliegoDocument[], maxChars: number): string {
  if (!extracted.length || maxChars <= 0) return "";

  const ordered = extracted
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => dateMs(a.document) - dateMs(b.document) || a.index - b.index);

  const headers = ordered.map((entry, index) => {
    const title = entry.document.title?.trim() || `Documento ${index + 1}`;
    const date = entry.document.datePublished
      ? new Date(entry.document.datePublished).toISOString()
      : "sin fecha";
    return `DOCUMENTO ${index + 1} (publicado ${date}): ${title}\nFuente: ${entry.document.url}\n`;
  });
  const separatorsLength = Math.max(0, ordered.length - 1) * 7;
  let textBudget = Math.max(0, maxChars - headers.reduce((n, h) => n + h.length, 0) - separatorsLength);
  const allocations = new Array<number>(ordered.length).fill(0);
  const pending = new Set(ordered.map((_, index) => index));

  while (pending.size && textBudget > 0) {
    const fairShare = Math.max(1, Math.floor(textBudget / pending.size));
    const short = [...pending].filter(index => ordered[index]!.text.length <= fairShare);
    if (!short.length) {
      for (const index of pending) allocations[index] = fairShare;
      break;
    }
    for (const index of short) {
      allocations[index] = ordered[index]!.text.length;
      textBudget -= allocations[index]!;
      pending.delete(index);
    }
  }

  return ordered
    .map((entry, index) => `${headers[index]}${fitAcrossDocument(entry.text, allocations[index]!)}`)
    .join("\n\n---\n\n")
    .slice(0, maxChars);
}
