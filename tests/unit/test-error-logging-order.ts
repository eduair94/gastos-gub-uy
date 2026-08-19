/**
 * Un 404 no se loguea como error del servidor.
 *
 *   npx tsx tests/unit/test-error-logging-order.ts
 *
 * QUÉ DEFECTO ATRAPA. En un `catch` de handler, `console.error` antes del re-lanzamiento
 * escribe el stack de TODA respuesta 404. Un id que no existe es una respuesta correcta, no
 * una falla, y los que más reciben son justo los handlers de detalle `[id]`, que un crawler
 * golpea con ids inventados.
 *
 * MEDIDO EN PRODUCCIÓN el 17-08-2026, antes del arreglo: de cada 5.000 líneas del log de
 * errores del dashboard, 262 eran «Supplier not found» con su stack. Un error real ahí adentro
 * no se ve. Tres handlers tenían el orden invertido: suppliers/[id], contracts/[id] y
 * analytics/anomalies/[id].
 *
 * LA REGLA: en un `catch`, primero `if (error.statusCode) throw error`, después `console.error`.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "app", "server");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

interface Offender { file: string; line: number }

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of walk(ROOT)) {
    const src = readFileSync(file, "utf8");
    const catchRe = /catch\s*\([^)]*\)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = catchRe.exec(src)) !== null) {
      // El cuerpo del catch, acotado para no leerse el resto del archivo.
      let block = src.slice(m.index + m[0].length, m.index + m[0].length + 900);
      const stop = block.indexOf("\n  }");
      if (stop > 0) block = block.slice(0, stop);

      const logAt = block.indexOf("console.error");
      const rethrow = /statusCode[\s\S]{0,60}?throw/.exec(block);
      if (logAt === -1 || !rethrow) continue;
      if (logAt < rethrow.index) {
        offenders.push({
          file: file.slice(file.indexOf("app")).replace(/\\/g, "/"),
          line: src.slice(0, m.index).split("\n").length,
        });
      }
    }
  }
  return offenders;
}

console.log("\norden de logueo en los catch de app/server\n");

const offenders = findOffenders();
if (offenders.length === 0) {
  console.log("  ✓ ningún handler loguea un 404 como error del servidor");
  console.log("\nTODO OK\n");
  process.exit(0);
}

console.error(`  ✗ ${offenders.length} handler(s) loguean antes de re-lanzar:`);
for (const o of offenders) console.error(`      ${o.file}:${o.line}`);
console.error("\n  Poné `if (error.statusCode) throw error` ANTES del console.error.");
console.error("  Un 404 es una respuesta correcta y su stack entierra los errores reales.\n");
process.exit(1);
