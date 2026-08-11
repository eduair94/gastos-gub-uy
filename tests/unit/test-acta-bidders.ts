/**
 * Unit tests for the acta bidder parser (shared/acta-bidders.ts).
 *
 * Driven off REAL acta text cut from the corpus (tests/fixtures/acta-*.txt), including the
 * mid-word line wrapping the generator produces — "se present\naron", "la s firmas" — because that
 * wrapping is precisely what a naive parser trips on.
 *
 * Pure functions only — no database, no network. Run with:
 *   npx tsx tests/unit/test-acta-bidders.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlausibleBidderName, parseActaBidders } from "../../shared/acta-bidders";

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

const fixture = (id: string): string => readFileSync(join(__dirname, "..", "fixtures", `acta-${id}.txt`), "utf8");
const has = (names: string[], fragment: string): boolean => names.some((n) => n.toUpperCase().includes(fragment.toUpperCase()));

console.log("🧪 Acta bidder parser");
console.log("=====================");

// --- comma list, wrapped mid-word --------------------------------------------
// "…se present\naron los siguientes oferentes, tratándose de las \nfirmas\n:\n FIGUEREDO…"
console.log("\n📊 1322022 — comma list, 3 firms");
{
  const result = parseActaBidders(fixture("1322022"));
  check("parses", result !== null);
  if (result) {
    check("counts 3 bidders", result.count === 3, `got ${result.count}: ${result.bidders.join(" | ")}`);
    check("finds FIGUEREDO", has(result.bidders, "FIGUEREDO"), result.bidders.join(" | "));
    check("finds BARRETO", has(result.bidders, "BARRETO"), result.bidders.join(" | "));
    check("finds PIMIENTA", has(result.bidders, "PIMIENTA"), result.bidders.join(" | "));
    check("records the phrasing that matched", result.marker === "siguientes oferentes", result.marker);
    check("carries a checkable excerpt", result.excerpt.length > 40);
  }
}

// --- bullet list -------------------------------------------------------------
// "G) OFERTAS PRESENTADAS:\n· GRAMA LTDA.\n· PASCUAL AMOROSO E HIJOS \nS.A.S.\nH) CRITERIO…"
console.log("\n📊 1330785 — bullet list, 2 firms, terminated by the next section header");
{
  const result = parseActaBidders(fixture("1330785"));
  check("parses", result !== null);
  if (result) {
    check("counts 2 bidders", result.count === 2, `got ${result.count}: ${result.bidders.join(" | ")}`);
    check("finds GRAMA", has(result.bidders, "GRAMA"), result.bidders.join(" | "));
    check("finds PASCUAL AMOROSO", has(result.bidders, "PASCUAL AMOROSO"), result.bidders.join(" | "));
    check("stops at 'H) CRITERIO Y DICTAMEN' — no clause swallowed", !has(result.bidders, "CRITERIO"), result.bidders.join(" | "));
  }
}

// --- numbered list, wrapped mid-word ----------------------------------------
// "se presentaron la s firmas: 1) C.I.E.M.S.A.; 2) M D CERVINI S.A.; … y 5) SEVICOL LIMITADA según consta…"
console.log("\n📊 1224434 — numbered list, 5 firms");
{
  const result = parseActaBidders(fixture("1224434"));
  check("parses despite 'la s firmas'", result !== null);
  if (result) {
    check("counts 5 bidders", result.count === 5, `got ${result.count}: ${result.bidders.join(" | ")}`);
    check("finds C.I.E.M.S.A.", has(result.bidders, "C.I.E.M.S.A"), result.bidders.join(" | "));
    check("finds PROSEGUR", has(result.bidders, "PROSEGUR"), result.bidders.join(" | "));
    check("finds SEVICOL", has(result.bidders, "SEVICOL"), result.bidders.join(" | "));
    check("drops the 'según consta en Acta obrante a fs. 319' tail", !has(result.bidders, "consta"), result.bidders.join(" | "));
  }
}

// --- fail closed -------------------------------------------------------------
console.log("\n📊 fails closed — the common case, ~92% of actas");
{
  check("empty input -> null", parseActaBidders("") === null);
  check("short input -> null", parseActaBidders("RESOLUCIÓN 12/26") === null);

  // An acta that mentions offers WITHOUT enumerating them must not be turned into a count.
  const mentionsOnly = "III) Que en consecuencia corresponde rechazar la totalidad de las ofertas presentadas dejando sin efecto el presente llamado, dictando el acto administrativo respectivo.";
  const r = parseActaBidders(mentionsOnly);
  check("'rechazar la totalidad de las ofertas presentadas' -> null, not a count", r === null, JSON.stringify(r));

  // A real acta that only says all offers complied — again, no enumeration.
  const compliedOnly = "concluyendose todas las ofertas presentadas cumplen la totalidad de los requisitos de admisibilidad excluyentes; que posteriormente se procedio a la elaboracion del informe tecnico.";
  check("'todas las ofertas presentadas cumplen' -> null", parseActaBidders(compliedOnly) === null);

  // One surviving candidate is a fragment, not an enumeration.
  check("a single candidate is not an enumeration", parseActaBidders("OFERTAS PRESENTADAS: · GRAMA LTDA.") === null);

  // Silence must never become "one bidder".
  const silent = "VISTAS estas actuaciones relacionadas con la Licitación Abreviada Nº103794, cuyo objeto es Equipamiento IBM Power. SE RESUELVE: ADJUDICAR a la firma indicada por un monto de USD 12.000.";
  check("an acta that says nothing about offers -> null", parseActaBidders(silent) === null);
}

// --- explicit sole bidder ----------------------------------------------------
console.log("\n📊 explicit sole-bidder statements carry a count, not a name list");
{
  const sole = "II) Que al llamado se presentó un único oferente, por lo que la Comisión Asesora recomienda adjudicar.";
  const r = parseActaBidders(sole);
  check("'único oferente' parses", r !== null);
  if (r) {
    check("counts 1", r.count === 1, String(r.count));
    check("names list is empty (the acta gave none)", r.bidders.length === 0);
    check("marker recorded", r.marker === "único oferente", r.marker);
  }
  const soleOffer = "II) Que abierto el acto público de recepción de propuestas se recibió una única oferta válida, presentada en tiempo y forma.";
  check("'única oferta' also parses", parseActaBidders(soleOffer)?.count === 1, JSON.stringify(parseActaBidders(soleOffer)));
}

// --- conjunction stripping ---------------------------------------------------
// Observed on acta 1285775, where the comma list ends "…, y MARTINEZ FERNANDEZ HAYDEE ROXANA".
console.log("\n📊 leading/trailing conjunctions are stripped");
{
  const acta = "II) Que se presentaron las siguientes firmas: ELIAS ANA BEATRIZ, y MARTINEZ FERNANDEZ HAYDEE ROXANA, según consta en acta.";
  const r = parseActaBidders(acta);
  check("parses", r !== null);
  if (r) {
    check("counts 2", r.count === 2, `${r.count}: ${r.bidders.join(" | ")}`);
    check("no name starts with 'Y '", r.bidders.every((n) => !/^y\s/i.test(n)), r.bidders.join(" | "));
    check("MARTINEZ kept its own name", has(r.bidders, "MARTINEZ FERNANDEZ HAYDEE ROXANA"), r.bidders.join(" | "));
  }
}

// --- RUT-bearing lists -------------------------------------------------------
// Observed on acta 1265228: 7 firms, each with its RUT appended.
console.log("\n📊 names carrying a RUT survive intact");
{
  const acta = "se presentaron los siguientes oferentes: ABACUS S.A - RUT 211958430010, ACUAMAR SOCIEDAD ANONIMA - RUT 214809180017, y PALDIR S.A - RUT 213043330015.";
  const r = parseActaBidders(acta);
  check("parses 3", r?.count === 3, JSON.stringify(r?.bidders));
  check("keeps the RUT on the name", (r?.bidders ?? []).some((n) => n.includes("211958430010")), (r?.bidders ?? []).join(" | "));
}

// --- Title Case names, and the clause that ends in a legal form --------------
// Real acta 1127664. The names are Title Case, so the all-caps rule cannot carry this one; the
// legal-form hatch has to accept them WITHOUT also accepting the trailing clause.
console.log("\n📊 1127664-shaped: Title Case firms, trailing clause rejected");
{
  const acta = "II) Que se presentaron las firmas: Alixpa SA; Confir SA; Diora SA; Emipal SA; Lancer SA; Logimed SRL; Salomon Najson e Hijo Ltda; quedan descalificadas las ofertas de las firmas Confir SA por no cumplir.";
  const r = parseActaBidders(acta);
  check("parses", r !== null);
  if (r) {
    check("keeps the Title Case firms", has(r.bidders, "Alixpa SA") && has(r.bidders, "Diora SA"), r.bidders.join(" | "));
    check("keeps 'Salomon Najson e Hijo Ltda' (2 lowercase words is fine)", has(r.bidders, "Salomon Najson e Hijo Ltda"), r.bidders.join(" | "));
    check("REJECTS 'quedan descalificadas las ofertas de las firmas Confir SA'", !r.bidders.some((n) => /quedan|descalific/i.test(n)), r.bidders.join(" | "));
    check("counts 7, not 8", r.count === 7, `${r.count}: ${r.bidders.join(" | ")}`);
  }
}

// --- mojibake from old actas -------------------------------------------------
// Real output from acta 878024, whose embedded font is not WinAnsi-encoded.
console.log("\n📊 mojibake is rejected rather than published");
{
  const acta = "se presentaron las siguientes firmas: COOPERATIVA DE TEJEDORAS DE DOLORES. I\\, IOREIRA FEDERTCO ANDRES. PEÑALVA ISLAS PEL]ROALBERTO";
  const r = parseActaBidders(acta);
  check("a garbled acta yields nothing rather than mangled names", r === null, JSON.stringify(r?.bidders));

  const oneGood = "se presentaron las siguientes firmas: GRAMA LTDA., PEL]ROALBERTO S.A., ACUAMAR SOCIEDAD ANONIMA";
  const r2 = parseActaBidders(oneGood);
  check("a garbled entry is dropped, clean ones survive", r2?.count === 2, JSON.stringify(r2?.bidders));
  check("…and the garbled one is not among them", !(r2?.bidders ?? []).some((n) => n.includes("]")), JSON.stringify(r2?.bidders));
}

// --- price-table headings ----------------------------------------------------
// Both strings below were PUBLISHED as bidders before these guards existed — found by auditing the
// live collection, not by imagining failure modes.
console.log("\n📊 price-table headings and currency noise are rejected");
{
  // acta i331940
  const header = "OFERTAS PRESENTADAS: <H>OFERENTE P TOTAL COMP $ VAR %</> MAYATLI, % SERVICE";
  const r = parseActaBidders(header);
  check("a table heading is never a bidder", !(r?.bidders ?? []).some(n => /OFERENTE P TOTAL/i.test(n)), JSON.stringify(r?.bidders));
  check("…and neither is a bare '% SERVICE'", !(r?.bidders ?? []).some(n => n.includes("%")), JSON.stringify(r?.bidders));

  // acta 896469
  const garbled = "se presentaron las firmas: L '277$$0%526, ('8$5'2\\LL52%/(6 =";
  check("pure mojibake with currency signs -> null", parseActaBidders(garbled) === null, JSON.stringify(parseActaBidders(garbled)));

  // The heading rule must NOT eat a real firm that happens to share one word.
  const realFirm = "se presentaron las firmas: TOTAL URUGUAY S.A., ANCAP DISTRIBUCION S.A., y PRECIO JUSTO LTDA.";
  const r2 = parseActaBidders(realFirm);
  check("TOTAL URUGUAY S.A. survives the heading rule", has(r2?.bidders ?? [], "TOTAL URUGUAY"), JSON.stringify(r2?.bidders));
  check("…and so does PRECIO JUSTO LTDA.", has(r2?.bidders ?? [], "PRECIO JUSTO"), JSON.stringify(r2?.bidders));
  check("all three kept", r2?.count === 3, String(r2?.count));
}

// --- isPlausibleBidderName ---------------------------------------------------
// The hygiene sweep validates STORED names one by one with this, because re-parsing the stored
// excerpt gives false positives: the excerpt is a truncated window, so a re-parse yields fewer
// names than the full text did. That version flagged three good rows and would have deleted them.
console.log("\n📊 isPlausibleBidderName (what the stored-row sweep uses)");
{
  const good = [
    "BARRACA OLIMPIA S.R.L",
    "CANTERA MELILLA S.A",
    "GONZALEZ ELENA RICHARD HUMBERTO",
    "Salomon Najson e Hijo Ltda",
    "ABACUS S.A - RUT 211958430010",
    "TOTAL URUGUAY S.A.",
  ];
  for (const n of good) check(`accepts "${n}"`, isPlausibleBidderName(n));

  const bad = [
    "<H>OFERENTE P TOTAL COMP $ VAR %</>",
    "% SERVICE",
    "L '277$$0%526",
    "COOPERATIVA DE TEJEDORAS DE DOLORES. I\\",
    "quedan descalificadas las ofertas de las firmas Confir SA",
    "OFERENTE PRECIO TOTAL",
    "ab",
  ];
  for (const n of bad) check(`rejects "${n.slice(0, 40)}"`, !isPlausibleBidderName(n));
}

// --- hygiene -----------------------------------------------------------------
console.log("\n📊 name hygiene");
{
  const result = parseActaBidders(fixture("1322022"));
  if (result) {
    check("no name is blank or punctuation", result.bidders.every((n) => n.trim().length >= 4));
    check("no name carries a line break", result.bidders.every((n) => !n.includes("\n")));
    check("no duplicates", new Set(result.bidders.map((n) => n.toUpperCase())).size === result.bidders.length);
    check("no name exceeds the paragraph guard", result.bidders.every((n) => n.length <= 90));
  }
}

console.log("\n=====================");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
