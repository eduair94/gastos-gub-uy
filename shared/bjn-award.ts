/**
 * Leer la parte dispositiva de una sentencia y decir cuánto se condenó a pagar.
 *
 * Módulo PURO: sin I/O, sin imports. Lo usa el job que baja la Base de Jurisprudencia Nacional
 * (src/jobs/load-bjn-condenas.ts) y lo verifica tests/unit/test-bjn-award.ts contra el texto real
 * de sentencias publicadas.
 *
 * EL FALLO ESTÁ AL FINAL, Y SÓLO AHÍ. Una sentencia narra primero lo que la parte reclamó, lo que
 * dijo la sentencia anterior y lo que opinó cada ministro. Todas esas cifras son ruido. La única
 * que obliga a pagar vive después de «FALLA:» o «RESUELVE:». Este módulo corta ahí y no mira atrás.
 *
 * NUNCA INVENTA UN NÚMERO. Devuelve los candidatos que encontró, con su motivo de exclusión cuando
 * los descarta. El segundo pase con LLM elige ENTRE estos candidatos y no puede proponer otro: esa
 * es la única defensa real contra publicar una cifra que la sentencia no dice.
 *
 * LAS SEIS TRAMPAS, TODAS MEDIDAS SOBRE FALLOS REALES (ver el test):
 *
 *   1. «HONORARIOS FICTOS $ 3.500» es un arancel para regular costas, no una indemnización. Aparece
 *      en fallos que NO condenan a nada.
 *   2. «CONDENASE ... EL 60% DE U$S 10.000» condena a 6.000, no a 10.000.
 *   3. «Condénase a ANEP a abonar las diferencias de haberes» condena de verdad y NO trae monto:
 *      se liquida después. Cero no es la respuesta; «sin monto» sí.
 *   4. «cuya liquidación se difiere a la vía del art. 378 del C.G.P.» — lo mismo, explícito.
 *   5. En sede penal «CONDÉNASE A AA A LA PENA DE DIECIOCHO AÑOS» trae la palabra condena y un
 *      número que son años de cárcel. El fuero penal queda afuera entero.
 *   6. «Con costas» y «costos» mueven plata y no son la condena que se busca.
 */

export type RulingVerb = 'confirma' | 'revoca' | 'anula' | 'modifica' | 'desestima' | 'condena' | 'otro'

export type MoneyCurrency = 'UYU' | 'USD' | 'UR' | 'UI' | 'EUR' | 'DEG'

export interface MoneyMatch {
  currency: MoneyCurrency
  /** Valor ya resuelto: si el texto decía «60% de U$S 10.000», acá está 6000. */
  amount: number
  /** El texto tal cual, para poder auditar la lectura. */
  raw: string
  /** Porcentaje aplicado, cuando el fallo condenó a una fracción. */
  ofPercent?: number
}

export interface ExcludedMoney {
  raw: string
  reason: string
}

export interface DispositiveParse {
  /** `false` cuando la sentencia no trae marcador de fallo. Sin él no se publica nada. */
  found: boolean
  /** La parte dispositiva, desde el marcador hasta el final. */
  dispositive: string
  verb: RulingVerb
  /** El fuero penal queda afuera: ahí «condena» es cárcel y el número son años. */
  isPenal: boolean
  /** Los montos del fallo que sobrevivieron las exclusiones. El LLM elige entre éstos. */
  awardCandidates: MoneyMatch[]
  /** Lo descartado, con motivo. Se guarda para poder auditar por qué no se publicó una cifra. */
  excluded: ExcludedMoney[]
  /** El fallo condena pero difiere el monto a una liquidación posterior. */
  deferredLiquidation: boolean
  /** Montos de la narrativa (lo reclamado, lo fallado abajo). Contexto para el verificador. */
  narrativeAmounts: MoneyMatch[]
}

/** El fallo empieza acá. Se toma la ÚLTIMA aparición: los votos discordes repiten el encabezado. */
const DISPOSITIVE_RE = /\b(?:F[ÁA]LL[AO]SE|FALL[AO]|RESU[EÉ]LVESE|SE\s+RESUELVE|RESUELVE)\s*:/gi

/** En sede penal el número que sigue a «condénase» son años de cárcel. */
const PENAL_RE = /\bPENA\s+DE\b|\bPENITENCIAR[ÍI]A\b|\bPRISI[ÓO]N\b|AUTOR\s+PENALMENTE|COAUTOR\s+PENALMENTE|PROCESO\s+PENAL/i

