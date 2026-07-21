import type { IOpenCallDocument } from "../types/monitor";

export interface ExtractedPliegoDocument {
  document: IOpenCallDocument;
  text: string;
}

function dateMs(doc: IOpenCallDocument): number {
  const time = doc.datePublished ? new Date(doc.datePublished).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
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
    .map((entry, index) => `${headers[index]}${entry.text.slice(0, allocations[index])}`)
    .join("\n\n---\n\n")
    .slice(0, maxChars);
}
