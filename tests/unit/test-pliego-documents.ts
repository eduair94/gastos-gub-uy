/** Pure coverage for Word pliegos, correction-aware signatures and corpus assembly.
 * Run: npx tsx tests/unit/test-pliego-documents.ts
 */
import assert from "node:assert/strict";
import {
  isPdfDocument,
  isSupportedPliegoDocument,
  isWordDocument,
} from "../../shared/services/pliego-extractor";
import { pliegoDocsSignature } from "../../shared/pliego/docs-signature";
import { buildPliegoCorpus } from "../../shared/pliego/document-corpus";

assert.equal(isWordDocument({ url: "https://x/pliego_1349474.doc" }), true);
assert.equal(isWordDocument({ url: "https://x/pliego.docx?download=1" }), true);
assert.equal(isWordDocument({ format: "application/msword" }), true);
assert.equal(isPdfDocument({ format: "application/pdf" }), true);
assert.equal(isSupportedPliegoDocument({ url: "https://x/planilla.xlsx" }), false);

const baseDoc = {
  title: "Pliego base",
  url: "https://x/pliego_1349474.doc",
  format: "application/msword",
  datePublished: new Date("2026-06-17T15:05:24Z"),
};
const clarification = {
  title: "Aclaración",
  url: "https://x/aclar_llamado_1349474_0.pdf",
  format: "application/pdf",
  datePublished: new Date("2026-06-23T10:14:02Z"),
};

const pdfOnlySignature = pliegoDocsSignature([clarification]);
const completeSignature = pliegoDocsSignature([baseDoc, clarification]);
assert.notEqual(completeSignature, pdfOnlySignature, "adding a Word pliego must invalidate a PDF-only summary");
assert.equal(
  pliegoDocsSignature([baseDoc, clarification, { url: "https://x/data.xlsx" }]),
  completeSignature,
  "unsupported attachments must not affect the analysis signature",
);

const corpus = buildPliegoCorpus([
  { document: clarification, text: `CORRECCIÓN POSTERIOR: cambia el plazo.${"C".repeat(80)}` },
  { document: baseDoc, text: `PLIEGO BASE: condiciones originales.${"B".repeat(1_000)}` },
], 500);
assert.ok(corpus.length <= 500, "corpus must respect the model input budget");
assert.ok(corpus.includes("PLIEGO BASE"), "base pliego must contribute text");
assert.ok(corpus.includes("CORRECCIÓN POSTERIOR"), "later clarification must contribute text");
assert.ok(corpus.indexOf("PLIEGO BASE") < corpus.indexOf("CORRECCIÓN POSTERIOR"), "documents must be chronological");

console.log("ok: Word pliegos + correction-aware corpus");
