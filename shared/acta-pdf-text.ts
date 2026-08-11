/**
 * Text out of an acta de adjudicación PDF.
 *
 * PURE apart from `node:zlib`. Kept separate from the bidder parser so the parser stays a plain
 * string→object function that tests can drive off text fixtures.
 *
 * The actas published at /Resoluciones/acta_<compraId>.pdf are produced by RSTXPDF3 and have two
 * properties that defeat a generic extractor, both verified across the corpus:
 *
 *   1. The content streams are UNCOMPRESSED. Inflating them throws, so an extractor that only
 *      handles FlateDecode returns nothing and the acta looks like a scan. It is not one — measured
 *      over 37 actas, every single one carried a real text layer.
 *   2. The show-text operands are HEX strings — `<434F4E44...>Tj` — not the literal `(...)Tj` form.
 *      An extractor that only reads parenthesised strings also returns nothing.
 *
 * Anything that reads these files must handle both, which is why this is a shared module rather
 * than a helper inside one job.
 */
import zlib from "node:zlib";

/** Every stream in the file: inflated when deflated, raw when not. */
function streams(buf: Buffer): string[] {
  const out: string[] = [];
  let idx = 0;
  while (true) {
    const start = buf.indexOf("stream", idx);
    if (start === -1) break;
    let from = start + 6;
    if (buf[from] === 0x0d) from++;
    if (buf[from] === 0x0a) from++;
    const end = buf.indexOf("endstream", from);
    if (end === -1) break;
    const raw = buf.subarray(from, end);
    idx = end + 9;
    let text: string;
    try {
      text = zlib.inflateSync(raw).toString("latin1");
    } catch {
      try {
        text = zlib.inflateRawSync(raw).toString("latin1");
      } catch {
        text = raw.toString("latin1");
      }
    }
    out.push(text);
  }
  return out;
}

/**
 * Visual lines of text, in document order. `Td`/`TD`/`T*`/`ET` end a line.
 *
 * The line breaks are NOT meaningful — the generator hard-wraps mid-word ("se present\naron",
 * "la s firmas") — so downstream matching must despace rather than read lines. They are preserved
 * anyway because they make the text readable when a human checks a parse.
 */
export function extractActaText(buf: Buffer): string {
  const lines: string[] = [];
  for (const content of streams(buf)) {
    const re = /<[0-9A-Fa-f\s]+>|\((?:\\.|[^\\()])*\)|\bTd\b|\bTD\b|\bT\*\b|\bET\b/g;
    let m: RegExpExecArray | null;
    let line = "";
    while ((m = re.exec(content))) {
      const tok = m[0];
      if (tok.startsWith("<")) {
        const hex = tok.slice(1, -1).replace(/\s+/g, "");
        let decoded = "";
        for (let i = 0; i + 1 < hex.length; i += 2) {
          decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
        }
        line += decoded;
      } else if (tok.startsWith("(")) {
        line += tok
          .slice(1, -1)
          .replace(/\\([nrtbf()\\])/g, (_, c: string) => ({ n: "\n", r: "\r", t: "\t", b: "", f: "" }[c] ?? c))
          .replace(/\\([0-7]{1,3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
      } else if (line.trim()) {
        lines.push(line);
        line = "";
      }
    }
    if (line.trim()) lines.push(line);
  }
  return lines.join("\n");
}
