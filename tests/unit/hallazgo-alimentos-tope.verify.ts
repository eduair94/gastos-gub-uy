#!/usr/bin/env tsx
/**
 * HALLAZGO «alimentos-tope» — el Presupuesto derogó el tope de precios de ARCE para comprar
 * alimentos a organizaciones de productores familiares, y a siete meses de vigencia el precio
 * pagado sigue por debajo del de mercado.
 *
 *   npx tsx tests/unit/hallazgo-alimentos-tope.verify.ts  (tarda unos minutos)
 *
 * QUÉ MIDE. El art. 29 de la Ley 20.446 derogó, desde el 1/1/2026, el inciso que obligaba a que el
 * precio pagado en ese canal no superara el publicado por ARCE. La pregunta es si el precio se
 * movió. Se identifican los RUT de sociedades de fomento rural y cooperativas agrarias, y para
 * cada línea suya se calcula el precio unitario dividido por la MEDIANA DE MERCADO del mismo
 * artículo del catálogo, la misma unidad y el mismo semestre, comprada por cualquier OTRO
 * proveedor. Un ratio de 0,90 quiere decir que pagaron el 90% de lo que paga el mercado.
 *
 * DOS DECISIONES QUE CAMBIAN EL RESULTADO Y HAY QUE DEJAR ESCRITAS. Se excluye el código 68715
 * («canasta de frutas y hortalizas»), cuya unidad no es comparable entre compras. Y el mercado de
 * referencia excluye a las propias organizaciones, para no compararlas contra sí mismas.
 *
 * RESULTADO EL 14/08/2026 (contra el que hay que comparar dentro de un año):
 *   - Ratio mediano por semestre: 0,905 (2024-S1) · 0,879 (2024-S2) · 0,886 (2025-S1) ·
 *     0,941 (2025-S2) · 0,919 (2026-S1, primer semestre completo con la norma vigente).
 *   - Agregado: 0,916 ANTES (julio 2024 a diciembre 2025, n=248) contra 0,874 DESPUÉS
 *     (enero a agosto de 2026, n=127). La diferencia es −0,04.
 *   - Un test de permutación de 20.000 remuestreos da p≈0,51: indistinguible del ruido.
 *   - El volumen tampoco se movió: 62 compras en 2025-S1, 79 en 2025-S2 y 49 en 2026-S1.
 *   - 2026-S2 está incompleto y NO debe leerse como semestre.
 *
 * QUÉ NO PRUEBA, Y ES LA FRASE QUE NO SE PUEDE CAMBIAR. Con esta muestra sólo se puede afirmar «no
 * se detecta un cambio», nunca «no hubo efecto»: con siete meses y medio de vigencia y 127 líneas
 * después del corte, un cambio menor a ~15% en la mediana no se distingue del ruido. Además la
 * mediana de mercado es un PROXY del techo legal, que era el precio de referencia de ARCE y no
 * existe como dato abierto. Y el universo son RUT identificados por el nombre del proveedor, así
 * que incluye agroindustrias grandes y pierde organizaciones habilitadas con otro nombre.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(10 * 60 * 1000);

import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const ORGANIZACIONES =
  /(SOCIEDAD (DE )?FOMENTO RURAL|SOC\.? ?FOMENTO RURAL|COOPERATIVA AGRARIA|COOP\.? ?AGRARIA|COOPERATIVA AGROPECUARIA)/i;
/** Su unidad no es comparable entre compras: una «canasta» no es una cantidad. */
const EXCLUIDO = "68715";
const VIGENCIA = new Date("2026-01-01");
const DESDE_PRE = new Date("2024-07-01");

const digitos = (s: string): string => (s || "").replace(/\D/g, "");
const semestre = (d: Date): string => `${d.getUTCFullYear()}-${d.getUTCMonth() < 6 ? "S1" : "S2"}`;
const mediana = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2;
};

