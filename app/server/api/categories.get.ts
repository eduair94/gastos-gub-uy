import { defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../utils/database'
import { SiceCatalogModel } from '../../../shared/models/sice_catalog'
import { SiceRubroModel } from '../../../shared/models/sice_rubro'
import { isRubroToken, parseToken } from '../../../shared/utils/rubro-tokens'
import { escapeRegex, toInt } from '../utils/query'

// SICE catalog taxonomy for the watch builder. Four modes:
//   ?resolve=tok1,tok2   → resolve saved tokens to display labels (for chips)
//   ?q=texto             → search rubro nodes + articles (name/synonyms)
//   ?parent=<token>      → children of a node (or articles under a subclase)
//   (no params)          → top-level familias
// Each item: { token, label, level, path?, articleCount?, breadcrumb? }.
// A `token` is what the watch stores (a bare article code, or an F/SF/C/SC node).

interface CatItem {
  token: string
  label: string
  level: 'familia' | 'subfamilia' | 'clase' | 'subclase' | 'articulo'
  path?: string
  articleCount?: number
  breadcrumb?: string[]
}

const LEAF_LIMIT = 40

function articleItem(a: { code: string, canonicalName: string, famiName?: string, subfName?: string, clasName?: string, subcName?: string, unitName?: string }): CatItem {
  return {
    token: a.code,
    label: a.canonicalName || a.code,
    level: 'articulo',
    breadcrumb: [a.famiName, a.subfName, a.clasName, a.subcName].filter(Boolean) as string[],
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  await connectToDatabase()

  // --- resolve tokens → labels (for rendering a saved watch's chips) ---
  if (typeof query.resolve === 'string' && query.resolve.trim()) {
    const tokens = query.resolve.split(',').map(t => t.trim()).filter(Boolean).slice(0, 400)
    const rubroTokens = tokens.filter(isRubroToken)
    const codes = tokens.filter(t => !isRubroToken(t))
    const [nodes, arts] = await Promise.all([
      rubroTokens.length ? SiceRubroModel.find({ token: { $in: rubroTokens } }).select('token name level path articleCount').lean() : [],
      codes.length ? SiceCatalogModel.find({ code: { $in: codes } }).select('code canonicalName famiName subfName clasName subcName').lean() : [],
    ])
    const byToken = new Map<string, CatItem>()
    for (const n of nodes) byToken.set(n.token, { token: n.token, label: n.name, level: n.level, path: n.path, articleCount: n.articleCount })
    for (const a of arts) byToken.set(a.code, articleItem(a))
    // Preserve request order; unknown tokens echo back as their own label.
    const data = tokens.map(t => byToken.get(t) ?? { token: t, label: t, level: (isRubroToken(t) ? parseToken(t).level : 'articulo') as CatItem['level'] })
    return { success: true, data }
  }

  // --- search across rubro nodes + articles ---
  if (typeof query.q === 'string' && query.q.trim()) {
    const q = query.q.trim().slice(0, 80)
    const rx = new RegExp(escapeRegex(q), 'i')
    const limit = toInt(query.limit, 30, 1, 60)
    const [nodes, arts] = await Promise.all([
      SiceRubroModel.find({ name: rx }).sort({ level: 1, articleCount: -1 }).limit(20).select('token name level path articleCount').lean(),
      SiceCatalogModel.find({ retired: false, $or: [{ canonicalName: rx }, { synonyms: rx }] })
        .limit(limit).select('code canonicalName famiName subfName clasName subcName').lean(),
    ])
    // Rubro nodes first (a supplier declaring "toda mi oferta" wants whole rubros),
    // then articles.
    const data: CatItem[] = [
      ...nodes.map(n => ({ token: n.token, label: n.name, level: n.level, path: n.path, articleCount: n.articleCount })),
      ...arts.map(articleItem),
    ]
    return { success: true, data }
  }

  // --- browse: children of a node, or articles under a subclase ---
  if (typeof query.parent === 'string' && query.parent.trim()) {
    const parent = query.parent.trim()
    const { level } = parseToken(parent)
    if (level === 'subclase') {
      const arts = await SiceCatalogModel.find({ rubroTokens: parent, retired: false })
        .sort({ canonicalName: 1 }).limit(LEAF_LIMIT).select('code canonicalName famiName subfName clasName subcName').lean()
      return { success: true, data: arts.map(articleItem) }
    }
    const children = await SiceRubroModel.find({ parentToken: parent }).sort({ name: 1 }).select('token name level path articleCount').lean()
    return { success: true, data: children.map(n => ({ token: n.token, label: n.name, level: n.level, path: n.path, articleCount: n.articleCount })) }
  }

  // --- default: top-level familias ---
  const familias = await SiceRubroModel.find({ level: 'familia', purchasable: true }).sort({ name: 1 }).select('token name level path articleCount').lean()
  return { success: true, data: familias.map(n => ({ token: n.token, label: n.name, level: n.level, path: n.path, articleCount: n.articleCount })) }
})
