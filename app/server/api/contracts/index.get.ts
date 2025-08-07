import { createError, defineEventHandler, getQuery } from 'h3'
import type { PipelineStage } from 'mongoose'
import { connectToDatabase } from '../../utils/database'
import { ReleaseModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const {
      page = 1,
      limit = 25,
      search,
      year,
      yearFrom,
      yearTo,
      amountFrom,
      amountTo,
      status,
      suppliers,
      buyers,
      procurementMethod,
      sortBy = 'date',
      sortOrder = 'desc',
    } = query

    // OPTIMIZATION STRATEGY:
    // 1. Early $match to filter documents before expensive operations
    // 2. Early $sort for indexed fields to leverage database indexes
    // 3. Simplified calculations since there's always one supplier and one buyer
    // 4. Reduced $project complexity by avoiding nested $map operations
    // 5. Direct field access instead of complex array operations

    // Build aggregation pipeline
    const pipeline: PipelineStage[] = []

    // Match stage for filtering
    const matchStage: Record<string, unknown> = {}

    // Optimized text search using MongoDB text index
    if (search) {
      matchStage.$text = {
        $search: search as string,
        $language: 'spanish',
        $caseSensitive: false,
        $diacriticSensitive: false,
      }
      // Remove the old regex-based search when using text search
    }

    // Year filtering
    if (year) {
      matchStage.sourceYear = Number(year)
    }
    else if (yearFrom || yearTo) {
      const yearFilter: Record<string, number> = {}
      if (yearFrom) yearFilter.$gte = Number(yearFrom)
      if (yearTo) yearFilter.$lte = Number(yearTo)
      matchStage.sourceYear = yearFilter
    }

    // Status filtering
    if (status && Array.isArray(status)) {
      matchStage['tender.status'] = { $in: status }
    }
    else if (status) {
      matchStage['tender.status'] = status
    }

    // Procurement method filtering
    if (procurementMethod && Array.isArray(procurementMethod)) {
      matchStage['tender.procurementMethod'] = { $in: procurementMethod }
    }
    else if (procurementMethod) {
      matchStage['tender.procurementMethod'] = procurementMethod
    }

    // Supplier filtering - simplified since there's one supplier per award
    if (suppliers) {
      const supplierList = Array.isArray(suppliers) ? suppliers : [suppliers]
      matchStage['awards.0.suppliers.0.name'] = { $in: supplierList.map(s => new RegExp(s as string, 'i')) }
    }

    // Buyer filtering - simplified since there's one buyer
    if (buyers) {
      const buyerList = Array.isArray(buyers) ? buyers : [buyers]
      matchStage['buyer.name'] = { $in: buyerList.map(b => new RegExp(b as string, 'i')) }
    }

    // Add match stage if there are filters
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage })
    }

    // Add text score projection if using text search
    if (search) {
      pipeline.push({
        $addFields: {
          textScore: { $meta: 'textScore' },
        },
      })
    }

    // Early sort for indexed fields (before expensive operations)
    const sortField = getSortField(sortBy as string)
    const sortDirection = sortOrder === 'desc' ? -1 : 1

    // Apply sort - prioritize text score for text searches
    if (search) {
      pipeline.push({
        $sort: {
          textScore: { $meta: 'textScore' },
          [sortField]: sortDirection,
        },
      })
    }
    else {
      pipeline.push({ $sort: { [sortField]: sortDirection } })
    }

    // Amount filtering (if needed, filter by award items)
    if (amountFrom || amountTo) {
      const amountFilter: Record<string, unknown> = {}
      if (amountFrom) amountFilter.$gte = Number(amountFrom)
      if (amountTo) amountFilter.$lte = Number(amountTo)

      pipeline.push({
        $match: {
          'awards.items.unit.value.amount': amountFilter,
        },
      })
    }

    // Pagination
    const skip = (Number(page) - 1) * Number(limit)
    pipeline.push({ $skip: skip })
    pipeline.push({ $limit: Number(limit) })

    // Execute aggregation - return raw release documents
    const contracts = await ReleaseModel.aggregate(pipeline)

    // For pagination info, we estimate based on current results
    // To avoid performance issues, we don't count total documents
    const hasMore = contracts.length === Number(limit)
    const estimatedTotalPages = hasMore ? Number(page) + 1 : Number(page)

    return {
      success: true,
      data: {
        contracts,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          hasMore,
          estimatedTotalPages,
          currentCount: contracts.length,
        },
        meta: {
          searchPerformed: !!search,
          filtersApplied: Object.keys(matchStage).length > 0,
          sortBy: sortBy as string,
          sortOrder: sortOrder as string,
        },
      },
    }
  }
  catch (error) {
    console.error('Error fetching contracts:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch contracts',
    })
  }
})

function getSortField(sortBy: string): string {
  const sortFields: Record<string, string> = {
    // All fields use the raw release structure
    date: 'date',
    year: 'sourceYear',
    status: 'tender.status',
    ocid: 'ocid',
    title: 'tender.title',
    buyer: 'buyer.name',
    supplier: 'awards.0.suppliers.0.name',
    amount: 'awards.0.items.0.unit.value.amount',
  }
  return sortFields[sortBy] || 'date'
}
