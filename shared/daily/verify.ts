import type { IDailyFact, IDailySource, IDailyText } from "../types/daily-investigation";

/**
 * El contrato editorial de la nota diaria, aplicado por código.
 *
 * POR QUÉ EXISTE. Las investigaciones largas las escribe una persona y las revisa un diff.
 * La nota diaria la escribe un modelo a las siete de la mañana y no la lee nadie antes de
 * publicarse. El único control posible es automático, y tiene que correr sobre el texto final,
 * no sobre el prompt que lo pidió.
 *
 * LA REGLA QUE MÁS IMPORTA ES LA 4. Todo número del texto tiene que estar en el bloque de
 * hechos medidos. Un modelo que redacta sobre cifras suministradas igual inventa una cifra
 * intermedia —un promedio, un porcentaje, una comparación— y esa cifra inventada es
 * indistinguible de las verdaderas para el lector. Si el número no se midió, la nota no sale.
 *
 * Este archivo es puro a propósito: no toca la base ni la red, así que un test lo corre entero.
 */

/** Palabras que dictarían un fallo que no nos toca dictar. Mismas que verify-derived-casos. */
export const PROHIBIDAS: RegExp[] = [
  /\birregular/i,
  /\bdelito\b/i,
  /\bfraude\b/i,
  /\bcorrupci[oó]n\b/i,
  /\bil[ie]gal/i,
  /\bdesv[ií]o de fondos\b/i,
  /\brob[oó]\b/i,
  /\bcoima\b/i,
  /\bsobreprecio\b/i,
  /\bcolusi[oó]n\b/i,
  /\bamiguismo\b/i,
  /\bacomodo\b/i,
];

/** Adjetivos de venta. La nota informa; no promociona. */
export const MARKETING: RegExp[] = [
  /\bescandaloso/i,
  /\bimpactante/i,
  /\bhist[oó]rico\b/i,
  /\balarmante/i,
  /\bmillonari[oa]\b/i,
  /\bdesorbitad/i,
];

export interface VerifyInput {
  lane: string;
  laneNormCite: string;
  facts: IDailyFact[];
  sources: IDailySource[];
  reproduce: string;
  es: IDailyText;
  en: IDailyText;
}

export interface VerifyResult {
  ok: boolean;
  reasons: string[];
}

const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre"
  + "|january|february|march|april|may|june|july|august|september|october|november|december";
const UNIDADES_TIEMPO = "d[ií]as?|semanas?|meses|mes|a[nñ]os?|horas?|days?|weeks?|months?|years?|hours?";

/**
 * Los números que un texto AFIRMA como medición.
 *
 * Descarta el andamiaje de la prosa, que no es una afirmación cuantitativa y produciría
 * rechazos falsos. MEDIDO CONTRA EL PRIMER BORRADOR: sin estos descartes, la frase legítima
 * «entre el 18 de julio y el 17 de agosto … su mediana de los 24 meses previos» disparaba
 * tres rechazos y ninguna nota correcta podía publicarse.
 *
 *   año de cuatro cifras          2026
 *   cita legal                    artículo 33, ley 18.159, TOCAF 114
 *   día del mes                   18 de julio
 *   ventana temporal              24 meses, 30 días, dos años
 *   entero de una sola cifra      «tres organismos»
 */
export function claimedNumbers(text: string): string[] {
  const out: string[] = [];
  // Captura 1.234.567,89 · 1,234,567.89 · 1234567 · 12,5 · 12.5
  const re = /\d[\d.,]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // El separador final NO es parte del número: en «se midieron 17, y de esos…» la captura
    // trae «17,» y el mensaje de rechazo nombra una cifra que nadie escribió. Pasó en la
    // primera corrida real, sobre el texto en inglés.
    const raw = m[0].replace(/[.,]+$/, "");
    if (!raw) continue;
    const before = text.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    const after = text.slice(m.index + raw.length, m.index + raw.length + 18).toLowerCase();

    // «artículo 33», «ley 18.159», «TOCAF 114» — citas legales, no mediciones.
    if (new RegExp(`(art[íi]culo|art\\.|ley|decreto|tocaf|numeral|inciso)\\s*[nº°]?\\s*$`, "i").test(before)) continue;
    // «18 de julio» — día del mes.
    if (new RegExp(`^\\s*(de|of)\\s+(${MESES})`, "i").test(after)) continue;
    // «24 meses», «30 días» — ventana, no medición.
    if (new RegExp(`^\\s*(${UNIDADES_TIEMPO})\\b`, "i").test(after)) continue;

    const digits = raw.replace(/[.,]/g, "");
    if (digits.length <= 1) continue;
    const asInt = Number(digits);
    if (digits.length === 4 && asInt >= 1990 && asInt <= 2100) continue; // año
    out.push(raw);
  }
  return out;
}

/** Un número, sin separadores de miles ni decimales, para comparar contra los hechos. */
function normalizeNumber(raw: string): string {
  return raw.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
}

/**
 * ¿El número está en el bloque medido?
 *
 * Acepta el valor exacto y el redondeo que la prosa usa de verdad: «$ 185,3 millones» para
 * 185.316.878. Por eso compara también los primeros dígitos significativos.
 */
