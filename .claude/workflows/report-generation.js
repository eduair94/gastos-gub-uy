export const meta = {
  name: 'report-generation',
  description: 'Theme-driven investigation report generator for gastos-gub: web research + live DB mining + adversarial DB verification + synthesis. Args: { theme, buyerName, buyerId }.',
  phases: [
    { title: 'Research', detail: 'web + live DB mining + reference data in parallel' },
    { title: 'Verify', detail: 're-query the live DB to confirm every cited contract' },
    { title: 'Synthesize', detail: 'assemble verified findings into a structured report package' },
  ],
}

// ---- Parameters (theme-driven; defaults target the Montevideo report) ----
const theme = (args && args.theme) || 'Gastos superfluos e innecesarios de la Intendencia de Montevideo a la luz de su déficit financiero'
const buyerName = (args && args.buyerName) || 'Intendencia de Montevideo'
const buyerId = (args && args.buyerId) || '98-1'

// The live DB connection every DB agent must use (root .env, NOT app/.env).
const DB_HOWTO = [
  'Connect to the LIVE MongoDB. Read MONGODB_URI from the repo-root .env file at',
  'c:/Users/airau/Desktop/My Proyects/gastos-gub/.env (NOT app/.env — that is a stale local mirror).',
  'Write a short throwaway Node script to the scratchpad that uses the "mongodb" driver',
  '(a dependency of mongoose, already installed) + "dotenv", connect to db "gastos_gub",',
  'query the "releases" collection, print JSON to stdout, then close the connection.',
  'Run it with `node` from the repo root. Do NOT modify any data (read-only). Delete the script after.',
  'The buyer lives at buyer.id / buyer.name. Money is amount.primaryAmount (UYU-normalised = unit×qty).',
  'sourceYear is the year. Official ficha URL for a release: take its `ocid`, strip the leading',
  '"ocds-<prefix>-" (regex /^ocds-[a-z0-9]+-/i) to get id_compra, then',
  'https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/<id_compra> .',
  'DERIVE THE URL FROM ocid, NEVER FROM id (they differ on adjustment/cancellation releases).',
  'CAUTION: a few records carry corrupt quantities (one IM release reports ~1.8e11 UYU). Exclude',
  'per-contract amounts above 2e8 UYU when hunting individual superfluous contracts, and when',
  'summing a grand total drop the top plausibility-violating tail and report it as a CAPPED total.',
  'CRITICAL FIELD NOTES (verified): the SUPPLIER is awards[].suppliers[].name — NEVER parties[] or',
  'the buyer (they are easy to confuse and give a wrong vendor). The item TEXT is',
  'awards[].items[].classification.description — awards[].items[].description is frequently EMPTY on',
  'legacy "i"-prefixed releases, so read classification.description for what was actually bought.',
  'amount.primaryAmount can be null on some multi-award legacy releases; drop a candidate you cannot',
  'confirm a numeric amount + a supplier name for, rather than guessing.',
].join(' ')

const WEB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    deficit: {
      type: 'object', additionalProperties: false,
      properties: {
        amountText: { type: 'string', description: 'as reported, e.g. "USD 90 millones" or "unos 5.000 millones de pesos"' },
        amountUYU: { type: ['number', 'null'], description: 'best UYU estimate, or null if only USD/other reported' },
        year: { type: ['string', 'number', 'null'] },
        source: { type: 'string', description: 'outlet / institution name' },
        url: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['amountText', 'source', 'url'],
    },
    newsFindings: {
      type: 'array',
      description: 'news items about IM fiscal trouble or wasteful/superfluous spending, each with a real source URL',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          claim: { type: 'string' },
          category: { type: 'string' },
          source: { type: 'string' },
          url: { type: 'string' },
          date: { type: ['string', 'null'] },
          amountText: { type: ['string', 'null'] },
        },
        required: ['claim', 'source', 'url'],
      },
    },
    context: { type: 'string', description: '2-4 sentence factual summary of IM finances (deficit, debt, budget) with attribution' },
  },
  required: ['deficit', 'newsFindings', 'context'],
}

