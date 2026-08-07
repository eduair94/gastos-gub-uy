/**
 * Timbre profesional — the official DGI value table.
 *
 * The "timbre profesional" is not a product with a market price. It is a menu of NINE
 * administratively fixed denominations created by Ley 17.738 art. 71 (07/01/2004), raised by decree
 * TWICE A YEAR (1er and 2do semestre) and published by DGI. A purchase at any of those nine values
 * is paying the legally mandated amount, however far that value sits from the statistical median of
 * its catalogue code.
 *
 * WHY THIS FILE EXISTS. The ARCE catalogue groups every denomination under ONE classification
 * (`10233`), so the pooled price baseline lands on the dominant cheap denomination (certificado
 * médico) and every legally higher denomination scores as a price spike. The detector's generic
 * defence — `RECURRING_PRICE_MIN_COUNT` in src/jobs/anomaly-stats.ts — is a statistical PROXY for
 * "this is a tariff", and it fails in both directions:
 *
 *   - Every January DGI raises the nine values, and each new value is a singleton until it has been
 *     bought three times, so the whole new official menu is emitted as `critical`. Live proof:
 *     adjudicacion-1358443 / adjudicacion-1359580 were flagged critical at 6540 UYU, which is the
 *     official 2026 cirugía-mayor stamp, and adjudicacion-1296780 / adjudicacion-1274699 at 6000,
 *     the official 2025-1S one.
 *   - Recurrence is date-BLIND. `1500` (official in 2024-2S/2025-1S) sits in the recurring set of
 *     the live `10233|UYU|unidad` baseline, so a 2026 purchase at 1500 is suppressed even though the
 *     2026 legal value is 1690.
 *
 * A table of the actual legal values is date-aware in both directions and is checkable by a reader
 * against a government page, which a z-score is not.
 *
 * ## Sources
 *
 * - 2026: DGI, "Valor de los timbres" (período 01/01/2026–31/12/2026), nine concepts.
 *   https://www.gub.uy/direccion-general-impositiva/datos-y-estadisticas/datos/valor-timbres
 * - 2005–2025: CJPPU, "Timbres profesionales — valores históricos (período 2005-2025)", nine grupos
 *   × 21 years × 2 semesters.  https://www.cjppu.org.uy/timbres.php → Valores históricos
 *
 * Legal basis cited by DGI: Ley 17.738, Decreto 67/005, Ley 20.410 (08/07/2025), Decreto 244/025.
 *
 * The two sources are independent and agree at the seam: each of the nine 2025-2S values chains
 * into its 2026 counterpart (260→270, 160→170, 42→44, 3500→3690, 620→650, 4100→4320, 6200→6540,
 * 1600→1690, 16000→16870). Measured against the live corpus, 92.8% of the 12,986 UYU award-item
 * lines under `10233` land EXACTLY on their own calendar year's menu.
 *
 * ## Maintenance
 *
 * DGI republishes twice a year. `tests/unit/test-timbre-values.ts` FAILS when the current semester
 * is missing from `TIMBRE_VALUES_BY_SEMESTER`, which is the forcing function — a silently stale
 * table is the failure mode that matters. Add the new row; never extrapolate. An unknown year makes
 * `officialTimbrePrices()` return null and the detector then behaves exactly as it did before this
 * file existed.
 */

