/**
 * Unit tests for the tax-inclusive scrape: the per-item "Monto total con
 * impuestos" + "Cantidad" + "Precio unitario sin impuestos" (parseItemFeatures)
 * and the compra grand total "Monto Total de la Compra" (parseOfficialTotal).
 *
 * The OCDS feed gives only tax-EXCLUSIVE unit prices and, worse, truncates
 * fractional quantities to integers (0,17 KG -> 0), so the tax-inclusive total
 * exists only on the government HTML page. Fixture is a frozen snapshot of
 * https://www.comprasestatales.gub.uy/consultas/detalle/id/1356720 (ASSE víveres,
 * 18 lines, mixed 22%/10%/0% IVA). Pure functions, no DB/network. Run:
 *   npx tsx tests/unit/test-comprasestatales-tax.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseItemFeatures } from "../../shared/utils/item-features";
import { parseOfficialTotal, parseUyCurrency, parseUyNumber } from "../../shared/utils/comprasestatales-total";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "fixtures", "comprasestatales-1356720.html"), "utf8");

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` -> ${detail}` : ""}`); }
}
function near(name: string, got: number | null | undefined, want: number, eps = 0.01): void {
  ok(name, got != null && Math.abs(got - want) <= eps, `got ${got}, want ${want}`);
}

console.log("🧪 comprasestatales tax scrape");
console.log("==============================");

// --- number/currency primitives ---
near("parseUyNumber 3.522,51", parseUyNumber("$ 3.522,51"), 3522.51);
near("parseUyNumber 114,7541", parseUyNumber("$ 114,7541"), 114.7541, 0.0001);
ok("parseUyCurrency $ -> UYU", parseUyCurrency("$ 3.522,51") === "UYU");
ok("parseUyCurrency U$S -> USD", parseUyCurrency("U$S 4.201,00") === "USD");

// --- grand total ---
const total = parseOfficialTotal(html);
ok("grand total parsed", total !== null);
near("grand total = 3.522,51", total?.amount, 3522.51);
ok("grand total currency UYU", total?.currency === "UYU");

// --- per-item breakdown ---
const items = parseItemFeatures(html);
ok("18 items parsed", items.length === 18, `got ${items.length}`);

const byNro = new Map(items.map(i => [i.nro, i]));

// Item 1: PAN FRANCES, 2,32 KG, net 114,7541, gross 324,80 (IVA 22%)
const i1 = byNro.get(1);
near("item1 cantidad 2,32", i1?.quantity, 2.32);
ok("item1 unidad KG", i1?.quantityUnit === "KG", `got ${i1?.quantityUnit}`);
near("item1 precio sin imp 114,7541", i1?.netUnitPrice?.amount, 114.7541, 0.0001);
near("item1 monto con imp 324,80", i1?.grossTotal?.amount, 324.80);
ok("item1 gross currency UYU", i1?.grossTotal?.currency === "UYU");

// Item 7: MORRON — the OCDS-truncated one (0,17 KG -> 0 in the feed). Must be fractional here.
const i7 = byNro.get(7);
near("item7 (morrón) cantidad 0,17", i7?.quantity, 0.17);
near("item7 (morrón) monto con imp 42,50", i7?.grossTotal?.amount, 42.50);

// Item 11: HUEVO — a UNIDAD line, 0% IVA (net×qty == gross).
const i11 = byNro.get(11);
near("item11 cantidad 16", i11?.quantity, 16);
ok("item11 unidad UNIDAD", i11?.quantityUnit === "UNIDAD", `got ${i11?.quantityUnit}`);
near("item11 monto con imp 192,00", i11?.grossTotal?.amount, 192.00);

// Σ gross == grand total; Σ (qty×net) == the real net subtotal (3.180,23).
const sumGross = items.reduce((s, it) => s + (it.grossTotal?.amount ?? 0), 0);
const sumNet = items.reduce((s, it) => s + (it.quantity ?? 0) * (it.netUnitPrice?.amount ?? 0), 0);
near("Σ gross ≈ grand total", sumGross, 3522.51, 0.02);
near("Σ (qty×net) ≈ 3.180,23", sumNet, 3180.23, 0.5);
ok("gross > net subtotal (tax embedded)", sumGross > sumNet);

// Every item carries a gross figure (no line silently dropped).
ok("all items have grossTotal", items.every(it => typeof it.grossTotal?.amount === "number"));

console.log("==============================");
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
