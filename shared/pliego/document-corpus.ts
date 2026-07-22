import type { IOpenCallDocument } from "../types/monitor";

export interface ExtractedPliegoDocument {
  document: IOpenCallDocument;
  text: string;
}

export interface PliegoCorpusDiagnostics {
  sourceChars: number;
  corpusChars: number;
  documentCount: number;
  compressed: boolean;
  categories: string[];
  sourceCategories: string[];
}

const CATEGORY_TERMS = {
  objeto: ["objeto", "alcance"],
  requisitos: ["requisito", "admisibilidad", "rupe", "antecedente", "habilitacion", "visita"],
  documentos: ["documentacion", "formulario", "anexo", "declaracion jurada"],
  cotizacion: ["oferta", "cotizacion", "precio", "moneda", "impuesto", "ajuste"],
  fechas: ["apertura", "recepcion", "consulta", "aclaracion"],
  ejecucion: ["plazo", "entrega", "ejecucion", "prorroga"],
  garantias: ["garantia", "mantenimiento de oferta", "fiel cumplimiento"],
  evaluacion: ["evaluacion", "criterio", "puntaje", "adjudicacion", "preferencia"],
  penalidades: ["multa", "penalidad", "incumplimiento", "rescisión"],
  pagos: ["pago", "factura"],
  tecnico: ["personal", "equipamiento", "materiales", "seguridad", "seguro"],
} as const;

const RELEVANCE_TERMS = [...new Set(Object.values(CATEGORY_TERMS).flat())];
const CHUNK_TARGET_CHARS = 500;
const OMITTED = "\n[… fragmento omitido …]\n";

