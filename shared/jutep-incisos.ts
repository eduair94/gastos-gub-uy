/**
 * JUTEP inciso label → the `buyer.id` inciso prefix used across this repo.
 *
 * PURE. No I/O, so tests/unit can import it.
 *
 * The JUTEP omisos roster names the employing body in free text, and the same body appears under
 * several spellings and outright typos in the published file: "GOBIERNO DEPARTAMENTAL DE DURANO",
 * "TACUAREMBOÓ", "PAYSANDU", "MINISTERIO DE ECONOMIA" beside "ECONOMÍA", "INDUSTRÍA" beside
 * "INDUSTRIA". Normalising and then matching an explicit table is the only way to join it without
 * inventing matches.
 *
 * Every inciso NUMBER below was read off the live corpus (distinct `buyer.id` prefixes with their
 * dominant `buyer.name`), not from memory — see the note on each block.
 *
 * UNRESOLVED IS A NORMAL OUTCOME, not a failure: JUTEP lists bodies that never appear as a
 * procurement buyer at all (COLEGIO MEDICO), and juntas departamentales are separate from the
 * intendencia that shares their department. The loader stores null and the UI simply does not link
 * those rows to an organism.
 */

/** Uppercase, strip accents, collapse whitespace and punctuation noise. */
export function normalizeIncisoName(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalised JUTEP label → inciso prefix of `buyer.id`.
 *
 * Departmental governments are 80…98, the same numbering `shared/organism-groups.ts` uses for the
 * 19 Intendencias. National incisos verified against the corpus: 1 Poder Legislativo, 3 Defensa
 * (Comando General de la Armada), 4 Interior, 5 Economía (Dirección General de Casinos), 6
 * Relaciones Exteriores, 7 Ganadería, 8 Industria, 9 Turismo, 10 Transporte y Obras Públicas
 * (Dirección Nacional de Arquitectura), 11 Educación y Cultura, 12 Salud Pública, 13 Trabajo, 14
 * Vivienda, 15 Desarrollo Social, 16 Poder Judicial, 24 Presidencia, 26 UdelaR, 28 BPS, 32 INUMET,
 * 33 Fiscalía General de la Nación, 50 BCU, 51 BROU, 52 BHU, 53 BSE, 60 ANCAP, 65 ANTEL, 66 OSE,
 * 68 Agencia Nacional de Vivienda.
 */
const RAW_MAP: Record<string, string> = {
  // --- departmental governments -------------------------------------------
  "GOBIERNO DEPARTAMENTAL DE ARTIGAS": "80",
  "GOBIERNO DEPARTAMENTAL DE CANELONES": "81",
  "GOBIERNO DEPARTAMENTAL DE CERRO LARGO": "82",
  "GOBIERNO DEPARTAMENTAL DE COLONIA": "83",
  "GOBIERNO DEPARTAMENTAL DE DURAZNO": "84",
  // Published typo, 28 rows.
  "GOBIERNO DEPARTAMENTAL DE DURANO": "84",
  "GOBIERNO DEPARTAMENTAL DE FLORES": "85",
  "GOBIERNO DEPARTAMENTAL DE FLORIDA": "86",
  "GOBIERNO DEPARTAMENTAL DE LAVALLEJA": "87",
  "GOBIERNO DEPARTAMENTAL DE MALDONADO": "88",
  "GOBIERNO DEPARTAMENTAL DE PAYSANDU": "89",
  "GOBIERNO DEPARTAMENTAL DE RIO NEGRO": "90",
  "GOBIERNO DEPARTAMENTAL DE RIVERA": "91",
  "GOBIERNO DEPARTAMENTAL DE ROCHA": "92",
  "GOBIERNO DEPARTAMENTAL DE SALTO": "93",
  "GOBIERNO DEPARTAMENTAL DE SAN JOSE": "94",
  "GOBIERNO DEPARTAMENTAL DE SORIANO": "95",
  "GOBIERNO DEPARTAMENTAL DE TACUAREMBO": "96",
  // Published typo, 9 rows.
  "GOBIERNO DEPARTAMENTAL DE TACUAREMBOO": "96",
  "GOBIERNO DEPARTAMENTAL DE TREINTA Y TRES": "97",
  "GOBIERNO DEPARTAMENTAL DE MONTEVIDEO": "98",

  // --- national executive + powers ----------------------------------------
  "PODER LEGISLATIVO": "1",
  "PODER EJECUTIVO": "24",
  "PODER JUDICIAL": "16",
  "MINISTERIO DE DEFENSA": "3",
  "MINISTERIO DE DEFENSA NACIONAL": "3",
  "MINISTERIO DEL INTERIOR": "4",
  "MINISTERIO DE ECONOMIA": "5",
  "MINISTERIO DE ECONOMIA Y FINANZAS": "5",
  "MINISTERIO DE RELACIONES EXTERIORES": "6",
  "MINISTERIO DE GANADERIA AGRICULTURA Y PESCA": "7",
  "MINISTERIO DE INDUSTRIA ENERGIA Y MINERIA": "8",
  "MINISTERIO DE TURISMO Y DEPORTE": "9",
  "MINISTERIO DE TURISMO": "9",
  "MINISTERIO DE TRANSPORTE Y OBRAS PUBLICAS": "10",
  "MINISTERIO DE EDUCACION Y CULTURA": "11",
  "MINISTERIO DE SALUD PUBLICA": "12",
  "MINISTERIO DE TRABAJO Y SEGURIDAD SOCIAL": "13",
  "MINISTERIO DE VIVIENDA Y ORDENAMIENTO TERRITORIAL": "14",
  "MINISTERIO DE VIVIENDA ORDENAMIENTO TERRITORIAL Y MEDIO AMBIENTE": "14",
  "MINISTERIO DE DESARROLLO SOCIAL": "15",
  "FISCALIA GENERAL DE LA NACION": "33",
  "UNIVERSIDAD DE LA REPUBLICA": "26",
  "INUMET": "32",

  // --- entes and public banks ---------------------------------------------
  "BANCO DE PREVISION SOCIAL": "28",
  "BANCO CENTRAL DEL URUGUAY": "50",
  "BANCO DE LA REPUBLICA ORIENTAL DEL URUGUAY": "51",
  "BANCO HIPOTECARIO": "52",
  "BANCO HIPOTECARIO DEL URUGUAY": "52",
  "BANCO DE SEGUROS DEL ESTADO": "53",
  "ANCAP": "60",
  "ANTEL": "65",
  "OSE": "66",
  "AGENCIA NACIONAL DE VIVIENDA": "68",
};

/** Normalised-key lookup, built once. */
const INCISO_BY_JUTEP_NAME = new Map<string, string>(
  Object.entries(RAW_MAP).map(([key, value]) => [normalizeIncisoName(key), value])
);

/**
 * The inciso prefix for a JUTEP inciso label, or null when it does not correspond to a body that
 * buys. Never guesses: an unknown label returns null rather than a fuzzy nearest match, because a
 * wrong join here would attribute one organism's omisos to another.
 */
export function resolveIncisoCode(jutepInciso: string | null | undefined): string | null {
  const key = normalizeIncisoName(jutepInciso);
  if (!key) return null;
  return INCISO_BY_JUTEP_NAME.get(key) ?? null;
}

/** Every inciso prefix the table can produce. Used by the test to guard against typos in the map. */
export function knownIncisoCodes(): string[] {
  return [...new Set(INCISO_BY_JUTEP_NAME.values())].sort((a, b) => Number(a) - Number(b));
}

/**
 * Mask a published cédula for display: keep the last three digits only.
 *
 * The roster is public and so is the document number in it, but reproducing full identity documents
 * on a high-traffic page invites misuse for identity fraud and adds nothing a reader needs. The
 * masked tail is enough to tell two officials with the same name apart, which is the only reason
 * the number is useful here.
 */
export function maskDocument(documento: string | null | undefined): string | null {
  const digits = (documento ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `•••${digits.slice(-3)}`;
}
