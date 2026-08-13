#!/usr/bin/env tsx
/**
 * ¿Con qué palabras arma el corpus `tender.title`? El TC escribe "Compra Directa por
 * Excepción Nº 7/2020"; si el corpus escribe otra cosa, el cruce falla en silencio.
 * Esto lista las formas reales antes de tocar el regex.
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ReleaseModel } from "../../shared/models";

async function main(): Promise<void> {
  await connectToDatabase();

  const forms = await ReleaseModel.aggregate(
    [
      { $match: { "tender.title": { $type: "string", $ne: "" } } },
      { $limit: 120000 },
      {
        $project: {
          // Todo lo anterior al número: "Compra Directa por Excepción 7/2020" → el método.
          metodo: {
            $trim: {
              input: { $arrayElemAt: [{ $split: ["$tender.title", " "] }, 0] },
            },
          },
          full: "$tender.title",
        },
      },
      { $group: { _id: "$metodo", n: { $sum: 1 }, ejemplo: { $first: "$full" } } },
      { $sort: { n: -1 } },
      { $limit: 12 },
    ],
    { allowDiskUse: true }
  );

  console.log("primera palabra de tender.title:");
  for (const f of forms) console.log(`  ${String(f.n).padStart(7)}  ${f._id}  ·  ej: ${f.ejemplo}`);

  // ¿Existe la forma "por Excepción" en el corpus?
  const exc = await ReleaseModel.find(
    { "tender.title": { $regex: /Excepci/i } },
    { _id: 0, "tender.title": 1 }
  )
    .limit(6)
    .lean();
  console.log(`\ntítulos con "Excepción": ${exc.length}`);
  for (const e of exc as Array<Record<string, any>>) console.log(`  ${e.tender?.title}`);

  // El caso 39586: MDN · Compra Directa por Excepción 7/2020.
  for (const t of ["Compra Directa por Excepción 7/2020", "Compra Directa 7/2020"]) {
    const hits = await ReleaseModel.countDocuments({ "tender.title": t });
    console.log(`\n"${t}" → ${hits} release(s)`);
  }

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
