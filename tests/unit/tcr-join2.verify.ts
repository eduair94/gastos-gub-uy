#!/usr/bin/env tsx
/**
 * Segundo sondeo del cruce TC ↔ corpus. El primero mostró que `tender.title` guarda
 * «<Método> <N>/<Año>» ("Compra Directa 5/2021"), el mismo formato que usa la resolución
 * ("Licitación Pública Nº 5/2021"). Falta confirmar que el caso exacto exista y medir
 * cuán ambiguo es el cruce: ¿un mismo <organismo, método, número/año> apunta a una sola
 * compra, o a varias?
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { ReleaseModel } from "../../shared/models";

async function main(): Promise<void> {
  await connectToDatabase();

  // El caso de la resolución 39583: Casinos, Licitación Pública 5/2021.
  const exact = await ReleaseModel.find(
    { "buyer.name": { $regex: /casino/i }, "tender.title": { $regex: /Licitaci[oó]n P[uú]blica\s*5\/2021/i } },
    { _id: 0, id: 1, ocid: 1, tag: 1, "tender.title": 1, "tender.description": 1, "buyer.name": 1 }
  ).lean();
  console.log(`Casinos · "Licitación Pública 5/2021" → ${exact.length} release(s)`);
  for (const r of exact as Array<Record<string, any>>) {
    console.log(`  ${r.id} · ${r.tender?.title} · ${String(r.tender?.description ?? "").slice(0, 100)}`);
  }

  // ¿Cuán poblado está tender.title en general?
  const [withTitle, total] = await Promise.all([
    ReleaseModel.countDocuments({ "tender.title": { $type: "string", $ne: "" } }),
    ReleaseModel.estimatedDocumentCount(),
  ]);
  console.log(`\ntender.title poblado en ${withTitle} de ~${total} releases (${((withTitle / total) * 100).toFixed(1)}%)`);

  // Formatos que aparecen, para escribir el matcher contra la realidad y no contra una idea.
  const forms = await ReleaseModel.aggregate([
    { $match: { "tender.title": { $type: "string", $ne: "" } } },
    { $limit: 40000 },
    {
      $project: {
        metodo: {
          $trim: {
            input: {
              $arrayElemAt: [{ $split: ["$tender.title", " "] }, 0],
            },
          },
        },
      },
    },
    { $group: { _id: "$metodo", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 8 },
  ]);
  console.log("\nprimera palabra de tender.title (muestra de 40k):");
  for (const f of forms) console.log(`  ${f._id}: ${f.n}`);

  // Ambigüedad del cruce: ¿cuántas compras comparten organismo+título?
  const dup = await ReleaseModel.aggregate([
    { $match: { "tender.title": { $type: "string", $ne: "" }, "buyer.name": { $type: "string" } } },
    { $limit: 60000 },
    { $group: { _id: { b: "$buyer.name", t: "$tender.title" }, ocids: { $addToSet: "$ocid" } } },
    { $project: { n: { $size: "$ocids" } } },
    { $group: { _id: null, claves: { $sum: 1 }, ambiguas: { $sum: { $cond: [{ $gt: ["$n", 1] }, 1, 0] } } } },
  ]);
  if (dup[0]) {
    const { claves, ambiguas } = dup[0];
    console.log(`\nclaves <organismo, título>: ${claves} · con más de una compra: ${ambiguas} (${((ambiguas / claves) * 100).toFixed(1)}%)`);
  }

  await disconnectFromDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exitCode = 1;
});
