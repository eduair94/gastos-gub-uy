/**
 * Unit tests for the open-call projector + status derivation (src/jobs/open-calls/
 * project). Pure, builds the merged view from release-like fixtures. Run:
 *   npx tsx tests/unit/test-open-call-project.ts
 */
import { deriveStatus, projectOpenCall, releaseKind } from "../../src/jobs/open-calls/project";
import type { ReleaseLike } from "../../src/jobs/open-calls/project";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

const NOW = new Date("2026-07-18T00:00:00Z");
const FUTURE = new Date("2026-07-28T12:00:00Z");
const PAST = new Date("2026-07-01T12:00:00Z");

console.log("🧪 open-call project");
console.log("====================");

// --- releaseKind ---
ok("kind: llamado", releaseKind("llamado-1357112") === "llamado");
ok("kind: aclar_llamado", releaseKind("aclar_llamado-1350641-263") === "aclar_llamado");
ok("kind: ajuste_llamado", releaseKind("ajuste_llamado-47087") === "ajuste_llamado");
ok("kind: adjudicacion", releaseKind("adjudicacion-1331990") === "adjudicacion");
ok("kind: ajuste_adjudicacion", releaseKind("ajuste_adjudicacion-29699") === "ajuste_adjudicacion");

// --- deriveStatus ---
ok("status open (active, future)", deriveStatus({ latestTenderKind: "llamado", tenderStatus: "active", endDate: FUTURE, hasAward: false }, NOW) === "open");
ok("status closed (past deadline)", deriveStatus({ latestTenderKind: "llamado", tenderStatus: "active", endDate: PAST, hasAward: false }, NOW) === "closed");
ok("status cancelled", deriveStatus({ latestTenderKind: "llamado", tenderStatus: "cancelled", endDate: FUTURE, hasAward: false }, NOW) === "cancelled");
ok("status awarded overrides", deriveStatus({ latestTenderKind: "llamado", tenderStatus: "active", endDate: FUTURE, hasAward: true }, NOW) === "awarded");
ok("status amended (latest ajuste, still open)", deriveStatus({ latestTenderKind: "ajuste_llamado", tenderStatus: "active", endDate: FUTURE, hasAward: false }, NOW) === "amended");
ok("status clarification (latest aclar, still open)", deriveStatus({ latestTenderKind: "aclar_llamado", tenderStatus: "active", endDate: FUTURE, hasAward: false }, NOW) === "clarification");

// --- projectOpenCall: base llamado + aclaración merge ---
const base: ReleaseLike = {
  id: "llamado-1357112",
  ocid: "ocds-yfs5dr-1357112",
  date: new Date("2026-07-17T23:35:07Z"),
  tag: ["tender"],
  buyer: { id: "B7", name: "Intendencia de Canelones" },
  tender: {
    status: "active",
    procurementMethodDetails: "Compra Directa",
    title: "Equipos de aire acondicionado",
    tenderPeriod: { endDate: FUTURE },
    procuringEntity: { id: "PE7", name: "Dirección de Compras" },
    items: [
      { description: "EQUIPO DE AIRE ACONDICIONADO SPLIT", quantity: 2, classification: { id: "4472", description: "EQUIPO DE AIRE ACONDICIONADO SPLIT" } },
      { description: "Instalación", quantity: 1, classification: { id: "4472", description: "EQUIPO DE AIRE ACONDICIONADO SPLIT" } },
    ],
    documents: [{ url: "https://x/pliego.pdf", format: "application/pdf", documentType: "biddingDocuments" }],
  },
};
const aclar: ReleaseLike = {
  id: "aclar_llamado-1357112-1",
  ocid: "ocds-yfs5dr-1357112",
  date: new Date("2026-07-18T10:00:00Z"),
  tag: ["tenderUpdate"],
  tender: {
    status: "active",
    procurementMethodDetails: "Compra Directa",
    title: "Equipos de aire acondicionado",
    tenderPeriod: { endDate: FUTURE },
    items: base.tender!.items,
    documents: [{ url: "https://x/aclaracion.pdf", format: "application/pdf" }],
  },
};

const proj = projectOpenCall([base, aclar], NOW);
ok("projects a non-null view", proj !== null);
ok("compraId from ocid", proj?.compraId === "1357112");
ok("classificationSet deduped", JSON.stringify(proj?.classificationSet) === JSON.stringify(["4472"]));
ok("documents unioned across releases", (proj?.documents.length ?? 0) === 2);
ok("latest tender release is authoritative", proj?.latestReleaseId === "aclar_llamado-1357112-1");
ok("status is clarification (latest is aclar)", proj?.status === "clarification");
ok("searchText normalized + includes item text", (proj?.searchText ?? "").includes("aire acondicionado split"));
ok("sourceReleaseIds carries both", (proj?.sourceReleaseIds.length ?? 0) === 2);

// --- sparse aclaración must NOT wipe the base llamado's deadline/items ---
const sparseAclar: ReleaseLike = {
  id: "aclar_llamado-1357112-2",
  ocid: "ocds-yfs5dr-1357112",
  date: new Date("2026-07-18T12:00:00Z"),
  tag: ["tenderUpdate"],
  // Latest release, but its tender object is sparse (no period, no items, no title).
  tender: { status: "active", documents: [{ url: "https://x/aclaracion2.pdf", format: "application/pdf" }] },
};
const projSparse = projectOpenCall([base, sparseAclar], NOW);
ok("coalesce: deadline falls back to base when latest aclar is sparse", projSparse?.tenderPeriod?.endDate?.getTime() === FUTURE.getTime());
ok("coalesce: items fall back to base", (projSparse?.items.length ?? 0) === 2);
ok("coalesce: classificationSet still populated", JSON.stringify(projSparse?.classificationSet) === JSON.stringify(["4472"]));
ok("coalesce: title falls back to base", projSparse?.title === "Equipos de aire acondicionado");
ok("coalesce: still clarification (latest is aclar, deadline future)", projSparse?.status === "clarification");
ok("coalesce: latest release id is the sparse aclar", projSparse?.latestReleaseId === "aclar_llamado-1357112-2");

// --- awardRef when an adjudicacion is present ---
const award: ReleaseLike = { id: "adjudicacion-1357112", ocid: "ocds-yfs5dr-1357112", date: new Date("2026-07-30T00:00:00Z"), tag: ["award"], awards: [{ id: "a1", date: new Date("2026-07-30T00:00:00Z") }] };
const projAwarded = projectOpenCall([base, award], NOW);
ok("awardRef set when adjudicacion present", !!projAwarded?.awardRef && projAwarded.awardRef.releaseId === "adjudicacion-1357112");
ok("status awarded when adjudicacion present", projAwarded?.status === "awarded");

// --- no tender release -> null ---
ok("group with no tender release returns null", projectOpenCall([award], NOW) === null);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