const DB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    totals: {
      type: 'object', additionalProperties: false,
      properties: {
        releaseDocs: { type: 'number' },
        pricedDocs: { type: 'number' },
        sumPrimaryAmountUYU: { type: 'number', description: 'raw sum (includes outliers) — for reference only' },
        cappedSumUYU: { type: 'number', description: 'sum after dropping the corrupt tail' },
        cappedNote: { type: 'string', description: 'how many/which records were dropped and the cap used' },
        medianContractUYU: { type: 'number' },
        yearSpan: { type: 'string' },
      },
      required: ['releaseDocs', 'pricedDocs', 'cappedSumUYU', 'medianContractUYU'],
    },
    byYear: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { year: { type: 'number' }, contracts: { type: 'number' }, spendUYU: { type: 'number' } },
        required: ['year', 'spendUYU'],
      },
    },
    topCategories: {
      type: 'array', description: 'top spend categories by awards items classification/description',
      items: {
        type: 'object', additionalProperties: false,
        properties: { code: { type: ['string', 'null'] }, label: { type: 'string' }, spendUYU: { type: 'number' }, lines: { type: 'number' } },
        required: ['label', 'spendUYU'],
      },
    },
    topSuppliers: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { name: { type: 'string' }, spendUYU: { type: 'number' }, awards: { type: 'number' } },
        required: ['name', 'spendUYU'],
      },
    },
    candidates: {
      type: 'array',
      description: 'up to 40 individual contracts that look SUPERFLUOUS/DISCRETIONARY (catering, events, publicity/marketing, gifts/merchandising, hospitality/protocol, vehicles, travel, decoration, non-essential consultancy). Each MUST carry a real ocid + govUrl.',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          ocid: { type: 'string' },
          idCompra: { type: 'string' },
          title: { type: 'string', description: 'item/tender description' },
          supplier: { type: 'string' },
          category: { type: 'string', enum: ['catering', 'eventos', 'publicidad', 'regalos', 'hospitalidad', 'vehiculos', 'viajes', 'mobiliario', 'consultoria', 'otros'] },
          amountUYU: { type: 'number' },
          dateISO: { type: ['string', 'null'] },
          govUrl: { type: 'string' },
          why: { type: 'string', description: 'why this reads as discretionary/superfluous' },
        },
        required: ['ocid', 'title', 'category', 'amountUYU', 'govUrl'],
      },
    },
  },
  required: ['totals', 'byYear', 'topCategories', 'candidates'],
}

const POP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source: { type: 'string' },
    sourceUrl: { type: 'string' },
    censusYear: { type: ['string', 'number'] },
    departments: {
      type: 'array',
      description: 'all 19 Uruguayan departments with INE census population and their gastos-gub buyer.id (80-1..98-1)',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'exactly as in the DB, e.g. "Intendencia de Montevideo"' },
          department: { type: 'string', description: 'plain department name, e.g. "Montevideo"' },
          buyerId: { type: 'string' },
          population: { type: 'number' },
        },
        required: ['name', 'department', 'buyerId', 'population'],
      },
    },
  },
  required: ['source', 'sourceUrl', 'departments'],
}

const CONFIRM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    confirmations: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          ocid: { type: 'string' },
          existsInDb: { type: 'boolean' },
          amountUYUConfirmed: { type: ['number', 'null'] },
          amountMatches: { type: 'boolean' },
          supplierConfirmed: { type: ['string', 'null'] },
          dateConfirmed: { type: ['string', 'null'] },
          note: { type: 'string' },
        },
        required: ['ocid', 'existsInDb', 'amountMatches'],
      },
    },
  },
  required: ['confirmations'],
}

const SYNTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: {
      type: 'object', additionalProperties: false,
      properties: {
        deficitText: { type: 'string' },
        deficitUYU: { type: ['number', 'null'] },
        deficitYear: { type: ['string', 'number', 'null'] },
        deficitSource: { type: 'string' },
        deficitUrl: { type: 'string' },
        cappedTotalUYU: { type: 'number' },
        medianContractUYU: { type: 'number' },
        superfluousTotalUYU: { type: 'number' },
        superfluousShareText: { type: 'string' },
      },
      required: ['deficitText', 'cappedTotalUYU', 'medianContractUYU', 'superfluousTotalUYU'],
    },
    categories: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { key: { type: 'string' }, labelEs: { type: 'string' }, labelEn: { type: 'string' }, spendUYU: { type: 'number' }, contracts: { type: 'number' } },
        required: ['key', 'labelEs', 'labelEn', 'spendUYU'],
      },
    },
    ledger: {
      type: 'array', description: 'the verified, emblematic superfluous contracts, worst/most-illustrative first',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          ocid: { type: 'string' }, idCompra: { type: 'string' }, dateISO: { type: ['string', 'null'] },
          titleEs: { type: 'string' }, titleEn: { type: 'string' }, supplier: { type: 'string' },
          amountUYU: { type: 'number' }, category: { type: 'string' }, govUrl: { type: 'string' }, noteEs: { type: 'string' }, noteEn: { type: 'string' },
        },
        required: ['ocid', 'titleEs', 'titleEn', 'supplier', 'amountUYU', 'category', 'govUrl'],
      },
    },
    topSuppliers: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, spendUYU: { type: 'number' }, awards: { type: 'number' } }, required: ['name', 'spendUYU'] },
    },
    narrative: {
      type: 'object', additionalProperties: false,
      description: 'bilingual prose draft in the wry, plain, factual register of the site (es is source of truth; en mirrors)',
      properties: {
        es: { type: 'object', additionalProperties: true },
        en: { type: 'object', additionalProperties: true },
      },
      required: ['es', 'en'],
    },
    sources: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, properties: { label: { type: 'string' }, url: { type: 'string' } }, required: ['label', 'url'] },
    },
  },
  required: ['headline', 'categories', 'ledger', 'sources'],
}

// ------------------------------ RESEARCH ------------------------------
phase('Research')
log(`Report theme: ${theme} — buyer ${buyerName} (${buyerId})`)

const webPrompt = [
  `You are researching for a data-journalism investigation titled: "${theme}".`,
  `Subject: ${buyerName} (Uruguay). Use WebSearch + WebFetch (load their schemas via ToolSearch: "select:WebSearch,WebFetch").`,
  'Find, with REAL cited source URLs (prefer El País, El Observador, La Diaria, Montevideo Portal, Búsqueda, Subrayado, official Tribunal de Cuentas / IM / Junta Departamental):',
  '1) The size and year of the Intendencia de Montevideo fiscal DEFICIT (and its debt if reported).',
  '2) News items (last ~3 years) about IM spending criticised as wasteful, superfluous, discretionary, or politically questioned (events, publicity, catering, hires, vehicles, consultancies, etc.).',
  '3) Brief factual context on IM finances.',
  'Every figure MUST have a source URL. Do not invent numbers. If sources disagree, report the range and attribute. Return the structured object.',
].join('\n')

