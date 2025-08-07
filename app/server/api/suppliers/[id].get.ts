import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../utils/database'
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

    return {
      success: true,
      data: {
        supplier: supplierPattern,
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
