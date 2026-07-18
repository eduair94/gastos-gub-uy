/**
 * Unit tests for shared/utils/text — the normalization the open-call searchText
 * and watch keywords BOTH depend on. Pure, no DB/network. Run:
 *   npx tsx tests/unit/test-text-normalize.ts
 */
import { normalizeKeyword, normalizeText, phraseMatches } from "../../shared/utils/text";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log("🧪 text normalize");
console.log("=================");

ok("lowercases + strips accents", normalizeText("Café SÍ Ñandú") === "cafe si nandu");
ok("collapses whitespace", normalizeText("  a   b\tc  ") === "a b c");
ok("handles null/undefined", normalizeText(null) === "" && normalizeText(undefined) === "");
ok("keyword normalize matches text normalize", normalizeKeyword("TÓNER") === normalizeText("toner"));

ok("phrase substring match", phraseMatches("Equipo de Aire Acondicionado Split", "aire acondicionado") === true);
ok("phrase accent-insensitive", phraseMatches("reparación de cámaras", "reparacion") === true);
ok("single token word-boundary hit", phraseMatches("compra de tv led", "tv") === true);
ok("single token does not match substring", phraseMatches("compra de atv cuatriciclo", "tv") === false);
ok("empty phrase never matches", phraseMatches("cualquier cosa", "") === false);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
