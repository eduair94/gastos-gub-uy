import { Router } from 'express'
import { ReleaseModel } from '../../../shared/models'
import { Logger } from '../../services/logger-service'

const router = Router()
const logger = new Logger()

// GET /api/contracts
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      dateFrom,
      dateTo,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query

    const skip = (Number(page) - 1) * Number(limit)
    const sortDirection = sortOrder === 'asc' ? 1 : -1

    // Build match query
    const matchQuery: any = {}

    if (search) {
      matchQuery.$or = [
        { 'tender.title': { $regex: search, $options: 'i' } },
        { 'tender.description': { $regex: search, $options: 'i' } },
        { 'buyer.name': { $regex: search, $options: 'i' } }
      ]
    }

    if (dateFrom || dateTo) {
      matchQuery.date = {}
      if (dateFrom) matchQuery.date.$gte = dateFrom
      if (dateTo) matchQuery.date.$lte = dateTo
    }

    // Execute queries
    const [contracts, totalCount] = await Promise.all([
      ReleaseModel
        .find(matchQuery)
        .select('id ocid date buyer tender awards sourceYear sourceFileName')
        .sort({ [sortBy as string]: sortDirection })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ReleaseModel.countDocuments(matchQuery)
    ])

    const totalPages = Math.ceil(totalCount / Number(limit))

    res.json({
      success: true,
      data: contracts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        totalPages,
        hasNext: Number(page) < totalPages,
        hasPrev: Number(page) > 1
      }
    })

  } catch (error) {
    logger.error('Error fetching contracts:', error as Error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contracts'
    })
  }
})

// GET /api/contracts/:id
router.get('/:id', async (req, res): Promise<any> => {
  try {
    const { id } = req.params

    const contract = await ReleaseModel.findOne({
      $or: [
        { id },
        { ocid: id },
        { _id: id }
      ]
    }).lean()

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      })
    }

    res.json({
      success: true,
      data: contract
    })

  } catch (error) {
    logger.error('Error fetching contract:', error as Error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contract'
    })
  }
})

export default router
