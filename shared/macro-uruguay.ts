/**
 * Uruguay macro context for the year-over-year spending analysis.
 *
 * Public procurement is one slice of what the State spends — not the budget.
 * To say whether spending "grew", the slice has to be read against the size of
 * the economy, the size of the whole public budget and the number of people it
 * serves. None of that is in the OCDS feed, so it lives here as a curated
 * table, committed so every figure is auditable in git history.
 *
 * Source: World Bank Open Data, which republishes BCU national accounts, INE
 * population and IMF Government Finance Statistics.
 *
 * `centralGovExpenseUyu` is DERIVED (gdpNominalUyu x pct / 100) — the World
 * Bank publishes the ratio, not the level. A `null` means there is no
 * observation for that year; consumers show "sin dato" rather than
 * interpolating.
 *
 * GENERATED FILE — run `npm run refresh-macro-table`, do not hand-edit.
 * World Bank series lastUpdated at generation: 2026-07-13.
 */

export interface MacroYear {
  year: number
  /** GDP at current prices, UYU. World Bank NY.GDP.MKTP.CN. */
  gdpNominalUyu: number | null
  /** Total population. World Bank SP.POP.TOTL. */
  population: number | null
  /** Central-government expense as % of GDP. World Bank GC.XPN.TOTL.GD.ZS. */
  centralGovExpensePctGdp: number | null
  /** Derived: gdpNominalUyu x centralGovExpensePctGdp / 100, UYU. */
  centralGovExpenseUyu: number | null
}

export const MACRO_SOURCE = {
  name: 'World Bank Open Data',
  url: 'https://data.worldbank.org/country/uruguay',
  indicators: {
    gdpNominalUyu: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CN?locations=UY',
    population: 'https://data.worldbank.org/indicator/SP.POP.TOTL?locations=UY',
    centralGovExpensePctGdp: 'https://data.worldbank.org/indicator/GC.XPN.TOTL.GD.ZS?locations=UY',
  },
  lastUpdated: '2026-07-13',
} as const

export const MACRO_URUGUAY: MacroYear[] = [
  { year: 2000, gdpNominalUyu: 276152265900, population: 3266206, centralGovExpensePctGdp: 26.5509318784844, centralGovExpenseUyu: 73321000000 },
  { year: 2001, gdpNominalUyu: 278353052800, population: 3274251, centralGovExpensePctGdp: 27.2702030108606, centralGovExpenseUyu: 75907442585 },
  { year: 2002, gdpNominalUyu: 289233255700, population: 3278867, centralGovExpensePctGdp: 27.8910991697021, centralGovExpenseUyu: 80670334179 },
  { year: 2003, gdpNominalUyu: 339791593800, population: 3281186, centralGovExpensePctGdp: 27.9127259961418, centralGovExpenseUyu: 94845096535 },
  { year: 2004, gdpNominalUyu: 392849675900, population: 3283148, centralGovExpensePctGdp: 26.5917253076624, centralGovExpenseUyu: 104465506687 },
  { year: 2005, gdpNominalUyu: 425018448100, population: 3285771, centralGovExpensePctGdp: 26.5571821460886, centralGovExpenseUyu: 112872923416 },
  { year: 2006, gdpNominalUyu: 475242288900, population: 3289506, centralGovExpensePctGdp: 26.6435810165771, centralGovExpenseUyu: 126621564268 },
  { year: 2007, gdpNominalUyu: 558558125600, population: 3295153, centralGovExpensePctGdp: 26.0616997001223, centralGovExpenseUyu: 145569741345 },
  { year: 2008, gdpNominalUyu: 651934418500, population: 3302177, centralGovExpensePctGdp: 24.9831658197862, centralGovExpenseUyu: 162873856810 },
  { year: 2009, gdpNominalUyu: 738160788900, population: 3310091, centralGovExpensePctGdp: 28.2002665421058, centralGovExpenseUyu: 208163309979 },
  { year: 2010, gdpNominalUyu: 841493831900, population: 3318580, centralGovExpensePctGdp: 28.2518723908528, centralGovExpenseUyu: 237737763565 },
  { year: 2011, gdpNominalUyu: 972323702000, population: 3326825, centralGovExpensePctGdp: 27.7352832980739, centralGovExpenseUyu: 269676733324 },
  { year: 2012, gdpNominalUyu: 1101488513300, population: 3335401, centralGovExpensePctGdp: 28.8425661023934, centralGovExpenseUyu: 317697552559 },
  { year: 2013, gdpNominalUyu: 1256293128100, population: 3345337, centralGovExpensePctGdp: 29.2703887862228, centralGovExpenseUyu: 367721882889 },
  { year: 2014, gdpNominalUyu: 1429541899800, population: 3356334, centralGovExpensePctGdp: 29.5808927457727, centralGovExpenseUyu: 422871256136 },
  { year: 2015, gdpNominalUyu: 1576251491900, population: 3368017, centralGovExpensePctGdp: 29.5758720947321, centralGovExpenseUyu: 466190125136 },
  { year: 2016, gdpNominalUyu: 1733770000000, population: 3379283, centralGovExpensePctGdp: 35.2210254750392, centralGovExpenseUyu: 610651573379 },
  { year: 2017, gdpNominalUyu: 1864139200000, population: 3388438, centralGovExpensePctGdp: 31.2481021079536, centralGovExpenseUyu: 582508120650 },
  { year: 2018, gdpNominalUyu: 2007729000000, population: 3394534, centralGovExpensePctGdp: 31.913342812641, centralGovExpenseUyu: 640733438519 },
  { year: 2019, gdpNominalUyu: 2193671400000, population: 3397206, centralGovExpensePctGdp: 32.0674025947569, centralGovExpenseUyu: 703453439444 },
  { year: 2020, gdpNominalUyu: 2250204800000, population: 3398968, centralGovExpensePctGdp: 34.6908163005683, centralGovExpenseUyu: 780614413555 },
  { year: 2021, gdpNominalUyu: 2645464000000, population: 3396695, centralGovExpensePctGdp: 31.7323019734088, centralGovExpenseUyu: 839466625078 },
  { year: 2022, gdpNominalUyu: 2933055500000, population: 3390913, centralGovExpensePctGdp: 35.9592377766438, centralGovExpenseUyu: 1054704401366 },
  { year: 2023, gdpNominalUyu: 3075193000000, population: 3388081, centralGovExpensePctGdp: 36.451913684213, centralGovExpenseUyu: 1120966697983 },
  { year: 2024, gdpNominalUyu: 3310431600000, population: 3386588, centralGovExpensePctGdp: null, centralGovExpenseUyu: null },
  { year: 2025, gdpNominalUyu: 3515517100000, population: 3384688, centralGovExpensePctGdp: null, centralGovExpenseUyu: null },
]

const BY_YEAR = new Map(MACRO_URUGUAY.map(m => [m.year, m]))

/** Macro row for a year, or null when the year is outside the published series. */
export function macroForYear(year: number): MacroYear | null {
  return BY_YEAR.get(year) ?? null
}