/** El monto existe pero se calcula después. Condena real, sin cifra. */
const DEFERRED_RE = /se\s+difiere|v[íi]a\s+(?:del\s+)?art[íi]?c?u?l?o?\.?\s*378|art[íi]?c?u?l?o?\.?\s*378\s+del\s+C\.?G\.?P|liquidaci[óo]n\s+(?:se\s+)?(?:difiere|diferir|incidental|posterior)|por\s+la\s+v[íi]a\s+incidental/i

/**
 * Lo que rodea a un número y lo saca de carrera. Se mira una ventana ANTES del monto: en castellano
 * jurídico el concepto va delante («honorarios fictos $ 3.500»).
 */
const EXCLUSION_RULES: Array<{ re: RegExp, reason: string }> = [
  { re: /honorarios?\s+(?:fictos?|ficta)/i, reason: 'honorarios fictos' },
  { re: /honorarios?/i, reason: 'honorarios' },
  { re: /costas?\b/i, reason: 'costas' },
  { re: /costos?\b/i, reason: 'costos' },
  { re: /astreintes?/i, reason: 'astreinte' },
  { re: /multa\s+procesal|sanci[óo]n\s+procesal/i, reason: 'sanción procesal' },
  { re: /tributos?|impuestos?\s+de\s+justicia/i, reason: 'tributo' },
  { re: /ley\s+n?[º°]?\s*[\d.]+|art[íi]?c?u?l?o?\.?\s*\d+/i, reason: 'referencia normativa' },
]

/** Cuánto texto antes del monto se mira para decidir si es ruido. */
const CONTEXT_CHARS = 60

const VERB_RULES: Array<{ re: RegExp, verb: RulingVerb }> = [
  { re: /\bdesestim[áa]?(?:se|ndo|ase)\b|\bno\s+ha\s+lugar\b|\brech[áa]zase\b/i, verb: 'desestima' },
  { re: /\ban[úu]l[áa]?se\b|\banulando\b/i, verb: 'anula' },
  { re: /\brev[óo]c[áa]?se\b|\brevocando\b/i, verb: 'revoca' },
  { re: /\bmodif[íi]c[áa]?se\b|\bmodificando\b/i, verb: 'modifica' },
  { re: /\bconf[íi]rm[áa]?se\b|\bconfirmando\b/i, verb: 'confirma' },
  { re: /\bcond[ée]n[áa]?se\b|\bcondenando\b/i, verb: 'condena' },
]

/**
 * Un número escrito a la uruguaya → number. `872.377` es 872377; `1.234,56` es 1234,56.
 *
 * La coma decimal es la marca: si hay coma, lo de la derecha son decimales y todos los puntos son
 * separadores de miles. Sin coma, los puntos también son de miles — en el foro nadie escribe
 * `10.000` queriendo decir diez.
 */