function normalized(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

function dateMs(doc: IOpenCallDocument): number {
  const time = doc.datePublished ? new Date(doc.datePublished).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function categoryMatches(text: string): string[] {
  const lower = normalized(text);
  return Object.entries(CATEGORY_TERMS)
    .filter(([, terms]) => terms.some(term => lower.includes(normalized(term))))
    .map(([category]) => category);
}

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
    if (paragraph.length > CHUNK_TARGET_CHARS) {
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

function relevanceScore(chunk: string, index: number, total: number): number {
  const lower = normalized(chunk);
  let score = categoryMatches(chunk).length * 4;
  for (const term of RELEVANCE_TERMS) {
    if (lower.includes(normalized(term))) score += 3;
  }
  if (/\b\d+(?:[.,]\d+)?\s*(?:%|uyu|usd|ui|ur|dias?|horas?|meses?|anos?)\b/i.test(lower)) score += 2;
  if (/^(?:\d+(?:\.\d+)*|[ivxlcdm]+)[.)\s-]+/im.test(chunk)) score += 1;
  if (/\b(?:no\s+aplica|no\s+(?:es|sera)\s+obligatori|excluyente|debera|se\s+agrega)\b/i.test(lower)) score += 6;
  // Particular conditions commonly appear after generic boilerplate.
  score += Math.round((index / Math.max(1, total - 1)) * 4);
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

/** Selects clauses across the complete document without a paid model call. */
function fitAcrossDocument(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 0) return "";

  const chunks = splitForCompression(text);
  if (chunks.length <= 1) return text.slice(0, maxChars);

  const selected = new Set<number>();
  const estimatedCapacity = Math.max(1, Math.floor(
    (maxChars + OMITTED.length) / (CHUNK_TARGET_CHARS + OMITTED.length),
  ));
  const anchorCount = Math.min(estimatedCapacity >= 4 ? 3 : 1, chunks.length);
  for (let index = 0; index < anchorCount; index++) {
    selected.add(Math.round(((chunks.length - 1) * index) / Math.max(1, anchorCount - 1)));
  }

  const ranked = chunks
    .map((chunk, index) => ({
      index,
      score: relevanceScore(chunk, index, chunks.length),
      categories: categoryMatches(chunk),
    }))
    .sort((a, b) => b.score - a.score || b.index - a.index);

  const projectedLength = (): number => [...selected]
    .reduce((total, index) => total + chunks[index]!.length, 0)
    + Math.max(0, selected.size - 1) * OMITTED.length;
  if (projectedLength() > maxChars) return distributedSample(text, maxChars);

  // Reserve one high-value clause for every category present before filling by
  // generic score. This prevents guarantees or penalties from losing against
  // repeated occurrences of words such as "oferta" in boilerplate.
  const presentCategories = new Set(ranked.flatMap(candidate => candidate.categories));
  for (const category of presentCategories) {
    const candidate = ranked.find(item => item.categories.includes(category));
    if (!candidate || selected.has(candidate.index)) continue;
    selected.add(candidate.index);
    if (projectedLength() > maxChars) selected.delete(candidate.index);
  }

  for (const candidate of ranked) {
    if (selected.has(candidate.index)) continue;
    selected.add(candidate.index);
    if (projectedLength() > maxChars) selected.delete(candidate.index);
  }

  return [...selected]
    .sort((a, b) => a - b)
    .map(index => chunks[index])
    .join(OMITTED)
    .slice(0, maxChars);
}

function buildBaseCorpus(extracted: ExtractedPliegoDocument[], maxChars: number): string {
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
  let textBudget = Math.max(0, maxChars - headers.reduce((n, header) => n + header.length, 0) - separatorsLength);
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

function buildCoverageExtracts(extracted: ExtractedPliegoDocument[], maxChars: number): string {
  if (maxChars < 4_000) return "";
  const ordered = extracted
    .map((entry, index) => ({ ...entry, originalIndex: index }))
    .sort((a, b) => dateMs(a.document) - dateMs(b.document) || a.originalIndex - b.originalIndex);
  const sourceCategories = new Set(categoryMatches(ordered.map(entry => entry.text).join("\n")));
  const candidates = ordered.flatMap((entry, documentIndex) => splitForCompression(entry.text)
    .map((chunk, chunkIndex, chunks) => ({
      chunk,
      chunkIndex,
      documentIndex,
      categories: categoryMatches(chunk),
      score: relevanceScore(chunk, chunkIndex, chunks.length) + documentIndex * 2,
      title: entry.document.title?.trim() || `Documento ${documentIndex + 1}`,
      date: entry.document.datePublished ? new Date(entry.document.datePublished).toISOString() : "sin fecha",
    }))
    .filter(candidate => candidate.categories.length));
  const selected: typeof candidates = [];
  const uncovered = new Set(sourceCategories);
  const budget = Math.min(5_000, Math.floor(maxChars * 0.3));
  const renderedLength = (candidate: (typeof candidates)[number]): number =>
    candidate.chunk.length + candidate.title.length + candidate.date.length + 45;
  let used = 0;

  while (uncovered.size) {
    const candidate = candidates
      .filter(item => !selected.includes(item) && item.categories.some(category => uncovered.has(category)))
      .filter(item => used + renderedLength(item) <= budget)
      .sort((a, b) => {
        const aNew = a.categories.filter(category => uncovered.has(category)).length;
        const bNew = b.categories.filter(category => uncovered.has(category)).length;
        return bNew - aNew || b.score - a.score || b.documentIndex - a.documentIndex;
      })[0];
    if (!candidate) break;
    selected.push(candidate);
    used += renderedLength(candidate);
    for (const category of candidate.categories) uncovered.delete(category);
  }

  return selected
    .sort((a, b) => a.documentIndex - b.documentIndex || a.chunkIndex - b.chunkIndex)
    .map(candidate => `EXTRACTO ESENCIAL — DOCUMENTO ${candidate.documentIndex + 1} (${candidate.date}): ${candidate.title}\n${candidate.chunk}`)
    .join(OMITTED);
}

function buildCorpus(extracted: ExtractedPliegoDocument[], maxChars: number): string {
  if (!extracted.length || maxChars <= 0) return "";
  const coverage = buildCoverageExtracts(extracted, maxChars);
  if (!coverage) return buildBaseCorpus(extracted, maxChars);
  const separator = "\n\n=== EXTRACTOS ESENCIALES PARA COBERTURA ===\n\n";
  const base = buildBaseCorpus(extracted, Math.max(0, maxChars - coverage.length - separator.length));
  return `${base}${separator}${coverage}`.slice(0, maxChars);
}

/** Builds a chronological, query-focused model input from all extracted sources. */
export function buildPliegoCorpus(extracted: ExtractedPliegoDocument[], maxChars: number): string {
  return buildCorpus(extracted, maxChars);
}

export function buildPliegoCorpusWithDiagnostics(
  extracted: ExtractedPliegoDocument[],
  maxChars: number,
): { corpus: string; diagnostics: PliegoCorpusDiagnostics } {
  const corpus = buildCorpus(extracted, maxChars);
  const sourceChars = extracted.reduce((total, entry) => total + entry.text.length, 0);
  return {
    corpus,
    diagnostics: {
      sourceChars,
      corpusChars: corpus.length,
      documentCount: extracted.length,
      compressed: sourceChars > corpus.length,
      categories: categoryMatches(corpus),
      sourceCategories: categoryMatches(extracted.map(entry => entry.text).join("\n")),
    },
  };
}
