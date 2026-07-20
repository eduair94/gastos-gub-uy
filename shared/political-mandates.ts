/**
 * Political mandates — who governed an organism when a purchase was recorded.
 *
 * This is CONTEXT, not attribution. It answers "which administration held office
 * the year this spending was reported", strictly as public electoral record. It
 * never implies a party caused a contract, an outcome or an anomaly.
 *
 * The join is `buyer.id` (`<inciso>-<unidad>`) + `sourceYear`:
 *
 *   - Departmental (`80-1 … 98-1`)  → the Intendente of that department.
 *   - National executive (ministries + executive-controlled entes) → the President.
 *   - Self-governed bodies (Legislativo, Judicial, Corte Electoral, Tribunal de
 *     Cuentas, TCA, ANEP, UDELAR, UTEC) → NO executive mandate — deliberately blank.
 *
 * ## Why year alone is enough, and where it lies
 *
 * Uruguay's two calendars are OFFSET and do not line up:
 *   - National handover is **1 March**. The inauguration year is ~10/12 the new
 *     president, so a calendar year maps to whoever governed the majority of it.
 *   - Departmental handover is **~July** (1996 reform split the calendars), on a
 *     5-year clock offset ~8 months from the presidency — so intendente terms are
 *     NOT presidential terms.
 *   - COVID bent 2020: the 2015–2020 departmental term was EXTENDED to 26 Nov 2020
 *     (so 2020 is ~11/12 the outgoing term), and 2020–2025 was SHORTENED. A naïve
 *     "5-year blocks" assumption is wrong for 2020 — the month-precise windows below
 *     encode it, and the resolver assigns each year by real month overlap.
 *
 * Every year where two terms share the calendar year (or a chunk falls outside the
 * curated range) is flagged `isTransition`, so the UI can mark it "año de transición".
 *
 * Sources: Corte Electoral / public electoral record; per-year departmental results
 * and the per-department succession record. The **2005** departmental column is the
 * lowest-confidence (single-source per-year table) and is flagged `single-source`.
 */

export type PartyCode = 'FA' | 'PN' | 'PC' | 'CR'

export interface PartyMeta {
  code: PartyCode
  label: string
  /** Illustrative marker colour only — the code/label carries the real signal, so
   *  the chip stays legible without colour. FA=red and PN=blue follow common usage;
   *  PC is shown amber to disambiguate from FA's red (both are "red" by tradition),
   *  CR (the 2025 Coalición Republicana lema) violet. Not a design-system token. */
  color: string
}

export const PARTY_META: Record<PartyCode, PartyMeta> = {
  FA: { code: 'FA', label: 'Frente Amplio', color: '#d7263d' },
  PN: { code: 'PN', label: 'Partido Nacional', color: '#2d6cdf' },
  PC: { code: 'PC', label: 'Partido Colorado', color: '#e09a2d' },
  CR: { code: 'CR', label: 'Coalición Republicana', color: '#7d5ba6' },
}

export const MANDATE_SOURCE = 'Corte Electoral — registro público electoral'
export const MANDATE_SOURCE_URL = 'https://www.corteelectoral.gub.uy'

// ---- Jurisdiction classification (by inciso prefix) -----------------------
// Directly under the President (his office + the ministries). Board turnover is
// immediate: the whole cabinet changes with the presidency.
const MINISTRY_INCISOS = new Set([
  '2', // Presidencia de la República
  '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '36',
])
// Entes autónomos / servicios descentralizados whose directorio the executive
// appoints — but seats are split by law (coparticipación), so they carry a caveat.
const ENTE_INCISOS = new Set([
  '27', '28', '29', // INAU, BPS, ASSE
  '50', '51', '52', '53', // BCU, BROU, BHU, BSE
  '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70',
])
// Autonomous / co-governed: they do NOT follow the executive. No party mandate.
const SELF_GOVERNED_INCISOS = new Set([
  '1', // Poder Legislativo
  '16', '17', '18', '19', // Judicial, Tribunal de Cuentas, Corte Electoral, TCA
  '25', '26', '31', // ANEP, UDELAR, UTEC
  '33', '34', // Fiscalía General, INDDHH
])

// ---- Term windows (month-precise) -----------------------------------------
function monthIndex(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return y! * 12 + (m! - 1)
}
function overlapMonths(winStart: number, winEnd: number, year: number): number {
  const ys = year * 12
  const ye = year * 12 + 12
  return Math.max(0, Math.min(ye, winEnd) - Math.max(ys, winStart))
}

