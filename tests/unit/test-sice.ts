/**
 * Unit tests for the SICE catalog parser + rubro-token namespace. No DB. Run:
 *   npx tsx tests/unit/test-sice.ts
 */
import {
  parseInserts, parseFamilias, parseClases, parseUnidadesMed, parseSinonimos, parseArticulos,
} from "../../src/jobs/sice/parse";
import {
  articleAncestorTokens, rubroPath, nodeToken, parentToken, isRubroToken, parseToken,
} from "../../shared/utils/rubro-tokens";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}
function eq(name: string, a: unknown, b: unknown): void {
  ok(`${name} (${JSON.stringify(a)} === ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));
}

console.log("🧪 sice parser");
console.log("==============");

// FAMILIAS — real dump lines
const FAM = `insert into familias(cod, descripcion, comprable) values (10,'BIENES DE TECNOLOGIAS DE LA INFORMACION Y LA COMUNICACION', 'S');
insert into familias(cod, descripcion, comprable) values (2,'MATERIALES Y SUMINISTROS', 'S');`;
const fams = parseFamilias(FAM);
eq("parses 2 familias", fams.length, 2);
eq("familia cod", fams[0].cod, "10");
eq("familia descripcion", fams[1].descripcion, "MATERIALES Y SUMINISTROS");
eq("familia comprable", fams[0].comprable, "S");

// CLASES — 4-col positional-by-name
const CLA = `insert into clases(fami_cod, subf_cod, cod, descripcion) values (4,2,5,'FOTOCOPIADORAS');`;
const clas = parseClases(CLA);
eq("clase fields", [clas[0].fami_cod, clas[0].subf_cod, clas[0].cod, clas[0].descripcion], ["4", "2", "5", "FOTOCOPIADORAS"]);

// UNIDADES_MED — NULL literal
const UM = `insert into unidades_med(cod, descripcion, tipo) values (175,'CARTUCHO',NULL);`;
const ums = parseUnidadesMed(UM);
eq("unidad_med cod+descr", [ums[0].cod, ums[0].descripcion], ["175", "CARTUCHO"]);
eq("NULL parsed as null", parseInserts(UM, "unidades_med")[0].tipo, null);

// SINONIMOS — escaped '' inside a string ("2''" -> 2')
const SIN = `insert into sinonimos(arse_cod, descripcion) values (999,'TABLERO 2''X4''');`;
const sins = parseSinonimos(SIN);
eq("escaped quote unescaped", sins[0].descripcion, "TABLERO 2'X4'");

// ART_SERV_OBRA — full 20-col row incl. empty '' fields and odg
const ART = `insert into art_serv_obra(cod, descripcion, fami_cod, subf_cod, clas_cod, subc_cod, var_cod, unme_cod, imp_cod, ind_art_serv, ind_fraccion, ind_gestionable, ind_agrupable, stockeable, stock_contable, ind_tipo_detalle, odg, esp_tecnicas, comprable, var_unme_cod) values (13882,'RUEDA CORONA DENTADA',2,12,1,16,547,22,1,'A','N','N','N','N','','R',198000,'','S',1);`;
const arts = parseArticulos(ART);
eq("art cod", arts[0].cod, "13882");
eq("art descripcion", arts[0].descripcion, "RUEDA CORONA DENTADA");
eq("art rubro codes", [arts[0].fami_cod, arts[0].subf_cod, arts[0].clas_cod, arts[0].subc_cod], ["2", "12", "1", "16"]);
eq("art unit + service + odg + comprable", [arts[0].unme_cod, arts[0].ind_art_serv, arts[0].odg, arts[0].comprable], ["22", "A", "198000", "S"]);

// date '...' literal
const DT = `insert into foo(a, b) values (1, date '2020-10-01');`;
eq("date literal parsed", parseInserts(DT, "foo")[0].b, "2020-10-01");

// string with an internal comma must not split the tuple
const COM = `insert into foo(a, b) values (1,'X, Y, Z');`;
eq("comma inside string kept", parseInserts(COM, "foo")[0].b, "X, Y, Z");

console.log("\n🧪 rubro tokens");
console.log("===============");

eq("article ancestor tokens", articleAncestorTokens(2, 6, 5, 3), ["F2", "SF2.6", "C2.6.5", "SC2.6.5.3"]);
eq("rubro path", rubroPath(2, 6, 5, 3), "2.6.5.3");
eq("nodeToken subclase", nodeToken("subclase", "2.6.5.3"), "SC2.6.5.3");
eq("nodeToken familia", nodeToken("familia", "2"), "F2");
eq("parentToken of subclase is clase", parentToken("subclase", "2.6.5.3"), "C2.6.5");
eq("parentToken of clase is subfamilia", parentToken("clase", "2.6.5"), "SF2.6");
eq("parentToken of familia is undefined", parentToken("familia", "2"), undefined);
ok("bare code is not a rubro token", !isRubroToken("28267"));
ok("SC token is a rubro token", isRubroToken("SC2.6.5.3"));
eq("parseToken of SC", parseToken("SC2.6.5.3"), { level: "subclase", path: "2.6.5.3" });
eq("parseToken of C", parseToken("C2.6.5"), { level: "clase", path: "2.6.5" });
eq("parseToken of bare code", parseToken("28267"), { level: "articulo", path: "28267" });

console.log("\n🧪 open-call catalog enrichment");
console.log("==============================");
import { enrichProjectionWithCatalog } from "../../src/jobs/open-calls/project";
import type { OpenCallProjection } from "../../src/jobs/open-calls/project";

function proj(items: OpenCallProjection["items"], classificationSet: string[]): OpenCallProjection {
  return {
    compraId: "1", ocid: "o", latestReleaseId: "l", sourceReleaseIds: [],
    title: "Compra de pintura", buyer: {}, procuringEntity: {},
    status: "open", items, classificationSet, searchText: "compra de pintura", documents: [],
  } as OpenCallProjection;
}

const lookup = (code: string) => code === "28267"
  ? { rubroTokens: ["F2", "SF2.6", "C2.6.5", "SC2.6.5.3"], canonicalName: "PINTURA EPOXI", synonyms: ["ESMALTE EPOXICO"], unitName: "L" }
  : undefined;

const p = enrichProjectionWithCatalog(
  proj([{ classificationId: "28267", description: "pintura" }], ["28267"]),
  lookup,
);
ok("classificationSet gains the 4 ancestor tokens", ["F2", "SF2.6", "C2.6.5", "SC2.6.5.3"].every((t) => p.classificationSet.includes(t)));
ok("classificationSet keeps the bare code", p.classificationSet.includes("28267"));
ok("item label replaced by canonical name", p.items[0].classificationLabel === "PINTURA EPOXI");
ok("missing unit filled from catalog", p.items[0].unit?.name === "L");
ok("searchText folds canonical name", p.searchText.includes("pintura epoxi"));
ok("searchText folds synonyms", p.searchText.includes("esmalte epoxico"));

const p2 = enrichProjectionWithCatalog(
  proj([{ classificationId: "999999", description: "x" }], ["999999"]),
  lookup,
);
ok("uncataloged code falls through unchanged", p2.classificationSet.length === 1 && p2.classificationSet[0] === "999999");

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
