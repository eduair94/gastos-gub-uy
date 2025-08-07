import { Router } from 'express'
import { AnomalyModel, BuyerPatternModel, ExpenseInsightModel, SupplierPatternModel } from '../../../shared/models'

const router = Router()

router.get('/anomalies', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const [anomalies, totalCount] = await Promise.all([
      AnomalyModel.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AnomalyModel.countDocuments()
    ])

    res.json({
      success: true,
      data: anomalies,
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
    res.status(500).json({ success: false, error: 'Failed to fetch anomalies' })
  }
})

router.get('/top-suppliers', async (req, res) => {
  try {
    const { limit = 10, year } = req.query
    
    let matchQuery: any = {}
    if (year) {
      matchQuery.years = Number(year)
    }

    const suppliers = await SupplierPatternModel.find(matchQuery)
      .select('supplierId name totalValue totalContracts')
      .sort({ totalValue: -1 })
      .limit(Number(limit))
      .lean()

    res.json({
      success: true,
      data: suppliers.map(s => ({
        id: s.supplierId,
        name: s.name,
        totalAmount: s.totalValue,
        transactionCount: s.totalContracts
      }))
    })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch top suppliers' })
  }
})

router.get('/top-buyers', async (req, res) => {
  try {
    const { limit = 10, year } = req.query
    
    let matchQuery: any = {}
    if (year) {
      matchQuery.years = Number(year)
    }

    const buyers = await BuyerPatternModel.find(matchQuery)
      .select('buyerId name totalSpending totalContracts')
      .sort({ totalSpending: -1 })
      .limit(Number(limit))
      .lean()

    res.json({
      success: true,
      data: buyers.map(b => ({
        id: b.buyerId,
        name: b.name,
        totalAmount: b.totalSpending,
        transactionCount: b.totalContracts
      }))
    })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch top buyers' })
  }
})

router.get('/expenses', async (req, res) => {
  try {
    const { year, month } = req.query
    
    let matchQuery: any = {}
    if (year) {
      matchQuery.year = Number(year)
    }
    if (month) {
      matchQuery.month = Number(month)
    }

    const insights = await ExpenseInsightModel.find(matchQuery)
      .sort({ year: -1, month: -1 })
      .lean()

    res.json({
      success: true,
      data: insights
    })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch expense insights' })
  }
})

router.get('/category-distribution', async (req, res) => {
  try {
    const { year, entityType } = req.query
    
    // Since we removed categories from the model, we'll return description-based distribution
    let pipeline: any[] = []
    
    if (entityType === 'supplier') {
      pipeline = [
        ...(year ? [{ $match: { years: Number(year) } }] : []),
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.description',
            totalAmount: { $sum: '$items.totalAmount' },
            count: { $sum: '$items.contractCount' }
          }
        },
        {
          $project: {
            _id: 0,
            description: '$_id',
            totalAmount: 1,
            count: 1
          }
        },
        { $sort: { totalAmount: -1 } },
        { $limit: 20 }
      ]
      
      const distribution = await SupplierPatternModel.aggregate(pipeline)
      res.json({ success: true, data: distribution })
    } else if (entityType === 'buyer') {
      pipeline = [
        ...(year ? [{ $match: { years: Number(year) } }] : []),
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.description',
            totalAmount: { $sum: '$items.totalAmount' },
            count: { $sum: '$items.contractCount' }
          }
        },
        {
          $project: {
            _id: 0,
            description: '$_id',
            totalAmount: 1,
            count: 1
          }
        },
        { $sort: { totalAmount: -1 } },
        { $limit: 20 }
      ]
      
      const distribution = await BuyerPatternModel.aggregate(pipeline)
      res.json({ success: true, data: distribution })
    } else {
      // Combined distribution from both suppliers and buyers
      const [supplierDist, buyerDist] = await Promise.all([
        SupplierPatternModel.aggregate([
          ...(year ? [{ $match: { years: Number(year) } }] : []),
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.description',
              totalAmount: { $sum: '$items.totalAmount' },
              count: { $sum: '$items.contractCount' }
            }
          }
        ]),
        BuyerPatternModel.aggregate([
          ...(year ? [{ $match: { years: Number(year) } }] : []),
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.description',
              totalAmount: { $sum: '$items.totalAmount' },
              count: { $sum: '$items.contractCount' }
            }
          }
        ])
      ])
      
      // Combine and aggregate the results
      const combined = [...supplierDist, ...buyerDist]
      const aggregated = combined.reduce((acc, item) => {
        const existing = acc.find((a:any) => a._id === item._id)
        if (existing) {
          existing.totalAmount += item.totalAmount
          existing.count += item.count
        } else {
          acc.push(item)
        }
        return acc
      }, [] as any[])
      
      const distribution = aggregated
        .map((item:any) => ({
          description: item._id,
          totalAmount: item.totalAmount,
          count: item.count
        }))
        .sort((a:any, b:any) => b.totalAmount - a.totalAmount)
        .slice(0, 20)
      
      res.json({ success: true, data: distribution })
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch category distribution' })
  }
})

export default router
