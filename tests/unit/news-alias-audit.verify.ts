#!/usr/bin/env tsx
/**
 * Auditoría de los alias de prensa: ¿alguno está trayendo notas que no son del organismo?
 *
 * El riesgo es el mismo que ya mordió con la sigla derivada "ANT" (matcheaba "antes"):
 * un alias que además es palabra común atribuye a un organismo cualquier titular que la
 * use. Esto lista, por alias, qué notas entraron gracias a él.
 *
 *   npx tsx tests/unit/news-alias-audit.verify.ts
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { OrganismNewsModel } from "../../shared/models";

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

async function main(): Promise<void> {
  await connectToDatabase();

  const rows = await OrganismNewsModel.find(
    { "items.0": { $exists: true } },
    { _id: 0, buyerName: 1, queriedAs: 1, items: 1 }
  ).lean();

  console.log(`organismos con notas: ${rows.length}\n`);

  let viaAliasOnly = 0;
  for (const r of rows as Array<Record<string, any>>) {
    const full = norm(String(r.buyerName ?? ""));
    const aliases: string[] = (r.queriedAs ?? []).slice(1);
    if (!aliases.length) continue;

    // Notas que NO nombran el nombre completo: entraron sólo por el alias.
    const onlyAlias = (r.items ?? []).filter((it: any) => !norm(String(it.title)).includes(full));
    if (!onlyAlias.length) continue;

    viaAliasOnly += onlyAlias.length;
    console.log(`${r.buyerName}  [alias: ${aliases.join(", ")}]`);
    for (const it of onlyAlias.slice(0, 4)) console.log(`   ${it.source} · ${String(it.title).slice(0, 100)}`);
    console.log("");
  }

  console.log(`notas que entraron SÓLO por alias: ${viaAliasOnly}`);

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
