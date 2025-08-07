import { Router } from 'express'
import { SupplierPatternModel } from '../../database/analytics-models'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [suppliers, totalCount] = await Promise.all([
      SupplierPatternModel.find()
        .select('supplierId name totalContracts totalValue avgContractValue')
        .sort({ totalValue: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SupplierPatternModel.countDocuments()
    ])

    res.json({
      success: true,
      data: suppliers,
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
    res.status(500).json({ success: false, error: 'Failed to fetch suppliers' })
  }
})

export default router
