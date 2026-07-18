#!/usr/bin/env tsx

/**
 * Import the official SICE/CUBS article catalog (ACCE open data) into the
 * `sice_catalog` (per-article) and `sice_rubro` (tree-node) collections.
 *
 * SOURCE. `imp_catalogo.tgz` — a ~7.4 MB gzip'd tar of ANSI-SQL dumps, published
 * on catalogodatos.gub.uy (CKAN dataset `acce-catalogo-acce`) and regenerated
 * ~daily. The article code (ART_SERV_OBRA.COD) is the SAME string as OCDS
 * `classification.id` in `releases`/`open_calls`, so this is a pure enrichment
 * keyed by a code we already ingest and index.
 *
 * FRESHNESS. CKAN's `metadata_modified` is frozen (2020) and must NOT be trusted;
 * we gate on the TGZ's own ETag/Last-Modified against a watermark in
 * `sice_import_state`. `--force` re-imports regardless.
 *
 * PARSING. Latin-1 encoding; INSERT statements (not CSV). See ./sice/parse.ts.
 *
 * SWAP. Compute-then-swap by `dataVersion`, mirroring refresh-product-analytics.
 */

import axios from "axios";
import { connectToDatabase, mongoose } from "../../shared/connection/database";
import { SiceCatalogModel, SiceRubroModel } from "../../shared/models";
import type { ISiceCatalog, ISiceRubro } from "../../shared/models";
import { articleAncestorTokens, nodeToken, parentToken, rubroPath } from "../../shared/utils/rubro-tokens";
import type { RubroLevel } from "../../shared/utils/rubro-tokens";
import { Logger } from "../services/logger-service";
import { extractTgz } from "./sice/untar";
import {
  parseArticulos, parseClases, parseFamilias, parseSinonimos, parseSubclases, parseSubflias, parseUnidadesMed,
} from "./sice/parse";

const CKAN_PACKAGE = "https://catalogodatos.gub.uy/api/3/action/package_show?id=acce-catalogo-acce";
const FALLBACK_TGZ = "http://www.comprasestatales.gub.uy/datos_abiertos/imp_catalogo.tgz";
const UA = "gastos-gub catalog importer (+https://github.com/eduair94)";
const BULK_BATCH = 2000;
const STATE_COLLECTION = "sice_import_state";

interface RemoteMeta { url: string; etag?: string; lastModified?: string }

export class SiceCatalogImporter {
  private logger = new Logger();
  private dataVersion = `v${Date.now()}`;

  /** Resolve the TGZ resource URL from CKAN, falling back to the well-known constant. */
  private async resolveUrl(): Promise<string> {
    try {
      const { data } = await axios.get(CKAN_PACKAGE, { timeout: 30000, headers: { "User-Agent": UA } });
      const resources: any[] = data?.result?.resources ?? [];
      const tgz = resources.find((r) => /\.tgz($|\?)/i.test(r?.url ?? "") || /tgz/i.test(r?.format ?? ""));
      if (tgz?.url) return tgz.url as string;
    } catch (e) {
      this.logger.warn(`CKAN discovery failed, using fallback URL: ${(e as Error).message}`);
    }
    return FALLBACK_TGZ;
  }

  private async head(url: string): Promise<RemoteMeta> {
    try {
      const res = await axios.head(url, { timeout: 30000, headers: { "User-Agent": UA } });
      return { url, etag: res.headers["etag"], lastModified: res.headers["last-modified"] };
    } catch {
      return { url };
    }
  }

  private async loadWatermark(): Promise<any> {
    return mongoose.connection.db!.collection(STATE_COLLECTION).findOne({ _id: "catalog" as any });
  }

  private async saveWatermark(meta: RemoteMeta, counts: Record<string, number>): Promise<void> {
    await mongoose.connection.db!.collection(STATE_COLLECTION).updateOne(
      { _id: "catalog" as any },
      { $set: { etag: meta.etag ?? null, lastModified: meta.lastModified ?? null, url: meta.url, importedAt: new Date(), dataVersion: this.dataVersion, counts } },
      { upsert: true },
    );
  }

