/**
 * The SICE catalog classification-token namespace.
 *
 * A single string namespace shared by `open_calls.classificationSet`,
 * `watch.categories`, and `item_price_baseline`. An article "belongs to" its
 * bare code PLUS the four ancestor rubro tokens of its position in the tree
 * (FAMILIA > SUBFAMILIA > CLASE > SUBCLASE > ARTÍCULO). Matching is therefore a
 * plain set intersection: a watch subscribed to a rubro node `C2.6.5` matches
 * any call whose item carries an article under clase 2/6/5, and a watch that
 * stores the bare code `28267` behaves exactly as before this feature — which
 * is what keeps existing article-code watches working with zero migration.
 *
 *   | level      | token form                    | example      |
 *   |------------|-------------------------------|--------------|
 *   | artículo   | the bare code                 | 28267        |
 *   | subclase   | SC{fami}.{subf}.{clas}.{subc}  | SC2.6.5.3    |
 *   | clase      | C{fami}.{subf}.{clas}         | C2.6.5       |
 *   | subfamilia | SF{fami}.{subf}               | SF2.6        |
 *   | familia    | F{fami}                       | F2           |
 */

export type RubroLevel = "familia" | "subfamilia" | "clase" | "subclase";

/** All four ancestor tokens for an article at (fami, subf, clas, subc). Family → subclase order. */
export function articleAncestorTokens(
  fami: string | number,
  subf: string | number,
  clas: string | number,
  subc: string | number,
): string[] {
  const f = String(fami), sf = String(subf), c = String(clas), sc = String(subc);
  return [`F${f}`, `SF${f}.${sf}`, `C${f}.${sf}.${c}`, `SC${f}.${sf}.${c}.${sc}`];
}

/** Numeric dotted rubro path for an article, e.g. "2.6.5.3". */
export function rubroPath(
  fami: string | number,
  subf: string | number,
  clas: string | number,
  subc: string | number,
): string {
  return [fami, subf, clas, subc].map(String).join(".");
}

/** The token that names a rubro node at `level` given its numeric dotted `path`. */
export function nodeToken(level: RubroLevel, path: string): string {
  switch (level) {
    case "familia": return `F${path}`;
    case "subfamilia": return `SF${path}`;
    case "clase": return `C${path}`;
    case "subclase": return `SC${path}`;
  }
}

/** The parent node token of a rubro node, or undefined for a familia. */
export function parentToken(level: RubroLevel, path: string): string | undefined {
  const parts = path.split(".");
  switch (level) {
    case "familia": return undefined;
    case "subfamilia": return `F${parts[0]}`;
    case "clase": return `SF${parts[0]}.${parts[1]}`;
    case "subclase": return `C${parts[0]}.${parts[1]}.${parts[2]}`;
  }
}

const TOKEN_RE = /^(SC|SF|C|F)((\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?)$/;

/** True when `s` is a rubro-node token (not a bare article code). */
export function isRubroToken(s: string): boolean {
  return /^(SC|SF|C|F)\d/.test(s);
}

/** Parse a token to its level + numeric dotted path. Bare codes → { level: 'articulo' }. */
export function parseToken(token: string): { level: RubroLevel | "articulo"; path: string } {
  const m = TOKEN_RE.exec(token);
  if (!m) return { level: "articulo", path: token };
  const prefix = m[1];
  const path = m[2];
  const level: RubroLevel =
    prefix === "F" ? "familia" : prefix === "SF" ? "subfamilia" : prefix === "C" ? "clase" : "subclase";
  return { level, path };
}