/** The nine grupos, in the column order used by every row of TIMBRE_VALUES_BY_SEMESTER. */
export const TIMBRE_GRUPOS: ReadonlyArray<string> = [
  // 1 — Doc. no específicamente determinado / escritos ante organismos públicos / presentación al
  //     Estado de contratos y declaraciones juradas.
  "documento-generico",
  // 2 — Análisis industriales, de medicina humana, veterinarios y agronómicos; certificados
  //     médicos/odontológicos; exámenes médicos (radiología, TAC, RM…).
  "analisis-certificado",
  // 3 — Certificado médico/odontológico del certificador, declaraciones juradas de guías de
  //     semovientes, escritos de jurisdicción no comprendida en el art. 88, y RECETAS.
  "receta",
  // 4 — Cirugía menor; proyectos de inversión, informes de auditoría y estudios actuariales.
  "cirugia-menor-proyecto",
  // 5 — Documentos de agrónomos, químicos, veterinarios e ingenieros; PARTOS.
  "documento-tecnico-parto",
  // 6 — Libro recetario (mensual).
  "libro-recetario",
  // 7 — Cirugía mayor.
  "cirugia-mayor",
  // 8 — Certificación de libros de comercio.
  "libros-comercio",
  // 9 — DGI, declaración con activo fiscal ajustado (tasa 0,01%), TOPE del inciso.
  "activo-fiscal-maximo",
];

const GRUPO_COUNT = 9;

/**
 * Official value of each grupo, in UYU, by year and semester: `[valores 1er semestre, valores 2do]`.
 *
 * Transcribed column-for-column from the two sources above. NOT a formula — the values are set by
 * decree and do not follow a clean index, so nothing here may be computed or interpolated.
 *
 * NOTE ON MONOTONICITY: within one semester series (all 1S values year over year, all 2S values year
 * over year) every grupo is monotone non-decreasing. ACROSS the 2S→next-1S boundary a small
 * ROUNDING-DOWN regression is possible and does occur — e.g. grupo 4 goes 3300 (2023-2S) → 3200
 * (2024-1S), and several grupos do the same in 2006. The regressions are a few percent; the test
 * asserts a bound rather than plain monotonicity, and the asymmetric lookback window below relies on
 * the bound, not on strict monotonicity.
 */
export const TIMBRE_VALUES_BY_SEMESTER: Readonly<Record<number, readonly [readonly number[], readonly number[]]>> = {
  //      g1    g2   g3    g4    g5    g6     g7    g8     g9
  2005: [[63, 35, 10, 770, 140, 940, 1400, 320, 3200], [66, 35, 10, 810, 150, 990, 1500, 340, 3400]],
  2006: [[66, 37, 10, 800, 150, 980, 1500, 330, 3300], [68, 38, 10, 820, 160, 1000, 1600, 340, 3400]],
  2007: [[70, 39, 11, 850, 160, 1000, 1600, 350, 3500], [72, 40, 12, 880, 170, 1000, 1700, 360, 3600]],
  2008: [[76, 42, 12, 920, 170, 1100, 1700, 380, 3800], [79, 44, 13, 960, 180, 1200, 1800, 400, 4000]],
  2009: [[82, 45, 13, 990, 180, 1200, 1800, 410, 4100], [85, 47, 14, 1000, 190, 1300, 1900, 430, 4300]],
  2010: [[88, 48, 14, 1100, 190, 1300, 1900, 440, 4400], [91, 50, 15, 1200, 200, 1400, 2000, 460, 4600]],
  2011: [[94, 51, 15, 1200, 200, 1400, 2000, 470, 4700], [97, 53, 16, 1300, 210, 1500, 2100, 490, 4900]],
  2012: [[100, 55, 16, 1300, 220, 1500, 2200, 510, 5100], [100, 57, 17, 1400, 230, 1600, 2300, 530, 5300]],
  2013: [[110, 59, 17, 1400, 240, 1600, 2400, 550, 5500], [120, 61, 18, 1500, 250, 1700, 2500, 570, 5700]],
  2014: [[120, 64, 18, 1500, 260, 1700, 2600, 600, 6000], [130, 67, 19, 1600, 270, 1800, 2700, 630, 6300]],
  2015: [[130, 70, 20, 1600, 280, 1900, 2800, 650, 6500], [140, 73, 21, 1700, 290, 2000, 2900, 680, 6800]],
  2016: [[140, 76, 22, 1700, 310, 2100, 3100, 710, 7100], [150, 79, 23, 1800, 330, 2200, 3300, 740, 7400]],
  2017: [[150, 84, 24, 1900, 340, 2300, 3400, 780, 7800], [160, 88, 25, 2000, 360, 2400, 3600, 820, 8200]],
  2018: [[160, 88, 25, 2000, 360, 2400, 3600, 820, 8200], [170, 90, 26, 2100, 370, 2500, 3700, 840, 8400]],
  2019: [[170, 95, 27, 2200, 390, 2600, 3900, 890, 8900], [180, 99, 28, 2300, 410, 2700, 4100, 930, 9300]],
  2020: [[180, 100, 29, 2400, 420, 2800, 4200, 960, 9600], [190, 100, 30, 2500, 440, 2900, 4400, 1000, 10000]],
  2021: [[200, 110, 32, 2600, 460, 3100, 4600, 1100, 10600], [210, 120, 34, 2700, 480, 3300, 4800, 1200, 11200]],
  2022: [[210, 120, 34, 2800, 490, 3300, 4900, 1200, 12000], [220, 130, 35, 2900, 510, 3400, 5100, 1300, 13000]],
  2023: [[230, 130, 37, 3100, 540, 3600, 5400, 1300, 13000], [240, 140, 39, 3300, 570, 3800, 5700, 1400, 14000]],
  2024: [[240, 140, 39, 3200, 570, 3800, 5700, 1400, 14000], [250, 150, 40, 3300, 590, 3900, 5900, 1500, 15000]],
  2025: [[250, 150, 41, 3400, 600, 4000, 6000, 1500, 15000], [260, 160, 42, 3500, 620, 4100, 6200, 1600, 16000]],
  // DGI publishes ONE schedule for the whole of 2026 (01/01–31/12), so both semesters carry it. If a
  // mid-year decree raises the 2do semestre, replace the second row — do not average the two.
  2026: [[270, 170, 44, 3690, 650, 4320, 6540, 1690, 16870], [270, 170, 44, 3690, 650, 4320, 6540, 1690, 16870]],
};