async function main(): Promise<void> {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const rel = db.collection("releases");

  const orgs = await db.collection("supplier_patterns").find({ name: ORGANIZACIONES }, { projection: { supplierId: 1 } }).toArray();
  const ruts = new Set((orgs as any[]).map(o => digitos(o.supplierId)).filter(Boolean));
  const ids = [...ruts].flatMap(r => [r, `R${r}`, `R/${r}`]);
  console.log(`organizaciones identificadas: ${ruts.size} RUT`);

  const lineasOrg = await rel
    .aggregate(
      [
        { $match: { tag: "award", "awards.suppliers.id": { $in: ids } } },
        { $unwind: "$awards" },
        { $match: { "awards.suppliers.id": { $in: ids } } },
        { $unwind: "$awards.items" },
        { $project: { _id: 0, date: 1, code: "$awards.items.classification.id" } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  console.log(`líneas de adjudicación de esas organizaciones: ${lineasOrg.length}`);

  const cuenta: Record<string, number> = {};
  for (const l of lineasOrg as any[]) {
    if (l.date && new Date(l.date) >= new Date("2021-01-01")) cuenta[l.code] = (cuenta[l.code] ?? 0) + 1;
  }
  const codigos = Object.entries(cuenta)
    .filter(([c, n]) => n >= 5 && c !== EXCLUIDO)
    .map(([c]) => c);
  console.log(`artículos con al menos 5 líneas (excluido ${EXCLUIDO}): ${codigos.length}`);

  const mercado = await rel
    .aggregate(
      [
        { $match: { sourceYear: { $gte: 2021 }, tag: "award", "awards.items.classification.id": { $in: codigos } } },
        { $unwind: "$awards" },
        { $unwind: "$awards.items" },
        { $match: { "awards.items.classification.id": { $in: codigos } } },
        {
          $project: {
            _id: 0,
            date: 1,
            sid: { $arrayElemAt: ["$awards.suppliers.id", 0] },
            code: "$awards.items.classification.id",
            u: "$awards.items.unit.name",
            p: "$awards.items.unit.value.amount",
            c: "$awards.items.unit.value.currency",
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const ok = (mercado as any[]).filter(r => r.c === "UYU" && typeof r.p === "number" && r.p > 1 && r.p < 1e6 && r.date);
  console.log(`líneas de mercado utilizables: ${ok.length}`);

  // La referencia excluye a las propias organizaciones: si no, se comparan contra sí mismas.
  const base: Record<string, number[]> = {};
  for (const r of ok) {
    if (ruts.has(digitos(r.sid))) continue;
    (base[`${r.code}|${r.u}|${semestre(new Date(r.date))}`] ||= []).push(r.p);
  }
  const referencia: Record<string, number> = {};
  for (const k in base) if (base[k].length >= 8) referencia[k] = mediana(base[k]);

  const porSemestre: Record<string, number[]> = {};
  const comprasPorSemestre: Record<string, Set<string>> = {};
  const pre: number[] = [];
  const post: number[] = [];
  for (const r of ok) {
    if (!ruts.has(digitos(r.sid))) continue;
    const d = new Date(r.date);
    const b = referencia[`${r.code}|${r.u}|${semestre(d)}`];
    if (!b) continue;
    (porSemestre[semestre(d)] ||= []).push(r.p / b);
    (comprasPorSemestre[semestre(d)] ||= new Set()).add(String(r.date));
    if (d >= DESDE_PRE && d < VIGENCIA) pre.push(r.p / b);
    else if (d >= VIGENCIA) post.push(r.p / b);
  }

  console.log("\n=== ratio precio pagado / mediana de mercado, por semestre ===");
  for (const s of Object.keys(porSemestre).sort()) {
    console.log(`  ${s}: n=${String(porSemestre[s].length).padStart(4)} · ratio mediano ${mediana(porSemestre[s]).toFixed(3)}`);
  }
  console.log("  (2026-S2 está incompleto: no se lee como semestre)");

  console.log("\n=== antes y después de la derogación (vigente desde el 1/1/2026) ===");
  const medPre = mediana(pre);
  const medPost = mediana(post);
  console.log(`  ANTES  (jul-2024 a dic-2025): n=${pre.length} · mediana ${medPre.toFixed(3)}`);
  console.log(`  DESPUÉS (ene-2026 en adelante): n=${post.length} · mediana ${medPost.toFixed(3)}`);
  console.log(`  diferencia: ${(medPost - medPre).toFixed(3)}`);

  // Test de permutación: ¿esa diferencia se distingue del azar?
  const juntos = [...pre, ...post];
  const observado = Math.abs(medPost - medPre);
  let extremos = 0;
  const REMUESTREOS = 20000;
  for (let i = 0; i < REMUESTREOS; i++) {
    const mezcla = [...juntos];
    for (let j = mezcla.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [mezcla[j], mezcla[k]] = [mezcla[k], mezcla[j]];
    }
    const a = mezcla.slice(0, pre.length);
    const b = mezcla.slice(pre.length);
    if (Math.abs(mediana(b) - mediana(a)) >= observado) extremos++;
  }
  console.log(`  test de permutación (${REMUESTREOS} remuestreos): p ≈ ${(extremos / REMUESTREOS).toFixed(2)}`);
  console.log("  Con esta muestra sólo se puede decir «no se detecta un cambio», nunca «no hubo efecto».");

  console.log("\n=== el volumen: compras a esas organizaciones por semestre ===");
  const volumen = await rel
    .aggregate(
      [
        { $match: { tag: "award", "awards.suppliers.id": { $in: ids }, date: { $gte: new Date("2024-01-01") } } },
        { $group: { _id: "$ocid", date: { $first: "$date" } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  const porSem: Record<string, number> = {};
  for (const v of volumen as any[]) porSem[semestre(new Date(v.date))] = (porSem[semestre(new Date(v.date))] ?? 0) + 1;
  for (const s of Object.keys(porSem).sort()) console.log(`  ${s}: ${porSem[s]} compras`);

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
