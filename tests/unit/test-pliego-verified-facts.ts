/** Deterministic guardrails for explicit procurement facts. */
import assert from "node:assert/strict";
import {
  applyVerifiedPliegoFacts,
  extractVerifiedPliegoFacts,
  normalizeGeneratedPliegoSummary,
  type PliegoSummaryContent,
} from "../../shared/pliego/verified-facts";

const source = `
Fecha de apertura 22/07/2026 Hora 10:00.
El plazo total del contrato será de 12 meses, prorrogable por hasta 180 días.
El proveedor deberá encontrarse inscripto en RUPE en estado INGRESO o ACTIVO.
Deberá contar con seguro de accidentes de trabajo conforme Ley 16.074 y un mínimo de 9 operarios.
La visita es obligatoria y la constancia de visita será requisito de admisibilidad.
Se presentará formulario de oferta Anexo IV, carta poder, nómina de personal Anexo VI,
listado de equipos, materiales y marcas, fichas técnicas y de seguridad.
Se cotizará un único lote en pesos uruguayos; no se admiten ofertas parciales. Incluir IVA discriminado.
El mantenimiento de la oferta será de 60 días. El pago será a 30 días.
El ajuste será 80% salarios y 20% IPC.
La garantía de mantenimiento de oferta no es obligatoria. El retiro de la oferta implica multa del 5%.
La garantía de fiel cumplimiento será del 5% del monto adjudicado.
La garantía por obligaciones laborales de tercerizaciones será del 5%.
El único factor de evaluación será el precio. NO APLICA RESERVA DE MERCADO.
Se prevé multa de 0,5 UR por inasistencia. Cinco incumplimientos incrementan la multa en 10%.
Si las multas superan el 30% de la facturación mensual podrá disponerse la rescisión.
`;

const facts = extractVerifiedPliegoFacts([source]);
assert.equal(facts.execution, "12 meses, con prórroga de hasta 180 días");
assert.equal(facts.opening, "22/07/2026 10:00");
assert.equal(facts.noMarketReserve, true);
assert.equal(facts.priceOnlyEvaluation, true);
assert.ok(facts.requirements.some(item => item.includes("9 integrantes")));
assert.ok(facts.documents.some(item => item.includes("Fichas técnicas")));
assert.ok(facts.guarantees.some(item => item.includes("no es obligatoria")));
assert.ok(facts.observations.some(item => item.includes("0,5 UR")));

const inaccurateModel: PliegoSummaryContent = {
  objeto: "Servicio de limpieza",
  requisitosClave: [
    "Requisitos mínimos previstos por el organismo",
    "RUPE en estado Activo",
    "Presentar garantía de mantenimiento de oferta obligatoria",
  ],
  documentacionRequerida: [],
  formaCotizacion: "Según pliego",
  plazos: {
    recepcionOfertas: "21/07/2026 09:00",
    aperturaOfertas: "21/07/2026 09:00",
    consultas: "06/07/2026",
  },
  criteriosEvaluacion: ["Calificación por antecedentes", "Reserva de mercado para MIPYMES"],
  observaciones: [],
};

const corrected = applyVerifiedPliegoFacts(inaccurateModel, facts, {
  reception: "2026-07-22T13:00:00Z",
  enquiries: "2026-07-20T13:00:00Z",
});
assert.equal(corrected.plazos.recepcionOfertas, "22/07/2026 10:00");
assert.equal(corrected.plazos.aperturaOfertas, "22/07/2026 10:00");
assert.equal(corrected.plazos.consultas, "20/07/2026 10:00");
assert.equal(corrected.plazoEjecucion, "12 meses, con prórroga de hasta 180 días");
assert.ok(corrected.garantias?.includes("fiel cumplimiento"));
assert.ok(corrected.formaCotizacion?.includes("pesos uruguayos"));
assert.ok(corrected.criteriosEvaluacion.some(item => item === "No aplica el mecanismo de reserva de mercado"));
assert.ok(!corrected.criteriosEvaluacion.some(item => item.includes("Calificación")));
assert.ok(!corrected.criteriosEvaluacion.some(item => item === "Reserva de mercado para MIPYMES"));
assert.ok(!corrected.requisitosClave.some(item => item.includes("garantía de mantenimiento")));
assert.equal(corrected.requisitosClave.filter(item => item.includes("RUPE")).length, 1);

const schemaDrift = normalizeGeneratedPliegoSummary({
  objeto: "Compra de equipos",
  requisitosClave: "Inscripción en RUPE",
  documentacionRequerida: ["Formulario", null, 12],
  plazos: null,
  criteriosEvaluacion: ["Precio"],
  observaciones: [],
  garantias: { mantenimientoOferta: "USD 1.000", fielCumplimiento: "5%" },
});
assert.deepEqual(schemaDrift.requisitosClave, ["Inscripción en RUPE"]);
assert.deepEqual(schemaDrift.documentacionRequerida, ["Formulario", "12"]);
assert.equal(schemaDrift.garantias, "mantenimiento oferta: USD 1.000; fiel cumplimiento: 5%");
assert.deepEqual(schemaDrift.plazos, {});

console.log("ok: verified pliego facts override omissions and contradictions");
