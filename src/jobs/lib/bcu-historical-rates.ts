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
  // month -> field -> running mean
  const sums = new Map<string, Record<string, { sum: number; n: number }>>();
  for (const row of rows) {
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
  return parseCotizaciones(await res.text());
}
