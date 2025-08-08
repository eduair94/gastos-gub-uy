import { createError, defineEventHandler, getQuery } from 'h3'
import type { PipelineStage } from 'mongoose'
import { ReleaseModel } from '../../../../shared/models/release'
import { connectToDatabase, mongoose } from '../../utils/database'

// Request tracking for monitoring and preventing abuse
const requestTracker = new Map<string, { count: number, lastReset: number }>()

function trackRequest(ip: string): boolean {
  const now = Date.now()
  const key = ip
  const tracker = requestTracker.get(key) || { count: 0, lastReset: now }

  // Reset counter every minute
  if (now - tracker.lastReset > 60000) {
    tracker.count = 0
    tracker.lastReset = now
  }

  tracker.count++
  requestTracker.set(key, tracker)

  // Allow max 30 requests per minute per IP
  return tracker.count <= 30
}

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  // Basic rate limiting per IP
  const clientIp = event.node.req.socket.remoteAddress || 'unknown'
  if (!trackRequest(clientIp)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many requests - please slow down',
    })
  }

  try {
    // Ensure database connection is ready
    await connectToDatabase()

    // Additional check to ensure connection is really ready
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database connection not ready')
    }

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

    // Validate and limit page size to prevent abuse and MongoDB overload
    const validatedLimit = Math.min(Math.max(Number(limit), 1), 50) // Reduced max limit from 100 to 50
    const validatedPage = Math.max(Number(page), 1)

    // Prevent deep pagination that can overload MongoDB
    const maxPage = 100 // Limit to first 5000 results (100 pages × 50 items)
    if (validatedPage > maxPage) {
      throw createError({
        statusCode: 400,
        statusMessage: `Page number too high. Maximum allowed page is ${maxPage}`,
      })
    }

    // OPTIMIZATION STRATEGY:
    // 1. Text search MUST be first stage if present (MongoDB requirement)
    // 2. Use compound indexes for filtering + sorting after text search
    // 3. Minimize pipeline stages and use efficient $match early
    // 4. Set maxTimeMS to prevent hanging queries
    // 5. Use allowDiskUse for large datasets
    // 6. Optimize with proper indexes and hints

    // Build aggregation pipeline with optimized order
    const pipeline: PipelineStage[] = []

    // Step 1: Text search using hybrid approach for better performance
    if (search) {
      const searchQuery = (search as string).trim()

      // Use first word for text index search to reduce dataset quickly
      const firstWord = searchQuery.split(' ')[0]

      pipeline.push({
        $match: {
          $text: {
            $search: firstWord,
            $caseSensitive: false,
            $diacriticSensitive: false,
          },
        },
      })

      // Then filter by regex that contains the full search phrase
      const fullSearchRegex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

      pipeline.push({
        $match: {
          $or: [
            { 'tender.title': fullSearchRegex },
            { 'tender.description': fullSearchRegex },
            { 'awards.items.description': fullSearchRegex },
            { 'awards.items.title': fullSearchRegex },
            { 'awards.items.classification.description': fullSearchRegex },
            { 'buyer.name': fullSearchRegex },
            { 'awards.suppliers.name': fullSearchRegex },
          ],
        },
      })

      // Add text score projection for sorting
      pipeline.push({
        $addFields: {
          textScore: { $meta: 'textScore' },
        },
      })
    }

    // Step 2: Other filtering stages (most selective first)
    const matchStage: Record<string, unknown> = {}

    // Year filtering (indexed) - most selective first
    if (year) {
      matchStage.sourceYear = Number(year)
    }
    else if (yearFrom || yearTo) {
      const yearFilter: Record<string, number> = {}
      if (yearFrom) yearFilter.$gte = Number(yearFrom)
      if (yearTo) yearFilter.$lte = Number(yearTo)
      matchStage.sourceYear = yearFilter
    }

    // Status filtering (indexed)
    if (status && Array.isArray(status)) {
      matchStage['tender.status'] = { $in: status }
    }
    else if (status) {
      matchStage['tender.status'] = status
    }

    // Procurement method filtering (indexed)
    if (procurementMethod && Array.isArray(procurementMethod)) {
      matchStage['tender.procurementMethod'] = { $in: procurementMethod }
    }
    else if (procurementMethod) {
      matchStage['tender.procurementMethod'] = procurementMethod
    }

    // Buyer filtering (indexed)
    if (buyers) {
      const buyerList = Array.isArray(buyers) ? buyers : [buyers]
      matchStage['buyer.name'] = { $in: buyerList.map(b => new RegExp(b as string, 'i')) }
    }

    // Supplier filtering (indexed)
    if (suppliers) {
      const supplierList = Array.isArray(suppliers) ? suppliers : [suppliers]
      matchStage['awards.suppliers.name'] = { $in: supplierList.map(s => new RegExp(s as string, 'i')) }
    }

    // Amount filtering (using calculated primary amount for better performance)
    if (amountFrom || amountTo) {
      const amountFilter: Record<string, unknown> = {}
      if (amountFrom) amountFilter.$gte = Number(amountFrom)
      if (amountTo) amountFilter.$lte = Number(amountTo)
      matchStage['amount.primaryAmount'] = amountFilter
    }

    // Add other filters stage if there are any
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage })
    }

    // Step 3: Sort (use compound indexes, prioritize text score for text searches)
    const sortField = getSortField(sortBy as string)
    const sortDirection = sortOrder === 'desc' ? -1 : 1

    if (search) {
      // For text search, always prioritize text score, then secondary sort
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

    // Step 4: Pagination
    const skip = (validatedPage - 1) * validatedLimit
    pipeline.push({ $skip: skip })
    pipeline.push({ $limit: validatedLimit })

    console.log('Pipeline', pipeline)

    // Execute aggregation with optimizations to prevent overload
    const aggregationOptions: any = {
      allowDiskUse: false, // Prevent disk usage to keep queries fast
      maxTimeMS: search ? 8000 : 15000, // Shorter timeout for text searches
    }

    // Add hint based on sort field for optimal performance (not for text search)
    if (!search) {
      if (sortField === 'date') {
        aggregationOptions.hint = { date: -1 }
      }
      else if (sortField === 'sourceYear') {
        aggregationOptions.hint = { sourceYear: -1 }
      }
    }

    // Execute aggregation with proper await
    const contracts = await ReleaseModel.aggregate(pipeline, aggregationOptions)

    // For pagination info, we estimate based on current results
    // To avoid performance issues, we don't count total documents
    const hasMore = contracts.length === validatedLimit
    const estimatedTotalPages = hasMore ? validatedPage + 1 : validatedPage

    const executionTime = Date.now() - startTime

    // Calculate filters applied count
    const filtersAppliedCount = Object.keys(matchStage).length + (search ? 1 : 0)

    return {
      success: true,
      data: {
        contracts,
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          hasMore,
          estimatedTotalPages,
          currentCount: contracts.length,
        },
        meta: {
          searchPerformed: !!search,
          filtersApplied: filtersAppliedCount > 0,
          sortBy: sortBy as string,
          sortOrder: sortOrder as string,
          executionTimeMs: executionTime,
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
    // Use indexed fields for optimal performance
    date: 'date',
    year: 'sourceYear',
    status: 'tender.status',
    ocid: 'ocid',
    title: 'tender.title',
    buyer: 'buyer.name',
    supplier: 'awards.suppliers.name', // Use array field for better indexing
    amount: 'amount.primaryAmount', // Use calculated primary amount for better performance
    totalAmount: 'amount.primaryAmount', // Alias for amount
  }
  return sortFields[sortBy] || 'date'
}