export const TIMBRE_SOURCE_URL = "https://www.gub.uy/direccion-general-impositiva/datos-y-estadisticas/datos/valor-timbres";
export const TIMBRE_HISTORICAL_SOURCE_URL = "https://www.cjppu.org.uy/timbres.php";
/** Short provenance label stored on each anomaly, so a reader knows which table judged the price. */
export const TIMBRE_SOURCE = "DGI/CJPPU";

/**
 * The ONLY catalogue code that is a fiscal stamp.
 *
 * TRAP — the catalogue also contains, all of them DOORBELLS AND BUZZERS with nothing to do with the
 * timbre profesional: `14624` TIMBRE INALAMBRICO, `290` CAMPANILLA DE TIMBRE, `291` CHICHARRA DE
 * TIMBRE, `15057` INSTALACION DE TIMBRE, `21210` TRANSFORMADOR COMUN PARA TIMBRE, `29828` PULSADOR
 * DE TIMBRE LINEA MODULAR, `66628` TIMBRE ELECTRONICO. Never widen this by matching the WORD
 * "timbre" — `14624` already carries a live price anomaly at 6900 UYU that the official table would
 * silently excuse.
 */
export const TIMBRE_CLASSIFICATION_IDS: ReadonlySet<string> = new Set(["10233"]);

/**
 * Catalogue codes whose name contains "timbre" but which are NOT fiscal stamps. Exported only so the
 * unit test can assert they stay OUT; nothing reads it at runtime.
 */
export const NON_FISCAL_TIMBRE_CLASSIFICATION_IDS: ReadonlyArray<string> = ["290", "291", "14624", "15057", "21210", "29828", "66628"];

/**
 * The table is denominated in pesos. The `10233|USD` baseline (n=10, 1.11–4.40 USD) is a different,
 * pre-normalisation animal and the legal values say nothing about it.
 */
export const TIMBRE_CURRENCY = "UYU";

