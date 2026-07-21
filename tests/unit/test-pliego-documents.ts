/** Pure coverage for Word pliegos, correction-aware signatures and corpus assembly.
 * Run: npx tsx tests/unit/test-pliego-documents.ts
 */
import assert from "node:assert/strict";
import {
  MAX_EXTRACTED_PLIEGO_CHARS,
  isPdfDocument,
  isSupportedPliegoDocument,
  isWordDocument,
} from "../../shared/services/pliego-extractor";
import { pliegoDocsSignature } from "../../shared/pliego/docs-signature";
import { buildPliegoCorpus, buildPliegoCorpusWithDiagnostics } from "../../shared/pliego/document-corpus";

assert.ok(MAX_EXTRACTED_PLIEGO_CHARS > 60_000, "extraction must not truncate at the model-input limit");

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

const longText = `INICIO-${"A".repeat(1_000)}-MEDIO-${"B".repeat(1_000)}-FINAL`;
const sampled = buildPliegoCorpus([{ document: baseDoc, text: longText }], 500);
assert.ok(sampled.includes("INICIO"), "a long document must retain its beginning");
assert.ok(sampled.includes("MEDIO"), "a long document must retain representative middle content");
assert.ok(sampled.includes("FINAL"), "a long document must retain its end");

const relevantClause = "GARANTÍA DE MANTENIMIENTO: el oferente deberá presentar 5% del monto.";
const clauseText = Array.from({ length: 30 }, (_, index) => index === 17
  ? relevantClause
  : `Sección narrativa ${index}. ${"texto general ".repeat(60)}`).join("\n\n");
const compressedClause = buildPliegoCorpus([{ document: baseDoc, text: clauseText }], 5_000);
assert.ok(compressedClause.includes(relevantClause), "task-relevant clauses must survive compression");

const lateParticularClauses = [
  "OBJETO: servicio integral de limpieza.",
  "REQUISITOS: inscripción en RUPE y visita obligatoria.",
  "DOCUMENTACIÓN: presentar Anexo VI y carta poder.",
  "COTIZACIÓN: único lote, pesos uruguayos, no admite ofertas parciales.",
  "PLAZO DE EJECUCIÓN: 12 meses, prorrogable por 180 días.",
  "GARANTÍA: la garantía de mantenimiento de oferta no es obligatoria.",
  "EVALUACIÓN: único factor precio. NO APLICA RESERVA DE MERCADO.",
  "PENALIDADES: multa de 0,5 UR; rescisión al superar 30% mensual.",
  "PAGO: a 30 días de la factura.",
  "CONDICIONES TÉCNICAS: nueve operarios, equipos y fichas de seguridad.",
];
const categoryText = [
  ...Array.from({ length: 45 }, (_, index) => `Condiciones generales ${index}. ${"texto administrativo ".repeat(45)}`),
  ...lateParticularClauses,
].join("\n\n");
const focused = buildPliegoCorpusWithDiagnostics([{ document: baseDoc, text: categoryText }], 8_000);
for (const clause of lateParticularClauses) {
  assert.ok(focused.corpus.includes(clause), `critical category clause must survive: ${clause}`);
}
for (const category of ["objeto", "requisitos", "documentos", "cotizacion", "ejecucion", "garantias", "evaluacion", "penalidades", "pagos", "tecnico"]) {
  assert.ok(focused.diagnostics.categories.includes(category), `diagnostics must report ${category}`);
}
assert.equal(focused.diagnostics.compressed, true);

console.log("ok: Word pliegos + correction-aware corpus");
