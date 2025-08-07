import { Router } from 'express'
import { BuyerPatternModel } from '../../database/analytics-models'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [buyers, totalCount] = await Promise.all([
      BuyerPatternModel.find()
        .select('buyerId name totalContracts totalSpending avgContractValue')
        .sort({ totalSpending: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      BuyerPatternModel.countDocuments()
    ])

    res.json({
      success: true,
      data: buyers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / Number(limit)),
        hasNext: Number(page) < Math.ceil(totalCount / Number(limit)),
        hasPrev: Number(page) > 1
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch buyers' })
  }
})

export default router