/**
 * How far back and forward from the release's own semester an official value is still accepted.
 *
 * ASYMMETRIC ON PURPOSE. Stamps are physical and bought in advance, and the OCDS `date` is the award
 * date rather than the date the stamp was purchased, so the observed price legitimately lags (or,
 * for a December award priced at January's new value, leads) the release's own semester. Measured
 * over the 12,986 UYU lines on `10233`: same semester only 84.55%, ±1 semester 96.21%, −2/+1
 * semesters 97.16%, −4/+2 semesters 97.61%.
 *
 * Widening BACKWARD is nearly free: every grupo's per-semester series is monotone year over year, so
 * an older value is at most a few percent above the current one (the 2S→1S rounding regression), and
 * this detector is UPPER-TAIL ONLY — a lower legal value can never mask an overprice. Widening
 * FORWARD admits genuinely higher values and therefore can, so it is capped at one semester, which
 * is exactly what the December-at-January's-price lines need (179 lines at 160 in 2026-1S, 36 lines
 * at 170 in 2025-2S). −4/+2 buys 0.45pp more for a 2-year-wide menu and a 1-year lead; not worth it.
 */
export const TIMBRE_LOOKBACK_SEMESTERS = 2;
export const TIMBRE_LOOKAHEAD_SEMESTERS = 1;

export interface OfficialTimbreMenu {
  /** Calendar year of the release's own semester. */
  year: number;
  /** 1 or 2 — the release's own semester. */
  semester: 1 | 2;
  /** Every legal value inside the lookback/lookahead window, deduplicated. */
  values: ReadonlySet<number>;
  /** Cheapest and dearest legal value in the window. Reported as the anomaly's expected range. */
  min: number;
  max: number;
}

/** 1 for January–June, 2 for July–December. Uses UTC, like every other date read in this repo. */
export function timbreSemester(date: Date): 1 | 2 {
  return date.getUTCMonth() <= 5 ? 1 : 2;
}

/** Absolute semester ordinal, so the window arithmetic is a plain integer range. */
function semesterOrdinal(year: number, semester: 1 | 2): number {
  return year * 2 + (semester - 1);
}

export function isTimbreClassification(classificationId: string): boolean {
  return TIMBRE_CLASSIFICATION_IDS.has(classificationId);
}

/**
 * The legal menu applicable to a purchase recorded on `date`, or null when the table does not cover
 * that year.
 *
 * NULL IS LOAD-BEARING: it means "no opinion", and every caller must then score exactly as it did
 * before this module existed. Falling back to the nearest known year would either suppress a real
 * finding or fabricate a legal value for a year nobody transcribed.
 */
export function officialTimbrePrices(date: Date | null | undefined): OfficialTimbreMenu | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getUTCFullYear();
  if (!TIMBRE_VALUES_BY_SEMESTER[year]) {
    return null;
  }
  const semester = timbreSemester(date);

  const centre = semesterOrdinal(year, semester);
  const values = new Set<number>();
  for (let ordinal = centre - TIMBRE_LOOKBACK_SEMESTERS; ordinal <= centre + TIMBRE_LOOKAHEAD_SEMESTERS; ordinal++) {
    const row = TIMBRE_VALUES_BY_SEMESTER[Math.floor(ordinal / 2)]?.[ordinal % 2];
    if (row) {
      for (const value of row) {
        values.add(value);
      }
    }
  }
  if (values.size === 0) {
    return null;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { year, semester, values, min, max };
}

/** The legal value closest to `price`, for a description that names what the price should have been. */
export function nearestOfficialTimbrePrice(price: number, menu: OfficialTimbreMenu): number | null {
  if (!Number.isFinite(price)) {
    return null;
  }
  let nearest: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const value of menu.values) {
    const distance = Math.abs(value - price);
    // Ties go to the CHEAPER value: for an over-price finding the smaller legal denomination is the
    // conservative reading of what was owed.
    if (distance < bestDistance || (distance === bestDistance && nearest !== null && value < nearest)) {
      bestDistance = distance;
      nearest = value;
    }
  }
  return nearest;
}

/** Sanity check used by the unit test: every row must carry exactly the nine grupos. */
export const TIMBRE_GRUPO_COUNT = GRUPO_COUNT;
