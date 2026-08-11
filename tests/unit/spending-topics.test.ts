// Run: npx tsx tests/unit/spending-topics.test.ts
//
// The gender/diversity topic is recovered from free text, so the matcher IS the
// investigation's methodology. These assertions pin the traps that a live probe of
// `releases` actually turned up — each one is a real string pattern from the corpus,
// not a hypothetical:
//
//   - "género" in Uruguayan procurement also means CLOTH ("esterilla de género").
//   - "trans" as a fragment hits 14.417 records (transporte, transferencia).
//   - "equidad" alone is the "Plan de Equidad" cash transfer and "Equidad Racial".
//   - "diversidad" alone is the Dirección Nacional de BIODIVERSIDAD.
//   - "inclusión" alone is laboratory work ("cassette de inclusión en parafina").
//
// If a future edit to the term list breaks one of these, the total on the public page
// silently changes. That is what this file is for.
import assert from "node:assert/strict";
import { GENERO_TOPIC, matchTopic, topicRegex } from "../../shared/spending-topics";

const m = (...fields: string[]) => matchTopic(GENERO_TOPIC, fields);

// ---- Positives: real descriptions from the live corpus ---------------------

assert.ok(
  m("SERVICIOS PSICOSOCIALES DE ATENCIÓN A MUJERES EN SITUACIÓN DE VIOLENCIA BASADA EN GÉNERO PARA LA COMUNA MUJER 11").matched,
  "the ComunaMujer VBG service must match",
);
assert.ok(m("Acondicionamiento de sede Penal para la instalación de nuevo Juzgado de Género.").strong, "juzgado de género is a strong hit");
assert.ok(m("asistencia técnica al área de sistema de información de género (SIG) del Inmujeres.").strong, "Inmujeres is a strong hit");
assert.ok(m("capacitación, elaboración de manual y folleto en masculinidades y género").strong, "masculinidades is a strong hit");
assert.ok(m("SEGURIDAD CASA CENTRO DE REF. LGBT").strong, "LGBT is a strong hit");
assert.ok(m("MODELO DE CALIDAD CON EQUIDAD DE GÉNERO POR 6 MESES").strong, "equidad DE GÉNERO is a strong hit");
assert.ok(m("Profesional especializado/a en Gestión de Calidad con Equidad de Género, Inclusión y Diversidades").strong);

// Accents and case are irrelevant — the feed writes it both ways.
assert.ok(m("VIOLENCIA BASADA EN GENERO").strong, "unaccented GENERO must match");
assert.ok(m("violencia basada en género").strong, "accented género must match");

// ---- Negatives: the traps --------------------------------------------------

assert.equal(m("ESTERILLA DE GENERO").matched, false, '"esterilla de género" is cloth, not policy');
assert.equal(m("Compra de género de algodón para confección de sábanas").matched, false, "cloth context must silence the bare term");
assert.equal(m("500 metros de genero para cortinas").matched, false, "textile context must silence the bare term");

assert.equal(m("Servicio de transporte de funcionarios").matched, false, '"trans" must not match inside "transporte"');
assert.equal(m("Transferencia bancaria y transmisión de datos").matched, false, '"trans" must not match inside "transferencia"');

assert.equal(m("Contratación de un Equipo Multidisciplinario para la instrumentación de la Tarjeta Plan de Equidad").matched, false, '"Plan de Equidad" is a cash transfer, not gender policy');
assert.equal(m("Día Nacional del Candombe, la Cultura Afrouruguaya y la Equidad Racial").matched, false, '"Equidad Racial" alone must not enter via "equidad"');

assert.equal(m("Dirección Nacional de Biodiversidad y Servicios Ecosistémicos").matched, false, '"diversidad" must not match inside "biodiversidad"');
assert.equal(m("CASSETTE PARA INCLUSION EN PARAFINA (ANATOMIA PATOLOGICA)").matched, false, "laboratory 'inclusión' is not the topic");
assert.equal(m("CURSO LEY DE INCLUSION FINANCIERA").matched, false, "financial inclusion is not the topic");
assert.equal(m("PIJAMA PARA MUJER").matched, false, '"mujer" alone is a garment in the catalogue');
assert.equal(m("GABARDINA PARA MUJER").matched, false, '"mujer" alone is a garment in the catalogue');

// ---- Guard scope: a guard must not silence a hit in a different field ------

const mixed = m(
  "Suministro de telas y géneros de algodón",
  "Servicio de atención a mujeres en situación de violencia de género",
);
assert.ok(mixed.strong, "a cloth guard in one field must not silence the policy hit in another");

// ---- The Mongo pre-filter must be a SUPERSET of the matcher ----------------

const rx = topicRegex(GENERO_TOPIC);
for (const positive of [
  "VIOLENCIA BASADA EN GÉNERO",
  "Inmujeres",
  "COMUNA MUJER 11",
  "identidad de género",
  "masculinidades",
]) {
  assert.ok(rx.test(positive), `pre-filter regex must admit "${positive}"`);
}
// It is allowed to admit false positives (the matcher then drops them) — that is the
// contract. This asserts the direction, not exclusivity.
assert.ok(rx.test("ESTERILLA DE GENERO"), "pre-filter is deliberately loose; the guarded matcher rejects");

// ---- Every term carries a published justification ---------------------------

for (const t of GENERO_TOPIC.terms) {
  assert.ok(t.note && t.note.length > 10, `term "${t.term}" must carry a note explaining why it is on the list`);
}
for (const t of GENERO_TOPIC.rejectedTerms) {
  assert.ok(t.note && t.note.length > 10, `rejected term "${t.term}" must carry its evidence`);
}
assert.ok(
  GENERO_TOPIC.categories.some(c => c.isRejection),
  "the taxonomy needs an explicit rejection bucket so discards stay counted",
);

console.log("spending-topics: all assertions passed");