interface Window { s: number, e: number }
interface Picked<W> { win: W, transition: boolean }

/** The term governing the MAJORITY of calendar `year`, flagged when the year
 *  straddles a handover (>1 known term) or falls partly outside the curated range. */
function pickWindow<W extends Window>(windows: W[], year: number): Picked<W> | null {
  let best: W | null = null
  let bestOv = 0
  let overlapping = 0
  for (const w of windows) {
    const ov = overlapMonths(w.s, w.e, year)
    if (ov > 0) overlapping++
    if (ov > bestOv) { bestOv = ov; best = w }
  }
  if (!best) return null
  // <7 months owned by the winner ⇒ the rest of the year belonged to a term we
  // may not carry (e.g. the pre-2005 departmental administration) — still transition.
  return { win: best, transition: overlapping > 1 || bestOv < 7 }
}

interface NationalWindow extends Window {
  label: string
  president: string
  party: PartyCode
  // `| undefined` is required, not redundant: the root tsconfig sets exactOptionalPropertyTypes,
  // and these objects are built with `coalition: <expr> | undefined` rather than by omitting the key.
  coalition?: string | undefined
}
const NATIONAL: NationalWindow[] = [
  { label: '2000–2005', president: 'Jorge Batlle', party: 'PC', s: monthIndex('2000-03'), e: monthIndex('2005-03') },
  { label: '2005–2010', president: 'Tabaré Vázquez', party: 'FA', s: monthIndex('2005-03'), e: monthIndex('2010-03') },
  { label: '2010–2015', president: 'José Mujica', party: 'FA', s: monthIndex('2010-03'), e: monthIndex('2015-03') },
  { label: '2015–2020', president: 'Tabaré Vázquez', party: 'FA', s: monthIndex('2015-03'), e: monthIndex('2020-03') },
  { label: '2020–2025', president: 'Luis Lacalle Pou', party: 'PN', coalition: 'Coalición Multicolor', s: monthIndex('2020-03'), e: monthIndex('2025-03') },
  { label: '2025–2030', president: 'Yamandú Orsi', party: 'FA', s: monthIndex('2025-03'), e: monthIndex('2030-03') },
]

interface DeptWindow extends Window {
  idx: number
  label: string
  startYear: number
  endYear: number
}
// Note the COVID-bent boundaries: 2015–2020 runs to 2020-11 (extended), 2020–2025
// starts there (shortened). 2025 uses the realigned July inauguration.
const DEPT_WINDOWS: DeptWindow[] = [
  { idx: 0, label: '2005–2010', startYear: 2005, endYear: 2010, s: monthIndex('2005-07'), e: monthIndex('2010-07') },
  { idx: 1, label: '2010–2015', startYear: 2010, endYear: 2015, s: monthIndex('2010-07'), e: monthIndex('2015-07') },
  { idx: 2, label: '2015–2020', startYear: 2015, endYear: 2020, s: monthIndex('2015-07'), e: monthIndex('2020-11') },
  { idx: 3, label: '2020–2025', startYear: 2020, endYear: 2025, s: monthIndex('2020-11'), e: monthIndex('2025-07') },
  { idx: 4, label: '2025–2030', startYear: 2025, endYear: 2030, s: monthIndex('2025-07'), e: monthIndex('2030-07') },
]

/** Intendente per department, keyed by Intendencia `buyer.id`, aligned to
 *  DEPT_WINDOWS (2005, 2010, 2015, 2020, 2025). `[name, party]`. */
