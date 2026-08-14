#!/usr/bin/env tsx
/**
 * Limpia la prensa mal atribuida que dejaron los alias sobre-alcanzados.
 *
 * Antes de anclar los patrones, `/NACIONAL DE TELECOMUNICACIONES/` le daba el alias
 * "ANTEL" también a la Dirección Nacional de Telecomunicaciones, y `/PRIMARIA/` se lo
 * daba a 19 "Red de Atención Primaria de X". Esas fichas quedaron con notas de otro
 * organismo GUARDADAS: corregir el código no las borra.
 *
 * Detecta las filas cuyo `queriedAs` ya no corresponde con los alias vigentes y las
 * vuelve a filtrar con la tabla corregida. No borra la fila: la deja con los ítems que
 * SÍ nombran a ese organismo (posiblemente ninguno), que es la respuesta honesta.
 *
 *   npx tsx tests/unit/news-fix-misattributed.verify.ts          (informe)
 *   npx tsx tests/unit/news-fix-misattributed.verify.ts --commit (corrige)
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { OrganismNewsModel } from "../../shared/models";
import { filterRelevant, organismAliases } from "../../shared/news-search";

const commit = process.argv.includes("--commit");

async function main(): Promise<void> {
  await connectToDatabase();

  const rows = await OrganismNewsModel.find(
    { "items.0": { $exists: true } },
    { _id: 0, buyerId: 1, buyerName: 1, queriedAs: 1, items: 1 }
  ).lean();

  let touched = 0;
  let removed = 0;

  for (const r of rows as Array<Record<string, any>>) {
    const name = String(r.buyerName ?? "");
    const nowAliases = organismAliases(name);
    const storedAliases: string[] = (r.queriedAs ?? []).slice(1);

    // ¿Cambiaron los alias de este organismo?
    const same =
      storedAliases.length === nowAliases.length && storedAliases.every((a) => nowAliases.includes(a));
    if (same) continue;

    // Re-filtrar lo guardado con la tabla corregida.
    const items = (r.items ?? []).map((it: any) => ({
      title: String(it.title ?? ""),
      link: String(it.link ?? ""),
      source: String(it.source ?? ""),
      publishedAt: it.publishedAt ? new Date(it.publishedAt).toISOString() : null,
    }));
    const kept = filterRelevant(items, name, nowAliases);
    const dropped = items.length - kept.length;

    touched++;
    removed += dropped;
    console.log(
      `${name}\n   alias: [${storedAliases.join(", ")}] → [${nowAliases.join(", ")}] · ${items.length} notas → ${kept.length} (se van ${dropped})`
    );
    for (const d of items.filter((i) => !kept.some((k) => k.link === i.link)).slice(0, 3)) {
      console.log(`     ✗ ${d.source} · ${d.title.slice(0, 90)}`);
    }

    if (commit) {
      await OrganismNewsModel.updateOne(
        { buyerId: r.buyerId },
        {
          $set: {
            queriedAs: [name, ...nowAliases],
            items: kept.map((k) => ({
              title: k.title,
              link: k.link,
              source: k.source,
              publishedAt: k.publishedAt ? new Date(k.publishedAt) : null,
            })),
          },
        }
      );
    }
  }

  console.log(`\norganismos afectados: ${touched} · notas mal atribuidas: ${removed}`);
  if (!commit) console.log("(informe: nada se escribió; pasá --commit)");

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
