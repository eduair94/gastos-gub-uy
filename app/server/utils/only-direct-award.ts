import { SupplierPatternModel } from './models'

export interface OnlyDirectAwardInfo {
  onlyDirectAward: boolean
  directAwardCount: number
}

/** Attach the release-history signal to page rows with one supplier-pattern query. */
export async function attachOnlyDirectAward<T>(
  items: T[],
  getId: (item: T) => string,
): Promise<Array<T & OnlyDirectAwardInfo>> {
  const supplierIds = [...new Set(items.map(getId).filter(Boolean))]
  if (!supplierIds.length) {
    return items.map(item => ({ ...item, onlyDirectAward: false, directAwardCount: 0 }))
  }

  const rows = await SupplierPatternModel.find(
    { supplierId: { $in: supplierIds } },
    { supplierId: 1, onlyDirectAward: 1, directAwardCount: 1, _id: 0 },
  ).lean()
  const byId = new Map(rows.map(row => [(row as { supplierId: string }).supplierId, row]))

  return items.map((item) => {
    const row = byId.get(getId(item)) as { onlyDirectAward?: boolean, directAwardCount?: number } | undefined
    return {
      ...item,
      onlyDirectAward: row?.onlyDirectAward ?? false,
      directAwardCount: row?.directAwardCount ?? 0,
    }
  })
}
