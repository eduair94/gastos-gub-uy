// tests/unit/test-bcu-historical-rates.ts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BCU_CODES,
  buildCotizacionesEnvelope,
  monthlyAveragesByCurrency,
  parseCotizaciones,
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

// The envelope carries every requested code and the date range verbatim.
const env = buildCotizacionesEnvelope([2225, 9800], "2005-01-01", "2005-12-31");
assert.ok(env.includes("<cot:item>2225</cot:item>"));
assert.ok(env.includes("<cot:item>9800</cot:item>"));
assert.ok(env.includes("<cot:FechaDesde>2005-01-01</cot:FechaDesde>"));
assert.ok(env.includes("<cot:FechaHasta>2005-12-31</cot:FechaHasta>"));

console.log("ok: bcu historical rates");
