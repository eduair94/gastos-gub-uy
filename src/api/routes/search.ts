import { Router } from 'express'
import { BuyerPatternModel, SupplierPatternModel } from '../../database/analytics-models'

const router = Router()

router.get('/suppliers', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query
    
    if (!query) {
      return res.json({ success: true, data: [] })
    }

    const suppliers = await SupplierPatternModel.find({
      name: { $regex: query, $options: 'i' }
    })
    .select('supplierId name totalValue totalContracts')
    .limit(Number(limit))
    .lean()

    res.json({
      success: true,
      data: suppliers.map(s => ({
        id: s.supplierId,
        name: s.name,
        totalValue: s.totalValue,
        totalContracts: s.totalContracts
      }))
    })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to search suppliers' })
  }
})

router.get('/buyers', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query
    
    if (!query) {
      return res.json({ success: true, data: [] })
    }

    const buyers = await BuyerPatternModel.find({
      name: { $regex: query, $options: 'i' }
    })
    .select('buyerId name totalSpending totalContracts')
    .limit(Number(limit))
    .lean()

    res.json({
      success: true,
      data: buyers.map(b => ({
        id: b.buyerId,
        name: b.name,
        totalSpending: b.totalSpending,
        totalContracts: b.totalContracts
      }))
    })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to search buyers' })
  }
})

router.get('/categories', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query
    
    if (!query) {
      return res.json({ success: true, data: [] })
    }

    // Since we removed categories, we'll search descriptions instead
    const descriptions = await SupplierPatternModel.aggregate([
      { $unwind: '$items' },
      {
        $match: {
          'items.description': { $regex: query, $options: 'i' }
        }
      },
      {
        $group: {
          _id: '$items.description',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: Number(limit) },
      {
        $project: {
          _id: 0,
          description: '$_id',
          count: 1
        }
      }
    ])

    res.json({
      success: true,
      data: descriptions.map(d => d.description)
    })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to search categories' })
  }
})

export default router
