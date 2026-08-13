#!/usr/bin/env tsx
/**
 * Limpia las filas fantasma que dejó el techo mal puesto.
 *
 * La primera corrida arrancó en el id 45000 cuando el archivo termina en ~39590, así que
 * guardó cientos de `exists:false` de ids que no existen y nunca van a existir. No rompen
 * nada, pero inflan "fichas sondeadas" y dan una idea falsa de cobertura.
 *
 * Sólo borra por ENCIMA del techo medido y sólo filas sin contenido: una ficha que existe
 * jamás se toca.
 *
 *   npx tsx tests/unit/tcr-purge-phantom.verify.ts          (informe)
 *   npx tsx tests/unit/tcr-purge-phantom.verify.ts --commit (borra)
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { TcrResolutionModel } from "../../shared/models";

const CEILING = 39600;
const commit = process.argv.includes("--commit");

async function main(): Promise<void> {
  await connectToDatabase();

  const filter = { tcrId: { $gt: CEILING }, exists: false };
  const phantom = await TcrResolutionModel.countDocuments(filter);
  const real = await TcrResolutionModel.countDocuments({ tcrId: { $gt: CEILING }, exists: true });

  console.log(`filas fantasma sobre el id ${CEILING}: ${phantom}`);
  console.log(`fichas REALES sobre ese id:          ${real} ${real ? "← el techo está mal, no borres" : ""}`);

  if (!commit) {
    console.log("\n(informe: nada se borró; pasá --commit)");
  } else if (real > 0) {
    console.log("\nABORTADO: hay fichas reales por encima del techo, así que el techo está mal.");
    process.exitCode = 1;
  } else {
    const res = await TcrResolutionModel.deleteMany(filter);
    console.log(`\nborradas: ${res.deletedCount}`);
  }

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
