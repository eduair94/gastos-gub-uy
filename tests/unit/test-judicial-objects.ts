/**
 * Unit tests para el clasificador de objetos del gasto judiciales (shared/judicial-objects.ts).
 *
 * Funciones puras: sin base, sin red, sin env. Correr con:
 *   npx tsx tests/unit/test-judicial-objects.ts
 *
 * El bloque grande es el CENSO: los 30 objetos del gasto cuyo nombre publicado por OPP entre 2011 y
 * 2021 contiene una palabra judicial. Cada uno tiene que estar decidido — adentro o afuera con
 * motivo escrito. Un objeto sin decidir hace fallar el test, que es la única defensa contra sumar
 * el sueldo del Poder Judicial a lo que el Estado paga por perder juicios.
 */

import {
  classifyJudicialObject,
  EXCLUDED_LOOKALIKES,
  JUDICIAL_CORE_CODES,
  JUDICIAL_OBJECT_CODES,
  JUDICIAL_WORD_RE,
  normalizeObjectCode,
} from "../../shared/judicial-objects";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

/**
 * El censo, medido contra el datastore de CKAN el 16-08-2026 sobre los once recursos anuales.
 * Cada par es (código publicado, un nombre publicado).
 *
 * El 713 entra al censo por otra puerta: su nombre no trae ninguna palabra judicial, pero comparte
 * el subgrupo «Sent.Judic.y Acontecimientos Graves o Imprevistos» con el 711 y son 4.500 millones
 * por año. Está acá para que quede probado que se decidió excluirlo.
 */
const SUBGROUP_ADJACENT = new Set(["713"]);

const CENSUS: Array<[number, string]> = [
  [42.126, "Partida A.3° Ley 19310 Poder Judicial"],
  [42.128, "Incremento 5% A1 Ley 19625 As.Func.Judiciales"],
  [42.614, "Pago de sentencia con condena a futuro no absorbe c/ascenso"],
  [42.617, "Pago sentencia c/condena a futuro no abs.c/asc. A52 L17930"],
  [45.7, "Reparación p/Sentencias Judiciales y complemento A21L16736"],
  [45.7, "Complemento reparación func. al amparo A21Ley16736"],
  [48.35, "Incremento Ret.Sal Lit.C Art. 647 Ley 18.719 Poder Judicial"],
  [152.2, "Medicamentos oncologicos por amparos judiciales"],
  [152.27, "Medicamentos al amparo Ordenanza 692/16 MSP"],
  [194.1, "Articulos medicos quirúrgicos p/ gastos por amparos judicial"],
  [279, "Otros servicios para mantenimiento, reparaciones y limpieza"],
  [513.26, "Reparación a familiares por violencia doméstica"],
  [513.9, "Sistema de Regulación Jub.y Pens.de Magistrados Judiciales"],
  [522.2, "Fondo Permanente de Indemnización-MGAP"],
  [578.5, "Indemnización p/despido y seguro de desempleo No Func.Pub."],
  [711, "Sentencias Judiciales A52 L17930"],
  [713, "Acontecimientos Graves o Imprevistos"],
  [714, "Acuerdo o Convenio Judicial"],
  [749.4, "Convenios Poder Judicial Funcionarios (ni magistr, ni infor)"],
  [749.5, "Pago Convenio Poder Judicial y Otros"],
  [793, "Indemnizaciones"],
  [793.1, "Pasivos Militares- Indemnización- L17.949/A6º"],
  [794.1, "Gastos de manten.y reparaciones en  el exterior"],
];

console.log("normalizeObjectCode");
check("711 numérico → '711'", normalizeObjectCode(711) === "711");
check("'711.0' texto → '711'", normalizeObjectCode("711.0") === "711");
check("45.7 mantiene el decimal", normalizeObjectCode(45.7) === "45.7");
check("42.614 mantiene tres decimales", normalizeObjectCode(42.614) === "42.614");
check("coma decimal → punto", normalizeObjectCode("152,2") === "152.2");
check("vacío → null", normalizeObjectCode("") === null);
check("null → null", normalizeObjectCode(null) === null);
check("texto no numérico → null", normalizeObjectCode("Sentencias") === null);

console.log("\nlos objetos que entran");
check("711 es sentencia y va al titular", classifyJudicialObject(711)?.category === "sentencia" && classifyJudicialObject(711)?.judicial === true);
check("714 es acuerdo", classifyJudicialObject("714.0")?.category === "acuerdo");
check("152.2 es amparo", classifyJudicialObject(152.2)?.category === "amparo");
check("194.1 es amparo", classifyJudicialObject(194.1)?.category === "amparo");
check("45.7 es sentencia", classifyJudicialObject(45.7)?.category === "sentencia");
check("42.614 es sentencia", classifyJudicialObject(42.614)?.category === "sentencia");
check("42.617 es sentencia", classifyJudicialObject(42.617)?.category === "sentencia");
check(
  "793 entra como indemnización pero NO al titular",
  classifyJudicialObject(793)?.category === "indemnizacion" && classifyJudicialObject(793)?.judicial === false
);
check("el titular son 7 códigos", JUDICIAL_CORE_CODES.length === 7, JUDICIAL_CORE_CODES.join(","));
check("se piden 8 códigos al datastore", JUDICIAL_OBJECT_CODES.length === 8, JUDICIAL_OBJECT_CODES.join(","));

console.log("\nlas dos trampas que cambian la cifra publicada");
check(
  "152.27 «al amparo Ordenanza 692/16» NO es un amparo judicial",
  classifyJudicialObject(152.27) === null
);
check(
  "713 «Acontecimientos Graves o Imprevistos» queda afuera pese a compartir subgrupo con el 711",
  classifyJudicialObject(713) === null
);

console.log("\nsueldos y prestaciones que comparten palabra");
for (const code of [42.126, 42.128, 48.35, 513.9, 749.4, 749.5]) {
  check(`${code} (nómina/convenio del Poder Judicial) queda afuera`, classifyJudicialObject(code) === null);
}
for (const code of [513.26, 522.2, 578.5, 793.1]) {
  check(`${code} (prestación por ley, sin juicio) queda afuera`, classifyJudicialObject(code) === null);
}
for (const code of [279, 794.1]) {
  check(`${code} (reparaciones edilicias) queda afuera`, classifyJudicialObject(code) === null);
}

console.log("\ncenso: todo objeto con palabra judicial está decidido");
for (const [code, name] of CENSUS) {
  const canonical = normalizeObjectCode(code)!;
  const included = classifyJudicialObject(code) !== null;
  const excluded = Object.prototype.hasOwnProperty.call(EXCLUDED_LOOKALIKES, canonical);
  check(
    `${canonical} «${name.slice(0, 46)}» decidido`,
    included !== excluded,
    included && excluded ? "está en las dos listas" : "no está en ninguna lista"
  );
  check(
    `${canonical} el nombre publicado dispara la regla de auditoría`,
    JUDICIAL_WORD_RE.test(name) || SUBGROUP_ADJACENT.has(canonical),
    name
  );
}

console.log("\nlas listas no se pisan");
for (const code of JUDICIAL_OBJECT_CODES) {
  check(
    `${code} incluido y no excluido`,
    !Object.prototype.hasOwnProperty.call(EXCLUDED_LOOKALIKES, code)
  );
}
for (const [code, reason] of Object.entries(EXCLUDED_LOOKALIKES)) {
  check(`${code} excluido con motivo escrito`, reason.trim().length > 20, reason);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
