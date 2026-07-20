// tests/unit/test-bcu-historical-rates.ts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BCU_CODES,
  buildCotizacionesEnvelope,
  monthlyAveragesByCurrency,
  parseCotizaciones,
  parseResponseStatus,
} from "../../src/jobs/lib/bcu-historical-rates";

const xml = readFileSync(
  join(__dirname, "../fixtures/bcu-cotizaciones-2005-06-28.xml"),
  "utf8",
);

// The fixture is a real BCU response for 2005-06-28, EUR + UI.
const rows = parseCotizaciones(xml);
assert.equal(rows.length, 2);

const eur = rows.find(r => r.code === BCU_CODES.eur)!;
assert.equal(eur.date, "2005-06-28");
assert.equal(eur.sell, 29.75748);

const ui = rows.find(r => r.code === BCU_CODES.ui)!;
assert.equal(ui.sell, 1.4624);

// Monthly averaging keys by YYYY-MM and maps codes onto the exchange_rates field names.
const byMonth = monthlyAveragesByCurrency(rows);
const june = byMonth.get("2005-06")!;
assert.equal(june.eur, 29.75748);
assert.equal(june.ui, 1.4624);
assert.equal(june.usd, undefined); // not in this fixture

// Averaging is a real mean across the month's days, not last-wins.
const avg = monthlyAveragesByCurrency([
  { date: "2005-06-01", code: BCU_CODES.usd, sell: 24 },
  { date: "2005-06-02", code: BCU_CODES.usd, sell: 26 },
  { date: "2005-07-01", code: BCU_CODES.usd, sell: 30 },
]);
assert.equal(avg.get("2005-06")!.usd, 25);
assert.equal(avg.get("2005-07")!.usd, 30);

// Garbage in -> no rows, never a NaN written to the DB.
assert.deepEqual(parseCotizaciones("<html>nope</html>"), []);

// Duplicate rows for the SAME (currency, date) collapse to one before averaging
// (last wins), matching refresh-exchange-rates.ts's monthlyAverages — a row on a
// different date still contributes on its own.
const dedup = monthlyAveragesByCurrency([
  { date: "2005-06-01", code: BCU_CODES.usd, sell: 24 },
  { date: "2005-06-01", code: BCU_CODES.usd, sell: 100 }, // same day, relabeled row — must not double-count
  { date: "2005-06-02", code: BCU_CODES.usd, sell: 26 },
]);
// If the duplicate contributed too, the mean would be (24+100+26)/3 = 50.
// Last-wins dedupe collapses 06-01 to 100, giving (100+26)/2 = 63.
assert.equal(dedup.get("2005-06")!.usd, 63);

// --- parseResponseStatus ---------------------------------------------------
//
// BCU returns HTTP 200 even for parameter-level errors (reversed date range,
// out-of-range dates): a status=0 body with a codigoerror/mensaje plus a single
// degenerate sentinel row. That sentinel is dropped by parseCotizaciones's own
// `sell <= 0` guard, so without this status check a service error and a
// legitimate empty period (a weekend) are indistinguishable.

// The real captured fixture is a status=1 (success) body.
assert.deepEqual(parseResponseStatus(xml), { status: 1, codigoerror: 0, mensaje: "" });

// A status=0 error body (built inline — not a network call, and the saved
// fixture file is left untouched) still yields codigoerror/mensaje.
const errorXml = `<?xml version="1.0" encoding="utf-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<SOAP-ENV:Body>
		<wsbcucotizaciones.ExecuteResponse xmlns="Cotiza">
			<Salida xmlns="Cotiza">
				<respuestastatus>
					<status>0</status>
					<codigoerror>103</codigoerror>
					<mensaje>Fecha Hasta es menor que Fecha Desde</mensaje>
				</respuestastatus>
				<datoscotizaciones>
					<datoscotizaciones.dato xmlns="Cotiza">
						<Fecha xsi:nil="true"/>
						<Moneda>0</Moneda>
						<Nombre/>
						<CodigoISO/>
						<Emisor/>
						<TCC>0.000000</TCC>
						<TCV>0.000000</TCV>
						<ArbAct>0.000000</ArbAct>
						<FormaArbitrar>0</FormaArbitrar>
					</datoscotizaciones.dato>
				</datoscotizaciones>
			</Salida>
		</wsbcucotizaciones.ExecuteResponse>
	</SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
assert.deepEqual(parseResponseStatus(errorXml), {
  status: 0,
  codigoerror: 103,
  mensaje: "Fecha Hasta es menor que Fecha Desde",
});
// parseCotizaciones itself stays pure and unchanged: the degenerate sentinel
// row is still dropped, same as any other status=0/empty-period body.
assert.deepEqual(parseCotizaciones(errorXml), []);

// A non-SOAP body with no <respuestastatus> block at all -> null, not a false positive.
assert.equal(parseResponseStatus("<html>nope</html>"), null);

// The envelope carries every requested code and the date range verbatim.
const env = buildCotizacionesEnvelope([2225, 9800], "2005-01-01", "2005-12-31");
assert.ok(env.includes("<cot:item>2225</cot:item>"));
assert.ok(env.includes("<cot:item>9800</cot:item>"));
assert.ok(env.includes("<cot:FechaDesde>2005-01-01</cot:FechaDesde>"));
assert.ok(env.includes("<cot:FechaHasta>2005-12-31</cot:FechaHasta>"));

console.log("ok: bcu historical rates");