export function parseUyAmount(raw: string): number | null {
  const s = raw.trim()
  if (!/\d/.test(s)) return null
  const hasComma = s.includes(',')
  const normalized = hasComma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** El símbolo tal como aparece → la moneda. */
function currencyOf(token: string): MoneyCurrency | null {
  const t = token.toUpperCase().replace(/\s|\./g, '')
  if (t === 'U$S' || t === 'US$' || t === 'USD' || t === 'DÓLARES' || t === 'DOLARES' || t === 'DÓLAR' || t === 'DOLAR') return 'USD'
  if (t === '$U' || t === '$') return 'UYU'
  if (t === 'UR') return 'UR'
  if (t === 'UI' || t === 'U.I') return 'UI'
  if (t === 'DEG') return 'DEG'
  if (t === '€' || t === 'EUROS' || t === 'EURO') return 'EUR'
  return null
}

/**
 * Todos los montos de un texto, con el símbolo delante o detrás del número.
 *
 * `U$S 10.000`, `$ 872.377`, `2.250 DEG`, `300 UR`. El símbolo `$` solo es peso uruguayo: el dólar
 * en el foro siempre lleva la U delante.
 */
const MONEY_RE = /(U\$S|US\$|USD|\$U|\$|€)\s*\.?\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(UR|UI|U\.I\.|DEG|d[óo]lares?|euros?)\b/gi

/** `60% de U$S 10.000` → el 60% ya aplicado. */
const PERCENT_OF_RE = /(\d{1,3})\s*%\s*(?:de|del)\s+((?:U\$S|US\$|USD|\$U|\$|€)\s*\.?\s*[\d][\d.,]*)/gi

function scanMoney(text: string, applyExclusions: boolean): { matches: MoneyMatch[], excluded: ExcludedMoney[] } {
  const matches: MoneyMatch[] = []
  const excluded: ExcludedMoney[] = []

  // Los porcentajes van primero y se marcan, para que el barrido general no vuelva a contar el
  // número base como si fuera la condena entera.
  const percentSpans: Array<[number, number]> = []
  for (const m of text.matchAll(PERCENT_OF_RE)) {
    const inner = [...m[2]!.matchAll(MONEY_RE)][0]
    const cur = inner ? currencyOf(inner[1] ?? inner[4] ?? '') : null
    const base = inner ? parseUyAmount(inner[2] ?? inner[3] ?? '') : null
    const pct = Number(m[1])
    if (cur && base !== null && Number.isFinite(pct)) {
      matches.push({ currency: cur, amount: (base * pct) / 100, raw: m[0], ofPercent: pct })
      percentSpans.push([m.index!, m.index! + m[0].length])
    }
  }

  for (const m of text.matchAll(MONEY_RE)) {
    const start = m.index!
    if (percentSpans.some(([a, b]) => start >= a && start < b)) continue

    const symbol = m[1] ?? m[4] ?? ''
    const digits = m[2] ?? m[3] ?? ''
    const currency = currencyOf(symbol)
    const amount = parseUyAmount(digits)
    if (!currency || amount === null || amount <= 0) continue

    if (applyExclusions) {
      const before = text.slice(Math.max(0, start - CONTEXT_CHARS), start)
      const hit = EXCLUSION_RULES.find(r => r.re.test(before))
      if (hit) {
        excluded.push({ raw: m[0].trim(), reason: hit.reason })
        continue
      }
    }
    matches.push({ currency, amount, raw: m[0].trim() })
  }

  return { matches, excluded }
}

function detectVerb(dispositive: string): RulingVerb {
  // El primer verbo del fallo es el que manda: «Revócase ... y en su mérito condénase» es una
  // revocación con condena, y para el lector lo que importa es que hubo condena.
  const head = dispositive.slice(0, 400)
  if (/\bcond[ée]n[áa]?se\b|\bcondenando\b/i.test(head)) return 'condena'
  for (const rule of VERB_RULES) if (rule.re.test(head)) return rule.verb
  return 'otro'
}

export function parseDispositive(fullText: string, procedimiento?: string | null): DispositiveParse {
  const text = (fullText ?? '').replace(/\s+/g, ' ')
  const marks = [...text.matchAll(DISPOSITIVE_RE)]
  const empty: DispositiveParse = {
    found: false,
    dispositive: '',
    verb: 'otro',
    isPenal: false,
    awardCandidates: [],
    excluded: [],
    deferredLiquidation: false,
    narrativeAmounts: [],
  }
  if (marks.length === 0) return empty

  const last = marks[marks.length - 1]!
  const dispositive = text.slice(last.index!).trim()
  const narrative = text.slice(0, last.index!)

  const isPenal = PENAL_RE.test(procedimiento ?? '') || PENAL_RE.test(dispositive)
  const { matches, excluded } = scanMoney(dispositive, true)

  return {
    found: true,
    dispositive,
    verb: detectVerb(dispositive),
    isPenal,
    // En penal no se ofrece ningún candidato: el número son años, no pesos.
    awardCandidates: isPenal ? [] : matches,
    excluded,
    deferredLiquidation: DEFERRED_RE.test(dispositive),
    narrativeAmounts: scanMoney(narrative, false).matches,
  }
}

/**
 * ¿Este fallo puede publicar una cifra?
 *
 * Falla cerrado: cualquier duda deja la sentencia sin monto. Una sentencia sin monto igual se
 * publica —el hecho de que el Estado fue condenado vale por sí solo—, pero sin número.
 */
export function canPublishAmount(parse: DispositiveParse): boolean {
  if (!parse.found || parse.isPenal) return false
  if (parse.deferredLiquidation) return false
  if (parse.awardCandidates.length === 0) return false
  return parse.verb === 'condena' || parse.verb === 'revoca' || parse.verb === 'modifica' || parse.verb === 'anula'
}
