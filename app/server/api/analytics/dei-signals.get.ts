import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { deiRut } from '../../utils/dei'
import { DeiCompanyModel, SupplierPatternModel } from '../../utils/models'

/**
 * Transparency signal from the DEI cross-reference: registered **micro / small**
 * industrial companies that are among the largest state suppliers by total —
 * a size-vs-spend mismatch worth a second look. Plus the headline count of how
 * many registered industrial firms are state suppliers.
 *
 * Deliberately NOT a spend-share headline: the site-wide grand total is
 * distorted by a handful of corrupt source quantities (see DESIGN.md), so a
 * "% of spend" figure would rest on a bad denominator. Per-supplier totals are
 * shown individually through <MoneyAmount>, exactly as the profile page does.
 */

interface Signal {
  supplierId: string
  name: string
  totalValue: number
  tamano: string
  actividad: string
  departamento: string
}

let cache: { at: number, payload: unknown } | null = null
const TTL = 30 * 60 * 1000

function candidateIds(ruts: string[]): string[] {
  const out: string[] = []
  for (const r of ruts) out.push(`R/${r}`, `R${r}`, r)
  return out
}

export default defineEventHandler(async () => {
  try {
    if (cache && Date.now() - cache.at < TTL) {
      return { success: true, data: cache.payload }
    }

    await connectToDatabase()

    // Count of all registered industrial firms that are state suppliers.
    const allDei = await DeiCompanyModel.find({}, { rut: 1, _id: 0 }).lean()
    const allRuts = allDei.map(d => (d as { rut: string }).rut)
    const matchedSuppliers = await SupplierPatternModel.countDocuments({
      supplierId: { $in: candidateIds(allRuts) },
    })

    // Micro / small registered firms, indexed by RUT.
    const small = await DeiCompanyModel.find(
      { tamano: { $regex: /micro|pequeñ/i } },
      { rut: 1, tamano: 1, ciiuPrincipalDesc: 1, departamento: 1, _id: 0 },
    ).lean()
    const smallByRut = new Map<string, Record<string, unknown>>()
    for (const d of small) smallByRut.set((d as { rut: string }).rut, d as Record<string, unknown>)

    // The biggest state suppliers among those small firms.
    const rows = await SupplierPatternModel.find(
      { supplierId: { $in: candidateIds([...smallByRut.keys()]) } },
      { supplierId: 1, name: 1, totalValue: 1, _id: 0 },
    )
      .sort({ totalValue: -1 })
      .limit(30)
      .lean()

    const microBigContracts: Signal[] = []
    for (const s of rows as Array<{ supplierId: string, name: string, totalValue: number }>) {
      const d = smallByRut.get(deiRut(s.supplierId))
      if (!d) continue
      microBigContracts.push({
        supplierId: s.supplierId,
        name: s.name,
        totalValue: Number(s.totalValue) || 0,
        tamano: (d.tamano as string) ?? '',
        actividad: (d.ciiuPrincipalDesc as string) ?? '',
        departamento: (d.departamento as string) ?? '',
      })
    }

    const payload = {
      summary: {
        deiTotal: allRuts.length,
        matchedSuppliers,
      },
      microBigContracts,
      cachedAt: new Date().toISOString(),
    }
    cache = { at: Date.now(), payload }
    return { success: true, data: payload }
  }
  catch (error) {
    console.error('Error building DEI signals:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to build DEI signals' })
  }
})
