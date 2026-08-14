#!/usr/bin/env tsx
/**
 * ¿Qué patrones de alias matchean a MÁS DE UN organismo del corpus?
 *
 * Encontrado en producción: `/NACIONAL DE TELECOMUNICACIONES/` matchea tanto
 * "Administración Nacional de Telecomunicaciones" (ANTEL) como "Dirección Nacional de
 * Telecomunicaciones" (DINATEL, que es otra cosa), así que la ficha de DINATEL mostraba
 * noticias de ANTEL. Eso es misatribución: exactamente lo que este diseño existe para
 * evitar.
 *
 * Un patrón que alcanza a dos organismos distintos es un defecto, no un matiz.
 *
 *   npx tsx tests/unit/news-alias-overreach.verify.ts
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { BuyerPatternModel } from "../../shared/models";
import { organismAliases } from "../../shared/news-search";

async function main(): Promise<void> {
  await connectToDatabase();

  const buyers = await BuyerPatternModel.find({ name: { $type: "string" } }, { _id: 0, buyerId: 1, name: 1 })
    .sort({ totalValue: -1 })
    .lean();

  // Agrupar organismos por el conjunto de alias que les toca.
  const byAlias = new Map<string, string[]>();
  for (const b of buyers as Array<{ buyerId: string; name: string }>) {
    const aliases = organismAliases(b.name);
    for (const a of aliases) {
      const list = byAlias.get(a) ?? [];
      list.push(b.name);
      byAlias.set(a, list);
    }
  }

  let bad = 0;
  console.log("alias → organismos que lo reciben\n");
  for (const [alias, names] of [...byAlias.entries()].sort()) {
    const unique = [...new Set(names)];
    const flag = unique.length > 1 ? "  ← SOBRE-ALCANCE" : "";
    if (unique.length > 1) bad++;
    console.log(`${alias.padEnd(10)} ${unique.length}${flag}`);
    if (unique.length > 1) for (const n of unique) console.log(`             · ${n}`);
  }

  console.log(`\npatrones que alcanzan a más de un organismo: ${bad}`);
  if (bad > 0) process.exitCode = 1;

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
