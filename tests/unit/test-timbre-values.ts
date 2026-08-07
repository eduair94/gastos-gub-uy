/**
 * Unit tests for the official timbre-profesional value table (shared/timbre-values.ts) and the
 * scorer gate it feeds (src/jobs/anomaly-stats.ts).
 *
 * Pure functions only - no database, no network, no env. Run with:
 *   npx tsx tests/unit/test-timbre-values.ts
 *
 * The last block is a FRESHNESS GUARD that reads the real clock. It fails when the semester we are
 * living in is missing from the table. That is intentional: DGI republishes the nine values twice a
 * year, and a silently stale table is the failure mode that matters — it would quietly stop
 * recognising legal prices and start flagging them as critical, which is exactly the bug this whole
 * module exists to kill.
 */

import { BaselineInput, scoreUnitPrice } from "../../src/jobs/anomaly-stats";
import {
  isTimbreClassification,
  nearestOfficialTimbrePrice,
  NON_FISCAL_TIMBRE_CLASSIFICATION_IDS,
  officialTimbrePrices,
  timbreSemester,
  TIMBRE_GRUPO_COUNT,
  TIMBRE_GRUPOS,
  TIMBRE_LOOKAHEAD_SEMESTERS,
  TIMBRE_LOOKBACK_SEMESTERS,
  TIMBRE_VALUES_BY_SEMESTER,
} from "../../shared/timbre-values";

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

/** UTC so the semester never depends on the machine's timezone. */
function utc(year: number, month: number, day = 15): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

const YEARS = Object.keys(TIMBRE_VALUES_BY_SEMESTER)
  .map(Number)
  .sort((a, b) => a - b);

console.log("🧪 Timbre profesional — official value table");
console.log("============================================");

// --- table integrity -------------------------------------------------------
console.log("\n📊 table integrity");
{
  check("grupo labels match the row width", TIMBRE_GRUPOS.length === TIMBRE_GRUPO_COUNT, `${TIMBRE_GRUPOS.length} labels vs ${TIMBRE_GRUPO_COUNT} columns`);
  check("years are contiguous from 2005", YEARS.length > 0 && YEARS[0] === 2005 && YEARS.every((y, i) => y === 2005 + i), YEARS.join(","));

  let widthOk = true;
  let positiveOk = true;
  let integerOk = true;
  for (const year of YEARS) {
    const row = TIMBRE_VALUES_BY_SEMESTER[year]!;
    if (row.length !== 2) widthOk = false;
    for (const semester of row) {
      if (semester.length !== TIMBRE_GRUPO_COUNT) widthOk = false;
      for (const value of semester) {
        if (!(value > 0)) positiveOk = false;
        if (!Number.isInteger(value)) integerOk = false;
      }
    }
  }
  check(`every year carries 2 semesters x ${TIMBRE_GRUPO_COUNT} grupos`, widthOk);
  check("every value is positive", positiveOk);
  check("every value is a whole peso amount", integerOk);
}

// --- monotonicity ----------------------------------------------------------
//
// Within ONE semester series (all 1S values year over year, likewise 2S) each grupo only ever rises.
// ACROSS the 2S -> next-1S boundary the published table does round DOWN occasionally (grupo 4 goes
// 3300 in 2023-2S to 3200 in 2024-1S; several grupos do the same in 2006). The asymmetric lookback
// window leans on that regression being small, not on it being absent, so the bound is what is
// asserted here.
console.log("\n📊 monotonicity (and the bounded 2S->1S rounding regression)");
{
  let seriesMonotone = true;
  let worstSeries = "";
  for (let grupo = 0; grupo < TIMBRE_GRUPO_COUNT; grupo++) {
    for (const semester of [0, 1]) {
      for (let i = 1; i < YEARS.length; i++) {
        const previous = TIMBRE_VALUES_BY_SEMESTER[YEARS[i - 1]!]![semester]![grupo]!;
        const current = TIMBRE_VALUES_BY_SEMESTER[YEARS[i]!]![semester]![grupo]!;
        if (current < previous) {
          seriesMonotone = false;
          worstSeries = `grupo ${grupo + 1} ${semester + 1}S: ${YEARS[i - 1]}=${previous} -> ${YEARS[i]}=${current}`;
        }
      }
    }
  }
  check("each grupo rises year over year within its own semester series", seriesMonotone, worstSeries);

  let worstDrop = 0;
  let worstDropWhere = "";
  for (let grupo = 0; grupo < TIMBRE_GRUPO_COUNT; grupo++) {
    for (let i = 1; i < YEARS.length; i++) {
      const previous = TIMBRE_VALUES_BY_SEMESTER[YEARS[i - 1]!]![1]![grupo]!;
      const current = TIMBRE_VALUES_BY_SEMESTER[YEARS[i]!]![0]![grupo]!;
      const drop = (previous - current) / previous;
      if (drop > worstDrop) {
        worstDrop = drop;
        worstDropWhere = `grupo ${grupo + 1}: ${YEARS[i - 1]}-2S=${previous} -> ${YEARS[i]}-1S=${current}`;
      }
    }
  }
  // 5% is the documented headroom. A bigger regression would mean a transcription error, or a real
  // change in how the schedule is set — either way the lookback rationale needs re-reading.
  check(`the 2S->1S regression stays under 5% (worst ${(worstDrop * 100).toFixed(2)}%)`, worstDrop < 0.05, worstDropWhere);
}

