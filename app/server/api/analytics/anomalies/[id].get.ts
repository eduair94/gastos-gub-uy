import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { AnomalyModel, ReleaseModel } from '../../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const anomalyId = getRouterParam(event, 'id')
    if (!anomalyId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Anomaly ID is required',
      })
    }

    // Fetch anomaly with additional release data
    const anomaly = await AnomalyModel.findById(anomalyId).lean()
    if (!anomaly) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Anomaly not found',
      })
    }

    // Fetch related contract data
    const release = await ReleaseModel.findOne({ id: anomaly.releaseId })
      .select('id ocid tender buyer awards')
      .lean()

    // Find related anomalies (same supplier or similar type)
    const relatedAnomalies = await AnomalyModel.find({
      _id: { $ne: anomaly._id },
      $or: [
        { 'metadata.supplierName': anomaly.metadata?.supplierName },
        { type: anomaly.type },
      ],
    })
      .limit(5)
      .sort({ createdAt: -1 })
      .lean()

    return {
      success: true,
      data: {
        anomaly,
        contract: release,
        relatedAnomalies,
      },
    }
  }
  catch (error: any) {
    console.error('Error fetching anomaly details:', error)
    if (error.statusCode) {
      throw error
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch anomaly details',
    })
  }
})