type Cell = [string, PartyCode]
const DEPARTMENT_INTENDENTES: Record<string, [Cell, Cell, Cell, Cell, Cell]> = {
  '80-1': [['Julio Silveira', 'PN'], ['Patricia Ayala', 'FA'], ['Pablo Caram', 'PN'], ['Pablo Caram', 'PN'], ['Emiliano Soravilla', 'PN']], // Artigas
  '81-1': [['Marcos Carámbula', 'FA'], ['Marcos Carámbula', 'FA'], ['Yamandú Orsi', 'FA'], ['Yamandú Orsi', 'FA'], ['Francisco Legnani', 'FA']], // Canelones
  '82-1': [['Ambrosio Barreiro', 'PN'], ['Sergio Botana', 'PN'], ['Sergio Botana', 'PN'], ['José Yurramendi', 'PN'], ['Christian Morel', 'PN']], // Cerro Largo
  '83-1': [['Walter Zimmer', 'PN'], ['Walter Zimmer', 'PN'], ['Carlos Moreira', 'PN'], ['Carlos Moreira', 'PN'], ['Guillermo Rodríguez', 'PN']], // Colonia
  '84-1': [['Carmelo Vidalín', 'PN'], ['Benjamín Irazábal', 'PN'], ['Carmelo Vidalín', 'PN'], ['Carmelo Vidalín', 'PN'], ['Felipe Algorta', 'PN']], // Durazno
  '85-1': [['Armando Castaingdebat', 'PN'], ['Armando Castaingdebat', 'PN'], ['Fernando Echeverría', 'PN'], ['Fernando Echeverría', 'PN'], ['Diego Irazábal', 'PN']], // Flores
  '86-1': [['Juan Giachetto', 'FA'], ['Carlos Enciso', 'PN'], ['Carlos Enciso', 'PN'], ['Guillermo López', 'PN'], ['Carlos Enciso', 'PN']], // Florida
  '87-1': [['Herman Vergara', 'PN'], ['Adriana Peña', 'PN'], ['Adriana Peña', 'PN'], ['Mario García', 'PN'], ['Daniel Ximénez', 'FA']], // Lavalleja
  '88-1': [['Óscar de los Santos', 'FA'], ['Óscar de los Santos', 'FA'], ['Enrique Antía', 'PN'], ['Enrique Antía', 'PN'], ['Miguel Abella', 'PN']], // Maldonado
  '89-1': [['Julio Pintos', 'FA'], ['Bertil Bentos', 'PN'], ['Guillermo Caraballo', 'FA'], ['Nicolás Olivera', 'PN'], ['Nicolás Olivera', 'PN']], // Paysandú
  '90-1': [['Omar Lafluf', 'PN'], ['Omar Lafluf', 'PN'], ['Óscar Terzaghi', 'FA'], ['Omar Lafluf', 'PN'], ['Guillermo Levratto', 'FA']], // Río Negro
  '91-1': [['Tabaré Viera', 'PC'], ['Marne Osorio', 'PC'], ['Marne Osorio', 'PC'], ['Richard Sander', 'PC'], ['Richard Sander', 'PC']], // Rivera
  '92-1': [['Artigas Barrios', 'FA'], ['Artigas Barrios', 'FA'], ['Aníbal Pereyra', 'FA'], ['Alejo Umpiérrez', 'PN'], ['Alejo Umpiérrez', 'PN']], // Rocha
  '93-1': [['Ramón Fonticiella', 'FA'], ['Germán Coutinho', 'PC'], ['Andrés Lima', 'FA'], ['Andrés Lima', 'FA'], ['Carlos Albisu', 'CR']], // Salto
  '94-1': [['Juan Chiruchi', 'PN'], ['José Luis Falero', 'PN'], ['José Luis Falero', 'PN'], ['Ana María Bentaberri', 'PN'], ['Ana María Bentaberri', 'PN']], // San José
  '95-1': [['Guillermo Besozzi', 'PN'], ['Guillermo Besozzi', 'PN'], ['Agustín Bascou', 'PN'], ['Guillermo Besozzi', 'PN'], ['Guillermo Besozzi', 'PN']], // Soriano
  '96-1': [['Wilson Ezquerra', 'PN'], ['Wilson Ezquerra', 'PN'], ['Eber da Rosa', 'PN'], ['Wilson Ezquerra', 'PN'], ['Wilson Ezquerra', 'PN']], // Tacuarembó
  '97-1': [['Gerardo Amaral', 'FA'], ['Dardo Sánchez Cal', 'PN'], ['Dardo Sánchez Cal', 'PN'], ['Mario Silvera', 'PN'], ['Mario Silvera', 'PN']], // Treinta y Tres
  '98-1': [['Ricardo Ehrlich', 'FA'], ['Ana Olivera', 'FA'], ['Daniel Martínez', 'FA'], ['Carolina Cosse', 'FA'], ['Mario Bergara', 'FA']], // Montevideo
}

// ---- Public API ------------------------------------------------------------
export type Jurisdiction = 'departmental' | 'national-executive' | 'self-governed' | 'unknown'