function factsContain(numRaw: string, facts: IDailyFact[]): boolean {
  const target = normalizeNumber(numRaw);
  if (!target) return false;

  for (const fact of facts) {
    // La etiqueta y la procedencia también cuentan: «mediana de 24 meses» describe la
    // ventana medida, y la prosa la repite con todo derecho.
    const haystack = [fact.value, fact.raw === undefined ? "" : String(fact.raw), fact.label, fact.provenance].join(" ");
    for (const cand of haystack.match(/\d[\d.,]*/g) ?? []) {
      const norm = normalizeNumber(cand);
      if (norm === target) return true;
      // Redondeo hacia arriba o abajo en la prosa: comparar prefijos significativos.
      const short = target.length <= norm.length ? target : norm;
      const long = target.length <= norm.length ? norm : target;
      if (short.length >= 2 && long.startsWith(short.slice(0, Math.min(short.length, 3)))) {
        // Sólo vale si además la magnitud coincide (mismo orden de 10, ±1).
        if (Math.abs(long.length - short.length) <= 1 && long.slice(0, 2) === short.slice(0, 2)) return true;
      }
    }
  }
  return false;
}

function checkText(t: IDailyText, locale: string, facts: IDailyFact[], reasons: string[]): void {
  const required: Array<[keyof IDailyText, number]> = [
    ["title", 12], ["dek", 25], ["measured", 40], ["contexto", 40],
    ["norm", 30], ["normCite", 10], ["missing", 45], ["answers", 20],
  ];
  for (const [field, min] of required) {
    const value = String(t[field] ?? "").trim();
    if (!value) { reasons.push(`${locale}.${field} vacío`); continue; }
    if (value.length < min) reasons.push(`${locale}.${field} demasiado corto (${value.length} < ${min})`);
  }
  if (String(t.title ?? "").length > 110) reasons.push(`${locale}.title supera 110 caracteres`);
  if (String(t.dek ?? "").length > 240) reasons.push(`${locale}.dek supera 240 caracteres`);

  const whole = [t.title, t.dek, t.measured, t.contexto, t.norm, t.missing, t.answers].join(" \n ");
  for (const re of PROHIBIDAS) {
    if (re.test(whole)) reasons.push(`${locale} usa una palabra que dicta un fallo: ${re.source}`);
  }
  for (const re of MARKETING) {
    if (re.test(whole)) reasons.push(`${locale} usa un adjetivo de venta: ${re.source}`);
  }

  // Formato numérico rioplatense. NO es cosmética: «185.3» leído en español es ciento
  // ochenta y cinco mil trescientos, no ciento ochenta y cinco coma tres. El modelo ignoró
  // esta regla dos veces seguidas cuando estaba sólo en el prompt, así que vive acá.
  //
  // El discriminante es el tamaño del grupo: un punto seguido de TRES dígitos es separador de
  // miles y está bien («185.316.878»); seguido de uno o dos es punto decimal y está mal.
  if (locale === "es") {
    // El `(?<![\d.])` es lo que hace que el mensaje nombre «185.3» y no «5.3», y además
    // impide que el tramo final de «185.316.878» se lea como decimal.
    const decimalDot = whole.match(/(?<![\d.])\d+\.\d{1,2}(?!\d)/g);
    if (decimalDot) {
      reasons.push(`es usa punto decimal a la inglesa en «${decimalDot[0]}»; en español va coma`);
    }
    // «N veces más» son N+1 veces. Cuando el hecho medido dice que algo EQUIVALE a N veces
    // otra cosa, «N veces más» lo exagera en una unidad entera. «N veces mayor» es correcto.
    if (/\bveces\s+m[áa]s\b/i.test(whole)) {
      reasons.push("es dice «veces más», que son N+1 veces; el hecho medido es un cociente, así que va «veces» o «veces mayor»");
    }
  }

  // REGLA 4. Todo número afirmado tiene que existir en el bloque medido.
  for (const num of claimedNumbers([t.measured, t.dek, t.title].join(" "))) {
    if (!factsContain(num, facts)) {
      reasons.push(`${locale} afirma el número «${num}», que no está en los hechos medidos`);
    }
  }
}

export function verifyDaily(input: VerifyInput): VerifyResult {
  const reasons: string[] = [];

  if (!input.reproduce?.trim()) reasons.push("falta el comando que vuelve a medir el hecho");
  if (input.facts.length < 3) reasons.push(`sólo ${input.facts.length} hechos medidos; el mínimo es 3`);
  for (const [i, f] of input.facts.entries()) {
    if (!f.label?.trim()) reasons.push(`hecho ${i + 1} sin etiqueta`);
    if (!f.provenance?.trim()) reasons.push(`hecho ${i + 1} sin procedencia`);
  }

  // La cita legal la fija el carril, no el modelo. Si no coincide, el modelo la reescribió.
  if (String(input.es.normCite ?? "").trim() !== input.laneNormCite.trim()) {
    reasons.push("la cita legal no coincide con la del carril: el modelo la reescribió");
  }

  for (const s of input.sources) {
    if (!(s.httpStatus >= 200 && s.httpStatus < 300)) {
      reasons.push(`la fuente «${s.url}» contestó ${s.httpStatus}`);
    }
    if (!s.outlet?.trim() || !s.title?.trim()) reasons.push(`la fuente «${s.url}» no trae medio o título`);
  }

  checkText(input.es, "es", input.facts, reasons);
  checkText(input.en, "en", input.facts, reasons);

  return { ok: reasons.length === 0, reasons };
}
