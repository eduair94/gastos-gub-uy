#!/usr/bin/env tsx
/**
 * Rellena `organismKey` en las resoluciones ya scrapeadas.
 *
 * El campo se agregó después de leer 2.000+ fichas, así que sin este backfill el panel
 * de la ficha del organismo quedaría mudo para todo lo ya guardado — y mudo SIN error,
 * que es la peor forma de romperse.
 *
 *   npx tsx tests/unit/tcr-backfill-organism-key.verify.ts          (informe)
 *   npx tsx tests/unit/tcr-backfill-organism-key.verify.ts --commit (escribe)
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { TcrResolutionModel } from "../../shared/models";
import { organismKey } from "../../shared/tcr-resolution";

const commit = process.argv.includes("--commit");

async function main(): Promise<void> {
  await connectToDatabase();

  const pending = await TcrResolutionModel.find(
    { organism: { $ne: null }, organismKey: null },
    { _id: 0, tcrId: 1, organism: 1 }
  ).lean();

  console.log(`resoluciones con organismo y sin clave: ${pending.length}`);
  if (!pending.length) {
    console.log("nada que hacer");
    await disconnectFromDatabase();
    return;
  }

  const sample = pending.slice(0, 3) as Array<Record<string, any>>;
  for (const s of sample) console.log(`  ${s.organism} → ${organismKey(s.organism)}`);

  if (!commit) {
    console.log("\n(informe: nada se escribió; pasá --commit)");
    await disconnectFromDatabase();
    return;
  }

  let written = 0;
  for (const row of pending as Array<Record<string, any>>) {
    const key = organismKey(row.organism);
    if (!key) continue;
    await TcrResolutionModel.updateOne({ tcrId: row.tcrId }, { $set: { organismKey: key } });
    written++;
  }
  console.log(`\nclaves escritas: ${written}`);

  const distinct = await TcrResolutionModel.distinct("organismKey", { organismKey: { $ne: null } });
  console.log(`organismos distintos con clave: ${distinct.length}`);

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