// --- anchors verified against the published sources ------------------------
console.log("\n📊 source anchors (DGI 2026 + CJPPU histórico)");
{
  // DGI, período 01/01/2026-31/12/2026, all nine concepts.
  const dgi2026 = [270, 170, 44, 3690, 650, 4320, 6540, 1690, 16870];
  check("2026 1S matches the DGI page exactly", JSON.stringify(TIMBRE_VALUES_BY_SEMESTER[2026]![0]) === JSON.stringify(dgi2026));
  check("2026 2S matches the DGI page exactly", JSON.stringify(TIMBRE_VALUES_BY_SEMESTER[2026]![1]) === JSON.stringify(dgi2026));

  // The parto (grupo 5) series already documented by hand at anomaly-stats.ts:100.
  const parto = (year: number, semester: 0 | 1): number => TIMBRE_VALUES_BY_SEMESTER[year]![semester]![4]!;
  check("parto 2023-2S = 570", parto(2023, 1) === 570, String(parto(2023, 1)));
  check("parto 2024-1S = 570", parto(2024, 0) === 570, String(parto(2024, 0)));
  check("parto 2024-2S = 590", parto(2024, 1) === 590, String(parto(2024, 1)));
  check("parto 2025-1S = 600", parto(2025, 0) === 600, String(parto(2025, 0)));
  check("parto 2025-2S = 620", parto(2025, 1) === 620, String(parto(2025, 1)));
  check("parto 2026 = 650", parto(2026, 0) === 650, String(parto(2026, 0)));

  // Cirugía mayor (grupo 7) — the denomination behind the live false positives.
  const cirugia = (year: number, semester: 0 | 1): number => TIMBRE_VALUES_BY_SEMESTER[year]![semester]![6]!;
  check("cirugía mayor 2025-1S = 6000 (adjudicacion-1274699 / -1296780)", cirugia(2025, 0) === 6000, String(cirugia(2025, 0)));
  check("cirugía mayor 2025-2S = 6200", cirugia(2025, 1) === 6200, String(cirugia(2025, 1)));
  check("cirugía mayor 2026 = 6540 (adjudicacion-1358443 / -1359580)", cirugia(2026, 0) === 6540, String(cirugia(2026, 0)));
}

// --- semester boundary -----------------------------------------------------
console.log("\n📊 semester boundary");
{
  check("January is 1S", timbreSemester(utc(2026, 1, 1)) === 1);
  check("30 June is 1S", timbreSemester(utc(2026, 6, 30)) === 1);
  check("1 July is 2S", timbreSemester(utc(2026, 7, 1)) === 2);
  check("31 December is 2S", timbreSemester(utc(2026, 12, 31)) === 2);
}

