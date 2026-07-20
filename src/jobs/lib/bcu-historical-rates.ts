/**
 * BCU historical exchange rates, via the bank's SOAP service.
 *
 * The cambio-uruguay API that feeds src/jobs/refresh-exchange-rates.ts caps its
 * look-back at 60 months (HTTP 400 above that), so it cannot reach the 2000s.
 * The BCU's own service has no such limit — verified returning 2005 rows.
 *
 *   POST https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones
 *   SOAPAction: Cotizaaction/AWSBCUCOTIZACIONES.Execute
 *   -> Salida.datoscotizaciones['datoscotizaciones.dato'][] { Fecha, Moneda, TCC, TCV }
 *
 * We take TCV (venta) to match the `sell` field refresh-exchange-rates.ts averages.
 * The response is a flat list of identical blocks, so a narrow regex parse is
 * enough and avoids adding an XML dependency — but it lives ONLY in this file.
 */

const ENDPOINT = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones";
const SOAP_ACTION = "Cotizaaction/AWSBCUCOTIZACIONES.Execute";

/** Currency ids from the companion awsbcumonedas service. */
export const BCU_CODES = { usd: 2225, eur: 1111, ui: 9800 } as const;

/** Which exchange_rates field each BCU code feeds. */
const FIELD_BY_CODE: Record<number, "usd" | "eur" | "ui"> = {
  [BCU_CODES.usd]: "usd",
  [BCU_CODES.eur]: "eur",
  [BCU_CODES.ui]: "ui",
};

export interface BcuRow {
  /** `YYYY-MM-DD` */
  date: string;
  code: number;
  /** TCV — UYU per unit. */
  sell: number;
}

export interface MonthFields {
  usd?: number;
  eur?: number;
  ui?: number;
}

export function buildCotizacionesEnvelope(codes: number[], from: string, to: string): string {
  const items = codes.map((c) => `<cot:item>${c}</cot:item>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">
  <soapenv:Body>
    <cot:wsbcucotizaciones.Execute>
      <cot:Entrada>
        <cot:Moneda>${items}</cot:Moneda>
        <cot:FechaDesde>${from}</cot:FechaDesde>
        <cot:FechaHasta>${to}</cot:FechaHasta>
        <cot:Grupo>0</cot:Grupo>
      </cot:Entrada>
    </cot:wsbcucotizaciones.Execute>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Read the `<respuestastatus>` block BCU includes in every response.
 *
 * BCU returns HTTP 200 even for parameter-level errors (reversed date range,
 * out-of-range dates): status=0, a codigoerror, a human mensaje, plus a single
 * degenerate sentinel row (nil Fecha, Moneda 0, TCV 0.000000) that parseCotizaciones
 * already drops via its `sell <= 0` guard — making an error indistinguishable from
 * a legitimate no-data period unless this status block is checked separately.
 *
 * Returns null when the block is absent (e.g. a non-SOAP body), so callers can
 * tell "no status reported" apart from "status reported and it's bad".
 */
export function parseResponseStatus(
  xml: string,
): { status: number; codigoerror: number; mensaje: string } | null {
  const block = /<respuestastatus>([\s\S]*?)<\/respuestastatus>/.exec(xml)?.[1];
  if (!block) return null;
  const status = Number(/<status>([^<]+)<\/status>/.exec(block)?.[1]);
  const codigoerror = Number(/<codigoerror>([^<]+)<\/codigoerror>/.exec(block)?.[1]);
  if (!Number.isFinite(status) || !Number.isFinite(codigoerror)) return null;
  // <mensaje/> self-closes when empty, so an unmatched capture just means "".
  const mensaje = /<mensaje>([^<]*)<\/mensaje>/.exec(block)?.[1] ?? "";
  return { status, codigoerror, mensaje };
}

export function parseCotizaciones(xml: string): BcuRow[] {
  const rows: BcuRow[] = [];
  // Each quote is one <datoscotizaciones.dato> block; split and read the fields we need.
  const blocks = xml.split("<datoscotizaciones.dato").slice(1);
  for (const block of blocks) {
    const date = /<Fecha>([^<]+)<\/Fecha>/.exec(block)?.[1];
    const code = Number(/<Moneda>([^<]+)<\/Moneda>/.exec(block)?.[1]);
    const sell = Number(/<TCV>([^<]+)<\/TCV>/.exec(block)?.[1]);
    if (!date || !Number.isFinite(code) || !Number.isFinite(sell) || sell <= 0) continue;
    rows.push({ date: date.slice(0, 10), code, sell });
  }
  return rows;
}

/** Average each currency's daily quotes per calendar month, mirroring refresh-exchange-rates.ts. */
export function monthlyAveragesByCurrency(rows: BcuRow[]): Map<string, MonthFields> {
  // Collapse to one row per (currency, date) first — last wins — the same guard
  // refresh-exchange-rates.ts's monthlyAverages applies, since the upstream can
  // return several near-identical rows for the same day under different type
  // labels. With the specific codes we request BCU currently returns one row per
  // (date, currency), so this is latent rather than active, but it keeps the two
  // averaging paths behaving the same way.
  const perDay = new Map<string, BcuRow>(); // `${code}|${date}` -> row (last wins)
  for (const row of rows) {
    perDay.set(`${row.code}|${row.date}`, row);
  }

  // month -> field -> running mean
  const sums = new Map<string, Record<string, { sum: number; n: number }>>();
  for (const row of perDay.values()) {
    const field = FIELD_BY_CODE[row.code];
    if (!field) continue;
    const month = row.date.slice(0, 7);
    const perField = sums.get(month) ?? {};
    const acc = perField[field] ?? { sum: 0, n: 0 };
    acc.sum += row.sell;
    acc.n += 1;
    perField[field] = acc;
    sums.set(month, perField);
  }

  const out = new Map<string, MonthFields>();
  for (const [month, perField] of sums) {
    const rec: MonthFields = {};
    for (const [field, acc] of Object.entries(perField)) {
      if (acc.n > 0) rec[field as keyof MonthFields] = Number((acc.sum / acc.n).toFixed(6));
    }
    out.set(month, rec);
  }
  return out;
}

export async function fetchBcuRange(codes: number[], from: string, to: string): Promise<BcuRow[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "soapaction": SOAP_ACTION,
      "user-agent": "conlatuya.checkleaked.cc (datos abiertos)",
    },
    body: buildCotizacionesEnvelope(codes, from, to),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`BCU ${from}..${to}: HTTP ${res.status}`);
  const text = await res.text();
  // BCU returns HTTP 200 even for parameter-level errors (reversed range, dates
  // out of the service's window) — the payload's own status block is the only
  // signal, and it must not be conflated with a legitimate empty period.
  const status = parseResponseStatus(text);
  if (status && status.status !== 1) {
    throw new Error(
      `BCU ${from}..${to}: status ${status.status} (codigoerror=${status.codigoerror}): ${status.mensaje}`,
    );
  }
  return parseCotizaciones(text);
}