export interface MandateResult {
  jurisdiction: Jurisdiction
  /** true when a party + holder resolved for this (buyer, year). */
  hasMandate: boolean
  party?: PartyCode
  partyLabel?: string
  partyColor?: string
  holder?: string
  role?: 'president' | 'intendente'
  /** '2020–2025'. */
  termLabel?: string
  coalition?: string | undefined
  /** Ente directorios are shared (coparticipación); label as govt-of-the-day, not party-owned. */
  boardSplitCaveat?: boolean
  /** The calendar year straddles a handover (or part falls outside the curated range). */
  isTransition?: boolean
  confidence?: 'high' | 'single-source'
  /** Jurisdiction known, but the year is outside the curated term windows. */
  noData?: boolean
}

function incisoOf(buyerId: string): string {
  return (buyerId || '').split('-')[0] ?? ''
}

/** Resolve the governing mandate for a buyer in a given source year. */
export function mandateForBuyer(buyerId: string, sourceYear?: number | null): MandateResult {
  const year = Number(sourceYear)
  const isYear = Number.isFinite(year) && year > 0

  // Departmental — the intendente.
  if (DEPARTMENT_INTENDENTES[buyerId]) {
    if (!isYear) return { jurisdiction: 'departmental', hasMandate: false, noData: true }
    const p = pickWindow(DEPT_WINDOWS, year)
    if (!p) return { jurisdiction: 'departmental', hasMandate: false, noData: true }
    const [holder, party] = DEPARTMENT_INTENDENTES[buyerId]![p.win.idx]
    return {
      jurisdiction: 'departmental',
      hasMandate: true,
      party,
      partyLabel: PARTY_META[party].label,
      partyColor: PARTY_META[party].color,
      holder,
      role: 'intendente',
      termLabel: p.win.label,
      coalition: party === 'CR' ? PARTY_META.CR.label : undefined,
      isTransition: p.transition,
      confidence: p.win.idx === 0 ? 'single-source' : 'high',
    }
  }

  const inciso = incisoOf(buyerId)

  // National executive — the President.
  if (MINISTRY_INCISOS.has(inciso) || ENTE_INCISOS.has(inciso)) {
    if (!isYear) return { jurisdiction: 'national-executive', hasMandate: false, noData: true }
    const p = pickWindow(NATIONAL, year)
    if (!p) return { jurisdiction: 'national-executive', hasMandate: false, noData: true }
    const w = p.win
    return {
      jurisdiction: 'national-executive',
      hasMandate: true,
      party: w.party,
      partyLabel: PARTY_META[w.party].label,
      partyColor: PARTY_META[w.party].color,
      holder: w.president,
      role: 'president',
      termLabel: w.label,
      coalition: w.coalition,
      boardSplitCaveat: ENTE_INCISOS.has(inciso),
      isTransition: p.transition,
      confidence: 'high',
    }
  }

  if (SELF_GOVERNED_INCISOS.has(inciso)) {
    return { jurisdiction: 'self-governed', hasMandate: false }
  }
  return { jurisdiction: 'unknown', hasMandate: false }
}

export interface MandateTerm {
  label: string
  holder: string
  party: PartyCode
  partyLabel: string
  partyColor: string
  coalition?: string | undefined
  startYear: number
  endYear: number
}

export interface MandateTimeline {
  role: 'president' | 'intendente'
  terms: MandateTerm[]
}

/** The full term sequence for an organism — for a timeline strip. null when the
 *  buyer has no executive mandate (self-governed) or is unclassified. */
export function mandateTimeline(buyerId: string): MandateTimeline | null {
  if (DEPARTMENT_INTENDENTES[buyerId]) {
    const cells = DEPARTMENT_INTENDENTES[buyerId]!
    return {
      role: 'intendente',
      terms: DEPT_WINDOWS.map((w, i) => {
        const [holder, party] = cells[i]!
        return {
          label: w.label,
          holder,
          party,
          partyLabel: PARTY_META[party].label,
          partyColor: PARTY_META[party].color,
          coalition: party === 'CR' ? PARTY_META.CR.label : undefined,
          startYear: w.startYear,
          endYear: w.endYear,
        }
      }),
    }
  }
  const inciso = incisoOf(buyerId)
  if (MINISTRY_INCISOS.has(inciso) || ENTE_INCISOS.has(inciso)) {
    return {
      role: 'president',
      terms: NATIONAL.map(w => ({
        label: w.label,
        holder: w.president,
        party: w.party,
        partyLabel: PARTY_META[w.party].label,
        partyColor: PARTY_META[w.party].color,
        coalition: w.coalition,
        startYear: Number(w.label.slice(0, 4)),
        endYear: Number(w.label.slice(-4)),
      })),
    }
  }
  return null
}