// --- the accepted window ---------------------------------------------------
console.log("\n📊 officialTimbrePrices window (-2 / +1 semesters)");
{
  check("lookback is 2 semesters", TIMBRE_LOOKBACK_SEMESTERS === 2);
  check("lookahead is 1 semester", TIMBRE_LOOKAHEAD_SEMESTERS === 1);

  const menu = officialTimbrePrices(utc(2026, 9));
  check("2026-2S resolves a menu", menu !== null);
  if (menu) {
    check("…year/semester reported", menu.year === 2026 && menu.semester === 2, `${menu.year}-${menu.semester}S`);
    check("…accepts the current 6540", menu.values.has(6540));
    check("…accepts 6200 from 2025-2S (-2 semesters)", menu.values.has(6200));
    check("…rejects 6000 from 2025-1S, which is 3 semesters back", !menu.values.has(6000));
    check("…rejects 8643.14 (a real off-menu flag)", !menu.values.has(8643.14));
    check("…rejects 24480 (a real off-menu flag)", !menu.values.has(24480));
    check("…min is the cheapest legal value in the window", menu.min === 42, String(menu.min));
    check("…max is the dearest legal value in the window", menu.max === 16870, String(menu.max));
  }

  // The December-award-at-January's-price case the lookahead exists for.
  const december = officialTimbrePrices(utc(2025, 12));
  check("2025-2S accepts 170, the 2026 value (+1 semester)", december?.values.has(170) === true);

  // The 2025 cirugía-mayor false positive: an award dated 2025-2S paying the 2025-1S value.
  const late2025 = officialTimbrePrices(utc(2025, 11));
  check("2025-2S accepts 6000 from 2025-1S (-1 semester)", late2025?.values.has(6000) === true);

  check("a year outside the table yields null (no extrapolation)", officialTimbrePrices(utc(2004, 5)) === null);
  check("a year past the table yields null (forces the update)", officialTimbrePrices(utc(2030, 5)) === null);
  check("a null date yields null", officialTimbrePrices(null) === null);
  check("an invalid date yields null", officialTimbrePrices(new Date("nope")) === null);
}

// --- nearest legal value ---------------------------------------------------
console.log("\n📊 nearestOfficialTimbrePrice");
{
  const menu = officialTimbrePrices(utc(2026, 3))!;
  check("4880 -> 4320", nearestOfficialTimbrePrice(4880, menu) === 4320, String(nearestOfficialTimbrePrice(4880, menu)));
  check("700 -> 650", nearestOfficialTimbrePrice(700, menu) === 650, String(nearestOfficialTimbrePrice(700, menu)));
  check("24480 -> 16870 (the legal ceiling)", nearestOfficialTimbrePrice(24480, menu) === 16870, String(nearestOfficialTimbrePrice(24480, menu)));
  check("NaN -> null", nearestOfficialTimbrePrice(Number.NaN, menu) === null);
}

// --- classification scope --------------------------------------------------
console.log("\n📊 classification scope (doorbells stay out)");
{
  check("10233 TIMBRE PROFESIONAL is in scope", isTimbreClassification("10233"));
  let allExcluded = true;
  for (const id of NON_FISCAL_TIMBRE_CLASSIFICATION_IDS) {
    if (isTimbreClassification(id)) allExcluded = false;
  }
  check("14624/290/291/15057/21210/29828/66628 (doorbells) stay out", allExcluded);
}

// --- the scorer gate -------------------------------------------------------
//
// Miniature of the live 10233|UYU|unidad baseline: median on the cheap denomination, p95 at 170.
// Without the gate, 6540 scores z >= 14 and lands as "critical" — which is what production did.
console.log("\n📊 scoreUnitPrice officialPrices gate");
{
  const baseline: BaselineInput = {
    n: 8053,
    medianLn: Math.log(150),
    madLn: 0.07,
    p25: 140,
    p75: 160,
    p95: 170,
  };
  check("without the gate, the official 6540 is flagged (the bug)", scoreUnitPrice(6540, baseline) !== null);

  const menu = officialTimbrePrices(utc(2026, 9))!;
  check("with the gate, the official 6540 is suppressed", scoreUnitPrice(6540, baseline, { officialPrices: menu.values }) === null);
  check("an off-menu 8643.14 is still flagged", scoreUnitPrice(8643.14, baseline, { officialPrices: menu.values }) !== null);
  check("an off-menu 24480 is still flagged", scoreUnitPrice(24480, baseline, { officialPrices: menu.values }) !== null);
  check("an empty context changes nothing", scoreUnitPrice(6540, baseline, {}) !== null);

  // The gate must not resurrect a price the recurrence rule already suppressed, nor vice versa.
  const withRecurring: BaselineInput = { ...baseline, recurringPrices: new Set([6540]) };
  check("recurrence still suppresses when the menu has no opinion", scoreUnitPrice(6540, withRecurring) === null);
}

// --- freshness guard -------------------------------------------------------
console.log("\n📊 freshness guard (reads the real clock — see the module docblock)");
{
  const now = new Date();
  const year = now.getUTCFullYear();
  const semester = timbreSemester(now);
  const row = TIMBRE_VALUES_BY_SEMESTER[year];
  check(
    `the current semester (${year}-${semester}S) is loaded — update shared/timbre-values.ts from ${"https://www.gub.uy/direccion-general-impositiva/datos-y-estadisticas/datos/valor-timbres"} when this fails`,
    Boolean(row?.[semester - 1]?.length)
  );
}

console.log("\n============================================");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
