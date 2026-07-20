// tests/unit/test-comprasestatales-total.ts
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detalleUrl,
  idCompraFromOcid,
  parseOfficialTotal,
  parseUyNumber,
} from "../../src/jobs/lib/comprasestatales-total";

// Uruguayan format: dot = thousands, comma = decimals.
assert.equal(parseUyNumber("4.201,00"), 4201);
assert.equal(parseUyNumber("U$S 4.201,00"), 4201);
assert.equal(parseUyNumber("1.094.280.000,50"), 1094280000.5);
assert.equal(parseUyNumber("330.000,00"), 330000);
assert.equal(parseUyNumber("no hay monto"), null);
assert.equal(parseUyNumber(""), null);

// ocid -> the numeric id the detalle page is keyed on.
assert.equal(idCompraFromOcid("ocds-yfs5dr-53193"), "53193");
assert.equal(idCompraFromOcid("ocds-abc123-1307206"), "1307206");
assert.equal(idCompraFromOcid("garbage"), null);
assert.equal(
  detalleUrl("53193"),
  "https://www.comprasestatales.gub.uy/consultas/detalle/id/53193",
);

// The real page for adjudicacion-53193: the government's own total is 4.201 USD,
// even though it labels 3.316,00 a "Precio unitario" for 330.000 units.
const html = readFileSync(join(__dirname, "../fixtures/comprasestatales-53193.html"), "utf8");
const total = parseOfficialTotal(html)!;
assert.equal(total.amount, 4201);
assert.equal(total.currency, "USD");

// A page without the label yields null rather than a wrong number.
assert.equal(parseOfficialTotal("<html><body>nada</body></html>"), null);

console.log("ok: comprasestatales total");
