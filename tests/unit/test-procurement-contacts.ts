// tests/unit/test-procurement-contacts.ts
// The buyer/purchasing-contact directory's serialize + filter layer.
import assert from "node:assert";
import {
  serializeProcurementContact,
  buildProcurementFilter,
  procurementSort,
  toCsv,
  toVcard,
} from "../../app/server/utils/procurement-contacts";
import { groupOrganismClause, organismGroupLabel } from "../../shared/organism-groups";

// --- serialize: dedup emails, group label, fields ---
const c = serializeProcurementContact({
  organismId: "98-1", // Montevideo departmental government
  organismName: "Intendencia de Montevideo",
  contactName: "Compras IM",
  email: "compras@imm.gub.uy",
  telephone: "+59819501234",
  faxNumber: "+59819505678",
  llamadosCount: 42,
  variants: [
    { email: "compras@imm.gub.uy" } as never, // dup of primary → collapsed
    { email: "LICITACIONES@imm.gub.uy" } as never, // new, lower-cased
    { email: "" } as never, // dropped
  ],
} as never);
assert.equal(c.group, "Intendencias", "98-1 maps to the Intendencias group");
assert.deepEqual(c.emails, ["compras@imm.gub.uy", "licitaciones@imm.gub.uy"], "emails deduped + lowercased");
assert.equal(c.email, "compras@imm.gub.uy");
assert.equal(c.faxNumber, "+59819505678");
assert.equal(c.llamadosCount, 42);

// inciso-prefix membership → Ministerios (inciso 3 = Defensa)
assert.equal(organismGroupLabel("3-15"), "Ministerios");
assert.equal(organismGroupLabel("99999-1"), null); // unknown

// --- groupOrganismClause: exact ids + inciso prefixes ---
const intend = groupOrganismClause("intendencias");
assert.ok(intend && Array.isArray((intend as any).$or), "returns an $or clause");
const inClause = (intend as any).$or.find((x: any) => x.organismId?.$in);
assert.ok(inClause.organismId.$in.includes("98-1"), "Intendencias includes Montevideo (98-1)");
const min = groupOrganismClause("ministerios");
assert.ok((min as any).$or.some((x: any) => x.organismId?.$regex === "^3-"), "Ministerios matches inciso prefixes");
assert.equal(groupOrganismClause("nope"), null);

// --- buildProcurementFilter: combine via $and ---
assert.deepEqual(buildProcurementFilter({}), {}, "no filters → empty");
assert.deepEqual(buildProcurementFilter({ q: "salud" }), { $text: { $search: "salud" } });
const combined = buildProcurementFilter({ q: "hospital", grupo: "salud", hasEmail: "1", hasPhone: "1", minLlamados: "5" });
assert.ok(Array.isArray((combined as any).$and), "multiple clauses → $and");
assert.ok((combined as any).$and.some((c2: any) => c2.$text), "keeps text search");
assert.ok((combined as any).$and.some((c2: any) => c2.telephone), "keeps hasPhone");
assert.ok((combined as any).$and.some((c2: any) => c2.llamadosCount?.$gte === 5), "keeps minLlamados");

// --- sort ---
assert.deepEqual(procurementSort({}), { llamadosCount: -1 });
assert.deepEqual(procurementSort({ sortBy: "organism" }), { organismName: 1 });

// --- CSV/vCard ---
const csv = toCsv([c]);
const header = csv.split("\r\n")[0];
for (const col of ["Organismo", "Grupo", "Emails", "Teléfono", "Fax", "Llamados"]) {
  assert.ok(header.includes(col), `CSV header has ${col}`);
}
assert.ok(csv.includes("compras@imm.gub.uy; licitaciones@imm.gub.uy"), "CSV joins all emails");
const vcf = toVcard([c]);
assert.ok(/ORG:Intendencia de Montevideo/.test(vcf));
assert.ok(/TEL;TYPE=WORK,FAX:/.test(vcf), "vCard carries fax");
assert.equal((vcf.match(/EMAIL/g) || []).length, 2);

console.log("ok: procurement contacts");
