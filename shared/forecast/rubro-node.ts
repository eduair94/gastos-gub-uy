// Pure resolution of a leaf article's catalog fields → a mid-level rubro node.
// sice_catalog.rubroTokens is ordered [familia, subfamilia, clase, subclase]:
//   index 0 = "F2", 1 = "SF2.6", 2 = "C2.6.5", 3 = "SC2.6.5.3".
export interface CatalogNodeFields {
  code: string;
  rubroTokens?: string[] | undefined;
  subfName?: string | undefined;
  clasName?: string | undefined;
}

export interface RubroNode {
  nodeId: string;
  label: string;
  level: number; // 3 = clase, 2 = subfamilia, 1 = familia
}

/** Pick the node at `level` (3=clase preferred), falling back up when absent. */
export function pickRubroNode(cat: CatalogNodeFields | undefined, level: 2 | 3): RubroNode | null {
  const t = cat?.rubroTokens;
  if (!t?.length) return null;
  if (level === 3 && t[2]) return { nodeId: t[2], label: cat!.clasName || t[2], level: 3 };
  if (t[1]) return { nodeId: t[1], label: cat!.subfName || t[1], level: 2 };
  if (t[0]) return { nodeId: t[0], label: t[0], level: 1 };
  return null;
}

/** Leaf code + every rubro ancestor token — the watch-match key set for a leaf. */
export function ancestorsForLeaf(cat: CatalogNodeFields | undefined): string[] {
  if (!cat) return [];
  return [cat.code, ...(cat.rubroTokens ?? [])].filter(Boolean);
}