  private async download(url: string): Promise<Buffer> {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 120000, headers: { "User-Agent": UA }, maxContentLength: 100 * 1024 * 1024 });
    return Buffer.from(res.data);
  }

  /** Parse the extracted `.sql` files (Latin-1) into the two collections' docs. */
  buildDocs(files: Map<string, Buffer>): { catalog: ISiceCatalog[]; rubros: ISiceRubro[] } {
    const read = (name: string): string => {
      const buf = files.get(name);
      if (!buf) throw new Error(`missing ${name} in catalog archive`);
      return buf.toString("latin1");
    };

    const familias = parseFamilias(read("FAMILIA.sql"));
    const subflias = parseSubflias(read("SUBFAMILIA.sql"));
    const clases = parseClases(read("CLASE.sql"));
    const subclases = parseSubclases(read("SUBCLASE.sql"));
    const unidades = parseUnidadesMed(read("UNIDAD_MED.sql"));
    const sinonimos = parseSinonimos(read("SINONIMO.sql"));
    const articulos = parseArticulos(read("ART_SERV_OBRA.sql"));

    // Lookup maps.
    const famName = new Map(familias.map((f) => [f.cod, f.descripcion]));
    const famPurchasable = new Map(familias.map((f) => [f.cod, f.comprable === "S"]));
    const subfName = new Map(subflias.map((r) => [`${r.fami_cod}.${r.cod}`, r.descripcion]));
    const clasName = new Map(clases.map((r) => [`${r.fami_cod}.${r.subf_cod}.${r.cod}`, r.descripcion]));
    const subcName = new Map(subclases.map((r) => [`${r.fami_cod}.${r.subf_cod}.${r.clas_cod}.${r.cod}`, r.descripcion]));
    const unitName = new Map(unidades.map((u) => [u.cod, u.descripcion]));
    const synByArt = new Map<string, string[]>();
    for (const sy of sinonimos) {
      const arr = synByArt.get(sy.arse_cod) ?? [];
      arr.push(sy.descripcion);
      synByArt.set(sy.arse_cod, arr);
    }

    // Article count per rubro node token (non-retired articles only).
    const articleCount = new Map<string, number>();
    const bump = (token: string) => articleCount.set(token, (articleCount.get(token) ?? 0) + 1);

    const catalog: ISiceCatalog[] = articulos.map((a) => {
      const tokens = articleAncestorTokens(a.fami_cod, a.subf_cod, a.clas_cod, a.subc_cod);
      const retired = !!a.fecha_baja;
      if (!retired) for (const t of tokens) bump(t);
      return {
        code: a.cod,
        canonicalName: a.descripcion,
        isService: a.ind_art_serv === "S",
        famiCode: a.fami_cod,
        famiName: famName.get(a.fami_cod) ?? "",
        subfCode: a.subf_cod,
        subfName: subfName.get(`${a.fami_cod}.${a.subf_cod}`) ?? "",
        clasCode: a.clas_cod,
        clasName: clasName.get(`${a.fami_cod}.${a.subf_cod}.${a.clas_cod}`) ?? "",
        subcCode: a.subc_cod,
        subcName: subcName.get(`${a.fami_cod}.${a.subf_cod}.${a.clas_cod}.${a.subc_cod}`) ?? "",
        rubroPath: rubroPath(a.fami_cod, a.subf_cod, a.clas_cod, a.subc_cod),
        rubroTokens: tokens,
        unitCode: a.unme_cod ?? undefined,
        unitName: a.unme_cod ? (unitName.get(a.unme_cod) ?? undefined) : undefined,
        odg: a.odg ?? undefined,
        synonyms: synByArt.get(a.cod) ?? [],
        retired,
        dataVersion: this.dataVersion,
      };
    });

    // Rubro tree nodes.
    const rubros: ISiceRubro[] = [];
    const pushNode = (level: RubroLevel, path: string, name: string, purchasable: boolean) => {
      const token = nodeToken(level, path);
      rubros.push({
        token, level, name, path,
        parentToken: parentToken(level, path),
        articleCount: articleCount.get(token) ?? 0,
        purchasable,
        dataVersion: this.dataVersion,
      });
    };
    for (const f of familias) pushNode("familia", f.cod, f.descripcion, f.comprable === "S");
    for (const r of subflias) pushNode("subfamilia", `${r.fami_cod}.${r.cod}`, r.descripcion, famPurchasable.get(r.fami_cod) ?? true);
    for (const r of clases) pushNode("clase", `${r.fami_cod}.${r.subf_cod}.${r.cod}`, r.descripcion, famPurchasable.get(r.fami_cod) ?? true);
    for (const r of subclases) pushNode("subclase", `${r.fami_cod}.${r.subf_cod}.${r.clas_cod}.${r.cod}`, r.descripcion, famPurchasable.get(r.fami_cod) ?? true);

    return { catalog, rubros };
  }

  private async swap<T extends { code?: string; token?: string }>(model: any, docs: T[], key: "code" | "token"): Promise<void> {
    for (let i = 0; i < docs.length; i += BULK_BATCH) {
      const ops = docs.slice(i, i + BULK_BATCH).map((doc) => ({
        replaceOne: { filter: { [key]: (doc as any)[key] }, replacement: doc, upsert: true },
      }));
      await model.bulkWrite(ops, { ordered: false });
    }
    const swept = await model.deleteMany({ dataVersion: { $ne: this.dataVersion } });
    this.logger.info(`  swept ${swept.deletedCount} stale docs from ${model.collection.name}`);
  }

  async run(force = false): Promise<void> {
    const started = Date.now();
    await connectToDatabase();

    const url = await this.resolveUrl();
    const meta = await this.head(url);
    const prev = await this.loadWatermark();
    const unchanged = prev && ((meta.etag && prev.etag === meta.etag) || (meta.lastModified && prev.lastModified === meta.lastModified));
    if (unchanged && !force) {
      this.logger.info(`Catalog unchanged (etag ${meta.etag ?? "?"} / ${meta.lastModified ?? "?"}); skipping. Use --force to re-import.`);
      return;
    }

    this.logger.info(`Downloading catalog: ${url}`);
    const tgz = await this.download(url);
    this.logger.info(`  downloaded ${(tgz.length / 1024 / 1024).toFixed(1)} MB; extracting`);
    const files = extractTgz(tgz);

    const { catalog, rubros } = this.buildDocs(files);
    this.logger.info(`  parsed ${catalog.length} articles, ${rubros.length} rubro nodes (version ${this.dataVersion})`);

    await this.swap(SiceCatalogModel, catalog, "code");
    await this.swap(SiceRubroModel, rubros, "token");

    const counts = { articles: catalog.length, rubros: rubros.length };
    await this.saveWatermark(meta, counts);
    this.logger.info(`Catalog import complete: ${catalog.length} articles in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
}

if (require.main === module) {
  const force = process.argv.includes("--force");
  new SiceCatalogImporter()
    .run(force)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ SICE catalog import failed:", err);
      process.exit(1);
    });
}
