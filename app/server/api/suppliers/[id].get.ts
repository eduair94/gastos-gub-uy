import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { fetchDei } from '../../utils/dei'
import { fetchRupe } from '../../utils/rupe'
import { ReleaseModel, SupplierPatternModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const supplierId = getRouterParam(event, 'id')
    if (!supplierId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Supplier ID is required',
      })
    }

    // Decode the supplier ID
    const decodedSupplierId = decodeURIComponent(supplierId)

    // Get supplier pattern data
    const supplierPattern = await SupplierPatternModel.findOne({
      supplierId: decodedSupplierId,
    }).lean()

    if (!supplierPattern) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Supplier not found',
      })
    }

    // Get recent contracts for this supplier
    const recentContracts = await ReleaseModel.find({
      'awards.suppliers.id': decodedSupplierId,
    })
      .sort({ date: -1 })
      .limit(10)
      .select({
        'id': 1,
        'ocid': 1,
        'date': 1,
        'sourceYear': 1,
        'tender.title': 1,
        'tender.status': 1,
        'tender.procurementMethod': 1,
        'buyer.name': 1,
        'awards.id': 1,
        'awards.title': 1,
        'awards.status': 1,
        'awards.date': 1,
        'awards.value': 1,
        'awards.suppliers': 1,
        'awards.items': 1,
      })
      .lean()

    // Filter awards for this specific supplier
    const contractsWithSupplierAwards = recentContracts.map((contract) => {
      const supplierAwards = contract.awards?.filter(award =>
        award.suppliers?.some(supplier => supplier.id === decodedSupplierId),
      ) || []

      return {
        ...contract,
        awards: supplierAwards,
      }
    }).filter(contract => contract.awards.length > 0)

    // Cross-reference the industrial registry (DEI) by RUT. Null for the ~94%
    // of suppliers that aren't registered industrial firms — expected, not missing.
    // Cross-reference the state-provider registry (RUPE) by RUT — 91.7% coverage,
    // so this fills the location gap DEI leaves. Both queried; the UI shows the
    // RUPE card only when DEI isn't present (DEI is the richer record).
    const [dei, rupe] = await Promise.all([
      fetchDei([decodedSupplierId]).then(m => m.get(decodedSupplierId) ?? null),
      fetchRupe([decodedSupplierId]).then(m => m.get(decodedSupplierId) ?? null),
    ])

    return {
      success: true,
      data: {
        supplier: supplierPattern,
        dei,
        rupe,
        recentContracts: contractsWithSupplierAwards,
        meta: {
          totalContractsFound: contractsWithSupplierAwards.length,
          dataLastUpdated: (supplierPattern as { lastUpdated: Date }).lastUpdated,
        },
      },
    }
  }
  catch (error) {
    console.error('Error fetching supplier details:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch supplier details',
    })
  }
})
