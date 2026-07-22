/**
 * Downloads a pliego PDF or Word document and extracts its text. Degrades
 * gracefully: unsupported, unreachable or unparseable documents return null
 * rather than throwing, so a bad pliego never breaks the summary job.
 *
 * Lives in shared/ (moved from src/services) so BOTH the batch summarizer and the
 * Nitro on-demand endpoint can use it. unpdf is bundle-safe for Nitro (unjs).
 */
import { extractText, getDocumentProxy } from "unpdf";
import WordExtractor from "word-extractor";

export interface PliegoDocumentLike {
  url?: string | undefined;
  format?: string | undefined;
}

// Extraction and model-input limits are deliberately separate. Keeping the
// complete text here lets the corpus builder select relevant clauses from the
// whole document instead of silently discarding everything after character 60k.
export const MAX_EXTRACTED_PLIEGO_CHARS = 500_000;

/** comprasestatales still publishes some attachment links as HTTP although the
 * host serves them correctly only over HTTPS. Upgrade that known host locally. */
export function normalizePliegoDownloadUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "http:" && url.hostname.toLowerCase() === "www.comprasestatales.gub.uy") {
      url.protocol = "https:";
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function normalizedUrl(url: string | undefined): string {
  return (url ?? "").toLowerCase().split(/[?#]/, 1)[0] ?? "";
}

export function isPdfDocument(doc: { url?: string | undefined; format?: string | undefined }): boolean {
  const url = normalizedUrl(doc.url);
  const format = (doc.format ?? "").toLowerCase();
  return url.endsWith(".pdf") || format.includes("pdf") || format === "application/pdf";
}

export function isWordDocument(doc: PliegoDocumentLike): boolean {
  const url = normalizedUrl(doc.url);
  const format = (doc.format ?? "").toLowerCase();
  return url.endsWith(".doc")
    || url.endsWith(".docx")
    || format.includes("msword")
    || format.includes("wordprocessingml");
}

export function isSupportedPliegoDocument(doc: PliegoDocumentLike): boolean {
  return isPdfDocument(doc) || isWordDocument(doc);
}

function cleanText(text: string, maxChars: number): string | null {
  // Binary Word documents and a few PDFs can leave NULs in otherwise valid text.
  // Preserve ordinary spaces: removing them makes the model see concatenated words.
  const cleaned = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  return cleaned ? cleaned.slice(0, maxChars) : null;
}

export async function extractPdfText(
  url: string,
  maxChars = MAX_EXTRACTED_PLIEGO_CHARS,
  timeoutMs = 30_000,
): Promise<string | null> {
  try {
    const res = await fetch(normalizePliegoDownloadUrl(url), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : text;
    return cleanText(joined, maxChars);
  } catch {
    return null;
  }
}

export async function extractWordText(
  url: string,
  maxChars = MAX_EXTRACTED_PLIEGO_CHARS,
  timeoutMs = 30_000,
): Promise<string | null> {
  try {
    const res = await fetch(normalizePliegoDownloadUrl(url), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const extractor = new WordExtractor();
    const doc = await extractor.extract(Buffer.from(await res.arrayBuffer()));
    return cleanText(doc.getBody(), maxChars);
  } catch {
    return null;
  }
}

export async function extractPliegoText(
  doc: PliegoDocumentLike,
  maxChars = MAX_EXTRACTED_PLIEGO_CHARS,
  timeoutMs = 30_000,
): Promise<string | null> {
  if (!doc.url) return null;
  const extract = isPdfDocument(doc)
    ? () => extractPdfText(doc.url!, maxChars, timeoutMs)
    : isWordDocument(doc)
      ? () => extractWordText(doc.url!, maxChars, timeoutMs)
      : undefined;
  if (!extract) return null;
  const first = await extract();
  if (first) return first;
  // Government attachment links occasionally reset or return a transient empty
  // body. One bounded retry recovers those without introducing a dependency or
  // turning scanned/image-only PDFs into an endless loop.
  await new Promise(resolve => setTimeout(resolve, 400));
  return extract();
}