const dbPrompt = [
  `Mine the live procurement DB for the investigation "${theme}". Buyer: buyer.id = "${buyerId}" (${buyerName}).`,
  DB_HOWTO,
  'Produce:',
  '- totals: releaseDocs, pricedDocs (amount.primaryAmount present), raw sum, CAPPED sum (drop amounts > 2e8 UYU as corrupt; report how many dropped), median priced contract, year span.',
  '- byYear: per sourceYear contract count + capped spend (exclude amounts > 2e8).',
  '- topCategories: group priced award item lines by classification.description (fallback item description) and sum amount; top ~15 by spend. Also compute totals for DISCRETIONARY categories.',
  '- topSuppliers: top ~12 suppliers by capped spend (from awards[].suppliers[].name or parties).',
  '- candidates: up to 40 INDIVIDUAL contracts (1e5..2e8 UYU) whose tender.title or award item description/classification match discretionary keywords:',
  '  catering/eventos: catering, evento, fiesta, espectáculo, artístic, show, banda, músic, animación, inflable, pirotecnia, fuegos artificiales, agasajo, celebración, carnaval, protocolo, cortesía, lunch, coffee break, refrigerio, bebida, vino, champ.',
  '  publicidad/regalos: public, propaganda, difusión, campaña, spot, auspicio, patrocinio, merchandising, souvenir, regalo, obsequio, gorro, remera, camiseta, banderas.',
  '  hospitalidad/vehiculos/viajes/mobiliario/consultoria: hotel, hospedaje, viático, pasaje aéreo, vehículo 0km, camioneta 0km, decoración, mobiliario, consultor, asesoría, honorarios profesionales.',
  '  For each candidate include ocid, idCompra (the derived id_compra), title, supplier, category (one of the enum), amountUYU, dateISO, govUrl (derived from ocid), and a short "why".',
  'Sample a few IM docs first to learn the exact nesting before writing the aggregation. Return the structured object with REAL data only.',
].join('\n')

const popPrompt = [
  'Provide the official INE (Instituto Nacional de Estadística, Uruguay) CENSUS 2023 population for all 19 departments of Uruguay.',
  'Use WebSearch/WebFetch (load via ToolSearch "select:WebSearch,WebFetch") to get the authoritative INE Censos 2023 figures; cite the source URL.',
  'Map each department to its gastos-gub buyer.id and exact buyer.name (Intendencia de <Depto>), where the ids are:',
  'Artigas 80-1, Canelones 81-1, Cerro Largo 82-1, Colonia 83-1, Durazno 84-1, Flores 85-1, Florida 86-1, Lavalleja 87-1, Maldonado 88-1, Paysandú 89-1, Río Negro 90-1, Rivera 91-1, Rocha 92-1, Salto 93-1, San José 94-1, Soriano 95-1, Tacuarembó 96-1, Treinta y Tres 97-1, Montevideo 98-1.',
  'Return all 19 with population. Do not invent figures — cite INE.',
].join('\n')

const [web, db, pop] = await parallel([
  () => agent(webPrompt, { label: 'research:web', phase: 'Research', schema: WEB_SCHEMA, agentType: 'general-purpose' }),
  () => agent(dbPrompt, { label: 'research:db', phase: 'Research', schema: DB_SCHEMA, agentType: 'general-purpose' }),
  () => agent(popPrompt, { label: 'research:population', phase: 'Research', schema: POP_SCHEMA, agentType: 'general-purpose' }),
])

const candidates = (db && Array.isArray(db.candidates)) ? db.candidates : []
log(`Research done. web=${web ? 'ok' : 'FAILED'} db=${db ? 'ok' : 'FAILED'} pop=${pop ? 'ok' : 'FAILED'}; ${candidates.length} candidate contracts.`)

