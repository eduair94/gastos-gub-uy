/**
 * Guarda de regresión del chequeo de salud del deploy. Sin DB ni red. Correr:
 *   npx tsx tests/unit/deploy-health-timing.test.ts
 *
 * QUÉ PROTEGE. El 2026-08-13 un deploy sano tumbó producción: el build salió bien, el bundle
 * en staging sirvió datos, se hizo el swap, y el chequeo posterior falló con
 * `not healthy within 30s (last: The operation was aborted due to timeout)`. El "aborted" no
 * era la ventana de 30s sino el corte POR REQUEST, que estaba hardcodeado en 5s dentro del
 * fetch. En el deploy exitoso de esa misma noche el chequeo tardó 12,0s en pasar
 * (22:09:44 → 22:09:56): con un corte de 5s, un arranque en frío no puede pasar NUNCA, porque
 * cada sonda se aborta antes de que el servidor conteste. El rollback usaba el mismo número,
 * así que también se declaró enfermo y el sitio quedó abajo.
 *
 * Por eso esto no mide "que los números sean grandes": mide las tres relaciones que el
 * incidente rompió, y que el archivo no vuelva a llevar un timeout literal en el fetch.
 *
 * Se lee el fuente en vez de importarlo a propósito: `deploy-dashboard.mjs` ejecuta `main()`
 * al importarse, o sea que un import haría un deploy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "..", "..", "scripts", "deploy-dashboard.mjs"), "utf8");

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

/** Lee `const NOMBRE = 12_345` del fuente, con separadores de miles opcionales. */
function constant(name: string): number | null {
  const m = SRC.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)`));
  return m?.[1] ? Number(m[1].replace(/_/g, "")) : null;
}

console.log("🧪 deploy · paciencia del chequeo de salud");
console.log("==========================================");

const probeMs = constant("HEALTH_PROBE_TIMEOUT_MS");
const healthMs = constant("HEALTH_TIMEOUT_MS");
const rollbackMs = constant("ROLLBACK_TIMEOUT_MS");
const smokeMs = constant("SMOKE_TIMEOUT_MS");

ok("las cuatro constantes existen", [probeMs, healthMs, rollbackMs, smokeMs].every(v => typeof v === "number"),
  JSON.stringify({ probeMs, healthMs, rollbackMs, smokeMs }));

/** El arranque en frío medido fue 12,0s; el corte por sonda tiene que dejarlo terminar. */
const COLD_START_MS = 12_000;
ok(`el corte por sonda supera el arranque en frío medido (${COLD_START_MS / 1000}s)`,
  (probeMs ?? 0) >= COLD_START_MS * 1.25, `probe=${probeMs}`);

ok("la ventana del chequeo permite al menos 4 sondas",
  (healthMs ?? 0) >= 4 * (probeMs ?? Infinity), `health=${healthMs} probe=${probeMs}`);

/** El rollback es la última línea de defensa: nunca menos paciente que el deploy. */
ok("el rollback es al menos tan paciente como el deploy",
  (rollbackMs ?? 0) >= (healthMs ?? Infinity), `rollback=${rollbackMs} health=${healthMs}`);

ok("el smoke test del build en staging deja terminar una sonda",
  (smokeMs ?? 0) >= (probeMs ?? Infinity), `smoke=${smokeMs} probe=${probeMs}`);

/** El bug original: el timeout iba como número literal adentro del fetch. */
const literalTimeout = /AbortSignal\.timeout\(\s*\d/.test(SRC);
ok("ningún AbortSignal.timeout con número literal en el script", !literalTimeout,
  "el corte por request tiene que salir de una constante nombrada");

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
