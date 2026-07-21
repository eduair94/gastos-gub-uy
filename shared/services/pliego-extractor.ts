/**
 * Downloads a pliego PDF and extracts its text with unpdf. Degrades gracefully:
 * non-PDF, zipped, unreachable or unparseable documents return null with a reason
 * rather than throwing, so a bad pliego never breaks the summary job.
 *
 * Lives in shared/ (moved from src/services) so BOTH the batch summarizer and the
 * Nitro on-demand endpoint can use it. unpdf is bundle-safe for Nitro (unjs).
 */
import { extractText, getDocumentProxy } from "unpdf";

export function isPdfDocument(doc: { url?: string | undefined; format?: string | undefined }): boolean {
  const url = (doc.url ?? "").toLowerCase();
  const format = (doc.format ?? "").toLowerCase();
  return url.endsWith(".pdf") || format.includes("pdf") || format === "application/pdf";
}

export async function extractPdfText(url: string, maxChars = 60_000, timeoutMs = 30_000): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : text;
    const cleaned = joined.replace(/ /g, "").replace(/[ \t]+\n/g, "\n").trim();
    return cleaned ? cleaned.slice(0, maxChars) : null;
  } catch {
    return null;
  }
}
