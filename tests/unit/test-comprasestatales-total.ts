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

// ocid -> the id the detalle page is keyed on. The tail is used verbatim as the
// /consultas/detalle/id/<tail> path segment: numeric ids AND the alphanumeric
// ones the older records carry (e.g. a6005, a27187, i292944) both resolve on the
// government site, so both are accepted. Only a string that never had a real
// `ocds-<pub>-<tail>` shape yields null.
assert.equal(idCompraFromOcid("ocds-yfs5dr-53193"), "53193");
assert.equal(idCompraFromOcid("ocds-abc123-1307206"), "1307206");
assert.equal(idCompraFromOcid("ocds-yfs5dr-a6005"), "a6005");
assert.equal(idCompraFromOcid("ocds-yfs5dr-i292944"), "i292944");
assert.equal(idCompraFromOcid("garbage"), null);
assert.equal(idCompraFromOcid("ocds-yfs5dr-"), null); // empty tail -> not scrapeable
assert.equal(idCompraFromOcid(""), null);
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

// The label is present, but the bolded value is NOT its sibling <li> — it
// lives in a different, later <li> pair instead (e.g. some other field on
// the page happens to be bolded). This must yield null, never that other
// field's value, however plausible it looks.
//
// The dangerous direction is the SMALL decoy: the downstream job only
// corrects when computedTotal/officialTotal >= 5, so a spuriously small
// parse here would drive that ratio UP, making the gate more confident it
// found an artifact — exactly backwards. Both directions must be covered.
const largeDecoyHtml = `
  <ul class="list-inline buy-detail-list">
    <li class="col-md-6 col-xs-6">Monto Total de la Compra:</li>
    <li class="col-md-6 col-xs-6">sin valor destacado</li>
  </ul>
  <ul class="list-inline buy-detail-list">
    <li class="col-md-6 col-xs-6">Otro campo:</li>
    <li class="col-md-6 col-xs-6"><strong>U$S 999.999.999,00</strong></li>
  </ul>
`;
assert.equal(parseOfficialTotal(largeDecoyHtml), null);

const smallDecoyHtml = `
  <ul class="list-inline buy-detail-list">
    <li class="col-md-6 col-xs-6">Monto Total de la Compra:</li>
    <li class="col-md-6 col-xs-6">sin valor destacado</li>
  </ul>
  <ul class="list-inline buy-detail-list">
    <li class="col-md-6 col-xs-6">Otro campo:</li>
    <li class="col-md-6 col-xs-6"><strong>U$S 1,00</strong></li>
  </ul>
`;
assert.equal(parseOfficialTotal(smallDecoyHtml), null);

// The label's own sibling <li> is present but its <strong> is empty — still null.
const emptyStrongHtml = `
  <ul class="list-inline buy-detail-list">
    <li class="col-md-6 col-xs-6">Monto Total de la Compra:</li>
    <li class="col-md-6 col-xs-6"><strong></strong></li>
  </ul>
`;
assert.equal(parseOfficialTotal(emptyStrongHtml), null);

console.log("ok: comprasestatales total");