// ------------------------------ VERIFY ------------------------------
phase('Verify')
let confirmed = []
if (candidates.length) {
  const ocids = candidates.map(c => c.ocid).filter(Boolean)
  const confirmPrompt = [
    'Adversarially VERIFY these procurement contracts against the LIVE DB — assume each cited figure is wrong until the DB confirms it.',
    DB_HOWTO,
    'For EACH of these ocids, look up the release in "releases" (match on ocid) and confirm whether it exists, its actual summed amount.primaryAmount (UYU), the supplier name(s), and the date/sourceYear.',
    'A claim "amountMatches" is true only if the DB amount is within ~2% of the claimed amount below. Report mismatches honestly.',
    'Claimed rows (ocid → claimedAmountUYU → supplier):',
    ...candidates.map(c => `- ${c.ocid} → ${Math.round(c.amountUYU)} → ${c.supplier || '?'}`),
    'Return { confirmations: [...] } covering every ocid.',
  ].join('\n')

  const conf = await agent(confirmPrompt, { label: 'verify:batch-db', phase: 'Verify', schema: CONFIRM_SCHEMA, agentType: 'general-purpose' })
  const byOcid = {}
  if (conf && Array.isArray(conf.confirmations)) {
    for (const c of conf.confirmations) byOcid[c.ocid] = c
  }
  confirmed = candidates
    .map((cand) => {
      const v = byOcid[cand.ocid]
      if (!v || !v.existsInDb) return null
      // prefer the DB-confirmed amount when available
      const amountUYU = (v.amountUYUConfirmed != null) ? v.amountUYUConfirmed : cand.amountUYU
      return { ...cand, amountUYU, supplier: v.supplierConfirmed || cand.supplier, dateISO: v.dateConfirmed || cand.dateISO, _matched: v.amountMatches }
    })
    .filter(Boolean)
  log(`Verify: ${confirmed.length}/${candidates.length} contracts confirmed present in the DB (${confirmed.filter(x => x._matched).length} amount-exact).`)
}
else {
  log('Verify: no candidates to confirm — DB mining returned none.')
}

// ------------------------------ SYNTHESIZE ------------------------------
phase('Synthesize')
const synthPrompt = [
  `Assemble the investigation package for "${theme}" (${buyerName}).`,
  'Inputs (JSON):',
  `WEB_RESEARCH = ${JSON.stringify(web)}`,
  `DB_TOTALS = ${JSON.stringify(db && db.totals)}`,
  `DB_BY_YEAR = ${JSON.stringify(db && db.byYear)}`,
  `DB_TOP_CATEGORIES = ${JSON.stringify(db && db.topCategories)}`,
  `DB_TOP_SUPPLIERS = ${JSON.stringify(db && db.topSuppliers)}`,
  `VERIFIED_SUPERFLUOUS_CONTRACTS = ${JSON.stringify(confirmed)}`,
  'Produce the structured package:',
  '- headline: deficit (text/UYU/year/source/url from WEB_RESEARCH), cappedTotalUYU + medianContractUYU (from DB_TOTALS), superfluousTotalUYU (sum of VERIFIED contracts), superfluousShareText (a plain sentence relating the superfluous total to the deficit, e.g. "equivale a X% del déficit").',
  '- categories: aggregate the verified contracts by category with es/en labels + spend + count.',
  '- ledger: the verified contracts, most-illustrative first, with bilingual title + a one-line bilingual note; keep govUrl and ocid.',
  '- topSuppliers: pass through DB_TOP_SUPPLIERS (top ~10).',
  '- narrative: bilingual prose draft (es source of truth, en mirror) in a PLAIN, WRY, NON-SALESY register (Uruguayan public-money watchdog voice). Keys: kicker, title, dek, and 3-5 short section paragraphs (context/deficit, what looks superfluous, method, caveat). NEVER accuse beyond what the ficha shows; frame "superfluous" as an evidenced editorial judgement.',
  '- sources: dedup list of {label,url} from WEB_RESEARCH + a note that every contract links to its Compras Estatales ficha.',
  'Use ONLY the provided numbers. Do not invent figures.',
].join('\n')

const pkg = await agent(synthPrompt, { label: 'synthesize:package', phase: 'Synthesize', schema: SYNTH_SCHEMA })

log('Report package assembled.')
return { theme, buyerName, buyerId, web, dbTotals: db && db.totals, byYear: db && db.byYear, topCategories: db && db.topCategories, topSuppliers: db && db.topSuppliers, population: pop, confirmedCount: confirmed.length, confirmed, package: pkg }
